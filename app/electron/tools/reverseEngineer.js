// Native Reverse Engineering Tools for Aether
// Analyzes Electron bundles, ASAR archives, executables, and agent configurations.

const fs = require('fs')
const path = require('path')

let asarLib = null
try {
  asarLib = require('@electron/asar')
} catch {
  asarLib = null
}

const FUSE_V1_NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
]

// ── Pure Node ASAR Parser & Fallback Extractor ───────────────────────────────

function readAsarHeader(asarPath) {
  if (asarLib && typeof asarLib.getRawHeader === 'function') {
    try {
      const raw = asarLib.getRawHeader(asarPath)
      const header = JSON.parse(raw.headerString)
      return {
        header,
        headerSize: raw.headerSize,
        baseOffset: 8 + raw.headerSize,
      }
    } catch {
      // Fall through to manual binary parsing
    }
  }

  const fd = fs.openSync(asarPath, 'r')
  try {
    const sizeBuf = Buffer.alloc(8)
    if (fs.readSync(fd, sizeBuf, 0, 8, 0) !== 8) {
      throw new Error('Unable to read ASAR header size')
    }
    const picklePayloadSize = sizeBuf.readUInt32LE(0)
    const headerSize = sizeBuf.readUInt32LE(4)
    if (picklePayloadSize !== 4 || headerSize <= 0) {
      throw new Error('Invalid ASAR archive: invalid pickle header')
    }
    const headerBuf = Buffer.alloc(headerSize)
    if (fs.readSync(fd, headerBuf, 0, headerSize, 8) !== headerSize) {
      throw new Error('Unable to read ASAR header buffer')
    }
    const jsonLen = headerBuf.readUInt32LE(4)
    const jsonStr = headerBuf.subarray(8, 8 + jsonLen).toString('utf8')
    const header = JSON.parse(jsonStr)
    return {
      header,
      headerSize,
      baseOffset: 8 + headerSize,
    }
  } finally {
    fs.closeSync(fd)
  }
}

function flattenAsarFiles(tree, prefix = '') {
  let files = []
  if (!tree || !tree.files) return files
  for (const [name, entry] of Object.entries(tree.files)) {
    const relPath = prefix ? `${prefix}/${name}` : name
    if (entry.files) {
      files = files.concat(flattenAsarFiles(entry, relPath))
    } else {
      files.push({
        path: relPath,
        size: entry.size || 0,
        offset: entry.offset ? String(entry.offset) : '0',
        unpacked: !!entry.unpacked,
        executable: !!entry.executable,
      })
    }
  }
  return files
}

function readAsarFileContent(asarPath, asarInfo, filePath) {
  const cleanPath = filePath.replace(/\\/g, '/').replace(/^\//, '')
  if (!asarInfo.filesMap) {
    const flat = flattenAsarFiles(asarInfo.header)
    asarInfo.filesMap = new Map(flat.map(f => [f.path, f]))
  }
  const entry = asarInfo.filesMap.get(cleanPath)
  if (!entry) return null
  if (entry.unpacked) {
    const unpackedDir = path.resolve(`${asarPath}.unpacked`)
    const unpackedPath = path.resolve(unpackedDir, cleanPath)
    const rel = path.relative(unpackedDir, unpackedPath)
    if (rel.startsWith('..') || path.isAbsolute(rel) || !rel) {
      return null
    }
    if (fs.existsSync(unpackedPath)) {
      return fs.readFileSync(unpackedPath)
    }
    return null
  }
  const fd = fs.openSync(asarPath, 'r')
  try {
    const buf = Buffer.alloc(entry.size)
    const start = BigInt(asarInfo.baseOffset) + BigInt(entry.offset)
    fs.readSync(fd, buf, 0, entry.size, Number(start))
    return buf
  } finally {
    fs.closeSync(fd)
  }
}

// ── Electron Fuses Detector ──────────────────────────────────────────────────

function detectFuses(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size === 0) return null

    const fd = fs.openSync(filePath, 'r')
    try {
      const CHUNK_SIZE = 4 * 1024 * 1024
      const OVERLAP = 64
      const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP)
      const sentinels = [
        Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),
        Buffer.from('dL7NfxNSEpTS4tKaMQbu5avD'),
      ]

      let offset = 0
      let found = null
      while (offset < stat.size) {
        const bytesToRead = Math.min(CHUNK_SIZE + OVERLAP, stat.size - offset)
        const bytesRead = fs.readSync(fd, buf, 0, bytesToRead, offset)
        if (bytesRead <= 0) break

        for (const sentinel of sentinels) {
          const idx = buf.subarray(0, bytesRead).indexOf(sentinel)
          if (idx !== -1 && idx + sentinel.length + 2 <= bytesRead) {
            const version = buf[idx + sentinel.length]
            const length = buf[idx + sentinel.length + 1]
            const fuses = {}
            for (let i = 0; i < length; i++) {
              const fuseIdx = idx + sentinel.length + 2 + i
              if (fuseIdx < bytesRead) {
                const val = buf[fuseIdx]
                const state = val === 48 ? 'disabled' : val === 49 ? 'enabled' : val === 114 ? 'removed' : val === 144 ? 'inherit' : String(val)
                const name = FUSE_V1_NAMES[i] || `Fuse_${i}`
                fuses[name] = state
              }
            }
            found = {
              detected: true,
              binaryPath: filePath,
              sentinel: sentinel.toString(),
              version,
              fusesCount: length,
              fuses,
            }
            break
          }
        }
        if (found) break
        offset += CHUNK_SIZE
      }
      return found || { detected: false, binaryPath: filePath }
    } finally {
      try { fs.closeSync(fd) } catch {}
    }
  } catch (err) {
    return { detected: false, binaryPath: filePath, error: err.message }
  }
}

