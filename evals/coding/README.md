# Coding Eval (public, small)

A tiny public benchmark: real agent runs with tools against isolated temp
workspaces, graded by deterministic checks. Complements the in-app Arena
(see README) — Arena ranks chat models by your votes/ELO; this measures
end-to-end agent behavior (planning → file edits → passing tests).

## Run

```bash
node app/scripts/run-eval.cjs \
  --base-url https://api.example.com/v1 \
  --model deepseek-chat \
  --api-key sk-...        # or env AETHER_EVAL_API_KEY \
  --out results.json
```

Exit code 0 = every model passed every task. `results.json` carries per-task
verdicts, durations, check output tails, and a per-model summary.

## Router comparison (`router-compare.cjs`)

Measures what staged tool routing (`agent.toolRouter.staged`) actually buys:
the same suite runs twice per model — identical except for the flag, each
mode in its own throwaway SQLite DB — and reports pass rate, token totals,
wall time, and mid-loop stage re-injection counts side by side.

```bash
node evals/coding/router-compare.cjs \
  --base-url https://api.example.com/v1 \
  --model deepseek-chat \
  --api-key sk-...        # or env AETHER_EVAL_API_KEY \
  --out compare.json
```

Deltas can legitimately be zero on small tasks (routing only changes the
tool payload once a build/verify/deliver stage is inferred); treat the
harness as a measurement tool over your own larger suites, not a verdict.

## Task format (`suite.js`)

See the top of [suite.js](./suite.js). Rules: solvable in one focused agent
session, checks assert behavior (never implementation), Node stdlib only.

Adding a task = one object in `suite.js` + a `check.js` fixture that exits 0
on success. Keep prompts self-contained — the agent starts in an empty temp
directory containing only the fixtures.

## Notes

- The agent runs in `yolo` mode **inside a throwaway temp dir**; task fixtures
  and checks stay in that dir, but yolo is unrestricted by design — the model
  could write outside it. Run evals only on machines where you would also run
  yolo interactively (see docs/security-practices.md for how permissions gate
  these tools normally).
- Costs are real API calls: 5 tasks × N models × ~10 tool iterations each.
