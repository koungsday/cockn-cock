const encoder = new TextEncoder();
const sessionAge = 14 * 24 * 60 * 60;
const attemptWindow = 15 * 60;
const productionCookie = '__Host-suncok19';
const localCookie = 'suncok19_dev';

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

async function codeHash(env, code) {
  return sha256('member\0' + pepper(env) + '\0' + code);
}

async function adminVersion(env, password) {
  return sha256('admin\0' + pepper(env) + '\0' + password);
}

function adminPassword(env) {
  const password = env.CLUB_ADMIN_PASSWORD;
  if (typeof password !== 'string' || password.length < 16) {
    throw new ApiError(503, '운영진 인증 설정을 확인해 주세요.');
  }
  return password;
}

function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? productionCookie : localCookie;
}

export function sessionCookie(request, token = '') {
  const name = cookieName(request);
  const secure = name === productionCookie ? '; Secure' : '';
  const maxAge = token ? sessionAge : 0;
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function cookieToken(request) {
  const name = cookieName(request) + '=';
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const value = cookie.trim();
    if (value.startsWith(name) && /^[0-9a-f]{64}$/.test(value.slice(name.length))) {
      return value.slice(name.length);
    }
  }
  return null;
}

async function sessionHash(env, token) {
  return sha256('session\0' + pepper(env) + '\0' + token);
}

export function clientUser(user) {
  if (!user) return null;
  const { id, name, role, mustChange } = user;
  return { id, name, role, mustChange };
}

export async function readSession(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  const tokenHash = await sessionHash(env, token);
  const found = await sql(env.DB, `
    SELECT s.role, s.member_id, s.credential_version AS session_version,
      m.name, m.active, m.must_change, m.credential_version AS member_version
    FROM sessions s LEFT JOIN members m ON s.member_id = m.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `, tokenHash, currentSeconds()).first();
  if (!found) return null;

  if (found.role === 'admin') {
    const version = await adminVersion(env, adminPassword(env));
    if (!equalDigest(version, found.session_version)) return null;
    return { id: 'admin', name: '운영진', role: 'admin', mustChange: false, tokenHash, version };
  }
  if (!found.active || found.member_version !== found.session_version) return null;
  return {
    id: found.member_id, name: found.name, role: 'member',
    mustChange: Boolean(found.must_change), tokenHash, version: found.member_version
  };
}

async function sessionInsert(env, user) {
  const token = randomHex(32);
  const hash = await sessionHash(env, token);
  const expiresAt = currentSeconds() + sessionAge;
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

async function ipLimit(env, request, namespace) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await sha256(namespace + '-source\0' + pepper(env) + '\0' + ip);
  const expiresAt = await reserveAttempt(env, key, 30);
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

export async function login(request, env, body) {
  const memberCode = typeof body.memberCode === 'string' ? body.memberCode.trim().toLowerCase() : '';
  const credential = typeof body.credential === 'string' ? body.credential : '';
  if ((memberCode !== 'admin' && !/^[0-9a-f]{16}$/.test(memberCode)) || !credential || credential.length > 128) {
    throw new ApiError(400, '회원 코드와 비밀번호를 확인해 주세요.');
  }
  const source = await ipLimit(env, request, 'login');
  const row = memberCode === 'admin' ? null : await sql(env.DB, `
    SELECT id, name, active, credential_salt, credential_hash, credential_version, must_change
    FROM members WHERE code_hash = ?
  `, await codeHash(env, memberCode)).first();
  // Admin uses a high-entropy secret and the source limit. A shared counter
  // for the public username would let unauthenticated requests lock out the organizer.
  const limitKey = row ? memberLimitKey('login', row.id) : null;
  const expiresAt = limitKey ? await reserveAttempt(env, limitKey, 5) : null;

  let user;
  if (memberCode === 'admin') {
    const version = await adminVersion(env, adminPassword(env));
    const actual = await adminVersion(env, credential);
    if (equalDigest(version, actual)) {
      user = { id: 'admin', name: '운영진', role: 'admin', mustChange: false, version };
    }
  } else {
    const actual = await credentialHash(env, credential, row?.credential_salt || '00000000000000000000000000000000');
    if (row?.active && equalDigest(row.credential_hash, actual)) {
      user = { id: row.id, name: row.name, role: 'member', mustChange: Boolean(row.must_change), version: row.credential_version };
    }
  }
  if (!user) {
    await env.DB.batch(cleanExpired(env));
    throw new ApiError(401, '회원 코드 또는 비밀번호가 맞지 않아요.');
  }

  const { token, statement } = await sessionInsert(env, user);
  const previous = cookieToken(request);
  const statements = [statement, ...cleanExpired(env), ...releaseAttempt(env, source.key, source.expiresAt)];
  if (limitKey) statements.push(...releaseAttempt(env, limitKey, expiresAt));
  if (previous) statements.push(sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await sessionHash(env, previous)));
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, '회원 정보가 변경됐어요. 다시 로그인해 주세요.');
  return { user: clientUser(user), cookie: sessionCookie(request, token) };
}

export async function logout(request, env) {
  const token = cookieToken(request);
  if (token) await sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await sessionHash(env, token)).run();
  return sessionCookie(request);
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
    sql(env.DB, 'DELETE FROM sessions WHERE member_id = ? AND credential_version = ?', user.id, user.version),
    statement,
    ...releaseAttempt(env, source.key, source.expiresAt),
    ...releaseAttempt(env, limitKey, expiresAt),
  ]);
  if (!results[0].meta.changes || !results[2].meta.changes) {
    throw new ApiError(409, '회원 정보가 변경됐어요. 다시 로그인해 주세요.');
  }
  return { user: clientUser(updated), cookie: sessionCookie(request, token) };
}

export async function makeMemberCredential(env, activationSecret) {
  const memberCode = randomHex(8);
  const salt = randomHex(16);
  const [hashedCode, hash] = await Promise.all([codeHash(env, memberCode), credentialHash(env, activationSecret, salt)]);
  return { memberCode, hashedCode, hash, salt, version: randomHex(16) };
}

export function temporaryPin() {
  // A reset secret is a random one-time code rather than another birthday.
  return randomHex(8);
}
