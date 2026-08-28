// ───────────────────────────────────────────────────────────────────────────
// Agent Arena — multi-agent competition + cross-review → judge → best plan → executor.
//
// P2-1: Multi-Agent Arena (inspired by Aether's existing ELO arena but elevated
// to agent-level competition: multiple agents PLAN the same task, cross-review
// each other's plans, judge picks the best, executor carries it out).
//
// Pipeline:
//   1. Plan phase: spawn N sub-agents (different roles/models) to plan the same task
//   2. Cross-review: each agent reviews every other agent's plan
//   3. Judge: pick the best plan based on cross-reviews + heuristics
//   4. Execute: use the best plan to do the actual work
//
// Built-in competition modes:
//   - plan_only: just plan, return ranked plans with reasoning
//   - full: plan → cross-review → judge → execute
//
// 2026-08 upgrades:
//   - Plan + cross-review phases are PARALLEL (subAgent.runParallel) — 3x faster
//   - Role-aware prompts via agentRoles.buildRolePrompt instead of one generic prompt
//   - Role→model mapping: roles can be [{ role, model }] — cheap models plan, strong model executes
//   - LLM judge phase (runJudgePhase) with strict-JSON scoring; falls back to judgePlans heuristics
//   - Evaluator-Optimizer loop: when best.score < judgeThreshold, refine the best plan
//     against peer feedback and re-review, up to maxRounds
//   - Hard budget: maxSubagentCalls guards against runaway sub-agent spawning
// ───────────────────────────────────────────────────────────────────────────

const subAgent = require('./subAgent')
const agentRoles = require('./agentRoles')
const workflow = require('./workflow')
const log = require('../logger')

// ── Competition modes ─────────────────────────────────────────────────────

const MODES = {
  plan_only: 'plan only — return ranked plans without execution',
  full: 'full pipeline — plan → cross-review → judge → execute',
}

// Score extraction from review text — anchors on common rating phrasings.
const SCORE_RE = /\b(\d{1,2})\s*\/\s*10|score[:\s]*(\d{1,2})|(\d{1,2})\s*out of\s*10/i

function clampScore(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 5
  return Math.round(Math.min(10, Math.max(1, v)) * 10) / 10
}

// ── Role normalization (角色-模型映射) ─────────────────────────────────────
// Accepts ['explore','build'] (legacy) or [{ role:'explore', model: cheap }, ...].
// model = null means "use the phase's main model".

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return []
  return roles
    .map(r => {
      if (typeof r === 'string' && r.trim()) return { role: r.trim(), model: null }
      if (r && typeof r === 'object' && typeof r.role === 'string' && r.role.trim()) {
        return { role: r.role.trim(), model: r.model || null }
      }
      return null
    })
    .filter(Boolean)
}

function buildPlanPrompt(role, userRequest) {
  const rolePrompt = agentRoles.buildRolePrompt(
    role,
    'Produce a detailed, step-by-step implementation plan for the task below.'
  )
  const intro = rolePrompt || `You are a software architect planning the implementation of the following task.

You must produce a detailed, step-by-step plan.`
  return `${intro}

Plan requirements:
- Concrete step-by-step actions in dependency order
- Include file paths and key functions where relevant
- Call out potential risks and mitigations
- Describe a testing / verification strategy

Task: ${userRequest}`
}

// ── Plan phase (并行) ─────────────────────────────────────────────────────

async function runPlanPhase({ db, provider, model, userRequest, signal, roles }) {
  const slots = normalizeRoles(roles)

  // Fast path: same model for every role → reuse runParallel (events + isolation).
  const useParallel = slots.every(s => !s.model || s.model === model)
  if (useParallel) {
    const tasks = slots.map(s => buildPlanPrompt(s.role, userRequest))
    const outputs = await subAgent.runParallel(tasks, {
      db,
      parentSessionId: null,
      provider,
      model,
      signal,
      agentMode: 'auto',
      subagentConfig: { cleanup: 'keep' },
    })
    return outputs.map((o, i) => ({
      role: slots[i].role,
      plan: o.success ? o.output : null,
      childSessionId: o.childSessionId,
      success: o.success,
      error: o.error,
    }))
  }

  // Role→model mapping: still parallel, per-role model via Promise.all.
  const settled = await Promise.all(slots.map(async s => {
    try {
      const r = await subAgent.runSubagent({
        db,
        parentSessionId: null,
        provider,
        model: s.model || model,
        prompt: buildPlanPrompt(s.role, userRequest),
        signal,
        agentMode: 'auto',
        config: { cleanup: 'keep' },
      })
      return { role: s.role, plan: r.content, childSessionId: r.childSessionId, success: true, error: null }
    } catch (e) {
      return { role: s.role, plan: null, childSessionId: null, success: false, error: e?.message }
    }
  }))
  return settled
}

