// Shared constants for the renderer (React) side.
// Centralized so components don't hardcode magic values independently.

/** Text file extensions recognized for attachment classification. */
export const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv',
  'py', 'js', 'ts', 'tsx', 'jsx',
  'go', 'rs', 'java', 'c', 'cpp', 'h',
  'html', 'css', 'xml',
  'yaml', 'yml', 'log', 'sh', 'sql',
  'ini', 'toml', 'env',
])

/** Maximum attachment size in bytes (10 MB). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Lines threshold: paste ≥ this many lines → collapse into chip. */
export const PASTE_COLLAPSE_LINES = 15

/** Characters threshold: paste ≥ this many chars → collapse into chip. */
export const PASTE_COLLAPSE_CHARS = 600

/** Default context window for unknown models (used in ContextBar). */
export const DEFAULT_CONTEXT_WINDOW = 128_000
