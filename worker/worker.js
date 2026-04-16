// Updated: April 15, 2026

/**
 * 
 * HBCUscores.com — Cloudflare Worker
 * Handles: NCAA API proxy, D1 database reads/writes, Gemini AI recaps
 *
 * Environment variables to set in Cloudflare dashboard:
 *   GEMINI_API_KEY  — your Google AI Studio key
 *   DB              — your D1 database binding (named "hbcuscores")
 */

const NCAA_BASE = 'https://ncaa-api.henrygd.me';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── HBCU CONFERENCE IDENTIFIERS ────────────────────────────────────────────
const HBCU_CONFS = ['meac', 'swac', 'ciaa', 'siac'];

const HBCU_TEAM_FRAGMENTS = [
  'howard', 'norfolk state', 'norfolk st', 'morgan state', 'morgan st',
  'delaware state', 'delaware st', 'north carolina central', 'n.c. central',
  'south carolina state', 'south carolina st', 'maryland eastern shore',
  'coppin state', 'coppin st', 'florida a&m', 'famu', 'grambling',
  'jackson state', 'jackson st', 'prairie view', 'southern u',
  'bethune-cookman', 'bethune cookman', 'alcorn', 'alabama a&m',
  'alabama state', 'alabama st', 'texas southern', 'arkansas-pine bluff',
  'ark.-pine bluff', 'mississippi valley', 'fayetteville state',
  'fayetteville st', 'virginia state', 'virginia st', 'bowie state',
  'bowie st', 'winston-salem', 'virginia union', 'johnson c. smith',
  'bluefield state', 'bluefield st', 'livingstone', 'claflin',
  'lincoln', 'shaw', 'elizabeth city', 'morehouse', 'tuskegee',
  'miles', 'clark atlanta', 'savannah state', 'savannah st',
  'fort valley', 'albany state', 'albany st', 'kentucky state',
  'kentucky st', 'central state', 'central st', 'edward waters', 'allen',
  'benedict', 'lane', 'stillman', 'talladega', 'rust', 'oakwood',
  'philander smith', 'dillard', 'tougaloo', 'wiley', 'fisk',
  'huston-tillotson', 'paul quinn', 'voorhees',
];

function isHBCUTeam(name = '') {
  const n = name.toLowerCase();
  return HBCU_TEAM_FRAGMENTS.some(f => n.includes(f));
}

function getConfFromGame(game) {
  for (const side of ['home', 'away']) {
    const confs = game[side]?.conferences || [];
    for (const c of confs) {
      const seo = (c.conferenceSeo || '').toLowerCase();
      if (HBCU_CONFS.includes(seo)) return seo;
    }
  }
  return null;
}

function isHBCUGame(game) {
  if (getConfFromGame(game)) return true;
  const hn = game.home?.names?.short || game.home?.name || '';
  const an = game.away?.names?.short || game.away?.name || '';
  return isHBCUTeam(hn) || isHBCUTeam(an);
}

