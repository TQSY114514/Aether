// ───────────────────────────────────────────────────────────────────────────
// Repo Map facade — unified interface delegating to context/repoMap.js.
// Incorporates AST signature extraction, dependency graph PageRank centrality,
// and token-budget binary pruning.
// ───────────────────────────────────────────────────────────────────────────

const { generateRepoMap, buildRepoMapText, buildRepoMapMessage, computeBudgetForRequest } = require('../context/repoMap')

/**
 * Generate structural repo map lines for the specified directory.
 * @param {string} dir - Directory path.
 * @param {object} [options] - Options (maxTokens, maxLines, query).
 * @returns {Promise<string[]>}
 */
async function buildRepoMap(dir, options = {}) {
  const root = dir || process.cwd()
  const map = await generateRepoMap(root, options)
  const text = buildRepoMapText(map, options)
  return text ? text.split('\n') : []
}

module.exports = {
  buildRepoMap,
  generateRepoMap,
  buildRepoMapText,
  buildRepoMapMessage,
  computeBudgetForRequest,
}
