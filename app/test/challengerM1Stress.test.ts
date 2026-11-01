// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM1Stress.test.ts
//
// Empirical Challenger Stress & Dynamic Test Harness for Milestone 1 (M1)
// Adversarial verification of:
// 1. Option A session filtering logic under multi-project & unassigned conditions
// 2. projectScopeFilter toggling and complete restoration
// 3. activeProject === null safety and graceful default workspace state
// 4. Extreme project name lengths (>100 chars, unicode, emojis) and layout stability
// 5. Invariant property tests & fuzzing over 1,000 randomized session topologies
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'

const PLACEHOLDER_TITLES = new Set(['新会话', '新对话', 'New Chat'])

/**
 * Exact replica of the filtering logic from Sidebar.tsx:101-109
 */
function filterSidebarSessions({
  sessions,
  projectScopeFilter,
  activeProject,
  activeStreamingIds = '',
  searchQuery = '',
}: {
  sessions: Array<{
    id: number
    project_id?: number | null
    title: string | null
    last_message?: string
    pinned?: number
  }>
  projectScopeFilter: boolean
  activeProject: { id: number; name: string; root_path: string } | null
  activeStreamingIds?: string
  searchQuery?: string
}) {
  let list = sessions
  if (projectScopeFilter && activeProject) {
    list = list.filter((s) => s.project_id === activeProject.id)
  }
  const streamingSet = new Set(activeStreamingIds ? activeStreamingIds.split(',') : [])
  const withMessages = list.filter(
    (s) =>
      s.last_message ||
      (s.title && !PLACEHOLDER_TITLES.has(s.title)) ||
      streamingSet.has(String(s.id))
  )
  const lowerQuery = searchQuery.toLowerCase().trim()
  if (!lowerQuery) return withMessages
  return withMessages.filter((s) => (s.title || '').toLowerCase().includes(lowerQuery))
}

/**
 * Exact replica of projectSessionCount logic from WorkspaceHeader.tsx:95-98
 */
function getProjectSessionCount(
  sessions: Array<{ id: number; project_id?: number | null }>,
  activeProject: { id: number } | null
) {
  if (!activeProject) return sessions.length
  return sessions.filter((s) => s.project_id === activeProject.id).length
}

/**
 * Calculation logic from HoverMarquee.tsx:71-74
 */
function computeMarqueeMetrics(
  overflowPx: number,
  baseSpeedPxPerSec = 24,
  accelPerOverflowPx = 0.035
) {
  const effectiveSpeed = Math.min(42, baseSpeedPxPerSec + overflowPx * accelPerOverflowPx)
  const durationSec =
    overflowPx > 0
      ? Math.max(1.8, Math.min(14.0, overflowPx / Math.max(18, effectiveSpeed)))
      : 0.25
  return { effectiveSpeed, durationSec }
}

