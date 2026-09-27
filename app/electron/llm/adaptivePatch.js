// ─────────────────────────────────────────────────────────────────────────────
// app/electron/llm/adaptivePatch.js — Multi-Model Adaptive Edit Patch Routing
//
// Aligns with Aider & Cursor practices and 2026 Competitive Agent Research §10.2 (P1-6):
// Strong models (Claude 3.5+, GPT-4o, o1, Gemini 1.5 Pro, Qwen 72B) excel at generating
// standard Unified Diffs with @@ line offsets. Smaller/compact models (7B/8B, Mini,
// Haiku, Flash, Ollama local models) frequently miscalculate line numbers, leading to
// patch conflict errors.
//
// Adaptive routing dynamically directs:
//   - 'strong' tier  -> Unified Diff preferred (high token efficiency)
//   - 'compact' tier -> Search-and-Replace (edit_file) & Aider-style blocks (high tolerance)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify model capability for code editing tasks.
 *
 * @param {string|object} model - Model identifier string or model record object
 * @returns {{ tier: 'strong' | 'compact', format: 'unified' | 'search_replace', modelName: string }}
 */
function classifyModelCapability(model) {
  const modelName = (
    typeof model === 'string'
      ? model
      : (model?.model_name || model?.id || model?.name || '')
  ).toLowerCase()

  // Explicit small/compact indicators take priority (exclude 'gemini' when checking 'mini')
  const isCompactIndicator = [
    'flash', 'haiku', 'nano', 'small', 'lite',
    ':1b', ':2b', ':3b', ':7b', ':8b', ':14b',
    '-1b', '-2b', '-3b', '-7b', '-8b', '-14b',
    'distill', 'deepseek-r1-distill',
  ].some(tag => modelName.includes(tag)) || /(?:^|[^a-z])mini(?:[^a-z]|$)/i.test(modelName.replace(/gemini/g, ''))

  if (isCompactIndicator) {
    return { tier: 'compact', format: 'search_replace', modelName }
  }

  // Known strong reasoning / coding models
  const isStrongModel = [
    'claude-3-5', 'claude-3.5', 'claude-3-7', 'claude-3.7', 'claude-opus',
    'gpt-4', 'o1', 'o3', 'o4',
    'gemini-1.5-pro', 'gemini-2.0-pro', 'gemini-exp',
    'deepseek-chat', 'deepseek-coder', 'deepseek-reasoner',
    'qwen-max', 'qwen-2.5-72b', 'qwen2.5-72b', 'qwen2.5-32b',
    'llama-3.1-70b', 'llama-3.3-70b', 'llama-3-70b',
  ].some(tag => modelName.includes(tag))

  if (isStrongModel) {
    return { tier: 'strong', format: 'unified', modelName }
  }

  // Default to compact for unknown or local models to maximize robustness
  return { tier: 'compact', format: 'search_replace', modelName }
}

/**
 * Adapt tools payload definitions based on the target model capability.
 * Updates description and parameter guidance for edit tools.
 *
 * @param {Array<object>} toolsPayload - Array of OpenAI-format function definitions
 * @param {string|object} model - Model identifier or record
 * @returns {Array<object>} Adapted tools payload (shallow cloned objects)
 */
function adaptToolsPayload(toolsPayload, model) {
  if (!Array.isArray(toolsPayload)) return toolsPayload
  const { tier } = classifyModelCapability(model)

  return toolsPayload.map(item => {
    const fn = item.function
    if (!fn) return item

    if (fn.name === 'edit_file') {
      if (tier === 'compact') {
        return {
          ...item,
          function: {
            ...fn,
            description: 'Replace code in a file using SEARCH/REPLACE. Include 2-5 unique lines in old_string. RECOMMENDED for reliable code edits.',
          },
        }
      }
      return {
        ...item,
        function: {
          ...fn,
          description: 'Replace text in a file using exact string match.',
        },
      }
    }

    if (fn.name === 'apply_patch') {
      if (tier === 'compact') {
        return {
          ...item,
          function: {
            ...fn,
            description: 'Apply edits using Aider-style <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks. Do NOT write line numbers (@@ -x,y +x,y @@).',
          },
        }
      }
      return {
        ...item,
        function: {
          ...fn,
          description: 'Apply a unified diff patch or Aider-style SEARCH/REPLACE blocks. Unified diff with @@ line offsets preferred for efficiency.',
        },
      }
    }

    return item
  })
}

/**
 * Return system prompt guidance tailored for the target model.
 *
 * @param {string|object} model - Target model
 * @returns {string} System prompt guidance block
 */
function getAdaptiveEditPrompt(model) {
  const { tier } = classifyModelCapability(model)

  if (tier === 'compact') {
    return [
      '## Code Editing Protocol (Compact/Robust Mode)',
      'To edit existing files reliably, use `edit_file` or `apply_patch` with SEARCH/REPLACE blocks:',
      '1. Provide 2-5 lines of exact, unique existing code in `old_string` (or `<<<<<<< SEARCH`).',
      '2. Provide the replacement in `new_string` (or `>>>>>>> REPLACE`).',
      '3. DO NOT generate unified diff line headers (@@ -12,4 +12,6 @@) as line number estimation is error-prone.',
    ].join('\n')
  }

  return [
    '## Code Editing Protocol',
    'When editing existing files, you may use `apply_patch` with standard unified diffs or `edit_file` with search/replace. Keep diffs concise and minimal.',
  ].join('\n')
}

/**
 * Pre-repair malformed patches from smaller models before passing to patchEngine.
 *
 * @param {string} patchText - Raw patch string
 * @returns {string} Cleaned/repaired patch string
 */
function repairPatchIfMalformed(patchText) {
  if (typeof patchText !== 'string' || !patchText.trim()) return patchText
  let cleaned = patchText.trim()

  // Strip markdown code fences if wrapped
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z0-9_-]*\r?\n?/i, '')
    cleaned = cleaned.replace(/\r?\n?```$/i, '')
  }

  // Normalize case for SEARCH/REPLACE markers
  cleaned = cleaned.replace(/^<{7}\s*search/gim, '<<<<<<< SEARCH')
  cleaned = cleaned.replace(/^={7}\s*$/gm, '=======')
  cleaned = cleaned.replace(/^>{7}\s*replace/gim, '>>>>>>> REPLACE')

  return cleaned
}

module.exports = {
  classifyModelCapability,
  adaptToolsPayload,
  getAdaptiveEditPrompt,
  repairPatchIfMalformed,
}