// ── Preload & IPC Parsers ───────────────────────────────────────────────────

function parseContextBridgeExposures(sourceText, filePath = '') {
  const results = []
  const regex = /contextBridge\s*\.\s*exposeInMainWorld\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(\{[\s\S]*?\}|[\w$]+)\s*\)/g
  let match
  while ((match = regex.exec(sourceText)) !== null) {
    const namespace = match[2]
    const rawBody = match[3]
    const line = sourceText.slice(0, match.index).split('\n').length
    const methods = []

    if (rawBody.startsWith('{')) {
      let depth = 0
      let inString = null
      let currentKey = ''
      let gatheringKey = true
      const trimmed = rawBody.trim()

      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i]
        const prev = i > 0 ? trimmed[i - 1] : ''

        if (inString) {
          if (ch === inString && prev !== '\\') inString = null
          continue
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch
          continue
        }

        if (ch === '{') {
          depth++
          if (depth === 1) { currentKey = ''; gatheringKey = true }
          continue
        }
        if (ch === '}') {
          depth--
          continue
        }
        if (ch === '(' || ch === '[') {
          depth++
          continue
        }
        if (ch === ')' || ch === ']') {
          depth--
          continue
        }

        if (depth === 1) {
          if (ch === ':' || ch === '(') {
            const candidate = currentKey.trim().replace(/^['"`]|['"`]$/g, '')
            if (candidate && /^[a-zA-Z0-9_$-]+$/.test(candidate) && !['async', 'get', 'set'].includes(candidate)) {
              if (!methods.includes(candidate)) methods.push(candidate)
            }
            currentKey = ''
            gatheringKey = false
          } else if (ch === ',') {
            currentKey = ''
            gatheringKey = true
          } else if (gatheringKey) {
            currentKey += ch
          }
        } else {
          gatheringKey = false
        }
      }
    } else {
      methods.push(`(reference: ${rawBody})`)
    }

    results.push({
      namespace,
      methods,
      file: filePath,
      line,
      snippet: match[0].slice(0, 300),
    })
  }
  return results
}

