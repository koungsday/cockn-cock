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
