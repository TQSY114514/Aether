---
name: security-audit
description: Evidence-driven security audit protocol with Hunter/Verifier context isolation, coverage ledger, and sandbox validation gate (cloudflare/security-audit-skill profile).
permissions: read, write, execute, git
---

# Security Audit Skill (Aether Curated Pack)

## Operating Modes
- **Guidance Mode (Default)**: Produces threat model, capability profile (`READ/WRITE/EXECUTE/NETWORK/GIT/EXTERNAL`), and coverage ledger without unverified vulnerability claims.
- **Full Audit Mode (Explicit)**: Runs isolated **Hunter** (`finder_id`) and **Verifier** (`verifier_id`) passes to produce `findings.json` and `coverage-ledger.json`.

## Hard Protocol Invariants
1. **Finder != Verifier**: Every finding in `findings.json` MUST have `finder_id !== verifier_id`. Verifier operates in an isolated context without Hunter reasoning notes.
2. **Source Trace Required**: `status: "confirmed"` requires a non-empty `source_trace` array (`{ file, line, snippet }`) pointing to existing workspace lines.
3. **No OS Sandbox -> needs_validation**: Dynamic execution findings (`verification_method: "execution"`) MUST be downgraded to `status: "needs_validation"` (`validation_reason: "no_os_sandbox_available"`) when Docker/OS sandbox is unavailable.
4. **Validators**: Validate output via `node scripts/validate-findings.cjs <findings.json>` and `node scripts/validate-coverage-ledger.cjs <coverage-ledger.json>`.