function searchIpcChannels(sourceText, filePath = '') {
  const channels = []
  const ipcRe = /(?:(ipcRenderer|ipcMain|webContents)\s*\.\s*(handle|handleOnce|on|once|send|sendSync|invoke|postMessage))\s*\(\s*(['"`]([^'"`\r\n]+)['"`]|[^,\r\n\)]+)/g
  const lines = sourceText.split('\n')
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineText = lines[lineNum]
    let m
    while ((m = ipcRe.exec(lineText)) !== null) {
      const caller = m[1]
      const method = m[2]
      const rawArg = m[3].trim()
      const channel = m[4] || `(expr: ${rawArg.slice(0, 40)})`
      channels.push({
        channel,
        type: `${caller}.${method}`,
        file: filePath,
        line: lineNum + 1,
        snippet: lineText.trim().slice(0, 160),
      })
    }
  }
  return channels
}

function findBinariesInDir(dirPath, maxDepth = 2) {
  const binaries = []
  function walk(current, depth) {
    if (depth > maxDepth) return
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const ent of entries) {
        const full = path.join(current, ent.name)
        if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== '.git') {
          walk(full, depth + 1)
        } else if (ent.isFile()) {
          const lower = ent.name.toLowerCase()
          if (lower.endsWith('.exe') || lower === 'electron' || ent.name.includes('Framework')) {
            binaries.push(full)
          }
        }
      }
    } catch {}
  }
  walk(dirPath, 0)
  return binaries
}

// ── 1. inspectAppBundle ─────────────────────────────────────────────────────

async function inspectAppBundle({ targetPath, cwd }) {
  if (!targetPath) throw new Error('targetPath is required')
  const resolved = path.resolve(cwd || process.cwd(), targetPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${resolved}`)
  }

  const stat = fs.statSync(resolved)
  let targetType = 'unknown'

  if (stat.isFile()) {
    const lower = resolved.toLowerCase()
    if (lower.endsWith('.asar')) {
      targetType = 'asar'
    } else {
      // Check if ASAR magic
      try {
        const fd = fs.openSync(resolved, 'r')
        const buf = Buffer.alloc(8)
        fs.readSync(fd, buf, 0, 8, 0)
        fs.closeSync(fd)
        if (buf.readUInt32LE(0) === 4) {
          targetType = 'asar'
        } else {
          targetType = 'binary'
        }
      } catch {
        targetType = 'binary'
      }
    }
  } else if (stat.isDirectory()) {
    targetType = 'directory'
  }

  let packageJson = null
  let mainScript = null
  const preloadScripts = []
  const exposedApis = []
  const ipcChannels = []
  let fuses = null
  let structureSummary = null

  if (targetType === 'asar') {
    const asarInfo = readAsarHeader(resolved)
    const flatFiles = flattenAsarFiles(asarInfo.header)
    const totalSize = flatFiles.reduce((acc, f) => acc + f.size, 0)
    structureSummary = {
      fileCount: flatFiles.length,
      totalSize,
      topLevel: Object.keys(asarInfo.header.files || {}),
      sampleFiles: flatFiles.slice(0, 30).map(f => f.path),
    }

    // Read package.json
    const pkgBuf = readAsarFileContent(resolved, asarInfo, 'package.json')
    if (pkgBuf) {
      try {
        packageJson = JSON.parse(pkgBuf.toString('utf8'))
        mainScript = packageJson.main || 'index.js'
      } catch {}
    }

    // Find preload scripts
    for (const file of flatFiles) {
      const lower = file.path.toLowerCase()
      if (lower.includes('preload') && (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs'))) {
        preloadScripts.push(file.path)
      }
    }

    // Parse preload scripts
    for (const preloadPath of preloadScripts) {
      const content = readAsarFileContent(resolved, asarInfo, preloadPath)
      if (content) {
        const exposures = parseContextBridgeExposures(content.toString('utf8'), preloadPath)
        exposedApis.push(...exposures)
      }
    }

    // Search IPC channels across script files
    const scriptFiles = flatFiles.filter(f => /\.(js|cjs|mjs|ts|html)$/i.test(f.path))
    for (const sFile of scriptFiles.slice(0, 200)) {
      const content = readAsarFileContent(resolved, asarInfo, sFile.path)
      if (content) {
        const found = searchIpcChannels(content.toString('utf8'), sFile.path)
        ipcChannels.push(...found)
      }
    }

    // Look for adjacent binary to check fuses
    const dir = path.dirname(resolved)
    const candidateBinaries = findBinariesInDir(path.resolve(dir, '..'), 2)
    if (candidateBinaries.length > 0) {
      fuses = detectFuses(candidateBinaries[0])
    }
  } else if (targetType === 'directory') {
    // Check for package.json
    const candidatePkgs = [
      path.join(resolved, 'package.json'),
      path.join(resolved, 'app', 'package.json'),
      path.join(resolved, 'resources', 'app', 'package.json'),
    ]
    for (const cp of candidatePkgs) {
      if (fs.existsSync(cp)) {
        try {
          packageJson = JSON.parse(fs.readFileSync(cp, 'utf8'))
          mainScript = packageJson.main || 'index.js'
          break
        } catch {}
      }
    }

    // Check for embedded asar
    const asarCandidates = [
      path.join(resolved, 'resources', 'app.asar'),
      path.join(resolved, 'app.asar'),
    ]
    let innerAsarPath = null
    for (const ac of asarCandidates) {
      if (fs.existsSync(ac)) {
        innerAsarPath = ac
        break
      }
    }

    // Check for binary & fuses
    const binaries = findBinariesInDir(resolved, 2)
    if (binaries.length > 0) {
      fuses = detectFuses(binaries[0])
    }

    // Walk directory structure
    const allFiles = []
    function walkDir(curDir, depth = 0) {
      if (depth > 5) return
      try {
        const entries = fs.readdirSync(curDir, { withFileTypes: true })
        for (const ent of entries) {
          if (ent.name === 'node_modules' || ent.name === '.git') continue
          const full = path.join(curDir, ent.name)
          const rel = path.relative(resolved, full).replace(/\\/g, '/')
          if (ent.isDirectory()) {
            walkDir(full, depth + 1)
          } else if (ent.isFile()) {
            try {
              const fstat = fs.statSync(full)
              allFiles.push({ path: rel, size: fstat.size, full })
            } catch {}
          }
        }
      } catch {}
    }
    walkDir(resolved)

    const totalSize = allFiles.reduce((acc, f) => acc + f.size, 0)
    structureSummary = {
      fileCount: allFiles.length,
      totalSize,
      innerAsar: innerAsarPath ? path.relative(resolved, innerAsarPath) : null,
      topLevel: fs.readdirSync(resolved),
      sampleFiles: allFiles.slice(0, 30).map(f => f.path),
    }

    // Find preload scripts
    for (const file of allFiles) {
      const lower = file.path.toLowerCase()
      if (lower.includes('preload') && (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.ts'))) {
        preloadScripts.push(file.path)
      }
    }

    // Parse preload scripts
    for (const preloadPath of preloadScripts) {
      const full = path.join(resolved, preloadPath)
      try {
        const text = fs.readFileSync(full, 'utf8')
        exposedApis.push(...parseContextBridgeExposures(text, preloadPath))
      } catch {}
    }

    // Search IPC channels across scripts
    const scriptFiles = allFiles.filter(f => /\.(js|cjs|mjs|ts|html)$/i.test(f.path))
    for (const sFile of scriptFiles.slice(0, 200)) {
      try {
        const text = fs.readFileSync(sFile.full, 'utf8')
        ipcChannels.push(...searchIpcChannels(text, sFile.path))
      } catch {}
    }
  } else if (targetType === 'binary') {
    fuses = detectFuses(resolved)
    structureSummary = {
      fileCount: 1,
      totalSize: stat.size,
      binaryPath: resolved,
    }
    // Check if adjacent asar exists
    const dir = path.dirname(resolved)
    const asarCandidates = [
      path.join(dir, 'resources', 'app.asar'),
      path.join(dir, 'app.asar'),
    ]
    for (const ac of asarCandidates) {
      if (fs.existsSync(ac)) {
        structureSummary.adjacentAsar = ac
        break
      }
    }
  }

  // Deduplicate and group IPC channels
  const uniqueChannelsMap = new Map()
  for (const ch of ipcChannels) {
    if (!uniqueChannelsMap.has(ch.channel)) {
      uniqueChannelsMap.set(ch.channel, { channel: ch.channel, types: new Set(), occurrences: [] })
    }
    const entry = uniqueChannelsMap.get(ch.channel)
    entry.types.add(ch.type)
    entry.occurrences.push({ type: ch.type, file: ch.file, line: ch.line })
  }

  const groupedChannels = Array.from(uniqueChannelsMap.values()).map(e => ({
    channel: e.channel,
    types: Array.from(e.types),
    count: e.occurrences.length,
    locations: e.occurrences.slice(0, 5),
  }))

  const lines = [
    `# App Bundle Inspection: ${path.basename(resolved)}`,
    `- **Target Path**: \`${resolved}\``,
    `- **Type**: ${targetType.toUpperCase()}`,
  ]

  if (packageJson) {
    lines.push(`- **App Name**: ${packageJson.name || 'unnamed'} (v${packageJson.version || '0.0.0'})`)
    lines.push(`- **Main Script**: \`${mainScript || 'unknown'}\``)
    if (packageJson.description) lines.push(`- **Description**: ${packageJson.description}`)
  }

  if (structureSummary) {
    const sizeMb = (structureSummary.totalSize / (1024 * 1024)).toFixed(2)
    lines.push(`- **Structure**: ${structureSummary.fileCount} files (${sizeMb} MB)`)
    if (structureSummary.innerAsar) lines.push(`- **Packaged Archive**: \`${structureSummary.innerAsar}\``)
  }

  if (fuses && fuses.detected) {
    lines.push(`\n## Electron Fuses (Binary: ${path.basename(fuses.binaryPath)})`)
    for (const [fuseName, state] of Object.entries(fuses.fuses || {})) {
      lines.push(`  - **${fuseName}**: ${state}`)
    }
  } else if (fuses && !fuses.detected) {
    lines.push(`\n## Electron Fuses`)
    lines.push(`  - No Electron fuses sentinel detected in scanned binary.`)
  }

  if (preloadScripts.length > 0) {
    lines.push(`\n## Preload Scripts (${preloadScripts.length})`)
    for (const ps of preloadScripts) lines.push(`  - \`${ps}\``)
  }

  if (exposedApis.length > 0) {
    lines.push(`\n## contextBridge Exposed APIs (${exposedApis.length})`)
    for (const api of exposedApis) {
      lines.push(`  - **Namespace**: \`${api.namespace}\` (${api.file}:${api.line})`)
      lines.push(`    Methods/Properties: ${api.methods.map(m => `\`${m}\``).join(', ') || '(none)'}`)
    }
  }

  lines.push(`\n## IPC Channels (${groupedChannels.length} unique channels, ${ipcChannels.length} total calls)`)
  if (groupedChannels.length === 0) {
    lines.push(`  *(none detected)*`)
  } else {
    for (const ch of groupedChannels.slice(0, 40)) {
      const typesStr = ch.types.join(', ')
      lines.push(`  - **\`${ch.channel}\`** [${typesStr}] (${ch.count} refs)`)
      for (const loc of ch.locations.slice(0, 2)) {
        lines.push(`    - \`${loc.file}:${loc.line}\` (${loc.type})`)
      }
    }
    if (groupedChannels.length > 40) {
      lines.push(`  *...and ${groupedChannels.length - 40} more channels.*`)
    }
  }

  const formattedSummary = lines.join('\n')

  return {
    targetType,
    targetPath: resolved,
    packageJson,
    mainScript,
    preloadScripts,
    exposedApis,
    fuses,
    ipcChannels: groupedChannels,
    totalIpcCalls: ipcChannels.length,
    structure: structureSummary,
    formattedSummary,
    toString: () => formattedSummary,
  }
}

// ── 2. extractAsar ──────────────────────────────────────────────────────────

async function extractAsar({ asarPath, outputDir, cwd, checkDestination }) {
  if (!asarPath) throw new Error('asarPath is required')
  if (!outputDir) throw new Error('outputDir is required')

  const baseDir = cwd || process.cwd()
  const resolvedAsar = path.resolve(baseDir, asarPath)
  const resolvedOut = path.resolve(baseDir, outputDir)

  if (!fs.existsSync(resolvedAsar)) {
    throw new Error(`ASAR archive not found: ${resolvedAsar}`)
  }
  const stat = fs.statSync(resolvedAsar)
  if (!stat.isFile()) {
    throw new Error(`Target is not a file: ${resolvedAsar}`)
  }

  // Ensure output directory exists
  if (!fs.existsSync(resolvedOut)) {
    fs.mkdirSync(resolvedOut, { recursive: true })
  }

  // Pre-validate ASAR header and verify every file path to prevent zip slip / path traversal
  const asarInfo = readAsarHeader(resolvedAsar)
  const flatFiles = flattenAsarFiles(asarInfo.header)
  for (const file of flatFiles) {
    const targetDest = path.resolve(resolvedOut, file.path)
    const rel = path.relative(resolvedOut, targetDest)
    if (!targetDest.startsWith(resolvedOut + path.sep) || rel.startsWith('..') || path.isAbsolute(rel) || !rel) {
      throw new Error(`Security Violation: Path traversal detected in ASAR archive entry "${file.path}"`)
    }

    // Check write rules against each destination file (e.g. .git/config or outside allowed workspace)
    if (checkDestination && typeof checkDestination === 'function') {
      const g = checkDestination(targetDest)
      if (g && !g.ok) {
        throw new Error(`Security Violation: ${g.reason || 'Write prohibited to destination'} (${file.path})`)
      }
    }

    // Check every existing component from root down to targetDest for symbolic links to prevent link-redirection escapes
    const parsed = path.parse(targetDest)
    let cur = parsed.root
    const parts = targetDest.slice(cur.length).split(path.sep).filter(Boolean)
    for (const part of parts) {
      cur = path.join(cur, part)
      try {
        const lstat = fs.lstatSync(cur)
        if (lstat.isSymbolicLink()) {
          throw new Error(`Security Violation: Component in extraction path is a symbolic link: ${cur}`)
        }
      } catch (err) {
        if (err.message && err.message.startsWith('Security Violation:')) throw err
        // Component does not exist yet, which is expected for new subdirectories/files
        break
      }
    }
  }

  let extractedFiles = []
  let usedMethod = 'node-fallback'

  if (asarLib && typeof asarLib.extractAll === 'function') {
    try {
      asarLib.extractAll(resolvedAsar, resolvedOut)
      usedMethod = '@electron/asar'
      extractedFiles = flatFiles.map(f => f.path)
    } catch {
      usedMethod = 'node-fallback'
    }
  }

  if (usedMethod === 'node-fallback') {
    const fd = fs.openSync(resolvedAsar, 'r')
    try {
      for (const file of flatFiles) {
        const destPath = path.resolve(resolvedOut, file.path)
        const parent = path.dirname(destPath)
        if (!fs.existsSync(parent)) {
          fs.mkdirSync(parent, { recursive: true })
        }

        if (file.unpacked) {
          const unpackedDir = path.resolve(`${resolvedAsar}.unpacked`)
          const unpackedSource = path.resolve(unpackedDir, file.path)
          const relSource = path.relative(unpackedDir, unpackedSource)
          if (!unpackedSource.startsWith(unpackedDir + path.sep) || relSource.startsWith('..') || path.isAbsolute(relSource) || !relSource) {
            throw new Error(`Security Violation: Unpacked source traversal detected in "${file.path}"`)
          }
          if (fs.existsSync(unpackedSource)) {
            fs.copyFileSync(unpackedSource, destPath)
          }
        } else {
          const buf = Buffer.alloc(file.size)
          const start = BigInt(asarInfo.baseOffset) + BigInt(file.offset)
          fs.readSync(fd, buf, 0, file.size, Number(start))
          fs.writeFileSync(destPath, buf, { mode: file.executable ? 0o755 : 0o644 })
        }
        extractedFiles.push(file.path)
      }
    } finally {
      fs.closeSync(fd)
    }
  }

  const totalSize = flatFiles.reduce((acc, f) => acc + f.size, 0)
  const sizeMb = (totalSize / (1024 * 1024)).toFixed(2)

  const summary = [
    `# ASAR Extraction Complete`,
    `- **Archive**: \`${resolvedAsar}\``,
    `- **Destination**: \`${resolvedOut}\``,
    `- **Extraction Engine**: ${usedMethod}`,
    `- **Files Extracted**: ${extractedFiles.length} (${sizeMb} MB)`,
    `\n### Sample Extracted Files:`,
    ...extractedFiles.slice(0, 25).map(f => `  - \`${f}\``),
  ]
  if (extractedFiles.length > 25) {
    summary.push(`  *...and ${extractedFiles.length - 25} more files.*`)
  }

  const formattedSummary = summary.join('\n')

  return {
    success: true,
    asarPath: resolvedAsar,
    outputDir: resolvedOut,
    method: usedMethod,
    fileCount: extractedFiles.length,
    totalSizeBytes: totalSize,
    files: extractedFiles,
    formattedSummary,
    toString: () => formattedSummary,
  }
}

// ── 3. auditAgentBundle ─────────────────────────────────────────────────────

async function auditAgentBundle({ targetPath, maxMatches = 50, cwd }) {
  if (!targetPath) throw new Error('targetPath is required')
  const resolved = path.resolve(cwd || process.cwd(), targetPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Target path does not exist: ${resolved}`)
  }

  const limit = Math.max(1, Number(maxMatches) || 50)
  const stat = fs.statSync(resolved)

  // Collect files to scan: array of { relPath, getText: () => string }
  const filesToScan = []

  if (stat.isFile()) {
    if (resolved.toLowerCase().endsWith('.asar')) {
      const asarInfo = readAsarHeader(resolved)
      const flat = flattenAsarFiles(asarInfo.header)
      asarInfo.filesMap = new Map(flat.map(f => [f.path, f]))
      for (const f of flat) {
        if (/\.(js|cjs|mjs|ts|tsx|jsx|json)$/i.test(f.path)) {
          filesToScan.push({
            relPath: f.path,
            getText: () => {
              const buf = readAsarFileContent(resolved, asarInfo, f.path)
              return buf ? buf.toString('utf8') : ''
            },
          })
        }
      }
    } else {
      filesToScan.push({
        relPath: path.basename(resolved),
        getText: () => fs.readFileSync(resolved, 'utf8'),
      })
    }
  } else if (stat.isDirectory()) {
    function walk(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const ent of entries) {
          if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue
          const full = path.join(dir, ent.name)
          if (ent.isDirectory()) {
            walk(full)
          } else if (ent.isFile() && /\.(js|cjs|mjs|ts|tsx|jsx|json)$/i.test(ent.name)) {
            filesToScan.push({
              relPath: path.relative(resolved, full).replace(/\\/g, '/'),
              getText: () => fs.readFileSync(full, 'utf8'),
            })
          }
        }
      } catch {}
    }
    walk(resolved)
  }

  const prompts = []
  const tools = []
  const endpoints = []
  const hooks = []

  const PROMPT_INDICATORS = [
    /role\s*[:=]\s*['"`](?:system|developer)['"`]/i,
    /content\s*[:=]\s*[`'"][\s\S]{0,100}?(?:You are|# Instructions|# System Prompt|Act as an?|You must always)/i,
    /(?:system_prompt|systemPrompt|systemMessage|developer_prompt)\s*[:=]/i,
  ]

  const TOOL_PATTERNS = [
    { name: 'tools_array', re: /tools\s*[:=]\s*\[/g },
    { name: 'function_tool_schema', re: /type\s*:\s*['"`]function['"`]\s*,\s*function\s*:\s*\{\s*name\s*:\s*['"`]([^'"`]+)['"`]/g },
    { name: 'tool_risk_rating', re: /risk\s*:\s*['"`](safe|dangerous|ask|confirm|high|low)['"`]/g },
    { name: 'json_schema_parameters', re: /(?:parameters|input_schema)\s*:\s*\{\s*type\s*:\s*['"`]object['"`]/g },
    { name: 'mcp_tool_route', re: /(?:tools\/list|tools\/call|list_tools|call_tool)/g },
  ]

  const ENDPOINT_PATTERNS = [
    { provider: 'OpenAI', re: /(?:https:\/\/api\.openai\.com|\/v1\/chat\/completions|\/v1\/completions|\/v1\/embeddings|chat\.completions\.create)/g },
    { provider: 'Anthropic', re: /(?:https:\/\/api\.anthropic\.com|\/v1\/messages|anthropic-version|x-api-key)/g },
    { provider: 'Gemini', re: /(?:generativelanguage\.googleapis\.com|\/v1beta\/models|\/v1alpha\/models|generateContent|streamGenerateContent|@google\/genai|google-genai)/g },
    { provider: 'Ollama/Local', re: /(?:localhost:11434|\/api\/chat|\/api\/generate|127\.0\.0\.1:11434)/g },
    { provider: 'OpenRouter/DeepSeek', re: /(?:openrouter\.ai\/api|api\.deepseek\.com)/g },
    { provider: 'Streaming SSE', re: /(?:text\/event-stream|data:\s*\[DONE\]|createParser\(|EventSource|parseSSE|SSEParser)/g },
  ]

  const HOOK_PATTERNS = [
    { hook: 'Lifecycle', re: /\b(beforeToolCall|afterToolCall|onToolStart|onToolEnd|toolResultMiddleware|transformToolCall|onBeforeMessage|onAfterMessage|onAgentStart|onAgentFinish)\b/g },
    { hook: 'Trust/Security', re: /\b(trustEngine|permissionGate|guardWorkspaceRead|checkWritePath|checkCommand|confirmDangerous|isInsideWorkspace|approvalRequired|sandboxExecutor|execPermission)\b/g },
  ]

  for (const item of filesToScan) {
    let text = ''
    try {
      text = item.getText()
    } catch {
      continue
    }
    if (!text) continue

    const lines = text.split('\n')

    // a) Embedded System Prompts
    if (prompts.length < limit) {
      // 1. Template literal blocks with instructions / prompt language
      const templateLiteralRe = /`([^`]{120,})`/g
      let tm
      while ((tm = templateLiteralRe.exec(text)) !== null && prompts.length < limit) {
        const body = tm[1]
        if (/\b(you are (?:an?|the)|assistant|instructions?|guidelines?|rules?:|user prompt|task description)\b/i.test(body) ||
            /# (?:System|Instructions|Prompt|Rules|Persona)/i.test(body)) {
          const lineNum = text.slice(0, tm.index).split('\n').length
          const snippet = body.trim().replace(/\s+/g, ' ').slice(0, 200)
          prompts.push({
            type: 'template_literal_prompt',
            file: item.relPath,
            line: lineNum,
            length: body.length,
            snippet: snippet + (body.length > 200 ? '...' : ''),
          })
        }
      }

      // 2. Line-by-line prompt signals
      for (let i = 0; i < lines.length && prompts.length < limit; i++) {
        const line = lines[i]
        for (const pRe of PROMPT_INDICATORS) {
          if (pRe.test(line)) {
            prompts.push({
              type: 'system_prompt_declaration',
              file: item.relPath,
              line: i + 1,
              snippet: line.trim().slice(0, 200),
            })
            break
          }
        }
      }
    }

    // b) Tool definitions & schemas
    if (tools.length < limit) {
      for (let i = 0; i < lines.length && tools.length < limit; i++) {
        const line = lines[i]
        for (const tp of TOOL_PATTERNS) {
          tp.re.lastIndex = 0
          const m = tp.re.exec(line)
          if (m) {
            tools.push({
              kind: tp.name,
              detail: m[1] || m[0],
              file: item.relPath,
              line: i + 1,
              snippet: line.trim().slice(0, 180),
            })
            if (tools.length >= limit) break
          }
        }
      }
    }

    // c) API endpoints & wire formats
    if (endpoints.length < limit) {
      for (let i = 0; i < lines.length && endpoints.length < limit; i++) {
        const line = lines[i]
        for (const ep of ENDPOINT_PATTERNS) {
          ep.re.lastIndex = 0
          const m = ep.re.exec(line)
          if (m) {
            endpoints.push({
              provider: ep.provider,
              matched: m[0],
              file: item.relPath,
              line: i + 1,
              snippet: line.trim().slice(0, 180),
            })
            if (endpoints.length >= limit) break
          }
        }
      }
    }

    // d) Lifecycle hooks
    if (hooks.length < limit) {
      for (let i = 0; i < lines.length && hooks.length < limit; i++) {
        const line = lines[i]
        for (const hp of HOOK_PATTERNS) {
          hp.re.lastIndex = 0
          const m = hp.re.exec(line)
          if (m) {
            hooks.push({
              category: hp.hook,
              symbol: m[1],
              file: item.relPath,
              line: i + 1,
              snippet: line.trim().slice(0, 180),
            })
            if (hooks.length >= limit) break
          }
        }
      }
    }
  }

  const out = [
    `# Agent Bundle Audit: ${path.basename(resolved)}`,
    `- **Target Path**: \`${resolved}\``,
    `- **Files Scanned**: ${filesToScan.length}`,
    `- **Summary**: ${prompts.length} Prompts | ${tools.length} Tools | ${endpoints.length} Endpoints | ${hooks.length} Hooks`,
  ]

  out.push(`\n## 1. Embedded System Prompts (${prompts.length})`)
  if (prompts.length === 0) {
    out.push(`  *(none detected)*`)
  } else {
    for (const p of prompts.slice(0, limit)) {
      out.push(`  - **[${p.type}]** \`${p.file}:${p.line}\`${p.length ? ` (${p.length} chars)` : ''}`)
      out.push(`    > ${p.snippet}`)
    }
  }

  out.push(`\n## 2. Tool Definitions & Schemas (${tools.length})`)
  if (tools.length === 0) {
    out.push(`  *(none detected)*`)
  } else {
    for (const t of tools.slice(0, limit)) {
      out.push(`  - **[${t.kind}]** \`${t.file}:${t.line}\`: \`${t.detail}\``)
      out.push(`    \`${t.snippet}\``)
    }
  }

  out.push(`\n## 3. API Endpoints & Model Wire Formats (${endpoints.length})`)
  if (endpoints.length === 0) {
    out.push(`  *(none detected)*`)
  } else {
    for (const e of endpoints.slice(0, limit)) {
      out.push(`  - **[${e.provider}]** \`${e.file}:${e.line}\`: \`${e.matched}\``)
      out.push(`    \`${e.snippet}\``)
    }
  }

  out.push(`\n## 4. Lifecycle Hooks & Security Gates (${hooks.length})`)
  if (hooks.length === 0) {
    out.push(`  *(none detected)*`)
  } else {
    for (const h of hooks.slice(0, limit)) {
      out.push(`  - **[${h.category}]** \`${h.file}:${h.line}\`: \`${h.symbol}\``)
      out.push(`    \`${h.snippet}\``)
    }
  }

  const formattedSummary = out.join('\n')

  return {
    targetPath: resolved,
    filesScanned: filesToScan.length,
    matches: {
      prompts,
      tools,
      endpoints,
      hooks,
    },
    counts: {
      prompts: prompts.length,
      tools: tools.length,
      endpoints: endpoints.length,
      hooks: hooks.length,
    },
    formattedSummary,
    toString: () => formattedSummary,
  }
}

module.exports = {
  inspectAppBundle,
  extractAsar,
  auditAgentBundle,
  readAsarHeader,
  flattenAsarFiles,
  readAsarFileContent,
  detectFuses,
  parseContextBridgeExposures,
  searchIpcChannels,
}
