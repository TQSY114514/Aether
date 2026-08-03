const skills = require('../llm/skills')
const habitLearner = require('../llm/habitLearner')

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
