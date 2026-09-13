#!/usr/bin/env node
/**
 * gen-radar.cjs — generates localized radar SVGs in assets/
 *
 * Data source: SCORES below (self-assessed 2026-09 against v0.9.0, the latest
 * released tag). Per-axis rationale for the Aether row lives in
 * docs/competitive-analysis.md section 4; keep both in sync.
 * Generates:
 *   - assets/agent-radar-2026.svg (default zh-CN / canonical)
 *   - assets/agent-radar-2026.<lang>.svg for 14 supported locales:
 *     zh-CN, en, zh-TW, zh-WEN, ja, ko, de, fr, es, pt, ru, uk, ar, hi
 *
 * Layout:
 *   - 1000x760 canvas with ample margins
 *   - Top-right 4-row structured legend card (eliminates horizontal collisions)
 *   - Balanced 8-axis spokes (CX=500, CY=358, R=195)
 *   - Bottom matrix box at y=626 with 3 clean rows (avoids collision with 6 o'clock axis)
 *   - Auto-wrapping footnote
 *
 * Usage:
 *   node app/scripts/gen-radar.cjs               (generates all languages)
 *   node app/scripts/gen-radar.cjs --lang=en     (generates a specific language)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── 20 Competitor Benchmark Scores (2026-09, subjective 0-10 estimates) ────
// Axis order: Coding, General, Multi-provider, Ecosystem, Multi-agent, Safety,
//             Local & private, Desktop & TUI UX
const SCORES = {
  // Aether v0.9.0 — scored against what ships, not the roadmap:
  //   Coding 7.0        harness only (42 tools, LSP, repo map); no own model, no
  //                     published SWE-bench / Pass@1 numbers (evals/coding is tiny)
  //   General 7.0       same harness applied outside code; no browser/computer use
  //   Multi-provider 9.0 OpenAI-compatible / Claude / DeepSeek / Ollama + Arena +
  //                     ELO routing; OpenCode/Aider/Cline are equally BYOK
  //   Ecosystem 4.0     MCP / SKILL.md / hooks exist but are marked Experimental;
  //                     no third-party market, single-maintainer community
  //   Multi-agent 6.0   hierarchical planning is Experimental; Arena is
  //                     multi-model voting, not multi-agent orchestration
  //   Safety 7.0        app-layer whitelist + regex + realpath jail + optional
  //                     Docker backend; no OS-level sandbox (seatbelt/Landlock),
  //                     Windows-only
  //   Local 9.0         SQLite, no account, no telemetry; on par with OpenCode
  //   UX 6.5            Desktop chat is Stable; TUI/CLI/SDK are Experimental,
  //                     Windows-only, unsigned installer
  'Aether':             [7.0, 7.0, 9.0, 4.0, 6.0, 7.0, 9.0, 6.5],

  // 终端与混合编程 Agent (Terminal & Hybrid Coding Agents)
  'Claude Code':        [9.8, 6.5, 7.0, 9.8, 9.5,  9.0, 7.5, 8.0],
  'Codex':              [9.7, 8.0, 8.0, 9.5, 9.5,  9.8, 7.0, 9.0],
  'Amp':                [9.4, 7.5, 7.8, 8.5, 8.6,  8.8, 5.5, 9.2],
  'OpenCode':           [9.2, 6.8, 9.7, 9.0, 8.5,  8.5, 9.0, 8.3],
  'Aider':              [9.2, 6.5, 9.0, 8.0, 7.5,  8.0, 8.8, 7.0],
  'Gemini CLI':         [8.5, 8.2, 6.0, 8.8, 7.8,  8.6, 8.0, 7.6],
  'Kimi CLI':           [8.6, 7.5, 5.5, 8.0, 7.5,  8.2, 7.5, 7.2],

  // IDE 插件、云端 Review 与桌面 Agent (IDE, Cloud Review & Desktop Agents)
  'Cursor':             [9.7, 7.5, 7.0, 8.5, 8.5,  8.0, 6.5, 9.8],
  'Gemini Code Assist': [9.1, 8.5, 5.0, 8.8, 7.0,  8.8, 5.0, 8.2],
  'Windsurf':           [9.5, 7.2, 7.0, 8.3, 8.0,  8.0, 6.5, 9.6],
  'Trae':               [9.3, 7.5, 7.5, 8.5, 8.2,  8.0, 6.5, 9.6],
  'Cline':              [9.1, 7.2, 8.8, 9.4, 7.8,  8.2, 8.5, 8.8],
  'Roo Code':           [9.4, 7.8, 9.2, 9.5, 8.2,  8.5, 8.6, 8.8],
  'Continue':           [9.0, 7.2, 9.5, 9.2, 7.5,  8.0, 8.8, 8.5],
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

// ─── i18n Localization Dictionary ───────────────────────────────────────────
const I18N = {
  'zh-CN': {
    title: 'Aether · Agent 自评雷达',
    titleTag: '(2026-09 · 主观估计，非跑分)',
    subtitle: '对比 20 款主流 Agent 工具 · 8 维度自评',
    legendAether: 'Aether 自评 (v0.9.0)',
    legendPeerBest: '同类最佳包络 (20 款竞品峰值)',
    legendClaude: 'Claude Code (终端标杆)',
    legendCursor: 'Cursor (IDE 标杆)',
    leadBadge: '★领先',
    peakLabel: 'Peak',
    axes: [
      { primary: '编程 Agent', secondary: 'Coding' },
      { primary: '通用任务', secondary: 'General' },
      { primary: '多模型/供应商', secondary: 'Multi-provider' },
      { primary: '扩展生态', secondary: 'Ecosystem' },
      { primary: '多 Agent 编排', secondary: 'Multi-agent' },
      { primary: '安全/权限', secondary: 'Safety' },
      { primary: '本地/隐私', secondary: 'Local & private' },
      { primary: '桌面/终端双形态', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: '对比竞品矩阵（20款）：',
    catTerminal: '终端/混合',
    catIde: 'IDE/评审',
    catAuto: '自主平台',
    footnote: '自评，非跑分：Aether 在「多模型切换」与「本地隐私」上与同类最佳同档；编程、生态、多 Agent、安全、UX 与第一梯队仍有明确差距。逐轴依据见 docs/competitive-analysis.md。',
  },
  'en': {
    title: 'Aether · Agent Self-Assessment Radar',
    titleTag: '(2026-09 · subjective estimates, not benchmarks)',
    subtitle: 'Self-scored vs 20 Leading Agent Tools · 8 Dimensions',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Peer-Best Envelope (20 Peers Peak)',
    legendClaude: 'Claude Code (Terminal Benchmark)',
    legendCursor: 'Cursor (IDE Benchmark)',
    leadBadge: '★Lead',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Coding Agent', secondary: 'Coding' },
      { primary: 'General Tasks', secondary: 'General' },
      { primary: 'Multi-Provider', secondary: 'Multi-provider' },
      { primary: 'Extensibility & Ecosystem', secondary: 'Ecosystem' },
      { primary: 'Multi-Agent', secondary: 'Multi-agent' },
      { primary: 'Safety / Permissions', secondary: 'Safety' },
      { primary: 'Local & Privacy', secondary: 'Local & private' },
      { primary: 'Desktop & TUI UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Peer Benchmark Matrix (20 Tools):',
    catTerminal: 'Terminal / Hybrid',
    catIde: 'IDE / Review',
    catAuto: 'Autonomous',
    footnote: 'Self-assessed, not benchmarked: Aether is on par with peer-best at multi-provider and local privacy; coding, ecosystem, multi-agent, safety and UX still trail the top tier. Per-axis rationale: docs/competitive-analysis.md.',
  },
  'zh-TW': {
    title: 'Aether · Agent 自評雷達',
    titleTag: '(2026-09 · 主觀估計，非跑分)',
    subtitle: '對比 20 款主流 Agent 工具 · 8 維度自評',
    legendAether: 'Aether 自評 (v0.9.0)',
    legendPeerBest: '同類最佳包絡 (20 款競品峰值)',
    legendClaude: 'Claude Code (終端標竿)',
    legendCursor: 'Cursor (IDE 標竿)',
    leadBadge: '★領先',
    peakLabel: 'Peak',
    axes: [
      { primary: '編程 Agent', secondary: 'Coding' },
      { primary: '通用任務', secondary: 'General' },
      { primary: '多模型/供應商', secondary: 'Multi-provider' },
      { primary: '擴展生態', secondary: 'Ecosystem' },
      { primary: '多 Agent 編排', secondary: 'Multi-agent' },
      { primary: '安全/權限', secondary: 'Safety' },
      { primary: '本地/隱私', secondary: 'Local & private' },
      { primary: '桌面/終端雙形態', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: '對比競品矩陣（20款）：',
    catTerminal: '終端/混合',
    catIde: 'IDE/審查',
    catAuto: '自主平台',
    footnote: '自評，非跑分：Aether 在「多模型切換」與「本地隱私」上與同類最佳同檔；編程、生態、多 Agent、安全、UX 與第一梯隊仍有明確差距。逐軸依據見 docs/competitive-analysis.md。',
  },
  'zh-WEN': {
    title: 'Aether · 樞機經緯 躬自審度星網',
    titleTag: '(2026-09 · 平心權量，非競分)',
    subtitle: '衡較二十方名家樞機 · 八緯自度圖譜',
    legendAether: 'Aether 躬省度數 (v0.9.0)',
    legendPeerBest: '諸子冠絕包絡（二十家之峰）',
    legendClaude: 'Claude Code (端几之表率)',
    legendCursor: 'Cursor (工坊之表率)',
    leadBadge: '★冠首',
    peakLabel: '峰極',
    axes: [
      { primary: '運算籌策', secondary: 'Coding' },
      { primary: '庶務格物', secondary: 'General' },
      { primary: '萬宗並納', secondary: 'Multi-provider' },
      { primary: '百技兼容', secondary: 'Ecosystem' },
      { primary: '群策統御', secondary: 'Multi-agent' },
      { primary: '金城御侮', secondary: 'Safety' },
      { primary: '玄圃內隱', secondary: 'Local-first' },
      { primary: '几席端流雙修', secondary: 'Dual UX' },
    ],
    matrixLabel: '參互棋局（二十流）：',
    catTerminal: '端几/兼納',
    catIde: '工坊/詳校',
    catAuto: '玄機自主',
    footnote: '躬省而非競分：Aether 於「萬流並蓄」「本地隱默」與諸家之冠同列；運算、生態、群策、禦侮、几席諸緯，坦承猶遜於前列。逐緯所據，詳見 docs/competitive-analysis.md。',
  },
  'ja': {
    title: 'Aether · Agent 自己評価レーダー',
    titleTag: '(2026-09 · 主観的推定、ベンチマークではない)',
    subtitle: '主要エージェント20種との比較 · 8軸の自己評価',
    legendAether: 'Aether 自己評価 (v0.9.0)',
    legendPeerBest: '同種ベスト包絡線 (20種競合の最高値)',
    legendClaude: 'Claude Code (ターミナル基準)',
    legendCursor: 'Cursor (IDE 基準)',
    leadBadge: '★リード',
    peakLabel: 'Peak',
    axes: [
      { primary: 'コーディング Agent', secondary: 'Coding' },
      { primary: '汎用タスク', secondary: 'General' },
      { primary: '複数モデル / プロバイダー', secondary: 'Multi-provider' },
      { primary: '拡張エコシステム', secondary: 'Ecosystem' },
      { primary: 'マルチ Agent 編成', secondary: 'Multi-agent' },
      { primary: 'セキュリティ / 権限管理', secondary: 'Safety' },
      { primary: 'ローカル優先 / プライバシー', secondary: 'Local & private' },
      { primary: 'デスクトップ & TUI 両立', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: '比較対象エージェント（20種）：',
    catTerminal: 'ターミナル/ハイブリッド',
    catIde: 'IDE/レビュー',
    catAuto: '自律型プラットフォーム',
    footnote: '自己評価であり実測ではない: Aetherは「複数モデル切替」「ローカル・プライバシー」で同類最高と同水準。コーディング、生態系、マルチAgent、安全性、UXはトップ層に明確な差がある。各軸の根拠は docs/competitive-analysis.md。',
  },
  'ko': {
    title: 'Aether · Agent 자체 평가 레이더',
    titleTag: '(2026-09 · 주관적 추정, 벤치마크 아님)',
    subtitle: '20개 주요 에이전트 도구 비교 · 8개 축 자체 평가',
    legendAether: 'Aether 자체 평가 (v0.9.0)',
    legendPeerBest: '동급 최고 포락선 (20개 도구 최고점)',
    legendClaude: 'Claude Code (터미널 벤치마크)',
    legendCursor: 'Cursor (IDE 벤치마크)',
    leadBadge: '★선도',
    peakLabel: 'Peak',
    axes: [
      { primary: '코딩 Agent', secondary: 'Coding' },
      { primary: '일반 작업', secondary: 'General' },
      { primary: '다중 모델 / 공급자', secondary: 'Multi-provider' },
      { primary: '확장 생태계', secondary: 'Ecosystem' },
      { primary: '멀티 Agent 오케스트레이션', secondary: 'Multi-agent' },
      { primary: '보안 / 권한 통제', secondary: 'Safety' },
      { primary: '로컬 우선 / 프라이버시', secondary: 'Local & private' },
      { primary: '데스크톱 & TUI 듀얼 UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: '비교 대상 도구 매트릭스 (20종):',
    catTerminal: '터미널/하이브리드',
    catIde: 'IDE/리뷰',
    catAuto: '자율 플랫폼',
    footnote: '자체 평가이며 실측이 아님: Aether는 다중 모델 전환과 로컬 프라이버시에서 동급 최고와 같은 수준이며, 코딩·생태계·멀티 Agent·보안·UX는 최상위권과 분명한 격차가 있습니다. 축별 근거: docs/competitive-analysis.md.',
  },
  'de': {
    title: 'Aether · Agent Selbsteinschätzungs-Radar',
    titleTag: '(2026-09 · subjektive Schätzung, kein Benchmark)',
    subtitle: 'Selbstbewertung gegen 20 führende Agenten · 8 Dimensionen',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Peer-Best-Hüllkurve (20 Peers Peak)',
    legendClaude: 'Claude Code (Terminal-Referenz)',
    legendCursor: 'Cursor (IDE-Referenz)',
    leadBadge: '★Führend',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Coding-Agent', secondary: 'Coding' },
      { primary: 'Allgemeine Aufgaben', secondary: 'General' },
      { primary: 'Multi-Modell / Provider', secondary: 'Multi-provider' },
      { primary: 'Erweiterbarkeit & MCP', secondary: 'Ecosystem' },
      { primary: 'Multi-Agenten', secondary: 'Multi-agent' },
      { primary: 'Sicherheit / Rechte', secondary: 'Safety' },
      { primary: 'Lokal & Privatsphäre', secondary: 'Local & private' },
      { primary: 'Desktop & TUI Dual-UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Vergleichsmatrix (20 Tools):',
    catTerminal: 'Terminal / Hybrid',
    catIde: 'IDE / Review',
    catAuto: 'Autonom',
    footnote: 'Selbsteinschätzung, kein Benchmark: Aether liegt bei Multi-Provider und lokaler Privatsphäre gleichauf mit den Besten; Coding, Ökosystem, Multi-Agent, Sicherheit und UX bleiben klar hinter der Spitze. Begründung je Achse: docs/competitive-analysis.md.',
  },
  'fr': {
    title: 'Aether · Radar d\'auto-évaluation',
    titleTag: '(2026-09 · estimation subjective, pas un benchmark)',
    subtitle: 'Auto-évaluation face à 20 agents de pointe · 8 dimensions',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Enveloppe du meilleur pair (pic 20 pairs)',
    legendClaude: 'Claude Code (Réf. Terminal)',
    legendCursor: 'Cursor (Réf. IDE)',
    leadBadge: '★Leader',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Agent de code', secondary: 'Coding' },
      { primary: 'Tâches générales', secondary: 'General' },
      { primary: 'Multi-modèles / Fournisseurs', secondary: 'Multi-provider' },
      { primary: 'Écosystème & MCP', secondary: 'Ecosystem' },
      { primary: 'Multi-Agents', secondary: 'Multi-agent' },
      { primary: 'Sécurité / Permissions', secondary: 'Safety' },
      { primary: 'Local-first & Confidentialité', secondary: 'Local & private' },
      { primary: 'Double UX Bureau & TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matrice comparative (20 outils) :',
    catTerminal: 'Terminal / Hybride',
    catIde: 'IDE / Revue',
    catAuto: 'Autonome',
    footnote: 'Auto-évaluation, pas un benchmark : Aether est au niveau des meilleurs en multi-fournisseurs et confidentialité locale ; code, écosystème, multi-agents, sécurité et UX restent nettement derrière le haut du classement. Détail par axe : docs/competitive-analysis.md.',
  },
  'es': {
    title: 'Aether · Radar de autoevaluación',
    titleTag: '(2026-09 · estimación subjetiva, no benchmark)',
    subtitle: 'Autoevaluación frente a 20 herramientas de agentes líderes · 8 dimensiones',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Envolvente del mejor par (pico de 20 pares)',
    legendClaude: 'Claude Code (Ref. Terminal)',
    legendCursor: 'Cursor (Ref. IDE)',
    leadBadge: '★Líder',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Agente de código', secondary: 'Coding' },
      { primary: 'Tareas generales', secondary: 'General' },
      { primary: 'Multi-modelo / Proveedor', secondary: 'Multi-provider' },
      { primary: 'Ecosistema & MCP', secondary: 'Ecosystem' },
      { primary: 'Multi-Agente', secondary: 'Multi-agent' },
      { primary: 'Seguridad / Permisos', secondary: 'Safety' },
      { primary: 'Local y privacidad', secondary: 'Local & private' },
      { primary: 'UX dual Escritorio y TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matriz comparativa (20 herramientas):',
    catTerminal: 'Terminal / Híbrido',
    catIde: 'IDE / Revisión',
    catAuto: 'Autónomo',
    footnote: 'Autoevaluación, no benchmark: Aether está a la par de los mejores en multiproveedor y privacidad local; código, ecosistema, multiagente, seguridad y UX siguen claramente por detrás del primer nivel. Detalle por eje: docs/competitive-analysis.md.',
  },
  'pt': {
    title: 'Aether · Radar de Autoavaliação',
    titleTag: '(2026-09 · estimativa subjetiva, não benchmark)',
    subtitle: 'Autoavaliação frente a 20 ferramentas de agentes líderes · 8 dimensões',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Envelope do melhor par (pico de 20 pares)',
    legendClaude: 'Claude Code (Ref. Terminal)',
    legendCursor: 'Cursor (Ref. IDE)',
    leadBadge: '★Líder',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Agente de código', secondary: 'Coding' },
      { primary: 'Tarefas gerais', secondary: 'General' },
      { primary: 'Múltiplos modelos / Provedores', secondary: 'Multi-provider' },
      { primary: 'Ecossistema & MCP', secondary: 'Ecosystem' },
      { primary: 'Multi-Agentes', secondary: 'Multi-agent' },
      { primary: 'Segurança / Permissões', secondary: 'Safety' },
      { primary: 'Local-first e privacidade', secondary: 'Local & private' },
      { primary: 'UX dupla Desktop & TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matriz comparativa (20 ferramentas):',
    catTerminal: 'Terminal / Híbrido',
    catIde: 'IDE / Revisão',
    catAuto: 'Autônomo',
    footnote: 'Autoavaliação, não benchmark: Aether está no nível dos melhores em multiprovedor e privacidade local; código, ecossistema, multiagente, segurança e UX ainda ficam claramente atrás do topo. Detalhe por eixo: docs/competitive-analysis.md.',
  },
  'ru': {
    title: 'Aether · Радар самооценки',
    titleTag: '(2026-09 · субъективная оценка, не бенчмарк)',
    subtitle: 'Самооценка против 20 ведущих агентов · 8 измерений',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Огибающая лучших аналогов (пик 20 систем)',
    legendClaude: 'Claude Code (Эталон Terminal)',
    legendCursor: 'Cursor (Эталон IDE)',
    leadBadge: '★Лидер',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Агент разработки', secondary: 'Coding' },
      { primary: 'Общие задачи', secondary: 'General' },
      { primary: 'Мульти-модели / Провайдеры', secondary: 'Multi-provider' },
      { primary: 'Экосистема и MCP', secondary: 'Ecosystem' },
      { primary: 'Оркестрация мультиагентов', secondary: 'Multi-agent' },
      { primary: 'Безопасность / права', secondary: 'Safety' },
      { primary: 'Локальность и приватность', secondary: 'Local & private' },
      { primary: 'Двойной UX: десктоп и TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Матрица аналогов (20 инструментов):',
    catTerminal: 'Терминал / Гибрид',
    catIde: 'IDE / Ревью',
    catAuto: 'Автономные',
    footnote: 'Самооценка, не бенчмарк: Aether на уровне лучших по мультипровайдерам и локальной приватности; кодинг, экосистема, мультиагентность, безопасность и UX заметно отстают от лидеров. Обоснование по осям: docs/competitive-analysis.md.',
  },
  'uk': {
    title: 'Aether · Радар самооцінки',
    titleTag: '(2026-09 · суб\'єктивна оцінка, не бенчмарк)',
    subtitle: 'Самооцінка проти 20 провідних агентів · 8 вимірів',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'Обвідна найкращих аналогів (пік 20 систем)',
    legendClaude: 'Claude Code (Еталон Terminal)',
    legendCursor: 'Cursor (Еталон IDE)',
    leadBadge: '★Лідер',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Агент розробки', secondary: 'Coding' },
      { primary: 'Загальні завдання', secondary: 'General' },
      { primary: 'Мульти-моделі / Провайдери', secondary: 'Multi-provider' },
      { primary: 'Екосистема та MCP', secondary: 'Ecosystem' },
      { primary: 'Оркестрація мультиагентів', secondary: 'Multi-agent' },
      { primary: 'Безпека / права', secondary: 'Safety' },
      { primary: 'Локальність і приватність', secondary: 'Local & private' },
      { primary: 'Подвійний UX: десктоп і TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Матриця аналогів (20 інструментів):',
    catTerminal: 'Термінал / Гібрид',
    catIde: 'IDE / Рев\'ю',
    catAuto: 'Автономні',
    footnote: 'Самооцінка, не бенчмарк: Aether на рівні найкращих за мультипровайдерами та локальною приватністю; кодинг, екосистема, мультиагентність, безпека та UX помітно відстають від лідерів. Обґрунтування за осями: docs/competitive-analysis.md.',
  },
  'ar': {
    title: 'Aether · رادار التقييم الذاتي',
    titleTag: '(2026-09 · تقدير ذاتي، ليس معياراً قياسياً)',
    subtitle: 'تقييم ذاتي مقابل 20 وكيلاً رائداً · 8 أبعاد',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'غلاف أفضل الأقران (قمة 20 وكيلاً)',
    legendClaude: 'Claude Code (معيار الطرفية)',
    legendCursor: 'Cursor (معيار بيئة التطوير)',
    leadBadge: '★رائد',
    peakLabel: 'Peak',
    axes: [
      { primary: 'وكيل البرمجة', secondary: 'Coding' },
      { primary: 'المهام العامة', secondary: 'General' },
      { primary: 'تعدد النماذج / المزودين', secondary: 'Multi-provider' },
      { primary: 'التوسع ومنظومة MCP', secondary: 'Ecosystem' },
      { primary: 'تنسيق الوكلاء المتعددين', secondary: 'Multi-agent' },
      { primary: 'الأمان / الصلاحيات', secondary: 'Safety' },
      { primary: 'العمل المحلي والخصوصية', secondary: 'Local & private' },
      { primary: 'واجهة مزدوجة للمكتب والطرفية', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'مصفوفة مقارنة الأقران (20 أداة):',
    catTerminal: 'الطرفية / الهجين',
    catIde: 'بيئة التطوير / المراجعة',
    catAuto: 'المنصات الذاتية',
    footnote: 'تقييم ذاتي وليس معياراً: Aether بمستوى الأفضل في تعدد المزودين والخصوصية المحلية؛ أما البرمجة والمنظومة وتعدد الوكلاء والأمان وتجربة الاستخدام فلا تزال خلف الصف الأول بوضوح. التفاصيل لكل محور: docs/competitive-analysis.md.',
  },
  'hi': {
    title: 'Aether · आत्म-मूल्यांकन रडार',
    titleTag: '(2026-09 · व्यक्तिपरक अनुमान, बेंचमार्क नहीं)',
    subtitle: '20 प्रमुख एजेंट उपकरणों से तुलना · 8 आयामों का आत्म-मूल्यांकन',
    legendAether: 'Aether (v0.9.0)',
    legendPeerBest: 'समकक्ष-सर्वोत्तम आवरण (20 प्रतिस्पर्धियों का शिखर)',
    legendClaude: 'Claude Code (टर्मिनल बेंचमार्क)',
    legendCursor: 'Cursor (IDE बेंचमार्क)',
    leadBadge: '★अग्रणी',
    peakLabel: 'Peak',
    axes: [
      { primary: 'कोडिंग एजेंट', secondary: 'Coding' },
      { primary: 'सामान्य कार्य', secondary: 'General' },
      { primary: 'मल्टी-मॉडल / प्रदाता', secondary: 'Multi-provider' },
      { primary: 'विस्तार और MCP', secondary: 'Ecosystem' },
      { primary: 'मल्टी-एजेंट समन्वय', secondary: 'Multi-agent' },
      { primary: 'सुरक्षा / अनुमतियाँ', secondary: 'Safety' },
      { primary: 'स्थानीय और गोपनीयता', secondary: 'Local & private' },
      { primary: 'डेस्कटॉप और TUI दोहरा UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'प्रतिस्पर्धी मैट्रिक्स (20 उपकरण):',
    catTerminal: 'टर्मिनल / हाइब्रिड',
    catIde: 'IDE / समीक्षा',
    catAuto: 'स्वायत्त',
    footnote: 'आत्म-मूल्यांकन, बेंचमार्क नहीं: मल्टी-प्रदाता और स्थानीय गोपनीयता में Aether सर्वोत्तम के बराबर है; कोडिंग, इकोसिस्टम, मल्टी-एजेंट, सुरक्षा और UX शीर्ष स्तर से स्पष्ट रूप से पीछे हैं। प्रति-आयाम आधार: docs/competitive-analysis.md.',
  },
};

// ─── Geometry (Upgraded to 1000x760 with generous breathing room) ────────────
const W = 1000;
const H = 760;
const CX = 500;
const CY = 358;
const R = 195; // radius for score 10

const N = 8; // 8 axes
const angleAt = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N; // 12 o'clock start, clockwise
const pt = (i, v) => {
  const a = angleAt(i);
  const r = (v / 10) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const peerBest = Array.from({ length: N }, (_, i) => Math.max(...PEERS.map((p) => SCORES[p][i])));
const selfScores = SCORES[SELF];
const claudeScores = SCORES['Claude Code'];
const cursorScores = SCORES['Cursor'];

// ─── Render SVG for a specific locale ───────────────────────────────────────
function renderRadarSvg(lang = 'zh-CN') {
  const dict = I18N[lang] || I18N['en'];
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(dict.title)}">`);

  // Background panel
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#0d1117"/>`);
  parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="#21262d"/>`);

  // Header (Left aligned, max width 620px to avoid legend collision)
  parts.push(`<text x="40" y="44" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="19" font-weight="700" fill="#e6edf3">${esc(dict.title)} <tspan fill="#8b949e" font-weight="400" font-size="13.5">${esc(dict.titleTag)}</tspan></text>`);
  parts.push(`<text x="40" y="68" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="12" fill="#8b949e">${esc(dict.subtitle)}</text>`);

  // Legend Card (Top-right, framed in a clean card to eliminate horizontal collisions)
  const LX = W - 280; // 720
  const LY = 18;
  parts.push(`<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="11">`);
  parts.push(`<rect x="${LX}" y="${LY}" width="240" height="74" rx="6" fill="#161b22" stroke="#21262d"/>`);

  // Row 1: Aether
  parts.push(`<rect x="${LX + 12}" y="${LY + 10}" width="10" height="10" rx="2" fill="#6366f1" fill-opacity="0.36" stroke="#818cf8" stroke-width="1.8"/>`);
  parts.push(`<text x="${LX + 28}" y="${LY + 19}" fill="#e0e7ff" font-weight="600">${esc(dict.legendAether)}</text>`);

  // Row 2: Peer-best envelope
  parts.push(`<line x1="${LX + 12}" y1="${LY + 32}" x2="${LX + 22}" y2="${LY + 32}" stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  parts.push(`<text x="${LX + 28}" y="${LY + 35}" fill="#8b949e">${esc(dict.legendPeerBest)}</text>`);

  // Row 3: Claude Code & Cursor (two compact columns inside row 3)
  parts.push(`<line x1="${LX + 12}" y1="${LY + 52}" x2="${LX + 22}" y2="${LY + 52}" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.8"/>`);
  parts.push(`<text x="${LX + 28}" y="${LY + 55}" fill="#7dd3fc">${esc(dict.legendClaude)}</text>`);

  parts.push(`<line x1="${LX + 12}" y1="${LY + 67}" x2="${LX + 22}" y2="${LY + 67}" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.8"/>`);
  parts.push(`<text x="${LX + 28}" y="${LY + 70}" fill="#fcd34d">${esc(dict.legendCursor)}</text>`);
  parts.push(`</g>`);

  // Grid rings (scores 2, 4, 6, 8, 10) + spoke lines
  for (let v = 2; v <= 10; v += 2) {
    const ring = Array.from({ length: N }, (_, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
    const last = v === 10;
    parts.push(`<polygon points="${ring}" fill="none" stroke="${last ? '#30363d' : '#1f242c'}" stroke-width="${last ? 1.2 : 0.8}"/>`);
  }
  Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(i, 10);
    parts.push(`<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#21262d" stroke-width="1"/>`);
  });

  // Ring scale hints along top spoke
  [2, 4, 6, 8, 10].forEach((v) => {
    parts.push(`<text x="${CX + 6}" y="${CY - (v / 10) * R - 3}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="9" fill="#484f58">${v}</text>`);
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

  // Axis labels (localized primary + secondary subtitle + score badges)
  // Distance adjusted per direction to avoid edge collisions
  dict.axes.forEach((ax, i) => {
    const a = angleAt(i);
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    // Dynamic label offset distance
    const dist = i === 0 ? R + 26 : i === 4 ? R + 26 : R + 24;
    const lx = CX + dist * cos;
    const ly = CY + dist * sin;

    let anchor = 'middle';
    if (cos > 0.25) anchor = 'start';
    else if (cos < -0.25) anchor = 'end';

    // Vertical shift based on hemisphere
    const dy = sin < -0.7 ? -8 : sin > 0.7 ? 12 : 2;
    const selfScore = selfScores[i];
    const deltaNum = selfScore - peerBest[i];
    const delta = deltaNum.toFixed(1);
    const isTop = deltaNum > 0.05;
    const badge = isTop ? dict.leadBadge : Math.abs(deltaNum) < 0.05 ? '±0' : delta;

    parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="12.5" font-weight="600" fill="#e6edf3">${esc(ax.primary)} <tspan fill="${isTop ? '#4ade80' : '#a5b4fc'}" font-size="11.5" font-weight="700">${selfScore.toFixed(1)}</tspan><tspan fill="${isTop ? '#4ade80' : '#8b949e'}" font-size="10"> (${badge})</tspan></text>`);
    parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy + 14).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="9.5" fill="#6e7681">${esc(ax.secondary)} · ${dict.peakLabel} ${peerBest[i].toFixed(1)}</text>`);
  });

  // Competitor Matrix Category Summary (bottom box, 3 clean rows with ample margins)
  const BX = 40;
  const BY = 626;
  parts.push(`<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="10.5">`);
  parts.push(`<rect x="${BX}" y="${BY}" width="${W - 80}" height="76" rx="8" fill="#161b22" stroke="#21262d"/>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 17}" fill="#8b949e" font-weight="600">${esc(dict.matrixLabel)}</text>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 35}" fill="#c9d1d9">
  <tspan fill="#7dd3fc" font-weight="600">${esc(dict.catTerminal)}</tspan>: Claude Code · Codex · Amp · OpenCode · Aider · Gemini CLI · Kimi CLI
</text>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 51}" fill="#c9d1d9">
  <tspan fill="#fcd34d" font-weight="600">${esc(dict.catIde)}</tspan>: Cursor · Windsurf · Trae · Cline · Roo Code · Continue · Copilot · Gemini Code Assist
</text>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 67}" fill="#c9d1d9">
  <tspan fill="#c084fc" font-weight="600">${esc(dict.catAuto)}</tspan>: OpenHands · Devin · OpenClaw · DeepSeek Harness · Hermes Agent
</text>`);
  parts.push(`</g>`);

  // Footnote (Supports multi-line wrap if text exceeds 115 chars)
  const footnote = dict.footnote;
  if (footnote.length > 115) {
    let splitIdx = footnote.lastIndexOf('；', 110);
    if (splitIdx === -1) splitIdx = footnote.lastIndexOf('; ', 110);
    if (splitIdx === -1) splitIdx = footnote.lastIndexOf('. ', 110);
    if (splitIdx === -1) splitIdx = footnote.lastIndexOf(' ', 100);
    if (splitIdx === -1) splitIdx = 95;

    const line1 = footnote.slice(0, splitIdx + 1).trim();
    const line2 = footnote.slice(splitIdx + 1).trim();
    parts.push(`<text x="40" y="722" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="9.5" fill="#6e7681">${esc(line1)}</text>`);
    parts.push(`<text x="40" y="736" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="9.5" fill="#6e7681">${esc(line2)}</text>`);
  } else {
    parts.push(`<text x="40" y="728" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="9.5" fill="#6e7681">${esc(footnote)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ─── Main Execution ─────────────────────────────────────────────────────────
function main() {
  const assetsDir = path.join(__dirname, '..', '..', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const args = process.argv.slice(2);
  const langArg = args.find((a) => a.startsWith('--lang='));
  const targetLangs = langArg ? [langArg.split('=')[1]] : Object.keys(I18N);

  console.log(`Generating radar SVGs for locales: ${targetLangs.join(', ')}...`);

  targetLangs.forEach((lang) => {
    const svg = renderRadarSvg(lang);
    const outLangPath = path.join(assetsDir, `agent-radar-2026.${lang}.svg`);
    fs.writeFileSync(outLangPath, svg, 'utf8');
    console.log(`  ✓ written: ${outLangPath} (${svg.length} bytes)`);

    // Maintain assets/agent-radar-2026.svg as canonical default (points to zh-CN)
    if (lang === 'zh-CN') {
      const canonicalPath = path.join(assetsDir, 'agent-radar-2026.svg');
      fs.writeFileSync(canonicalPath, svg, 'utf8');
      console.log(`  ✓ written (canonical): ${canonicalPath}`);
    }
  });

  console.log('\nAll localized radar SVGs successfully generated.');
}

main();
