ALTER TABLE events ADD COLUMN capacity INTEGER CHECK (capacity BETWEEN 1 AND 10000);
ALTER TABLE votes ADD COLUMN signup_order INTEGER;

-- Older votes retain their insertion order; changing between attendance slots retains a place.
CREATE TRIGGER vote_signup_insert AFTER INSERT ON votes
WHEN NEW.slot <> 'no'
BEGIN
  UPDATE votes SET signup_order = (
    SELECT COALESCE(MAX(COALESCE(signup_order, rowid)), 0) + 1 FROM votes
    WHERE event_id = NEW.event_id AND slot <> 'no'
  ) WHERE event_id = NEW.event_id AND member_id = NEW.member_id;
END;

CREATE TRIGGER vote_signup_update AFTER UPDATE OF slot ON votes
WHEN OLD.slot = 'no' AND NEW.slot <> 'no'
BEGIN
  UPDATE votes SET signup_order = (
    SELECT COALESCE(MAX(COALESCE(signup_order, rowid)), 0) + 1 FROM votes
    WHERE event_id = NEW.event_id AND slot <> 'no'
  ) WHERE event_id = NEW.event_id AND member_id = NEW.member_id;
END;

-- Adding a limit or bringing a past event back into the schedule can expose inactive signups.
CREATE TRIGGER remove_inactive_signups_at_capacity AFTER UPDATE OF capacity, date ON events
WHEN NEW.capacity IS NOT NULL AND NEW.date >= date('now', '+9 hours')
  AND (OLD.capacity IS NULL OR OLD.date < date('now', '+9 hours'))
BEGIN
  DELETE FROM votes WHERE event_id = NEW.id AND slot <> 'no'
    AND EXISTS (SELECT 1 FROM members m WHERE m.id = votes.member_id AND m.club_id = NEW.club_id AND m.active = 0);
END;
