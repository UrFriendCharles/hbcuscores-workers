/**
 * claude.js
 * Claude Haiku 4.5 integration for recap generation.
 *
 * Env vars expected:
 *   ANTHROPIC_API_KEY   — required
 *   CLAUDE_RECAP_MODEL  — optional, defaults to claude-haiku-4-5-20251001
 *
 * Public API:
 *   generateRecapWithClaude(env, summary)  -> { text, model, usage }
 *   getCachedRecap(db, game_id)             -> { text, model } | null
 *   cacheRecap(db, game_id, text, model)    -> void
 */

import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 400;
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

export async function generateRecapWithClaude(env, summary) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const model = env.CLAUDE_RECAP_MODEL || DEFAULT_MODEL;
  const userPrompt = buildUserPrompt(summary);

  const body = {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`Claude ${res.status}: ${errText.slice(0, 200)}`);
          await backoff(attempt);
          continue;
        }
        throw new Error(`Claude ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = extractText(data);
      if (!text) throw new Error('Claude returned empty content');
      return {
        text: text.trim(),
        model: data.model || model,
        usage: data.usage || null,
      };
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError' || /network|fetch/i.test(err.message)) {
        await backoff(attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Claude recap generation failed');
}

function extractText(data) {
  if (!data || !Array.isArray(data.content)) return null;
  return data.content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
}

function backoff(attempt) {
  const ms = 400 * Math.pow(2, attempt);
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Returns { text, model } or null if no recap found.
 * Checks `text` column first, falls back to legacy `recap` column.
 */
export async function getCachedRecap(db, game_id) {
  const row = await db
    .prepare('SELECT text, recap, model FROM recaps WHERE cache_key = ? LIMIT 1')
    .bind(String(game_id))
    .first();
  if (!row) return null;
  const text = row.text || row.recap || null;
  if (!text) return null;
  return { text, model: row.model || null };
}

/**
 * Stores recap using game_id as cache_key.
 * Writes to both `text` and legacy `recap` columns to satisfy NOT NULL constraint.
 */
export async function cacheRecap(db, game_id, text, model) {
  await db
    .prepare(`
      INSERT INTO recaps (cache_key, game_id, recap, text, model, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        game_id = excluded.game_id,
        recap = excluded.recap,
        text = excluded.text,
        model = excluded.model,
        created_at = excluded.created_at
    `)
    .bind(String(game_id), String(game_id), text, text, model)
    .run();
}
