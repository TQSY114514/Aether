const THEMES: Record<string, Record<string, string>> = {
  light: {
    '--bg-primary': '#FFFFFF',
    '--bg-secondary': '#F4F4F5',
    '--border': '#E4E4E7',
    '--text-primary': '#09090B',
    '--text-secondary': '#71717A',
    '--text-muted': '#A1A1AA',
    '--accent': '#18181B',
    '--accent-hover': '#27272A',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(255,255,255,0.7)',
    '--glass-border': 'rgba(228,228,231,0.6)',
    '--content-bg-trans': 'rgba(255,255,255,0.85)',
    '--content-secondary-trans': 'rgba(244,244,245,0.7)',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.05)',
  },
  dark: {
    '--bg-primary': '#09090B',
    '--bg-secondary': '#121215',
    '--border': '#27272A',
    '--text-primary': '#F4F4F5',
    '--text-secondary': '#A1A1AA',
    '--text-muted': '#71717A',
    '--accent': '#3B82F6',
    '--accent-hover': '#2563EB',
    '--error': '#EF4444',
    '--success': '#22C55E',
    '--warning': '#F59E0B',
    '--glass-bg': 'rgba(18,18,21,0.85)',
    '--glass-border': 'rgba(39,39,42,0.6)',
    '--content-bg-trans': 'rgba(9,9,11,0.85)',
    '--content-secondary-trans': 'rgba(18,18,21,0.7)',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.35)',
  },
  blue: {
    '--bg-primary': '#F8FAFC',
    '--bg-secondary': '#F1F5F9',
    '--border': '#CBD5E1',
    '--text-primary': '#0F172A',
    '--text-secondary': '#475569',
    '--text-muted': '#94A3B8',
    '--accent': '#2563EB',
    '--accent-hover': '#1D4ED8',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(248,250,252,0.85)',
    '--glass-border': 'rgba(203,213,225,0.6)',
    '--content-bg-trans': 'rgba(248,250,252,0.85)',
    '--content-secondary-trans': 'rgba(241,245,249,0.7)',
    '--shadow-card': '0 1px 3px rgba(15,23,42,0.06)',
  },
  glass: {
    '--bg-primary': '#0A0A0C',
    '--bg-secondary': 'rgba(255,255,255,0.04)',
    '--border': 'rgba(255,255,255,0.08)',
    '--text-primary': '#F4F4F5',
    '--text-secondary': '#A1A1AA',
    '--text-muted': '#71717A',
    '--accent': '#38BDF8',
    '--accent-hover': '#0284C7',
    '--error': '#EF4444',
    '--success': '#22C55E',
    '--warning': '#F59E0B',
    '--glass-bg': 'rgba(255,255,255,0.05)',
    '--glass-border': 'rgba(255,255,255,0.1)',
    '--content-bg-trans': 'rgba(10,10,12,0.75)',
    '--content-secondary-trans': 'rgba(255,255,255,0.05)',
    '--shadow-card': '0 4px 16px rgba(0,0,0,0.3)',
  },
  retro: {
    '--bg-primary': '#F5F0E8',
    '--bg-secondary': '#EDE5D8',
    '--border': '#D4C9B8',
    '--text-primary': '#3D3229',
    '--text-secondary': '#7A6B5D',
    '--text-muted': '#A69585',
    '--accent': '#B8860B',
    '--accent-hover': '#A0760A',
    '--error': '#BC3F3F',
    '--success': '#5A8F5A',
    '--warning': '#C4953A',
    '--glass-bg': 'rgba(245,240,232,0.85)',
    '--glass-border': 'rgba(212,201,184,0.5)',
    '--content-bg-trans': 'rgba(245,240,232,0.85)',
    '--content-secondary-trans': 'rgba(237,229,216,0.65)',
    '--shadow-card': '0 1px 3px rgba(61,50,41,0.06)',
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
    '--error': '#AUTO',
    '--success': '#AUTO',
    '--warning': '#AUTO',
    '--glass-bg': 'rgba(255,255,255,0.7)',
    '--glass-border': 'rgba(228,228,231,0.6)',
    '--content-bg-trans': 'rgba(255,255,255,0.85)',
    '--content-secondary-trans': 'rgba(244,244,245,0.7)',
    '--shadow-card': '0 1px 3px rgba(0,0,0,0.05)',
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

// setCleanup lets the caller register the cleanup function. When applyTheme
// is called again with a non-'auto' theme, the old listener is removed.
export function applyTheme(theme: string, hasBackground = false, setCleanup?: (fn: (() => void) | null) => void) {
  if (_autoCleanup) { _autoCleanup(); _autoCleanup = null }

  let resolved = theme
  if (theme === 'auto') {
    resolved = resolveAutoTheme()
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('auto', hasBackground, setCleanup)
      mq.addEventListener('change', handler)
      _autoCleanup = () => mq.removeEventListener('change', handler)
      if (setCleanup) setCleanup(() => { _autoCleanup?.(); _autoCleanup = null })
    }
  }

  const vars = THEMES[resolved] || THEMES.light
  const root = document.documentElement
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
    const isDark = resolved === 'dark' || resolved === 'cyberpunk' || resolved === 'retro'
    window.electronAPI.system.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: isDark ? '#E8E8F0' : '#374151',
      height: 34,
    }).catch(() => {})
  }
}

export function getThemes() {
  return Object.keys(THEMES)
}
