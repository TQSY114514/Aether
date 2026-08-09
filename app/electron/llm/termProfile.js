// ─────────────────────────────────────────────────────────────────────────────
// termProfile.js — Windows Terminal profile 引导（todo 18，Electron-free）
// buildTermProfile 生成 AetherAI TUI profile（深/浅两套配色）；
// updateSettingsJson 合并进 WT settings.json（profiles.list 按名去重 + schemes）。
// CLI `aether --setup-term [--term-settings <path>]` 调用。
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PROFILE_NAME = 'AetherAI TUI'
const SCHEME_DARK = 'AetherAI Dark'
const SCHEME_LIGHT = 'AetherAI Light'

const DARK_SCHEME = {
  name: SCHEME_DARK,
  background: '#0D1117',
  foreground: '#E6EDF3',
  cursorColor: '#58A6FF',
  selectionBackground: '#1F6FEB',
  black: '#0D1117', red: '#FF7B72', green: '#3FB950', yellow: '#D29922',
  blue: '#58A6FF', purple: '#BC8CFF', cyan: '#39C5CF', white: '#E6EDF3',
  brightBlack: '#484F58', brightRed: '#FFA198', brightGreen: '#56D364', brightYellow: '#E3B341',
  brightBlue: '#79C0FF', brightPurple: '#D2A8FF', brightCyan: '#56D4DD', brightWhite: '#FFFFFF',
}

const LIGHT_SCHEME = {
  name: SCHEME_LIGHT,
  background: '#F6F8FA',
  foreground: '#1F2328',
  cursorColor: '#0969DA',
  selectionBackground: '#AFB8C1',
  black: '#1F2328', red: '#CF222E', green: '#1A7F37', yellow: '#9A6700',
  blue: '#0969DA', purple: '#8250DF', cyan: '#1B7C83', white: '#6E7781',
  brightBlack: '#6E7781', brightRed: '#CF222E', brightGreen: '#1A7F37', brightYellow: '#9A6700',
  brightBlue: '#0969DA', brightPurple: '#8250DF', brightCyan: '#1B7C83', brightWhite: '#FFFFFF',
}

/**
 * 生成 AetherAI WT profile 片段。
 * @param {{ ps1Path?: string }} [opts]
 * @returns {{ profiles: object[], schemes: object[] }}
 */
function buildTermProfile({ ps1Path } = {}) {
  const p = ps1Path || path.join(__dirname, '..', '..', '..', 'resources', 'term', 'aether.ps1')
  const commandline = `powershell.exe -NoExit -ExecutionPolicy Bypass -File "${p}"`
  return {
    profiles: [{
      name: PROFILE_NAME,
      commandline,
      colorScheme: SCHEME_DARK,
      startingDirectory: '%USERPROFILE%',
      source: 'aether',
      icon: path.join(__dirname, '..', '..', '..', 'resources', 'icon.png'),
    }],
    schemes: [DARK_SCHEME, LIGHT_SCHEME],
  }
}

/** Windows Terminal 默认 settings.json 路径。 */
function defaultWindowsTerminalSettingsPath() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json',
  )
}

/**
 * 合并 profile 片段进 WT settings.json（幂等，按 profile.name 去重）。
 * @param {string} settingsPath
 * @param {{ profiles?: object[], schemes?: object[] }} fragment
 * @returns {{ ok: boolean, path: string, profiles: number, error?: string }}
 */
function updateSettingsJson(settingsPath, fragment = {}) {
  try {
    let settings = {}
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { settings = {} }
    }
    settings.profiles = settings.profiles || {}
    settings.profiles.list = Array.isArray(settings.profiles.list) ? settings.profiles.list : []
    settings.schemes = Array.isArray(settings.schemes) ? settings.schemes : []

    for (const prof of fragment.profiles || []) {
      const idx = settings.profiles.list.findIndex((p) => p.name === prof.name)
      if (idx >= 0) settings.profiles.list[idx] = { ...settings.profiles.list[idx], ...prof }
      else settings.profiles.list.push(prof)
    }
    for (const sc of fragment.schemes || []) {
      if (!settings.schemes.some((s) => s.name === sc.name)) settings.schemes.push(sc)
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return { ok: true, path: settingsPath, profiles: settings.profiles.list.length }
  } catch (e) {
    return { ok: false, path: settingsPath, profiles: 0, error: e && e.message ? e.message : String(e) }
  }
}

module.exports = { buildTermProfile, updateSettingsJson, defaultWindowsTerminalSettingsPath, PROFILE_NAME, SCHEME_DARK, SCHEME_LIGHT }
