const encoder = new TextEncoder();
const browserSessionAge = 12 * 60 * 60;
const rememberedAdminAge = 30 * 24 * 60 * 60;
const attemptWindow = 15 * 60;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sql(db, query, ...args) {
  const statement = db.prepare(query);
  return args.length ? statement.bind(...args) : statement;
}

export function currentSeconds() {
  return Math.floor(Date.now() / 1000);
}

function bytesAsHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes) {
  return bytesAsHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value) {
  return bytesAsHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function pepper(env) {
  const value = env.CLUB_AUTH_PEPPER;
  if (typeof value !== 'string' || value.length < 32) throw new ApiError(503, '인증 설정을 확인해 주세요.');
  return value;
}

export async function credentialHash(env, credential, salt) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(pepper(env) + '\0' + credential), 'PBKDF2', false, ['deriveBits']
  );
  // Workers Free has a short CPU limit. The independently stored pepper and
  // persistent attempt limits protect the low-entropy member PIN.
  const digest = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 24000 },
    key, 256
  );
  return bytesAsHex(new Uint8Array(digest));
}

export function equalDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function isAdminId(value) {
  return typeof value === 'string' && value === value.trim()
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(value);
}

async function adminVersion(env, id, password) {
  return sha256('admin\0' + pepper(env) + '\0' + id + '\0' + password);
}

function adminSettings(env) {
  const id = env.CLUB_ADMIN_ID;
  const password = env.CLUB_ADMIN_PASSWORD;
  if (!isAdminId(id) || typeof password !== 'string' || password.length < 16
    || password.length > 128 || !password.trim() || password === id) {
    throw new ApiError(503, '운영진 인증 설정을 확인해 주세요.');
  }
  return { id, password };
}

function cookieName(request, env, role) {
  const scope = (env.CLUB_SCOPE ?? 'suncok19') + '-' + role;
  return new URL(request.url).protocol === 'https:' ? '__Host-' + scope : scope + '-dev';
}

