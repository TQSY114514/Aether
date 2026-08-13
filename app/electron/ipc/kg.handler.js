const knowledgeGraph = require('../llm/knowledgeGraph')

function registerKgHandlers(ipcMain, db) {
  ipcMain.handle('kg:graph', (_e, opts) => {
    const data = knowledgeGraph.getGraphData(db, opts || {})
    return { nodes: data.nodes || [], edges: data.edges || [] }
  })

  // Desktop polish #7: manual KG node editing (delete/rename with edge cleanup).
  ipcMain.handle('kg:delete-node', (_e, entity) => knowledgeGraph.deleteNode(db, entity))
  ipcMain.handle('kg:rename-node', (_e, entity, newEntity) => knowledgeGraph.renameNode(db, entity, newEntity))
}

module.exports = { registerKgHandlers }