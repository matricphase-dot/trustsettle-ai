#!/usr/bin/env bash
# ADD ALL FILES — drop-in replacement for GitHub's "create a new repository on the command line" snippet.
# Use this after extracting trustsettle-ai-submission.zip into your folder.
# Works whether or not you already ran GitHub's quickstart (echo "# trustsettle-ai" >> README.md etc.).
set -e
cd "$(dirname "$0")/.."

echo "==> 1/5 Pre-flight validation"
npm run preflight

echo "==> 2/5 Git repo (skips init if you already ran GitHub's quickstart)"
if [ ! -d ".git" ]; then
  git init -b main
else
  echo "Existing .git found — reusing it (no second git init, no force push)."
fi

echo "==> 3/5 Stage ALL project files (NOT just README.md)"
# -A also stages deletions, so the README-only quickstart file is replaced by the full README.
git add -A
echo "Staged files:"
git diff --cached --name-only | sed 's/^/   /'

echo "==> 4/5 Commit"
if git diff --cached --quiet; then
  echo "Nothing new to commit — all files are already up to date."
else
  git commit -m "feat: TrustSettle AI Enterprise v2.0 — Programmable PayPal Escrow & Agentic Commerce"
fi
git branch -M main

echo "==> 5/5 Remote + push"
if git remote get-url origin >/dev/null 2>&1; then
  echo "origin already set to: $(git remote get-url origin)"
else
  git remote add origin https://github.com/matricphase-dot/trustsettle-ai.git
fi
git push -u origin main

echo ""
echo "✅ All project files are live at https://github.com/matricphase-dot/trustsettle-ai"
echo "👉 Next: https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai"