// ── Cross-review phase (并行) ─────────────────────────────────────────────

async function runCrossReview({ db, provider, model, userRequest, signal, plans }) {
  // Keep the reviews array indexed identically to plans (legacy callers rely on order).
  const tasks = []      // prompts, one per reviewer that has something to compare
  const meta = []       // { planIndex, taskIndex? } to map outputs back

  plans.forEach((reviewer, i) => {
    if (!reviewer.success || !reviewer.plan) {
      meta.push({ planIndex: i, kind: 'failed' })
      return
    }
    const otherPlans = plans.filter((_, j) => j !== i && _.success && _.plan)
    if (otherPlans.length === 0) {
      meta.push({ planIndex: i, kind: 'alone' })
      return
    }
    const comparisons = otherPlans
      .map((p, idx) => `## Plan ${idx + 1} (${p.role}):\n${p.plan.slice(0, 3000)}`)
      .join('\n\n---\n\n')

    const prompt = `You are a senior software architect reviewing competing implementation plans. Compare the following plans and identify strengths, weaknesses, and potential issues of each relative to the others.

Task: ${userRequest}

## Your Plan (${reviewer.role}):
${reviewer.plan.slice(0, 3000)}

${comparisons}

For each plan (including your own), provide:
1. Strengths (what's good)
2. Weaknesses (what's missing or risky)
3. A score 1-10 (10 = best)
4. Recommended improvements

Respond in a structured format.`

    meta.push({ planIndex: i, kind: 'review', taskIndex: tasks.length })
    tasks.push(prompt)
  })

  if (tasks.length === 0) {
    return meta.map(m => ({
      reviewer: plans[m.planIndex].role,
      target: null,
      review: m.kind === 'failed' ? 'plan generation failed' : 'no other plans to compare',
      score: m.kind === 'failed' ? 0 : 5,
      success: false,
    }))
  }

  const outputs = await subAgent.runParallel(tasks, {
    db,
    parentSessionId: null,
    provider,
    model,
    signal,
    agentMode: 'auto',
    subagentConfig: { cleanup: 'keep' },
  })

  const reviews = new Array(plans.length).fill(null)
  meta.forEach(m => {
    const reviewerRole = plans[m.planIndex].role
    if (m.kind === 'failed') {
      reviews[m.planIndex] = { reviewer: reviewerRole, target: null, review: 'plan generation failed', score: 0, success: false }
      return
    }
    if (m.kind === 'alone') {
      reviews[m.planIndex] = { reviewer: reviewerRole, target: null, review: 'no other plans to compare', score: 5, success: false }
      return
    }
    const o = outputs[m.taskIndex]
    if (o && o.success) {
      const m2 = o.output.match(SCORE_RE)
      const score = m2 ? clampScore(m2[1] || m2[2] || m2[3]) : 5
      reviews[m.planIndex] = {
        reviewer: reviewerRole,
        target: 'all_others',
        review: o.output,
        score,
        childSessionId: o.childSessionId,
        success: true,
      }
    } else {
      reviews[m.planIndex] = {
        reviewer: reviewerRole,
        target: null,
        review: `review failed: ${o?.error || 'unknown'}`,
        score: 0,
        success: false,
      }
    }
  })

  return reviews
}

// ── Judge phase ───────────────────────────────────────────────────────────

