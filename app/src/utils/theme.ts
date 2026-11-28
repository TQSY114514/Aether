const THEMES: Record<string, Record<string, string>> = {
  light: {
    '--bg-primary': '#FAFAFA',
    '--bg-secondary': '#F2F2F4',
    '--border': '#E4E4E7',
    '--text-primary': '#111113',
    '--text-secondary': '#52525B',
    '--text-muted': '#8E8E96',
    '--accent': '#18181B',
    '--accent-hover': '#27272A',
    '--accent-fg': '#FFFFFF',
    '--link': '#2563EB',
    '--link-hover': '#1D4ED8',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(250,250,250,0.85)',
    '--glass-border': 'rgba(228,228,231,0.6)',
    '--content-bg-trans': 'rgba(255,255,255,0.88)',
    '--content-secondary-trans': 'rgba(242,242,244,0.75)',
    '--shadow-card': '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.025)',
    '--badge-digest': '#475569',
  },
  dark: {
    '--bg-primary': '#0D0D10',
    '--bg-secondary': '#141418',
    '--border': '#232329',
    '--text-primary': '#ECECEF',
    '--text-secondary': '#A0A0AB',
    '--text-muted': '#6E6E7A',
    '--accent': '#4E8EEB',
    '--accent-hover': '#3B7DDD',
    '--accent-fg': '#FFFFFF',
    '--link': '#60A5FA',
    '--link-hover': '#93C5FD',
    '--error': '#EF4444',
    '--success': '#22C55E',
    '--warning': '#F59E0B',
    '--glass-bg': 'rgba(20,20,24,0.88)',
    '--glass-border': 'rgba(35,35,41,0.6)',
    '--content-bg-trans': 'rgba(13,13,16,0.88)',
    '--content-secondary-trans': 'rgba(20,20,24,0.75)',
    '--shadow-card': '0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
    '--badge-digest': '#3F3F46',
  },
  blue: {
    '--bg-primary': '#F7F9FC',
    '--bg-secondary': '#EEF2F7',
    '--border': '#D5DFEC',
    '--text-primary': '#0F172A',
    '--text-secondary': '#475569',
    '--text-muted': '#8796AB',
    '--accent': '#2563EB',
    '--accent-hover': '#1D4ED8',
    '--accent-fg': '#FFFFFF',
    '--link': '#2563EB',
    '--link-hover': '#1D4ED8',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(247,249,252,0.88)',
    '--glass-border': 'rgba(213,223,236,0.6)',
    '--content-bg-trans': 'rgba(247,249,252,0.88)',
    '--content-secondary-trans': 'rgba(238,242,247,0.75)',
    '--shadow-card': '0 1px 3px rgba(15,23,42,0.04)',
    '--badge-digest': '#475569',
  },
  retro: {
    '--bg-primary': '#F6F2EA',
    '--bg-secondary': '#ECE5D8',
    '--border': '#D8CEBE',
    '--text-primary': '#2C241D',
    '--text-secondary': '#6E5F51',
    '--text-muted': '#9C8B7A',
    '--accent': '#9A6B2F',
    '--accent-hover': '#825823',
    '--accent-fg': '#FFFFFF',
    '--link': '#9A6B2F',
    '--link-hover': '#825823',
    '--error': '#BC3F3F',
    '--success': '#4D8050',
    '--warning': '#C4882B',
    '--glass-bg': 'rgba(246,242,234,0.88)',
    '--glass-border': 'rgba(216,206,190,0.5)',
    '--content-bg-trans': 'rgba(246,242,234,0.88)',
    '--content-secondary-trans': 'rgba(236,229,216,0.7)',
    '--shadow-card': '0 1px 3px rgba(44,36,29,0.05)',
    '--badge-digest': '#6B5E52',
  },
  metalheart: {
    '--bg-primary': '#F5F7FA',
    '--bg-secondary': '#FFFFFF',
    '--border': '#D5DDE7',
    '--text-primary': '#0F172A',
    '--text-secondary': '#475569',
    '--text-muted': '#8898AA',
    '--accent': '#0284C7',
    '--accent-hover': '#0369A1',
    '--accent-fg': '#FFFFFF',
    '--link': '#0369A1',
    '--link-hover': '#075985',
    '--error': '#E11D48',
    '--success': '#059669',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(255, 255, 255, 0.88)',
    '--glass-border': 'rgba(213, 221, 231, 0.7)',
    '--content-bg-trans': 'rgba(245, 247, 250, 0.88)',
    '--content-secondary-trans': 'rgba(255, 255, 255, 0.82)',
    '--shadow-card': '0 2px 10px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    '--badge-digest': '#475569',
  },
  postdigital: {
    '--bg-primary': '#F2F2F0',
    '--bg-secondary': '#FFFFFF',
    '--border': '#111111',
    '--text-primary': '#050505',
    '--text-secondary': '#404040',
    '--text-muted': '#737373',
    '--accent': '#001AFF',
    '--accent-hover': '#0014CC',
    '--accent-fg': '#FFFFFF',
    '--link': '#001AFF',
    '--link-hover': '#0014CC',
    '--error': '#DC2626',
    '--success': '#059669',
    '--warning': '#D97706',
    '--glass-bg': '#F2F2F0',
    '--glass-border': '#111111',
    '--content-bg-trans': 'rgba(242, 242, 240, 0.92)',
    '--content-secondary-trans': 'rgba(255, 255, 255, 0.9)',
    '--shadow-card': '2px 2px 0px #111111',
    '--badge-digest': '#333333',
  },
  auto: {
    '--bg-primary': '#AUTO',
    '--bg-secondary': '#AUTO',
    '--border': '#AUTO',
    '--text-primary': '#AUTO',
    '--text-secondary': '#AUTO',
    '--text-muted': '#AUTO',
    '--accent': '#AUTO',
    '--accent-hover': '#AUTO',
    '--accent-fg': '#AUTO',
    '--link': '#AUTO',
    '--link-hover': '#AUTO',
    '--error': '#AUTO',
    '--success': '#AUTO',
    '--warning': '#AUTO',
    '--glass-bg': 'rgba(255,255,255,0.7)',
    '--glass-border': 'rgba(228,228,231,0.6)',
    '--content-bg-trans': 'rgba(255,255,255,0.85)',
    '--content-secondary-trans': 'rgba(244,244,245,0.7)',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.05)',
    '--badge-digest': '#AUTO',
  },
}

