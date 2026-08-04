import { create } from "zustand"
import type { AppState } from "./types"
import { createSessionSlice } from "./sessionSlice"
import { createProviderSlice } from "./providerSlice"
import { createPersonaSlice } from "./personaSlice"
import { createChatSlice } from "./chatSlice"
import { createArenaSlice } from "./arenaSlice"
import { createSettingsSlice } from "./settingsSlice"
import { createUiSlice } from "./uiSlice"
import { initStoreListeners } from "./listeners"

export const useStore = create<AppState>()((...args) => ({
  ...createSessionSlice(...args),
  ...createProviderSlice(...args),
  ...createPersonaSlice(...args),
  ...createChatSlice(...args),
  ...createArenaSlice(...args),
  ...createSettingsSlice(...args),
  ...createUiSlice(...args),
} as AppState))

// Initialize the listener bridge so module-level listeners can access the store.
initStoreListeners(useStore)

// Re-export types and helpers for consumers that import from "@/store".
export type { AppState, SessionConfig, TaskStatus, TaskInfo, TaskProgressType } from "./types"
export { taskApi, applyFontScale, applyLangDir, decodeDataUrlText, mergeTask, newTask, taskProgressText, LANGS_CODES } from "./types"
export { ensureAllListeners, ensureTaskListeners, ensureChunkListener } from "./listeners"