// ─── ROUTER ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (path.startsWith('/api/ncaa/'))     return handleNCAA(request, env, path);
    if (path.startsWith('/api/scores'))    return handleScores(request, env, url);
    if (path.startsWith('/api/recap'))     return handleRecap(request, env, url);
    if (path.startsWith('/api/games'))     return handleGames(request, env, url);
    if (path.startsWith('/api/standings')) return handleStandings(request, env, url);
    if (path === '/api/health')            return json({ ok: true, ts: Date.now() });

    return json({ error: 'Not found' }, 404);
  },

  // ─── CRON HANDLER ─────────────────────────────────────────────────────────
  async scheduled(event, env, ctx) {
    const sports = [
      { sport: 'basketball-men',   div: 'd1', season: '2026', month: getCurrentMonth() },
      { sport: 'basketball-men',   div: 'd2', season: '2026', month: getCurrentMonth() },
      { sport: 'basketball-women', div: 'd1', season: '2026', month: getCurrentMonth() },
      { sport: 'basketball-women', div: 'd2', season: '2026', month: getCurrentMonth() },
      { sport: 'football',         div: 'fcs', season: '2025', week: getCurrentWeek() },
      { sport: 'football',         div: 'd2',  season: '2025', week: getCurrentWeek() },
    ];

    let totalCached = 0;
    const errors = [];

    for (const s of sports) {
      try {
        let ncaaPath;
        if (s.sport.includes('football')) {
          ncaaPath = `/scoreboard/${s.sport}/${s.div}/${s.season}/${s.week}/all-conf`;
        } else {
          ncaaPath = `/scoreboard/${s.sport}/${s.div}/${s.season}/${s.month}/all-conf`;
        }

        const res = await fetch(NCAA_BASE + ncaaPath, {
          headers: { 'User-Agent': 'HBCUscores/1.0' }
        });
        if (!res.ok) throw new Error(`NCAA API ${res.status} for ${s.sport}/${s.div}`);

        const data = await res.json();
        const hbcuGames = (data.games || []).filter(g => isHBCUGame(g.game || g));
        const normalized = hbcuGames.map(g => normalizeGame(g.game || g, s.sport, s.div));

        if (env.DB && normalized.length > 0) {
          const results = await cacheGamesInDB(env.DB, normalized);
          totalCached += results.written;
          if (results.errors.length > 0) errors.push(...results.errors);

          // Auto-generate recaps for newly final games
          if (env.GEMINI_API_KEY) {
            for (const g of normalized) {
              const isFinal = /final|complete|F$/i.test(g.status || '');
              if (!isFinal) continue;
              try {
                await autoGenerateRecap(env, g);
              } catch (e) {
                errors.push(`recap ${g.game_id}: ${e.message}`);
              }
            }
          }
        }
      } catch (e) {
        errors.push(`${s.sport}/${s.div}: ${e.message}`);
      }
    }

    console.log(`[cron] Cached ${totalCached} games. Errors: ${errors.length}`, errors);
  }
};

