BEGIN;

CREATE SCHEMA club;
REVOKE ALL ON SCHEMA club FROM PUBLIC;

CREATE TABLE club.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'organizer')),
  active boolean NOT NULL DEFAULT true,
  joined_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE club.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> ''),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  vote_closes_at timestamptz NOT NULL,
  place text NOT NULL CHECK (btrim(place) <> ''),
  notes text NOT NULL DEFAULT '',
  voting_open boolean NOT NULL DEFAULT false,
  attendance_finalized boolean NOT NULL DEFAULT false,
  CHECK (ends_at > starts_at),
  CHECK (vote_closes_at <= starts_at),
  CHECK (NOT attendance_finalized OR NOT voting_open)
);

CREATE TABLE club.event_members (
  event_id uuid NOT NULL REFERENCES club.events (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES club.members (id),
  PRIMARY KEY (event_id, member_id)
);

CREATE TABLE club.votes (
  event_id uuid NOT NULL,
  member_id uuid NOT NULL,
  response boolean NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id, member_id)
    REFERENCES club.event_members (event_id, member_id) ON DELETE CASCADE
);

CREATE TABLE club.attendance (
  event_id uuid NOT NULL,
  member_id uuid NOT NULL,
  present boolean NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY (event_id, member_id)
    REFERENCES club.event_members (event_id, member_id) ON DELETE CASCADE
);

CREATE TABLE club.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz
);

CREATE TABLE club.repeat_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  title text NOT NULL CHECK (btrim(title) <> ''),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  place text NOT NULL CHECK (btrim(place) <> ''),
  vote_lead_days smallint NOT NULL CHECK (vote_lead_days BETWEEN 0 AND 6)
);

REVOKE ALL ON ALL TABLES IN SCHEMA club FROM PUBLIC;

-- Supabase client roles can exist on a hosted database. Keep this schema server-only.
DO $$
DECLARE
  client_role name;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA club FROM %I', client_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA club FROM %I', client_role);
  END LOOP;
END;
$$;

COMMIT;
