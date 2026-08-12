// ─────────────────────────────────────────────────────────────────────────────
// electron/cli/config.js — headless CLI config file + env defaults (W5-t30).
// Electron-free, CJS.
//
// Config file: ~/.config/aether/config.json (same directory convention as the
// TUI keybindings.json; $AETHER_CONFIG overrides the path). Schema:
//   { "model": "...", "mode": "auto|plan|ask|yolo", "workspace": "path",
//     "maxIterations": number }
// Unknown keys are ignored (documented); malformed JSON warns (caller prints
// the warning to stderr) and falls back to defaults — never crashes.
//
// Env vars: AETHER_MODEL, AETHER_MODE, AETHER_WORKSPACE, AETHER_MAX_ITERATIONS.
//
// Precedence (dead simple): CLI flag > env > config file > DB default.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')

const CONFIG_MODES = ['auto', 'plan', 'ask', 'yolo']

/**
 * Default config file location — mirrors the TUI keybindings convention
 * (~/.config/aether/keybindings.json) for cross-platform consistency.
 * @returns {string}
 */
function configPath() {
  return path.join(os.homedir(), '.config', 'aether', 'config.json')
}

/**
 * Read + parse the config file.
 * @param {string} p  absolute path
 * @returns {object|null}  parsed object; null when the file does not exist;
 *   { error: string } when unreadable or malformed (caller warns + uses {}).
 */
function loadConfigFile(p) {
  if (!p) return null
  let raw = null
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    if (e && e.code === 'ENOENT') return null
    return { error: `cannot read config file: ${e && e.message ? e.message : String(e)}` }
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { error: `malformed JSON in config file: ${e && e.message ? e.message : String(e)}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'config file root must be a JSON object' }
  }
  return parsed
}

const MODE_LIKE_KEYS = ['mode']

/**
 * Resolve effective defaults for model/mode/workspace/max-iterations.
 * Precedence: opts (CLI flags) > env > config. Undefined anywhere → the key
 * is left undefined so the caller falls through to the DB default.
 *
 * workspace from env/config is resolved to an absolute path against `cwd`
 * when relative (flag values keep the caller's own resolution).
 * Invalid mode / non-numeric maxIterations values are ignored (documented).
 *
 * @param {{opts?: object, env?: object, config?: object, cwd?: string}} input
 * @returns {{model?: string, mode?: string, workspace?: string, maxIterations?: number}}
 */
function resolveDefaults({ opts = {}, env = {}, config = {}, cwd = process.cwd() } = {}) {
  const out = {}

  out.model = opts.model !== undefined ? opts.model
    : env.AETHER_MODEL !== undefined ? env.AETHER_MODEL
      : config.model !== undefined ? config.model
        : undefined
  if (out.model !== undefined) out.model = String(out.model)

  const mode = opts.mode !== undefined ? opts.mode
    : env.AETHER_MODE !== undefined ? env.AETHER_MODE
      : config.mode
  if (mode !== undefined && CONFIG_MODES.includes(String(mode))) out.mode = String(mode)

  const ws = opts.workspace !== undefined ? opts.workspace
    : env.AETHER_WORKSPACE !== undefined ? env.AETHER_WORKSPACE
      : config.workspace
  if (ws !== undefined && ws !== '') {
    out.workspace = path.isAbsolute(String(ws)) ? String(ws) : path.resolve(cwd, String(ws))
  }

  const mi = opts['max-iterations'] !== undefined ? opts['max-iterations']
    : env.AETHER_MAX_ITERATIONS !== undefined ? env.AETHER_MAX_ITERATIONS
      : config.maxIterations
  if (mi !== undefined && mi !== '' && Number.isFinite(Number(mi)) && Number(mi) >= 0) {
    out.maxIterations = Number(mi)
  }

  return out
}

module.exports = { configPath, loadConfigFile, resolveDefaults, CONFIG_MODES }
