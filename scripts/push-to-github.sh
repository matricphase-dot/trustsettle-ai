#!/usr/bin/env bash
# 1-Click GitHub Push Script for matricphase-dot/trustsettle-ai
set -e

echo "🚀 Running pre-flight check before pushing to GitHub..."
npm run preflight

if [ ! -d ".git" ]; then
  git init -b main
fi

git add .
git commit -m "feat: TrustSettle AI Enterprise v2.0 — Programmable PayPal Escrow & Agentic Commerce" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/matricphase-dot/trustsettle-ai.git
git push -u origin main

echo ""
echo "✅ Pushed to https://github.com/matricphase-dot/trustsettle-ai"
echo "👉 Next: Click this link to 1-Click Deploy on Render:"
echo "   https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai"
