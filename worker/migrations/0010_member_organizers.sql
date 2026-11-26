-- ROLES.md 1단계: 운영진 = 회원 + 운영 권한. 한 사람은 계정 하나, 로그인 세션도 하나다.
ALTER TABLE members ADD COLUMN organizer INTEGER NOT NULL DEFAULT 0 CHECK (organizer IN (0, 1));

-- Each active organiser becomes a member row with the same id, so the 변경 기록 and the console keep pointing at them.
-- The PIN moves as it is (same hash, salt and version), so they keep signing in with the number they use now
-- (ROLES.md 결정 6). A member of the same name is never merged into it: two people can share a name.
-- The organizers table stays one more stage as the way back.
INSERT INTO members (id, club_id, name, active, credential_salt, credential_hash, credential_version, must_change, organizer)
  SELECT id, club_id, name, 1, credential_salt, credential_hash, credential_version, must_change, 1
  FROM organizers WHERE active = 1;

-- Like a new member (api.mjs rosterOpenEvents): the roster of every event whose vote is still open and not wrapped up.
INSERT INTO roster (event_id, member_id)
  SELECT e.id, o.id FROM organizers o JOIN events e ON e.club_id = o.club_id
  WHERE o.active = 1 AND e.deadline_at > unixepoch()
    AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.event_id = e.id AND s.confirmed = 1)
  ON CONFLICT (event_id, member_id) DO NOTHING;

-- Organiser sessions point at the organizers table; they sign in once more as the member they now are.
DELETE FROM sessions WHERE role = 'admin';
