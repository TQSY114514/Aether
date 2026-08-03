'use strict';

// ───────────────────────────────────────────────────────────────────────────
// GEP (Genome Evolution Protocol) — self-evolution engine.
//
// Upgraded version integrating schemas/gene, schemas/capsule, and signals.js
// with blast_radius calculation, success_streak tracking, and extended
// signal type support.
//
// Gene  = a lightweight strategy fragment (e.g., "always run git status before
//         git diff", "prefer parallel reads over sequential")
// Capsule = a reusable evolution asset package — a collection of related Genes
//           that form a coherent strategy, mapped to a SKILL.md
//
// Evolution flow:
//   1. Signal detection — scan memory/audit logs for patterns
//   2. Gene selection — pick Genes that address detected signals
//   3. Capsule assembly — group related Genes into a Capsule
//   4. GEP prompt generation — inject evolution guidance into the agent
//   5. EvolutionEvent recording — log what was evolved for future analysis
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { createGene, validateGene } = require('./schemas/gene');
const { createCapsule, validateCapsule } = require('./schemas/capsule');
const { analyzeRecentHistory, hasOpportunitySignal } = require('./signals');

// ─── Logger (with fallback) ────────────────────────────────────────────────

let log;
try {
  log = require('../logger');
} catch {
  log = {
    info:  function (m) { console.log('[gep:info]',  ...(Array.isArray(m) ? m : [m])); },
    warn:  function (m) { console.warn('[gep:warn]',  ...(Array.isArray(m) ? m : [m])); },
    error: function (m) { console.error('[gep:error]', ...(Array.isArray(m) ? m : [m])); },
  };
}

// ─── Base directory for capsule output ─────────────────────────────────────

let BASE_CAPSULE_DIR = null;

// Allow caller to set a custom base directory (for non-Electron environments).
function setCapsuleDir(dir) {
  BASE_CAPSULE_DIR = dir;
}

function getCapsuleDir() {
  if (BASE_CAPSULE_DIR) return BASE_CAPSULE_DIR;
  // Default fallback: local evolution-skills directory
  return path.join(__dirname, '..', '..', '..', 'evolution-skills');
}

// ─── Signal History ────────────────────────────────────────────────────────

// In-memory signal store accumulated across cycles.
const signalHistory = [];

// ─── Success Streak Tracking ───────────────────────────────────────────────

// Map<geneId, { streak, lastApplied, lastOutcome }>
const successStreaks = new Map();

// Track the outcome of a gene application.
// Returns the updated streak count.
function trackSuccessStreak(geneId, success) {
  var entry = successStreaks.get(geneId) || { streak: 0, lastApplied: null, lastOutcome: null };
  if (success) {
    entry.streak += 1;
  } else {
    entry.streak = 0;
  }
  entry.lastApplied = Date.now();
  entry.lastOutcome = success ? 'success' : 'failed';
  successStreaks.set(geneId, entry);
  return entry.streak;
}

// Get the current success streak for a gene.
function getSuccessStreak(geneId) {
  var entry = successStreaks.get(geneId);
  return entry ? entry.streak : 0;
}

// Get all success streak data.
function getAllSuccessStreaks() {
  var result = {};
  successStreaks.forEach(function (v, k) { result[k] = v; });
  return result;
}

// ─── Blast Radius Calculation ──────────────────────────────────────────────

// Compute blast radius from file change statistics.
// fileChanges: array of { file: string, additions: number, deletions: number }
// Returns { files: number, lines: number }
function calculateBlastRadius(fileChanges) {
  if (!Array.isArray(fileChanges) || fileChanges.length === 0) {
    return { files: 0, lines: 0 };
  }
  var files = fileChanges.length;
  var lines = 0;
  for (var i = 0; i < fileChanges.length; i++) {
    var fc = fileChanges[i];
    lines += (typeof fc.additions === 'number' ? fc.additions : 0);
    lines += (typeof fc.deletions === 'number' ? fc.deletions : 0);
  }
  return { files: files, lines: lines };
}

// ─── Gene Registry ─────────────────────────────────────────────────────────

// Old category → new category mapping
const CATEGORY_MAP = {
  efficiency: 'optimize',
  safety:     'repair',
  planning:   'innovate',
  resilience: 'repair',
  quality:    'optimize',
};

