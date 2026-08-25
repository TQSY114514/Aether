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

## Task format (`suite.js`)

See the top of [suite.js](./suite.js). Rules: solvable in one focused agent
session, checks assert behavior (never implementation), Node stdlib only.

Adding a task = one object in `suite.js` + a `check.js` fixture that exits 0
on success. Keep prompts self-contained — the agent starts in an empty temp
directory containing only the fixtures.

## Notes

- The agent runs in `yolo` mode **inside a throwaway temp dir** only; nothing
  outside it is touched. See docs/security-practices.md for how permissions
  normally gate these tools in interactive use.
- Costs are real API calls: 5 tasks × N models × ~10 tool iterations each.
