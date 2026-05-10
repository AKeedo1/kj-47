#!/usr/bin/env bash
# Push local changes to GitHub Pages.
# Edits any file in this folder, then run: ./deploy.sh "what changed"

set -e

MSG="${1:-update}"

cd "$(dirname "$0")"
git add .
git commit -m "$MSG" || echo "nothing to commit"
git push

echo "Pushed. GitHub Pages rebuilds in ~30 seconds."
