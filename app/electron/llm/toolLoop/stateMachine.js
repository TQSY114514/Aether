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

class ToolStateMachine {
  /**
   * @param {object} options
   * @param {RuntimeDriver} options.runtime
   * @param {StepScheduler} [options.scheduler]
   * @param {object} [options.permission]
   * @param {object} [options.options]
   */
  constructor(options = {}) {
    this.runtime = options.runtime
    this.scheduler = options.scheduler || new StepScheduler(options.options)
    this.permission = options.permission
    this.options = options.options || {}
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
  StepScheduler,
}
