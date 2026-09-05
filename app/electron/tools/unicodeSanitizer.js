// ───────────────────────────────────────────────────────────────────────────
// Unicode Sanitizer & Anti-Steganography / Homoglyph Defense (Phase 2 Security)
//
// Addresses attacks disclosed in:
//   - QVD-2026-57410 & Tencent Zhuque Lab Agent injection benchmark:
//     "unicode_hidden" bypass rate was 25.5% against standard regex/LLMs.
//   - Claude Code reverse engineering (BV1KDNA6eEgr):
//     Steganographic tracking using Unicode apostrophe homoglyphs (U+2019,
//     U+02BC, U+02B9) and zero-width/invisible characters to bypass filters.
//
// Design:
//   - CJK-Safe: Does NOT mangle Chinese standard punctuation (，。、“”！？：；).
//   - Folds fullwidth Latin letters (ａ-ｚ, Ａ-Ｚ) and digits (０-９) into ASCII.
//   - Strips invisible & zero-width characters (ZWSP, ZWNJ, ZWJ, WJ, BOM, BiDi).
//   - Canonicalizes modifier homoglyphs (U+02BC, U+02B9) into canonical ASCII.
// ───────────────────────────────────────────────────────────────────────────

// Zero-width & invisible characters:
// \u200B: Zero-width space
// \u200C: Zero-width non-joiner
// \u200D: Zero-width joiner
// \u2060: Word joiner
// \uFEFF: Zero-width no-break space / Byte Order Mark
// \u00AD: Soft hyphen
// \u200E, \u200F: Left-to-Right & Right-to-Left marks
// \u202A-\u202E: BiDi embedding & overrides
// \u2066-\u2069: BiDi isolates
// \uFE00-\uFE0F: Variation Selectors 1-16
const INVISIBLE_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2066-\u2069\uFE00-\uFE0F]/gu

// Non-printable control codes (except tab \t, newline \n, CR \r)
const NON_PRINTABLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

// Fullwidth Latin (Ａ-Ｚ, ａ-ｚ, ０-９, and ideographic space \u3000)
const FULLWIDTH_LATIN_RE = /[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]/g

// Modifier accents / apostrophe homoglyphs (U+02BC, U+02B9, U+02CA, U+02CB)
// Note: We deliberately exclude Chinese quotes \u201C\u201D to protect CJK prose
const MODIFIER_APOSTROPHES = /[\u02BC\u02B9\u02CA\u02CB\u2032\u2035]/g
const LOOKALIKE_SLASHES = /[\u2044\u2215]/g
const LOOKALIKE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g

/**
 * Folds full-width Latin letters and digits to ASCII without touching CJK punctuation.
 */
function foldFullWidthLatin(text) {
  if (typeof text !== 'string') return String(text ?? '')
  return text
    .replace(FULLWIDTH_LATIN_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
}

/**
 * Remove all invisible, zero-width, and BiDi override characters.
 */
function stripInvisibleChars(text) {
  if (typeof text !== 'string') return String(text ?? '')
  return text.replace(INVISIBLE_CHARS_RE, '').replace(NON_PRINTABLE_RE, '')
}

/**
 * Canonicalize modifier homoglyphs (apostrophes, hyphens, slashes) to standard ASCII.
 * Preserves Chinese punctuation (，。、“”！？).
 */
function canonicalizeHomoglyphs(text) {
  if (typeof text !== 'string') return String(text ?? '')
  return text
    .replace(MODIFIER_APOSTROPHES, "'")
    .replace(LOOKALIKE_DASHES, '-')
    .replace(LOOKALIKE_SLASHES, '/')
}

/**
 * CJK-safe Unicode sanitization pipeline:
 * 1. Folds fullwidth Latin letters/digits (ｉｇｎｏｒｅ -> ignore).
 * 2. Strips invisible & zero-width steganography.
 * 3. Canonicalizes modifier homoglyphs.
 */
function sanitizeUnicode(text) {
  if (typeof text !== 'string') return String(text ?? '')
  let s = foldFullWidthLatin(text)
  s = stripInvisibleChars(s)
  s = canonicalizeHomoglyphs(s)
  return s
}

/**
 * Detect presence of invisible/steganographic characters.
 * Useful for telemetry, audit logs, and prompt injection warnings.
 */
function detectHiddenUnicode(text) {
  if (typeof text !== 'string') return { hasHidden: false, count: 0, types: [] }
  const matches = text.match(INVISIBLE_CHARS_RE) || []
  const count = matches.length
  const types = new Set()
  for (const ch of matches) {
    const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
    types.add(`U+${code}`)
  }
  return {
    hasHidden: count > 0,
    count,
    types: Array.from(types),
  }
}

module.exports = {
  foldFullWidthLatin,
  stripInvisibleChars,
  canonicalizeHomoglyphs,
  sanitizeUnicode,
  detectHiddenUnicode,
}