// ─── NCAA API PROXY ──────────────────────────────────────────────────────────
async function handleNCAA(request, env, path) {
  const ncaaPath = path.replace('/api/ncaa', '');
  const ncaaUrl = NCAA_BASE + ncaaPath;

  try {
    const res = await fetch(ncaaUrl, {
      headers: { 'User-Agent': 'HBCUscores/1.0' }
    });

    if (!res.ok) {
      return json({ error: `NCAA API returned ${res.status}` }, res.status);
    }

    const data = await res.json();

    if (ncaaPath.includes('/scoreboard/')) {
      const games = (data.games || []).filter(g => isHBCUGame(g.game || g));
      return json({ ...data, games, hbcu_only: true, total_filtered: games.length });
    }

    return json(data);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── LIVE SCORES — pull from NCAA API and cache in D1 ───────────────────────
async function handleScores(request, env, url) {
  const sport  = url.searchParams.get('sport')  || 'basketball-men';
  const div    = url.searchParams.get('div')    || 'd1';
  const season = url.searchParams.get('season') || '2026';
  const week   = url.searchParams.get('week')   || getCurrentWeek();
  const month  = url.searchParams.get('month')  || getCurrentMonth();

  let ncaaPath;
  if (sport.includes('football')) {
    ncaaPath = `/scoreboard/${sport}/${div}/${season}/${week}/all-conf`;
  } else {
    ncaaPath = `/scoreboard/${sport}/${div}/${season}/${month}/all-conf`;
  }

  try {
    const res = await fetch(NCAA_BASE + ncaaPath, {
      headers: { 'User-Agent': 'HBCUscores/1.0' }
    });

    if (!res.ok) throw new Error(`NCAA API ${res.status}`);

    const data = await res.json();
    const hbcuGames = (data.games || []).filter(g => isHBCUGame(g.game || g));
    const normalized = hbcuGames.map(g => normalizeGame(g.game || g, sport, div));

    if (env.DB && normalized.length > 0) {
      const results = await cacheGamesInDB(env.DB, normalized);
      if (results.errors.length > 0) {
        console.warn('[scores] DB write errors:', results.errors);
      }
    }

    return json({
      sport,
      div,
      season,
      games: normalized,
      total: normalized.length,
      updated_at: new Date().toISOString()
    });

  } catch (e) {
    if (env.DB) {
      try {
        const cached = await getCachedGames(env.DB, sport, div, season);
        if (cached.length > 0) {
          return json({ sport, div, season, games: cached, cached: true });
        }
      } catch (dbErr) {
        console.error('[scores] D1 fallback failed:', dbErr.message);
      }
    }
    return json({ error: e.message, games: [] }, 500);
  }
}

// ─── GAME RESULTS — stored games from D1 ────────────────────────────────────
async function handleGames(request, env, url) {
  if (!env.DB) return json({ error: 'Database not configured' }, 500);

  const conf   = url.searchParams.get('conf');
  const sport  = url.searchParams.get('sport');
  const school = url.searchParams.get('school');
  const season = url.searchParams.get('season') || '2026';
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  let query = `SELECT * FROM games WHERE season = ? `;
  const params = [season];

  if (conf)  {
    query += `AND conference = ? `;
    params.push(conf.toLowerCase());
  }
  if (sport) {
    query += `AND sport = ? `;
    params.push(sport);
  }
  if (school) {
    query += `AND (LOWER(home_team) LIKE ? OR LOWER(away_team) LIKE ?) `;
    params.push(`%${school.toLowerCase()}%`, `%${school.toLowerCase()}%`);
  }

  query += `ORDER BY game_date DESC LIMIT ?`;
  params.push(limit);

  try {
    const result = await env.DB.prepare(query).bind(...params).all();
    return json({ games: result.results || [], total: result.results?.length || 0 });
  } catch (e) {
    console.error('[games] D1 query failed:', e.message);
    return json({ error: e.message }, 500);
  }
}

// ─── STANDINGS ───────────────────────────────────────────────────────────────
async function handleStandings(request, env, url) {
  const sport  = url.searchParams.get('sport')  || 'basketball-men';
  const div    = url.searchParams.get('div')    || 'd1';
  const season = url.searchParams.get('season') || '2026';

  const ncaaPath = `/standings/${sport}/${div}/${season}`;

  try {
    const res = await fetch(NCAA_BASE + ncaaPath, {
      headers: { 'User-Agent': 'HBCUscores/1.0' }
    });
    if (!res.ok) throw new Error(`NCAA API ${res.status}`);
    const data = await res.json();
    const filtered = filterStandingsToHBCU(data);
    return json(filtered);
  } catch (e) {
    console.error('[standings] fetch failed:', e.message);
    return json({ error: e.message }, 500);
  }
}

// ─── AI GAME RECAP — Gemini 2.5 Flash ────────────────────────────────────────
async function handleRecap(request, env, url) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'Gemini API key not configured' }, 500);
  }

  let gameData;
  if (request.method === 'POST') {
    try {
      gameData = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }
  } else {
    gameData = {
      game_id:      url.searchParams.get('game_id') || '',
      sport:        url.searchParams.get('sport') || 'basketball',
      winner:       url.searchParams.get('winner') || '',
      loser:        url.searchParams.get('loser') || '',
      winner_score: url.searchParams.get('winner_score') || '',
      loser_score:  url.searchParams.get('loser_score') || '',
      winner_seed:  url.searchParams.get('winner_seed') || '',
      loser_seed:   url.searchParams.get('loser_seed') || '',
      round:        url.searchParams.get('round') || '',
      conference:   url.searchParams.get('conference') || '',
      gender:       url.searchParams.get('gender') || "Men's",
      venue:        url.searchParams.get('venue') || '',
      date:         url.searchParams.get('date') || '',
      network:      url.searchParams.get('network') || '',
      season:       url.searchParams.get('season') || '',
      status:       url.searchParams.get('status') || '',
      away_team:    url.searchParams.get('away_team') || '',
      home_team:    url.searchParams.get('home_team') || '',
      away_score:   url.searchParams.get('away_score') || '',
      home_score:   url.searchParams.get('home_score') || '',
      winner_passing_yards: url.searchParams.get('winner_passing_yards') || '',
      winner_rushing_yards: url.searchParams.get('winner_rushing_yards') || '',
      loser_passing_yards:  url.searchParams.get('loser_passing_yards') || '',
      loser_rushing_yards:  url.searchParams.get('loser_rushing_yards') || '',
      winner_turnovers:     url.searchParams.get('winner_turnovers') || '',
      loser_turnovers:      url.searchParams.get('loser_turnovers') || ''
    };
  }

  if (!gameData.winner || !gameData.loser) {
    return json({ error: 'winner and loser are required' }, 400);
  }

  const cacheKey = [
    gameData.sport || 'unknown',
    gameData.conference || 'unknown',
    gameData.winner,
    gameData.loser,
    gameData.date || 'nodate'
  ].join('-').replace(/\s+/g, '-').toLowerCase();

  if (env.DB) {
    try {
      const cached = await env.DB.prepare(
        'SELECT recap FROM recaps WHERE cache_key = ?'
      ).bind(cacheKey).first();
      if (cached?.recap) {
        return json({ recap: cached.recap, cached: true });
      }
    } catch (e) {
      console.warn('[recap] Cache read failed:', e.message);
    }
  }

  let dbGame = null;
  if (env.DB && gameData.game_id) {
    try {
      dbGame = await env.DB.prepare(`
        SELECT game_id, sport, division, conference, season, round,
               away_team, away_score, away_winner, away_seed, away_rank,
               home_team, home_score, home_winner, home_seed, home_rank,
               status, game_date, game_time, venue, network, url
        FROM games WHERE game_id = ? LIMIT 1
      `).bind(gameData.game_id).first();
    } catch (e) {
      console.warn('[recap] D1 game lookup failed:', e.message);
    }
  }

  if (dbGame) {
    gameData.venue      = gameData.venue      || dbGame.venue      || '';
    gameData.date       = gameData.date       || dbGame.game_date  || '';
    gameData.network    = gameData.network    || dbGame.network    || '';
    gameData.round      = gameData.round      || dbGame.round      || '';
    gameData.conference = gameData.conference || dbGame.conference || '';
    gameData.season     = gameData.season     || dbGame.season     || '';
    gameData.away_team  = gameData.away_team  || dbGame.away_team  || '';
    gameData.home_team  = gameData.home_team  || dbGame.home_team  || '';
    gameData.away_score = gameData.away_score || (dbGame.away_score !== null ? dbGame.away_score : '');
    gameData.home_score = gameData.home_score || (dbGame.home_score !== null ? dbGame.home_score : '');

    const awayWon = dbGame.away_winner;
    if (awayWon) {
      gameData.winner_seed = gameData.winner_seed || dbGame.away_seed || '';
      gameData.loser_seed  = gameData.loser_seed  || dbGame.home_seed || '';
      gameData.winner_rank = dbGame.away_rank || '';
      gameData.loser_rank  = dbGame.home_rank || '';
    } else {
      gameData.winner_seed = gameData.winner_seed || dbGame.home_seed || '';
      gameData.loser_seed  = gameData.loser_seed  || dbGame.away_seed || '';
      gameData.winner_rank = dbGame.home_rank || '';
      gameData.loser_rank  = dbGame.away_rank || '';
    }
  }

  const isFinished = /final|complete|F$/i.test(gameData.status || dbGame?.status || '');
  if (isFinished && gameData.game_id) {
    try {
      const detailRes = await fetch(
        `${NCAA_BASE}/game/${gameData.game_id}/boxscore`,
        { headers: { 'User-Agent': 'HBCUscores/1.0' } }
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        gameData._ncaaDetail = detail;
      }
    } catch (e) {
      console.warn('[recap] NCAA detail fetch failed:', e.message);
    }
  }

  const margin = Math.abs(
    parseInt(gameData.winner_score || '0', 10) -
    parseInt(gameData.loser_score  || '0', 10)
  );
  const winnerSeedNum = parseInt(gameData.winner_seed || '0', 10);
  const loserSeedNum  = parseInt(gameData.loser_seed  || '0', 10);
  const isUpset = winnerSeedNum > 0 && loserSeedNum > 0 && winnerSeedNum > loserSeedNum;
  const isTight = margin <= 5;
  const isFootball = (gameData.sport || '').includes('football');
  const roundText  = (gameData.round || '').trim() || 'Regular Season';
  const confText   = (gameData.conference || '').toUpperCase();
  const champLike  = /champ|title|final/i.test(roundText);
  const homeTeam   = gameData.home_team || '';
  const awayTeam   = gameData.away_team || '';
  const winnerIsHome = homeTeam &&
    gameData.winner.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]);

  const ctx = {
    margin, isUpset, isTight, champLike, confText, roundText,
    homeTeam, awayTeam, winnerIsHome,
    winnerRank: gameData.winner_rank || '',
    loserRank:  gameData.loser_rank  || '',
    network:    gameData.network || '',
    venue:      gameData.venue   || '',
    date:       gameData.date    || '',
    season:     gameData.season  || '',
    ncaaDetail: gameData._ncaaDetail || null,
  };

  const prompt = isFootball
    ? buildRichFootballPrompt(gameData, ctx)
    : buildRichBasketballPrompt(gameData, ctx);

  let recap = '';
  let attempts = 0;
  const maxAttempts = 2;

  while (!recap && attempts < maxAttempts) {
    attempts++;
    try {
      const candidate = await callGemini(prompt, env);
      if (candidate.length < 60 && attempts < maxAttempts) {
        console.warn(`[recap] Gemini output too short (${candidate.length} chars), retrying...`);
        continue;
      }
      recap = candidate;
    } catch (e) {
      console.error(`[recap] Gemini error (attempt ${attempts}):`, e.message);
      if (attempts >= maxAttempts) return json({ error: e.message }, 502);
    }
  }

  if (!recap) return json({ error: 'Gemini returned empty response after retries' }, 502);

  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO recaps (cache_key, game_id, recap, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(cacheKey, gameData.game_id || null, recap, new Date().toISOString()).run();
    } catch (e) {
      console.warn('[recap] Cache write failed:', e.message);
    }
  }

  return json({ recap, cached: false });
}

