// ───────────────────────────────────────────────────────────────────────────
// Memory → Skill Bridge — turn accumulated memory into draft skills.
//
// Closes the loop: Task → Experience → Memory → Skill → Future Task
//
// 1. scanForPatterns(db) — find clusters of related memories (same topic 3+ times)
// 2. generateDraftSkill(db, memories) — ask LLM to write a SKILL.md from memories
// 3. saveDraftSkill(draft) — write to skills dir for user review
// 4. runMemoryAudit(db) — full pipeline, called periodically
//
// Skills are written to <userData>/skills/auto-drafted/<name>/SKILL.md
// with frontmatter. User can accept → move to active skills, or edit.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { completeChat } = require('./providerAdapter')
const log = require('../logger')

const AUTO_DRAFT_DIR = 'auto-drafted'
const MIN_CLUSTER_SIZE = 3  // need ≥3 related memories to form a pattern
const AUDIT_MEMORY_COUNT = 200  // scan last N memories

// ─── Cluster memories by keyword overlap ───────────────────────────────────

function clusterMemories(memories) {
  if (!memories || memories.length < MIN_CLUSTER_SIZE) return []

  // Build keyword sets per memory
  const memKw = memories.map(m => ({
    m,
    kw: _extractKeywords(m.content),
  }))

  // Simple agglomerative clustering: merge memories with ≥2 shared keywords
  const clusters = []
  const used = new Set()

  for (let i = 0; i < memKw.length; i++) {
    if (used.has(i)) continue
    const cluster = [memKw[i].m]
    used.add(i)

    for (let j = i + 1; j < memKw.length; j++) {
      if (used.has(j)) continue
      let overlap = 0
      for (const k of memKw[j].kw) {
        if (memKw[i].kw.has(k)) overlap++
      }
      if (overlap >= 2) {
        cluster.push(memKw[j].m)
        used.add(j)
      }
    }

    if (cluster.length >= MIN_CLUSTER_SIZE) {
      clusters.push(cluster)
    }
  }

  return clusters
}

function _extractKeywords(text) {
  const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'what', 'how', 'why', 'when', 'do', 'does', 'did', 'can', 'could', 'would', 'should', 'not', 'no', 'yes', 'ok', 'just', 'like', 'also', 'very', 'really', 'about', 'into', 'from', 'with', 'have', 'has', 'had', 'been', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall'])
  const t = String(text || '').toLowerCase()
  const set = new Set()
  for (const w of t.match(/[a-z][a-z0-9_-]{2,}/g) || []) {
    if (!STOP.has(w)) set.add(w)
  }
  return set
}

// ─── Generate draft skill from memory cluster ─────────────────────────────

const DRAFT_PROMPT = `You are a skill author. Given a cluster of related memories from past conversations, create a concise SKILL.md that captures the reusable knowledge.

The SKILL.md must have:
1. YAML frontmatter with: name, description, triggers (array of keywords/phrases that activate this skill)
2. Body: instructions the AI should follow when this skill is active

Rules:
- Keep it under 150 lines total
- Focus on actionable instructions, not vague descriptions
- Include specific commands, patterns, or conventions mentioned in the memories
- If the memories are about a project, name the project
- If the memories are about user preferences, phrase them as "When the user asks about X, do Y"

Memories:
{memories}

Output ONLY the SKILL.md content (with frontmatter), nothing else.`

async function generateDraftSkill({ provider, model, memories, signal }) {
  if (!provider || !model || memories.length < MIN_CLUSTER_SIZE) return null

  const memText = memories.map(function(m, i) {
    return (i + 1) + '. [' + (m.type || 'fact') + '] ' + (m.content || '').toString().slice(0, 200)
  }).join('\n')
  const prompt = DRAFT_PROMPT.replace('{memories}', memText)

  try {
    const text = await completeChat({
      provider,
      model,
      messages: [
        { role: 'system', content: 'You write concise SKILL.md files for an AI assistant.' },
        { role: 'user', content: prompt },
      ],
      signal,
      options: { max_tokens: 500, temperature: 0.3 },
    })

    if (!text || !text.trim()) return null

    // Validate: must have frontmatter
    if (!text.includes('---')) return null

    return text.trim()
  } catch (e) {
    log.warn('memorySkillBridge: draft generation failed:', e?.message)
    return null
  }
}

// ─── Save draft skill to disk ──────────────────────────────────────────────

