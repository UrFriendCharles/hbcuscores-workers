# Secrets Management — hbcuscores-workers

## Golden Rule

**Secrets NEVER live in this repo.** No API keys, tokens, or credentials anywhere in the codebase — not in comments, not in config files, not in commit history.

---

## Secrets That Belong in Cloudflare (not GitHub)

These are set directly in the Cloudflare dashboard or via Wrangler CLI and are injected into the Worker at runtime via the `env` object.

### `ANTHROPIC_API_KEY`

- **What it is**: Your Anthropic API key for Claude Haiku
- **Used for**: Generating AI game recaps in `/api/recap`
- **Where to get it**: [https://console.anthropic.com/](https://console.anthropic.com/)

**To update:**

Option A — Wrangler CLI (recommended):
```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your new key when prompted
```

Option B — Cloudflare Dashboard:
1. Cloudflare Dashboard → Workers & Pages → `hbcuscores-api`
2. Settings → Variables → Edit Variables
3. Update `ANTHROPIC_API_KEY` → Save and Deploy

### `DB` (D1 Database Binding)

- **What it is**: Binding to the `hbcuscores` D1 database
- **Not a secret per se** — set as a binding, not a variable
- **To configure**: Cloudflare Dashboard → Workers & Pages → `hbcuscores-api` → Settings → Bindings → D1 Databases

---

## Secrets That Belong in GitHub (for Actions only)

Only one GitHub secret is needed to enable auto-deploy:

### `CLOUDFLARE_API_TOKEN`

- **What it is**: A Cloudflare API token scoped to deploy Workers
- **Used for**: GitHub Actions workflow (`.github/workflows/deploy-hbcuscores.yml`)
- **Never** put this in the Worker code or any source file

**To create:**
1. Cloudflare Dashboard → My Profile → API Tokens → Create Token
2. Use template: **Edit Cloudflare Workers**
3. Scope: Account — `ef7445e372456a62bf23391785f274ed` → Zone: All zones (or `hbcuscores.com`)

**To add to GitHub:**
1. GitHub → `UrFriendCharles/hbcuscores-workers` → Settings → Secrets and variables → Actions
2. New repository secret → Name: `CLOUDFLARE_API_TOKEN` → Paste value → Save

---

## What NOT to Do

- Do NOT put `ANTHROPIC_API_KEY` in `wrangler.toml` as a plain text variable
- Do NOT commit `.env` files (already in `.gitignore`)
- Do NOT hardcode any key in `worker.js` — all secrets come from `env.*`
- Do NOT share API tokens in GitHub Issues or PR comments

---

## Rotating Secrets

If a key is compromised:

1. Revoke the old key immediately at the provider (Google AI Studio or Cloudflare)
2. Generate a new key
3. Update it in Cloudflare using `wrangler secret put ANTHROPIC_API_KEY` or the dashboard
4. Verify the Worker is still healthy: `curl .../api/healthz`
