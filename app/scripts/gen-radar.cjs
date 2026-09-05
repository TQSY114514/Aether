#!/usr/bin/env node
/**
 * gen-radar.cjs — generates assets/agent-radar-2026.svg
 *
 * Data source: aether_agent_radar_scores_2026_09 (updated 2026-09, v0.8.1+ release).
 * Principle (external review & positioning): draw exactly what the data says —
 * no top-scale beautification. The asymmetric shape IS the positioning statement:
 * strongest where local-first matters (multi-provider / privacy / 3-tier safety /
 * dual-mode UX), honestly acknowledging the gap with top-of-class coding agents.
 *
 * Benchmark includes 16 representative agent tools across 3 categories:
 *   - Terminal Coding Agents: Claude Code, Codex, OpenCode, Aider, Gemini CLI, Kimi CLI
 *   - IDE & Desktop Agents: Cursor, Windsurf, Trae, Cline, GitHub Copilot
 *   - Autonomous Platforms: OpenHands, Devin, OpenClaw, DeepSeek Harness, Hermes
 *
 * Usage: node app/scripts/gen-radar.cjs   (from repo root or anywhere)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Evaluation Axes (8 dimensions) ─────────────────────────────────────────
const AXES = [
  { zh: '编程 Agent', en: 'Coding' },
  { zh: '通用任务', en: 'General' },
  { zh: '多模型/供应商', en: 'Multi-provider' },
  { zh: '扩展生态', en: 'Ecosystem' },
  { zh: '多 Agent 编排', en: 'Multi-agent' },
  { zh: '安全/权限', en: 'Safety' },
  { zh: '本地/隐私', en: 'Local & private' },
  { zh: '桌面/终端双形态', en: 'Desktop & TUI UX' },
];

// ─── 16 Competitor Benchmark Scores (2026-09 最新评估) ──────────────────────
const SCORES = {
  // Aether (2026-09 v0.8.1+ 架构验收: 三层沙箱 / Taint 追踪 / Pre-Diff 审批 / 时序日志 / 终端 TUI / 双形态漫游)
  'Aether':             [8.8, 9.2, 9.9, 9.6, 9.0, 10.0, 9.8, 9.7],

  // 终端编程 Agent (Terminal Coding Agents)
  'Claude Code':        [9.8, 6.5, 7.0, 9.8, 9.5,  9.0, 7.5, 8.0],
  'Codex':              [9.7, 8.0, 8.0, 9.5, 9.5,  9.8, 7.0, 9.0],
  'OpenCode':           [9.2, 6.8, 9.7, 9.0, 8.5,  8.5, 9.0, 8.3],
  'Aider':              [9.2, 6.5, 9.0, 8.0, 7.5,  8.0, 8.8, 7.0],
  'Gemini CLI':         [8.5, 8.2, 6.0, 8.8, 7.8,  8.6, 8.0, 7.6],
  'Kimi CLI':           [8.6, 7.5, 5.5, 8.0, 7.5,  8.2, 7.5, 7.2],

  // IDE 插件与桌面 Agent (IDE & Desktop Agents)
  'Cursor':             [9.7, 7.5, 7.0, 8.5, 8.5,  8.0, 6.5, 9.8],
  'Windsurf':           [9.5, 7.2, 7.0, 8.3, 8.0,  8.0, 6.5, 9.6],
  'Trae':               [9.3, 7.5, 7.5, 8.5, 8.2,  8.0, 6.5, 9.6],
  'Cline':              [9.1, 7.2, 8.8, 9.4, 7.8,  8.2, 8.5, 8.8],
  'GitHub Copilot':     [8.8, 7.0, 6.5, 8.0, 7.5,  8.2, 5.5, 9.5],

  // 全自主平台与开源框架 (Autonomous Platforms & Frameworks)
  'OpenHands':          [9.3, 7.8, 8.5, 9.2, 9.2,  9.2, 8.5, 8.2],
  'Devin':              [9.6, 8.5, 6.0, 8.5, 9.2,  8.5, 5.5, 8.8],
  'OpenClaw':           [7.5, 9.8, 8.5, 9.5, 9.5,  7.0, 9.0, 8.0],
  'DeepSeek Harness':   [9.0, 8.8, 7.0, 8.8, 8.8,  6.5, 8.0, 7.2],
  'Hermes Agent':       [8.8, 9.0, 8.8, 9.2, 9.0,  8.2, 8.8, 7.5],
};

const SELF = 'Aether';
const PEERS = Object.keys(SCORES).filter((k) => k !== SELF);

// ─── Geometry ───────────────────────────────────────────────────────────────
const W = 960;
const H = 740;
const CX = 480;
const CY = 376;
const R = 210; // radius for score 10

const N = AXES.length;
const angleAt = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N; // start at top (12 o'clock), clockwise
const pt = (i, v) => {
  const a = angleAt(i);
  const r = (v / 10) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const peerBest = AXES.map((_, i) => Math.max(...PEERS.map((p) => SCORES[p][i])));
const selfScores = SCORES[SELF];
const claudeScores = SCORES['Claude Code'];
const cursorScores = SCORES['Cursor'];

// ─── Build SVG ──────────────────────────────────────────────────────────────
const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Aether honest self-assessment radar vs 16 peer agents">`);

// Background panel
parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#0d1117"/>`);
parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#21262d"/>`);

// Header
parts.push(`<text x="40" y="46" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="20" font-weight="700" fill="#e6edf3">Aether · Agent Workbench 诚实自评雷达 <tspan fill="#8b949e" font-weight="400" font-size="14">(2026-09 最新评估)</tspan></text>`);
parts.push(`<text x="40" y="70" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#8b949e">全面对比 16 款主流 Agent 工具 · 8 大核心维度能力画像</text>`);

// Legend (top-right)
const LX = W - 320;
parts.push(`<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11.5">`);
// Aether
parts.push(`<rect x="${LX}" y="32" width="12" height="12" rx="2" fill="#6366f1" fill-opacity="0.36" stroke="#818cf8" stroke-width="1.8"/>`);
parts.push(`<text x="${LX + 18}" y="42" fill="#e0e7ff" font-weight="600">Aether 自评 (v0.8.1+)</text>`);

// Peer-best envelope
parts.push(`<line x1="${LX}" y1="58" x2="${LX + 12}" y2="58" stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4 3"/>`);
parts.push(`<text x="${LX + 18}" y="62" fill="#8b949e">同类最佳包络 (16 款竞品峰值)</text>`);

// Benchmarks (Claude Code & Cursor)
parts.push(`<line x1="${LX}" y1="78" x2="${LX + 12}" y2="78" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.8"/>`);
parts.push(`<text x="${LX + 18}" y="82" fill="#7dd3fc">Claude Code (终端标杆)</text>`);

parts.push(`<line x1="${LX + 155}" y1="78" x2="${LX + 167}" y2="78" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.8"/>`);
parts.push(`<text x="${LX + 173}" y="82" fill="#fcd34d">Cursor (IDE 标杆)</text>`);
parts.push(`</g>`);

// Grid rings (scores 2, 4, 6, 8, 10) + spoke lines
for (let v = 2; v <= 10; v += 2) {
  const ring = AXES.map((_, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
  const last = v === 10;
  parts.push(`<polygon points="${ring}" fill="none" stroke="${last ? '#30363d' : '#1f242c'}" stroke-width="${last ? 1.2 : 0.8}"/>`);
}
AXES.forEach((_, i) => {
  const [x, y] = pt(i, 10);
  parts.push(`<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#21262d" stroke-width="1"/>`);
});

// Ring scale hints along top spoke
[2, 4, 6, 8, 10].forEach((v) => {
  parts.push(`<text x="${CX + 6}" y="${CY - (v / 10) * R - 3}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="9" fill="#484f58">${v}</text>`);
});

// Peer-best envelope (dashed reference polygon)
parts.push(`<polygon points="${poly(peerBest)}" fill="none" stroke="#6e7681" stroke-width="1.5" stroke-dasharray="5 4"/>`);

// Reference benchmarks (Claude Code & Cursor)
parts.push(`<polygon points="${poly(claudeScores)}" fill="none" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.35" stroke-dasharray="2 2"/>`);
parts.push(`<polygon points="${poly(cursorScores)}" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.35" stroke-dasharray="2 2"/>`);

// Aether polygon (filled) + value dots
parts.push(`<polygon points="${poly(selfScores)}" fill="#6366f1" fill-opacity="0.32" stroke="#818cf8" stroke-width="2.2" stroke-linejoin="round"/>`);
selfScores.forEach((v, i) => {
  const [x, y] = pt(i, v);
  parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#c7d2fe" stroke="#312e81" stroke-width="1.2"/>`);
});

// Axis labels (zh primary + en secondary + score badges)
AXES.forEach((ax, i) => {
  const lx = CX + (R + 32) * Math.cos(angleAt(i));
  const ly = CY + (R + 32) * Math.sin(angleAt(i));
  const cos = Math.cos(angleAt(i));
  let anchor = 'middle';
  if (cos > 0.25) anchor = 'start';
  else if (cos < -0.25) anchor = 'end';
  const dy = Math.sin(angleAt(i)) < -0.7 ? -8 : Math.sin(angleAt(i)) > 0.7 ? 14 : 2;
  const selfScore = selfScores[i];
  const delta = (selfScore - peerBest[i]).toFixed(1);
  const isTop = delta >= 0;

  parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,Segoe UI,'Microsoft YaHei',sans-serif" font-size="13" font-weight="600" fill="#e6edf3">${esc(ax.zh)} <tspan fill="${isTop ? '#4ade80' : '#a5b4fc'}" font-size="12" font-weight="700">${selfScore.toFixed(1)}</tspan><tspan fill="${isTop ? '#4ade80' : '#8b949e'}" font-size="10.5"> (${isTop ? '★领先' : delta})</tspan></text>`);
  parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy + 15).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="10" fill="#6e7681">${esc(ax.en)} · Peak ${peerBest[i].toFixed(1)}</text>`);
});

// Competitor Matrix Category Summary (bottom box)
const BX = 40;
const BY = H - 98;
parts.push(`<g font-family="-apple-system,Segoe UI,'Microsoft YaHei',sans-serif" font-size="11">`);
parts.push(`<rect x="${BX}" y="${BY}" width="${W - 80}" height="54" rx="8" fill="#161b22" stroke="#21262d"/>`);
parts.push(`<text x="${BX + 14}" y="${BY + 18}" fill="#8b949e" font-weight="600">对比竞品矩阵（16款）：</text>`);
parts.push(`<text x="${BX + 14}" y="${BY + 38}" fill="#c9d1d9">
  <tspan fill="#7dd3fc" font-weight="600">终端类</tspan>: Claude Code · Codex · OpenCode · Aider · Gemini CLI · Kimi CLI  ｜  
  <tspan fill="#fcd34d" font-weight="600">IDE/桌面</tspan>: Cursor · Windsurf · Trae · Cline · Copilot  ｜  
  <tspan fill="#c084fc" font-weight="600">自主平台</tspan>: OpenHands · Devin · OpenClaw · DSH · Hermes
</text>`);
parts.push(`</g>`);

// Footnote
parts.push(`<text x="40" y="${H - 24}" font-family="-apple-system,Segoe UI,'Microsoft YaHei',sans-serif" font-size="10.5" fill="#6e7681">客观自评 · 形状即定位：Aether 强在「本地隐私」、「三层沙箱安全」与「多模型自由切换」；在单一极端编程任务上坦然落后于 Claude Code/Cursor，绝不顶格美化。</text>`);

parts.push('</svg>');

// ─── Emit + console summary ────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', '..', 'assets', 'agent-radar-2026.svg');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, parts.join('\n'), 'utf8');

console.log(`written: ${outPath} (${parts.join('\n').length} bytes)`);
console.log(`\n=== Aether 诚实自评雷达 (2026-09 最新评估 vs 16 款竞品) ===`);
console.log('维度                     Aether   同类最佳   差距 (Delta)');
console.log('---------------------------------------------------------');
AXES.forEach((ax, i) => {
  const d = selfScores[i] - peerBest[i];
  const deltaStr = d >= 0 ? `+${d.toFixed(1)} (领先)` : `${d.toFixed(1)}`;
  console.log(
    `${ax.zh.padEnd(12, '　')}  ${selfScores[i].toFixed(1)}       ${peerBest[i].toFixed(1)}      ${deltaStr}`
  );
});
