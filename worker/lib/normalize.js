/**
 * normalize.js
 * Transforms raw D1 game rows into our canonical API response shape.
 *
 * Output shape:
 *   {
 *     id, sport, status, status_detail, start_time,
 *     conference, is_conference_game, is_tournament_game,
 *     away: { school_slug, display_name, short_name, full_name,
 *             seo, logo_url, score, record, is_winner, is_hbcu },
 *     home: { ...same },
 *     venue, has_recap, recap_url
 *   }
 */

import { resolveSchool } from './schools.js';

const NCAA_LOGO_BASE = 'https://ncaa-api.henrygd.me/logo';

/**
 * Build a logo URL from available hints, in order of preference:
 *   1) registry row's logo_url column (if populated)
 *   2) upstream team_seo slug from the feed
 *   3) our canonical slug (works well for most HBCUs)
 *   4) null
 */
export function deriveLogoUrl({ schoolRow, team_seo, slug }) {
  if (schoolRow && schoolRow.logo_url) return schoolRow.logo_url;
  if (team_seo) return `${NCAA_LOGO_BASE}/${team_seo}.svg`;
  if (slug)     return `${NCAA_LOGO_BASE}/${slug}.svg`;
  return null;
}

/**
 * Map ncaa-api scoreboard game status strings into our 3-state model.
 */
export function normalizeStatus(rawStatus, rawState) {
  const s = String(rawStatus || rawState || '').toLowerCase();
  if (s.includes('final')) return { status: 'final', detail: 'Final' };
  if (s.includes('live') || s.includes('in_progress') || s.includes('in progress'))
    return { status: 'live', detail: rawStatus || 'Live' };
  if (s.includes('pre') || s.includes('scheduled') || s.includes('upcoming'))
    return { status: 'scheduled', detail: rawStatus || 'Scheduled' };
  return { status: 'scheduled', detail: rawStatus || '' };
}

/**
 * Produce the per-side (away/home) object for the API response.
 * Reads both `away_team` (schema column) and `away_team_name` (legacy) for compatibility.
 */
async function buildSide(db, raw, sideKey) {
  // Schema uses `away_team` / `home_team`; legacy upstream flatten used `away_team_name`
  const name   = raw[`${sideKey}_team`] || raw[`${sideKey}_team_name`] || raw[`${sideKey}_team_full`] || raw[`${sideKey}_team_seo`];
  const seo    = raw[`${sideKey}_team_seo`]  || null;
  const full   = raw[`${sideKey}_team_full`] || null;
  const score  = raw[`${sideKey}_score`];
  const record = raw[`${sideKey}_record`]    || null;

  const schoolRow = await resolveSchool(db, name);
  const slug = schoolRow?.slug || raw[`${sideKey}_school_slug`] || null;
  const logo_url = deriveLogoUrl({ schoolRow, team_seo: seo, slug });

  return {
    school_slug:  slug,
    display_name: schoolRow?.display_name || name || null,
    short_name:   schoolRow?.short_name   || null,
    full_name:    schoolRow?.full_name    || full || null,
    seo,
    logo_url,
    score: score === null || score === undefined || score === '' ? null : Number(score),
    record,
    is_winner: false,             // set below after both sides computed
    is_hbcu:   schoolRow?.is_hbcu === 1,
  };
}

/**
 * Construct an ISO start_time string from game_date + game_time columns.
 * Falls back to any raw start_time/startTime field.
 */
function buildStartTime(raw) {
  if (raw.game_date) {
    if (raw.game_time) return `${raw.game_date}T${raw.game_time}`;
    return raw.game_date;
  }
  return raw.start_time || raw.startTime || null;
}

/**
 * Main entry: turn a D1 game row into the canonical response shape.
 */
export async function normalizeGame(db, raw) {
  const away = await buildSide(db, raw, 'away');
  const home = await buildSide(db, raw, 'home');

  // Determine winner for final games.
  if (String(raw.status || '').toLowerCase().includes('final')) {
    if (away.score !== null && home.score !== null) {
      if (away.score > home.score)      away.is_winner = true;
      else if (home.score > away.score) home.is_winner = true;
    }
  }

  const { status, detail } = normalizeStatus(raw.status, raw.state);
  // Prefer game_id (upstream identity) over id (DB auto-increment row id)
  const id = raw.game_id || raw.id || `${raw.sport}:${raw.game_date}:${away.seo || 'a'}-${home.seo || 'h'}`;
  const start_time = buildStartTime(raw);

  return {
    id: String(id),
    sport: raw.sport,
    status,
    status_detail: detail,
    start_time,
    conference: raw.conference || null,
    is_conference_game: Boolean(raw.is_conference_game),
    is_tournament_game: Boolean(raw.is_tournament_game),
    away,
    home,
    venue: raw.venue || null,
    has_recap: Boolean(raw.has_recap),
    recap_url: raw.has_recap ? `/api/recap/${encodeURIComponent(String(id))}` : null,
  };
}
