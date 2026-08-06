// AetherAI — VS Code extension entry point.
// Spawns the headless Aether CLI (app/cli.js --json-lines) as a child process
// and hosts a chat Webview that streams status / tool calls / text live.

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as child from 'child_process'
import { AetherPanel } from './panel/AetherPanel'

let currentPanel: AetherPanel | undefined

// Resolve the Aether CLI path: config > repo-local fallback > env var.
export function resolveCliPath(): string | null {
  const cfg = vscode.workspace.getConfiguration('aether').get<string>('cliPath')
  if (cfg) return cfg
  const fallback = path.join(__dirname, '..', '..', 'app', 'cli.js')
  if (fs.existsSync(fallback)) return fallback
  if (process.env.AETHER_CLI_PATH) return process.env.AETHER_CLI_PATH
  return null
}

function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
}

// Build extra context from the active editor selection.
function selectionContext(): string {
  const editor = vscode.window.activeTextEditor
  if (!editor) return ''
  const file = editor.document.uri.fsPath
  const sel = editor.selection
  const text = editor.document.getText(sel)
  if (!text.trim()) return `(open file: ${file})`
  return `Given this code from ${file}:\n\n\`\`\`\n${text}\n\`\`\``
}

// Offer the user a model picker sourced from `node cli --list-models --json`.
async function pickModel(cliPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    child.execFile('node', [cliPath, '--list-models', '--json'], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) { resolve(undefined); return }
      try {
        const rows = JSON.parse(stdout) as { model_name: string; provider_name: string; is_primary: number }[]
        const items = rows.map((r) => ({
          label: r.model_name,
          description: `${r.provider_name}${r.is_primary ? ' (primary)' : ''}`,
        }))
        vscode.window.showQuickPick(items, { placeHolder: 'Select an Aether model' }).then((pick) => {
          resolve(pick ? pick.label : undefined)
        })
      } catch {
        resolve(undefined)
      }
    })
  })
}

function openChat(context?: string): void {
  const cliPath = resolveCliPath()
  if (!cliPath) {
    vscode.window.showErrorMessage('Aether CLI not found. Set the "aether.cliPath" setting or install the Aether repo locally.')
    return
  }
  // API key override for the headless CLI (stored keys may be safeStorage-encrypted).
  const apiKey = vscode.workspace.getConfiguration('aether').get<string>('apiKey') || undefined
  if (currentPanel) {
    currentPanel.reveal(context)
    return
  }
  pickModel(cliPath).then((model) => {
    currentPanel = new AetherPanel(cliPath, workspaceRoot(), model, apiKey, () => { currentPanel = undefined })
    if (context) currentPanel.reveal(context)
  })
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aether.chat', () => openChat()),
    vscode.commands.registerCommand('aether.chatWithSelection', () => openChat(selectionContext())),
    vscode.commands.registerCommand('aether.generateCode', () => {
      const ctx = selectionContext()
        ? `${selectionContext()}\n\nWrite the code as a fenced code block.`
        : 'Write the code as a fenced code block.'
      openChat(ctx)
    }),
  )
}

export function deactivate(): void {
  if (currentPanel) currentPanel.dispose()
}