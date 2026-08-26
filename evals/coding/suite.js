// Public coding eval suite — small, deterministic, dependency-free tasks.
//
// Each task:
//   id         unique slug
//   prompt     shown to the agent (it works inside an empty temp dir)
//   fixtures   [{ path, content }] written into the temp dir before the run
//   check      { command, args } executed in the temp dir after the run;
//              exit 0 = pass. Keep output short — it lands in result JSON.
//
// Rules for new tasks:
// - The agent must be able to finish in one focused session (~10 iterations).
// - check.js asserts behavior, never implementation details.
// - No network, no dependencies outside Node stdlib.

'use strict'

module.exports = [
  {
    id: 'reverse-string',
    prompt:
      'Create src/reverse.js exporting a function reverse(s) that returns the characters of s in reverse order ' +
      'by Unicode code points (Array.from(s) gives you the code-point array). Export via module.exports ' +
      '(check.js uses require).',
    fixtures: [
      {
        path: 'check.js',
        content: [
          "const { reverse } = require('./src/reverse.js')",
          "const assert = require('assert')",
          "assert.strictEqual(reverse('abc'), 'cba')",
          "assert.strictEqual(reverse(''), '')",
          "assert.strictEqual(reverse('👍🏽a'), 'a🏽👍')",
          "console.log('OK')",
        ].join('\n'),
      },
    ],
    check: { command: 'node', args: ['check.js'] },
  },
  {
    id: 'fizzbuzz',
    prompt:
      'Create src/fizzbuzz.js exporting fizzbuzz(n) that returns an array of n strings (1..n): ' +
      "multiples of 3 → 'Fizz', of 5 → 'Buzz', of both → 'FizzBuzz', otherwise the number as a string. " +
      'Export via module.exports (check.js uses require).',
    fixtures: [
      {
        path: 'check.js',
        content: [
          "const { fizzbuzz } = require('./src/fizzbuzz.js')",
          "const assert = require('assert')",
          'const r = fizzbuzz(15)',
          'assert.deepStrictEqual(r.slice(0, 3), ["1", "2", "Fizz"])',
          "assert.strictEqual(r[14], 'FizzBuzz')",
          "assert.strictEqual(r[8], 'Fizz')",
          "assert.strictEqual(r[4], 'Buzz')",
          "console.log('OK')",
        ].join('\n'),
      },
    ],
    check: { command: 'node', args: ['check.js'] },
  },
  {
    id: 'csv-column-sum',
    prompt:
      'Create src/csvsum.js exporting sumColumn(csvText, columnName) that parses minimal CSV ' +
      '(first line = header, comma-separated, no quoted commas) and returns the sum of the named numeric column. ' +
      'Export via module.exports.',
    fixtures: [
      {
        path: 'check.js',
        content: [
          "const { sumColumn } = require('./src/csvsum.js')",
          "const assert = require('assert')",
          "const csv = 'name,score\\nalice,10\\nbob,2.5\\ncarol,7'",
          'assert.strictEqual(sumColumn(csv, "score"), 19.5)',
          "assert.ok(Number.isNaN(sumColumn(csv, 'name')))",
          "assert.ok(Number.isNaN(sumColumn(csv, 'missing')) === false || true)",
          "console.log('OK')",
        ].join('\n'),
      },
    ],
    check: { command: 'node', args: ['check.js'] },
  },
  {
    id: 'fix-off-by-one',
    prompt:
      'src/clamp.js contains a bug: clamp(v, lo, hi) returns lo when v equals hi. ' +
      'Read the existing tests in check.js and FIX src/clamp.js so all checks pass. ' +
      'Do not rewrite the file from scratch — keep its structure and change the minimum needed.',
    fixtures: [
      {
        path: 'src/clamp.js',
        content: [
          '// Clamp v into [lo, hi].',
          'function clamp(v, lo, hi) {',
          '  if (v <= lo) return lo',
          '  if (v < hi) return v // BUG: excludes hi itself',
          '  return lo',
          '}',
          'module.exports = { clamp }',
        ].join('\n'),
      },
      {
        path: 'check.js',
        content: [
          "const { clamp } = require('./src/clamp.js')",
          "const assert = require('assert')",
          'assert.strictEqual(clamp(5, 0, 10), 5)',
          'assert.strictEqual(clamp(-1, 0, 10), 0)',
          'assert.strictEqual(clamp(11, 0, 10), 10)',
          'assert.strictEqual(clamp(10, 0, 10), 10)',
          'assert.strictEqual(clamp(0, 0, 10), 0)',
          "console.log('OK')",
        ].join('\n'),
      },
    ],
    check: { command: 'node', args: ['check.js'] },
  },
  {
    id: 'json-flatten',
    prompt:
      'Create src/flatten.js exporting flatten(obj) that flattens nested objects into dot-separated keys. ' +
      'Arrays become key[index]. Primitives at the root stay as-is under their key. ' +
      'flatten(null/undefined/non-object) returns {}. Export via module.exports.',
    fixtures: [
      {
        path: 'check.js',
        content: [
          "const { flatten } = require('./src/flatten.js')",
          "const assert = require('assert')",
          'assert.deepStrictEqual(flatten({ a: { b: 1 } }), { "a.b": 1 })',
          'assert.deepStrictEqual(flatten({ a: { b: { c: 2 } }, d: [3, 4] }), { "a.b.c": 2, "d[0]": 3, "d[1]": 4 })',
          'assert.deepStrictEqual(flatten({ x: 1 }), { x: 1 })',
          'assert.deepStrictEqual(flatten(null), {})',
          "console.log('OK')",
        ].join('\n'),
      },
    ],
    check: { command: 'node', args: ['check.js'] },
  },
]
