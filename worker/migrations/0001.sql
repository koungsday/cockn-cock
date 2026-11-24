CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  code_hash TEXT NOT NULL UNIQUE,
  credential_salt TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1 CHECK (must_change IN (0, 1))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK ((role = 'admin' AND member_id IS NULL) OR (role = 'member' AND member_id IS NOT NULL))
);
CREATE INDEX sessions_member ON sessions(member_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX attempts_expiry ON attempts(expires_at);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
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
CREATE INDEX events_date ON events(date, time);

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
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  date TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE INDEX notices_date ON notices(date);

CREATE TABLE rewards (
  year INTEGER NOT NULL,
  half INTEGER NOT NULL CHECK (half IN (1, 2)),
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (year, half, member_id)
);