// Auto-theme listener: stored at module level so applyTheme can tear it
// down when switching away from 'auto'. setCleanup is a setter provided
// by the caller (store) to register the cleanup fn for later disposal.
let _autoCleanup: (() => void) | null = null

function resolveAutoTheme(): string {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** Apply a named theme and register any listener cleanup it requires. */
export function applyTheme(theme: string, hasBackground = false, setCleanup?: (fn: (() => void) | null) => void) {
  if (_autoCleanup) { _autoCleanup(); _autoCleanup = null }

  let resolved = theme
  if (resolved === 'glass') resolved = 'dark'
  if (theme === 'auto' || theme === 'system') {
    resolved = resolveAutoTheme()
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme(theme, hasBackground, setCleanup)
      mq.addEventListener('change', handler)
      _autoCleanup = () => mq.removeEventListener('change', handler)
      if (setCleanup) setCleanup(() => { _autoCleanup?.(); _autoCleanup = null })
    }
  }

  const vars = THEMES[resolved] || THEMES.light
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  // When a custom background image is active, make content surfaces translucent
  // so the image shows through; otherwise use the solid surface color.
  const solid = vars['--bg-primary']
  root.style.setProperty('--content-bg', hasBackground
    ? (vars['--content-bg-trans'] || 'rgba(255,255,255,0.78)')
    : solid)
  root.style.setProperty('--content-secondary', hasBackground
    ? (vars['--content-secondary-trans'] || 'rgba(255,255,255,0.55)')
    : (vars['--bg-secondary'] || solid))

  // Sync native Window Controls Overlay buttons color with theme
  if (typeof window !== 'undefined' && window.electronAPI?.system?.setTitleBarOverlay) {
    const isDark = resolved === 'dark'
    window.electronAPI.system.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: isDark ? '#E8E8F0' : '#374151',
      height: 48,
    }).catch(() => {})
  }
}

export function getThemes() {
  return Object.keys(THEMES)
}
