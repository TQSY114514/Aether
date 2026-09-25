// ───────────────────────────────────────────────────────────────────────────
// toolLoop/stateMachine.js — State Machine Event Loop Driver.
//
// Drives the agent tool loop using explicit state transitions:
//   while (!state.isDone) {
//     const event = await executeCurrentPhase(state)
//     state = scheduler.step(state, event)
//   }
// ───────────────────────────────────────────────────────────────────────────

const { LoopPhase, StepScheduler } = require('./scheduler')
const { RuntimeDriver } = require('./runtime')
const log = require('../../logger')

const LoopStates = {
  IDLE: LoopPhase.INIT,
  PLANNING: LoopPhase.PLAN,
  EXECUTING_TOOLS: LoopPhase.ACT,
  OBSERVING: LoopPhase.OBSERVE,
  VERIFYING: LoopPhase.VERIFY,
  COMPLETED: LoopPhase.COMPLETE,
  FAILED: LoopPhase.ERROR,
  ...LoopPhase,
}

class ToolStateMachine {
  /**
   * @param {object} options
   * @param {RuntimeDriver} [options.runtime]
   * @param {StepScheduler} [options.scheduler]
   * @param {object} [options.permission]
   * @param {object} [options.options]
   */
  constructor(options = {}) {
    this.runtime = options.runtime
    this.scheduler = options.scheduler || new StepScheduler(options.options)
    this.permission = options.permission
    this.options = options.options || {}
    this.sessionId = options.sessionId || null
    this.state = this.scheduler.createInitialState(options.userMessage || '')
    this.history = []
  }

  /**
   * Transition the state machine to a new phase and advance scheduler state.
   * @param {string} nextPhase
   * @param {object} [meta]
   * @returns {object} Updated state
   */
  transition(nextPhase, meta = {}) {
    const prevPhase = this.state ? this.state.phase : LoopPhase.INIT
    const targetPhase = nextPhase || LoopPhase.PLAN
    if (targetPhase === LoopStates.EXECUTING_TOOLS) {
      this.state = {
        ...this.state,
        phase: LoopPhase.ACT,
        depth: typeof meta.step === 'number' ? meta.step : (this.state.depth + 1),
      }
    } else if (targetPhase === LoopStates.VERIFYING) {
      this.state = {
        ...this.state,
        phase: LoopPhase.VERIFY,
        verificationNeeded: true,
      }
    } else if (targetPhase === LoopStates.COMPLETED) {
      this.state = this.scheduler.step(
        { ...this.state, verificationNeeded: false },
        { type: 'VERIFICATION_PASSED', payload: meta }
      )
    } else if (targetPhase === LoopStates.FAILED) {
      const reason = meta.finalStatus || meta.error || 'aborted'
      if (reason === 'budget_exhausted') {
        const next = this.scheduler.step(this.state, { type: 'BUDGET_EXHAUSTED', payload: meta })
        this.state = { ...next, phase: LoopPhase.ERROR, error: 'budget_exhausted' }
      } else {
        this.state = this.scheduler.step(
          this.state,
          { type: 'ABORTED', payload: { error: reason } }
        )
      }
    } else {
      this.state = {
        ...this.state,
        phase: targetPhase,
      }
    }
    this.history.push({
      from: prevPhase,
      to: this.state.phase,
      meta,
      ts: Date.now(),
    })
    return this.state
  }

  /**
   * Initialize and run the state machine until termination.
   * @param {Array<object>} initialMessages
   * @param {Array<object>} toolPayload
   * @param {Function} [onStep]
   * @returns {Promise<object>} Final execution summary
   */
  async run({ messages, toolPayload = [], onStep } = {}) {
    let state = this.scheduler.createInitialState(
      messages[messages.length - 1]?.content || ''
    )

    const convo = messages.slice()

    while (!state.isDone) {
      onStep?.(state)

      try {
        if (state.phase === LoopPhase.ACT || state.phase === LoopPhase.PLAN || state.phase === LoopPhase.INIT) {
          const resp = await this.runtime.next(convo, toolPayload)
          convo.push(resp)
          state = this.scheduler.step(state, { type: 'LLM_RESPONSE', payload: resp })
        } else if (state.phase === LoopPhase.COMPLETE || state.phase === LoopPhase.ERROR) {
          break
        }
      } catch (err) {
        log.warn('ToolStateMachine: iteration failed:', err.message)
        state = this.scheduler.step(state, { type: 'ABORTED', payload: { error: err.message } })
        break
      }
    }

    this.state = state
    return {
      state,
      messages: convo,
      result: state.finalResult,
      isDone: state.isDone,
      error: state.error,
    }
  }
}

module.exports = {
  ToolStateMachine,
  LoopPhase,
  LoopStates,
  StepScheduler,
}
