// ───────────────────────────────────────────────────────────────────────────
// A2A Protocol (Agent-to-Agent)
// 
// Defines the standard message payloads for inter-agent communication,
// allowing external agents (connecting via Local Gateway) to seamlessly
// delegate tasks, share memory, or interrupt ongoing Aether agent loops.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Validate an incoming A2A message to ensure it follows the protocol.
 * @param {Object} msg 
 * @returns {boolean}
 */
function isValidA2AMessage(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (msg.protocol !== 'a2a-v1') return false
  if (!['task_delegate', 'state_sync', 'interrupt'].includes(msg.type)) return false
  if (!msg.sender || !msg.payload) return false
  return true
}

/**
 * Create an A2A Task Delegation request.
 * @param {string} sender - The ID or name of the sending agent
 * @param {string} instruction - The task instruction
 * @param {Object} [context] - Shared context/memory
 * @returns {Object}
 */
function createDelegation(sender, instruction, context = {}) {
  return {
    protocol: 'a2a-v1',
    type: 'task_delegate',
    sender,
    payload: {
      instruction,
      context
    },
    timestamp: Date.now()
  }
}

/**
 * Create an A2A State Sync message (e.g., sharing updated memory or world state).
 * @param {string} sender 
 * @param {Object} state - The current state to sync
 * @returns {Object}
 */
function createStateSync(sender, state) {
  return {
    protocol: 'a2a-v1',
    type: 'state_sync',
    sender,
    payload: {
      state
    },
    timestamp: Date.now()
  }
}

module.exports = {
  isValidA2AMessage,
  createDelegation,
  createStateSync
}
