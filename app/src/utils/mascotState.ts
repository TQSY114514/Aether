/** Pure state resolver for the optional sidebar pixel mascot companion. */

export type MascotState = 'ready' | 'working' | 'sleeping' | 'alert'

export interface MascotStateInput {
  needsInput: boolean
  isWorking: boolean
  isIdle: boolean
  poked?: boolean
}

export const MASCOT_IDLE_TIMEOUT_MS = 90_000

/** Resolve the active mascot sprite state with deterministic priority. */
export function resolveMascotState(input: MascotStateInput): MascotState {
  if (input.needsInput) return 'alert'
  if (input.isWorking) return 'working'
  if (input.poked) return 'ready'
  if (input.isIdle) return 'sleeping'
  return 'ready'
}

/** Return the i18n key shown briefly when the user clicks the companion. */
export function getMascotPokeKey(state: MascotState): string {
  if (state === 'alert') return 'mascot.poke.alert'
  if (state === 'working') return 'mascot.poke.working'
  return 'mascot.poke.ready'
}
