#!/usr/bin/env bash
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not found."
  echo "Install it first:"
  echo "  macOS (brew): brew install gitleaks"
  echo "  or: https://github.com/gitleaks/gitleaks"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Running gitleaks scan in $ROOT"
gitleaks detect --source . --config .gitleaks.toml --no-git --redact

