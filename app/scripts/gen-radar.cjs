#!/usr/bin/env node
/**
 * gen-radar.cjs — generates localized radar SVGs in assets/
 *
 * Data source: aether_agent_radar_scores_2026_09 (updated 2026-09, v0.8.1+ release).
 * Generates:
 *   - assets/agent-radar-2026.svg (default zh-CN / canonical)
 *   - assets/agent-radar-2026.<lang>.svg for 14 supported locales:
 *     zh-CN, en, zh-TW, zh-WEN, ja, ko, de, fr, es, pt, ru, uk, ar, hi
 *
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
 * Usage:
 *   node app/scripts/gen-radar.cjs               (generates all languages)
 *   node app/scripts/gen-radar.cjs --lang=en     (generates a specific language)
 */
'use strict';

const fs = require('fs');
const path = require('path');

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

// ─── i18n Localization Dictionary ───────────────────────────────────────────
const I18N = {
  'zh-CN': {
    title: 'Aether · Agent Workbench 诚实自评雷达',
    titleTag: '(2026-09 最新评估)',
    subtitle: '全面对比 16 款主流 Agent 工具 · 8 大核心维度能力画像',
    legendAether: 'Aether 自评 (v0.8.1+)',
    legendPeerBest: '同类最佳包络 (16 款竞品峰值)',
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
    matrixLabel: '对比竞品矩阵（16款）：',
    catTerminal: '终端类',
    catIde: 'IDE/桌面',
    catAuto: '自主平台',
    footnote: '客观自评 · 形状即定位：Aether 强在「本地隐私」、「三层沙箱安全」与「多模型自由切换」；在单一极端编程任务上坦然落后于 Claude Code/Cursor，绝不顶格美化。',
  },
  'en': {
    title: 'Aether · Agent Workbench Honest Self-Assessment Radar',
    titleTag: '(2026-09 Latest Assessment)',
    subtitle: 'Comprehensive Benchmark vs 16 Leading Agent Tools · 8 Core Dimensions',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Peer-Best Envelope (16 Peers Peak)',
    legendClaude: 'Claude Code (Terminal Benchmark)',
    legendCursor: 'Cursor (IDE Benchmark)',
    leadBadge: '★Lead',
    peakLabel: 'Peak',
    axes: [
      { primary: 'Coding Agent', secondary: 'Specialized Task' },
      { primary: 'General Tasks', secondary: 'Autonomous Scope' },
      { primary: 'Multi-Provider', secondary: 'Zero-Lockin BYOK' },
      { primary: 'Extensibility', secondary: 'MCP & Skills' },
      { primary: 'Multi-Agent', secondary: 'Sub-Agent Routing' },
      { primary: '3-Tier Safety', secondary: 'Diff & Taint Sandbox' },
      { primary: 'Local & Privacy', secondary: 'SQLite & Zero-Telemetry' },
      { primary: 'Desktop & TUI Dual UX', secondary: 'GUI & Terminal Sync' },
    ],
    matrixLabel: 'Peer Benchmark Matrix (16 Tools):',
    catTerminal: 'Terminal',
    catIde: 'IDE/Desktop',
    catAuto: 'Autonomous',
    footnote: 'Honest Self-Assessment · Shape as Positioning: Aether excels in local privacy, 3-tier sandbox safety, and multi-provider agility; raw coding trails Claude Code/Cursor without artificial inflating.',
  },
  'zh-TW': {
    title: 'Aether · Agent Workbench 誠實自評雷達',
    titleTag: '(2026-09 最新評估)',
    subtitle: '全面對比 16 款主流 Agent 工具 · 8 大核心維度能力畫像',
    legendAether: 'Aether 自評 (v0.8.1+)',
    legendPeerBest: '同類最佳包絡 (16 款競品峰值)',
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
    matrixLabel: '對比競品矩陣（16款）：',
    catTerminal: '終端類',
    catIde: 'IDE/桌面',
    catAuto: '自主平台',
    footnote: '客觀自評 · 形狀即定位：Aether 強在「本地隱私」、「三層沙箱安全」與「多模型自由切換」；在單一極端編程任務上坦然落後於 Claude Code/Cursor，絕不頂格美化。',
  },
  'zh-WEN': {
    title: 'Aether · 樞機經緯 躬自審度星網',
    titleTag: '(2026-09 最新驗度)',
    subtitle: '衡較十六方名家樞機 · 八緯至極能力圖譜',
    legendAether: 'Aether 躬省度數 (v0.8.1+)',
    legendPeerBest: '諸子冠絕包絡（十六家之峰）',
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
    matrixLabel: '參互棋局（十六流）：',
    catTerminal: '端几',
    catIde: '工坊/几席',
    catAuto: '玄機自主',
    footnote: '直筆省度 · 形神歸位：Aether 雄於「本地隱默」、「三重營壘安全」及「萬流並蓄」；純藝運算則坦承弗及 Claude Code 與 Cursor，絕不矯飾虛榮。',
  },
  'ja': {
    title: 'Aether · Agent Workbench 正直な自己評価レーダー',
    titleTag: '(2026-09 最新評価)',
    subtitle: '主要エージェント16種との徹底比較 · 8大コア能力プロファイル',
    legendAether: 'Aether 自己評価 (v0.8.1+)',
    legendPeerBest: '同種ベスト包絡線 (16種競合の最高値)',
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
    matrixLabel: '比較対象エージェント（16種）：',
    catTerminal: 'ターミナル',
    catIde: 'IDE/デスクトップ',
    catAuto: '自律型プラットフォーム',
    footnote: '客観的自己評価 · 形状こそが位置づけ: Aetherは「ローカル・プライバシー」「3層サンドボックス」「複数モデル切替」でリード。過度な美化を排し、単一コーディングでのClaude Code/Cursorとの差を率直に提示。',
  },
  'ko': {
    title: 'Aether · Agent Workbench 솔직한 자체 평가 레이더',
    titleTag: '(2026-09 최신 평가)',
    subtitle: '16개 주요 에이전트 도구 비교 · 8대 핵심 역량 프로파일',
    legendAether: 'Aether 자체 평가 (v0.8.1+)',
    legendPeerBest: '동급 최고 포락선 (16개 도구 최고점)',
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
    matrixLabel: '비교 대상 도구 매트릭스 (16종):',
    catTerminal: '터미널',
    catIde: 'IDE/데스크톱',
    catAuto: '자율 플랫폼',
    footnote: '솔직한 자체 평가 · 형태가 곧 포지셔닝: Aether는 로컬 프라이버시, 3단계 샌드박스, 다중 모델 전환에서 우수하며, 순수 코딩에서의 Claude Code/Cursor 대비 격차를 과장 없이 솔직하게 인정합니다.',
  },
  'de': {
    title: 'Aether · Agent Workbench Ehrliches Selbsteinschätzungs-Radar',
    titleTag: '(2026-09 Bewertung)',
    subtitle: 'Benchmark gegen 16 führende Agenten · 8 Kernkompetenzen',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Peer-Best-Hüllkurve (16 Peers Peak)',
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
      { primary: '3-Stufen-Sicherheit', secondary: 'Safety' },
      { primary: 'Lokal & Privatsphäre', secondary: 'Local & private' },
      { primary: 'Desktop & TUI Dual-UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Vergleichsmatrix (16 Tools):',
    catTerminal: 'Terminal',
    catIde: 'IDE/Desktop',
    catAuto: 'Autonom',
    footnote: 'Ehrliche Selbsteinschätzung · Form als Positionierung: Aether glänzt bei lokaler Privatsphäre, 3-stufiger Sandbox und Modellauswahl; räumt Rückstand beim reinen Coding gegenüber Claude Code/Cursor offen ein.',
  },
  'fr': {
    title: 'Aether · Agent Workbench Radar d\'auto-évaluation honnête',
    titleTag: '(2026-09 Évaluation)',
    subtitle: 'Comparatif avec 16 agents de pointe · 8 dimensions clés',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Enveloppe du meilleur pair (pic 16 pairs)',
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
      { primary: 'Sécurité à 3 niveaux', secondary: 'Safety' },
      { primary: 'Local-first & Confidentialité', secondary: 'Local & private' },
      { primary: 'Double UX Bureau & TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matrice comparative (16 outils) :',
    catTerminal: 'Terminal',
    catIde: 'IDE/Bureau',
    catAuto: 'Autonome',
    footnote: 'Auto-évaluation honnête · La forme reflète le positionnement : Aether excelle en confidentialité locale, bac à sable à 3 niveaux et multi-fournisseurs ; reconnaît sans fard l\'écart de code brut face à Claude Code/Cursor.',
  },
  'es': {
    title: 'Aether · Agent Workbench Radar de autoevaluación honesto',
    titleTag: '(2026-09 Evaluación)',
    subtitle: 'Comparativa con 16 herramientas de agentes líderes · 8 dimensiones clave',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Envolvente del mejor par (pico de 16 pares)',
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
      { primary: 'Seguridad en 3 niveles', secondary: 'Safety' },
      { primary: 'Local y privacidad', secondary: 'Local & private' },
      { primary: 'UX dual Escritorio y TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matriz comparativa (16 herramientas):',
    catTerminal: 'Terminal',
    catIde: 'IDE/Escritorio',
    catAuto: 'Autónomo',
    footnote: 'Autoevaluación honesta · La forma como posicionamiento: Aether destaca en privacidad local, sandbox de 3 niveles y multiflexibilidad; asume sin maquillaje la brecha en código frente a Claude Code/Cursor.',
  },
  'pt': {
    title: 'Aether · Agent Workbench Radar de Autoavaliação Honesta',
    titleTag: '(2026-09 Avaliação)',
    subtitle: 'Comparação com 16 ferramentas de agentes líderes · 8 dimensões centrais',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Envelope do melhor par (pico de 16 pares)',
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
      { primary: 'Segurança em 3 níveis', secondary: 'Safety' },
      { primary: 'Local-first e privacidade', secondary: 'Local & private' },
      { primary: 'UX dupla Desktop & TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Matriz comparativa (16 ferramentas):',
    catTerminal: 'Terminal',
    catIde: 'IDE/Desktop',
    catAuto: 'Autônomo',
    footnote: 'Autoavaliação honesta · A forma é o posicionamento: Aether lidera em privacidade local, sandbox de 3 níveis e multiprovedores; reconhece sem rodeios a distância em código bruto frente ao Claude Code/Cursor.',
  },
  'ru': {
    title: 'Aether · Agent Workbench Честный радар самооценки',
    titleTag: '(2026-09 Оценка)',
    subtitle: 'Сравнение с 16 ведущими агентами · 8 ключевых измерений',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Огибающая лучших аналогов (пик 16 систем)',
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
      { primary: '3-уровневая безопасность', secondary: 'Safety' },
      { primary: 'Локальность и приватность', secondary: 'Local & private' },
      { primary: 'Двойной UX: десктоп и TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Матрица аналогов (16 инструментов):',
    catTerminal: 'Терминал',
    catIde: 'IDE/Десктоп',
    catAuto: 'Автономные',
    footnote: 'Честная самооценка · Форма как позиционирование: Aether лидирует в локальной приватности, 3-уровневой песочнице и мультипровайдерах; открыто признает отставание в чистом кодинге от Claude Code/Cursor.',
  },
  'uk': {
    title: 'Aether · Agent Workbench Чесний радар самооцінки',
    titleTag: '(2026-09 Оцінка)',
    subtitle: 'Порівняння з 16 провідними агентами · 8 ключових вимірів',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'Обвідна найкращих аналогів (пік 16 систем)',
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
      { primary: '3-рівнева безпека', secondary: 'Safety' },
      { primary: 'Локальність і приватність', secondary: 'Local & private' },
      { primary: 'Подвійний UX: десктоп і TUI', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'Матриця аналогів (16 інструментів):',
    catTerminal: 'Термінал',
    catIde: 'IDE/Десктоп',
    catAuto: 'Автономні',
    footnote: 'Чесна самооцінка · Форма як позиціонування: Aether веде в локальній приватності, 3-рівневій пісочниці та мультипровайдерах; відверто визнає відставання в чистому коді від Claude Code/Cursor.',
  },
  'ar': {
    title: 'Aether · Agent Workbench رادار التقييم الذاتي الصادق',
    titleTag: '(2026-09 التقييم الأحدث)',
    subtitle: 'مقارنة شاملة مع 16 وكيلاً رائداً · رسم بياني لـ 8 أبعاد جوهرية',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'غلاف أفضل الأقران (قمة 16 وكيلاً)',
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
      { primary: 'أمان ثلاثي المستويات', secondary: 'Safety' },
      { primary: 'العمل المحلي والخصوصية', secondary: 'Local & private' },
      { primary: 'واجهة مزدوجة للمكتب والطرفية', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'مصفوفة مقارنة الأقران (16 أداة):',
    catTerminal: 'سطر الأوامر',
    catIde: 'بيئة التطوير/المكتب',
    catAuto: 'المنصات الذاتية',
    footnote: 'تقييم ذاتي صادق · الشكل يحدد الهوية: يتفوق Aether في الخصوصية المحلية والأمان ثلاثي المستويات ومرونة النماذج؛ ويعترف بفارق البرمجة الصرفة مقارنة بـ Claude Code/Cursor دون تزييف.',
  },
  'hi': {
    title: 'Aether · Agent Workbench ईमानदार आत्म-मूल्यांकन रडार',
    titleTag: '(2026-09 नवीनतम मूल्यांकन)',
    subtitle: '16 प्रमुख एजेंट उपकरणों की तुलना · 8 मुख्य आयामों की क्षमता प्रोफ़ाइल',
    legendAether: 'Aether (v0.8.1+)',
    legendPeerBest: 'समकक्ष-सर्वोत्तम आवरण (16 प्रतिस्पर्धियों का शिखर)',
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
      { primary: '3-स्तरीय सुरक्षा', secondary: 'Safety' },
      { primary: 'स्थानीय और गोपनीयता', secondary: 'Local & private' },
      { primary: 'डेस्कटॉप और TUI दोहरा UX', secondary: 'Desktop & TUI UX' },
    ],
    matrixLabel: 'प्रतिस्पर्धी मैट्रिक्स (16 उपकरण):',
    catTerminal: 'टर्मिनल',
    catIde: 'IDE/डेस्कटॉप',
    catAuto: 'स्वायत्त',
    footnote: 'ईमानदार आत्म-मूल्यांकन · आकार ही स्थिति है: Aether स्थानीय गोपनीयता, 3-स्तरीय सुरक्षा और मल्टी-मॉडल में उत्कृष्ट है; कृत्रिम बढ़ाव के बिना Claude Code/Cursor से कोडिंग में अंतर को स्वीकार करता है।',
  },
};

// ─── Geometry ───────────────────────────────────────────────────────────────
const W = 960;
const H = 740;
const CX = 480;
const CY = 376;
const R = 210; // radius for score 10

const N = 8; // 8 axes
const angleAt = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N; // 12 o'clock start, clockwise
const pt = (i, v) => {
  const a = angleAt(i);
  const r = (v / 10) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

  // Header
  parts.push(`<text x="40" y="46" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="20" font-weight="700" fill="#e6edf3">${esc(dict.title)} <tspan fill="#8b949e" font-weight="400" font-size="14">${esc(dict.titleTag)}</tspan></text>`);
  parts.push(`<text x="40" y="70" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="12" fill="#8b949e">${esc(dict.subtitle)}</text>`);

  // Legend (top-right)
  const LX = W - 325;
  parts.push(`<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="11.5">`);
  // Aether
  parts.push(`<rect x="${LX}" y="32" width="12" height="12" rx="2" fill="#6366f1" fill-opacity="0.36" stroke="#818cf8" stroke-width="1.8"/>`);
  parts.push(`<text x="${LX + 18}" y="42" fill="#e0e7ff" font-weight="600">${esc(dict.legendAether)}</text>`);

  // Peer-best envelope
  parts.push(`<line x1="${LX}" y1="58" x2="${LX + 12}" y2="58" stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  parts.push(`<text x="${LX + 18}" y="62" fill="#8b949e">${esc(dict.legendPeerBest)}</text>`);

  // Benchmarks (Claude Code & Cursor)
  parts.push(`<line x1="${LX}" y1="78" x2="${LX + 12}" y2="78" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.8"/>`);
  parts.push(`<text x="${LX + 18}" y="82" fill="#7dd3fc">${esc(dict.legendClaude)}</text>`);

  parts.push(`<line x1="${LX + 158}" y1="78" x2="${LX + 170}" y2="78" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.8"/>`);
  parts.push(`<text x="${LX + 176}" y="82" fill="#fcd34d">${esc(dict.legendCursor)}</text>`);
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
  dict.axes.forEach((ax, i) => {
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

    parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="13" font-weight="600" fill="#e6edf3">${esc(ax.primary)} <tspan fill="${isTop ? '#4ade80' : '#a5b4fc'}" font-size="12" font-weight="700">${selfScore.toFixed(1)}</tspan><tspan fill="${isTop ? '#4ade80' : '#8b949e'}" font-size="10.5"> (${isTop ? dict.leadBadge : delta})</tspan></text>`);
    parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + dy + 15).toFixed(1)}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="10" fill="#6e7681">${esc(ax.secondary)} · ${dict.peakLabel} ${peerBest[i].toFixed(1)}</text>`);
  });

  // Competitor Matrix Category Summary (bottom box)
  const BX = 40;
  const BY = H - 98;
  parts.push(`<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="11">`);
  parts.push(`<rect x="${BX}" y="${BY}" width="${W - 80}" height="54" rx="8" fill="#161b22" stroke="#21262d"/>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 18}" fill="#8b949e" font-weight="600">${esc(dict.matrixLabel)}</text>`);
  parts.push(`<text x="${BX + 14}" y="${BY + 38}" fill="#c9d1d9">
  <tspan fill="#7dd3fc" font-weight="600">${esc(dict.catTerminal)}</tspan>: Claude Code · Codex · OpenCode · Aider · Gemini CLI · Kimi CLI  ｜  
  <tspan fill="#fcd34d" font-weight="600">${esc(dict.catIde)}</tspan>: Cursor · Windsurf · Trae · Cline · Copilot  ｜  
  <tspan fill="#c084fc" font-weight="600">${esc(dict.catAuto)}</tspan>: OpenHands · Devin · OpenClaw · DSH · Hermes
</text>`);
  parts.push(`</g>`);

  // Footnote
  parts.push(`<text x="40" y="${H - 24}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,'Microsoft YaHei','PingFang SC','Meiryo',sans-serif" font-size="10" fill="#6e7681">${esc(dict.footnote)}</text>`);

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