// Pure-function fallback: average of cross-review scores + string heuristics.
// Kept exported for legacy callers and as the LLM judge fallback.
function judgePlans(plans, reviews) {
  const scored = plans.map(plan => {
    if (!plan.success) return { ...plan, finalScore: 0, judgeReasoning: 'plan generation failed' }

    const planReviews = reviews.filter(r => r.success && r.review)
    const avgScore = planReviews.length > 0
      ? planReviews.reduce((s, r) => s + (r.score || 5), 0) / planReviews.length
      : 5

    // Heuristic bonuses
    let bonus = 0
    if (plan.plan && plan.plan.includes('risk')) bonus += 0.5  // considered risks
    if (plan.plan && plan.plan.includes('test')) bonus += 0.5  // considered testing
    if (plan.plan && plan.plan.length > 500) bonus += 0.3  // detailed plan

    const finalScore = Math.min(10, avgScore + bonus)

    return {
      ...plan,
      finalScore: Math.round(finalScore * 10) / 10,
      judgeReasoning: `avg review score: ${avgScore.toFixed(1)}, heuristic bonus: ${bonus}`,
    }
  })

  return scored.sort((a, b) => b.finalScore - a.finalScore)
}

function parseJudgeJSON(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

// LLM judge: single sub-agent reads every plan + its peer reviews and returns
// strict JSON scores. Falls back to judgePlans heuristics on any failure.
async function runJudgePhase({ db, provider, model, userRequest, signal, plans, reviews }) {
  const eligible = plans.filter(p => p.success && p.plan)
  if (eligible.length === 0) return judgePlans(plans, reviews)

  const planBlock = eligible.map((p, i) => {
    const related = reviews.filter(r => r.reviewer === p.role && r.success)
    const reviewText = related.length
      ? related.map(r => `[${r.reviewer}] ${r.review}`).join('\n').slice(0, 1500)
      : '(no peer review available)'
    return `## Plan ${i + 1} (${p.role}):\n${p.plan.slice(0, 2500)}\n\nPeer reviews:\n${reviewText}`
  }).join('\n\n---\n\n')

  const prompt = `You are the final judge in a multi-agent arena. Multiple agents produced implementation plans for the same task, and their peers reviewed each plan. Read every plan and its reviews, then decide which plan deserves to be executed.

Task: ${userRequest}

${planBlock}

Respond with ONLY a valid JSON object, no prose, in this exact shape:
{"scores":[{"role":"<plan role>","score":<1-10>,"reasoning":"<one sentence>"}],"best":"<winning role>","decision":"<why this plan wins>"}

A plan is better when it is concrete (file paths, key functions), complete (all steps to done), de-risked (identifies and mitigates risks), and verifiable (testing strategy).`

  try {
    const result = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt,
      signal,
      agentMode: 'plan',
      config: { cleanup: 'keep', maxOutputChars: 8000 },
    })
    const parsed = parseJudgeJSON(result.content)
    if (parsed && Array.isArray(parsed.scores) && parsed.scores.length > 0) {
      const scored = plans.map(plan => {
        if (!plan.success) return { ...plan, finalScore: 0, judgeReasoning: 'plan generation failed' }
        const s = parsed.scores.find(x => x && x.role === plan.role)
        if (!s) return { ...plan, finalScore: 0, judgeReasoning: 'no LLM score assigned' }
        return {
          ...plan,
          finalScore: clampScore(s.score),
          judgeReasoning: `LLM judge: ${s.reasoning || ''}`.trim(),
          llmAwarded: true,
        }
      }).sort((a, b) => b.finalScore - a.finalScore)
      return scored
    }
    log.warn('agentArena: LLM judge returned unparsable JSON, falling back to heuristics')
  } catch (e) {
    log.warn('agentArena: LLM judge failed, falling back to heuristics:', e?.message)
  }
  return judgePlans(plans, reviews)
}

// ── Checkpoint persistence (best-effort, like compactionStore) ───────────
// Key format: `run_arena:checkpoint:<key>`. Survives app restarts via the
// settings table; degrades silently to a per-process Map when db is absent.

const _ckMem = new Map()

function _ckDb(db) {
  return db && typeof db.getSetting === 'function' ? db : null
}

