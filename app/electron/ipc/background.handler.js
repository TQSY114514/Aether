// Background image is stored as a file on disk rather than in the SQLite
// settings table. A multi-MB data URL in settings would balloon the DB and
// make getAllSettings() ship megabytes over IPC on every call.
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function bgPath() {
  return path.join(app.getPath('userData'), 'background.img')
}

function registerBackgroundHandlers(ipcMain) {
  // Save a data URL to disk. Returns true on success.
  ipcMain.handle('background:set', (_e, dataUrl) => {
    try {
      const p = bgPath()
      if (!dataUrl) {
        if (fs.existsSync(p)) fs.unlinkSync(p)
        return { success: true, hasImage: false }
      }
      // data URL looks like: data:image/png;base64,XXXX
      const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
      if (!m) return { success: false, error: 'invalid data url' }
      const buf = Buffer.from(m[2], 'base64')
      fs.writeFileSync(p, buf)
      // remember the mime alongside
      fs.writeFileSync(p + '.meta', m[1])
      return { success: true, hasImage: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Read the saved image back as a data URL (or null if none).
  ipcMain.handle('background:get', () => {
    try {
      const p = bgPath()
      if (!fs.existsSync(p)) return null
      const buf = fs.readFileSync(p)
      let mime = 'image/png'
      if (fs.existsSync(p + '.meta')) mime = fs.readFileSync(p + '.meta', 'utf8')
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
}

module.exports = { registerBackgroundHandlers }
