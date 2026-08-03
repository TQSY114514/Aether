'use strict';

// ---------------------------------------------------------------------------
// Signal Types — 20+ evolution signal type constants
// ---------------------------------------------------------------------------

const OPPORTUNITY_SIGNALS = [
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

// ---------------------------------------------------------------------------
// hasOpportunitySignal — detect whether any opportunity signal is present
// ---------------------------------------------------------------------------

function hasOpportunitySignal(signals) {
  var list = Array.isArray(signals) ? signals : [];
  for (var i = 0; i < OPPORTUNITY_SIGNALS.length; i++) {
    var name = OPPORTUNITY_SIGNALS[i];
    if (list.includes(name)) return true;
    if (list.some(function (s) { return String(s).startsWith(name + ':'); })) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// isEmptyCycle — detect an evolution cycle that produced no real changes
// ---------------------------------------------------------------------------

function isEmptyCycle(evt) {
  if (!evt) return false;
  if (evt.meta && evt.meta.empty_cycle) return true;
  var br = evt.blast_radius;
  return !!(br && br.files === 0 && br.lines === 0);
}

// ---------------------------------------------------------------------------
// analyzeRecentHistory — build dedup set from recent evolution events.
// Returns:
//   { suppressedSignals, recentIntents, consecutiveRepairCount,
//     emptyCycleCount, consecutiveEmptyCycles, consecutiveFailureCount,
//     recentFailureCount, recentFailureRatio, signalFreq, geneFreq }
// ---------------------------------------------------------------------------

function analyzeRecentHistory(recentEvents) {
  if (!Array.isArray(recentEvents) || recentEvents.length === 0) {
    return {
      suppressedSignals: new Set(),
      recentIntents: [],
      consecutiveRepairCount: 0,
      emptyCycleCount: 0,
      consecutiveEmptyCycles: 0,
      consecutiveFailureCount: 0,
      recentFailureCount: 0,
      recentFailureRatio: 0,
      signalFreq: {},
      geneFreq: {},
    };
  }

  // Take only the last 10 events
  var recent = recentEvents.slice(-10);

  // Count consecutive same-intent runs at the tail
  var consecutiveRepairCount = 0;
  for (var i = recent.length - 1; i >= 0; i--) {
    if (recent[i].intent === 'repair') {
      consecutiveRepairCount++;
    } else {
      break;
    }
  }

  // Count signal frequency in last 8 events: signal -> count
  var signalFreq = {};
  var geneFreq = {};
  var tail = recent.slice(-8);
  for (var j = 0; j < tail.length; j++) {
    var evt = tail[j];
    var sigs = Array.isArray(evt.signals) ? evt.signals : [];
    for (var k = 0; k < sigs.length; k++) {
      var s = String(sigs[k]);
      // Normalize: strip details suffix so frequency keys match dedup filter keys
      var key = s.startsWith('errsig:') ? 'errsig'
        : s.startsWith('recurring_errsig') ? 'recurring_errsig'
        : s.startsWith('user_feature_request:') ? 'user_feature_request'
        : s.startsWith('user_improvement_suggestion:') ? 'user_improvement_suggestion'
        : s;
      signalFreq[key] = (signalFreq[key] || 0) + 1;
    }
    var genes = Array.isArray(evt.genes_used) ? evt.genes_used : [];
    for (var g = 0; g < genes.length; g++) {
      geneFreq[String(genes[g])] = (geneFreq[String(genes[g])] || 0) + 1;
    }
  }

  // Suppress signals that appeared in 3+ of the last 8 events (over-processing)
  var suppressedSignals = new Set();
  var entries = Object.entries(signalFreq);
  for (var ei = 0; ei < entries.length; ei++) {
    if (entries[ei][1] >= 3) {
      suppressedSignals.add(entries[ei][0]);
    }
  }

  var recentIntents = recent.map(function(e) { return e.intent || 'unknown'; });

  // Count empty cycles (no file/line changes) in last 8 events
  var emptyCycleCount = 0;
  for (var ec = 0; ec < tail.length; ec++) {
    if (isEmptyCycle(tail[ec])) {
      emptyCycleCount++;
    }
  }

  // Count consecutive empty cycles at the tail
  var consecutiveEmptyCycles = 0;
  for (var se = recent.length - 1; se >= 0; se--) {
    if (isEmptyCycle(recent[se])) {
      consecutiveEmptyCycles++;
    } else {
      break;
    }
  }

  // Count consecutive productive failures at the tail
  var consecutiveFailureCount = 0;
  for (var cf = recent.length - 1; cf >= 0; cf--) {
    if (isEmptyCycle(recent[cf])) break;
    var outcome = recent[cf].outcome;
    if (outcome && outcome.status === 'failed') {
      consecutiveFailureCount++;
    } else {
      break;
    }
  }

  // Count total productive failures in last 8 events
  var recentFailureCount = 0;
  for (var rf = 0; rf < tail.length; rf++) {
    if (isEmptyCycle(tail[rf])) continue;
    var rfOut = tail[rf].outcome;
    if (rfOut && rfOut.status === 'failed') recentFailureCount++;
  }

  return {
    suppressedSignals: suppressedSignals,
    recentIntents: recentIntents,
    consecutiveRepairCount: consecutiveRepairCount,
    emptyCycleCount: emptyCycleCount,
    consecutiveEmptyCycles: consecutiveEmptyCycles,
    consecutiveFailureCount: consecutiveFailureCount,
    recentFailureCount: recentFailureCount,
    recentFailureRatio: tail.length > 0 ? recentFailureCount / tail.length : 0,
    signalFreq: signalFreq,
    geneFreq: geneFreq,
  };
}

module.exports = {
  hasOpportunitySignal,
  analyzeRecentHistory,
  isEmptyCycle,
  OPPORTUNITY_SIGNALS,
};