function loadArenaCheckpoint(db, key) {
  if (!key) return null
  const memKey = `run_arena:checkpoint:${key}`
  if (_ckMem.has(memKey)) return _ckMem.get(memKey)
  const sdb = _ckDb(db)
  if (!sdb) return null
  try {
    const row = sdb.getSetting(memKey)
    if (!row) return null
    const ck = JSON.parse(row)
    _ckMem.set(memKey, ck)
    return ck
  } catch { return null }
}

function saveArenaCheckpoint(db, key, data) {
  if (!key) return
  const memKey = `run_arena:checkpoint:${key}`
  _ckMem.set(memKey, data)
  const sdb = _ckDb(db)
  if (!sdb) return
  try { sdb.setSetting(memKey, JSON.stringify(data)) } catch { /* best-effort */ }
}

// ── Supervisor phase (动态角色路由) ───────────────────────────────────────
// P2-1: Instead of a fixed role list, an LLM supervisor reads the task and
// picks which roles to spawn. Falls back to `fallbackRoles` on any failure —
// the arena must never die because the supervisor misbehaved.

const SUPERVISOR_ROLE_POOL = ['explore', 'build', 'review', 'research', 'debug']

async function runSupervisorPhase({ db, provider, model, userRequest, signal, fallbackRoles }) {
  const pool = SUPERVISOR_ROLE_POOL.join(', ')
  const prompt = `You are the supervisor of a multi-agent arena. Read the task below and decide the smallest effective team of agents to plan its implementation.

Available roles: ${pool}

Role meanings:
- explore: read-only codebase discovery; best when the task needs understanding existing code
- build: implementation planning; best for writing-new-code tasks
- review: plan scrutiny; include when the plan must be hardened or when the task is risky
- research: external knowledge gathering; best for unfamiliar libraries or questions
- debug: root-cause analysis; best when the task is to fix a bug

Task: ${userRequest}

Respond with ONLY a valid JSON object, no prose:
{"roles":["<role1>","<role2>"],"reasoning":"<one sentence why this team>"}

Pick 2-3 roles. Every role must come from the available pool above.`

  try {
    const result = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt,
      signal,
      agentMode: 'plan',
      config: { cleanup: 'keep', maxOutputChars: 4000 },
    })
    const parsed = parseJudgeJSON(result.content)
    if (parsed && Array.isArray(parsed.roles) && parsed.roles.length > 0) {
      const valid = parsed.roles
        .filter(r => typeof r === 'string' && SUPERVISOR_ROLE_POOL.includes(r))
      if (valid.length > 0) {
        return { roles: valid.slice(0, 5), reasoning: String(parsed.reasoning || '') || null, llmAwarded: true }
      }
    }
    log.warn('agentArena: supervisor returned unparsable/invalid roles, falling back to defaults')
  } catch (e) {
    log.warn('agentArena: supervisor failed, falling back to defaults:', e?.message)
  }
  return { roles: fallbackRoles, reasoning: 'supervisor failed — fallback to default roles' }
}

// ── Execute phase ─────────────────────────────────────────────────────────

async function executeBestPlan({ db, provider, model, userRequest, signal, bestPlan }) {
  const executePrompt = `You are implementing the following task using the best plan that was selected after multi-agent competition and cross-review.

Task: ${userRequest}

Selected Plan (${bestPlan.role}, score: ${bestPlan.finalScore}):
${bestPlan.plan}

Reasoning: ${bestPlan.judgeReasoning}

Execute this plan. Write code, run tests, verify. When done, report what you did.`

  try {
    const result = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt: executePrompt,
      signal,
      agentMode: 'auto',
      config: { cleanup: 'keep' },
    })
    return { success: true, output: result.content, childSessionId: result.childSessionId }
  } catch (e) {
    return { success: false, error: e?.message }
  }
}

// ── Evaluator-Optimizer helpers ───────────────────────────────────────────