// BUILTIN_GENES retains the original field layout for backward compatibility
// (used by selectGenes, toSkillBody, generateGepPrompt, etc.) while adding
// new fields aligned with the Gene schema.
const BUILTIN_GENES = [
  {
    id: 'parallel-reads',
    name: 'Parallel Reads',
    description: 'Combine independent read operations into parallel calls',
    trigger: { signal: 'sequential_reads', threshold: 3 },
    guidance: 'When reading multiple files, use parallel tool calls instead of sequential reads.',
    category: 'efficiency',
    // New schema fields
    signals_match: ['sequential_reads'],
    strategy: ['When reading multiple files, use parallel tool calls instead of sequential reads.'],
    category_new: 'optimize',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Combine independent read operations into parallel calls',
    schema_version: '1.6.0',
  },
  {
    id: 'git-status-before-edit',
    name: 'Git Status Before Edit',
    description: 'Always check git status before making file changes',
    trigger: { signal: 'edit_without_status', threshold: 2 },
    guidance: 'Before editing files, run git_status to check the current state.',
    category: 'safety',
    // New schema fields
    signals_match: ['edit_without_status'],
    strategy: ['Before editing files, run git_status to check the current state.'],
    category_new: 'repair',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Always check git status before making file changes',
    schema_version: '1.6.0',
  },
  {
    id: 'narrow-reads',
    name: 'Narrow Reads',
    description: 'Prefer targeted reads with offset/limit over full file dumps',
    trigger: { signal: 'full_file_reads', threshold: 4 },
    guidance: 'Use offset/limit on read_file for targeted reads instead of reading entire files.',
    category: 'efficiency',
    // New schema fields
    signals_match: ['full_file_reads'],
    strategy: ['Use offset/limit on read_file for targeted reads instead of reading entire files.'],
    category_new: 'optimize',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Prefer targeted reads with offset/limit over full file dumps',
    schema_version: '1.6.0',
  },
  {
    id: 'todo-first',
    name: 'Todo First',
    description: 'Create a todo checklist before starting multi-step tasks',
    trigger: { signal: 'no_todo_multi_step', threshold: 2 },
    guidance: 'For multi-step tasks (3+ steps), call todo_write first to create a checklist.',
    category: 'planning',
    // New schema fields
    signals_match: ['no_todo_multi_step'],
    strategy: ['For multi-step tasks (3+ steps), call todo_write first to create a checklist.'],
    category_new: 'innovate',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Create a todo checklist before starting multi-step tasks',
    schema_version: '1.6.0',
  },
  {
    id: 'error-escalation',
    name: 'Error Escalation',
    description: 'After 3 consecutive tool errors, summarize and ask for guidance',
    trigger: { signal: 'error_loop', threshold: 2 },
    guidance: 'After 3 consecutive tool errors, stop and ask the user for guidance instead of looping.',
    category: 'resilience',
    // New schema fields
    signals_match: ['error_loop'],
    strategy: ['After 3 consecutive tool errors, stop and ask the user for guidance instead of looping.'],
    category_new: 'repair',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'After 3 consecutive tool errors, summarize and ask for guidance',
    schema_version: '1.6.0',
  },
  {
    id: 'verification-after-edit',
    name: 'Verification After Edit',
    description: 'Run tests or verification after making code changes',
    trigger: { signal: 'edit_without_verify', threshold: 3 },
    guidance: 'After editing files, verify the changes work (run tests, check syntax, etc.).',
    category: 'quality',
    // New schema fields
    signals_match: ['edit_without_verify'],
    strategy: ['After editing files, verify the changes work (run tests, check syntax, etc.).'],
    category_new: 'optimize',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Run tests or verification after making code changes',
    schema_version: '1.6.0',
  },
  {
    id: 'cache-results',
    name: 'Cache Results',
    description: 'Cache tool results to avoid redundant calls',
    trigger: { signal: 'repeated_tool_calls', threshold: 3 },
    guidance: 'If you already have a result from a previous tool call, reuse it instead of calling again.',
    category: 'efficiency',
    // New schema fields
    signals_match: ['repeated_tool_calls'],
    strategy: ['If you already have a result from a previous tool call, reuse it instead of calling again.'],
    category_new: 'optimize',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Cache tool results to avoid redundant calls',
    schema_version: '1.6.0',
  },
  {
    id: 'use-skills',
    name: 'Use Skills',
    description: 'Check available skills before starting a task',
    trigger: { signal: 'skill_not_used', threshold: 2 },
    guidance: 'Before starting a task, check if any available skills match the request.',
    category: 'planning',
    // New schema fields
    signals_match: ['skill_not_used'],
    strategy: ['Before starting a task, check if any available skills match the request.'],
    category_new: 'innovate',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: [],
    summary: 'Check available skills before starting a task',
    schema_version: '1.6.0',
  },
  // ─── New Genes (extended set) ──────────────────────────────────────────
  {
    id: 'perf-bottleneck-response',
    name: 'Performance Bottleneck Response',
    description: 'Analyze and address performance bottlenecks detected in the system',
    trigger: { signal: 'perf_bottleneck', threshold: 1 },
    guidance: 'When a performance bottleneck is detected, use profiling tools to identify hot spots and optimize the critical path.',
    category: 'optimize',
    // New schema fields
    signals_match: ['perf_bottleneck'],
    strategy: ['When a performance bottleneck is detected, use profiling tools to identify hot spots and optimize the critical path.'],
    category_new: 'optimize',
    constraints: { max_files: 15, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['perf_bottleneck detected in audit trail'],
    summary: 'Analyze and address performance bottlenecks',
    schema_version: '1.6.0',
  },
  {
    id: 'capability-gap-plug',
    name: 'Capability Gap Plug',
    description: 'Fill missing capability gaps when the system lacks a needed feature',
    trigger: { signal: 'capability_gap', threshold: 1 },
    guidance: 'When a capability gap is identified, implement the missing functionality rather than working around it.',
    category: 'innovate',
    // New schema fields
    signals_match: ['capability_gap'],
    strategy: ['When a capability gap is identified, implement the missing functionality rather than working around it.'],
    category_new: 'innovate',
    constraints: { max_files: 30, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['capability_gap detected'],
    summary: 'Fill missing capability gaps',
    schema_version: '1.6.0',
  },
  {
    id: 'recurring-error-patch',
    name: 'Recurring Error Patch',
    description: 'Apply a permanent fix for errors that appear repeatedly',
    trigger: { signal: 'recurring_error', threshold: 2 },
    guidance: 'When an error recurs, fix the root cause permanently instead of applying temporary workarounds.',
    category: 'repair',
    // New schema fields
    signals_match: ['recurring_error'],
    strategy: ['When an error recurs, fix the root cause permanently instead of applying temporary workarounds.'],
    category_new: 'repair',
    constraints: { max_files: 10, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['recurring_error detected in recent events'],
    summary: 'Permanently fix recurring errors',
    schema_version: '1.6.0',
  },
  {
    id: 'stagnation-breakout',
    name: 'Stagnation Breakout',
    description: 'Break out of evolution stagnation by trying novel approaches',
    trigger: { signal: 'evolution_stagnation_detected', threshold: 1 },
    guidance: 'When evolution stagnates, explore new tool combinations or strategies outside the current pattern.',
    category: 'explore',
    // New schema fields
    signals_match: ['evolution_stagnation_detected'],
    strategy: ['When evolution stagnates, explore new tool combinations or strategies outside the current pattern.'],
    category_new: 'explore',
    constraints: { max_files: 25, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['stagnation detected in evolution history'],
    summary: 'Break out of evolution stagnation',
    schema_version: '1.6.0',
  },
  {
    id: 'failure-loop-breaker',
    name: 'Failure Loop Breaker',
    description: 'Detect and break out of repeated failure cycles',
    trigger: { signal: 'failure_loop_detected', threshold: 1 },
    guidance: 'After 3+ consecutive failures, switch to a fundamentally different approach instead of retrying the same pattern.',
    category: 'resilience',
    // New schema fields
    signals_match: ['failure_loop_detected', 'consecutive_failure_streak'],
    strategy: ['After 3+ consecutive failures, switch to a fundamentally different approach instead of retrying the same pattern.'],
    category_new: 'repair',
    constraints: { max_files: 10, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['consecutive failure streak detected'],
    summary: 'Break out of repeated failure cycles',
    schema_version: '1.6.0',
  },
  {
    id: 'plateau-pivot',
    name: 'Plateau Pivot',
    description: 'Pivot strategy when performance improvement plateaus',
    trigger: { signal: 'plateau_pivot_required', threshold: 1 },
    guidance: 'When improvement plateaus, pivot to a new approach rather than continuing to optimize the current one.',
    category: 'explore',
    // New schema fields
    signals_match: ['plateau_pivot_required', 'plateau_pivot_suggested'],
    strategy: ['When improvement plateaus, pivot to a new approach rather than continuing to optimize the current one.'],
    category_new: 'explore',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['plateau detected in recent performance metrics'],
    summary: 'Pivot strategy when performance plateaus',
    schema_version: '1.6.0',
  },
  {
    id: 'repair-loop-escalation',
    name: 'Repair Loop Escalation',
    description: 'Escalate when stuck in a repair loop to force innovation',
    trigger: { signal: 'repair_loop_detected', threshold: 1 },
    guidance: 'When stuck in a repair loop, escalate to an innovative strategy instead of continuing to patch.',
    category: 'resilience',
    // New schema fields
    signals_match: ['repair_loop_detected', 'force_innovation_after_repair_loop'],
    strategy: ['When stuck in a repair loop, escalate to an innovative strategy instead of continuing to patch.'],
    category_new: 'innovate',
    constraints: { max_files: 15, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['repair loop detected in consecutive intents'],
    summary: 'Escalate repair loops to innovation',
    schema_version: '1.6.0',
  },
  {
    id: 'curriculum-target-pursuit',
    name: 'Curriculum Target Pursuit',
    description: 'Actively pursue defined curriculum learning targets',
    trigger: { signal: 'curriculum_target', threshold: 1 },
    guidance: 'When a curriculum target is set, prioritize tasks that directly advance toward that target.',
    category: 'planning',
    // New schema fields
    signals_match: ['curriculum_target'],
    strategy: ['When a curriculum target is set, prioritize tasks that directly advance toward that target.'],
    category_new: 'innovate',
    constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['curriculum_target is defined'],
    summary: 'Pursue curriculum learning targets',
    schema_version: '1.6.0',
  },
  {
    id: 'opportunity-seize',
    name: 'Opportunity Seize',
    description: 'Act on external opportunities or user feature requests',
    trigger: { signal: 'user_feature_request', threshold: 1 },
    guidance: 'When a user feature request or improvement suggestion is detected, prioritize implementing it.',
    category: 'innovate',
    // New schema fields
    signals_match: ['user_feature_request', 'user_improvement_suggestion', 'external_opportunity'],
    strategy: ['When a user feature request or improvement suggestion is detected, prioritize implementing it.'],
    category_new: 'innovate',
    constraints: { max_files: 25, forbidden_paths: ['.git', 'node_modules'] },
    preconditions: ['user request or external opportunity detected'],
    summary: 'Act on opportunities and feature requests',
    schema_version: '1.6.0',
  },
];

// ─── Strategy Descriptions ─────────────────────────────────────────────────

const STRATEGY_DESCRIPTIONS = {
  balanced:    'Balanced approach: apply genes when signals are strong, avoid over-optimization.',
  innovate:    'Exploratory approach: try new strategies even with weak signals, favor experimentation.',
  harden:      'Conservative approach: only apply well-proven genes, increase safety margins.',
  'repair-only': 'Minimal approach: only evolve to fix detected errors, never for optimization.',
};

// ─── Capsule Definition ────────────────────────────────────────────────────

class Capsule {
  constructor(params) {
    // Normalize using the Capsule schema
    var caps = createCapsule({
      id: params.id,
      summary: params.description || params.name || '',
      trigger: params.genes || [],
      blast_radius: params.blast_radius || { files: 0, lines: 0 },
      outcome: params.outcome || { status: 'failed', score: 0 },
      success_streak: params.success_streak || 0,
    });

    // Backward-compatible fields
    this.id = caps.id;
    this.name = params.name;
    this.description = params.description;
    this.genes = params.genes || [];
    this.strategy = params.strategy || 'balanced';
    this.version = params.version || 1;
    this.createdAt = params.createdAt || new Date().toISOString();

    // New schema fields
    this.blast_radius = caps.blast_radius;
    this.success_streak = caps.success_streak;
    this.outcome = caps.outcome;
    this.trigger = caps.trigger;
    this.summary = caps.summary;
    this.execution_trace = caps.execution_trace;
    this.schema_version = caps.schema_version;
  }

  // Generate a SKILL.md body from this capsule.
  toSkillBody() {
    var geneDetails = this.genes
      .map(function (gid) { return BUILTIN_GENES.find(function (g) { return g.id === gid; }); })
      .filter(Boolean)
      .map(function (g) { return '- **' + g.name + '**: ' + g.guidance; });

    var blastInfo = '';
    if (this.blast_radius && (this.blast_radius.files > 0 || this.blast_radius.lines > 0)) {
      blastInfo = '\n\n## Blast Radius\n- Files affected: ' + this.blast_radius.files + '\n- Lines changed: ' + this.blast_radius.lines;
    }

    var streakInfo = '';
    if (this.success_streak > 0) {
      streakInfo = '\n\n## Success Streak\n' + this.success_streak + ' consecutive successful applications.\n';
    }

    return '---\n' +
      'name: evo-' + this.id + '\n' +
      'description: ' + (this.description || '') + '\n' +
      'strategy: ' + this.strategy + '\n' +
      'version: ' + this.version + '\n' +
      '---\n' +
      '\n' +
      '# Evolution Capsule: ' + (this.name || this.id) + '\n' +
      '\n' +
      (this.description || '') + '\n' +
      '\n' +
      '## Strategy Guidance\n' +
      geneDetails.join('\n') + '\n' +
      '\n' +
      '## Strategy Mode\n' +
      '**' + this.strategy + '** — ' + (STRATEGY_DESCRIPTIONS[this.strategy] || 'Balanced evolution approach.') +
      blastInfo +
      streakInfo +
      '\n\n---\n*Auto-generated by GEP Evolution Engine. Review and adjust as needed.*\n';
  }
}

// ─── Signal Detection ──────────────────────────────────────────────────────

// Scan memory and audit logs for evolution signals.
// Returns an array of { signal, count, severity } objects.
function detectSignals(db, auditTrail) {
  if (auditTrail === void 0) auditTrail = [];
  var signals = [];

  // Signal: repeated tool errors
  var errorCount = auditTrail.filter(function (tc) { return tc.error; }).length;
  if (errorCount >= 3) {
    signals.push({
      signal: 'error_loop',
      count: errorCount,
      severity: errorCount >= 5 ? 'high' : 'medium',
    });
  }

  // Signal: sequential reads (reading files one at a time)
  var readCalls = auditTrail.filter(function (tc) { return tc.name === 'read_file'; });
  if (readCalls.length >= 5) {
    signals.push({ signal: 'sequential_reads', count: readCalls.length, severity: 'low' });
  }

  // Signal: full file reads without offset/limit
  var fullReads = auditTrail.filter(function (tc) {
    return tc.name === 'read_file' && tc.args && !tc.args.offset && !tc.args.limit;
  });
  if (fullReads.length >= 3) {
    signals.push({ signal: 'full_file_reads', count: fullReads.length, severity: 'low' });
  }

  // Signal: edits without verification
  var edits = auditTrail.filter(function (tc) {
    return tc.name === 'write_file' || tc.name === 'edit_file';
  });
  var verifications = auditTrail.filter(function (tc) {
    return tc.name === 'run_command' && tc.args && tc.args.command &&
      /test|verify|check|lint/i.test(tc.args.command);
  });
  if (edits.length >= 2 && verifications.length === 0) {
    signals.push({ signal: 'edit_without_verify', count: edits.length, severity: 'medium' });
  }

  // Signal: edits without git status
  var gitStatus = auditTrail.filter(function (tc) { return tc.name === 'git_status'; });
  if (edits.length >= 2 && gitStatus.length === 0) {
    signals.push({ signal: 'edit_without_status', count: edits.length, severity: 'medium' });
  }

  // Signal: no todo for multi-step tasks
  var hasTodo = auditTrail.some(function (tc) { return tc.name === 'todo_write'; });
  if (auditTrail.length >= 5 && !hasTodo) {
    signals.push({ signal: 'no_todo_multi_step', count: auditTrail.length, severity: 'low' });
  }

  // Signal: repeated identical tool calls
  var toolCounts = new Map();
  for (var i = 0; i < auditTrail.length; i++) {
    var tc = auditTrail[i];
    var key = tc.name + ':' + JSON.stringify(tc.args || {});
    toolCounts.set(key, (toolCounts.get(key) || 0) + 1);
  }
  toolCounts.forEach(function (count, key) {
    if (count >= 3) {
      signals.push({ signal: 'repeated_tool_calls', count: count, severity: 'medium', detail: key });
    }
  });

  // Signal: skill not used when available
  try {
    var skillsModule = require('../llm/skills');
    var skills = skillsModule.getSkills && skillsModule.getSkills();
    if (skills && skills.length > 0 && !auditTrail.some(function (tc) { return tc.name === 'use_skill'; })) {
      signals.push({ signal: 'skill_not_used', count: skills.length, severity: 'low' });
    }
  } catch (e) {
    // skills module not available — skip
  }

  // ─── New signal detection ──────────────────────────────────────────────

  // Detect recurring errors: same error message appearing 2+ times
  var errorMessages = {};
  for (var ei = 0; ei < auditTrail.length; ei++) {
    var entry = auditTrail[ei];
    if (entry.error && typeof entry.error === 'string') {
      var norm = entry.error.replace(/\d+/g, '#').slice(0, 80);
      errorMessages[norm] = (errorMessages[norm] || 0) + 1;
    }
  }
  var recurringFound = false;
  for (var msg in errorMessages) {
    if (errorMessages[msg] >= 2) {
      if (!recurringFound) {
        signals.push({
          signal: 'recurring_error',
          count: errorMessages[msg],
          severity: 'medium',
          detail: msg.slice(0, 60),
        });
        recurringFound = true;
      }
      break;
    }
  }

  // Detect performance bottlenecks: slow operations (duration > threshold)
  var slowOps = auditTrail.filter(function (tc) {
    return tc.duration != null && tc.duration > 5000;
  });
  if (slowOps.length >= 2) {
    signals.push({
      signal: 'perf_bottleneck',
      count: slowOps.length,
      severity: slowOps.length >= 4 ? 'high' : 'medium',
    });
  }

  // Detect capability gaps: unsupported input types or missing tool errors
  var unsupportedCount = auditTrail.filter(function (tc) {
    return tc.error && /unsupported|not supported|not found|unknown type/i.test(tc.error);
  }).length;
  if (unsupportedCount >= 2) {
    signals.push({ signal: 'capability_gap', count: unsupportedCount, severity: 'medium' });
  }

  // Detect consecutive failure streaks in audit trail
  var consecutiveFails = 0;
  var maxConsecutiveFails = 0;
  for (var fi = 0; fi < auditTrail.length; fi++) {
    if (auditTrail[fi].error) {
      consecutiveFails++;
      if (consecutiveFails > maxConsecutiveFails) maxConsecutiveFails = consecutiveFails;
    } else {
      consecutiveFails = 0;
    }
  }
  if (maxConsecutiveFails >= 3) {
    signals.push({
      signal: 'consecutive_failure_streak',
      count: maxConsecutiveFails,
      severity: maxConsecutiveFails >= 5 ? 'high' : 'medium',
    });
  }
  if (maxConsecutiveFails >= 5) {
    signals.push({ signal: 'failure_loop_detected', count: maxConsecutiveFails, severity: 'high' });
  }

  // Detect high failure ratio in audit trail
  var totalOps = auditTrail.length;
  var totalErrors = auditTrail.filter(function (tc) { return tc.error; }).length;
  if (totalOps >= 10 && totalErrors / totalOps > 0.4) {
    signals.push({
      signal: 'high_failure_ratio',
      count: Math.round(totalErrors / totalOps * 100),
      severity: 'high',
    });
  }

  return signals;
}

// ─── addSignal: manually register a signal ─────────────────────────────────

// Add a signal to the in-memory signal history.
// Returns the signal object, or null if the signal type is unknown.
// Supports both old and new signal types.
function addSignal(signalType, count, severity, detail) {
  var validSignals = [
    // Old signal types
    'error_loop',
    'sequential_reads',
    'full_file_reads',
    'edit_without_verify',
    'edit_without_status',
    'no_todo_multi_step',
    'repeated_tool_calls',
    'skill_not_used',
    // New signal types (from OPPORTUNITY_SIGNALS)
    'user_feature_request',
    'user_improvement_suggestion',
    'perf_bottleneck',
    'capability_gap',
    'stable_success_plateau',
    'external_opportunity',
    'recurring_error',
    'unsupported_input_type',
    'evolution_stagnation_detected',
    'repair_loop_detected',
    'force_innovation_after_repair_loop',
    'tool_bypass',
    'curriculum_target',
    'issue_already_resolved',
    'openclaw_self_healed',
    'empty_cycle_loop_detected',
    'explore_opportunity',
    'hub_search_miss_with_problem',
    'plateau_pivot_required',
    'plateau_pivot_suggested',
    'force_steady_state',
    'evolution_saturation',
    'high_failure_ratio',
    'consecutive_failure_streak',
    'failure_loop_detected',
  ];

  if (validSignals.indexOf(signalType) === -1) {
    log.warn('gep: unknown signal type "' + signalType + '"');
    return null;
  }

  var signal = {
    signal: signalType,
    count: typeof count === 'number' ? count : 1,
    severity: severity || 'low',
  };
  if (detail) signal.detail = detail;
  signalHistory.push(signal);
  log.info('gep: signal added: ' + signalType + ' (count:' + signal.count + ', severity:' + signal.severity + ')');
  return signal;
}

// ─── getEvolutionSignals / clearSignalHistory ───────────────────────────────

// Return a copy of the current signal history.
function getEvolutionSignals() {
  return signalHistory.slice();
}

// Reset the signal history.
function clearSignalHistory() {
  signalHistory.length = 0;
  log.info('gep: signal history cleared');
}

// ─── Gene Selection ────────────────────────────────────────────────────────

// Select genes that address the detected signals.
// Returns an array of Gene objects (with both old and new fields).
function selectGenes(signals, strategy) {
  if (strategy === void 0) strategy = 'balanced';
  var selected = [];
  var signalNames = new Set(signals.map(function (s) { return s.signal; }));

  for (var i = 0; i < BUILTIN_GENES.length; i++) {
    var gene = BUILTIN_GENES[i];

    // Check both old-style trigger.signal and new-style signals_match
    var matches = false;
    if (signalNames.has(gene.trigger.signal)) {
      matches = true;
    }
    if (!matches && Array.isArray(gene.signals_match)) {
      for (var si = 0; si < gene.signals_match.length; si++) {
        if (signalNames.has(gene.signals_match[si])) {
          matches = true;
          break;
        }
      }
    }
    if (!matches) continue;

    var signal = signals.find(function (s) { return s.signal === gene.trigger.signal; });
    if (!signal && Array.isArray(gene.signals_match)) {
      // Fall back to the first matching signal
      for (var msi = 0; msi < gene.signals_match.length; msi++) {
        var found = signals.find(function (s) { return s.signal === gene.signals_match[msi]; });
        if (found) { signal = found; break; }
      }
    }
    var count = (signal && signal.count) || 0;
    var threshold = gene.trigger.threshold;

    // Apply strategy-specific thresholds
    var effectiveThreshold = threshold;
    if (strategy === 'innovate') effectiveThreshold = Math.max(1, threshold - 1);
    if (strategy === 'harden') effectiveThreshold = threshold + 1;
    if (strategy === 'repair-only' && gene.category !== 'safety' && gene.category !== 'resilience') continue;

    if (count >= effectiveThreshold) {
      // Include success streak info in the selection
      var streak = getSuccessStreak(gene.id);
      selected.push({
        gene: gene,
        matchCount: count,
        matchSignal: signal.signal,
        successStreak: streak,
      });
    }
  }

  return selected;
}

// ─── Capsule Assembly ──────────────────────────────────────────────────────

// Group selected genes into a capsule and write it as a SKILL.md.
// fileChanges (optional): array of { file, additions, deletions } for blast_radius.
function assembleCapsule(db, selectedGenes, strategy, fileChanges) {
  if (strategy === void 0) strategy = 'balanced';
  if (fileChanges === void 0) fileChanges = [];
  if (selectedGenes.length === 0) return null;

  var geneIds = selectedGenes.map(function (s) { return s.gene ? s.gene.id : s.id; });
  var capsuleId = geneIds.sort().join('-').slice(0, 40);
  var name = 'Evolution Strategy: ' + selectedGenes.map(function (s) { return s.gene ? s.gene.name : s.name; }).join(' + ');
  var description = 'Auto-generated evolution capsule addressing ' + selectedGenes.length + ' detected signals.';

  // Calculate blast radius from file changes
  var blastRadius = calculateBlastRadius(fileChanges);

  var capsule = new Capsule({
    id: capsuleId,
    name: name,
    description: description,
    genes: geneIds,
    strategy: strategy,
    blast_radius: blastRadius,
    success_streak: 0,
  });

  // Write as SKILL.md
  var skillsDir = getCapsuleDir();
  var capsuleDir = path.join(skillsDir, 'evo-' + capsuleId);
  try {
    fs.mkdirSync(capsuleDir, { recursive: true });
    fs.writeFileSync(path.join(capsuleDir, 'SKILL.md'), capsule.toSkillBody(), 'utf8');
    // Invalidate skills cache
    try {
      var skillsModule = require('../llm/skills');
      if (skillsModule.scanSkills) skillsModule.scanSkills();
    } catch (e) {
      // skills module not available
    }
    log.info('gep: assembled capsule "' + capsuleId + '" (' + selectedGenes.length + ' genes, strategy: ' + strategy + ', blast_radius: ' + blastRadius.files + ' files / ' + blastRadius.lines + ' lines)');
  } catch (e) {
    log.warn('gep: capsule assembly failed: ' + e.message);
    return null;
  }

  // Record evolution event
  try {
    var event = {
      capsuleId: capsuleId,
      genes: JSON.stringify(geneIds),
      strategy: strategy,
      signals: JSON.stringify(selectedGenes.map(function (s) { return s.matchSignal; })),
      blastRadius: JSON.stringify(blastRadius),
      createdAt: new Date().toISOString(),
    };
    db.run(
      'INSERT INTO evolution_events (capsule_id, genes, strategy, signals, blast_radius, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [event.capsuleId, event.genes, event.strategy, event.signals, event.blastRadius, event.createdAt]
    );
  } catch (e) {
    log.warn('gep: failed to record evolution event: ' + e.message);
  }

  return capsule;
}

// ─── GEP Prompt Generation ─────────────────────────────────────────────────

// Generate a system-prompt block with evolution guidance for the agent.
// Includes success streak info when available.
function generateGepPrompt(selectedGenes) {
  if (selectedGenes.length === 0) return '';
  var items = selectedGenes.map(function (s) {
    var g = s.gene || s;
    var line = '- ' + g.guidance;
    if (s.successStreak > 0) {
      line += ' (success streak: ' + s.successStreak + ')';
    }
    return line;
  }).join('\n');
  return '\n<evolution_guidance>\nThe following strategies have been learned from past sessions and should be applied:\n' + items + '\n</evolution_guidance>\n';
}

// ─── Full Evolution Cycle ──────────────────────────────────────────────────

// Run the complete evolution cycle: detect → select → assemble → prompt.
// Uses analyzeRecentHistory for signal deduplication.
// Returns { capsule, prompt, signals, genes } or null if no evolution needed.
function runEvolutionCycle(db, auditTrail, strategy, recentEvents, fileChanges) {
  if (auditTrail === void 0) auditTrail = [];
  if (strategy === void 0) strategy = 'balanced';
  if (recentEvents === void 0) recentEvents = [];
  if (fileChanges === void 0) fileChanges = [];

  // Step 1: Detect signals
  var rawSignals = detectSignals(db, auditTrail);

  // Step 2: Deduplicate using analyzeRecentHistory
  var history = analyzeRecentHistory(recentEvents);
  var suppressed = history.suppressedSignals;

  var signals = [];
  for (var i = 0; i < rawSignals.length; i++) {
    var sig = rawSignals[i];
    // Skip signals that have appeared 3+ times in the last 8 events
    if (suppressed.has(sig.signal)) {
      log.info('gep: suppressing over-frequent signal "' + sig.signal + '" (appeared ' + (history.signalFreq[sig.signal] || 0) + 'x in recent events)');
      continue;
    }
    // Add to signal history and result set
    signals.push(sig);
    signalHistory.push(sig);
  }

  if (signals.length === 0) {
    log.info('gep: no new signals after deduplication');
    return null;
  }

  // Step 3: Select genes
  var selected = selectGenes(signals, strategy);
  if (selected.length === 0) return null;

  // Step 4: Assemble capsule
  var capsule = assembleCapsule(db, selected, strategy, fileChanges);
  var prompt = generateGepPrompt(selected);

  // Step 5: Update success streaks for selected genes (initial tracking)
  for (var si = 0; si < selected.length; si++) {
    var g = selected[si].gene || selected[si];
    // Initialize streak at 0 — caller will update via trackSuccessStreak on outcome
    var entry = successStreaks.get(g.id) || { streak: 0, lastApplied: Date.now(), lastOutcome: null };
    entry.lastApplied = Date.now();
    successStreaks.set(g.id, entry);
  }

  return { capsule: capsule, prompt: prompt, signals: signals, genes: selected };
}

// ─── Evolution History ─────────────────────────────────────────────────────

// Get all evolution events from the database.
function getEvolutionHistory(db) {
  try {
    return db.allRows('SELECT * FROM evolution_events ORDER BY created_at DESC LIMIT 50') || [];
  } catch (e) {
    return [];
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  BUILTIN_GENES,
  Capsule,
  STRATEGY_DESCRIPTIONS,
  CATEGORY_MAP,
  // Core evolution cycle
  detectSignals,
  selectGenes,
  assembleCapsule,
  generateGepPrompt,
  runEvolutionCycle,
  getEvolutionHistory,
  // Signal management
  addSignal,
  getEvolutionSignals,
  clearSignalHistory,
  // Blast radius
  calculateBlastRadius,
  // Success streak
  trackSuccessStreak,
  getSuccessStreak,
  getAllSuccessStreaks,
  // Configuration
  setCapsuleDir,
  getCapsuleDir,
};