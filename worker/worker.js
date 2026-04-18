/**
 * worker.js
 * HBCUscores Worker — main entry.
 *
 * Routes:
 *   GET  /api/scores?sport=&conference=&division=&school=&date=
 *   GET  /api/standings?sport=&conference=
 *   GET  /api/brackets?sport=&season=
 *   GET  /api/schools?conference=&hbcu_only=1
 *   GET  /api/recap/:game_id            (returns cached or 404)
 *   POST /api/recap/:game_id            (generates via Claude, caches)
 *   GET  /api/healthz
 *
 * Scheduled:
 *   Fires every 5 minutes. Uses scheduler.planTick() to decide
 *   whether to actually pull upstream data based on the current mode.
 */

import { normalizeGame } from './lib/normalize.js';
import { schoolsInScope, isHBCUGame } from './lib/schools.js';
import { planTick } from './lib/scheduler.js';
import {
  generateRecapWithClaude,
  getCachedRecap,
  cacheRecap,
} from './lib/recap/claude.js';
import { buildRecapSummary } from './lib/recap/prompts.js';

const DEFAULT_UPSTREAM = 'https://ncaa-api.henrygd.me';

const SCOREBOARD_PATHS = {
  fb:  ['football/fcs', 'football/d2'],
  mbb: ['basketball-men/d1', 'basketball-men/d2'],
  wbb: ['basketball-women/d1', 'basketball-women/d2'],
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...(init.headers || {}),
    },
  });
}

function notFound(msg = 'Not found') { return json({ error: msg }, { status: 404 }); }
function badRequest(msg = 'Bad request') { return json({ error: msg }, { status: 400 }); }
function serverError(msg = 'Server error') { return json({ error: msg }, { status: 500 }); }
function q(url, key, dflt = null) {
  const v = url.searchParams.get(key);
  return v === null || v === '' ? dflt : v;
}

async function handleScores(req, env) {
  const url = new URL(req.url);
  const sport = q(url, 'sport', 'latest');
  const conference = q(url, 'conference', 'all');
  const division = q(url, 'division', 'all');
  const school = q(url, 'school');
  const date = q(url, 'date');

  const where = ['1=1'];
  const binds = [];

  if (sport && sport !== 'latest') {
    where.push('sport = ?');
    binds.push(sport);
  }
  if (conference && conference !== 'all') {
    if (conference === 'OTHER') {
      where.push(`
        (EXISTS (SELECT 1 FROM schools s
                 WHERE s.slug IN (games.away_school_slug, games.home_school_slug)
                   AND s.is_hbcu = 1 AND s.in_covered_conference = 0))
      `);
    } else {
      where.push('conference = ?');
      binds.push(conference);
    }
  }
  if (division && division !== 'all') {
    where.push(`
      EXISTS (SELECT 1 FROM schools s
              WHERE s.slug IN (games.away_school_slug, games.home_school_slug)
                AND s.division = ?)
    `);
    binds.push(division);
  }
  if (school) {
    where.push('(games.away_school_slug = ? OR games.home_school_slug = ?)');
    binds.push(school, school);
  }
  if (date) {
    where.push('DATE(start_time) = DATE(?)');
    binds.push(date);
  }

  const sql = `
    SELECT * FROM games
    WHERE ${where.join(' AND ')}
    ORDER BY start_time DESC
    LIMIT 200
  `;

  const res = await env.DB.prepare(sql).bind(...binds).all();
  const rows = res.results || [];
  const games = await Promise.all(rows.map(r => normalizeGame(env.DB, r)));

  return json({
    meta: {
      sport,
      date,
      filters: { conference, division, school },
      count: games.length,
      source: 'd1',
      cached_at: new Date().toISOString(),
    },
    games,
  });
}

async function handleStandings(req, env) {
  const url = new URL(req.url);
  const sport = q(url, 'sport');
  const conference = q(url, 'conference');
  if (!sport) return badRequest('sport is required (fb|mbb|wbb)');

  try {
    const where = ['sport = ?'];
    const binds = [sport];
    if (conference && conference !== 'all') {
      where.push('conference = ?');
      binds.push(conference);
    }
    const sql = `
      SELECT st.*, s.display_name, s.logo_url, s.is_hbcu, s.in_covered_conference
      FROM standings st
      LEFT JOIN schools s ON s.slug = st.school_slug
      WHERE ${where.join(' AND ')}
      ORDER BY conference, conf_w DESC, overall_w DESC
    `;
    const res = await env.DB.prepare(sql).bind(...binds).all();
    return json({
      meta: { sport, conference: conference || 'all', count: (res.results || []).length },
      standings: res.results || [],
    });
  } catch (err) {
    return json({
      meta: { sport, conference: conference || 'all', count: 0, note: 'standings unavailable' },
      standings: [],
    });
  }
}