// ─── GEMINI HELPER ───────────────────────────────────────────────────────────

async function callGemini(prompt, env) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.72 }
      })
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// Auto-generate recap for a normalized game object (used by cron)
async function autoGenerateRecap(env, g) {
  // Determine winner/loser
  let winner, loser, winner_score, loser_score;
  if (g.away_winner) {
    winner = g.away_team;  loser = g.home_team;
    winner_score = g.away_score; loser_score = g.home_score;
  } else if (g.home_winner) {
    winner = g.home_team;  loser = g.away_team;
    winner_score = g.home_score; loser_score = g.away_score;
  } else {
    return; // no winner determined yet
  }

  if (!winner || !loser) return;

  const cacheKey = [g.sport, g.conference || 'unknown', winner, loser, g.game_date || 'nodate']
    .join('-').replace(/\s+/g, '-').toLowerCase();

  // Skip if recap already exists
  const existing = await env.DB.prepare('SELECT id FROM recaps WHERE cache_key = ?')
    .bind(cacheKey).first();
  if (existing) return;

  const gameData = {
    game_id:      g.game_id,
    sport:        g.sport,
    conference:   g.conference || '',
    winner,       loser,
    winner_score: String(winner_score ?? ''),
    loser_score:  String(loser_score  ?? ''),
    date:         g.game_date  || '',
    venue:        g.venue      || '',
    network:      g.network    || '',
    season:       g.season     || '',
    round:        g.round      || '',
    gender:       g.sport.includes('women') ? "Women's" : "Men's",
    away_team:    g.away_team  || '',
    home_team:    g.home_team  || '',
    away_score:   String(g.away_score ?? ''),
    home_score:   String(g.home_score ?? ''),
  };

  const margin = Math.abs(parseInt(winner_score || 0) - parseInt(loser_score || 0));
  const ctx = {
    margin,
    isUpset:     false,
    isTight:     margin <= 5,
    champLike:   /champ|title|final/i.test(g.round || ''),
    confText:    (g.conference || '').toUpperCase(),
    roundText:   g.round || 'Regular Season',
    homeTeam:    g.home_team || '',
    awayTeam:    g.away_team || '',
    winnerIsHome: !!g.home_winner,
    winnerRank:  '', loserRank: '',
    network:     g.network   || '',
    venue:       g.venue     || '',
    date:        g.game_date || '',
    season:      g.season    || '',
    ncaaDetail:  null,
  };

  const prompt = g.sport.includes('football')
    ? buildRichFootballPrompt(gameData, ctx)
    : buildRichBasketballPrompt(gameData, ctx);

  const recap = await callGemini(prompt, env);
  if (!recap || recap.length < 60) return;

  await env.DB.prepare(
    'INSERT OR REPLACE INTO recaps (cache_key, game_id, recap, created_at) VALUES (?, ?, ?, ?)'
  ).bind(cacheKey, g.game_id || null, recap, new Date().toISOString()).run();

  console.log(`[cron] Auto-recap: ${g.away_team} vs ${g.home_team} (${g.sport})`);
}