// Refine the current best plan against peer review feedback.
async function refinePlan({ db, provider, model, userRequest, signal, bestPlan, reviews }) {
  const feedback = reviews
    .filter(r => r.success && r.review)
    .map(r => `[${r.reviewer}] ${r.review}`)
    .join('\n')
    .slice(0, 4000)

  const prompt = `You are improving the current best plan based on peer review feedback. Fix every legitimate concern the reviewers raised while keeping what already works.

Task: ${userRequest}

Current plan (by ${bestPlan.role}):
${bestPlan.plan}

Peer review feedback:
${feedback || '(none provided)'}

Produce the complete final improved plan — not a diff, not a summary: the full plan ready for execution, with risks mitigated and a verification strategy included.`

  try {
    const r = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt,
      signal,
      agentMode: 'auto',
      config: { cleanup: 'keep' },
    })
    return { role: bestPlan.role, plan: r.content, childSessionId: r.childSessionId, success: true, refined: true }
  } catch (e) {
    log.warn('agentArena: refine failed:', e?.message)
    return null
  }
}

// Single-plan review used by the Evaluator-Optimizer loop.
async function reviewSinglePlan({ db, provider, model, userRequest, signal, plan }) {
  const prompt = `You are a senior software architect reviewing an implementation plan.

Task: ${userRequest}

Plan (${plan.role}):
${plan.plan.slice(0, 3000)}

Provide:
1. Strengths (what's good)
2. Weaknesses (what's missing or risky)
3. A score 1-10 (10 = best)
4. Recommended improvements

Respond in a structured format.`
  try {
    const r = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt,
      signal,
      agentMode: 'auto',
      config: { cleanup: 'keep' },
    })
    const m = r.content.match(SCORE_RE)
    return {
      reviewer: 'judge',
      target: plan.role,
      review: r.content,
      score: m ? clampScore(m[1] || m[2] || m[3]) : 5,
      childSessionId: r.childSessionId,
      success: true,
    }
  } catch (e) {
    log.warn('agentArena: single review failed:', e?.message)
    return null
  }
}

// ── Main entry: runArena ──────────────────────────────────────────────────