function saveDraftSkill(draftContent, skillsBaseDir) {
  if (!draftContent || !skillsBaseDir) return null

  // Extract name from frontmatter. Fixed-prefix match + manual slice to
  // end-of-line (linear scan). CodeQL js/polynomial-redos flagged the old
  // `/^name:[ \t]+([^\t\n\r]+?)[ \t]*$/m`: its lazy group overlaps the tail
  // `[ \t]*$` (both accept spaces), so "name:" + many spaces with no newline
  // backtracked quadratically. Semantics preserved for well-formed input;
  // malformed values (tabs mid-value) now sanitize through instead of stopping.
  const prefixMatch = draftContent.match(/(^|\n)name:[ \t]+/)
  let name = ''
  if (prefixMatch) {
    const start = prefixMatch.index + prefixMatch[0].length
    const end = draftContent.indexOf('\n', start)
    const rawValue = end === -1 ? draftContent.slice(start) : draftContent.slice(start, end)
    name = rawValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
  if (!name) name = `draft-${Date.now()}`

  const dir = path.join(skillsBaseDir, AUTO_DRAFT_DIR, name)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'SKILL.md')
    fs.writeFileSync(filePath, draftContent, 'utf8')
    log.info(`memorySkillBridge: saved draft skill to ${filePath}`)
    return { name, path: filePath, content: draftContent }
  } catch (e) {
    log.warn('memorySkillBridge: save failed:', e?.message)
    return null
  }
}

// ─── Full audit pipeline ──────────────────────────────────────────────────

async function runMemoryAudit({ db, provider, model, signal, skillsDir }) {
  if (!db) return { drafts: 0, error: 'no db' }

  // 1. Get recent memories
  let memories
  try {
    memories = db.getMemories(AUDIT_MEMORY_COUNT)
  } catch { return { drafts: 0, error: 'getMemories failed' } }

  if (!memories || memories.length < MIN_CLUSTER_SIZE) {
    return { drafts: 0, reason: 'not enough memories' }
  }

  // 2. Cluster by keyword overlap
  const clusters = clusterMemories(memories)
  if (clusters.length === 0) return { drafts: 0, reason: 'no patterns found' }

  // 3. Generate draft for each cluster (max 3 per audit to avoid LLM spam)
  const drafts = []
  for (const cluster of clusters.slice(0, 3)) {
    const draft = await generateDraftSkill({ provider, model, memories: cluster, signal })
    if (draft) {
      const saved = saveDraftSkill(draft, skillsDir)
      if (saved) drafts.push(saved)
    }
  }

  return { drafts: drafts.length, clusters: clusters.length, totalMemories: memories.length }
}

// ─── List existing draft skills ───────────────────────────────────────────

function listDraftSkills(skillsBaseDir) {
  const draftDir = path.join(skillsBaseDir, AUTO_DRAFT_DIR)
  try {
    if (!fs.existsSync(draftDir)) return []
    return fs.readdirSync(draftDir).filter(name => {
      const skillPath = path.join(draftDir, name, 'SKILL.md')
      return fs.existsSync(skillPath)
    }).map(name => {
      const skillPath = path.join(draftDir, name, 'SKILL.md')
      const content = fs.readFileSync(skillPath, 'utf8')
      return { name, path: skillPath, content }
    })
  } catch {
    return []
  }
}

// ─── Promote a draft skill to active ──────────────────────────────────────

function promoteDraftSkill(draftPath, skillsBaseDir) {
  try {
    const content = fs.readFileSync(draftPath, 'utf8')
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    const name = nameMatch ? nameMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : path.basename(path.dirname(draftPath))

    const activeDir = path.join(skillsBaseDir, name)
    fs.mkdirSync(activeDir, { recursive: true })
    fs.writeFileSync(path.join(activeDir, 'SKILL.md'), content, 'utf8')

    // Remove from drafts
    fs.rmSync(path.dirname(draftPath), { recursive: true, force: true })

    return { name, path: activeDir }
  } catch (e) {
    log.warn('memorySkillBridge: promote failed:', e?.message)
    return null
  }
}

module.exports = {
  clusterMemories,
  generateDraftSkill,
  saveDraftSkill,
  runMemoryAudit,
  listDraftSkills,
  promoteDraftSkill,
  MIN_CLUSTER_SIZE,
  AUDIT_MEMORY_COUNT,
}
