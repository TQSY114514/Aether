import type { StateCreator } from "zustand"
import type { AppState } from "./types"
import { applyFontScale, applyLangDir, LANGS_CODES } from "./types"
import { setLangAsync, detectLang, type LangCode } from "@/utils/i18n"
import { applyTheme } from "@/utils/theme"
import log from "@/utils/logger"

let _autoThemeCleanup: (() => void) | null = null

const FALLBACK_TIMEOUT_DEFAULT = 30000

export const createSettingsSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  language: "en",
  theme: "light",
  fallbackTimeout: FALLBACK_TIMEOUT_DEFAULT,
  fontScale: 1,
  bubbleWidth: 85,
  defaultEffort: "off",
  defaultModelId: null,
  defaultPersonaId: null,
  maxTokens: 0,
  temperature: 0,
  topP: 0,
  systemPrefix: "",
  autoTitle: true,
  titleLanguage: "auto",
  titleModelId: null as number | null,
  backgroundImage: null,
  backgroundOpacity: 100,
  backgroundBlur: 0,
  modelRoutingPriority: "quality",
  autoCommitOnTestPass: false,
  agentWorkspace: "",
  memories: [],

  loadMemories: async () => {
    try {
      const entries = await window.electronAPI.memory.list()
      set({ memories: entries })
    } catch (e) { log.warn("loadMemories failed:", e) }
  },

  loadSettings: async () => {
    try {
      const s = await window.electronAPI.settings.getAll()
      const saved = s.language as LangCode | undefined
      const lang: LangCode = saved && LANGS_CODES.includes(saved) ? saved : detectLang()
      const theme = s.theme || "light"
      const timeout = parseInt(s.fallback_timeout_ms || String(FALLBACK_TIMEOUT_DEFAULT), 10)
      const bgOpacity = parseInt(s.backgroundOpacity ?? "100", 10)
      const bgBlur = parseInt(s.backgroundBlur ?? "0", 10)
      const fontScale = parseFloat(s.fontScale ?? "1")
      const bubbleWidth = parseInt(s.bubbleWidth ?? "85", 10)
      const defaultEffort = (s.defaultEffort ?? "off") as "off" | "low" | "medium" | "high"
      const defaultModelId = parseInt(s.defaultModelId ?? "0", 10) || null
      const defaultPersonaId = parseInt(s.defaultPersonaId ?? "0", 10) || null
      const maxTokens = parseInt(s.maxTokens ?? "0", 10)
      const temperature = parseFloat(s.temperature ?? "0")
      const topP = parseFloat(s.topP ?? "0")
      const systemPrefix = s.systemPrefix ?? ""
      const autoTitle = (s.autoTitle ?? "1") === "1"
      const titleLanguage = s.titleLanguage ?? "auto"
      const titleModelId = parseInt(s.titleModelId ?? "0", 10) || null
      const modelRoutingPriority = ["quality", "speed", "cost"].includes(s.modelRoutingPriority as string) ? (s.modelRoutingPriority as "quality" | "speed" | "cost") : "quality"
      const autoCommitOnTestPass = (s.autoCommitOnTestPass ?? "0") === "1"
      await setLangAsync(lang)
      applyTheme(theme)
      applyFontScale(fontScale)
      applyLangDir(lang)
      let seenHints: string[] = []
      try { seenHints = JSON.parse(s.seen_hints || "[]") } catch (e) { log.warn("parse seen_hints failed:", e) }
      set({ language: lang, theme, fallbackTimeout: timeout, fontScale, bubbleWidth, defaultEffort, defaultModelId, defaultPersonaId, maxTokens, temperature, topP, systemPrefix, autoTitle, titleLanguage, titleModelId, backgroundImage: null, backgroundOpacity: bgOpacity, backgroundBlur: bgBlur, effortLevel: defaultEffort, seenHints, modelRoutingPriority, autoCommitOnTestPass })
    } catch (e) { log.warn("loadSettings failed:", e) }
  },

  setLanguage: async (lang) => {
    try {
      await window.electronAPI.settings.set("language", lang)
      await setLangAsync(lang)
    } catch (e) {
      log.warn("setLanguage failed:", e)
    }
    applyLangDir(lang)
    set({ language: lang })
  },

  setTheme: async (theme) => {
    await window.electronAPI.settings.set("theme", theme)
    if (_autoThemeCleanup) { _autoThemeCleanup(); _autoThemeCleanup = null }
    applyTheme(theme, get().backgroundImage !== null, (fn) => { _autoThemeCleanup = fn })
    set({ theme })
  },

  setFallbackTimeout: async (ms) => {
    await window.electronAPI.settings.set("fallback_timeout_ms", String(ms))
    set({ fallbackTimeout: ms })
  },

  setFontScale: async (v) => {
    await window.electronAPI.settings.set("fontScale", String(v))
    applyFontScale(v)
    set({ fontScale: v })
  },

  setBubbleWidth: async (v) => {
    await window.electronAPI.settings.set("bubbleWidth", String(v))
    set({ bubbleWidth: v })
  },

  setDefaultEffort: async (v) => {
    await window.electronAPI.settings.set("defaultEffort", v)
    set({ defaultEffort: v, effortLevel: v })
  },

  setDefaultModel: async (v) => {
    await window.electronAPI.settings.set("defaultModelId", String(v ?? ""))
    set({ defaultModelId: v })
  },

  setDefaultPersona: async (v) => {
    await window.electronAPI.settings.set("defaultPersonaId", String(v ?? ""))
    set({ defaultPersonaId: v })
  },

  setMaxTokens:   async (v) => { await window.electronAPI.settings.set("maxTokens", String(v)); set({ maxTokens: v }) },
  setTemperature: async (v) => { await window.electronAPI.settings.set("temperature", String(v)); set({ temperature: v }) },
  setTopP:        async (v) => { await window.electronAPI.settings.set("topP", String(v)); set({ topP: v }) },
  setSystemPrefix:async (v) => { await window.electronAPI.settings.set("systemPrefix", v); set({ systemPrefix: v }) },
  setTitleLanguage:async (v) => { await window.electronAPI.settings.set("titleLanguage", v); set({ titleLanguage: v }) },
  setTitleModel: async (v) => { await window.electronAPI.settings.set("titleModelId", String(v ?? "")); set({ titleModelId: v }) },
  setBackgroundOpacity: async (v) => { await window.electronAPI.settings.set("backgroundOpacity", String(v)); set({ backgroundOpacity: v }) },
  setBackgroundBlur: async (v) => { await window.electronAPI.settings.set("backgroundBlur", String(v)); set({ backgroundBlur: v }) },
  setAutoTitle: async (v) => { await window.electronAPI.settings.set("autoTitle", v ? "1" : "0"); set({ autoTitle: v }) },

  setBackgroundImage: async (dataUrl) => {
    await window.electronAPI.background.set(dataUrl)
    applyTheme(get().theme, dataUrl !== null)
    set({ backgroundImage: dataUrl })
  },

  setModelRoutingPriority: async (v) => {
    await window.electronAPI.settings.set("modelRoutingPriority", v)
    set({ modelRoutingPriority: v })
  },

  setAutoCommitOnTestPass: async (v) => {
    await window.electronAPI.settings.set("autoCommitOnTestPass", v ? "1" : "0")
    set({ autoCommitOnTestPass: v })
  },

  setAgentWorkspace: async (dir: string) => {
    try { await window.electronAPI.agent.setWorkspace({ dir }) } catch {}
    set({ agentWorkspace: dir })
  },
})