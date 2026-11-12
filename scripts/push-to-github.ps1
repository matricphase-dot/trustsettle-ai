# 1-Click Windows PowerShell Push Script for matricphase-dot/trustsettle-ai
$ErrorActionPreference = "Stop"

Write-Host "Running pre-flight check before pushing to GitHub..." -ForegroundColor Cyan
npm run preflight

if (-not (Test-Path ".git")) {
  git init -b main
}

git add .
git commit -m "feat: TrustSettle AI Enterprise v2.0 — Programmable PayPal Escrow & Agentic Commerce"
if ($LASTEXITCODE -ne 0) { Write-Host "No new changes to commit — continuing." -ForegroundColor DarkYellow }
git branch -M main
git remote remove origin 2>$null | Out-Null
git remote add origin https://github.com/matricphase-dot/trustsettle-ai.git
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw "Push failed. Make sure the PUBLIC repo https://github.com/matricphase-dot/trustsettle-ai exists and you are signed in to GitHub." }

Write-Host ""
Write-Host "Pushed to https://github.com/matricphase-dot/trustsettle-ai" -ForegroundColor Green
Write-Host "Next: Open this link to 1-Click Deploy on Render:" -ForegroundColor Yellow
Write-Host "https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai"
