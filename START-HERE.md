# 🚀 START HERE — TrustSettle AI Submission Runbook
### Owner: `matricphase-dot` · Deadline: **Nov 12, 2026 12:00 PM PST = Nov 13, 2026 1:30 AM IST**

Everything is built, tested (8/8), and pre-flight validated. **Only 3 links + 3 API keys remain**, and they must be created from your own accounts. This workspace has no GitHub/Render credentials, so the push happens from your computer with one command.

---

## 🔗 YOUR EXACT URLS

| Item | URL |
|---|---|
| GitHub repo (create it) | `https://github.com/matricphase-dot/trustsettle-ai` |
| Create repo page | `https://github.com/new` |
| 1-Click Render deploy | `https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai` |
| Expected live demo (confirm in Render) | `https://trustsettle-ai-enterprise.onrender.com` |
| Live health check | `https://trustsettle-ai-enterprise.onrender.com/api/health` |
| API docs | `https://trustsettle-ai-enterprise.onrender.com/api/docs` |
| MCP tools | `https://trustsettle-ai-enterprise.onrender.com/api/mcp/tools` |
| Devpost submission | `https://paypalaihackathon.devpost.com/` |
| Devpost rules | `https://paypalaihackathon.devpost.com/rules` |

---

## ✅ STEP 1 — Create the PUBLIC GitHub repo (2 min)

1. Open `https://github.com/new` while signed in as **`matricphase-dot`**.
2. Repository name: **`trustsettle-ai`** · Visibility: **Public**.
3. **Do NOT** tick "Add a README file", "Add .gitignore", or "Choose a license" — the ZIP already contains all three.
4. Click **Create repository**.

## ✅ STEP 2 — Extract & push with ONE command (2 min)

Download **`trustsettle-ai-submission.zip`** from this workspace, unzip it into a folder named `trustsettle-ai`, then:

**macOS / Linux**
```bash
cd trustsettle-ai
npm install
bash scripts/push-to-github.sh
```

**Windows (PowerShell)**
```powershell
cd trustsettle-ai
npm install
powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
```

> The script runs `npm run preflight`, then `git init`, `commit`, `remote add origin`, and `git push -u origin main`. If GitHub asks to authenticate, sign in via browser (or use a Personal Access Token with `repo` scope as the password).
> ✅ Confirm on GitHub that the **MIT license** appears in the right sidebar — Devpost requires a public repo with an open-source license.

### 🔁 PATH B — You already ran GitHub's "create a new repository" quickstart commands

GitHub's snippet only adds **one file** (`README.md`) and it **appends** a second `# trustsettle-ai` heading. It also arrives HTML-escaped (`&gt;&gt;`) and with markdown links (`[README.md](http://README.md)`) that break if pasted literally into a terminal.

**Do NOT paste GitHub's snippet.** Do this instead — it adds every file and works even if you already pushed a README-only first commit:

1. Extract **`trustsettle-ai-submission.zip`** into that **same folder** and allow it to **overwrite `README.md`** (this removes the duplicate heading).
2. Run **one** command:

```bash
# macOS / Linux
npm install && bash scripts/add-all-files.sh
```
```powershell
# Windows PowerShell
npm install; powershell -ExecutionPolicy Bypass -File scripts/add-all-files.ps1
```

Or paste these **clean plain commands** (no `echo` line, no `git init` if `.git` exists):

```bash
git add -A
git commit -m "feat: TrustSettle AI Enterprise v2.0 — Programmable PayPal Escrow & Agentic Commerce"
git branch -M main
git remote add origin https://github.com/matricphase-dot/trustsettle-ai.git   # skip if origin already set
git push -u origin main
```

> `git add -A` is the whole fix: it stages **every project file** (source, tests, docs, SDK, CI, Docker, Render) instead of just `README.md`. No `--force` needed, no history rewrite — your first commit stays intact and the project files become a normal second commit. `.gitignore` keeps `node_modules/` and `.env` out (only `.env.example` is public).
> If the folder has no `.git` yet, run `git init -b main` first. If git says "author identity unknown", run `git config user.name "matricphase-dot"` and `git config user.email "you@example.com"`, then repeat the commit.

## ✅ STEP 3 — Deploy on Render (3 min)

