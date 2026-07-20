import { useStore } from '@/store'

const THEMES: Record<string, Record<string, string>> = {
  light: {
    '--bg-primary': '#FFFFFF',
    '--bg-secondary': '#F8F9FA',
    '--border': '#E5E7EB',
    '--text-primary': '#1A1A1A',
    '--text-secondary': '#6B7280',
    '--text-muted': '#9CA3AF',
    '--accent': '#2563EB',
    '--accent-hover': '#1D4ED8',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(255,255,255,0.7)',
    '--glass-border': 'rgba(255,255,255,0.3)',
    '--content-bg-trans': 'rgba(255,255,255,0.82)',
    '--content-secondary-trans': 'rgba(255,255,255,0.6)',
    '--shadow-card': '0 1px 4px rgba(0,0,0,0.06)',
    '--btn-primary': 'bg-black text-white',
    '--btn-active': 'bg-black text-white',
  },
  dark: {
    '--bg-primary': '#1A1A2E',
    '--bg-secondary': '#16213E',
    '--border': '#2A2A4A',
    '--text-primary': '#E8E8F0',
    '--text-secondary': '#A0A0C0',
    '--text-muted': '#707090',
    '--accent': '#4F8BFF',
    '--accent-hover': '#3A6FD8',
    '--error': '#FF5555',
    '--success': '#50FA7B',
    '--warning': '#FFB86C',
    '--glass-bg': 'rgba(22,33,62,0.85)',
    '--glass-border': 'rgba(42,42,74,0.5)',
    '--content-bg-trans': 'rgba(26,26,46,0.82)',
    '--content-secondary-trans': 'rgba(22,33,62,0.6)',
    '--shadow-card': '0 2px 8px rgba(0,0,0,0.2)',
    '--btn-primary': 'bg-[#4F8BFF] text-white',
    '--btn-active': 'bg-[#4F8BFF] text-white',
  },
  blue: {
    '--bg-primary': '#F0F5FF',
    '--bg-secondary': '#E0EBFF',
    '--border': '#C0D5FF',
    '--text-primary': '#1A2A4A',
    '--text-secondary': '#4A6A9A',
    '--text-muted': '#7A9ABA',
    '--accent': '#2563EB',
    '--accent-hover': '#1D4ED8',
    '--error': '#DC2626',
    '--success': '#16A34A',
    '--warning': '#D97706',
    '--glass-bg': 'rgba(240,245,255,0.8)',
    '--glass-border': 'rgba(192,213,255,0.5)',
    '--content-bg-trans': 'rgba(240,245,255,0.82)',
    '--content-secondary-trans': 'rgba(224,235,255,0.65)',
    '--shadow-card': '0 1px 4px rgba(37,99,235,0.08)',
    '--btn-primary': 'bg-black text-white',
    '--btn-active': 'bg-black text-white',
  },
  glass: {
    '--bg-primary': '#0F0F1A',
    '--bg-secondary': 'rgba(255,255,255,0.06)',
    '--border': 'rgba(255,255,255,0.12)',
    '--text-primary': '#F0F0F5',
    '--text-secondary': '#A0A0C0',
    '--text-muted': '#707090',
    '--accent': '#6C63FF',
    '--accent-hover': '#5A52E0',
    '--error': '#FF5555',
    '--success': '#50FA7B',
    '--warning': '#FFB86C',
    '--glass-bg': 'rgba(255,255,255,0.08)',
    '--glass-border': 'rgba(255,255,255,0.15)',
    '--content-bg-trans': 'rgba(15,15,26,0.72)',
    '--content-secondary-trans': 'rgba(255,255,255,0.08)',
    '--shadow-card': '0 8px 32px rgba(108,99,255,0.15)',
    '--btn-primary': 'bg-[#6C63FF] text-white',
    '--btn-active': 'bg-[#6C63FF] text-white',
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
    '--shadow-card': '0 1px 4px rgba(61,50,41,0.08)',
    '--btn-primary': 'bg-[#B8860B] text-white',
    '--btn-active': 'bg-[#B8860B] text-white',
  },
}

export function applyTheme(theme: string, hasBackground = false) {
  const vars = THEMES[theme] || THEMES.light
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
}

export function getThemes() {
  return Object.keys(THEMES)
}
