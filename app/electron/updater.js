// ───────────────────────────────────────────────────────────────────────────
// Auto-update via electron-updater (GitHub Releases provider).
//
// Encapsulates electron-updater so main.js stays clean. On a packaged build it
// checks the latest GitHub Release for a newer version, downloads it in the
// background, and on user confirmation quits+installs. In dev mode it's a
// no-op (electron-updater detects unpackaged apps and skips).
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

autoUpdater.autoDownload = true            // download as soon as an update is found
autoUpdater.autoInstallOnAppQuit = true    // install on next quit if not confirmed in-UI
autoUpdater.allowDowngrade = false

let updateInfo = null                       // { version, releaseNotes, releaseDate } when available
let downloaded = false
let getWebContents = () => null

function init(getWc) {
  getWebContents = getWc

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err)
  })
  autoUpdater.on('update-available', (info) => {
    updateInfo = info
    console.log('[updater] update available:', info.version)
    getWebContents()?.send('updater:update-available', { version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] up to date:', info.version)
    getWebContents()?.send('updater:up-to-date', { version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    getWebContents()?.send('updater:progress', { percent: p.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    updateInfo = info
    console.log('[updater] downloaded:', info.version)
    getWebContents()?.send('updater:update-downloaded', { version: info.version })
  })
}

// Manual check (from the Settings "Check for updates" button). Returns a snapshot
// the renderer can render immediately; richer status arrives via the events above.
function check() {
  return autoUpdater.checkForUpdates()
    .then(() => ({ currentVersion: autoUpdater.currentVersion, updateInfo, downloaded }))
    .catch((e) => ({ error: e?.message || String(e) }))
}

// Quit and install a downloaded update. Returns false if nothing is downloaded.
function quitAndInstall() {
  if (!downloaded) return false
  autoUpdater.quitAndInstall(false, true)
  return true
}

function registerHandlers() {
  ipcMain.handle('updater:check', () => check())
  ipcMain.handle('updater:install', () => quitAndInstall())
  ipcMain.handle('updater:status', () => ({ currentVersion: autoUpdater.currentVersion, updateInfo, downloaded }))
}

module.exports = { init, check, quitAndInstall, registerHandlers, autoUpdater }
