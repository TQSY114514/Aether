const skills = require('../llm/skills')

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
}

module.exports = { registerSkillsHandlers }
