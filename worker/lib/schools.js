/**
 * schools.js
 * Registry-backed school resolution and HBCU filtering.
 *
 * Exports:
 *   normalizeName(raw)        -> normalized string for alias lookup
 *   resolveSchool(db, name)   -> { slug, display_name, logo_url, ... } | null
 *   isHBCUGame(db, game)      -> boolean  (at least one side is HBCU OR
 *                                           is in a covered conference)
 *   schoolsInScope(db, opts)  -> list of schools for filter UIs
 *
 * Philosophy:
 *   - Prefer the registry. If both sides resolve to schools, decisions
 *     are deterministic.
 *   - If a side does not resolve (e.g. a non-HBCU out-of-conference
 *     opponent), we fall back to the legacy fragment list + conference
 *     match so we don't silently drop real games. This keeps current
 *     behavior working while we grow the registry.
 */

// Legacy HBCU fragment list — kept only as a safety net for rows that
// haven't been back-filled yet. New code should prefer resolveSchool().
// Keep this list short and add aliases to school_aliases instead.
const LEGACY_HBCU_FRAGMENTS = [
  'howard','hampton','a&t','a and t','ncat','morgan','norfolk','delaware st',
  'coppin','maryland eastern','umes','nccu','n.c. central','nc central',
  's.c. state','sc state','florida a&m','famu','alabama a&m','aamu',
  'alabama state','alcorn','arkansas pine','uapb','bethune','grambling',
  'jackson state','mississippi valley','mvsu','prairie view','southern u',
  'texas southern','tennessee st','bowie','bluefield','claflin',
  'elizabeth city','fayetteville','johnson c. smith','jcsu','lincoln (pa)',
  'livingstone','shaw','virginia state','virginia union','winston-salem',
  'albany state','allen','benedict','central state','clark atlanta',
  'edward waters','fort valley','kentucky state','lane','lemoyne',
  'miles','morehouse','savannah state','tuskegee'
];

const COVERED_CONFERENCES = new Set(['MEAC','SWAC','CIAA','SIAC']);

/**
 * Normalize an incoming team name to the form we store in
 * school_aliases.alias_normalized.
 *   - lowercase
 *   - strip "&" and "."
 *   - strip punctuation except "-" and internal apostrophes
 *   - collapse whitespace
 */
export function normalizeName(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/\./g, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a team name to a school row. Tries:
 *   1) exact alias match on normalized name
 *   2) slug direct match (when the feed happens to pass our slug)
 * Returns null if no match.
 */
export async function resolveSchool(db, name) {
  const norm = normalizeName(name);
  if (!norm) return null;

  // Try alias index.
  const aliasHit = await db
    .prepare(`
      SELECT s.*
      FROM school_aliases a
      JOIN schools s ON s.id = a.school_id
      WHERE a.alias_normalized = ?
      LIMIT 1
    `)
    .bind(norm)
    .first();
  if (aliasHit) return aliasHit;

  // Try slug form (spaces -> hyphens).
  const slugGuess = norm.replace(/\s+/g, '-');
  const slugHit = await db
    .prepare(`SELECT * FROM schools WHERE slug = ? LIMIT 1`)
    .bind(slugGuess)
    .first();
  return slugHit || null;
}

/**
 * Decide if a normalized game is in scope for HBCUscores coverage.
 *
 * In scope if ANY of:
 *   - either team resolves to a school that is is_hbcu=1 OR
 *     in_covered_conference=1
 *   - fallback: game.conference is one of the covered conferences
 *   - fallback: either team name contains a known HBCU fragment
 *
 * The fallbacks keep coverage working for games where one side is a
 * non-HBCU opponent (e.g. Howard vs. Yale) that we haven't registered.
 */
export async function isHBCUGame(db, game) {
  // Registry check (best path)
  const [away, home] = await Promise.all([
    resolveSchool(db, game.away_team_name || game.away_team_full || game.away_team_seo),
    resolveSchool(db, game.home_team_name || game.home_team_full || game.home_team_seo),
  ]);
  const schoolHit = (s) => s && (s.is_hbcu === 1 || s.in_covered_conference === 1);
  if (schoolHit(away) || schoolHit(home)) return true;

  // Conference fallback.
  if (game.conference && COVERED_CONFERENCES.has(String(game.conference).toUpperCase())) {
    return true;
  }

  // Fragment fallback (legacy).
  const haystack = [
    game.away_team_name, game.home_team_name,
    game.away_team_full, game.home_team_full,
    game.away_team_seo,  game.home_team_seo,
  ].filter(Boolean).join(' ').toLowerCase();
  for (const frag of LEGACY_HBCU_FRAGMENTS) {
    if (haystack.includes(frag)) return true;
  }
  return false;
}

/**
 * Pull schools for filter UIs.
 * opts:
 *   hbcu_only: boolean  (only is_hbcu=1)
 *   conference: string  ('MEAC' etc. or 'OTHER' for HBCUs outside covered)
 *   association: 'NCAA'|'NAIA'
 *   division: 'D1'|'D2'|'D3'
 */
export async function schoolsInScope(db, opts = {}) {
  const where = [];
  const binds = [];

  if (opts.hbcu_only) where.push('is_hbcu = 1');

  if (opts.conference === 'OTHER') {
    where.push('is_hbcu = 1 AND in_covered_conference = 0');
  } else if (opts.conference) {
    where.push('conference_name = ?');
    binds.push(opts.conference);
  }

  if (opts.association) {
    where.push('association = ?');
    binds.push(opts.association);
  }
  if (opts.division) {
    where.push('division = ?');
    binds.push(opts.division);
  }

  const sql = `
    SELECT slug, display_name, short_name, association, division,
           conference_name, logo_url, is_hbcu, in_covered_conference
    FROM schools
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY display_name
  `;
  const res = await db.prepare(sql).bind(...binds).all();
  return res.results || [];
}
