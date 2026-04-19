# hbcuscores-workers

NCAA scores dashboard Worker, D1 database, and Pages frontend for **hbcuscores.com**

## What's in this repo

```
worker/
  └── worker.js              ← Cloudflare Worker (NCAA API proxy + D1 + Claude recaps)
  └── lib/
      ├── normalize.js        ← Canonical API response formatter
      ├── schools.js          ← HBCU school registry + slug resolution
      ├── scheduler.js        ← Cron mode logic (tournament / in-season / offseason)
      └── recap/
          ├── claude.js       ← Claude Haiku recap generation + D1 caching
          └── prompts.js      ← Recap prompt builders
frontend/
  └── index.html             ← Cloudflare Pages frontend (single static file)
database/
  ├── schema.sql             ← Full reference schema (run on fresh DB)
  ├── 002_schools_and_linkage.sql  ← Phase 2: schools registry
  ├── 003_seed_schools.sql         ← 47 HBCU schools seed data
  └── 004_standings_and_box_scores.sql  ← standings + box_scores tables
.github/workflows/
  └── deploy-hbcuscores.yml  ← GitHub Actions auto-deploy to Cloudflare
DEPLOY.md                    ← Step-by-step deployment guide
SECRETS.md                   ← How secrets are managed (read before deploying)
```

## Architecture

```
Browser → Cloudflare Pages (index.html)
              ↓ fetch()
        Cloudflare Worker (hbcuscores-api)
              ↓                    ↓
        NCAA API              D1 Database (hbcuscores)
        (scores/standings)    (games, recaps, schools, brackets)
              ↓
        Claude Haiku (AI game recaps via Anthropic API)
```

- **Worker**: `hbcuscores-api` on Cloudflare Workers
- **Database**: `hbcuscores` on Cloudflare D1 (SQLite)
- **Frontend**: Cloudflare Pages (static HTML, no build step)
- **Cron**: Worker scheduled trigger refreshes scores every 15 minutes

## Supported Sports & Conferences

Sports: Men's Basketball, Women's Basketball, Football
Conferences: MEAC, SWAC, CIAA, SIAC

## Environment Variables (set in Cloudflare — never in code)

| Variable             | Where to set                                      | Description                                      |
|----------------------|---------------------------------------------------|--------------------------------------------------|
| `ANTHROPIC_API_KEY`  | Cloudflare Workers → Settings → Variables (Secret)| Anthropic API key for Claude recap generation    |
| `DB`                 | Cloudflare Workers → Settings → Bindings          | D1 database binding (name: `hbcuscores`)         |
| `CLAUDE_RECAP_MODEL` | Cloudflare Workers → Settings → Variables         | Optional: override Claude model (default: `claude-haiku-4-5-20251001`) |
| `UPSTREAM_BASE`      | Cloudflare Workers → Settings → Variables         | Optional: override NCAA API base URL             |

See `SECRETS.md` for full details on managing secrets securely.

## Quick Start

See `DEPLOY.md` for the full deployment walkthrough.

## Auto-Deploy

Pushing to `main` automatically deploys the Worker via GitHub Actions.
You must add `CLOUDFLARE_API_TOKEN` as a GitHub Secret first — see `SECRETS.md`.
