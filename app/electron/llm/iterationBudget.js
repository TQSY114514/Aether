'use strict';

// ---------------------------------------------------------------------------
// IterationBudget — multi-dimensional budget tracking for the tool loop.
// Tracks maxIterations, maxTokens, maxTime, and maxErrors with warning
// emission at 80% consumption.
// Compatible with toolLoop.js interface: exposes budget.track(type, amount)
// and budget.exhausted() for checkpoint checks.
// Inspired by Hermes Agent's budget system.
// ---------------------------------------------------------------------------

var EventEmitter = require('events');

// Warning threshold: emit 'budget:warning' when consumption reaches 80%
var WARNING_THRESHOLD = 0.8;

function IterationBudget(opts) {
  // Allow callers to use `new IterationBudget()` or `IterationBudget.create()`
  if (!(this instanceof IterationBudget)) {
    return new IterationBudget(opts);
  }

  EventEmitter.call(this);

  // Configuration
  this.maxIterations = 0;   // 0 = unlimited
  this.maxTokens = 0;       // 0 = unlimited
  this.maxTime = 0;         // milliseconds, 0 = unlimited
  this.maxErrors = 0;       // 0 = unlimited

  // Current consumption
  this.iterations = 0;
  this.tokens = 0;
  this.time = 0;            // accumulated milliseconds
  this.errors = 0;

  // Internal state
  this._startTime = null;
  this._warnings = {
    iterations: false,
    tokens: false,
    time: false,
    errors: false,
  };
  this._exhausted = false;
  this._exhaustedReason = null;

  // Apply opts if provided
  if (opts) this.configure(opts);
}

IterationBudget.prototype = Object.create(EventEmitter.prototype);
IterationBudget.prototype.constructor = IterationBudget;

// ---------------------------------------------------------------------------
// configure — set budget limits
// ---------------------------------------------------------------------------

IterationBudget.prototype.configure = function (opts) {
  if (!opts || typeof opts !== 'object') return this;

  if (typeof opts.maxIterations === 'number' && opts.maxIterations >= 0) {
    this.maxIterations = opts.maxIterations;
  }
  if (typeof opts.maxTokens === 'number' && opts.maxTokens >= 0) {
    this.maxTokens = opts.maxTokens;
  }
  if (typeof opts.maxTime === 'number' && opts.maxTime >= 0) {
    this.maxTime = opts.maxTime;
  }
  if (typeof opts.maxErrors === 'number' && opts.maxErrors >= 0) {
    this.maxErrors = opts.maxErrors;
  }

  return this;
};

// ---------------------------------------------------------------------------
// start — begin timing (call at the start of the tool loop)
// ---------------------------------------------------------------------------

IterationBudget.prototype.start = function () {
  this._startTime = Date.now();
  return this;
};

// ---------------------------------------------------------------------------
// track — record consumption of a budget dimension
//   type: 'iteration' | 'token' | 'time' | 'error'
//   amount: number to add (default 1)
// Returns the budget instance for chaining.
// ---------------------------------------------------------------------------

IterationBudget.prototype.track = function (type, amount) {
  if (this._exhausted) return this;

  var val = typeof amount === 'number' && amount >= 0 ? amount : 1;

  switch (type) {
    case 'iteration':
      this.iterations += val;
      break;
    case 'token':
      this.tokens += val;
      break;
    case 'time':
      this.time += val;
      break;
    case 'error':
      this.errors += val;
      break;
    default:
      // Unknown dimension — silently ignore for forward compatibility
      break;
  }

  // Check warnings and exhaustion
  this._checkThreshold('iterations', this.iterations, this.maxIterations);
  this._checkThreshold('tokens', this.tokens, this.maxTokens);
  this._checkThreshold('time', this.time, this.maxTime);
  this._checkThreshold('errors', this.errors, this.maxErrors);

  return this;
};

// ---------------------------------------------------------------------------
// exhausted — check if any budget limit has been exceeded
// Returns an object { exhausted: boolean, reason: string|null }
// ---------------------------------------------------------------------------

IterationBudget.prototype.exhausted = function () {
  // Update elapsed time
  if (this._startTime && this.maxTime > 0) {
    this.time = Date.now() - this._startTime;
  }

  // Check each dimension
  if (this.maxIterations > 0 && this.iterations >= this.maxIterations) {
    this._setExhausted('iterations');
  }
  if (this.maxTokens > 0 && this.tokens >= this.maxTokens) {
    this._setExhausted('tokens');
  }
  if (this.maxTime > 0 && this.time >= this.maxTime) {
    this._setExhausted('time');
  }
  if (this.maxErrors > 0 && this.errors >= this.maxErrors) {
    this._setExhausted('errors');
  }

  return {
    exhausted: this._exhausted,
    reason: this._exhaustedReason,
  };
};

// ---------------------------------------------------------------------------
// reset — reset all counters and warnings (for reuse)
// ---------------------------------------------------------------------------

IterationBudget.prototype.reset = function () {
  this.iterations = 0;
  this.tokens = 0;
  this.time = 0;
  this.errors = 0;
  this._startTime = null;
  this._warnings = {
    iterations: false,
    tokens: false,
    time: false,
    errors: false,
  };
  this._exhausted = false;
  this._exhaustedReason = null;
  return this;
};

// ---------------------------------------------------------------------------
// remaining — get remaining budget for each dimension
// ---------------------------------------------------------------------------

IterationBudget.prototype.remaining = function () {
  var r = {};
  r.iterations = this.maxIterations > 0 ? Math.max(0, this.maxIterations - this.iterations) : Infinity;
  r.tokens = this.maxTokens > 0 ? Math.max(0, this.maxTokens - this.tokens) : Infinity;

  var elapsed = 0;
  if (this._startTime) {
    elapsed = Date.now() - this._startTime;
  }
  r.time = this.maxTime > 0 ? Math.max(0, this.maxTime - elapsed) : Infinity;
  r.errors = this.maxErrors > 0 ? Math.max(0, this.maxErrors - this.errors) : Infinity;

  return r;
};

// ---------------------------------------------------------------------------
// usage — get current usage snapshot
// ---------------------------------------------------------------------------

IterationBudget.prototype.usage = function () {
  var elapsed = 0;
  if (this._startTime) {
    elapsed = Date.now() - this._startTime;
  }
  return {
    iterations: this.iterations,
    tokens: this.tokens,
    time: elapsed,
    errors: this.errors,
  };
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

IterationBudget.prototype._checkThreshold = function (dimension, current, max) {
  if (max <= 0) return;

  var ratio = current / max;

  // Emit warning at 80% consumption (only once per dimension)
  if (ratio >= WARNING_THRESHOLD && !this._warnings[dimension]) {
    this._warnings[dimension] = true;
    this.emit('budget:warning', {
      dimension: dimension,
      current: current,
      max: max,
      ratio: ratio,
      message: dimension + ' budget at ' + Math.round(ratio * 100) + '% (' + current + '/' + max + ')',
    });
  }

  // Exhausted check
  if (current >= max) {
    this._setExhausted(dimension);
  }
};

IterationBudget.prototype._setExhausted = function (reason) {
  if (this._exhausted) return;
  this._exhausted = true;
  this._exhaustedReason = reason;
  this.emit('budget:exhausted', {
    reason: reason,
    iterations: this.iterations,
    tokens: this.tokens,
    time: this.time,
    errors: this.errors,
  });
};

// ---------------------------------------------------------------------------
// Factory method
// ---------------------------------------------------------------------------

IterationBudget.create = function (opts) {
  var budget = new IterationBudget();
  if (opts) budget.configure(opts);
  return budget;
};

module.exports = IterationBudget;