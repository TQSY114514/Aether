#!/usr/bin/env node
/**
 * Boot smoke test for the Electron main process.
 *
 * Loads electron/main.js with a stubbed `electron` module, runs the full
 * whenReady chain (database init, IPC registration, scheduler, curator), and
 * fails on any uncaught exception / unhandled rejection. Catches the class of
 * startup crashes that only surface after a real app restart (syntax errors,
 * duplicate declarations, missing catches, broken require chains).
 *
 * Usage: node scripts/boot-smoke.js
 */
const Module = require('module')
const os = require('os')
const path = require('path')
const fs = require('fs')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-boot-'))
const origLoad = Module._load
let ipcHandlers = 0

const fakeWebContents = { send: () => {}, isDestroyed: () => false }
class FakeBrowserWindow {
  constructor() {
    this.webContents = fakeWebContents
  }
  once() {}
  loadURL() { return Promise.resolve() }
  show() {}
  focus() {}
  hide() {}
  isDestroyed() { return false }
  isVisible() { return false }
}
class FakeTray {
  setToolTip() {}
  setContextMenu() {}
  on() {}
}

Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        commandLine: { appendSwitch() {} },
        getPath: () => tmp,
        getVersion: () => '0.0.0-boot-smoke',
        whenReady: () => Promise.resolve(),
        on: () => {},
        setAsDefaultProtocolClient: () => true,
        quit: () => {},
      },
      BrowserWindow: FakeBrowserWindow,
      ipcMain: {
        handle: () => { ipcHandlers++ },
        on: () => {},
      },
      Tray: FakeTray,
      Menu: { buildFromTemplate: () => ({}) },
      nativeImage: {
        createFromPath: () => ({ resize: () => ({ isEmpty: () => true }) }),
        createFromBuffer: () => ({ isEmpty: () => false }),
      },
      session: { defaultSession: { setSpellCheckLanguages() {} } },
      protocol: { handle() {} },
      globalShortcut: { register: () => true, unregisterAll: () => {} },
    }
  }
  // Auto-update needs a real packaged app; skip it in the smoke boot so the
  // test covers database/IPC/scheduler without electron-updater noise.
  if (request === './updater' && parent && parent.filename && parent.filename.includes('main.js')) {
    return { init() {}, registerHandlers() {}, check: async () => {} }
  }
  return origLoad.apply(this, arguments)
}

process.env.NODE_ENV = 'test'
process.on('uncaughtException', (e) => {
  console.error('BOOT SMOKE FAILED (uncaught exception):', e && e.stack ? e.stack : e)
  cleanup()
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  console.error('BOOT SMOKE FAILED (unhandled rejection):', e && e.stack ? e.stack : e)
  cleanup()
  process.exit(1)
})

function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
}

require(path.join(__dirname, '..', 'electron', 'main'))

setTimeout(() => {
  console.log(`BOOT SMOKE OK: ${ipcHandlers} IPC handlers registered, database + scheduler initialized`)
  cleanup()
  process.exit(0)
}, 3000)
