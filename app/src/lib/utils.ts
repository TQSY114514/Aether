// ───────────────────────────────────────────────────────────────────────────
// cn() — minimal class joiner (shadcn methodology, zero-dep).
//
// Real shadcn uses clsx + tailwind-merge. tailwind-merge's value is deduping
// conflicting Tailwind classes (e.g. "p-2 p-4" → "p-4"); we implement a small
// version that handles the common conflict cases (padding/margin/text/bg/border
// sizes) so the API matches without pulling in a dependency. For non-conflicting
// or one-off classes it behaves like clsx.
//
// Usage: cn('px-2', cond && 'bg-black', { 'opacity-50': disabled }, 'p-4')
// ───────────────────────────────────────────────────────────────────────────

type ClassValue = string | number | null | false | undefined | ClassValue[] | { [k: string]: boolean | null | undefined }

// Flatten clsx-style inputs into a string of class tokens.
function flatten(v: ClassValue, out: string[]): void {
  if (!v) return
  if (typeof v === 'string' || typeof v === 'number') { out.push(String(v)); return }
  if (Array.isArray(v)) { for (const x of v) flatten(x, out); return }
  if (typeof v === 'object') {
    for (const k of Object.keys(v)) if (v[k]) out.push(k)
  }
}

// Tailwind utility prefixes where later values should override earlier ones.
// We group by the prefix so "p-2 p-4" → keep "p-4", but "p-2 px-4" → keep both.
const CONFLICT_PREFIXES = [
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
  'text', 'bg', 'border', 'rounded', 'shadow', 'font', 'leading', 'tracking',
  'gap', 'space-x', 'space-y', 'z', 'opacity', 'inset', 'top', 'right', 'bottom', 'left',
]
const prefixRegex = new RegExp('^(' + CONFLICT_PREFIXES.join('|') + ')(?:-)?')

// Dedupe conflicting Tailwind classes: for each conflict group, the last value wins.
function dedupeTailwind(tokens: string[]): string[] {
  const winners = new Map<string, string>() // prefix-group → winning token
  const passthrough: string[] = []
  for (const tok of tokens) {
    const m = tok.match(prefixRegex)
    if (m) {
      // Use the matched prefix as the conflict key; last one wins.
      winners.set(m[1], tok)
    } else {
      passthrough.push(tok)
    }
  }
  return [...passthrough, ...winners.values()]
}

export function cn(...inputs: ClassValue[]): string {
  const flat: string[] = []
  for (const i of inputs) flatten(i, flat)
  return dedupeTailwind(flat).join(' ')
}
