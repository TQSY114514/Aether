// ───────────────────────────────────────────────────────────────────────────
// toolLoop/scheduler.js — Step Sequencer & State Transition Machine.
//
// Manages life-cycle states of an agent execution turn:
//   INIT ──► PLAN ──► ACT ──► OBSERVE ──► VERIFY ──► COMPLETE / ERROR
// ───────────────────────────────────────────────────────────────────────────

const LoopPhase = {
  INIT: 'init',
  PLAN: 'plan',
  ACT: 'act',
  OBSERVE: 'observe',
  VERIFY: 'verify',
  COMPLETE: 'complete',
  ERROR: 'error',
}

class StepScheduler {
  /**
   * @param {object} [options]
   * @param {number} [options.maxIterations=25]
   * @param {boolean} [options.planningMode=false]
   */
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 25
    this.planningMode = options.planningMode || false
  }

  /**
   * Initialize a fresh execution state.
   */
  createInitialState(userMessage = '') {
    return {
      phase: this.planningMode ? LoopPhase.PLAN : LoopPhase.ACT,
      depth: 0,
      userMessage,
      toolCallsPending: [],
      toolResults: [],
      verificationNeeded: false,
      isDone: false,
      finalResult: null,
      error: null,
    }
  }

  /**
   * Compute the next state given an incoming execution event.
   * @param {object} state - Current state
   * @param {object} event - Incoming event { type, payload }
   * @returns {object} Next state
   */
  step(state, event) {
    if (state.isDone) return state

    const { type, payload } = event

    switch (type) {
      case 'LLM_RESPONSE': {
        const msg = payload
        const toolCalls = msg?.tool_calls || []

        if (toolCalls.length > 0) {
          return {
            ...state,
            phase: LoopPhase.ACT,
            toolCallsPending: toolCalls,
            depth: state.depth + 1,
          }
        }

        // No tool calls means the model produced its final answer
        return {
          ...state,
          phase: state.verificationNeeded ? LoopPhase.VERIFY : LoopPhase.COMPLETE,
          isDone: !state.verificationNeeded,
          finalResult: msg?.content || '',
          depth: state.depth + 1,
        }
      }

      case 'TOOL_RESULTS_APPLIED': {
        return {
          ...state,
          phase: LoopPhase.OBSERVE,
          toolCallsPending: [],
          toolResults: payload.results || [],
          verificationNeeded: payload.verificationNeeded || state.verificationNeeded,
        }
      }

      case 'VERIFICATION_PASSED': {
        return {
          ...state,
          phase: LoopPhase.COMPLETE,
          isDone: true,
          verificationNeeded: false,
        }
      }

      case 'VERIFICATION_FAILED': {
        // Verification detected issues: transition back to ACT with repair instructions
        return {
          ...state,
          phase: LoopPhase.ACT,
          isDone: false,
          verificationNeeded: false,
        }
      }

      case 'BUDGET_EXHAUSTED': {
        return {
          ...state,
          phase: LoopPhase.COMPLETE,
          isDone: true,
          error: 'budget_exhausted',
        }
      }

      case 'ABORTED': {
        return {
          ...state,
          phase: LoopPhase.ERROR,
          isDone: true,
          error: 'aborted',
        }
      }

      default:
        return state
    }
  }
}

module.exports = {
  LoopPhase,
  StepScheduler,
}