describe('Challenger M1: Adversarial & Dynamic Stress Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Option A Filtering under Multi-Project & Unassigned Sessions
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Option A Session Filtering Rigor', () => {
    const mockSessions = [
      { id: 1, project_id: 10, title: 'Project 10 Chat 1', last_message: 'hello' },
      { id: 2, project_id: 10, title: 'Project 10 Chat 2', last_message: 'world' },
      { id: 3, project_id: 20, title: 'Project 20 Chat 1', last_message: 'code' },
      { id: 4, project_id: null, title: 'Legacy Chat No Project', last_message: 'old' },
      { id: 5, project_id: undefined, title: 'Unassigned Chat', last_message: 'none' },
      { id: 6, project_id: 10, title: '新会话', last_message: '' }, // empty draft in project 10
      { id: 7, project_id: 10, title: '新会话', last_message: 'draft with message' },
      { id: 8, project_id: 20, title: '新对话', last_message: '' }, // empty draft in project 20
    ]

    const activeProject10 = { id: 10, name: 'Alpha Core', root_path: '/path/alpha' }
    const activeProject20 = { id: 20, name: 'Beta Lib', root_path: '/path/beta' }

    it('filters strictly to active project when projectScopeFilter is enabled', () => {
      const result = filterSidebarSessions({
        sessions: mockSessions,
        projectScopeFilter: true,
        activeProject: activeProject10,
      })

      // Should only include project 10 sessions that have messages or valid titles
      // session 1, 2, 7 (session 6 is excluded as empty placeholder title)
      const ids = result.map((s) => s.id)
      expect(ids).toEqual([1, 2, 7])
      expect(result.every((s) => s.project_id === 10)).toBe(true)
    })

    it('does not leak background streaming sessions from foreign projects into active project', () => {
      // Session 8 belongs to project 20 and is actively streaming
      const result = filterSidebarSessions({
        sessions: mockSessions,
        projectScopeFilter: true,
        activeProject: activeProject10,
        activeStreamingIds: '8', // project 20 session streaming
      })

      // Session 8 must NOT appear because project 10 filter runs first
      const ids = result.map((s) => s.id)
      expect(ids).not.toContain(8)
      expect(ids).toEqual([1, 2, 7])
    })

    it('keeps active project draft session visible if it is actively streaming', () => {
      // Session 6 is an empty draft in project 10, but streaming
      const result = filterSidebarSessions({
        sessions: mockSessions,
        projectScopeFilter: true,
        activeProject: activeProject10,
        activeStreamingIds: '6',
      })

      const ids = result.map((s) => s.id)
      expect(ids).toContain(6)
      expect(ids).toEqual([1, 2, 6, 7])
    })

    it('applies search query on top of project scope filter without leaking foreign sessions', () => {
      const result = filterSidebarSessions({
        sessions: mockSessions,
        projectScopeFilter: true,
        activeProject: activeProject10,
        searchQuery: 'Chat',
      })

      const ids = result.map((s) => s.id)
      // Only project 10 chats matching 'Chat'
      expect(ids).toEqual([1, 2])
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Toggling projectScopeFilter and Full Restoration
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. projectScopeFilter Toggling & Full Restoration', () => {
    const mixedSessions = [
      { id: 101, project_id: 1, title: 'Proj 1 Chat', last_message: 'msg' },
      { id: 102, project_id: 2, title: 'Proj 2 Chat', last_message: 'msg' },
      { id: 103, project_id: null, title: 'Global Chat A', last_message: 'msg' },
      { id: 104, project_id: undefined, title: 'Global Chat B', last_message: 'msg' },
      { id: 105, project_id: 1, title: 'Proj 1 Chat B', last_message: 'msg' },
    ]
    const proj1 = { id: 1, name: 'Project 1', root_path: '/p1' }

    it('restores 100% of sessions when projectScopeFilter is toggled to false', () => {
      // Step A: Scoped
      const scoped = filterSidebarSessions({
        sessions: mixedSessions,
        projectScopeFilter: true,
        activeProject: proj1,
      })
      expect(scoped.map((s) => s.id)).toEqual([101, 105])

      // Step B: Unscoped (Toggled off)
      const all = filterSidebarSessions({
        sessions: mixedSessions,
        projectScopeFilter: false,
        activeProject: proj1,
      })
      expect(all.map((s) => s.id)).toEqual([101, 102, 103, 104, 105])

      // Step C: Re-scoped (Toggled back on)
      const reScoped = filterSidebarSessions({
        sessions: mixedSessions,
        projectScopeFilter: true,
        activeProject: proj1,
      })
      expect(reScoped.map((s) => s.id)).toEqual([101, 105])
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. activeProject === null Safety & Default Workspace State
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. activeProject === null Safety & Fallbacks', () => {
    const allSessions = [
      { id: 1, project_id: 5, title: 'Project 5 Chat', last_message: 'a' },
      { id: 2, project_id: null, title: 'Default Session', last_message: 'b' },
      { id: 3, project_id: 8, title: 'Project 8 Chat', last_message: 'c' },
    ]

    it('gracefully shows all sessions when activeProject is null, even if projectScopeFilter is true', () => {
      const result = filterSidebarSessions({
        sessions: allSessions,
        projectScopeFilter: true,
        activeProject: null, // Default workspace
      })

      // When activeProject is null, projectScopeFilter && activeProject is false, so all valid sessions are shown
      expect(result.map((s) => s.id)).toEqual([1, 2, 3])
    })

    it('getProjectSessionCount returns total session count when activeProject is null', () => {
      const countNull = getProjectSessionCount(allSessions, null)
      expect(countNull).toBe(3)

      const countProj5 = getProjectSessionCount(allSessions, { id: 5 })
      expect(countProj5).toBe(1)

      const countProjNone = getProjectSessionCount(allSessions, { id: 999 })
      expect(countProjNone).toBe(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Extremely Long Project Names (>100 Chars) & HoverMarquee
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Extreme Project Name Lengths & Marquee Metrics', () => {
    const extremeNames = [
      'a'.repeat(120),
      '🚀 Extremely Long Multi-Byte Unicode Workspace Name With Lots Of Emojis 🧠⚡️🛠️ '.repeat(5),
      '中文超长工作区名称测试——这是一段用来压力测试侧边栏头部单行溢出跑马灯组件的超长文本，保证绝对不折行不换行' + '！'.repeat(50),
      'P'.repeat(1000), // 1000 characters
    ]

    it('safely bounds marquee speed and animation duration for extreme overflow distances', () => {
      for (const name of extremeNames) {
        // Approximate overflow: 1 char ~= 7px, container width ~= 160px
        const charCount = name.length
        const estimatedOverflow = Math.max(0, charCount * 7 - 160)

        const { effectiveSpeed, durationSec } = computeMarqueeMetrics(estimatedOverflow)

        // Effective speed must NEVER exceed 42 px/s (reading cap)
        expect(effectiveSpeed).toBeLessThanOrEqual(42)
        expect(effectiveSpeed).toBeGreaterThanOrEqual(24)

        // Animation duration must be safely bounded between 1.8s and 14.0s
        if (estimatedOverflow > 0) {
          expect(durationSec).toBeGreaterThanOrEqual(1.8)
          expect(durationSec).toBeLessThanOrEqual(14.0)
          expect(Number.isFinite(durationSec)).toBe(true)
        }
      }
    })

    it('computes 0.25s resting duration when overflow is 0', () => {
      const { durationSec } = computeMarqueeMetrics(0)
      expect(durationSec).toBe(0.25)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Invariant Property Testing & Randomized Fuzzing
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Invariant Property Testing (1,000 Fuzz Runs)', () => {
    it('always satisfies subset invariant: scoped list is a subset of unscoped list', () => {
      const activeProject = { id: 42, name: 'Core Project', root_path: '/core' }

      for (let run = 0; run < 1000; run++) {
        // Generate 20 random sessions
        const randomSessions = Array.from({ length: 20 }, (_, idx) => {
          const randProj = Math.random()
          const projectId = randProj > 0.6 ? 42 : randProj > 0.3 ? 99 : null
          const hasMsg = Math.random() > 0.2
          const isPlaceholder = Math.random() > 0.8
          return {
            id: idx + 1,
            project_id: projectId,
            title: isPlaceholder ? '新会话' : `Session ${idx}`,
            last_message: hasMsg ? `Message ${idx}` : '',
          }
        })

        const scoped = filterSidebarSessions({
          sessions: randomSessions,
          projectScopeFilter: true,
          activeProject,
        })

        const unscoped = filterSidebarSessions({
          sessions: randomSessions,
          projectScopeFilter: false,
          activeProject,
        })

        // Invariant 1: scoped size <= unscoped size
        expect(scoped.length).toBeLessThanOrEqual(unscoped.length)

        // Invariant 2: every item in scoped is in unscoped
        const unscopedIds = new Set(unscoped.map((s) => s.id))
        for (const s of scoped) {
          expect(unscopedIds.has(s.id)).toBe(true)
          // Invariant 3: every item in scoped belongs to activeProject.id
          expect(s.project_id).toBe(activeProject.id)
        }
      }
    })
  })
})
