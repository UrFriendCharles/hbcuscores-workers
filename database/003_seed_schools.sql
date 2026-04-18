-- Seed HBCU schools (NCAA) + minimal non-HBCU context
-- Idempotent: uses INSERT OR IGNORE and looks up ids dynamically for aliases

-- ---------- helper: insert schools ----------
-- NOTE: slugs should be stable and used across the app.

INSERT OR IGNORE INTO schools
  (slug, display_name, short_name, full_name, association, division, conference_name, in_covered_conference, is_hbcu, is_supported, launch_status)
VALUES
  -- MEAC (8)
  ('howard', 'Howard', 'Howard', 'Howard University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('norfolk-state', 'Norfolk State', 'Norfolk St.', 'Norfolk State University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('morgan-state', 'Morgan State', 'Morgan St.', 'Morgan State University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('delaware-state', 'Delaware State', 'Delaware St.', 'Delaware State University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('north-carolina-central', 'North Carolina Central', 'NC Central', 'North Carolina Central University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('south-carolina-state', 'South Carolina State', 'SC State', 'South Carolina State University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('coppin-state', 'Coppin State', 'Coppin St.', 'Coppin State University', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),
  ('maryland-eastern-shore', 'Maryland Eastern Shore', 'UMES', 'University of Maryland Eastern Shore', 'NCAA', 'D1', 'MEAC', 1, 1, 1, 'live'),

  -- SWAC (12)
  ('florida-am', 'Florida A&M', 'FAMU', 'Florida Agricultural and Mechanical University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('grambling', 'Grambling State', 'Grambling', 'Grambling State University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('jackson-state', 'Jackson State', 'Jackson St.', 'Jackson State University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('prairie-view', 'Prairie View A&M', 'Prairie View', 'Prairie View A&M University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('southern', 'Southern', 'Southern U.', 'Southern University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('bethune-cookman', 'Bethune-Cookman', 'Bethune-Cookman', 'Bethune-Cookman University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('alcorn', 'Alcorn State', 'Alcorn', 'Alcorn State University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('alabama-am', 'Alabama A&M', 'Alabama A&M', 'Alabama A&M University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('alabama-state', 'Alabama State', 'Alabama St.', 'Alabama State University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('texas-southern', 'Texas Southern', 'Texas Southern', 'Texas Southern University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('arkansas-pine-bluff', 'Arkansas-Pine Bluff', 'UAPB', 'University of Arkansas at Pine Bluff', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),
  ('mississippi-valley', 'Mississippi Valley State', 'MVSU', 'Mississippi Valley State University', 'NCAA', 'D1', 'SWAC', 1, 1, 1, 'live'),

  -- CIAA (12)
  ('fayetteville-state', 'Fayetteville State', 'Fayetteville St.', 'Fayetteville State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('virginia-state', 'Virginia State', 'Virginia St.', 'Virginia State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('bowie-state', 'Bowie State', 'Bowie St.', 'Bowie State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('winston-salem-state', 'Winston-Salem State', 'Winston-Salem', 'Winston-Salem State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('virginia-union', 'Virginia Union', 'Virginia Union', 'Virginia Union University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('johnson-c-smith', 'Johnson C. Smith', 'JCSU', 'Johnson C. Smith University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('bluefield-state', 'Bluefield State', 'Bluefield St.', 'Bluefield State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('livingstone', 'Livingstone', 'Livingstone', 'Livingstone College', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('claflin', 'Claflin', 'Claflin', 'Claflin University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('lincoln-pa', 'Lincoln (PA)', 'Lincoln (PA)', 'Lincoln University (PA)', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('shaw', 'Shaw', 'Shaw', 'Shaw University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),
  ('elizabeth-city-state', 'Elizabeth City State', 'ECSU', 'Elizabeth City State University', 'NCAA', 'D2', 'CIAA', 1, 1, 1, 'live'),

  -- SIAC (15)
  ('morehouse', 'Morehouse', 'Morehouse', 'Morehouse College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('tuskegee', 'Tuskegee', 'Tuskegee', 'Tuskegee University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('miles', 'Miles', 'Miles', 'Miles College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('clark-atlanta', 'Clark Atlanta', 'Clark Atlanta', 'Clark Atlanta University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('savannah-state', 'Savannah State', 'Savannah St.', 'Savannah State University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('fort-valley', 'Fort Valley State', 'Fort Valley', 'Fort Valley State University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('albany-state', 'Albany State', 'Albany St.', 'Albany State University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('kentucky-state', 'Kentucky State', 'Kentucky St.', 'Kentucky State University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('central-state', 'Central State', 'Central St.', 'Central State University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('edward-waters', 'Edward Waters', 'Edward Waters', 'Edward Waters University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('allen', 'Allen', 'Allen', 'Allen University', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('benedict', 'Benedict', 'Benedict', 'Benedict College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('lane', 'Lane', 'Lane', 'Lane College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('le-moyne-owen', 'LeMoyne-Owen', 'LeMoyne-Owen', 'LeMoyne-Owen College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live'),
  ('spring-hill', 'Spring Hill', 'Spring Hill', 'Spring Hill College', 'NCAA', 'D2', 'SIAC', 1, 1, 1, 'live');

-- ---------- alias helpers ----------
-- Normalize in SQL to match JS normalizeName(): lower, strip punctuation, collapse spaces

-- Helper CTE to normalize strings similarly (approximate):
WITH RECURSIVE
norm(s) AS (SELECT 1)
SELECT 1;

-- Because SQLite lacks a custom function here, we insert common aliases explicitly.

-- Example alias inserts (extend as needed)
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'NC Central', 'nc central' FROM schools WHERE slug = 'north-carolina-central';
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'N.C. Central', 'nc central' FROM schools WHERE slug = 'north-carolina-central';
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'UMES', 'umes' FROM schools WHERE slug = 'maryland-eastern-shore';
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'FAMU', 'famu' FROM schools WHERE slug = 'florida-am';
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'UAPB', 'uapb' FROM schools WHERE slug = 'arkansas-pine-bluff';
INSERT OR IGNORE INTO school_aliases (school_id, alias, alias_normalized)
SELECT id, 'MVSU', 'mvsu' FROM schools WHERE slug = 'mississippi-valley';

-- Add more aliases over time rather than relying on fragments in code.