async function handleBrackets(req, env) {
  const url = new URL(req.url);
  const sport = q(url, 'sport');
  const season = q(url, 'season');
  const where = [];
  const binds = [];
  if (sport) { where.push('sport = ?'); binds.push(sport); }
  if (season) { where.push('season = ?'); binds.push(season); }

  const sql = `
    SELECT b.*, c.champion_school_slug, c.runner_up_school_slug
    FROM brackets b
    LEFT JOIN champions c
      ON c.sport = b.sport AND c.season = b.season AND c.conference = b.conference
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY season DESC, conference
  `;
  const res = await env.DB.prepare(sql).bind(...binds).all();
  const todayYear = new Date().getUTCFullYear();
  const brackets = (res.results || []).map(b => {
    const status = b.status || (b.champion_school_slug ? 'final' : (Number((b.season || '').slice(0, 4)) < todayYear ? 'archived' : 'live'));
    return { ...b, status };
  });
  return json({ meta: { sport, season, count: brackets.length }, brackets });
}

async function handleSchools(req, env) {
  const url = new URL(req.url);
  const opts = {
    conference: q(url, 'conference'),
    division: q(url, 'division'),
    association: q(url, 'association'),
    hbcu_only: q(url, 'hbcu_only') === '1',
  };
  const rows = await schoolsInScope(env.DB, opts);
  return json({ meta: { count: rows.length, filters: opts }, schools: rows });
}

async function handleRecapGet(req, env, game_id) {
  const cached = await getCachedRecap(env.DB, game_id);
  if (!cached) return notFound('no recap available');
  return json({ game_id, text: cached, source: 'cache' });
}

async function handleRecapPost(req, env, game_id) {
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(String(game_id)).first();
  if (!game) return notFound('unknown game_id');
  if (String(game.status || '').toLowerCase() !== 'final') return badRequest('recap only available for final games');

  const normalized = await normalizeGame(env.DB, game);
  let boxScore = null;
  try {
    const row = await env.DB.prepare('SELECT data FROM box_scores WHERE game_id = ?').bind(String(game_id)).first();
    if (row && row.data) boxScore = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  } catch (_) {}

  const url = new URL(req.url);
  if (q(url, 'force') !== '1') {
    const cached = await getCachedRecap(env.DB, game_id);
    if (cached) return json({ game_id, text: cached, source: 'cache' });
  }

  const summary = buildRecapSummary(normalized, boxScore);
  try {
    const { text, model } = await generateRecapWithClaude(env, summary);
    await cacheRecap(env.DB, game_id, text, model);
    return json({ game_id, text, model, source: 'generated' });
  } catch (err) {
    return serverError(`recap generation failed: ${err.message}`);
  }
}

async function handleHealth(req, env) {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM schools').first();
    return json({ ok: true, schools: r?.n ?? 0, now: new Date().toISOString() });
  } catch (err) {
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}

async function ingestScores(env, sports) {
  const base = env.UPSTREAM_BASE || DEFAULT_UPSTREAM;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  let upserts = 0;

  for (const sport of sports) {
    const paths = SCOREBOARD_PATHS[sport] || [];
    for (const path of paths) {
      const url = `${base}/scoreboard/${path}/${today}/all-conf`;
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'hbcuscores/2' } });
        if (!res.ok) continue;
        const data = await res.json();
        const rawGames = Array.isArray(data.games) ? data.games : [];
        for (const g of rawGames) {
          const flat = flattenUpstreamGame(g, sport);
          if (!(await isHBCUGame(env.DB, flat))) continue;
          await upsertGame(env.DB, flat);
          upserts++;
        }
      } catch (err) {
        console.error('ingest error', url, err.message);
      }
    }
  }
  return { upserts };
}

