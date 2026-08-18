// ───────────────────────────────────────────────────────────────────────────
// Auto-update via electron-updater (GitHub Releases provider).
//
// Encapsulates electron-updater so main.js stays clean. On a packaged build it
// checks the latest GitHub Release for a newer version; downloading and
// installing are user-triggered from the Settings page (H7) — no silent
// background download or install-on-quit. In dev mode it's a no-op
// (electron-updater detects unpackaged apps and skips).
//
// UNSIGNED-BUILD HONESTY: electron-updater works for unsigned Windows NSIS
// builds from a public repo — the update downloads and installs. The freshly
// replaced exe WILL show a SmartScreen "unknown publisher" warning on first
// launch. That is expected and acceptable for a solo-dev unsigned app; the
// update itself completes fine. No token is needed client-side for a public
// repo — latest.yml + assets are fetched anonymously.
// ───────────────────────────────────────────────────────────────────────────

const { autoUpdater } = require('electron-updater')
const { ipcMain } = require('electron')
const log = require('./logger')

// H7 (2026-08 audit): never download or install silently. Downloads only
// start from the Settings page "check for updates" button (an explicit user
// action → updater:check IPC) and installation only via the explicit
// "restart & install" button (updater:install). The startup check() in
// main.js only *notifies* — it never downloads.
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.allowDowngrade = false

let updateInfo = null                       // { version, releaseNotes, releaseDate } when available
let downloaded = false
let getWebContents = () => null

function init(getWc) {
  getWebContents = getWc

  autoUpdater.on('error', (err) => {
    log.error('error:', err?.message || err)
    getWebContents()?.send('updater:error', { message: err?.message || String(err) })
  })
  autoUpdater.on('update-available', (info) => {
    updateInfo = info
    log.info('update available:', info.version)
    getWebContents()?.send('updater:update-available', { version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    log.info('up to date:', info.version)
    getWebContents()?.send('updater:up-to-date', { version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    getWebContents()?.send('updater:progress', { percent: p.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    updateInfo = info
    log.info('downloaded:', info.version)
    getWebContents()?.send('updater:update-downloaded', { version: info.version })
  })
}

// Manual check (from the Settings "Check for updates" button). Returns a snapshot
// the renderer can render immediately; richer status arrives via the events above.
// Check-only: with autoDownload=false this never downloads. Used by the startup
// call in main.js — finding an update just notifies the renderer.
function check() {
  return autoUpdater.checkForUpdates()
    .then(() => ({ currentVersion: autoUpdater.currentVersion, updateInfo, downloaded }))
    .catch((e) => ({ error: e?.message || String(e) }))
}

// Settings-page flow (H7): the user clicked "check for updates", which is the
// explicit trigger to fetch — if an update is available, start the download.
// Progress/arrival is reported via the existing updater:progress and
// updater:update-downloaded events; installation stays behind the explicit
// updater:install button.
async function checkAndDownload() {
  const r = await check()
  if (!r.error && updateInfo && !downloaded) {
    try { autoUpdater.downloadUpdate().catch(() => {}) } catch {}
  }
  return r
}

// Quit and install a downloaded update. Returns false if nothing is downloaded.
function quitAndInstall() {
  if (!downloaded) return false
  autoUpdater.quitAndInstall(false, true)
  return true
}

function registerHandlers() {
  ipcMain.handle('updater:check', () => checkAndDownload())
  ipcMain.handle('updater:install', () => quitAndInstall())
  ipcMain.handle('updater:status', () => ({ currentVersion: autoUpdater.currentVersion, updateInfo, downloaded }))
}

module.exports = { init, check, quitAndInstall, registerHandlers, autoUpdater }
