// ─────────────────────────────────────────────────────────────────────────────
// envSanitizer.js — Child process environment variable isolation
//
// Defense-in-depth against host credential exfiltration (QVD-2026-57410).
// When an LLM executes shell commands or child processes, inheriting the full
// `process.env` leaks provider API keys (OpenAI, Anthropic, Gemini, DeepSeek),
// git/npm tokens, and cloud secrets to commands like `env`, `set`, or curl.
//
// This module filters process.env before passing to child_process.spawn():
//   - Strips all known secret/key patterns (case-insensitive)
//   - Preserves critical system variables (PATH, SYSTEMROOT, WINDIR, COMSPEC, etc.)
//   - Merges caller-supplied extraEnv safely
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERN = /(?:_KEY$|^KEY$|_TOKEN$|^TOKEN$|_SECRET$|^SECRET$|PASSWORD|PASSWD|_AUTH$|^AUTH$|CREDENTIAL|PRIVATE|ACCESS_KEY)/i

const SPECIFIC_SENSITIVE_PREFIXES = [
  'OPENAI_',
  'ANTHROPIC_',
  'GEMINI_',
  'DEEPSEEK_',
  'GROQ_',
  'MISTRAL_',
  'PERPLEXITY_',
  'COHERE_',
  'OPENROUTER_',
  'AETHER_',
  'GITHUB_',
  'GH_',
  'NPM_',
  'AWS_',
  'AZURE_',
  'DISCORD_',
  'SLACK_',
  'TELEGRAM_',
]

function isSensitiveEnvKey(key) {
  if (!key || typeof key !== 'string') return false
  const upper = key.toUpperCase()

  // 1. Check known sensitive prefixes
  for (const prefix of SPECIFIC_SENSITIVE_PREFIXES) {
    if (upper.startsWith(prefix)) return true
  }

  // 2. Check sensitive pattern regex
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    // Preserve harmless system variables that might contain "KEY" or "PATH"
    if (upper === 'KEYBOARD' || upper === 'PATH') return false
    return true
  }

  return false
}

/**
 * Creates a sanitized environment object safe for spawning child processes.
 *
 * @param {object} [baseEnv=process.env] - Source environment to sanitize
 * @param {object} [extraEnv={}] - Additional environment variables to merge
 * @returns {object} Clean environment dictionary
 */
function sanitizeProcessEnv(baseEnv = process.env, extraEnv = {}) {
  const cleanEnv = {}

  if (baseEnv && typeof baseEnv === 'object') {
    for (const [k, v] of Object.entries(baseEnv)) {
      if (!isSensitiveEnvKey(k)) {
        cleanEnv[k] = v
      }
    }
  }

  if (extraEnv && typeof extraEnv === 'object') {
    for (const [k, v] of Object.entries(extraEnv)) {
      // Caller-supplied vars are applied (unless explicitly empty/null)
      if (v !== undefined && v !== null) {
        cleanEnv[k] = String(v)
      }
    }
  }

  return cleanEnv
}

module.exports = {
  isSensitiveEnvKey,
  sanitizeProcessEnv,
}
