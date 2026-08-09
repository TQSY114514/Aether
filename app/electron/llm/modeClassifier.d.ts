// Type declarations for modeClassifier.js (CJS, Electron-free shared classifier).
// Imported by renderer code (TaskPanel) — this file lets tsc resolve the JS module.

export interface ClassifyAgentModeInput {
  prompt?: string
  toolNames?: string[]
  history?: unknown[]
}

export interface ClassifyAgentModeResult {
  mode: 'ask' | 'plan' | 'auto'
  reason: string
}

export declare function classifyAgentMode(
  input?: ClassifyAgentModeInput,
): ClassifyAgentModeResult
