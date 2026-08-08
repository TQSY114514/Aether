const knowledgeGraph = require('../llm/knowledgeGraph')

function registerKgHandlers(ipcMain, db) {
  ipcMain.handle('kg:graph', (_e, opts) => {
    const data = knowledgeGraph.getGraphData(db, opts || {})
    return { nodes: data.nodes || [], edges: data.edges || [] }
  })
}

module.exports = { registerKgHandlers }