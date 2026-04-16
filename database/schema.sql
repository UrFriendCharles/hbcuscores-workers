-- HBCUscores D1 Database Schema
-- Database name: hbcuscores
-- Bind as: DB in Cloudflare Worker settings

-- ─── GAMES ───────────────────────────────────────────────────────────────────
-- Primary cache of all HBCU game data pulled from the NCAA API
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT UNIQUE,
  sport       TEXT NOT NULL,
  division    TEXT NOT NULL,
  conference  TEXT,
  season      TEXT NOT NULL,
  round       TEXT,
  away_team   TEXT,
  away_score  INTEGER,
  away_winner INTEGER DEFAULT 0,
  away_seed   TEXT,
  away_rank   TEXT,
  home_team   TEXT,
  home_score  INTEGER,
  home_winner INTEGER DEFAULT 0,
  home_seed   TEXT,
  home_rank   TEXT,
  status      TEXT,
  game_date   TEXT,
  game_time   TEXT,
  venue       TEXT,
  network     TEXT,
  url         TEXT,
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_sport   ON games(sport, division, season);
CREATE INDEX IF NOT EXISTS idx_games_conf    ON games(conference, season);
CREATE INDEX IF NOT EXISTS idx_games_date    ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_status  ON games(status);

-- ─── RECAPS ──────────────────────────────────────────────────────────────────
-- AI-generated game recaps cached to avoid redundant Gemini API calls
CREATE TABLE IF NOT EXISTS recaps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key   TEXT UNIQUE NOT NULL,
  game_id     TEXT,
  recap       TEXT NOT NULL,
  created_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_recaps_key ON recaps(cache_key);

-- ─── BRACKETS ────────────────────────────────────────────────────────────────
-- Conference tournament bracket data
CREATE TABLE IF NOT EXISTS brackets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  conference    TEXT NOT NULL,
  sport         TEXT NOT NULL,
  gender        TEXT NOT NULL,
  season        TEXT NOT NULL,
  round_name    TEXT NOT NULL,
  game_id       TEXT,
  away_team     TEXT,
  away_seed     INTEGER,
  away_score    INTEGER,
  home_team     TEXT,
  home_seed     INTEGER,
  home_score    INTEGER,
  winner        TEXT,
  status        TEXT,
  game_date     TEXT,
  game_time     TEXT,
  venue         TEXT,
  next_game_id  TEXT,
  updated_at    TEXT,
  UNIQUE(conference, sport, gender, season, round_name, game_id)
);

CREATE INDEX IF NOT EXISTS idx_brackets_conf ON brackets(conference, sport, gender, season);

-- ─── CHAMPIONS ───────────────────────────────────────────────────────────────
-- Conference tournament champions by year
CREATE TABLE IF NOT EXISTS champions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  conference  TEXT NOT NULL,
  sport       TEXT NOT NULL,
  gender      TEXT NOT NULL,
  season      TEXT NOT NULL,
  champion    TEXT,
  seed        INTEGER,
  updated_at  TEXT,
  UNIQUE(conference, sport, gender, season)
);

-- ─── GAMES CACHE ─────────────────────────────────────────────────────────────
-- General-purpose key/value response cache
CREATE TABLE IF NOT EXISTS games_cache (
  key        TEXT PRIMARY KEY,
  data       TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
