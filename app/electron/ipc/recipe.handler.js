const recipes = require('../recipes/registry')

/**
 * Register recipe IPC handlers (recipe:list, recipe:get).
 * @param {import('electron').IpcMain} ipcMain
 */
function registerRecipeHandlers(ipcMain) {
  ipcMain.handle('recipe:list', (_e, workspaceRoot) => recipes.listRecipes(workspaceRoot))
  ipcMain.handle('recipe:get', (_e, id, workspaceRoot) => recipes.getRecipe(id, workspaceRoot))
}

module.exports = { registerRecipeHandlers }
