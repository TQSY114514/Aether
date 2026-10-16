#!/usr/bin/env node
/**
 * Automated Competitor Audit Pipeline Script (REA Evidence-Ledger Paradigm)
 *
 * Inspects competitor Electron/Node agent bundles or application sources.
 * Emits an Evidence-Ledger report adhering to the REA specification:
 *   - Section 1: Executive Summary & Artifact Identity (SHA-256, version, framework detection)
 *   - Section 2: Electron & IPC Architecture (Preload exposed bridges, Renderer -> Main IPC channels, Main -> Renderer events)
 *   - Section 3: Extracted Agent Prompts & System Instructions (Observations with exact line/offset references)
 *   - Section 4: Tool Catalog & Permission Schema (All discovered tools, parameters, and risk levels)
 *   - Section 5: Residual Unknowns & Security Boundary (What was obfuscated, what remained unverified)
 *
 * Usage:
 *   node app/scripts/audit-agent.js --target <path> [--output <report.md>] [--format <json|markdown>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Native reverse engineering tools from Aether
let reverseEngineerTool = null;
try {
  reverseEngineerTool = require('../electron/tools/reverseEngineer');
} catch (e) {
  // Graceful fallback to built-in inspection engine
}

// ─── Command Line Argument Parsing ──────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    target: null,
    output: null,
    format: null,
    maxMatches: 50,
    help: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--target' || arg === '-t') {
      args.target = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    } else if (arg === '--format' || arg === '-f') {
      args.format = argv[++i]?.toLowerCase();
    } else if (arg === '--max-matches') {
      args.maxMatches = parseInt(argv[++i], 10) || 50;
    } else if (arg.startsWith('--target=')) {
      args.target = arg.slice('--target='.length);
    } else if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
    } else if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length).toLowerCase();
    } else if (arg.startsWith('-')) {
      console.warn(`[audit-agent] Warning: Unknown option '${arg}'`);
    } else if (!args.target) {
      args.target = arg;
    }
  }

  if (!args.format) {
    if (args.output && args.output.toLowerCase().endsWith('.json')) {
      args.format = 'json';
    } else {
      args.format = 'markdown';
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Aether Automated Competitor Audit Pipeline Script (REA Evidence-Ledger)

Usage:
  node app/scripts/audit-agent.js [options]

Options:
  --target, -t <path>       Target file, directory, or .asar bundle to inspect (Required)
  --output, -o <file>       Path to write the audit report (e.g. audit-report.md or report.json)
  --format, -f <format>     Output report format: 'markdown' or 'json' (default: markdown)
  --max-matches <number>    Max extracted items per audit section (default: 50)
  --help, -h                Show this help message and exit

Sections Generated (REA Evidence-Ledger Paradigm):
  1. Executive Summary & Artifact Identity (SHA-256, version, framework detection)
  2. Electron & IPC Architecture (Preload exposed bridges, Renderer -> Main IPC, Main -> Renderer events)
  3. Extracted Agent Prompts & System Instructions (Observations with exact line/offset references)
  4. Tool Catalog & Permission Schema (Discovered tools, parameters, risk levels)
  5. Residual Unknowns & Security Boundary (Obfuscation, unverified native modules, dynamic IPC)

Examples:
  node app/scripts/audit-agent.js --help
  node app/scripts/audit-agent.js --target app/package.json
  node app/scripts/audit-agent.js --target app/electron --output audit-report.md
  node app/scripts/audit-agent.js --target build/app.asar --format json --output audit.json
`);
}

// ─── Utilities & Helpers ───────────────────────────────────────────────────

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getLineAndOffset(content, index) {
  const prefix = content.slice(0, index);
  const line = prefix.split('\n').length;
  const lastNewline = prefix.lastIndexOf('\n');
  const col = lastNewline === -1 ? index + 1 : index - lastNewline;
  const byteOffset = Buffer.byteLength(prefix, 'utf8');
  return { line, col, byteOffset };
}

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function truncateString(str, maxLen = 120) {
  if (!str) return '';
  const clean = str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

// ─── Fallback ASAR Reader & Fuse Detection ──────────────────────────────────

function readAsarArchive(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    if (fs.readSync(fd, sizeBuf, 0, 8, 0) !== 8) {
      throw new Error('Invalid ASAR archive: unable to read header size');
    }
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerSize);
    if (fs.readSync(fd, headerBuf, 0, headerSize, 8) !== headerSize) {
      throw new Error('Invalid ASAR archive: unable to read header payload');
    }
    const jsonLen = headerBuf.readUInt32LE(4);
    const jsonStr = headerBuf.subarray(8, 8 + jsonLen).toString('utf8');
    const header = JSON.parse(jsonStr);
    const baseOffset = 8 + headerSize;

    function readFile(relPath) {
      const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
      let curr = header;
      for (const part of parts) {
        if (!curr.files || !curr.files[part]) return null;
        curr = curr.files[part];
      }
      if (!curr || curr.files || curr.unpacked) return null;
      const offset = typeof curr.offset === 'string' ? parseInt(curr.offset, 10) : curr.offset;
      const size = curr.size;
      const fileBuf = Buffer.alloc(size);
      fs.readSync(fd, fileBuf, 0, size, baseOffset + offset);
      return fileBuf;
    }

    function listFiles() {
      const result = [];
      function walk(obj, prefix = '') {
        if (!obj || !obj.files) return;
        for (const [name, entry] of Object.entries(obj.files)) {
          const itemPath = prefix ? `${prefix}/${name}` : name;
          if (entry.files) {
            walk(entry, itemPath);
          } else {
            result.push({ path: itemPath, size: entry.size, offset: entry.offset, unpacked: !!entry.unpacked });
          }
        }
      }
      walk(header);
      return result;
    }

    return { header, baseOffset, readFile, listFiles };
  } finally {
    fs.closeSync(fd);
  }
}

const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const FUSE_V1_NAMES = [
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges'
];

function detectElectronFuses(buffer) {
  const sentinelBuf = Buffer.from(SENTINEL);
  const idx = buffer.indexOf(sentinelBuf);
  if (idx === -1) return null;

  const version = buffer[idx + sentinelBuf.length];
  const length = buffer[idx + sentinelBuf.length + 1];
  const fuses = {};

  for (let i = 0; i < length; i++) {
    const val = buffer[idx + sentinelBuf.length + 2 + i];
    const name = FUSE_V1_NAMES[i] || `Fuse_${i}`;
    let state = 'unknown';
    if (val === 48) state = 'disabled';
    else if (val === 49) state = 'enabled';
    else if (val === 114) state = 'removed';
    else if (val === 144) state = 'inherit';
    fuses[name] = state;
  }

  return { version, length, fuses };
}

// ─── Core Scanner & Ledger Builder ──────────────────────────────────────────

async function runAuditPipeline(targetInput, options = {}) {
  const maxMatches = options.maxMatches || 50;
  const absTarget = path.resolve(process.cwd(), targetInput);

  if (!fs.existsSync(absTarget)) {
    throw new Error(`Target path does not exist: ${targetInput} (resolved to ${absTarget})`);
  }

  const stat = fs.statSync(absTarget);
  const isDirectory = stat.isDirectory();
  const isAsar = !isDirectory && absTarget.toLowerCase().endsWith('.asar');

  // Evidence Ledger Storage
  const ledger = [];
  let evCounter = 1;

  function addEvidence({ category, section, type, authority, line, byteOffset, description, raw, confidence = 'High' }) {
    const id = `EV-${category.toUpperCase().slice(0, 3)}-${String(evCounter++).padStart(3, '0')}`;
    const item = {
      evidence_id: id,
      category,
      section,
      type: type || 'Observation', // Observation | Inference | Unknown
      authority: authority ? normalizePath(authority) : 'target',
      line: line || null,
      byte_offset: byteOffset != null ? byteOffset : null,
      description,
      raw: raw || null,
      confidence
    };
    ledger.push(item);
    return item;
  }

  // Check if native reverseEngineer module can inspect the target
  let nativeBundleInfo = null;
  let nativeAuditInfo = null;
  if (reverseEngineerTool) {
    try {
      if (typeof reverseEngineerTool.inspectAppBundle === 'function') {
        nativeBundleInfo = await reverseEngineerTool.inspectAppBundle({ targetPath: absTarget });
      }
      if (typeof reverseEngineerTool.auditAgentBundle === 'function') {
        nativeAuditInfo = await reverseEngineerTool.auditAgentBundle({ targetPath: absTarget, maxMatches });
      }
    } catch (e) {
      // Fallback seamlessly if native call encounters target-specific edge case
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1: Artifact Identity & Framework Detection
  // ──────────────────────────────────────────────────────────────────────────

  const frameworksSet = new Set();
  const artifactIdentity = {
    target: normalizePath(path.relative(process.cwd(), absTarget)) || path.basename(absTarget),
    absolutePath: absTarget,
    artifactType: isDirectory ? 'Application Directory' : isAsar ? 'Electron ASAR Archive' : 'Single File / Script',
    sizeBytes: stat.size,
    sha256: null,
    packageName: null,
    packageVersion: null,
    frameworks: [],
    dependencies: {},
    devDependencies: {},
    electronFuses: null,
    fileCount: 0
  };

  let filesToScan = []; // Array of { relPath, getBuffer: () => Buffer }

  if (isAsar) {
    const asarArchive = readAsarArchive(absTarget);
    const wholeBuf = fs.readFileSync(absTarget);
    artifactIdentity.sha256 = computeSha256(wholeBuf);
    const asarFiles = asarArchive.listFiles();
    artifactIdentity.fileCount = asarFiles.length;

    for (const f of asarFiles) {
      filesToScan.push({
        relPath: f.path,
        size: f.size,
        getBuffer: () => asarArchive.readFile(f.path)
      });
    }

    addEvidence({
      category: 'ART',
      section: 1,
      type: 'Observation',
      authority: artifactIdentity.target,
      description: `Target is an Electron ASAR archive containing ${asarFiles.length} packaged members. SHA-256: ${artifactIdentity.sha256}`
    });
  } else if (isDirectory) {
    function walkDir(dir, prefix = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(full, rel);
        } else {
          filesToScan.push({
            relPath: rel,
            fullPath: full,
            size: fs.statSync(full).size,
            getBuffer: () => fs.readFileSync(full)
          });
        }
      }
    }
    walkDir(absTarget);
    artifactIdentity.fileCount = filesToScan.length;

    // Aggregate SHA-256 of directory files
    const hasher = crypto.createHash('sha256');
    for (const f of filesToScan.slice(0, 100)) {
      hasher.update(f.relPath);
    }
    artifactIdentity.sha256 = hasher.digest('hex');

    addEvidence({
      category: 'ART',
      section: 1,
      type: 'Observation',
      authority: artifactIdentity.target,
      description: `Target is an application directory with ${filesToScan.length} scanned files. Digest: ${artifactIdentity.sha256}`
    });
  } else {
    // Single file
    const buf = fs.readFileSync(absTarget);
    artifactIdentity.sha256 = computeSha256(buf);
    artifactIdentity.fileCount = 1;
    filesToScan.push({
      relPath: path.basename(absTarget),
      fullPath: absTarget,
      size: stat.size,
      getBuffer: () => buf
    });

    addEvidence({
      category: 'ART',
      section: 1,
      type: 'Observation',
      authority: artifactIdentity.target,
      description: `Target is a single artifact file (${path.basename(absTarget)}). SHA-256: ${artifactIdentity.sha256}`
    });
  }

  // Check package.json for metadata & dependencies
  let pkgBuf = null;
  const pkgEntry = filesToScan.find(f => path.basename(f.relPath) === 'package.json');
  if (pkgEntry) {
    pkgBuf = pkgEntry.getBuffer();
  } else if (nativeBundleInfo && nativeBundleInfo.packageJson) {
    artifactIdentity.packageName = nativeBundleInfo.packageJson.name || null;
    artifactIdentity.packageVersion = nativeBundleInfo.packageJson.version || null;
    artifactIdentity.dependencies = nativeBundleInfo.packageJson.dependencies || {};
    artifactIdentity.devDependencies = nativeBundleInfo.packageJson.devDependencies || {};
  } else if (!isAsar) {
    // Try parent directory package.json
    let curr = absTarget;
    for (let i = 0; i < 3; i++) {
      const candidate = path.join(curr, 'package.json');
      if (fs.existsSync(candidate)) {
        pkgBuf = fs.readFileSync(candidate);
        break;
      }
      curr = path.dirname(curr);
    }
  }

  if (pkgBuf) {
    try {
      const pkg = JSON.parse(pkgBuf.toString('utf8'));
      artifactIdentity.packageName = pkg.name || 'unnamed';
      artifactIdentity.packageVersion = pkg.version || '0.0.0';
      artifactIdentity.dependencies = pkg.dependencies || {};
      artifactIdentity.devDependencies = pkg.devDependencies || {};
    } catch (e) {
      // Ignored malformed JSON
    }
  }

  const allDeps = { ...artifactIdentity.dependencies, ...artifactIdentity.devDependencies };
  if (allDeps.electron) frameworksSet.add(`Electron (${allDeps.electron})`);
  if (allDeps.react) frameworksSet.add(`React (${allDeps.react})`);
  if (allDeps.vue) frameworksSet.add(`Vue (${allDeps.vue})`);
  if (allDeps.svelte) frameworksSet.add(`Svelte (${allDeps.svelte})`);
  if (allDeps.zustand) frameworksSet.add(`Zustand (${allDeps.zustand})`);
  if (allDeps['better-sqlite3']) frameworksSet.add(`better-sqlite3 (${allDeps['better-sqlite3']})`);
  if (allDeps.sqlite3) frameworksSet.add(`sqlite3 (${allDeps.sqlite3})`);
  if (allDeps['@electron/asar']) frameworksSet.add(`@electron/asar (${allDeps['@electron/asar']})`);
  if (allDeps.tailwindcss) frameworksSet.add(`TailwindCSS (${allDeps.tailwindcss})`);
  if (allDeps.vite) frameworksSet.add(`Vite (${allDeps.vite})`);

  artifactIdentity.frameworks = Array.from(frameworksSet);

  if (artifactIdentity.packageName) {
    addEvidence({
      category: 'ART',
      section: 1,
      type: 'Observation',
      authority: pkgEntry ? pkgEntry.relPath : 'package.json',
      description: `Package Identity: ${artifactIdentity.packageName}@${artifactIdentity.packageVersion}. Detected frameworks: ${artifactIdentity.frameworks.join(', ') || 'Standard Node.js'}`
    });
  }

  // Check for Electron binary fuses
  if (nativeBundleInfo && nativeBundleInfo.fuses && nativeBundleInfo.fuses.detected) {
    artifactIdentity.electronFuses = nativeBundleInfo.fuses;
    addEvidence({
      category: 'ART',
      section: 1,
      type: 'Observation',
      authority: path.basename(nativeBundleInfo.fuses.binaryPath || 'electron'),
      description: `Electron Fuses identified: RunAsNode=${nativeBundleInfo.fuses.fuses.RunAsNode}, EnableNodeCliInspectArguments=${nativeBundleInfo.fuses.fuses.EnableNodeCliInspectArguments}, OnlyLoadAppFromAsar=${nativeBundleInfo.fuses.fuses.OnlyLoadAppFromAsar}`
    });
  } else {
    for (const f of filesToScan) {
      if (f.relPath.endsWith('.exe') || f.relPath.includes('electron') || f.relPath.endsWith('.dll')) {
        const buf = f.getBuffer();
        if (buf) {
          const fuses = detectElectronFuses(buf);
          if (fuses) {
            artifactIdentity.electronFuses = fuses;
            addEvidence({
              category: 'ART',
              section: 1,
              type: 'Observation',
              authority: f.relPath,
              description: `Electron Fuses identified (v${fuses.version}): RunAsNode=${fuses.fuses.RunAsNode}, EnableNodeCliInspectArguments=${fuses.fuses.EnableNodeCliInspectArguments}, OnlyLoadAppFromAsar=${fuses.fuses.OnlyLoadAppFromAsar}`
            });
            break;
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2: Electron & IPC Architecture
  // ──────────────────────────────────────────────────────────────────────────

  const ipcArchitecture = {
    preloadExposures: [],
    rendererToMainChannels: [],
    mainHandlers: [],
    mainToRendererEvents: [],
    orphanedChannels: []
  };

  // Merge native exposed APIs if available
  if (nativeBundleInfo && Array.isArray(nativeBundleInfo.exposedApis)) {
    for (const api of nativeBundleInfo.exposedApis) {
      ipcArchitecture.preloadExposures.push({
        apiKey: api.namespace,
        file: api.file,
        line: api.line,
        col: api.col || 1,
        byteOffset: 0,
        methods: api.methods || []
      });
      addEvidence({
        category: 'IPC',
        section: 2,
        type: 'Observation',
        authority: `${api.file}:${api.line}`,
        line: api.line,
        byteOffset: 0,
        description: `Preload ContextBridge: Exposed '${api.namespace}' with ${(api.methods || []).length} methods`
      });
    }
  }

  // Scanning files for IPC patterns
  for (const f of filesToScan) {
    const ext = path.extname(f.relPath).toLowerCase();
    if (!['.js', '.cjs', '.mjs', '.ts', '.tsx', '.html', '.json'].includes(ext)) continue;

    const buf = f.getBuffer();
    if (!buf) continue;
    const text = buf.toString('utf8');

    // 1. contextBridge.exposeInMainWorld (if not already captured)
    if (ipcArchitecture.preloadExposures.length === 0) {
      const bridgeRe = /contextBridge\s*\.\s*exposeInMainWorld\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\{[\s\S]*?\}|[\w$]+)/g;
      let bMatch;
      while ((bMatch = bridgeRe.exec(text)) !== null) {
        const apiKey = bMatch[1];
        const { line, col, byteOffset } = getLineAndOffset(text, bMatch.index);
        const bridgeObj = bMatch[2];

        const methodNames = [];
        const methodRe = /([a-zA-Z0-9_$]+)\s*[:(]/g;
        let mMatch;
        while ((mMatch = methodRe.exec(bridgeObj)) !== null) {
          if (!['function', 'async', 'return', 'if'].includes(mMatch[1])) {
            methodNames.push(mMatch[1]);
          }
        }

        ipcArchitecture.preloadExposures.push({
          apiKey,
          file: f.relPath,
          line,
          col,
          byteOffset,
          methods: Array.from(new Set(methodNames)).slice(0, 20)
        });

        addEvidence({
          category: 'IPC',
          section: 2,
          type: 'Observation',
          authority: `${f.relPath}:${line}`,
          line,
          byteOffset,
          description: `Preload ContextBridge: Exposed '${apiKey}' with ${methodNames.length} methods (${methodNames.slice(0, 5).join(', ')}...)`
        });
      }
    }

    // 2. Renderer -> Main Channels (ipcRenderer.invoke, ipcRenderer.send)
    const invokeRe = /ipcRenderer\s*\.\s*(invoke|send|sendSync)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let iMatch;
    while ((iMatch = invokeRe.exec(text)) !== null) {
      const verb = iMatch[1];
      const channel = iMatch[2];
      const { line, col, byteOffset } = getLineAndOffset(text, iMatch.index);

      ipcArchitecture.rendererToMainChannels.push({
        channel,
        verb,
        file: f.relPath,
        line,
        col,
        byteOffset
      });

      if (ipcArchitecture.rendererToMainChannels.length <= maxMatches) {
        addEvidence({
          category: 'IPC',
          section: 2,
          type: 'Observation',
          authority: `${f.relPath}:${line}`,
          line,
          byteOffset,
          description: `Renderer IPC Call: ipcRenderer.${verb}('${channel}')`
        });
      }
    }

    // 3. Main IPC Handlers (ipcMain.handle, ipcMain.on)
    const handleRe = new RegExp('ipcMain' + '\\s*\\.\\s*(handle|on|handleOnce|once)\\s*\\(\\s*[\'"`]([^\'"`]+)[\'"`]', 'g');
    let hMatch;
    while ((hMatch = handleRe.exec(text)) !== null) {
      const verb = hMatch[1];
      const channel = hMatch[2];
      const { line, col, byteOffset } = getLineAndOffset(text, hMatch.index);

      ipcArchitecture.mainHandlers.push({
        channel,
        verb,
        file: f.relPath,
        line,
        col,
        byteOffset
      });

      if (ipcArchitecture.mainHandlers.length <= maxMatches) {
        addEvidence({
          category: 'IPC',
          section: 2,
          type: 'Observation',
          authority: `${f.relPath}:${line}`,
          line,
          byteOffset,
          description: `Main IPC Handler: ipcMain.${verb}('${channel}')`
        });
      }
    }

    // 4. Main -> Renderer Events (webContents.send, sender.send)
    const sendRe = /(?:webContents|event\.sender|sender)\s*\.\s*send\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let sMatch;
    while ((sMatch = sendRe.exec(text)) !== null) {
      const channel = sMatch[1];
      const { line, col, byteOffset } = getLineAndOffset(text, sMatch.index);

      ipcArchitecture.mainToRendererEvents.push({
        channel,
        file: f.relPath,
        line,
        col,
        byteOffset
      });

      if (ipcArchitecture.mainToRendererEvents.length <= maxMatches) {
        addEvidence({
          category: 'IPC',
          section: 2,
          type: 'Observation',
          authority: `${f.relPath}:${line}`,
          line,
          byteOffset,
          description: `Main Event Emit: webContents.send('${channel}')`
        });
      }
    }
  }

  // Cross-reference channels
  const registeredHandlers = new Set(ipcArchitecture.mainHandlers.map(h => h.channel));
  for (const call of ipcArchitecture.rendererToMainChannels) {
    if (!registeredHandlers.has(call.channel)) {
      ipcArchitecture.orphanedChannels.push(call);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3: Extracted Agent Prompts & System Instructions
  // ──────────────────────────────────────────────────────────────────────────

  const extractedPrompts = [];

  // Merge native audited prompts if available
  if (nativeAuditInfo && nativeAuditInfo.matches && Array.isArray(nativeAuditInfo.matches.prompts)) {
    for (const p of nativeAuditInfo.matches.prompts) {
      extractedPrompts.push({
        role: p.kind || 'prompt',
        file: p.file,
        line: p.line,
        col: p.col || 1,
        byteOffset: 0,
        length: (p.matched || '').length,
        excerpt: truncateString(p.snippet || p.matched, 180),
        rawContent: (p.matched || '').slice(0, 1000)
      });
      if (extractedPrompts.length <= maxMatches) {
        addEvidence({
          category: 'PRM',
          section: 3,
          type: 'Observation',
          authority: `${p.file}:${p.line}`,
          line: p.line,
          byteOffset: 0,
          description: `Extracted Prompt (${p.kind}): "${truncateString(p.snippet || p.matched, 90)}"`
        });
      }
    }
  }

  // Also scan files directly for deep coverage
  for (const f of filesToScan) {
    const ext = path.extname(f.relPath).toLowerCase();
    if (!['.js', '.cjs', '.mjs', '.ts', '.tsx', '.json', '.md'].includes(ext)) continue;

    const buf = f.getBuffer();
    if (!buf) continue;
    const text = buf.toString('utf8');

    // System prompt role blocks
    const roleRe = /(?:role\s*:\s*['"`]system['"`]\s*,\s*content\s*:\s*)(`[\s\S]*?`|"[^"]{40,}"|'[^']{40,}')/g;
    let rMatch;
    while ((rMatch = roleRe.exec(text)) !== null) {
      const rawPrompt = rMatch[1];
      const { line, col, byteOffset } = getLineAndOffset(text, rMatch.index);
      const cleanPrompt = rawPrompt.replace(/^[`"']|[`"']$/g, '').trim();

      if (!extractedPrompts.some(p => p.file === f.relPath && p.line === line)) {
        const item = {
          role: 'system',
          file: f.relPath,
          line,
          col,
          byteOffset,
          length: cleanPrompt.length,
          excerpt: truncateString(cleanPrompt, 180),
          rawContent: cleanPrompt.slice(0, 1000)
        };
        extractedPrompts.push(item);

        if (extractedPrompts.length <= maxMatches) {
          addEvidence({
            category: 'PRM',
            section: 3,
            type: 'Observation',
            authority: `${f.relPath}:${line}`,
            line,
            byteOffset,
            description: `System Prompt Block [${cleanPrompt.length} chars]: "${truncateString(cleanPrompt, 100)}"`
          });
        }
      }
    }

    // Named prompt constants
    const directiveRe = /(?:const|let|var)\s+([A-Za-z0-9_$]*(?:PROMPT|SYSTEM|INSTRUCTION|GUIDELINES)[A-Za-z0-9_$]*)\s*=\s*(`[\s\S]*?`|['"][^'"]{50,}['"])/gi;
    let dMatch;
    while ((dMatch = directiveRe.exec(text)) !== null) {
      const varName = dMatch[1];
      const rawPrompt = dMatch[2];
      const { line, col, byteOffset } = getLineAndOffset(text, dMatch.index);
      const cleanPrompt = rawPrompt.replace(/^[`"']|[`"']$/g, '').trim();

      if (!extractedPrompts.some(p => p.file === f.relPath && p.line === line)) {
        const item = {
          role: varName,
          file: f.relPath,
          line,
          col,
          byteOffset,
          length: cleanPrompt.length,
          excerpt: truncateString(cleanPrompt, 180),
          rawContent: cleanPrompt.slice(0, 1000)
        };
        extractedPrompts.push(item);

        if (extractedPrompts.length <= maxMatches) {
          addEvidence({
            category: 'PRM',
            section: 3,
            type: 'Observation',
            authority: `${f.relPath}:${line}`,
            line,
            byteOffset,
            description: `Named Prompt Constant '${varName}' [${cleanPrompt.length} chars]: "${truncateString(cleanPrompt, 90)}"`
          });
        }
      }
    }

    // Agent constitution / persona files
    if (f.relPath.endsWith('AGENTS.md') || f.relPath.includes('prompt') || f.relPath.includes('persona')) {
      if (!extractedPrompts.some(p => p.file === f.relPath && p.role === 'agent_constitution')) {
        const lines = text.split('\n');
        const sample = lines.slice(0, 15).join(' ');

        const item = {
          role: 'agent_constitution',
          file: f.relPath,
          line: 1,
          col: 1,
          byteOffset: 0,
          length: text.length,
          excerpt: truncateString(sample, 180),
          rawContent: text.slice(0, 1000)
        };
        extractedPrompts.push(item);

        addEvidence({
          category: 'PRM',
          section: 3,
          type: 'Observation',
          authority: `${f.relPath}:1`,
          line: 1,
          byteOffset: 0,
          description: `Agent Constitution File '${path.basename(f.relPath)}' [${text.length} chars]: "${truncateString(sample, 100)}"`
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4: Tool Catalog & Permission Schema
  // ──────────────────────────────────────────────────────────────────────────

  const toolCatalog = [];

  // Merge native audited tools if available
  if (nativeAuditInfo && nativeAuditInfo.matches && Array.isArray(nativeAuditInfo.matches.tools)) {
    for (const t of nativeAuditInfo.matches.tools) {
      toolCatalog.push({
        name: t.detail || 'tool',
        description: truncateString(t.snippet, 140),
        risk: 'unspecified',
        hasParameters: true,
        file: t.file,
        line: t.line,
        byteOffset: 0
      });
      if (toolCatalog.length <= maxMatches) {
        addEvidence({
          category: 'TOL',
          section: 4,
          type: 'Observation',
          authority: `${t.file}:${t.line}`,
          line: t.line,
          byteOffset: 0,
          description: `Discovered Tool '${t.detail}' (${t.kind}) in ${t.file}`
        });
      }
    }
  }

  for (const f of filesToScan) {
    const ext = path.extname(f.relPath).toLowerCase();
    if (!['.js', '.cjs', '.mjs', '.ts', '.tsx', '.json'].includes(ext)) continue;

    const buf = f.getBuffer();
    if (!buf) continue;
    const text = buf.toString('utf8');

    // Aether/Standard tool definition object
    const toolObjRe = /\{\s*name\s*:\s*['"`]([a-zA-Z0-9_\-.]+)['"`]\s*,\s*(?:description|desc)\s*:\s*['"`]([^'"`]+)['"`]([\s\S]*?)\}/g;
    let tMatch;
    while ((tMatch = toolObjRe.exec(text)) !== null) {
      const name = tMatch[1];
      const desc = tMatch[2];
      const body = tMatch[3];
      const { line, col, byteOffset } = getLineAndOffset(text, tMatch.index);

      const riskMatch = /risk\s*:\s*['"`]([^'"`]+)['"`]/.exec(body);
      const risk = riskMatch ? riskMatch[1] : 'unspecified';
      const hasParams = /parameters|properties|schema/.test(body);

      if (!toolCatalog.some(t => t.name === name)) {
        const toolEntry = {
          name,
          description: truncateString(desc, 140),
          risk,
          hasParameters: hasParams,
          file: f.relPath,
          line,
          byteOffset
        };
        toolCatalog.push(toolEntry);

        if (toolCatalog.length <= maxMatches) {
          addEvidence({
            category: 'TOL',
            section: 4,
            type: 'Observation',
            authority: `${f.relPath}:${line}`,
            line,
            byteOffset,
            description: `Discovered Tool '${name}' (risk: ${risk}) - ${truncateString(desc, 80)}`
          });
        }
      }
    }

    // OpenAI function specification format
    const fnFormatRe = /type\s*:\s*['"`]function['"`]\s*,\s*function\s*:\s*\{\s*name\s*:\s*['"`]([a-zA-Z0-9_\-.]+)['"`]/g;
    let fnMatch;
    while ((fnMatch = fnFormatRe.exec(text)) !== null) {
      const name = fnMatch[1];
      const { line, col, byteOffset } = getLineAndOffset(text, fnMatch.index);
      if (!toolCatalog.some(t => t.name === name)) {
        const toolEntry = {
          name,
          description: 'OpenAI function specification',
          risk: 'unspecified',
          hasParameters: true,
          file: f.relPath,
          line,
          byteOffset
        };
        toolCatalog.push(toolEntry);

        addEvidence({
          category: 'TOL',
          section: 4,
          type: 'Observation',
          authority: `${f.relPath}:${line}`,
          line,
          byteOffset,
          description: `OpenAI Function Tool '${name}' discovered in schema definition`
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5: Residual Unknowns & Security Boundary
  // ──────────────────────────────────────────────────────────────────────────

  const residualUnknowns = [];

  // Check 1: Minified or obfuscated files
  for (const f of filesToScan) {
    if (f.relPath.endsWith('.js') || f.relPath.endsWith('.mjs')) {
      const buf = f.getBuffer();
      if (buf && buf.length > 50000) {
        const text = buf.toString('utf8', 0, 5000);
        const lines = text.split('\n');
        const avgLineLen = text.length / (lines.length || 1);
        if (avgLineLen > 400) {
          residualUnknowns.push({
            id: `UNK-${String(residualUnknowns.length + 1).padStart(3, '0')}`,
            type: 'Minified/Obfuscated Code',
            file: f.relPath,
            description: `File '${f.relPath}' (${Math.round(buf.length / 1024)} KB) exhibits high minification (avg line len ${Math.round(avgLineLen)}). Static AST recovery is partial.`,
            verificationEnvironment: 'Requires beautification or source map deobfuscation with Hopper/Ghidra or DevTools'
          });
        }
      }
    }
  }

  // Check 2: Dynamic IPC invocations
  for (const f of filesToScan) {
    if (f.relPath.endsWith('.js') || f.relPath.endsWith('.ts')) {
      const buf = f.getBuffer();
      if (!buf) continue;
      const text = buf.toString('utf8');
      const dynamicRe = /ipcRenderer\s*\.\s*(?:invoke|send)\s*\(\s*([a-zA-Z0-9_$]+)[^'"`]/g;
      let dynMatch;
      while ((dynMatch = dynamicRe.exec(text)) !== null) {
        const varName = dynMatch[1];
        if (!['channel', 'event'].includes(varName.toLowerCase())) continue;
        const { line } = getLineAndOffset(text, dynMatch.index);
        residualUnknowns.push({
          id: `UNK-${String(residualUnknowns.length + 1).padStart(3, '0')}`,
          type: 'Dynamic IPC Channel',
          file: `${f.relPath}:${line}`,
          description: `Dynamic IPC channel call using variable '${varName}'. Target channel cannot be statically proven.`,
          verificationEnvironment: 'Requires runtime passive IPC tracing via Electron DevTools or preload instrumentation'
        });
        break;
      }
    }
  }

  // Check 3: Native binary modules (.node, .dll)
  for (const f of filesToScan) {
    if (f.relPath.endsWith('.node') || f.relPath.endsWith('.dll') || f.relPath.endsWith('.so')) {
      residualUnknowns.push({
        id: `UNK-${String(residualUnknowns.length + 1).padStart(3, '0')}`,
        type: 'Native C++ Addon Boundary',
        file: f.relPath,
        description: `Native binary module '${f.relPath}' detected. Native exports, syscalls, and binary vulnerabilities remain unverified.`,
        verificationEnvironment: 'Requires Ghidra / Hopper / IDA Pro disassembly and symbol analysis'
      });
    }
  }

  // Check 4: Remote API endpoints & credentials
  residualUnknowns.push({
    id: `UNK-${String(residualUnknowns.length + 1).padStart(3, '0')}`,
    type: 'External Model Provider Wire Boundary',
    file: 'runtime/network',
    description: 'LLM endpoint hostnames, upstream model IDs, and runtime system prompt alterations over wire remain unobserved.',
    verificationEnvironment: 'Requires HTTP/WebSocket network capture (mitmproxy, Fiddler, or HAR recording)'
  });

  // Record unknowns into Evidence Ledger
  for (const unk of residualUnknowns) {
    addEvidence({
      category: 'UNK',
      section: 5,
      type: 'Unknown',
      authority: unk.file,
      description: `[${unk.type}] ${unk.description} -> ${unk.verificationEnvironment}`,
      confidence: 'Bounded Hypothesis'
    });
  }

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      scriptVersion: '1.0.0',
      paradigm: 'REA Evidence Ledger',
      target: artifactIdentity.target
    },
    artifactIdentity,
    ipcArchitecture,
    extractedPrompts,
    toolCatalog,
    residualUnknowns,
    evidenceLedger: ledger
  };
}

// ─── Formatters (Markdown & JSON) ──────────────────────────────────────────

function formatMarkdownReport(auditData) {
  const { metadata, artifactIdentity, ipcArchitecture, extractedPrompts, toolCatalog, residualUnknowns, evidenceLedger } = auditData;

  const lines = [];

  lines.push(`# Competitor Agent Audit Report`);
  lines.push(`> Generated by Aether Automated Competitor Audit Pipeline (${metadata.paradigm})`);
  lines.push(`> **Timestamp**: ${metadata.generatedAt} | **Target**: \`${metadata.target}\`\n`);

  lines.push(`---`);
  lines.push(`## Section 1: Executive Summary & Artifact Identity`);
  lines.push(``);
  lines.push(`- **Artifact Path**: \`${artifactIdentity.absolutePath}\``);
  lines.push(`- **Artifact Classification**: ${artifactIdentity.artifactType}`);
  lines.push(`- **SHA-256 Digest**: \`${artifactIdentity.sha256 || 'N/A'}\``);
  lines.push(`- **Discovered Files**: ${artifactIdentity.fileCount}`);
  lines.push(`- **Total Size**: ${(artifactIdentity.sizeBytes / 1024).toFixed(2)} KB`);
  lines.push(`- **Application Identity**: ${artifactIdentity.packageName ? `\`${artifactIdentity.packageName}@${artifactIdentity.packageVersion}\`` : '_Undetermined_'}`);
  lines.push(`- **Identified Frameworks**: ${(Array.isArray(artifactIdentity.frameworks) ? artifactIdentity.frameworks.join(', ') : '') || '_Standard Node / Vanilla JS_'}`);

  if (artifactIdentity.electronFuses && artifactIdentity.electronFuses.fuses) {
    lines.push(``);
    lines.push(`### Electron Binary Fuses`);
    lines.push(`| Fuse Name | Status |`);
    lines.push(`| :--- | :--- |`);
    for (const [fuse, val] of Object.entries(artifactIdentity.electronFuses.fuses)) {
      lines.push(`| \`${fuse}\` | **${val}** |`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`## Section 2: Electron & IPC Architecture`);
  lines.push(``);
  lines.push(`### 2.1 Preload Exposed Bridges`);
  if (ipcArchitecture.preloadExposures.length === 0) {
    lines.push(`_No \`contextBridge.exposeInMainWorld\` calls discovered in scanned sources._`);
  } else {
    lines.push(`| API Namespace | Methods Count | Sample Methods | Source Location |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const b of ipcArchitecture.preloadExposures) {
      lines.push(`| \`${b.apiKey}\` | ${b.methods.length} | \`${b.methods.slice(0, 4).join(', ')}${b.methods.length > 4 ? '...' : ''}\` | \`${b.file}:${b.line}\` |`);
    }
  }

  lines.push(``);
  lines.push(`### 2.2 IPC Channels Matrix`);
  lines.push(`- **Renderer -> Main Invocations**: ${ipcArchitecture.rendererToMainChannels.length}`);
  lines.push(`- **Main Process Handlers Registered**: ${ipcArchitecture.mainHandlers.length}`);
  lines.push(`- **Main -> Renderer Events Emitted**: ${ipcArchitecture.mainToRendererEvents.length}`);

  if (ipcArchitecture.mainHandlers.length > 0) {
    lines.push(``);
    lines.push(`| Direction | Channel Name | Handler Type | Authority / Source |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const h of ipcArchitecture.mainHandlers.slice(0, 30)) {
      lines.push(`| Renderer ➔ Main | \`${h.channel}\` | \`ipcMain.${h.verb}\` | \`${h.file}:${h.line}\` |`);
    }
    if (ipcArchitecture.mainHandlers.length > 30) {
      lines.push(`| ... | _(${ipcArchitecture.mainHandlers.length - 30} additional channels truncated)_ | ... | ... |`);
    }
  }

  if (ipcArchitecture.orphanedChannels.length > 0) {
    lines.push(``);
    lines.push(`> [!WARNING]`);
    lines.push(`> **Unmatched IPC Invocations**: ${ipcArchitecture.orphanedChannels.length} channel(s) invoked by renderer without corresponding static \`ipcMain.handle\` registration in scanned files (e.g. \`${ipcArchitecture.orphanedChannels.slice(0, 5).map(c => c.channel).join(', ')}\`).`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`## Section 3: Extracted Agent Prompts & System Instructions`);
  lines.push(``);
  if (extractedPrompts.length === 0) {
    lines.push(`_No explicit system prompts or agent persona directives identified in static strings._`);
  } else {
    lines.push(`| Evidence ID | Role / Identifier | Location | Chars | Prompt Excerpt |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (let i = 0; i < extractedPrompts.length; i++) {
      const p = extractedPrompts[i];
      const evId = `EV-PRM-${String(i + 1).padStart(3, '0')}`;
      lines.push(`| \`${evId}\` | **${p.role}** | \`${p.file}:${p.line}\` | ${p.length} | _"${p.excerpt}"_ |`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`## Section 4: Tool Catalog & Permission Schema`);
  lines.push(``);
  if (toolCatalog.length === 0) {
    lines.push(`_No agent tool schemas or function registrations found in scanned targets._`);
  } else {
    lines.push(`| Tool Name | Risk Level | Parameters | Description | Declared In |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const t of toolCatalog) {
      const riskBadge = t.risk === 'dangerous' ? '⚠️ **dangerous**' : t.risk === 'safe' ? '✅ `safe`' : `\`${t.risk}\``;
      lines.push(`| \`${t.name}\` | ${riskBadge} | ${t.hasParameters ? 'Yes' : 'No'} | ${t.description} | \`${t.file}:${t.line}\` |`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`## Section 5: Residual Unknowns & Security Boundary`);
  lines.push(``);
  lines.push(`Under REA's Evidence Ledger paradigm, items that cannot be completely established via static analysis remain explicitly classified as Residual Unknowns:\n`);
  lines.push(`| Unknown ID | Type | Target Scope | Description | Verification Prerequisite |`);
  lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
  for (const u of residualUnknowns) {
    lines.push(`| \`${u.id}\` | **${u.type}** | \`${u.file}\` | ${u.description} | _${u.verificationEnvironment}_ |`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`## Complete REA Evidence Ledger (${evidenceLedger.length} Items)`);
  lines.push(``);
  lines.push(`| Evidence ID | Category | Type | Location (Authority) | Summary Observation |`);
  lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
  for (const ev of evidenceLedger.slice(0, 100)) {
    lines.push(`| \`${ev.evidence_id}\` | \`${ev.category}\` | ${ev.type} | \`${ev.authority}\` | ${truncateString(ev.description, 85)} |`);
  }
  if (evidenceLedger.length > 100) {
    lines.push(`| ... | ... | ... | ... | _(${evidenceLedger.length - 100} additional evidence items preserved in memory/JSON)_ |`);
  }

  lines.push(``);
  return lines.join('\n');
}

// ─── Main CLI Entrypoint ───────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.target) {
    console.error('Error: Missing required argument --target <path>');
    printHelp();
    process.exit(1);
  }

  try {
    const auditData = await runAuditPipeline(args.target, { maxMatches: args.maxMatches });

    let outputContent;
    if (args.format === 'json') {
      outputContent = JSON.stringify(auditData, null, 2);
    } else {
      outputContent = formatMarkdownReport(auditData);
    }

    if (args.output) {
      const outPath = path.resolve(process.cwd(), args.output);
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outPath, outputContent, 'utf8');
      console.log(`[audit-agent] Audit complete for target: ${args.target}`);
      console.log(`[audit-agent] Report successfully written to: ${outPath} (${auditData.evidenceLedger.length} evidence items)`);
    } else {
      console.log(outputContent);
    }
  } catch (err) {
    console.error(`[audit-agent] Fatal execution error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runAuditPipeline,
  formatMarkdownReport,
  readAsarArchive,
  detectElectronFuses
};
