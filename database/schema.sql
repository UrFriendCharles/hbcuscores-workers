-- HBCUscores D1 Database — Full Reference Schema
-- Database name: hbcuscores
-- Bind as: DB in Cloudflare Worker settings
--
-- Run this file to initialize a brand-new database.
-- For existing databases, run only the numbered migration files instead:
--   002_schools_and_linkage.sql
--   003_seed_schools.sql
--   004_standings_and_box_scores.sql
--
-- This file is the source of truth; it reflects all applied migrations.

-- ─── GAMES ───────────────────────────────────────────────────────────────────
-- Primary cache of all HBCU game data pulled from the NCAA API.
-- game_id is the upstream NCAA game identifier (TEXT UNIQUE).
-- id is the internal auto-increment row id — never used as a game identifier.
CREATE TABLE IF NOT EXISTS games (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id            TEXT UNIQUE,
  sport              TEXT NOT NULL,             -- fb | mbb | wbb
  division           TEXT NOT NULL,             -- D1 | D2
  conference         TEXT,
  season             TEXT NOT NULL,
  round              TEXT,
  -- team identity
  away_team          TEXT,
  home_team          TEXT,
  away_team_full     TEXT,
  home_team_full     TEXT,
  away_team_seo      TEXT,
  home_team_seo      TEXT,
  -- scores
  away_score         INTEGER,
  home_score         INTEGER,
  -- legacy winner flags (kept for compatibility)
  away_winner        INTEGER DEFAULT 0,
  home_winner        INTEGER DEFAULT 0,
  -- bracket seeding (kept for compatibility)
  away_seed          TEXT,
  home_seed          TEXT,
  away_rank          TEXT,
  home_rank          TEXT,
  -- records
  away_record        TEXT,
  home_record        TEXT,
  -- school registry linkage (added in Phase 2)
  away_school_slug   TEXT,
  home_school_slug   TEXT,
  -- game metadata
  status             TEXT,
  game_date          TEXT,
  game_time          TEXT,
  venue              TEXT,
  network            TEXT,
  url                TEXT,
  -- game flags (added in Phase 2)
  is_conference_game INTEGER DEFAULT 0,
  is_tournament_game INTEGER DEFAULT 0,
  updated_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_sport         ON games(sport, division, season);
CREATE INDEX IF NOT EXISTS idx_games_conf          ON games(conference, season);
CREATE INDEX IF NOT EXISTS idx_games_date          ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_status        ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_away_school   ON games(away_school_slug);
CREATE INDEX IF NOT EXISTS idx_games_home_school   ON games(home_school_slug);

-- ─── RECAPS ──────────────────────────────────────────────────────────────────
-- AI-generated game recaps cached to avoid redundant Claude API calls.
-- cache_key is set to game_id for all new writes.
-- Legacy `recap` column kept (NOT NULL) for backward compatibility.
-- New code reads `text` first, falls back to `recap`.
CREATE TABLE IF NOT EXISTS recaps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key  TEXT UNIQUE NOT NULL,   -- set to game_id for all new recaps
  game_id    TEXT,
  recap      TEXT NOT NULL,          -- legacy column; new writes mirror `text` here
  text       TEXT,                   -- current column for recap content
  model      TEXT,                   -- claude model that generated this recap
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recaps_key     ON recaps(cache_key);
CREATE INDEX IF NOT EXISTS idx_recaps_game_id ON recaps(game_id);

-- ─── SCHOOLS ─────────────────────────────────────────────────────────────────
-- Registry of NCAA/NAIA schools. HBCU institutions are flagged is_hbcu=1.
-- Used to resolve team names to canonical slugs and metadata.
CREATE TABLE IF NOT EXISTS schools (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                 TEXT NOT NULL UNIQUE,
  display_name         TEXT NOT NULL,
  short_name           TEXT,
  full_name            TEXT,
  association          TEXT NOT NULL DEFAULT 'NCAA',   -- NCAA | NAIA
  division             TEXT,                           -- D1 | D2 | D3
  conference_name      TEXT,
  in_covered_conference INTEGER NOT NULL DEFAULT 0,    -- 1 if MEAC/SWAC/CIAA/SIAC
  athletics_url        TEXT,
  logo_url             TEXT,
  source               TEXT NOT NULL DEFAULT 'ncaa',   -- ncaa | naia | manual
  source_school_id     TEXT,
  is_hbcu              INTEGER NOT NULL DEFAULT 0,
  is_supported         INTEGER NOT NULL DEFAULT 1,
  launch_status        TEXT NOT NULL DEFAULT 'live',   -- live | coming_soon | hidden
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schools_slug      ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_assoc_div ON schools(association, division);
CREATE INDEX IF NOT EXISTS idx_schools_conf      ON schools(conference_name);
CREATE INDEX IF NOT EXISTS idx_schools_hbcu      ON schools(is_hbcu);
CREATE INDEX IF NOT EXISTS idx_schools_supported ON schools(is_supported, launch_status);

-- ─── SCHOOL ALIASES ──────────────────────────────────────────────────────────
-- Alternate name mappings (e.g. "FAMU" → "florida-am") for team name resolution.
CREATE TABLE IF NOT EXISTS school_aliases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id        INTEGER NOT NULL,
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,           -- lowercased, stripped for lookup
  source           TEXT DEFAULT 'manual',
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE (school_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_school_aliases_norm ON school_aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_school_aliases_sid  ON school_aliases(school_id);

-- ─── BRACKETS ────────────────────────────────────────────────────────────────
-- Conference tournament bracket data. One row per game per round.
CREATE TABLE IF NOT EXISTS brackets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  conference   TEXT NOT NULL,
  sport        TEXT NOT NULL,
  gender       TEXT NOT NULL,
  season       TEXT NOT NULL,
  round_name   TEXT NOT NULL,
  game_id      TEXT,
  away_team    TEXT,
  away_seed    INTEGER,
  away_score   INTEGER,
  home_team    TEXT,
  home_seed    INTEGER,
  home_score   INTEGER,
  winner       TEXT,
  status       TEXT,
  game_date    TEXT,
  game_time    TEXT,
  venue        TEXT,
  next_game_id TEXT,
  updated_at   TEXT,
  UNIQUE(conference, sport, gender, season, round_name, game_id)
);

CREATE INDEX IF NOT EXISTS idx_brackets_conf ON brackets(conference, sport, gender, season);

-- ─── CHAMPIONS ───────────────────────────────────────────────────────────────
-- Conference tournament champions by year.
CREATE TABLE IF NOT EXISTS champions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  conference TEXT NOT NULL,
  sport      TEXT NOT NULL,
  gender     TEXT NOT NULL,
  season     TEXT NOT NULL,
  champion   TEXT,
  seed       INTEGER,
  updated_at TEXT,
  UNIQUE(conference, sport, gender, season)
);

-- ─── STANDINGS ───────────────────────────────────────────────────────────────
-- Per-school conference standings, updated from ingested game results.
CREATE TABLE IF NOT EXISTS standings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sport      TEXT NOT NULL,        -- fb | mbb | wbb
  conference TEXT,
  season     TEXT NOT NULL,
  school_slug TEXT NOT NULL,
  conf_w     INTEGER DEFAULT 0,
  conf_l     INTEGER DEFAULT 0,
  overall_w  INTEGER DEFAULT 0,
  overall_l  INTEGER DEFAULT 0,
  updated_at TEXT,
  UNIQUE(sport, conference, season, school_slug)
);

CREATE INDEX IF NOT EXISTS idx_standings_sport_conf ON standings(sport, conference, season);
CREATE INDEX IF NOT EXISTS idx_standings_school     ON standings(school_slug);

-- ─── BOX SCORES ──────────────────────────────────────────────────────────────
-- Per-game box score data stored as JSON. Used to enrich AI recaps.
CREATE TABLE IF NOT EXISTS box_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    TEXT NOT NULL UNIQUE,
  data       TEXT NOT NULL,        -- JSON blob
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_box_scores_game_id ON box_scores(game_id);

-- ─── GAMES CACHE ─────────────────────────────────────────────────────────────
-- General-purpose key/value response cache for miscellaneous lookups.
CREATE TABLE IF NOT EXISTS games_cache (
  key        TEXT PRIMARY KEY,
  data       TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
