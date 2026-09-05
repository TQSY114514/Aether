const recipes = require('../recipes/registry')

function registerRecipeHandlers(ipcMain) {
  ipcMain.handle('recipe:list', (_e, workspaceRoot) => recipes.listRecipes(workspaceRoot))
  ipcMain.handle('recipe:get', (_e, id, workspaceRoot) => recipes.getRecipe(id, workspaceRoot))
}

module.exports = { registerRecipeHandlers }
