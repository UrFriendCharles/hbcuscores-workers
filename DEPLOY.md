# Deployment Guide — hbcuscores-workers

## Prerequisites

- Cloudflare account with Workers and D1 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed (`npm install -g wrangler`)
- `ANTHROPIC_API_KEY` from [Anthropic Console](https://console.anthropic.com/)

---

## Step 1 — Authenticate Wrangler

```bash
wrangler login
```

---

## Step 2 — Create / Verify the D1 Database

If the `hbcuscores` database doesn't exist yet:

```bash
wrangler d1 create hbcuscores
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "hbcuscores"
database_id = "<your-database-id>"
```

Apply the schema:

```bash
wrangler d1 execute hbcuscores --file=database/schema.sql
```

---

## Step 3 — Set the Anthropic API Secret

```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted — it is never stored in code or git
```

---

## Step 4 — Deploy the Worker

```bash
wrangler deploy worker/worker.js
```

Verify it's live:

```bash
curl https://hbcuscores-api.<your-subdomain>.workers.dev/api/health
# Expected: {"ok":true,"ts":...}
```

---

## Step 5 — Deploy the Frontend (Cloudflare Pages)

1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect this GitHub repo (`hbcuscores-workers`)
3. Set build settings:
   - **Build command**: *(leave empty — no build step)*
   - **Build output directory**: `frontend`
4. Deploy

Your frontend will be live at `https://hbcuscores.pages.dev` (or your custom domain).

---

## Step 6 — Configure the Cron Trigger

In `wrangler.toml`, add:

```toml
[triggers]
crons = ["*/30 * * * *"]   # every 30 minutes
```

Redeploy:

```bash
wrangler deploy worker/worker.js
```

---

## Step 7 — Set Up GitHub Actions Auto-Deploy

1. Create a Cloudflare API token:
   - Cloudflare Dashboard → My Profile → API Tokens → Create Token
   - Use template: **Edit Cloudflare Workers**
   - Scope: your account + the `hbcuscores-api` Worker

2. Add the token to GitHub:
   - Repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: *(paste your token)*

3. Push to `main` — the workflow in `.github/workflows/deploy-hbcuscores.yml` will auto-deploy.

---

## Updating the D1 Schema

Run new migrations directly against the live database:

```bash
wrangler d1 execute hbcuscores --command="ALTER TABLE games ADD COLUMN new_field TEXT"
```

Or for a migration file:

```bash
wrangler d1 execute hbcuscores --file=database/migration-001.sql
```

---

## Useful Commands

```bash
# Check deployed Worker
wrangler deployments list

# Tail live Worker logs
wrangler tail hbcuscores-api

# Query D1 directly
wrangler d1 execute hbcuscores --command="SELECT COUNT(*) FROM games"

# Check cron trigger status
wrangler triggers list
```