function flattenUpstreamGame(g, sport) {
  const home = g.game?.home || g.home || {};
  const away = g.game?.away || g.away || {};
  return {
    id: g.game?.gameID || g.game_id || g.id,
    sport,
    status: g.game?.gameState || g.gameState || g.status,
    start_time: g.game?.startDate || g.startDate || g.start_time,
    conference: g.game?.conferenceName || g.conference || null,
    is_conference_game: !!(g.game?.isConferenceGame ?? g.is_conference_game),
    is_tournament_game: !!(g.game?.bracketId || g.is_tournament_game),
    venue: g.game?.location || g.venue || null,
    away_team_name: away.names?.short || away.name || away.team_name,
    home_team_name: home.names?.short || home.name || home.team_name,
    away_team_full: away.names?.full || away.full_name,
    home_team_full: home.names?.full || home.full_name,
    away_team_seo: away.names?.seo || away.seo || away.team_seo,
    home_team_seo: home.names?.seo || home.seo || home.team_seo,
    away_score: away.score,
    home_score: home.score,
    away_record: away.description || away.record,
    home_record: home.description || home.record,
  };
}

async function upsertGame(db, g) {
  await db.prepare(`
    INSERT INTO games (
      id, sport, status, start_time, conference,
      is_conference_game, is_tournament_game, venue,
      away_team_name, home_team_name,
      away_team_full, home_team_full,
      away_team_seo, home_team_seo,
      away_score, home_score,
      away_record, home_record
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      start_time = excluded.start_time,
      conference = excluded.conference,
      venue = excluded.venue,
      away_team_name = excluded.away_team_name,
      home_team_name = excluded.home_team_name,
      away_team_full = excluded.away_team_full,
      home_team_full = excluded.home_team_full,
      away_team_seo = excluded.away_team_seo,
      home_team_seo = excluded.home_team_seo,
      away_score = excluded.away_score,
      home_score = excluded.home_score,
      away_record = excluded.away_record,
      home_record = excluded.home_record
  `).bind(
    String(g.id), g.sport, g.status, g.start_time, g.conference,
    g.is_conference_game ? 1 : 0, g.is_tournament_game ? 1 : 0, g.venue,
    g.away_team_name, g.home_team_name,
    g.away_team_full, g.home_team_full,
    g.away_team_seo, g.home_team_seo,
    g.away_score ?? null, g.home_score ?? null,
    g.away_record, g.home_record
  ).run();
}

async function autoRecapFinals(env) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await env.DB.prepare(`
    SELECT g.id FROM games g
    LEFT JOIN recaps r ON r.game_id = g.id
    WHERE LOWER(g.status) LIKE '%final%'
      AND DATE(g.start_time) = DATE(?)
      AND r.game_id IS NULL
    LIMIT 20
  `).bind(today).all();

  const ids = (res.results || []).map(r => r.id);
  for (const id of ids) {
    try {
      const fakeReq = new Request(`https://x/api/recap/${id}`, { method: 'POST' });
      await handleRecapPost(fakeReq, env, id);
    } catch (err) {
      console.error('auto-recap failed', id, err.message);
    }
  }
  return { recapped: ids.length };
}

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (url.pathname === '/api/healthz') return handleHealth(req, env);
      if (url.pathname === '/api/scores') return handleScores(req, env);
      if (url.pathname === '/api/standings') return handleStandings(req, env);
      if (url.pathname === '/api/brackets') return handleBrackets(req, env);
      if (url.pathname === '/api/schools') return handleSchools(req, env);

      const recapMatch = url.pathname.match(/^\/api\/recap\/(.+)$/);
      if (recapMatch) {
        const id = decodeURIComponent(recapMatch[1]);
        if (req.method === 'GET') return handleRecapGet(req, env, id);
        if (req.method === 'POST') return handleRecapPost(req, env, id);
        return json({ error: 'method not allowed' }, { status: 405 });
      }
      return notFound();
    } catch (err) {
      console.error('fetch error', err);
      return serverError(err.message);
    }
  },

  async scheduled(event, env, ctx) {
    const plan = planTick(env, new Date(event.scheduledTime || Date.now()));
    console.log('scheduled tick', plan);
    if (!plan.shouldRun || plan.sports.length === 0) return;

    ctx.waitUntil((async () => {
      const { upserts } = await ingestScores(env, plan.sports);
      console.log(`ingested ${upserts} games; mode=${plan.mode}`);
      if (plan.mode !== 'offseason') {
        const r = await autoRecapFinals(env);
        console.log(`auto-recapped ${r.recapped} games`);
      }
    })());
  },
};
