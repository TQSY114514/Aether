import { describe, expect, it } from "vitest"
import { useStore } from "@/store"

describe("store smoke", () => {
  it("has the expected initial state", () => {
    const s = useStore.getState()

    expect(s.chatMode).toBe("normal")
    expect(s.sending).toBe(false)
    expect(Array.isArray(s.sessions)).toBe(true)
    expect(s.currentView).toBeTruthy()
  })
})