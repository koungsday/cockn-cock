-- PLATFORM.md 2단계: every club shares this one D1. The root tables (members, sessions, events, notices) carry club_id;
-- roster, votes, attendance, guests, settlements and rewards are reached only through a root id.
-- A club's id is its slug: cookie names, share links and the organiser app's start address already use it.
-- Every row that exists before this migration belongs to 썬콕19 (suncok19).
--
-- The order matters. D1 always enforces foreign keys, and dropping a parent table runs ON DELETE CASCADE on its
-- children (PRAGMA defer_foreign_keys does not stop that). So:
--   1. copy every row, with its rowid, into a plain copy table before anything is dropped;
--   2. drop the old tables, children first (roster and rewards reference members without a cascade);
--   3. create the new tables and refill them, parents first.
-- worker/migrations.test.mjs fails if a row of any table is lost on the way.
-- rowids are kept because the notice and guest lists are ordered by rowid.
-- members.code_hash is dropped: nothing reads it, it only held a random placeholder.

CREATE TABLE clubs (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-z0-9-]*')
);
INSERT INTO clubs (id) VALUES ('suncok19');

CREATE TABLE copy_members AS SELECT rowid AS copy_rowid, * FROM members;
CREATE TABLE copy_sessions AS SELECT rowid AS copy_rowid, * FROM sessions;
CREATE TABLE copy_events AS SELECT rowid AS copy_rowid, * FROM events;
CREATE TABLE copy_roster AS SELECT rowid AS copy_rowid, * FROM roster;
CREATE TABLE copy_votes AS SELECT rowid AS copy_rowid, * FROM votes;
CREATE TABLE copy_attendance AS SELECT rowid AS copy_rowid, * FROM attendance;
CREATE TABLE copy_guests AS SELECT rowid AS copy_rowid, * FROM guests;
CREATE TABLE copy_settlements AS SELECT rowid AS copy_rowid, * FROM settlements;
CREATE TABLE copy_notices AS SELECT rowid AS copy_rowid, * FROM notices;
CREATE TABLE copy_rewards AS SELECT rowid AS copy_rowid, * FROM rewards;

DROP TABLE votes;
DROP TABLE attendance;
DROP TABLE guests;
DROP TABLE settlements;
DROP TABLE roster;
DROP TABLE rewards;
DROP TABLE sessions;
DROP TABLE events;
DROP TABLE members;
DROP TABLE notices;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  credential_salt TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1 CHECK (must_change IN (0, 1))
);
CREATE INDEX members_name ON members(club_id, name);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK ((role = 'admin' AND member_id IS NULL) OR (role = 'member' AND member_id IS NOT NULL))
);
CREATE INDEX sessions_member ON sessions(member_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  end_time TEXT NOT NULL CHECK (end_time > time),
  place TEXT NOT NULL CHECK (length(place) BETWEEN 1 AND 120),
  deadline TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  early_time TEXT NOT NULL,
  late_time TEXT NOT NULL CHECK (late_time > early_time),
  notes TEXT NOT NULL DEFAULT '',
  open INTEGER NOT NULL DEFAULT 0 CHECK (open IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE INDEX events_date ON events(club_id, date, time);

CREATE TABLE roster (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (event_id, member_id)
);
CREATE INDEX roster_member ON roster(member_id, event_id);

CREATE TABLE votes (
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('early', 'late', 'no')),
  lunch INTEGER NOT NULL CHECK (lunch IN (0, 1)),
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id, member_id) REFERENCES roster(event_id, member_id) ON DELETE CASCADE
);

CREATE TABLE attendance (
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  present INTEGER CHECK (present IN (0, 1)),
  recognition TEXT CHECK (recognition IN ('direct', 'substitute', 'approved')),
  CHECK (recognition IS NULL OR recognition = 'approved' OR (present IS NOT NULL AND present = 1)),
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id, member_id) REFERENCES roster(event_id, member_id) ON DELETE CASCADE
);

CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  level TEXT NOT NULL DEFAULT '',
  invited_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'arrived', 'cancelled')),
  paid INTEGER NOT NULL CHECK (paid IN (0, 1))
);
CREATE INDEX guests_event ON guests(event_id, status);

CREATE TABLE settlements (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  prior_singles INTEGER NOT NULL CHECK (prior_singles >= 0),
  prior_tubes INTEGER NOT NULL CHECK (prior_tubes >= 0),
  remaining_singles INTEGER NOT NULL CHECK (remaining_singles >= 0),
  court_donation INTEGER NOT NULL CHECK (court_donation >= 0),
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1))
);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  date TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE INDEX notices_date ON notices(club_id, date);

CREATE TABLE rewards (
  year INTEGER NOT NULL,
  half INTEGER NOT NULL CHECK (half IN (1, 2)),
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (year, half, member_id)
);

INSERT INTO members (rowid, id, club_id, name, active, credential_salt, credential_hash, credential_version, must_change)
  SELECT copy_rowid, id, 'suncok19', name, active, credential_salt, credential_hash, credential_version, must_change FROM copy_members;
INSERT INTO events (rowid, id, club_id, title, date, time, end_time, place, deadline, deadline_at, early_time, late_time, notes, open, published)
  SELECT copy_rowid, id, 'suncok19', title, date, time, end_time, place, deadline, deadline_at, early_time, late_time, notes, open, published FROM copy_events;
INSERT INTO notices (rowid, id, club_id, title, body, date, published)
  SELECT copy_rowid, id, 'suncok19', title, body, date, published FROM copy_notices;
INSERT INTO sessions (rowid, token_hash, club_id, role, member_id, credential_version, expires_at)
  SELECT copy_rowid, token_hash, 'suncok19', role, member_id, credential_version, expires_at FROM copy_sessions;
INSERT INTO roster (rowid, event_id, member_id) SELECT copy_rowid, event_id, member_id FROM copy_roster;
INSERT INTO votes (rowid, event_id, member_id, slot, lunch) SELECT copy_rowid, event_id, member_id, slot, lunch FROM copy_votes;
INSERT INTO attendance (rowid, event_id, member_id, present, recognition)
  SELECT copy_rowid, event_id, member_id, present, recognition FROM copy_attendance;
INSERT INTO guests (rowid, id, event_id, name, level, invited_by, status, paid)
  SELECT copy_rowid, id, event_id, name, level, invited_by, status, paid FROM copy_guests;
INSERT INTO settlements (rowid, event_id, prior_singles, prior_tubes, remaining_singles, court_donation, confirmed)
  SELECT copy_rowid, event_id, prior_singles, prior_tubes, remaining_singles, court_donation, confirmed FROM copy_settlements;
INSERT INTO rewards (rowid, year, half, member_id) SELECT copy_rowid, year, half, member_id FROM copy_rewards;

DROP TABLE copy_members;
DROP TABLE copy_sessions;
DROP TABLE copy_events;
DROP TABLE copy_roster;
DROP TABLE copy_votes;
DROP TABLE copy_attendance;
DROP TABLE copy_guests;
DROP TABLE copy_settlements;
DROP TABLE copy_notices;
DROP TABLE copy_rewards;
