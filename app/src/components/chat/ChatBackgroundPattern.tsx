import { memo } from 'react'

interface ChatBackgroundPatternProps {
  theme?: string
  className?: string
}

/**
 * ChatBackgroundPattern: 全主题高保真动态矢量背景图案层
 * 
 * 针对各主题专属艺术意象进行定制设计：
 * - metalheart: 《月面梦记8树海》+ Andreas Lindholm Metalheart + Reconstruct 构成向拼贴（月面轨道环、植物树海、等高线、工业标尺）
 * - light: 现代极简建筑工程制图与包豪斯解构网格（32px 精密网格、圆弧规线、比例尺、角落校准符）
 * - dark: 深空天体测绘与赛博星座矩阵（深空坐标网格、星图几何连线、轨道椭圆、遥测印章）
 * - blue: 海洋声呐测深与水文等深线（洋底等高波纹、声呐同心圆弧、深度标记）
 * - retro: 80年代经典工程专利图纸（毫米坐标纸、圆规辅助弧、专利图注 FIG. 1 注册标符）
 */
function ChatBackgroundPatternComponent({ theme = 'light', className = '' }: ChatBackgroundPatternProps) {
  // Resolve 'auto' theme to current system preference
  const isDarkSystem = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolvedTheme = theme === 'auto' ? (isDarkSystem ? 'dark' : 'light') : theme

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none select-none z-0 overflow-hidden transition-opacity duration-700 ease-out ${className}`}
      style={{ opacity: 0.9 }}
    >
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        {/* =========================================================================
            1. METALHEART: 《月面梦记8宇宙唱片/9树海》+ Reconstruct 构成向拼贴
           ========================================================================= */}
        {resolvedTheme === 'metalheart' && (
          <>
            <defs>
              {/* Engineering Drafting Base Grid */}
              <pattern id="pat-metalheart-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#0284C7" strokeWidth="0.5" strokeOpacity="0.08" />
                <circle cx="0" cy="0" r="0.8" fill="#0284C7" fillOpacity="0.22" />
              </pattern>

              {/* Masking Tape Hatching Pattern */}
              <pattern id="pat-tape-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.12" />
              </pattern>

              {/* Vinyl Sheen & Light Diffraction */}
              <radialGradient id="grad-vinyl-body" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#334155" stopOpacity="0.18" />
                <stop offset="45%" stopColor="#1E293B" stopOpacity="0.24" />
                <stop offset="55%" stopColor="#475569" stopOpacity="0.18" />
                <stop offset="85%" stopColor="#1E293B" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity="0.36" />
              </radialGradient>

              {/* Specular Vinyl Reflection Wedge */}
              <linearGradient id="grad-vinyl-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>

              {/* Paper Collage Drop Shadow Filter */}
              <filter id="filter-collage-shadow" x="-8%" y="-8%" width="120%" height="120%">
                <feDropShadow dx="2" dy="5" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.07" />
              </filter>
            </defs>

            {/* Base Engineering Blueprint Grid */}
            <rect width="100%" height="100%" fill="url(#pat-metalheart-grid)" />

            {/* Mid-Right Angled Cyan Geometric Collage Plane */}
            <polygon
              points="980,320 1440,240 1440,680 920,540"
              fill="#E0F2FE"
              fillOpacity="0.22"
              stroke="#BAE6FD"
              strokeWidth="1"
            />

            {/* Diagonal Constructivist Slash Accent Band */}
            <polygon
              points="1020,380 1440,300 1440,324 1020,404"
              fill="#0284C7"
              fillOpacity="0.10"
            />

            {/* ── 宇宙唱片 (Cosmic Vinyl Record / Lunar Disc) ─────────────────────
                Directly recreating the iconic centerpiece from 《月面梦记8宇宙唱片》.
                Layered concentric grooves with light diffraction sheen & bilingual label */}
            <g transform="translate(980, 210) scale(0.76)">
              {/* Tone Arm & Stylus Trajectory Guide Arc */}
              <path
                d="M -320 -100 C -220 -40, -120 40, -40 140"
                fill="none"
                stroke="#0284C7"
                strokeWidth="1.2"
                strokeOpacity="0.2"
                strokeDasharray="4 6"
              />
              <circle cx="-40" cy="140" r="4" fill="#0284C7" fillOpacity="0.3" stroke="#0284C7" strokeWidth="1" />

              {/* Rotating Vinyl Disc Group */}
              <g className="lunar-celestial-spin">
                {/* Vinyl Record Outer Edge Rim */}
                <circle r="236" fill="url(#grad-vinyl-body)" stroke="#0F172A" strokeWidth="1.2" strokeOpacity="0.16" filter="url(#filter-collage-shadow)" />
                <circle r="235" fill="none" stroke="#FFFFFF" strokeWidth="0.8" strokeOpacity="0.20" />
                <circle r="230" fill="none" stroke="#38BDF8" strokeWidth="0.6" strokeOpacity="0.14" />

                {/* Dense Concentric Micro-Grooves (Soundtrack Audio Tracks) */}
                <circle r="222" fill="none" stroke="#FFFFFF" strokeWidth="0.5" strokeOpacity="0.10" />
                <circle r="215" fill="none" stroke="#0F172A" strokeWidth="0.6" strokeOpacity="0.12" strokeDasharray="12 4 8 4" />
                <circle r="207" fill="none" stroke="#FFFFFF" strokeWidth="0.4" strokeOpacity="0.08" />
                <circle r="198" fill="none" stroke="#38BDF8" strokeWidth="0.6" strokeOpacity="0.14" />
                <circle r="190" fill="none" stroke="#0F172A" strokeWidth="0.5" strokeOpacity="0.10" />
                <circle r="182" fill="none" stroke="#FFFFFF" strokeWidth="0.5" strokeOpacity="0.09" strokeDasharray="16 6" />
                <circle r="174" fill="none" stroke="#334155" strokeWidth="0.6" strokeOpacity="0.12" />
                <circle r="165" fill="none" stroke="#FFFFFF" strokeWidth="0.4" strokeOpacity="0.08" />
                <circle r="156" fill="none" stroke="#0284C7" strokeWidth="0.7" strokeOpacity="0.15" />
                <circle r="147" fill="none" stroke="#0F172A" strokeWidth="0.5" strokeOpacity="0.10" />
                <circle r="138" fill="none" stroke="#FFFFFF" strokeWidth="0.5" strokeOpacity="0.09" strokeDasharray="24 8" />
                <circle r="128" fill="none" stroke="#334155" strokeWidth="0.6" strokeOpacity="0.12" />
                <circle r="118" fill="none" stroke="#38BDF8" strokeWidth="0.8" strokeOpacity="0.16" />
                <circle r="108" fill="none" stroke="#FFFFFF" strokeWidth="0.4" strokeOpacity="0.08" />
                <circle r="98" fill="none" stroke="#0F172A" strokeWidth="0.7" strokeOpacity="0.14" />

                {/* Specular Vinyl Reflection Fans (Sheen) */}
                <path d="M 0 0 L 220 70 A 236 236 0 0 0 160 170 Z" fill="url(#grad-vinyl-sheen)" />
                <path d="M 0 0 L -220 -70 A 236 236 0 0 0 -160 -170 Z" fill="url(#grad-vinyl-sheen)" />

                {/* Run-out Groove Band */}
                <circle r="88" fill="none" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.22" strokeDasharray="4 8" />
                <circle r="82" fill="none" stroke="#334155" strokeWidth="0.8" strokeOpacity="0.15" />

                {/* Center Record Paper Label (Chalk White Tactile Badge) */}
                <circle r="75" fill="#FFFFFF" fillOpacity="0.94" stroke="#0284C7" strokeWidth="1.8" strokeOpacity="0.4" />
                <circle r="70" fill="none" stroke="#0284C7" strokeWidth="0.8" strokeOpacity="0.25" strokeDasharray="3 3" />
                <circle r="60" fill="#E0F2FE" fillOpacity="0.35" stroke="#BAE6FD" strokeWidth="0.8" />
                <line x1="-36" y1="0" x2="36" y2="0" stroke="#0284C7" strokeWidth="0.8" strokeOpacity="0.3" />

                {/* Record Spindle Hole with Metal Bushing Ring */}
                <circle r="15" fill="#CBD5E1" fillOpacity="0.5" stroke="#94A3B8" strokeWidth="1" />
                <circle r="10" fill="#F5F7FA" stroke="#0284C7" strokeWidth="1.2" strokeOpacity="0.6" />
                <circle r="5" fill="#0F172A" fillOpacity="0.7" />
              </g>

              {/* Stationary Outer Coordinate Ring & Degree Ticks */}
              <circle r="255" fill="none" stroke="#0284C7" strokeWidth="0.8" strokeOpacity="0.12" strokeDasharray="4 8" />
              <line x1="-275" y1="0" x2="-238" y2="0" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.25" />
              <line x1="238" y1="0" x2="275" y2="0" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.25" />
              <line x1="0" y1="-275" x2="0" y2="-238" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.25" />
              <line x1="0" y1="238" x2="0" y2="275" stroke="#0284C7" strokeWidth="1" strokeOpacity="0.25" />
            </g>

            {/* ── 树海 (Dense Botanical Forest-Sea Silhouettes) ───────────────────
                Rich multi-layer organic foliage rising across the bottom & left */}
            {/* Background Distant Forest Canopy Waves (Soft Cyan-Teal) */}
            <path
              d="M 0 680 C 140 640, 260 670, 380 630 C 500 590, 620 620, 750 580 C 880 540, 1020 570, 1180 520 C 1320 480, 1400 500, 1440 480 L 1440 900 L 0 900 Z"
              fill="#0284C7"
              fillOpacity="0.08"
            />

            {/* Midground Tree-Sea Silhouettes (Emerald `#059669`) */}
            <g fill="#059669" fillOpacity="0.14">
              {/* Botanical Pines & Shrubs Cluster 1 (X: 60 - 240) */}
              <path d="M 60 900 L 90 680 L 105 720 L 125 640 L 140 690 L 160 590 L 180 680 L 200 630 L 220 710 L 240 900 Z" />
              {/* Cluster 2 (X: 280 - 460) */}
              <path d="M 280 900 L 310 650 L 330 700 L 355 580 L 380 670 L 410 550 L 435 660 L 460 620 L 480 720 L 500 900 Z" />
              {/* Cluster 3 (X: 560 - 740) */}
              <path d="M 560 900 L 590 690 L 615 620 L 640 700 L 670 570 L 700 660 L 730 610 L 760 900 Z" />
              {/* Cluster 4 (X: 820 - 1020) */}
              <path d="M 820 900 L 850 670 L 870 710 L 895 610 L 920 680 L 950 570 L 975 660 L 1000 630 L 1020 900 Z" />
              {/* Cluster 5 (X: 1080 - 1340) */}
              <path d="M 1080 900 L 1110 680 L 1135 630 L 1160 700 L 1190 590 L 1220 670 L 1250 620 L 1280 690 L 1340 900 Z" />
            </g>

            {/* Foreground High-Detail Tree Silhouettes & Branches (Deep Emerald `#047857`) */}
            <g stroke="#047857" strokeOpacity="0.22" strokeLinecap="round" strokeLinejoin="round" fill="none">
              {/* Intricate Lone Conifer Tree 1 */}
              <path d="M 120 900 L 120 440" strokeWidth="3" />
              <path d="M 120 560 L 65 510 M 120 540 L 175 485 M 120 510 L 75 465 M 120 490 L 165 440 M 120 460 L 90 420 M 120 445 L 145 410" strokeWidth="2" />
              <path d="M 65 510 L 45 495 M 175 485 L 195 470 M 75 465 L 60 450 M 165 440 L 180 425" strokeWidth="1.2" />

              {/* Tall Slender Forest Tree 2 */}
              <path d="M 270 900 L 270 380" strokeWidth="3.5" />
              <path d="M 270 520 L 190 450 M 270 480 L 350 400 M 270 440 L 210 380 M 270 410 L 320 350 M 270 380 L 270 320" strokeWidth="2.2" />
              <path d="M 190 450 L 160 435 M 350 400 L 375 385 M 210 380 L 185 365 M 320 350 L 345 335" strokeWidth="1.4" />

              {/* Spreading Organic Branch Tree 3 */}
              <path d="M 430 900 L 430 480" strokeWidth="2.8" />
              <path d="M 430 620 L 370 560 M 430 580 L 485 520 M 430 540 L 385 490 M 430 510 L 470 460 M 430 480 L 430 420" strokeWidth="1.8" />

              {/* Tall Conifer Tree 4 (Right side X: 880) */}
              <path d="M 880 900 L 880 430" strokeWidth="3" />
              <path d="M 880 550 L 825 500 M 880 530 L 935 475 M 880 500 L 835 455 M 880 480 L 925 430" strokeWidth="2" />

              {/* Slender Branch Tree 5 (Right side X: 1140) */}
              <path d="M 1140 900 L 1140 460" strokeWidth="2.6" />
              <path d="M 1140 580 L 1090 530 M 1140 550 L 1195 500 M 1140 520 L 1100 480 M 1140 490 L 1180 450" strokeWidth="1.8" />

              {/* Foliage Canopy Pine Needle Density (Hatching) */}
              <path d="M 110 550 L 80 535 M 130 530 L 160 515 M 110 500 L 85 485 M 130 480 L 155 465" strokeWidth="1" />
              <path d="M 255 510 L 215 480 M 285 470 L 325 435 M 255 430 L 225 405 M 285 400 L 315 375" strokeWidth="1.2" />
              <path d="M 870 540 L 840 525 M 890 520 L 920 505 M 870 490 L 845 475" strokeWidth="1" />
            </g>

            {/* Organic Forest Floor Elevation Topography Contours */}
            <g stroke="#059669" fill="none" strokeOpacity="0.16" strokeWidth="1.2">
              <path d="M 0 820 C 240 760, 480 840, 720 780 C 960 720, 1200 800, 1440 740" />
              <path d="M 0 855 C 220 800, 500 870, 760 820 C 1020 770, 1240 840, 1440 795" />
              <path d="M 0 885 C 260 840, 520 895, 800 855 C 1080 815, 1280 875, 1440 845" />
            </g>



            {/* Industrial Barcode Decal Strip (Bottom-Right) */}
            <g transform="translate(1220, 810)">
              {/* Barcode Lines */}
              <g fill="#0284C7" fillOpacity="0.35">
                <rect x="0" y="0" width="2" height="28" />
                <rect x="4" y="0" width="1" height="28" />
                <rect x="7" y="0" width="3" height="28" />
                <rect x="13" y="0" width="1.5" height="28" />
                <rect x="17" y="0" width="4" height="28" />
                <rect x="23" y="0" width="1" height="28" />
                <rect x="26" y="0" width="2.5" height="28" />
                <rect x="31" y="0" width="1" height="28" />
                <rect x="34" y="0" width="3" height="28" />
                <rect x="40" y="0" width="2" height="28" />
                <rect x="44" y="0" width="4" height="28" />
                <rect x="51" y="0" width="1.5" height="28" />
                <rect x="55" y="0" width="2" height="28" />
                <rect x="60" y="0" width="3.5" height="28" />
                <rect x="66" y="0" width="1" height="28" />
                <rect x="70" y="0" width="2.5" height="28" />
                <rect x="75" y="0" width="1.5" height="28" />
                <rect x="79" y="0" width="3" height="28" />
                <rect x="85" y="0" width="2" height="28" />
                <rect x="90" y="0" width="1" height="28" />
                <rect x="93" y="0" width="3" height="28" />
              </g>
            </g>

            {/* Millimeter Precision Drafting Ruler (Bottom-Center) */}
            <g transform="translate(860, 840)" stroke="#0284C7" strokeOpacity="0.25" strokeWidth="0.8">
              <line x1="0" y1="0" x2="200" y2="0" />
              <line x1="0" y1="0" x2="0" y2="-10" />
              <line x1="20" y1="0" x2="20" y2="-4" />
              <line x1="40" y1="0" x2="40" y2="-7" />
              <line x1="60" y1="0" x2="60" y2="-4" />
              <line x1="80" y1="0" x2="80" y2="-7" />
              <line x1="100" y1="0" x2="100" y2="-10" />
              <line x1="120" y1="0" x2="120" y2="-4" />
              <line x1="140" y1="0" x2="140" y2="-7" />
              <line x1="160" y1="0" x2="160" y2="-4" />
              <line x1="180" y1="0" x2="180" y2="-7" />
              <line x1="200" y1="0" x2="200" y2="-10" />
            </g>

            {/* Camera Framing Crop Marks ⌜ ⌝ ⌞ ⌟ & Alignment Targets ✛ */}
            <g stroke="#0284C7" strokeWidth="1.2" strokeOpacity="0.35" fill="none">
              {/* Top-Left */}
              <path d="M 28 48 L 28 28 L 48 28" />
              <path d="M 38 38 L 44 38 M 41 35 L 41 41" />
              {/* Top-Right */}
              <path d="M 1412 48 L 1412 28 L 1392 28" />
              <path d="M 1402 38 L 1396 38 M 1399 35 L 1399 41" />
              {/* Bottom-Left */}
              <path d="M 28 852 L 28 872 L 48 872" />
              <path d="M 38 862 L 44 862 M 41 859 L 41 865" />
              {/* Bottom-Right */}
              <path d="M 1412 852 L 1412 872 L 1392 872" />
              <path d="M 1402 862 L 1396 862 M 1399 859 L 1399 865" />
            </g>
          </>
        )}

        {/* =========================================================================
            2. LIGHT: 建筑工程制图与包豪斯网格
           ========================================================================= */}
        {resolvedTheme === 'light' && (
          <>
            <defs>
              <pattern id="pat-light-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#09090B" strokeWidth="0.5" strokeOpacity="0.035" />
                <circle cx="0" cy="0" r="0.75" fill="#09090B" fillOpacity="0.08" />
              </pattern>
            </defs>

            {/* Base drafting grid */}
            <rect width="100%" height="100%" fill="url(#pat-light-grid)" />

            {/* Top-Right: Geometric Drafting Compass Arcs */}
            <g transform="translate(1200, 160)" stroke="#09090B" fill="none" strokeOpacity="0.05">
              <circle r="190" strokeWidth="1" strokeDasharray="4 6" />
              <circle r="140" strokeWidth="1.2" />
              <circle r="80" strokeWidth="0.8" strokeDasharray="2 4" />
              <line x1="-210" y1="0" x2="210" y2="0" strokeWidth="0.8" strokeDasharray="4 6" />
              <line x1="0" y1="-210" x2="0" y2="210" strokeWidth="0.8" strokeDasharray="4 6" />
              {/* 45 degree drafting projection line */}
              <line x1="-150" y1="-150" x2="150" y2="150" strokeWidth="0.8" strokeDasharray="3 5" />
            </g>

            {/* Bottom-Left: Diagonal Structural Guide Lines */}
            <g stroke="#09090B" fill="none" strokeOpacity="0.04" strokeWidth="1">
              <line x1="0" y1="600" x2="400" y2="900" />
              <line x1="0" y1="520" x2="480" y2="900" />
              <line x1="0" y1="440" x2="560" y2="900" />
            </g>

            {/* Architectural Framing Brackets at 4 Corners */}
            <g stroke="#09090B" strokeWidth="1.2" strokeOpacity="0.15" fill="none">
              <path d="M 30 50 L 30 30 L 50 30" />
              <path d="M 1410 50 L 1410 30 L 1390 30" />
              <path d="M 30 850 L 30 870 L 50 870" />
              <path d="M 1410 850 L 1410 870 L 1390 870" />
            </g>

            {/* Top-Right Scale Ruler */}
            <g transform="translate(1220, 40)" stroke="#09090B" strokeOpacity="0.14" strokeWidth="0.8">
              <line x1="0" y1="0" x2="140" y2="0" />
              <line x1="0" y1="0" x2="0" y2="6" />
              <line x1="35" y1="0" x2="35" y2="4" />
              <line x1="70" y1="0" x2="70" y2="6" />
              <line x1="105" y1="0" x2="105" y2="4" />
              <line x1="140" y1="0" x2="140" y2="6" />
            </g>
          </>
        )}

        {/* =========================================================================
            3. DARK: 深空星图与赛博坐标矩阵
           ========================================================================= */}
        {resolvedTheme === 'dark' && (
          <>
            <defs>
              <pattern id="pat-dark-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#38BDF8" strokeWidth="0.5" strokeOpacity="0.03" />
                <circle cx="0" cy="0" r="0.9" fill="#38BDF8" fillOpacity="0.10" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#pat-dark-grid)" />

            {/* Top-Right: Orbital Constellation Nodes */}
            <g transform="translate(1180, 200)">
              {/* Elliptical orbit */}
              <ellipse cx="0" cy="0" rx="230" ry="110" fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.06" transform="rotate(-15)" />
              <ellipse cx="0" cy="0" rx="160" ry="75" fill="none" stroke="#818CF8" strokeWidth="0.8" strokeOpacity="0.05" strokeDasharray="5 5" transform="rotate(-15)" />

              {/* Connected Star Chart Nodes */}
              <g stroke="#38BDF8" strokeOpacity="0.12" strokeWidth="0.8" fill="#38BDF8">
                <line x1="-120" y1="-40" x2="-40" y2="30" />
                <line x1="-40" y1="30" x2="60" y2="-20" />
                <line x1="60" y1="-20" x2="140" y2="50" />
                <line x1="60" y1="-20" x2="90" y2="-90" />
                <circle cx="-120" cy="-40" r="2.5" fillOpacity="0.25" />
                <circle cx="-40" cy="30" r="2" fillOpacity="0.20" />
                <circle cx="60" cy="-20" r="3" fillOpacity="0.30" />
                <circle cx="140" cy="50" r="2" fillOpacity="0.20" />
                <circle cx="90" cy="-90" r="2.5" fillOpacity="0.25" />
              </g>

              {/* Crosshair telemetry marker */}
              <g stroke="#38BDF8" strokeOpacity="0.18" strokeWidth="0.8">
                <circle cx="60" cy="-20" r="10" fill="none" strokeDasharray="3 3" />
                <line x1="45" y1="-20" x2="75" y2="-20" />
                <line x1="60" y1="-35" x2="60" y2="-5" />
              </g>
            </g>

            {/* Bottom-Left: Cybernetic Perspective Grid lines */}
            <g stroke="#818CF8" fill="none" strokeOpacity="0.04" strokeWidth="1">
              <line x1="200" y1="900" x2="0" y2="650" />
              <line x1="380" y1="900" x2="0" y2="550" />
              <line x1="560" y1="900" x2="0" y2="450" />
            </g>

            {/* Corner Alignment Targets */}
            <g stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.20">
              <circle cx="35" cy="35" r="5" fill="none" />
              <circle cx="1405" cy="35" r="5" fill="none" />
              <circle cx="35" cy="865" r="5" fill="none" />
              <circle cx="1405" cy="865" r="5" fill="none" />
            </g>
          </>
        )}

        {/* =========================================================================
            4. BLUE: 海洋声呐测深与水文等深线
           ========================================================================= */}
        {resolvedTheme === 'blue' && (
          <>
            <defs>
              <pattern id="pat-blue-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2563EB" strokeWidth="0.5" strokeOpacity="0.035" />
                <circle cx="0" cy="0" r="0.75" fill="#2563EB" fillOpacity="0.08" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#pat-blue-grid)" />

            {/* Ocean Bathymetry Waves across bottom and right */}
            <g stroke="#2563EB" fill="none" strokeOpacity="0.06" strokeWidth="1.3">
              <path d="M 0 760 C 350 680, 750 840, 1440 650" />
              <path d="M 0 690 C 400 620, 800 770, 1440 580" />
              <path d="M 0 620 C 450 560, 850 700, 1440 510" />
              <path d="M 0 550 C 500 500, 900 630, 1440 440" />
            </g>

            {/* Top-Right: Sonar Concentric Arcs */}
            <g transform="translate(1220, 140)" stroke="#0EA5E9" fill="none" strokeOpacity="0.07">
              <circle r="220" strokeWidth="1" strokeDasharray="6 8" />
              <circle r="160" strokeWidth="1.2" />
              <circle r="100" strokeWidth="0.8" strokeDasharray="3 5" />
              <circle r="40" strokeWidth="1.5" />
              <line x1="-240" y1="0" x2="40" y2="0" strokeWidth="0.8" strokeDasharray="4 6" />
              <line x1="0" y1="-40" x2="0" y2="240" strokeWidth="0.8" strokeDasharray="4 6" />
            </g>

          </>
        )}



        {/* =========================================================================
            6. RETRO: 经典工程专利图纸与复古排版
           ========================================================================= */}
        {resolvedTheme === 'retro' && (
          <>
            <defs>
              <pattern id="pat-retro-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#B8860B" strokeWidth="0.5" strokeOpacity="0.05" />
                <circle cx="0" cy="0" r="0.8" fill="#B8860B" fillOpacity="0.10" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#pat-retro-grid)" />

            {/* Top-Right: Vintage Compass Geometry & Patent Target */}
            <g transform="translate(1200, 160)" stroke="#B8860B" fill="none" strokeOpacity="0.08">
              <circle r="180" strokeWidth="1.2" />
              <circle r="130" strokeWidth="0.8" strokeDasharray="4 4" />
              <circle r="80" strokeWidth="1" />
              <circle r="30" strokeWidth="1.5" />
              <line x1="-200" y1="0" x2="200" y2="0" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1="-200" x2="0" y2="200" strokeWidth="0.8" strokeDasharray="3 3" />
            </g>

            {/* Bottom-Right: Retro Patent Figure Box */}
            <g transform="translate(1120, 820)" stroke="#B8860B" strokeOpacity="0.18">
              <rect x="0" y="0" width="260" height="50" fill="none" strokeWidth="1" />
              <line x1="0" y1="25" x2="260" y2="25" strokeWidth="0.8" strokeDasharray="4 4" />
            </g>

            {/* Vintage Alignment Target Crosses ⊕ */}
            <g stroke="#B8860B" strokeWidth="1" strokeOpacity="0.22" fill="none">
              <circle cx="35" cy="35" r="8" />
              <line x1="23" y1="35" x2="47" y2="35" />
              <line x1="35" y1="23" x2="35" y2="47" />

              <circle cx="1405" cy="35" r="8" />
              <line x1="1393" y1="35" x2="1417" y2="35" />
              <line x1="1405" y1="23" x2="1405" y2="47" />

              <circle cx="35" cy="865" r="8" />
              <line x1="23" y1="865" x2="47" y2="865" />
              <line x1="35" y1="853" x2="35" y2="877" />
            </g>
          </>
        )}
      </svg>
    </div>
  )
}

export default memo(ChatBackgroundPatternComponent)
