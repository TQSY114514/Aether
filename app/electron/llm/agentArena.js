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

// ── Plan phase ────────────────────────────────────────────────────────────

async function runPlanPhase({ db, provider, model, userRequest, signal, roles }) {
  const results = []

  for (const role of roles) {
    try {
      const prompt = `You are a software architect planning the implementation of the following task. Produce a detailed, step-by-step plan. Include file paths, key functions, potential risks, and testing strategy.\n\nTask: ${userRequest}`

      const result = await subAgent.runSubagent({
        db,
        parentSessionId: null,
        provider,
        model,
        prompt,
        signal,
        agentMode: 'auto',
        config: { cleanup: 'keep' },
      })

      results.push({
        role,
        plan: result.content,
        childSessionId: result.childSessionId,
        success: true,
      })
    } catch (e) {
      results.push({ role, plan: null, success: false, error: e?.message })
    }
  }

  return results
}

// ── Cross-review phase ───────────────────────────────────────────────────

async function runCrossReview({ db, provider, model, userRequest, signal, plans }) {
  const reviews = []

  for (let i = 0; i < plans.length; i++) {
    const reviewer = plans[i]
    if (!reviewer.success || !reviewer.plan) {
      reviews.push({ reviewer: reviewer.role, target: null, review: 'plan generation failed', score: 0 })
      continue
    }

    const otherPlans = plans.filter((_, j) => j !== i && _.success && _.plan)
    if (otherPlans.length === 0) {
      reviews.push({ reviewer: reviewer.role, target: null, review: 'no other plans to compare', score: 5 })
      continue
    }

    const comparisons = otherPlans.map((p, idx) => {
      return `## Plan ${idx + 1} (${p.role}):\n${p.plan.slice(0, 3000)}`
    }).join('\n\n---\n\n')

    const prompt = `You are a senior software architect reviewing competing implementation plans. Compare the following plans and identify strengths, weaknesses, and potential issues of each relative to the others.\n\nTask: ${userRequest}\n\n## Your Plan (${reviewer.role}):\n${reviewer.plan.slice(0, 3000)}\n\n${comparisons}\n\nFor each plan (including your own), provide:\n1. Strengths (what's good)\n2. Weaknesses (what's missing or risky)\n3. A score 1-10 (10 = best)\n4. Recommended improvements\n\nRespond in a structured format.`

    try {
      const result = await subAgent.runSubagent({
        db,
        parentSessionId: null,
        provider,
        model,
        prompt,
        signal,
        agentMode: 'auto',
        config: { cleanup: 'keep' },
      })

      // Extract score from review text
      const scoreMatch = result.content.match(/\b(\d{1,2})\s*\/\s*10|score[:\s]*(\d{1,2})|(\d{1,2})\s*out of\s*10/i)
      const score = scoreMatch
        ? Math.min(10, Math.max(1, parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3] || '5', 10)))
        : 5

      reviews.push({
        reviewer: reviewer.role,
        target: 'all_others',
        review: result.content,
        score,
        childSessionId: result.childSessionId,
        success: true,
      })
    } catch (e) {
      reviews.push({ reviewer: reviewer.role, target: null, review: `review failed: ${e.message}`, score: 0, success: false })
    }
  }

  return reviews
}

// ── Judge phase ───────────────────────────────────────────────────────────

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

// ── Execute phase ─────────────────────────────────────────────────────────

async function executeBestPlan({ db, provider, model, userRequest, signal, bestPlan }) {
  const executePrompt = `You are implementing the following task using the best plan that was selected after multi-agent competition and cross-review.\n\nTask: ${userRequest}\n\nSelected Plan (${bestPlan.role}, score: ${bestPlan.finalScore}):\n${bestPlan.plan}\n\nReasoning: ${bestPlan.judgeReasoning}\n\nExecute this plan. Write code, run tests, verify. When done, report what you did.`

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

// ── Main entry: runArena ──────────────────────────────────────────────────

async function runArena({
  db,
  provider,
  model,
  userRequest,
  signal,
  mode = 'plan_only',
  roles = ['explore', 'build', 'review'],
}) {
  if (!db || !provider || !model) {
    return { ok: false, error: 'missing required params: db, provider, model' }
  }
  if (!userRequest || !String(userRequest).trim()) {
    return { ok: false, error: 'userRequest is required' }
  }

  // Phase 1: Plan
  const plans = await runPlanPhase({ db, provider, model, userRequest, signal, roles })

  if (mode === 'plan_only') {
    return {
      ok: true,
      mode,
      plans: plans.map(p => ({ role: p.role, plan: p.plan?.slice(0, 2000), success: p.success })),
    }
  }

  // Phase 2: Cross-review
  const reviews = await runCrossReview({ db, provider, model, userRequest, signal, plans })

  // Phase 3: Judge
  const ranked = judgePlans(plans, reviews)

  // Phase 4: Execute best plan
  const bestPlan = ranked[0]
  if (!bestPlan || !bestPlan.success) {
    return { ok: false, error: 'no viable plan to execute', ranked }
  }

  const execution = await executeBestPlan({ db, provider, model, userRequest, signal, bestPlan })

  return {
    ok: true,
    mode,
    bestPlan: {
      role: bestPlan.role,
      score: bestPlan.finalScore,
      reasoning: bestPlan.judgeReasoning,
    },
    allPlans: ranked.map(p => ({ role: p.role, score: p.finalScore, success: p.success })),
    reviews: reviews.map(r => ({ reviewer: r.reviewer, score: r.score, success: r.success })),
    execution,
  }
}

module.exports = {
  MODES,
  runArena,
  runPlanPhase,
  runCrossReview,
  judgePlans,
  executeBestPlan,
}
