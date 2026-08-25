# SmartScreen FAQ

Why Windows shows "Windows protected your PC" when launching Aether, and what
to do about it.

## Why am I seeing this warning?

Aether ships **unsigned** Windows binaries. Code-signing certificates cost
money annually and tie releases to a legal entity — a deliberate non-goal for
this project (see `docs/roadmap.md`, "明确不做" list). Windows SmartScreen
shows its warning for any downloaded executable without a known signature;
it does not mean a virus was found.

## Is the download trustworthy?

Both artifacts are built by the public GitHub Actions workflow
(`.github/workflows/release.yml`) triggered by version tags on this repository.
Each release also publishes a `SHA256SUMS.txt` with checksums of every exe.
You can:

- Verify a download in PowerShell:
  `Get-FileHash .\aetherai-setup-x.y.z.exe -Algorithm SHA256`
  then compare against the matching line in `SHA256SUMS.txt`.
- Read the exact workflow that produced the release and inspect its run log.
- Build identical installers yourself from source:
  `cd app && npm run build:win` (output in `app/dist-out/`).

## How do I run it anyway?

1. Click **More info** on the blue SmartScreen dialog.
2. Click **Run anyway** (once per file).

If Windows deleted the file automatically or your antivirus quarantined it,
check Defender's protection history first — unsigned Electron apps do get
flagged occasionally. Restoring from there and re-running works; if your AV
insists, building from source sidesteps the question entirely.

## Installer vs portable — which one?

| Artifact | Behavior |
|---|---|
| `*-setup-*.exe` (NSIS installer) | Installs normally; auto-update metadata (`latest.yml`) points here |
| `*-portable.exe` | Single-file, no installation; keep wherever you like |

Both contain the same app. Pick the installer unless you specifically want a
green (portable) copy.
