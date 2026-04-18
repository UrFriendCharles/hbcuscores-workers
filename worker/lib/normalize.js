/**
 * normalize.js
 * Transforms raw ncaa-api scoreboard entries into our canonical
 * game shape for D1 storage and API responses.
 *
 * The API response shape we produce:
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
 * The frontend will render a text-badge fallback if null.
 */
export function deriveLogoUrl({ schoolRow, team_seo, slug }) {
  if (schoolRow && schoolRow.logo_url) return schoolRow.logo_url;
  if (team_seo) return `${NCAA_LOGO_BASE}/${team_seo}.svg`;
  if (slug)     return `${NCAA_LOGO_BASE}/${slug}.svg`;
  return null;
}

/**
 * Map ncaa-api scoreboard game status strings into our 3-state model.
 * Accepts a wide range of upstream values.
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
 */
async function buildSide(db, raw, sideKey) {
  const name   = raw[`${sideKey}_team_name`] || raw[`${sideKey}_team_full`] || raw[`${sideKey}_team_seo`];
  const seo    = raw[`${sideKey}_team_seo`]  || null;
  const full   = raw[`${sideKey}_team_full`] || null;
  const score  = raw[`${sideKey}_score`];
  const record = raw[`${sideKey}_record`]    || null;

  const schoolRow = await resolveSchool(db, name);
  const slug = schoolRow?.slug || null;
  const logo_url = deriveLogoUrl({ schoolRow, team_seo: seo, slug });

  return {
    school_slug: slug,
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
 * Main entry: turn a raw D1-row-ish or ncaa-api-ish game object into
 * the response shape.
 *
 * Accepts both shapes by reading a union of fields — the worker's
 * fetch + cache paths both pass through this one function.
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
  const id = raw.id || raw.game_id || `${raw.sport}:${raw.start_time}:${away.seo || 'a'}-${home.seo || 'h'}`;

  return {
    id: String(id),
    sport: raw.sport,                               // 'fb' | 'mbb' | 'wbb'
    status,
    status_detail: detail,
    start_time: raw.start_time || raw.startTime || null,
    conference: raw.conference || null,
    is_conference_game: Boolean(raw.is_conference_game),
    is_tournament_game: Boolean(raw.is_tournament_game),
    away,
    home,
    venue: raw.venue || null,
    has_recap: Boolean(raw.has_recap),
    recap_url: raw.has_recap ? `/api/recap/${encodeURIComponent(id)}` : null,
  };
}
