# Aether 2.0 Reset Plan

> This document defines the cleanup boundary for the Aether 2.0 refactor.
> The goal is not to maximize feature count. The goal is to make every visible
> capability reliable, explainable, and backed by one runtime path.

## 1. Product rules

### One Agent Runtime
GUI, TUI, CLI, background tasks, workflows, Arena, and subagents must eventually
run through one Aether Core runtime. UI surfaces are clients of the runtime, not
independent agent implementations.

### Child runs are not chats
Subagents and background tasks are execution children of a parent session.
They may keep an internal session record for history, recovery, and audit, but
they must not appear as normal user chat sessions.

Every child run must preserve:

- parent session
- project workspace
- model/provider configuration where applicable
- permission boundary
- cancellation and lifecycle state

### One learning pipeline
Aether 2.0 has one automatic learning curator:

`trace → signal extraction → reflection → bounded strategy store → injection → measurement`

The legacy GEP guidance loop is not an independent automatic learning path.
Future learning work must add signals or quality measurement to this pipeline,
not introduce another parallel evolution engine.

### One task engine
`backgroundTasks.js` is the canonical persistent task engine.

Legacy `longRunningTask.js` is compatibility/retirement debt and must not be
exposed as a second model-facing task mechanism.

## 2. Current cleanup

The 2.0 stabilization branch currently includes:

- persisted `session_kind` classification
- hidden internal `subagent` / `task` sessions
- child workspace inheritance
- persisted task parent-session relation
- subagent role tool filtering
- subagent iteration limits
- parent-session propagation through orchestration, workflows, and Arena
- persistent self-learning pattern storage
- persisted reflection health status
- persisted automatic reflection cooldown
- persisted provider/model resolution for reflection
- self-evolution toggle actually gating automatic reflection
- retirement of the duplicate `run_long_task` model-facing tool
- retirement of automatic per-turn GEP guidance injection
- agent-tool routing for actual orchestration tools instead of treating them as
  unknown always-injected tools

## 3. Deprecation candidates

These are candidates for removal or consolidation after the stabilization
baseline passes:

| Area | Decision |
| --- | --- |
| GEP automatic guidance | Remove as an independent learning path |
| longRunningTask | Retire; canonical task engine is backgroundTasks |
| Habit/Learning/Evolution as separate primary UX | Merge into Project Intelligence |
| Internal child sessions in chat history | Never expose as normal chats |
| Multiple task creation paths | Funnel through the canonical Task Engine |
| Multiple agent orchestration paths | Funnel through Aether Core |
| Experimental feature flags with no active consumer | Remove |
| One-off UI panels with no end-to-end workflow | Remove or hide until complete |

## 4. Acceptance criteria

A 2.0 feature is not considered complete because a module exists.

It must have:

1. a real entry point
2. a real runtime path
3. observable success/failure state
4. persistence/recovery when the feature claims persistence
5. focused tests
6. a clear user-facing explanation
7. no duplicate implementation that can silently diverge

For Agent execution specifically:

`request → plan → inspect → act → observe → verify → recover/complete`

must remain observable as one coherent lifecycle.

## 5. Architecture target

The intended end state is:

`React/TypeScript UI`
→ typed transport
→ `Aether Core`
→ Agent Runtime / Context / Permissions / Tools / Execution / Memory / Events
→ SQLite + providers + MCP + local/remote execution

The Core is the future Rust migration boundary. Electron/Tauri is the desktop
host and must not own business logic.

## 6. Feature triage rule

When evaluating an existing feature:

- Keep it when it materially improves the core workbench.
- Merge it when several features solve the same user problem.
- Hide it when it is useful but unfinished.
- Remove it when it is duplicated, misleading, or has no reliable end-to-end path.

Do not add new top-level navigation entries merely because a subsystem exists.

## 7. Release strategy

The stabilization branch should land in small, testable slices. Do not merge
the full Rust/Tauri migration and the product cleanup in one irreversible
commit.

The 2.0 migration should preserve user data and provide explicit SQLite
migrations for session/task schema changes.