// ─── PROMPT BUILDERS ─────────────────────────────────────────────────────────

function buildRichBasketballPrompt(g, ctx) {
  let detailLines = '';
  if (ctx.ncaaDetail) {
    try {
      const d = ctx.ncaaDetail;
      const periods = d.periods || d.scoringSummary || [];
      if (periods.length > 0) detailLines += `\nScoring by period: ${JSON.stringify(periods)}`;
      const topPlayers = extractTopPlayers(d);
      if (topPlayers) detailLines += `\nTop performers: ${topPlayers}`;
    } catch (_) {}
  }

  const winnerLabel = formatTeamLabel(g.winner, ctx.winnerRank, g.winner_seed);
  const loserLabel  = formatTeamLabel(g.loser,  ctx.loserRank,  g.loser_seed);
  const venueContext = ctx.homeTeam
    ? `${ctx.winnerIsHome ? g.winner : g.loser} was the home team.`
    : '';

  return `
You are a college sports writer for HBCUscores.com, a site dedicated to HBCU athletics.
Write one focused recap paragraph of 90–130 words.

GAME FACTS:
- Result: ${winnerLabel} defeated ${loserLabel} ${g.winner_score}–${g.loser_score}
- Conference: ${ctx.confText || g.conference || 'HBCU'}
- Division/Gender: ${g.gender || "Men's"}
- Round: ${ctx.roundText}
- Venue: ${ctx.venue || 'Unknown venue'}
- Date: ${ctx.date || 'Unknown date'}
- Season: ${ctx.season || ''}
- Broadcast: ${ctx.network || 'Not listed'}
- Score margin: ${ctx.margin} points
- Upset: ${ctx.isUpset ? 'Yes — lower seed won' : 'No'}
- Close game: ${ctx.isTight ? 'Yes' : 'No'}
- Championship/title game: ${ctx.champLike ? 'Yes' : 'No'}
- ${venueContext}
${detailLines}

WRITING RULES:
1. Open with winner, loser, and final score in the first sentence.
2. Describe how the game played out using only the facts above.
3. If close (margin ≤ 5), say how the winner held on or pulled away.
4. If an upset, mention seed/ranking difference naturally.
5. If championship game, treat the stakes with weight.
6. Do not invent player names, stats, or events not in the facts.
7. No cliché hype words. No bullet points. One clean paragraph.
8. End on what the result means: tournament position, rivalry, title clinch, or road win.

Return only the paragraph.
`.trim();
}