1. Open **`https://render.com/deploy?repo=https://github.com/matricphase-dot/trustsettle-ai`** (also the blue button at the top of `README.md`).
2. Render reads `render.yaml` automatically (Node 20, `npm install`, `npm start`, health check `/api/health`, auto-generated `JWT_SECRET`).
3. Fill the 4 blank Environment Variables:

| Key | Value |
|---|---|
| `PAYPAL_CLIENT_ID` | from developer.paypal.com → Apps & Credentials → **Sandbox** → Create App |
| `PAYPAL_CLIENT_SECRET` | from that same Sandbox App |
| `PAYPAL_ENV` | `sandbox` (already in `render.yaml`) |
| `GEMINI_API_KEY` | from aistudio.google.com/apikey |

4. Copy the **exact URL** Render shows (usually `https://trustsettle-ai-enterprise.onrender.com`; Render adds a suffix if taken) and open `/api/health` — you should see `🟢 Connected to Live PayPal`.
5. ⚠️ **Never commit `.env`** — `.gitignore` already protects it. Keep the service live & publicly reachable through **Dec 15, 2026** (judging window).

> 💡 No keys? The app runs perfectly in zero-config simulation mode with deterministic AI guardrails, so the demo can never crash on stage. Keys simply upgrade it to real PayPal Sandbox Order/Authorization/Payout IDs + live Gemini.

## ✅ STEP 4 — Record the <3:00 demo video (10 min)

Follow **`SUBMISSION-VIDEO-SCRIPT.md`** exactly (target **2:35**). Record Chrome at 1080p / 100% zoom against your **Render URL**:

1. `0:00–0:18` Hook: the trust deadlock + why AI auto-release fails.
2. `0:18–0:55` **PayPal AUTHORIZE hold → 5-layer AI evidence → mandatory Human Gate (🎤 Hindi/English voice) → Capture + Payout**.
3. `0:55–1:35` **Prompt-injection blocked**, **Smart Partial Final Capture split**, **RBAC 403** (switch to 🎨 Freelancer JWT).
4. `1:35–2:10` **A2A Agent Marketplace**, **SHA-256 Audit Chain**, **AG Grid Ledger**, **Partner SDK**, flash `/api/docs` + `/api/mcp/tools`.
5. `2:10–2:30` Close on the verified green KPI.

Upload to **YouTube (Public)** with captions ON, then paste the link into `SUBMISSION-DEVPOST-COPY.md`.

## ✅ STEP 5 — Paste into Devpost & submit (5 min)

1. Open **`SUBMISSION-DEVPOST-COPY.md`** — copy every block into the matching Devpost field.
2. Replace only 2 placeholders: **Live Demo URL** (exact Render URL) and **YouTube Video URL**. GitHub URL is already filled in.
3. Upload `docs/trustsettle-thumbnail.png` as the thumbnail; add `docs/architecture-diagram.svg` + 2–3 Command Center screenshots to the Gallery.
4. Tick the **AG Grid** and **Render** sponsor-prize eligibility boxes if offered — the project uses AG Grid Community for the ledger and deploys on Render.
5. Click **Submit** well before the deadline.

---

## 📁 FILE MAP (what to open when)

| File | Purpose |
|---|---|
| `START-HERE.md` | This runbook |
| `README.md` | Public GitHub homepage (architecture, setup, API map) |
| `SUBMISSION-DEVPOST-COPY.md` | Word-for-word Devpost paste |
| `SUBMISSION-VIDEO-SCRIPT.md` | Timed 2:35 screen-recording script |
| `docs/trustsettle-thumbnail.png` | Devpost thumbnail |
| `docs/architecture-diagram.svg` | README + Devpost gallery |
| `docs/openapi.yaml` | OpenAPI 3.0 served at `/api/docs` |
| `scripts/preflight-check.js` | `npm run preflight` compliance validator |
| `scripts/add-all-files.sh` / `.ps1` | **Use if you already ran GitHub's quickstart** — stages every project file, keeps your first commit |
| `scripts/push-to-github.sh` / `.ps1` | 1-command GitHub push from a fresh folder |
| `tests/escrow.test.js` | 8/8 Jest + Supertest integration/security tests |
| `render.yaml` / `Dockerfile` / `docker-compose.yml` | 1-click deploy + Postgres production stack |

---

## 🏁 Final sanity commands
```bash
npm run preflight     # 🏆 PRE-FLIGHT PASSED
npm test              # Tests: 8 passed, 8 total
curl -s <YOUR_RENDER_URL>/api/health
```
