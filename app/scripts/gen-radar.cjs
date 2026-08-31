#!/usr/bin/env node
/**
 * gen-radar.cjs — generates assets/agent-radar-2026.svg
 *
 * Data source: aether_agent_radar_scores_2026.csv (2026-08, embedded below verbatim).
 * Principle (external review, 2026-08): draw exactly what the data says —
 * no top-scale beautification. The asymmetric shape IS the positioning
 * statement: strongest where local-first matters (multi-provider / privacy /
 * safety / UX), honestly not top-of-class at raw coding yet.
 *
 * Usage: node app/scripts/gen-radar.cjs   (from repo root or anywhere)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Data (verbatim from the 2026-08 CSV) ──────────────────────────────────
const AXES = [
  { zh: '编程 Agent', en: 'Coding' },
  { zh: '通用任务', en: 'General' },
  { zh: '多模型/供应商', en: 'Multi-provider' },
  { zh: '扩展生态', en: 'Ecosystem' },
  { zh: '多 Agent 编排', en: 'Multi-agent' },
  { zh: '安全/权限', en: 'Safety' },
  { zh: '本地/隐私', en: 'Local & private' },
  { zh: '桌面/终端 UX', en: 'Desktop & TUI UX' },
];

const SCORES = {
  'Aether':      [8.5, 9.0, 9.8, 9.5, 8.5, 9.9, 9.5, 9.5],
  'Claude Code': [9.8, 6.5, 7.0, 9.8, 9.5, 9.0, 7.5, 8.0],
  'Codex':       [9.7, 8.0, 8.0, 9.5, 9.5, 9.8, 7.0, 9.0],
  'OpenCode':    [9.2, 6.5, 9.7, 9.0, 8.5, 8.5, 9.0, 8.3],
  'Cursor':      [9.7, 7.5, 6.5, 8.5, 8.5, 8.0, 6.5, 9.8],
  'Cline':       [9.0, 7.0, 8.5, 9.2, 7.5, 7.5, 8.5, 9.0],
  'OpenClaw':    [7.5, 9.8, 8.5, 9.5, 9.5, 7.0, 9.0, 8.0],
  'Gemini CLI':  [8.3, 8.0, 6.0, 8.5, 7.5, 8.5, 8.0, 7.5],
  'OpenHands':   [9.2, 7.5, 8.0, 9.0, 9.0, 9.0, 8.5, 8.0],
};

const SELF = 'Aether';
const PEERS = Object.keys(SCORES).filter((k) => k !== SELF);

// ─── Geometry ───────────────────────────────────────────────────────────────
const W = 900;
const H = 688;
const CX = 450;
const CY = 356;
const R = 205; // radius for score 10

const N = AXES.length;
const angleAt = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N; // start at top, clockwise
const pt = (i, v) => {
  const a = angleAt(i);
  const r = (v / 10) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const peerBest = AXES.map((_, i) => Math.max(...PEERS.map((p) => SCORES[p][i])));
const selfScores = SCORES[SELF];

// ─── Build SVG ──────────────────────────────────────────────────────────────
const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Aether honest self-assessment radar vs peer agents">`);

// Dark panel so the chart reads identically on GitHub light & dark themes.
parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#0d1117"/>`);
parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#21262d"/>`);

// Header
parts.push(`<text x="40" y="52" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="21" font-weight="700" fill="#e6edf3">Aether · Agent Workbench 自评雷达 <tspan fill="#8b949e" font-weight="400" font-size="15">Honest self-radar</tspan></text>`);
parts.push(`<text x="40" y="78" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12.5" fill="#8b949e">vs ${esc(PEERS.join(' / '))}</text>`);

// Legend (top-right)
parts.push(`<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12">`);
parts.push(`<rect x="${W - 292}" y="40" width="14" height="14" fill="#6366f1" fill-opacity="0.32" stroke="#818cf8" stroke-width="1.5"/><text x="${W - 272}" y="51" fill="#c9d1d9">Aether 自评</text>`);
parts.push(`<line x1="${W - 292}" y1="70" x2="${W - 278}" y2="70" stroke="#6e7681" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - 272}" y="74" fill="#8b949e">同类最佳（对照）</text>`);
parts.push(`</g>`);

// Grid rings (scores 2..10) + spoke lines
for (let v = 2; v <= 10; v += 2) {
  const ring = AXES.map((_, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
  const last = v === 10;
  parts.push(`<polygon points="${ring}" fill="none" stroke="${last ? '#30363d' : '#21262d'}" stroke-width="${last ? 1.2 : 1}"/>`);
}
AXES.forEach((_, i) => {
  const [x, y] = pt(i, 10);
  parts.push(`<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#21262d" stroke-width="1"/>`);
});
// Ring scale hints along the first spoke
[2, 4, 6, 8, 10].forEach((v) => {
  parts.push(`<text x="${CX + 6}" y="${CY - (v / 10) * R - 3}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="9.5" fill="#484f58">${v}</text>`);
});

// Axis labels (zh primary + en secondary), anchored by side
AXES.forEach((ax, i) => {
  const lx = CX + (R + 30) * Math.cos(angleAt(i));
  const ly = CY + (R + 30) * Math.sin(angleAt(i));
  const cos = Math.cos(angleAt(i));
  let anchor = 'middle';
  if (cos > 0.25) anchor = 'start';
  else if (cos < -0.25) anchor = 'end';
  const dy = Math.sin(angleAt(i)) < -0.7 ? -6 : Math.sin(angleAt(i)) > 0.7 ? 12 : 2;
  const selfScore = selfScores[i];
  const gap = (selfScore - peerBest[i]).toFixed(1);
  parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,Segoe UI,'Microsoft YaHei',sans-serif" font-size="13" font-weight="600" fill="#c9d1d9">${esc(ax.zh)} <tspan fill="${gap >= 0 ? '#3fb950' : '#8b949e'}" font-size="11">${selfScore.toFixed(1)}</tspan></text>`);
  parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy + 15).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="10" fill="#6e7681">${esc(ax.en)}</text>`);
});

// Peer-best envelope (context line, dashed)
parts.push(`<polygon points="${poly(peerBest)}" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-dasharray="5 4"/>`);

// Aether polygon (filled) + value dots
parts.push(`<polygon points="${poly(selfScores)}" fill="#6366f1" fill-opacity="0.30" stroke="#818cf8" stroke-width="2" stroke-linejoin="round"/>`);
selfScores.forEach((v, i) => {
  const [x, y] = pt(i, v);
  parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#a5b4fc" stroke="#0d1117" stroke-width="1"/>`);
});

// Footnote
parts.push(`<text x="40" y="${H - 40}" font-family="-apple-system,Segoe UI,'Microsoft YaHei',sans-serif" font-size="11.5" fill="#8b949e">自评估计，非跑分——基于公开资料与日常使用印象（2026-08，Aether v0.8.0+ 验收阶段）。形状即定位：强在「本地优先」与「安全」轴，编程能力稳步逼近第一梯队。</text>`);
parts.push(`<text x="40" y="${H - 20}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="10.5" fill="#484f58">Self-scored estimates, not benchmarks (public info, 2026-08, v0.8.0+). The asymmetric shape is the point.</text>`);

parts.push('</svg>');

// ─── Emit + console summary ────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', '..', 'assets', 'agent-radar-2026.svg');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, parts.join('\n'), 'utf8');

console.log(`written: ${outPath} (${parts.join('\n').length} bytes)`);
console.log('\naxis            self  peerBest  delta');
AXES.forEach((ax, i) => {
  const d = selfScores[i] - peerBest[i];
  console.log(
    `${ax.zh.padEnd(8, '　')}  ${selfScores[i].toFixed(1)}     ${peerBest[i].toFixed(1)}    ${d >= 0 ? '+' : ''}${d.toFixed(1)}`
  );
});