function buildRichFootballPrompt(g, ctx) {
  const hasStats = g.winner_passing_yards || g.winner_rushing_yards ||
                   g.loser_passing_yards  || g.loser_rushing_yards;

  const statsBlock = hasStats ? `
OFFENSIVE STATS:
- ${g.winner} passing: ${g.winner_passing_yards || 'N/A'} yds | rushing: ${g.winner_rushing_yards || 'N/A'} yds | turnovers: ${g.winner_turnovers || 0}
- ${g.loser}  passing: ${g.loser_passing_yards  || 'N/A'} yds | rushing: ${g.loser_rushing_yards  || 'N/A'} yds | turnovers: ${g.loser_turnovers  || 0}
` : `OFFENSIVE STATS: Not available — describe game shape from score and margin only.`;

  const winnerLabel = formatTeamLabel(g.winner, ctx.winnerRank, g.winner_seed);
  const loserLabel  = formatTeamLabel(g.loser,  ctx.loserRank,  g.loser_seed);

  return `
You are a college sports writer for HBCUscores.com, a site dedicated to HBCU athletics.
Write one focused recap paragraph of 90–130 words.

GAME FACTS:
- Result: ${winnerLabel} defeated ${loserLabel} ${g.winner_score}–${g.loser_score}
- Conference: ${ctx.confText || g.conference || 'HBCU'}
- Round: ${ctx.roundText}
- Venue: ${ctx.venue || 'Unknown venue'}
- Date: ${ctx.date || 'Unknown date'}
- Season: ${ctx.season || ''}
- Broadcast: ${ctx.network || 'Not listed'}
- Score margin: ${ctx.margin} points
- Close game: ${ctx.isTight ? 'Yes' : 'No'}
- Championship/title game: ${ctx.champLike ? 'Yes' : 'No'}
${statsBlock}

WRITING RULES:
1. Open with winner, loser, and final score in the first sentence.
2. Describe game shape using stats if available; otherwise use score margin.
3. Mention turnovers if one team had significantly more.
4. If close, explain how the winner secured it.
5. If championship game, reflect the stakes.
6. Do not invent play-by-play or player names not provided.
7. No clichés, no hype, no bullet points.
8. End with what the result means in context.

Return only the paragraph.
`.trim();
}

