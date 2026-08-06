const { dialog, app } = require('electron')
const fs = require('fs')
const path = require('path')
const skills = require('../llm/skills')
const habitLearner = require('../llm/habitLearner')

// Recursively copy a skill directory into the user-global skills root.
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name)
    const d = path.join(dest, ent.name)
    if (ent.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function registerSkillsHandlers(ipcMain, db) {
  // List discovered skills — includes usage stats and metadata from frontmatter.
  ipcMain.handle('skills:list', () => {
    const usage = skills.getSkillUsage()
    return skills.getSkills().map(s => {
      const u = usage[s.name]
      return {
        name: s.name,
        description: s.description,
        filePath: s.filePath,
        metadata: s.metadata,
        usage: u ? { count: u.count, lastUsedAt: u.lastUsedAt } : { count: 0, lastUsedAt: null },
      }
    })
  })

  // Rescan the skill roots and return the new count.
  ipcMain.handle('skills:rescan', () => {
    const count = skills.scanSkills()
    return { success: true, count }
  })

  // Skill success rate stats.
  ipcMain.handle('skills:stats', () => db.getSkillStats())

  // Record a skill use result (called from toolLoop after use_skill runs).
  ipcMain.handle('skills:record', (_e, name, success) => {
    db.recordSkillResult(name, !!success)
    return { ok: true }
  })

  // Auto-draft a skill from usage patterns (user-initiated, not automatic).
  ipcMain.handle('skills:autoDraft', (_e, name, description) => {
    try {
      const body = skills.getSkillBody(name) || `# ${name}\n\nAuto-generated skill from usage patterns.`
      db.autoDraftSkill(name, body, description || `Auto-drafted: ${name}`)
      // Rescan to pick up the new draft.
      skills.rescan()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ─── Slash commands ──────────────────────────────────────────────────────

  // Skill lifecycle management (curator)
  ipcMain.handle('skills:getUsage', () => {
    try { return db.getSkillUsage() } catch { return [] }
  })
  ipcMain.handle('skills:updateState', (_e, name, state) => {
    db.updateSkillState(name, state); return { ok: true }
  })
  ipcMain.handle('skills:pin', (_e, name, pinned) => {
    db.pinSkill(name, pinned); return { ok: true }
  })

  // Import a skill directory selected by the user: copies <name>/SKILL.md into
  // the user-global skills root, then rescans so it becomes available.
  ipcMain.handle('skills:importDir', async () => {
    try {
      const res = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择要导入的技能目录' })
      if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true }
      const src = res.filePaths[0]
      const targetRoot = path.join(app.getPath('userData'), 'skills')
      fs.mkdirSync(targetRoot, { recursive: true })

      // The selected dir itself may be a skill (<dir>/SKILL.md) or contain
      // subdirectories each holding a SKILL.md.
      const candidates = []
      if (fs.existsSync(path.join(src, 'SKILL.md'))) candidates.push(src)
      else {
        let entries = []
        try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch {}
        for (const ent of entries) {
          if (ent.isDirectory() && !ent.name.startsWith('.')) candidates.push(path.join(src, ent.name))
        }
      }

      let copied = 0
      for (const c of candidates) {
        if (!fs.existsSync(path.join(c, 'SKILL.md'))) continue
        copyDir(c, path.join(targetRoot, path.basename(c)))
        copied++
      }
      if (copied) skills.scanSkills()
      return { ok: true, count: copied }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  ipcMain.handle('commands:list', () => {
    return skills.getCommands().map(c => ({ id: c.id, name: c.name, description: c.description, prompt: c.prompt }))
  })
  ipcMain.handle('commands:rescan', () => {
    const count = skills.rescan()
    return { success: true, count }
  })

  // ─── Hooks (Claude Code-style extensibility) ──────────────────────────────
}

module.exports = { registerSkillsHandlers }
