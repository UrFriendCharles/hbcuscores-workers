-- Phase 2: schools registry + linkage columns
-- Adds school metadata tables and links game rows to schools.
-- Safe notes:
--   * CREATE TABLE IF NOT EXISTS is idempotent
--   * CREATE INDEX IF NOT EXISTS is idempotent
--   * ALTER TABLE ADD COLUMN is NOT idempotent in SQLite/D1
--     (do not rerun those lines if they already succeeded)

-- ---------- schools registry ----------
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  short_name TEXT,
  full_name TEXT,
  association TEXT NOT NULL DEFAULT 'NCAA',      -- NCAA | NAIA
  division TEXT,                                 -- D1 | D2 | D3 | NULL
  conference_name TEXT,
  in_covered_conference INTEGER NOT NULL DEFAULT 0,
  athletics_url TEXT,
  logo_url TEXT,
  source TEXT NOT NULL DEFAULT 'ncaa',           -- ncaa | naia | manual
  source_school_id TEXT,
  is_hbcu INTEGER NOT NULL DEFAULT 0,
  is_supported INTEGER NOT NULL DEFAULT 1,
  launch_status TEXT NOT NULL DEFAULT 'live',    -- live | coming_soon | hidden
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schools_slug         ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_assoc_div    ON schools(association, division);
CREATE INDEX IF NOT EXISTS idx_schools_conf         ON schools(conference_name);
CREATE INDEX IF NOT EXISTS idx_schools_hbcu         ON schools(is_hbcu);
CREATE INDEX IF NOT EXISTS idx_schools_supported    ON schools(is_supported, launch_status);

-- ---------- alias table ----------
CREATE TABLE IF NOT EXISTS school_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE (school_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_school_aliases_norm  ON school_aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_school_aliases_sid   ON school_aliases(school_id);

-- ---------- additive columns on existing games table ----------
ALTER TABLE games ADD COLUMN away_school_slug TEXT;
ALTER TABLE games ADD COLUMN home_school_slug TEXT;
ALTER TABLE games ADD COLUMN away_team_full   TEXT;
ALTER TABLE games ADD COLUMN home_team_full   TEXT;
ALTER TABLE games ADD COLUMN away_team_seo    TEXT;
ALTER TABLE games ADD COLUMN home_team_seo    TEXT;
ALTER TABLE games ADD COLUMN away_record      TEXT;
ALTER TABLE games ADD COLUMN home_record      TEXT;
ALTER TABLE games ADD COLUMN is_conference_game INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN is_tournament_game INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_games_away_school_slug ON games(away_school_slug);
CREATE INDEX IF NOT EXISTS idx_games_home_school_slug ON games(home_school_slug);

-- ---------- recap table shape alignment ----------
-- Existing table may use cache_key/recap; phase 2 code expects text/model keyed by game_id.
-- Additive only. If these columns already exist, skip them manually.
ALTER TABLE recaps ADD COLUMN text TEXT;
ALTER TABLE recaps ADD COLUMN model TEXT;

CREATE INDEX IF NOT EXISTS idx_recaps_game_id ON recaps(game_id);
