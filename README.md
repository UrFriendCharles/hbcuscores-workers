# hbcuscores-workers

NCAA scores dashboard Worker, D1 database, and Pages frontend for **hbcuscores.com**

## What's in this repo

```
worker/
  └── worker.js          ← Cloudflare Worker (NCAA API proxy + D1 + Gemini recaps)
frontend/
  └── index.html         ← Cloudflare Pages frontend
database/
  └── schema.sql         ← D1 database schema (games, recaps, brackets, champions)
.github/workflows/
  └── deploy-hbcuscores.yml  ← GitHub Actions auto-deploy to Cloudflare
DEPLOY.md                ← Step-by-step deployment guide
SECRETS.md               ← How secrets are managed (read before deploying)
```

## Architecture

```
Browser → Cloudflare Pages (index.html)
              ↓ fetch()
        Cloudflare Worker (hbcuscores-api)
              ↓                    ↓
        NCAA API              D1 Database (hbcuscores)
        (scores/standings)    (games, recaps, brackets)
              ↓
        Gemini 2.5 Flash (AI game recaps)
```

- **Worker**: `hbcuscores-api` on Cloudflare Workers
- **Database**: `hbcuscores` on Cloudflare D1 (SQLite)
- **Frontend**: Cloudflare Pages (static HTML, no build step)
- **Cron**: Worker scheduled trigger refreshes scores automatically

## Supported Sports & Conferences

Sports: Men's Basketball, Women's Basketball, Football
Conferences: MEAC, SWAC, CIAA, SIAC

## Environment Variables (set in Cloudflare — never in code)

| Variable       | Where to set           | Description                    |
|----------------|------------------------|-------------------------------|
| `GEMINI_API_KEY` | Cloudflare Workers → Settings → Variables | Google AI Studio API key |
| `DB`           | Cloudflare Workers → Settings → Bindings  | D1 database binding (name: `hbcuscores`) |

See `SECRETS.md` for full details on managing secrets securely.

## Quick Start

See `DEPLOY.md` for the full deployment walkthrough.

## Auto-Deploy

Pushing to `main` automatically deploys the Worker via GitHub Actions.
You must add `CLOUDFLARE_API_TOKEN` as a GitHub Secret first — see `SECRETS.md`.