function sessionCookie(request, env, role, token = '', remember = false) {
  const name = cookieName(request, env, role);
  const secure = name.startsWith('__Host-') ? '; Secure' : '';
  const maxAge = !token ? '; Max-Age=0'
    : role === 'admin' && remember ? '; Max-Age=' + rememberedAdminAge : '';
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`;
}

function cookieToken(request, env, role) {
  const name = cookieName(request, env, role) + '=';
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const value = cookie.trim();
    if (value.startsWith(name) && /^[0-9a-f]{64}$/.test(value.slice(name.length))) {
      return value.slice(name.length);
    }
  }
  return null;
}

async function sessionHash(env, role, token) {
  return sha256('session\0' + role + '\0' + pepper(env) + '\0' + token);
}

export function clientUser(user) {
  if (!user) return null;
  const { id, name, role, mustChange } = user;
  return { id, name, role, mustChange };
}

export async function readSession(request, env, role) {
  const token = cookieToken(request, env, role);
  if (!token) return null;
  const tokenHash = await sessionHash(env, role, token);
  const found = await sql(env.DB, `
    SELECT s.role, s.member_id, s.credential_version AS session_version,
      m.name, m.active, m.must_change, m.credential_version AS member_version
    FROM sessions s LEFT JOIN members m ON s.member_id = m.id
    WHERE s.token_hash = ? AND s.role = ? AND s.expires_at > ?
  `, tokenHash, role, currentSeconds()).first();
  if (!found) return null;

  if (found.role === 'admin') {
    const { id, password } = adminSettings(env);
    const version = await adminVersion(env, id, password);
    if (!equalDigest(version, found.session_version)) return null;
    return { id: 'admin', name: '운영진', role: 'admin', mustChange: false, tokenHash, version };
  }
  if (!found.active || found.member_version !== found.session_version) return null;
  return {
    id: found.member_id, name: found.name, role: 'member',
    mustChange: Boolean(found.must_change), tokenHash, version: found.member_version
  };
}

async function sessionInsert(env, user, remember = false) {
  const token = randomHex(32);
  const hash = await sessionHash(env, user.role, token);
  const age = user.role === 'admin' && remember ? rememberedAdminAge : browserSessionAge;
  const expiresAt = currentSeconds() + age;
  const statement = user.role === 'admin'
    ? sql(env.DB, `
      INSERT INTO sessions (token_hash, role, member_id, credential_version, expires_at)
      VALUES (?, 'admin', NULL, ?, ?)
    `, hash, user.version, expiresAt)
    : sql(env.DB, `
      INSERT INTO sessions (token_hash, role, member_id, credential_version, expires_at)
      SELECT ?, 'member', id, credential_version, ?
      FROM members WHERE id = ? AND active = 1 AND credential_version = ?
    `, hash, expiresAt, user.id, user.version);
  return { token, statement };
}

async function reserveAttempt(env, key, limit) {
  const now = currentSeconds();
  const result = await sql(env.DB, `
    INSERT INTO attempts (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN attempts.expires_at <= ? THEN 1 ELSE attempts.count + 1 END,
      expires_at = CASE WHEN attempts.expires_at <= ? THEN excluded.expires_at ELSE attempts.expires_at END
    WHERE attempts.expires_at <= ? OR attempts.count < ?
    RETURNING expires_at
  `, key, now + attemptWindow, now, now, now, limit).first();
  if (!result) throw new ApiError(429, '시도 횟수를 초과했어요. 15분 뒤에 다시 시도해 주세요.');
  return result.expires_at;
}

function releaseAttempt(env, key, expiresAt) {
  // Keep the counter at zero by deleting the single remaining reservation.
  return [
    sql(env.DB, 'DELETE FROM attempts WHERE key = ? AND expires_at = ? AND count = 1', key, expiresAt),
    sql(env.DB, 'UPDATE attempts SET count = count - 1 WHERE key = ? AND expires_at = ?', key, expiresAt)
  ];
}

async function ipLimit(env, request, namespace, name = '') {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await sha256(namespace + '-source\0' + pepper(env) + '\0' + ip + '\0' + name);
  const expiresAt = await reserveAttempt(env, key, name ? 5 : 30);
  return { key, expiresAt };
}

function memberLimitKey(namespace, memberId) {
  return namespace + '-member:' + memberId;
}

function cleanExpired(env) {
  const now = currentSeconds();
  return [
    sql(env.DB, `
      DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ? LIMIT 100)
    `, now),
    sql(env.DB, `
      DELETE FROM attempts WHERE key IN (SELECT key FROM attempts WHERE expires_at <= ? LIMIT 100)
    `, now)
  ];
}

async function startSession(request, env, user, limits, remember = false) {
  const { token, statement } = await sessionInsert(env, user, remember);
  const previous = cookieToken(request, env, user.role);
  const statements = [statement, ...cleanExpired(env)];
  for (const { key, expiresAt } of limits) statements.push(...releaseAttempt(env, key, expiresAt));
  if (previous) {
    statements.push(sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ? AND role = ?',
      await sessionHash(env, user.role, previous), user.role));
  }
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, '회원 정보가 변경됐어요. 다시 로그인해 주세요.');
  return { user: clientUser(user), cookie: sessionCookie(request, env, user.role, token, remember) };
}

export async function membersNamed(env, name, input = name) {
  // New rows use NFC. Preserve exact and decomposed spellings already stored.
  const { results } = await sql(env.DB, `
    SELECT id, name, active, credential_salt, credential_hash, credential_version, must_change
    FROM members WHERE name IN (?, ?, ?)
  `, name, name.normalize('NFD'), input).all();
  return results;
}

export async function matchingCredentials(env, candidates, credential) {
  const matches = await Promise.all(candidates.map(async row => {
    const actual = await credentialHash(env, credential, row.credential_salt);
    return equalDigest(row.credential_hash, actual) ? row : null;
  }));
  return matches.filter(Boolean);
}

export async function login(request, env, body) {
  const input = typeof body.name === 'string' ? body.name.trim() : '';
  const name = input.normalize('NFC');
  const { credential } = body;
  if (!name || name.length > 60 || name.includes('\0')
    || typeof credential !== 'string' || !credential || credential.length > 128) {
    throw new ApiError(400, '이름과 비밀번호를 확인해 주세요.');
  }
  const source = await ipLimit(env, request, 'member-login');
  const namedSource = await ipLimit(env, request, 'member-login', name);
  const candidates = (await membersNamed(env, name, input)).filter(row => row.active);
  if (!candidates.length) await credentialHash(env, credential, '00000000000000000000000000000000');
  const matching = await matchingCredentials(env, candidates, credential);
  if (matching.length !== 1) {
    await env.DB.batch(cleanExpired(env));
    throw new ApiError(401, '이름 또는 비밀번호가 맞지 않아요.');
  }
  const row = matching[0];
  const user = { id: row.id, name: row.name, role: 'member', mustChange: Boolean(row.must_change), version: row.credential_version };
  return startSession(request, env, user, [source, namedSource]);
}

export async function loginAdmin(request, env, body) {
  const { adminId, credential, remember = false } = body;
  if (!isAdminId(adminId) || typeof credential !== 'string' || !credential || credential.length > 128
    || typeof remember !== 'boolean') {
    throw new ApiError(400, '아이디와 비밀번호를 확인해 주세요.');
  }
  const source = await ipLimit(env, request, 'admin-login');
  const { id, password } = adminSettings(env);
  const version = await adminVersion(env, id, password);
  const actual = await adminVersion(env, adminId, credential);
  if (!equalDigest(version, actual)) {
    await env.DB.batch(cleanExpired(env));
    throw new ApiError(401, '아이디 또는 비밀번호가 맞지 않아요.');
  }
  const user = { id: 'admin', name: '운영진', role: 'admin', mustChange: false, version };
  return startSession(request, env, user, [source], remember);
}

export async function logout(request, env, role) {
  const token = cookieToken(request, env, role);
  if (token) {
    await sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ? AND role = ?', await sessionHash(env, role, token), role).run();
  }
  return sessionCookie(request, env, role);
}

function weakPin(pin) {
  return /^(\d)\1+$/.test(pin) || /^(.{2,3})\1+$/.test(pin)
    || '01234567890123456789'.includes(pin) || '98765432109876543210'.includes(pin);
}

export async function changePin(request, env, user, body) {
  const { currentPin, newPin } = body;
  if (typeof currentPin !== 'string' || !currentPin || currentPin.length > 128
    || typeof newPin !== 'string' || !/^\d{6,10}$/.test(newPin) || weakPin(newPin)) {
    throw new ApiError(400, '반복이나 연속 숫자를 피해서 새 PIN을 숫자 6~10자리로 입력해 주세요.');
  }
  if (currentPin === newPin) throw new ApiError(400, '현재 비밀번호와 다른 PIN을 입력해 주세요.');
  const source = await ipLimit(env, request, 'pin');
  const limitKey = memberLimitKey('pin', user.id);
  const expiresAt = await reserveAttempt(env, limitKey, 5);
  const row = await sql(env.DB, `
    SELECT credential_salt, credential_hash FROM members
    WHERE id = ? AND active = 1 AND credential_version = ?
  `, user.id, user.version).first();
  if (!row) throw new ApiError(401, '다시 로그인해 주세요.');
  const actual = await credentialHash(env, currentPin, row.credential_salt);
  if (!equalDigest(row.credential_hash, actual)) throw new ApiError(400, '현재 비밀번호가 맞지 않아요.');

  const version = randomHex(16);
  const salt = randomHex(16);
  const hash = await credentialHash(env, newPin, salt);
  const updated = { ...user, version, mustChange: false };
  const { token, statement } = await sessionInsert(env, updated);
  const results = await env.DB.batch([
    sql(env.DB, `
      UPDATE members SET credential_version = ?, credential_salt = ?, credential_hash = ?, must_change = 0
      WHERE id = ? AND active = 1 AND credential_version = ?
    `, version, salt, hash, user.id, user.version),
    sql(env.DB, `DELETE FROM sessions WHERE role = 'member' AND member_id = ? AND credential_version = ?`, user.id, user.version),
    statement,
    ...releaseAttempt(env, source.key, source.expiresAt),
    ...releaseAttempt(env, limitKey, expiresAt),
  ]);
  if (!results[0].meta.changes || !results[2].meta.changes) {
    throw new ApiError(409, '회원 정보가 변경됐어요. 다시 로그인해 주세요.');
  }
  return { user: clientUser(updated), cookie: sessionCookie(request, env, 'member', token) };
}

export async function makeMemberCredential(env, activationSecret) {
  const salt = randomHex(16);
  const hash = await credentialHash(env, activationSecret, salt);
  return { hash, salt, version: randomHex(16) };
}

export function temporaryPin() {
  // A reset replaces the current credential with a randomly generated secret.
  return randomHex(8);
}
