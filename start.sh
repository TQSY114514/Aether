#!/usr/bin/env bash
# Aether POSIX Launcher (Linux / macOS / WSL)
# Supports Terminal TUI (default) and Desktop Workbench (--desktop).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(node -e "try { console.log(require('./app/package.json').version || '0.9.0') } catch(e) { console.log('0.9.0') }" 2>/dev/null || echo "0.9.0")

# Parse arguments
MODE="auto"
while [[ $# -gt 0 ]]; do
  case $1 in
    --desktop|-d)
      MODE="desktop"
      shift
      ;;
    --tui|-t)
      MODE="tui"
      shift
      ;;
    --help|-h)
      echo "Aether v${VERSION} Launcher"
      echo ""
      echo "Usage:"
      echo "  ./start.sh              # Start Aether TUI (default in terminal)"
      echo "  ./start.sh --desktop    # Start Aether Desktop (Electron GUI)"
      echo "  ./start.sh --tui        # Force TUI mode"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

echo ""
echo "  Aether v${VERSION}"
echo "  ================="
echo ""

# Check Node.js availability
if ! command -v node >/dev/null 2>&1; then
    echo "[!] Node.js is not installed."
    echo "    Please install Node.js >= 22 from: https://nodejs.org"
    exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "[!] Node.js version is $(node --version), but >= 22 is required."
    echo "    Please upgrade to Node.js >= 22.0.0."
    exit 1
fi

# Enter app directory
cd "$SCRIPT_DIR/app"

# Install dependencies if node_modules does not exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo "[*] Installing dependencies..."
    npm install --no-audit --no-fund
fi

if [ "$MODE" = "desktop" ]; then
    # Build frontend if dist does not exist
    if [ ! -d "dist" ]; then
        echo "[*] Building frontend for desktop..."
        npx vite build --logLevel error
    fi
    if [ ! -f "resources/icon.png" ]; then
        node build-icons.js 2>/dev/null || true
    fi
    echo "  Starting Aether Desktop..."
    npx electron .
else
    echo "  Starting Aether Terminal UI (TUI)..."
    echo "  (Tip: run './start.sh --desktop' if you want the Electron desktop workbench)"
    echo ""
    node cli.js tui
fi
