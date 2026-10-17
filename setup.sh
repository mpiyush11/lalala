#!/bin/bash
#
# GymOS — one-command fallback launcher.
#
# The devcontainer normally does this automatically on Codespace start. Run
# this by hand when that has not fired, or on a plain machine:
#
#   ./setup.sh
#
set -euo pipefail

cd "$(dirname "$0")"

# `npm ci` is reproducible and much faster when the lockfile matches, which it
# does on a fresh clone. Fall back to `npm install` if the lockfile has drifted
# so the script never dead-ends on a developer's branch.
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

# Bind 0.0.0.0 so Codespaces can forward the port; on localhost-only the
# preview tab stays blank.
npm run dev -- --hostname 0.0.0.0 --port 3000
