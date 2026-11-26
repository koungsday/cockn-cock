-- PLATFORM.md 변경 기록: who changed what in which club, newest last (id). Organisers' and the 총괄's changes only.
-- summary is a short line for people (names, dates, states); birthdays, PINs and contacts are never written here.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  at INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('console', 'organizer')),
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 200)
);
CREATE INDEX audit_log_club ON audit_log(club_id, id);