function formatTeamLabel(name, rank, seed) {
  const parts = [];
  if (rank) parts.push(`#${rank}`);
  if (seed) parts.push(`(${seed}-seed)`);
  return parts.length > 0 ? `${name} ${parts.join(' ')}` : name;
}

function extractTopPlayers(detail) {
  try {
    const teams = detail.teams || detail.teamStats || [];
    const lines = [];
    for (const team of teams.slice(0, 2)) {
      const players = team.playerStats || team.players || [];
      for (const p of players.slice(0, 2)) {
        const name = p.name || p.fullName || '';
        const pts  = p.pts  || p.points   || '';
        const reb  = p.reb  || p.rebounds || '';
        const ast  = p.ast  || p.assists  || '';
        if (name && (pts || reb || ast)) {
          lines.push(`${name}: ${pts ? pts + ' pts' : ''}${reb ? ' ' + reb + ' reb' : ''}${ast ? ' ' + ast + ' ast' : ''}`.trim());
        }
      }
    }
    return lines.length > 0 ? lines.join(', ') : null;
  } catch (_) {
    return null;
  }
}

function normalizeGame(game, sport, div) {
  const away = game.away || {};
  const home = game.home || {};
  const conf = getConfFromGame(game);
  const gameDate = game.startDate || '';
  const season = gameDate
    ? deriveSeasonFromDate(gameDate, sport)
    : new Date().getFullYear().toString();

  return {
    game_id:      game.gameID || game.id || '',
    sport,
    division:     div,
    conference:   conf || '',
    away_team:    away.names?.short || away.name || '',
    away_score:   (away.score !== undefined ? away.score : null),
    away_winner:  away.winner || false,
    away_seed:    away.seed || '',
    away_rank:    away.rank || '',
    home_team:    home.names?.short || home.name || '',
    home_score:   (home.score !== undefined ? home.score : null),
    home_winner:  home.winner || false,
    home_seed:    home.seed || '',
    home_rank:    home.rank || '',
    round:        game.round || '',
    status:       game.gameState || game.currentPeriod || '',
    game_date:    gameDate,
    game_time:    game.startTime || '',
    venue:        game.venue?.name || game.location || '',
    network:      game.network || '',
    url:          game.url || '',
    season,
  };
}

function deriveSeasonFromDate(dateStr, sport) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().getFullYear().toString();
  const year  = d.getFullYear();
  const month = d.getMonth() + 1;
  if (sport && sport.includes('football')) {
    return (month >= 8 ? year : year - 1).toString();
  } else {
    return (month >= 11 ? year + 1 : year).toString();
  }
}

async function cacheGamesInDB(db, games) {
  let written = 0;
  const errors = [];
  for (const g of games) {
    try {
      await db.prepare(`
        INSERT OR REPLACE INTO games
        (game_id, sport, division, conference, season, round,
         away_team, away_score, away_winner, away_seed, away_rank,
         home_team, home_score, home_winner, home_seed, home_rank,
         status, game_date, game_time, venue, network, url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        g.game_id, g.sport, g.division, g.conference, g.season, g.round,
        g.away_team, g.away_score, g.away_winner ? 1 : 0, g.away_seed, g.away_rank,
        g.home_team, g.home_score, g.home_winner ? 1 : 0, g.home_seed, g.home_rank,
        g.status, g.game_date, g.game_time, g.venue, g.network, g.url,
        new Date().toISOString()
      ).run();
      written++;
    } catch (e) {
      errors.push(`game_id=${g.game_id}: ${e.message}`);
    }
  }
  return { written, errors };
}

async function getCachedGames(db, sport, div, season) {
  const result = await db.prepare(
    'SELECT * FROM games WHERE sport = ? AND division = ? AND season = ? ORDER BY game_date DESC LIMIT 100'
  ).bind(sport, div, season).all();
  return result.results || [];
}

function filterStandingsToHBCU(data) {
  const text = JSON.stringify(data).toLowerCase();
  const found = HBCU_CONFS.filter(c => text.includes(c));
  return { ...data, hbcu_conferences_found: found };
}

function getCurrentMonth() {
  return String(new Date().getMonth() + 1).padStart(2, '0');
}

function getCurrentWeek() {
  const now    = new Date();
  const year   = now.getFullYear();
  const weekOne = new Date(year, 7, 24);
  const diff   = Math.floor((now - weekOne) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return String(Math.max(1, Math.min(diff, 15)));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
