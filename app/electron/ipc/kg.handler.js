const knowledgeGraph = require('../llm/knowledgeGraph')

function registerKgHandlers(ipcMain, db) {
  ipcMain.handle('kg:graph', (_e, opts) => {
    const data = knowledgeGraph.getGraphData(db, opts || {})
    return { nodes: data.nodes || [], edges: data.edges || [] }
  })

  // Desktop polish #7 & DeepWiki (P2-1): manual KG node & relation editing
  ipcMain.handle('kg:delete-node', (_e, entity) => knowledgeGraph.deleteNode(db, entity))
  ipcMain.handle('kg:rename-node', (_e, entity, newEntity) => knowledgeGraph.renameNode(db, entity, newEntity))
  ipcMain.handle('kg:add-relation', (_e, from, to, relation, confidence) => knowledgeGraph.addRelation(db, from, to, relation, confidence))
  ipcMain.handle('kg:delete-relation', (_e, from, to, relation) => knowledgeGraph.deleteRelation(db, from, to, relation))
  ipcMain.handle('kg:wiki-article', (_e, entity) => knowledgeGraph.getWikiArticle(db, entity))
}

module.exports = { registerKgHandlers }