// ─────────────────────────────────────────────────────────────────────────────
// electron/cli/io.js — headless CLI tiny IO helpers (W5-t32).
// Electron-free, CJS, pure enough to unit-test.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const fs = require('fs')

/**
 * Write the final agent answer to a file (utf8). Never throws — returns a
 * result so the CLI can turn failures into `error: ...` + exit 1.
 * @param {string} file
 * @param {string} text
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function writeLastMessage(file, text) {
  try {
    fs.writeFileSync(String(file), String(text == null ? '' : text), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

module.exports = { writeLastMessage }
