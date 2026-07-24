const skills = require('../llm/skills')
const hooks = require('../llm/hooks')
const habitLearner = require('../llm/habitLearner')

function registerSkillsHandlers(ipcMain) {
  // List discovered skills (name + description + path).
  ipcMain.handle('skills:list', () => {
    return skills.getSkills().map(s => ({ name: s.name, description: s.description, filePath: s.filePath }))
  })

  // Rescan the skill roots and return the new count.
  ipcMain.handle('skills:rescan', () => {
    const count = skills.scanSkills()
    return { success: true, count }
  })

  // ─── Slash commands ──────────────────────────────────────────────────────
  ipcMain.handle('commands:list', () => {
    return skills.getCommands().map(c => ({ id: c.id, name: c.name, description: c.description, prompt: c.prompt }))
  })
  ipcMain.handle('commands:rescan', () => {
    const count = skills.rescan()
    return { success: true, count }
  })

  // ─── Hooks (Claude Code-style extensibility) ──────────────────────────────
  ipcMain.handle('hooks:scan', () => {
    const count = hooks.scanHooks()
    return { success: true, count }
  })
  ipcMain.handle('hooks:list', () => {
    return hooks.listHooks()
  })
}

module.exports = { registerSkillsHandlers }