async function runArena({
  db,
  provider,
  model,
  userRequest,
  signal,
  mode = 'plan_only',
  roles = ['explore', 'build', 'review'],
  executeModel = null,       // role→model mapping for the executor (defaults to `model`)
  maxRounds = 1,             // Evaluator-Optimizer rounds; 1 = no refine loop (legacy behavior)
  judgeThreshold = 0,        // refine while best.score < threshold; 0 disables the loop
  maxSubagentCalls = 20,     // hard budget on spawned sub-agents — runaway protection
  supervise = false,         // P2-1: let an LLM supervisor pick the roles dynamically
  checkpointKey = null,      // P2-2: persist phase state under this key; resume skips done phases
}) {
  if (!db || !provider || !model) {
    return { ok: false, error: 'missing required params: db, provider, model' }
  }
  if (!userRequest || !String(userRequest).trim()) {
    return { ok: false, error: 'userRequest is required' }
  }

  let slots = normalizeRoles(roles)
  if (slots.length === 0) {
    return { ok: false, error: 'roles must be a non-empty array of role names or { role, model } objects' }
  }

  let calls = 0
  const charge = n => { calls += n }
  const exhausted = () => calls >= maxSubagentCalls
  const budgetBreach = phase => `sub-agent budget exhausted after ${calls} calls (max ${maxSubagentCalls}) during ${phase}`

  // P2-1: supervisor overrides the fixed role list when enabled.
  let supervisor = null
  if (supervise) {
    const sup = await runSupervisorPhase({
      db, provider, model, userRequest, signal,
      fallbackRoles: slots.map(s => s.role),
    })
    charge(1)
    if (sup.llmAwarded) {
      slots = normalizeRoles(sup.roles)
      if (slots.length === 0) {
        return { ok: false, error: 'supervisor returned no valid roles' }
      }
      supervisor = { roles: sup.roles, reasoning: sup.reasoning }
    }
    // if supervisor failed, keep the caller-supplied roles (supervisor stays null)
  }

  // P2-2: resume from a checkpoint — reuse phases that already completed.
  let plans = null
  let reviews = null
  let ranked = null
  const ck = checkpointKey ? loadArenaCheckpoint(db, checkpointKey) : null
  if (ck && ck.userRequest === userRequest && ck.mode === mode) {
    if (Array.isArray(ck.plans)) plans = ck.plans
    if (Array.isArray(ck.reviews)) reviews = ck.reviews
    if (Array.isArray(ck.ranked)) ranked = ck.ranked
  }

  // Phase 1: Plan (parallel)
  if (!plans) {
    plans = await runPlanPhase({ db, provider, model, userRequest, signal, roles: slots })
    charge(plans.length)
    if (exhausted()) {
      return { ok: false, error: budgetBreach('plan phase'), plans: plans.map(p => ({ role: p.role, success: p.success, plan: p.plan?.slice(0, 2000) })) }
    }
    saveArenaCheckpoint(db, checkpointKey, { userRequest, mode, phase: 'plans', plans, supervise })
  }

  if (mode === 'plan_only') {
    return {
      ok: true,
      mode,
      subagentCalls: calls,
      plans: plans.map(p => ({ role: p.role, plan: p.plan?.slice(0, 2000), success: p.success })),
      checkpoint: checkpointKey || null,
      supervisor,
    }
  }

  // Phase 2: Cross-review (parallel)
  if (!reviews) {
    reviews = await runCrossReview({ db, provider, model, userRequest, signal, plans })
    charge(plans.filter(p => p.success).length)
    if (exhausted()) {
      return { ok: false, error: budgetBreach('cross-review phase'), plans, reviews }
    }
    saveArenaCheckpoint(db, checkpointKey, { userRequest, mode, phase: 'reviews', plans, reviews, supervise })
  }

  // Phase 3: Judge (LLM with heuristic fallback)
  if (!ranked) {
    ranked = await runJudgePhase({ db, provider, model, userRequest, signal, plans, reviews })
    charge(1)
    if (exhausted()) {
      return { ok: false, error: budgetBreach('judge phase'), plans, reviews, ranked }
    }
    saveArenaCheckpoint(db, checkpointKey, { userRequest, mode, phase: 'judged', plans, reviews, ranked, supervise })
  }

  let best = ranked[0]
  let round = 1

  // Phase 3b: Evaluator-Optimizer loop — refine the best plan against review
  // feedback until it clears the threshold or rounds/budget run out.
  while (
    round < maxRounds &&
    best && best.success &&
    judgeThreshold > 0 &&
    best.finalScore < judgeThreshold &&
    calls + 2 <= maxSubagentCalls
  ) {
    const refined = await refinePlan({ db, provider, model, userRequest, signal, bestPlan: best, reviews })
    charge(1)
    if (!refined) break

    const critique = await reviewSinglePlan({ db, provider, model, userRequest, signal, plan: refined })
    charge(1)

    ranked = judgePlans([refined], critique ? [critique] : [])
    best = ranked[0]
    round++
  }

  // Phase 4: Execute best plan
  if (!best || !best.success) {
    return { ok: false, error: 'no viable plan to execute', ranked }
  }

  const execution = await executeBestPlan({
    db,
    provider,
    model: executeModel || model,
    userRequest,
    signal,
    bestPlan: best,
  })
  charge(1)  // count executor toward the budget accounting (unlikely to exceed — final call)

  return {
    ok: true,
    mode,
    rounds: round,
    subagentCalls: calls,
    bestPlan: {
      role: best.role,
      score: best.finalScore,
      reasoning: best.judgeReasoning,
    },
    allPlans: ranked.map(p => ({ role: p.role, score: p.finalScore, success: p.success })),
    reviews: reviews.map(r => ({ reviewer: r.reviewer, score: r.score, success: r.success })),
    execution,
    checkpoint: checkpointKey || null,
    supervisor,  // { roles, reasoning } when an LLM supervisor chose them; null otherwise
  }
}

module.exports = {
  MODES,
  runArena,
  runPlanPhase,
  runCrossReview,
  judgePlans,
  runJudgePhase,
  runSupervisorPhase,
  executeBestPlan,
  loadArenaCheckpoint,
  saveArenaCheckpoint,
  normalizeRoles,
  parseJudgeJSON,
  clampScore,
}