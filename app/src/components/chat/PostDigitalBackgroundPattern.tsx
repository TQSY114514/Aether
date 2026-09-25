import { memo } from 'react'

/**
 * PostDigitalBackgroundPattern: Post-Digital Brutalist Graphic Design System
 * 
 * Aesthetic Reference:
 * - High-density graphic editorial schematics & industrial machinery blueprints
 * - Base: Pure tactile paper gray (#F2F2F0), crisp ink lines (#111111)
 * - Accent: 5~10% Electric Signal Blue (#001AFF)
 * - Details: Micro-coordinate grids, registration crosshairs (+), corner framing brackets,
 *   monospace telemetry indicators (AGENT // 01, SPEC.REF, 40MM), binary matrix segments.
 * - Strict zero overflow, center-locked vector math.
 */
function PostDigitalBackgroundPattern() {
  return (
    <>
      <defs>
        {/* Precision 32mm Technical Engineering Grid */}
        <pattern id="pat-pd-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#111111" strokeWidth="0.5" strokeOpacity="0.045" />
          <circle cx="0" cy="0" r="0.75" fill="#111111" fillOpacity="0.16" />
        </pattern>

        {/* 128mm Major Grid with Center Dot */}
        <pattern id="pat-pd-major-grid" width="128" height="128" patternUnits="userSpaceOnUse">
          <path d="M 128 0 L 0 0 0 128" fill="none" stroke="#111111" strokeWidth="0.8" strokeOpacity="0.07" />
          {/* Micro crosshair at major intersection */}
          <path d="M -4 0 L 4 0 M 0 -4 L 0 4" stroke="#001AFF" strokeWidth="0.8" strokeOpacity="0.3" />
        </pattern>
      </defs>

      {/* Grid Underlays */}
      <rect width="100%" height="100%" fill="url(#pat-pd-grid)" />
      <rect width="100%" height="100%" fill="url(#pat-pd-major-grid)" />

      {/* ── Outer Registration Framing & Crosshairs ── */}
      <g stroke="#111111" strokeWidth="1" strokeOpacity="0.35" fill="none">
        {/* Top-Left Corner Bracket & Calibration Cross */}
        <path d="M 24 40 L 24 24 L 40 24" />
        <path d="M 28 28 L 36 28 M 32 24 L 32 32" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
        <text x="46" y="27" fill="#111111" fillOpacity="0.45" fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="1">SEC // 01 [TL]</text>

        {/* Top-Right Corner Bracket */}
        <path d="M 1416 40 L 1416 24 L 1400 24" />
        <path d="M 1404 28 L 1412 28 M 1408 24 L 1408 32" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
        <text x="1330" y="27" fill="#111111" fillOpacity="0.45" fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="1">REF // 44.09N</text>

        {/* Bottom-Left Corner Bracket */}
        <path d="M 24 860 L 24 876 L 40 876" />
        <path d="M 28 872 L 36 872 M 32 868 L 32 876" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
        <text x="46" y="873" fill="#111111" fillOpacity="0.45" fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="1">LATENCY // 0MS</text>

        {/* Bottom-Right Corner Bracket */}
        <path d="M 1416 860 L 1416 876 L 1400 876" />
        <path d="M 1404 872 L 1412 872 M 1408 868 L 1408 876" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
        <text x="1310" y="873" fill="#111111" fillOpacity="0.45" fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="1">SYS // POST-DIGITAL</text>
      </g>

      {/* ── Top Engineering Scale Ticks ── */}
      <g stroke="#111111" strokeWidth="0.8" strokeOpacity="0.25">
        <line x1="200" y1="24" x2="400" y2="24" />
        <line x1="200" y1="20" x2="200" y2="28" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
        <line x1="240" y1="22" x2="240" y2="26" />
        <line x1="280" y1="22" x2="280" y2="26" />
        <line x1="320" y1="22" x2="320" y2="26" />
        <line x1="360" y1="22" x2="360" y2="26" />
        <line x1="400" y1="20" x2="400" y2="28" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.6" />
      </g>

      {/* ── Top-Right Calibration Geometry (Technical Schematic Element) ── */}
      <g transform="translate(1240, 180)">
        {/* Precision Mechanical Reticle */}
        <circle r="110" fill="none" stroke="#111111" strokeWidth="0.8" strokeOpacity="0.10" />
        <circle r="88" fill="none" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.08" strokeDasharray="3 6" />
        <circle r="54" fill="none" stroke="#001AFF" strokeWidth="0.9" strokeOpacity="0.25" />
        <circle r="22" fill="none" stroke="#111111" strokeWidth="1" strokeOpacity="0.14" />
        <circle r="3" fill="#001AFF" fillOpacity="0.4" />

        {/* Diagonal Crosshairs */}
        <line x1="-120" y1="0" x2="120" y2="0" stroke="#111111" strokeWidth="0.5" strokeOpacity="0.12" strokeDasharray="4 4" />
        <line x1="0" y1="-120" x2="0" y2="120" stroke="#111111" strokeWidth="0.5" strokeOpacity="0.12" strokeDasharray="4 4" />

        {/* Cardinal Index Markers */}
        <text x="60" y="-8" fill="#111111" fillOpacity="0.30" fontSize="7" fontFamily="monospace">R.110</text>
        <text x="-95" y="16" fill="#001AFF" fillOpacity="0.45" fontSize="7" fontFamily="monospace" fontWeight="bold">SIG // 01</text>
      </g>

      {/* ── Center Right: Monospace Data Matrix Block ── */}
      <g transform="translate(1260, 360)" fill="#111111" fillOpacity="0.18" fontSize="7" fontFamily="monospace">
        <text x="0" y="0">01000001 01000101</text>
        <text x="0" y="12">01010100 01001000</text>
        <text x="0" y="24">01000101 01010010</text>
        <rect x="-6" y="-8" width="105" height="40" fill="none" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.12" strokeDasharray="4 3" />
        <rect x="-6" y="-8" width="8" height="4" fill="#001AFF" fillOpacity="0.5" />
      </g>

      {/* ── Left Side Alignment Rule & Station Marker ── */}
      <g transform="translate(36, 320)">
        <line x1="0" y1="0" x2="0" y2="180" stroke="#111111" strokeWidth="0.8" strokeOpacity="0.15" />
        <line x1="0" y1="0" x2="8" y2="0" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.5" />
        <line x1="0" y1="45" x2="5" y2="45" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="0" y1="90" x2="8" y2="90" stroke="#111111" strokeWidth="0.8" strokeOpacity="0.3" />
        <line x1="0" y1="135" x2="5" y2="135" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="0" y1="180" x2="8" y2="180" stroke="#001AFF" strokeWidth="1.2" strokeOpacity="0.5" />
        <text x="14" y="94" fill="#111111" fillOpacity="0.3" fontSize="8" fontFamily="monospace" transform="rotate(90, 14, 94)">STATION // 04</text>
      </g>

      {/* ── Bottom Technical Title Block (Spec Sheet Style) ── */}
      <g transform="translate(560, 856)">
        <rect x="0" y="0" width="320" height="26" fill="none" stroke="#111111" strokeWidth="0.8" strokeOpacity="0.20" />
        <line x1="160" y1="0" x2="160" y2="26" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.15" />
        <line x1="240" y1="0" x2="240" y2="26" stroke="#111111" strokeWidth="0.6" strokeOpacity="0.15" />
        <text x="10" y="16" fill="#111111" fillOpacity="0.4" fontSize="8" fontFamily="monospace" fontWeight="600">AETHER // AGENT WORKBENCH</text>
        <text x="170" y="16" fill="#111111" fillOpacity="0.4" fontSize="8" fontFamily="monospace">SPEC // 2026</text>
        <text x="248" y="16" fill="#001AFF" fillOpacity="0.6" fontSize="8" fontFamily="monospace" fontWeight="bold">REV // 02</text>
        <rect x="314" y="2" width="4" height="22" fill="#001AFF" fillOpacity="0.4" />
      </g>
    </>
  )
}

export default memo(PostDigitalBackgroundPattern)
