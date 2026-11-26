-- 총괄 콘솔 로그인 (PLATFORM.md). One platform operator signs in at /console/; only a hash of the random token is stored.
-- credential_version changes with the ID or the password, so changing either signs every console session out.
CREATE TABLE console_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX console_sessions_expiry ON console_sessions(expires_at);
