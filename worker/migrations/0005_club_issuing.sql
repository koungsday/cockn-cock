-- PLATFORM.md 모임 발급: a club and its organisers live in D1, so the 총괄 console opens a new club without a deploy.
-- Only columns and tables are added; no existing row changes except 썬콕19's display data, which moves out of
-- platform/clubs.mjs (that file keeps only the secret names older clubs still depend on).

ALTER TABLE clubs ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN schedule TEXT NOT NULL DEFAULT '';
ALTER TABLE clubs ADD COLUMN default_place TEXT NOT NULL DEFAULT '';
-- 'active' or 'suspended'. A suspended club's pages and API answer that the club is paused; nothing is deleted.
ALTER TABLE clubs ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE clubs ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE clubs SET name = '썬콕19', subtitle = '일요 배드민턴 모임', schedule = '일요일', default_place = '당고개 배드민턴체육관'
  WHERE id = 'suncok19';

-- One row per organiser: name + six-digit PIN hashed like member PINs. must_change = 1 for a temporary PIN the
-- console issued; the organiser sets their own before anything else opens.
CREATE TABLE organizers (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  credential_salt TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1 CHECK (must_change IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX organizers_active_name ON organizers(club_id, name) WHERE active = 1;

-- An organiser session names its organiser. Older admin sessions have none and sign in again once.
ALTER TABLE sessions ADD COLUMN organizer_id TEXT REFERENCES organizers(id) ON DELETE CASCADE;
CREATE INDEX sessions_organizer ON sessions(organizer_id);
