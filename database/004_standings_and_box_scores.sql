-- Migration 004: standings and box_scores tables
-- For existing databases that already ran schema.sql + 002 + 003.
-- Safe to run: CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS are idempotent.

-- ─── STANDINGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS standings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sport       TEXT NOT NULL,        -- fb | mbb | wbb
  conference  TEXT,
  season      TEXT NOT NULL,
  school_slug TEXT NOT NULL,
  conf_w      INTEGER DEFAULT 0,
  conf_l      INTEGER DEFAULT 0,
  overall_w   INTEGER DEFAULT 0,
  overall_l   INTEGER DEFAULT 0,
  updated_at  TEXT,
  UNIQUE(sport, conference, season, school_slug)
);

CREATE INDEX IF NOT EXISTS idx_standings_sport_conf ON standings(sport, conference, season);
CREATE INDEX IF NOT EXISTS idx_standings_school     ON standings(school_slug);

-- ─── BOX SCORES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS box_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    TEXT NOT NULL UNIQUE,
  data       TEXT NOT NULL,         -- JSON blob
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_box_scores_game_id ON box_scores(game_id);
