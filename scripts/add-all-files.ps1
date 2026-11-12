# ADD ALL FILES — Windows PowerShell drop-in replacement for GitHub's quickstart snippet.
# Use after extracting trustsettle-ai-submission.zip into your folder.
# Works whether or not you already ran GitHub's quickstart commands.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> 1/5 Pre-flight validation" -ForegroundColor Cyan
npm run preflight
if ($LASTEXITCODE -ne 0) { throw "Pre-flight failed." }

Write-Host "==> 2/5 Git repo (skips init if you already ran GitHub's quickstart)" -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
  git init -b main
} else {
  Write-Host "Existing .git found — reusing it (no second git init, no force push)."
}

Write-Host "==> 3/5 Stage ALL project files (NOT just README.md)" -ForegroundColor Cyan
git add -A
git diff --cached --name-only

Write-Host "==> 4/5 Commit" -ForegroundColor Cyan
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nothing new to commit — all files are already up to date."
} else {
  git commit -m "feat: TrustSettle AI Enterprise v2.0 — Programmable PayPal Escrow & Agentic Commerce"
  if ($LASTEXITCODE -ne 0) { throw "Commit failed. Run: git config user.name \"matricphase-dot\" and git config user.email \"you@example.com\", then retry." }
}
git branch -M main

Write-Host "==> 5/5 Remote + push" -ForegroundColor Cyan
$origin = git remote get-url origin 2>$null
if ($origin) {
  Write-Host "origin already set to: $origin"
} else {
  git remote add origin https://github.com/matricphase-dot/trustsettle-ai.git
}
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw "Push failed. Make sure the PUBLIC repo https://github.com/matricphase-dot/trustsettle-ai exists and you are signed in to GitHub (browser sign-in or a PAT with repo scope)." }

Write-Host ""
Write-Host "All 44 project files are live at https://github.com/matricphase-dot/trustsettle-ai" -ForegroundColor Green
Write-Host "Next: https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai" -ForegroundColor Yellow
