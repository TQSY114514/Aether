class ConcurrencyLimit {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  async run(fn) {
    if (this.active >= this.limit) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

// Global defaults: 5 concurrent LLM API requests, 3 concurrent subagents.
const apiLimit = new ConcurrencyLimit(5);
const subagentLimit = new ConcurrencyLimit(3);

module.exports = {
  apiLimit,
  subagentLimit,
  ConcurrencyLimit
};
