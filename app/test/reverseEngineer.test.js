// ─── Native Reverse Engineering Tools Tests ───────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

import {
  inspectAppBundle,
  extractAsar,
  auditAgentBundle,
  detectFuses,
  parseContextBridgeExposures,
  searchIpcChannels,
} from '../electron/tools/reverseEngineer'
import { TOOLS, getTool } from '../electron/tools/registry'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-eng-test-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

describe('Reverse Engineering Tools: Registry verification', () => {
  it('registers inspect_app_bundle as safe', () => {
    const tool = getTool('inspect_app_bundle')
    expect(tool).toBeDefined()
    expect(tool.risk).toBe('safe')
    expect(tool.parameters.properties.targetPath).toBeDefined()
    expect(tool.parameters.required).toContain('targetPath')
  })

  it('registers extract_asar as dangerous', () => {
    const tool = getTool('extract_asar')
    expect(tool).toBeDefined()
    expect(tool.risk).toBe('dangerous')
    expect(tool.parameters.properties.asarPath).toBeDefined()
    expect(tool.parameters.properties.outputDir).toBeDefined()
    expect(tool.parameters.required).toContain('asarPath')
    expect(tool.parameters.required).toContain('outputDir')
  })

  it('registers audit_agent_bundle as safe', () => {
    const tool = getTool('audit_agent_bundle')
    expect(tool).toBeDefined()
    expect(tool.risk).toBe('safe')
    expect(tool.parameters.properties.targetPath).toBeDefined()
    expect(tool.parameters.required).toContain('targetPath')
  })
})

describe('inspectAppBundle', () => {
  it('inspects an ASAR bundle with package.json, preload, contextBridge and IPC channels', async () => {
    const src = path.join(tmpDir, 'src')
    fs.mkdirSync(src)
    fs.writeFileSync(
      path.join(src, 'package.json'),
      JSON.stringify({
        name: 'sample-app',
        version: '1.2.3',
        main: 'dist/main.js',
        description: 'Test target for inspection',
      })
    )
    fs.mkdirSync(path.join(src, 'dist'))
    fs.writeFileSync(
      path.join(src, 'dist', 'preload.js'),
      `const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktopAPI', {
  ping: () => ipcRenderer.invoke('app:ping'),
  sendNotification: (n) => ipcRenderer.send('app:notify', n)
})`
    )
    fs.writeFileSync(
      path.join(src, 'dist', 'main.js'),
      `const { app, ipcMain } = require('electron')
ipcMain.handle('app:ping', () => 'pong')
ipcMain.on('app:notify', (e, n) => console.log(n))`
    )

    const asarFile = path.join(tmpDir, 'app.asar')
    await asar.createPackage(src, asarFile)

    const result = await inspectAppBundle({ targetPath: asarFile })

    expect(result.targetType).toBe('asar')
    expect(result.packageJson).toBeDefined()
    expect(result.packageJson.name).toBe('sample-app')
    expect(result.packageJson.version).toBe('1.2.3')
    expect(result.mainScript).toBe('dist/main.js')
    expect(result.preloadScripts).toContain('dist/preload.js')

    expect(result.exposedApis.length).toBeGreaterThanOrEqual(1)
    const api = result.exposedApis[0]
    expect(api.namespace).toBe('desktopAPI')
    expect(api.methods).toContain('ping')
    expect(api.methods).toContain('sendNotification')

    const channels = result.ipcChannels.map(c => c.channel)
    expect(channels).toContain('app:ping')
    expect(channels).toContain('app:notify')
    expect(result.formattedSummary).toContain('sample-app')
  })

  it('inspects an application directory', async () => {
    const appDir = path.join(tmpDir, 'app-dir')
    fs.mkdirSync(appDir)
    fs.writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: 'dir-app', version: '0.1.0', main: 'main.js' })
    )
    fs.writeFileSync(
      path.join(appDir, 'preload.js'),
      `const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('api', { getVersion: () => '0.1.0' })`
    )

    const res = await inspectAppBundle({ targetPath: appDir })
    expect(res.targetType).toBe('directory')
    expect(res.packageJson.name).toBe('dir-app')
    expect(res.preloadScripts).toContain('preload.js')
  })
})

describe('extractAsar', () => {
  it('safely unpacks an ASAR file and returns extracted file list', async () => {
    const src = path.join(tmpDir, 'src')
    const out = path.join(tmpDir, 'out')
    fs.mkdirSync(src)
    fs.writeFileSync(path.join(src, 'file1.txt'), 'hello world')
    fs.writeFileSync(path.join(src, 'file2.json'), JSON.stringify({ ok: true }))

    const asarFile = path.join(tmpDir, 'bundle.asar')
    await asar.createPackage(src, asarFile)

    const res = await extractAsar({ asarPath: asarFile, outputDir: out })
    expect(res.success).toBe(true)
    expect(res.fileCount).toBe(2)
    expect(res.files).toContain('file1.txt')
    expect(res.files).toContain('file2.json')

    expect(fs.readFileSync(path.join(out, 'file1.txt'), 'utf8')).toBe('hello world')
    expect(JSON.parse(fs.readFileSync(path.join(out, 'file2.json'), 'utf8'))).toEqual({ ok: true })
  })

  it('throws an error for non-existent archive', async () => {
    await expect(
      extractAsar({ asarPath: path.join(tmpDir, 'missing.asar'), outputDir: tmpDir })
    ).rejects.toThrow('ASAR archive not found')
  })

  it('rejects path traversal in ASAR archive and prevents writing outside outputDir', async () => {
    const headerObj = {
      files: {
        '../evil.txt': { size: 12, offset: '0' },
      },
    }
    const jsonStr = JSON.stringify(headerObj)
    const jsonLen = Buffer.byteLength(jsonStr, 'utf8')
    const headerBuf = Buffer.alloc(8 + jsonLen)
    headerBuf.writeUInt32LE(jsonLen + 4, 0)
    headerBuf.writeUInt32LE(jsonLen, 4)
    headerBuf.write(jsonStr, 8, jsonLen, 'utf8')

    const sizeBuf = Buffer.alloc(8)
    sizeBuf.writeUInt32LE(4, 0)
    sizeBuf.writeUInt32LE(headerBuf.length, 4)

    const content = Buffer.from('malicious!!!')
    const totalBuf = Buffer.concat([sizeBuf, headerBuf, content])

    const evilAsar = path.join(tmpDir, 'evil.asar')
    fs.writeFileSync(evilAsar, totalBuf)

    const out = path.join(tmpDir, 'out')
    fs.mkdirSync(out)

    await expect(
      extractAsar({ asarPath: evilAsar, outputDir: out })
    ).rejects.toThrow(/Security Violation/)

    const evilPath = path.join(tmpDir, 'evil.txt')
    expect(fs.existsSync(evilPath)).toBe(false)
  })
})

describe('auditAgentBundle', () => {
  it('detects embedded system prompts, tool schemas, endpoints, and hooks', async () => {
    const code = `
// System Prompt
const SYSTEM_PROMPT = \`You are an advanced agentic coding assistant designed to solve user queries.
Always adhere to user rules and instructions carefully.\`

const tools = [
  {
    type: 'function',
    function: {
      name: 'execute_shell',
      parameters: { type: 'object', properties: { cmd: { type: 'string' } } }
    },
    risk: 'dangerous'
  }
]

async function callOpenAI(messages) {
  const url = 'https://api.openai.com/v1/chat/completions'
  // stream response
  return fetch(url, { headers: { 'Accept': 'text/event-stream' } })
}

function beforeToolCall(tool, args) {
  trustEngine.checkPermission(tool)
}
`
    const testFile = path.join(tmpDir, 'agentModule.js')
    fs.writeFileSync(testFile, code)

    const audit = await auditAgentBundle({ targetPath: testFile })
    expect(audit.filesScanned).toBe(1)

    // Prompts
    expect(audit.counts.prompts).toBeGreaterThanOrEqual(1)
    expect(audit.matches.prompts[0].snippet).toContain('You are an advanced agentic coding assistant')

    // Tools
    expect(audit.counts.tools).toBeGreaterThanOrEqual(1)
    const toolKinds = audit.matches.tools.map(t => t.kind)
    expect(toolKinds).toContain('tools_array')
    expect(toolKinds).toContain('tool_risk_rating')

    // Endpoints
    expect(audit.counts.endpoints).toBeGreaterThanOrEqual(1)
    const providers = audit.matches.endpoints.map(e => e.provider)
    expect(providers).toContain('OpenAI')
    expect(providers).toContain('Streaming SSE')

    // Hooks
    expect(audit.counts.hooks).toBeGreaterThanOrEqual(1)
    const hookSymbols = audit.matches.hooks.map(h => h.symbol)
    expect(hookSymbols).toContain('beforeToolCall')
    expect(hookSymbols).toContain('trustEngine')
  })
})
