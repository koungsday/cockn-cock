import { audit, organizerActor } from './audit.mjs';

const encoder = new TextEncoder();
const memberSessionAge = 12 * 60 * 60;
const adminSessionAge = 30 * 24 * 60 * 60;
const invalidLogin = '입력한 로그인 정보를 확인해 주세요.';
const attemptWindow = 15 * 60;
const loginNamespace = 'pin-login';

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
  return typeof value === 'string' && value.length <= 64 && value === value.trim()
    && (/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/.test(value) || /^[가-힣]+(?: [가-힣]+)*$/.test(value));
}

export function isSixDigitPin(value) {
  return typeof value === 'string' && value.length === 6 && /^\d{6}$/.test(value);
}

// Organisers (PLATFORM.md 인증): each has a name and a six-digit PIN in D1, hashed like member PINs.
// A club from before the console also has one organiser in Worker secrets (CLUB_ADMIN_ID/PIN). The first sign-in
// with those moves it into organizers; once any row has that name, the secrets no longer sign anyone in.
function legacyAdmin(env, name, rows) {
  const id = env.CLUB_ADMIN_ID;
  const pin = env.CLUB_ADMIN_PIN;
  return !rows.length && isAdminId(id) && isSixDigitPin(pin) && name === id ? { id, pin } : null;
}

// Active and retired rows with this name; the caller filters on `active`.
async function organizersNamed(env, name, input = name) {
  const { results } = await sql(env.DB, `
    SELECT id, name, active, credential_salt, credential_hash, credential_version, must_change
    FROM organizers WHERE club_id = ? AND name IN (?, ?, ?)
  `, env.CLUB_SCOPE, name, name.normalize('NFD'), input).all();
  return results;
}

async function matchingOrganizers(env, rows, credential) {
  const matches = await Promise.all(rows.map(async row =>
    equalDigest(row.credential_hash, await credentialHash(env, credential, row.credential_salt)) ? row : null));
  return matches.filter(Boolean);
}

// True when an organiser of this club signs in with this name and credential: a member must not get the same login.
export async function organizerUses(env, name, credential) {
  const rows = await organizersNamed(env, name);
  const legacy = legacyAdmin(env, name, rows);
  if (legacy) return equalDigest(legacy.pin, credential);
  return (await matchingOrganizers(env, rows.filter(row => row.active), credential)).length > 0;
}

function organizerUser(row) {
  return { id: row.id, name: row.name, role: 'admin', mustChange: Boolean(row.must_change), version: row.credential_version };
}

async function adoptLegacyAdmin(env, legacy) {
  const { hash, salt, version } = await makeMemberCredential(env, legacy.pin);
  await sql(env.DB, `
    INSERT INTO organizers (id, club_id, name, credential_salt, credential_hash, credential_version, must_change, created_at)
    SELECT ?, ?, ?, ?, ?, ?, 0, ? WHERE NOT EXISTS (SELECT 1 FROM organizers WHERE club_id = ? AND name = ?)
  `, crypto.randomUUID(), env.CLUB_SCOPE, legacy.id, salt, hash, version, currentSeconds(), env.CLUB_SCOPE, legacy.id).run();
  return sql(env.DB, `
    SELECT id, name, credential_version, must_change FROM organizers WHERE club_id = ? AND name = ? AND active = 1
  `, env.CLUB_SCOPE, legacy.id).first();
}

function cookieName(request, env, role) {
  const scope = (env.CLUB_SCOPE ?? 'suncok19') + '-' + role;
  return new URL(request.url).protocol === 'https:' ? '__Host-' + scope : scope + '-dev';
}

function sessionCookie(request, env, role, token = '') {
  const name = cookieName(request, env, role);
  const secure = name.startsWith('__Host-') ? '; Secure' : '';
  const maxAge = !token ? '; Max-Age=0'
    : role === 'admin' ? '; Max-Age=' + adminSessionAge : '';
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`;
}

function cookieToken(request, env, role) {
  const name = cookieName(request, env, role) + '=';
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const value = cookie.trim();
    if (value.startsWith(name) && /^[0-9a-f]{64}$/.test(value.slice(name.length))) return value.slice(name.length);
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
    SELECT s.role, s.member_id, s.organizer_id, s.credential_version AS session_version,
      m.name, m.active, m.must_change, m.credential_version AS member_version,
      o.name AS organizer_name, o.active AS organizer_active, o.must_change AS organizer_must_change,
      o.credential_version AS organizer_version
    FROM sessions s LEFT JOIN members m ON s.member_id = m.id LEFT JOIN organizers o ON s.organizer_id = o.id
    WHERE s.token_hash = ? AND s.role = ? AND s.club_id = ? AND s.expires_at > ?
  `, tokenHash, role, env.CLUB_SCOPE, currentSeconds()).first();
  if (!found) return null;

  if (found.role === 'admin') {
    // Admin sessions from before organiser accounts name no organiser: signing in again moves the account.
    if (!found.organizer_id || !found.organizer_active || found.organizer_version !== found.session_version) return null;
    return {
      id: found.organizer_id, name: found.organizer_name, role: 'admin',
      mustChange: Boolean(found.organizer_must_change), tokenHash, version: found.session_version
    };
  }
  if (!found.active || found.member_version !== found.session_version) return null;
  return {
    id: found.member_id, name: found.name, role: 'member',
    mustChange: Boolean(found.must_change), tokenHash, version: found.member_version
  };
}

async function sessionInsert(env, user) {
  const token = randomHex(32);
  const hash = await sessionHash(env, user.role, token);
  const age = user.role === 'admin' ? adminSessionAge : memberSessionAge;
  const expiresAt = currentSeconds() + age;
  const statement = user.role === 'admin'
    ? sql(env.DB, `
      INSERT INTO sessions (token_hash, club_id, role, member_id, organizer_id, credential_version, expires_at)
      SELECT ?, club_id, 'admin', NULL, id, credential_version, ?
      FROM organizers WHERE id = ? AND club_id = ? AND active = 1 AND credential_version = ?
    `, hash, expiresAt, user.id, env.CLUB_SCOPE, user.version)
    : sql(env.DB, `
      INSERT INTO sessions (token_hash, club_id, role, member_id, credential_version, expires_at)
      SELECT ?, club_id, 'member', id, credential_version, ?
      FROM members WHERE id = ? AND club_id = ? AND active = 1 AND credential_version = ?
    `, hash, expiresAt, user.id, env.CLUB_SCOPE, user.version);
  return { token, statement };
}

export async function reserveAttempt(env, key, limit) {
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

export function releaseAttempt(env, key, expiresAt) {
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

async function startSession(request, env, user, limits) {
  const { token, statement } = await sessionInsert(env, user);
  const previous = cookieToken(request, env, user.role);
  const statements = [statement, ...cleanExpired(env)];
  for (const { key, expiresAt } of limits) statements.push(...releaseAttempt(env, key, expiresAt));
  if (previous) {
    statements.push(sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ? AND role = ? AND club_id = ?',
      await sessionHash(env, user.role, previous), user.role, env.CLUB_SCOPE));
  }
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, '로그인 정보가 변경됐어요. 다시 로그인해 주세요.');
  return { user: clientUser(user), cookie: sessionCookie(request, env, user.role, token) };
}

export async function membersNamed(env, name, input = name) {
  // New rows use NFC. Preserve exact and decomposed spellings already stored.
  const { results } = await sql(env.DB, `
    SELECT id, name, active, credential_salt, credential_hash, credential_version, must_change
    FROM members WHERE club_id = ? AND name IN (?, ?, ?)
  `, env.CLUB_SCOPE, name, name.normalize('NFD'), input).all();
  return results;
}

function fullBirthday(value) {
  if (!/^(?:19|20)\d{6}$/.test(value)) return false;
  const date = value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8);
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

async function matchedMemberSecret(env, row, credential, checkLegacyBirthdays = false) {
  const variants = [credential];
  if (row.must_change) {
    if (fullBirthday(credential)) variants.push(credential.slice(2));
    if (checkLegacyBirthdays && /^\d{6}$/.test(credential)) {
      variants.push(...['19' + credential, '20' + credential].filter(fullBirthday));
    }
  }
  for (const value of variants) {
    const actual = await credentialHash(env, value, row.credential_salt);
    if (equalDigest(row.credential_hash, actual)) return value;
  }
  return null;
}

export async function matchingCredentials(env, candidates, credential, checkLegacyBirthdays = false) {
  const matches = await Promise.all(candidates.map(async row => {
    return await matchedMemberSecret(env, row, credential, checkLegacyBirthdays) ? row : null;
  }));
  return matches.filter(Boolean);
}

export async function login(request, env, body) {
  const input = typeof body.name === 'string' ? body.name.trim() : '';
  const name = input.normalize('NFC');
  const { credential } = body;
  if (!name || name.length > 64 || name.includes('\0')
    || typeof credential !== 'string' || !credential || credential.length > 128) {
    throw new ApiError(400, invalidLogin);
  }
  const source = await ipLimit(env, request, loginNamespace);
  const namedSource = await ipLimit(env, request, loginNamespace, name);
  const limits = [source, namedSource];
  const named = await organizersNamed(env, name, input);
  const organizers = named.filter(row => row.active);
  const legacy = legacyAdmin(env, name, named);
  if (organizers.length || legacy) {
    // A six-digit organiser PIN also needs a budget shared across source IPs.
    const key = await sha256(loginNamespace + '-admin\0' + pepper(env) + '\0' + name);
    limits.push({ key, expiresAt: await reserveAttempt(env, key, 20) });
  }

  const organizerMatches = await matchingOrganizers(env, organizers, credential);
  const adminMatch = organizerMatches.length > 0 || Boolean(legacy && equalDigest(legacy.pin, credential));
  // A retired member can still know their credential after a secret rotation.
  const candidates = (await membersNamed(env, name, input)).filter(row => adminMatch || row.active);
  if (!candidates.length && !organizers.length) await credentialHash(env, credential, '00000000000000000000000000000000');
  const matching = await matchingCredentials(env, candidates, credential, true);
  // The same name and credential for an organiser and a member (or two organisers) is never resolved by guessing.
  if (adminMatch && !matching.length && organizerMatches.length <= 1) {
    let organizer = organizerMatches[0];
    if (!organizer) {
      organizer = await adoptLegacyAdmin(env, legacy);
      if (organizer) await audit(env.DB, env.CLUB_SCOPE, organizerActor(organizer), 'organizer.adopt', organizer.id, () => organizer.name);
    }
    if (organizer) return startSession(request, env, organizerUser(organizer), limits);
  }
  if (adminMatch || matching.length !== 1) {
    await env.DB.batch(cleanExpired(env));
    throw new ApiError(401, invalidLogin);
  }
  const row = matching[0];
  const user = { id: row.id, name: row.name, role: 'member', mustChange: Boolean(row.must_change), version: row.credential_version };
  return startSession(request, env, user, limits);
}

export async function logout(request, env, role) {
  const token = cookieToken(request, env, role);
  if (token) {
    await sql(env.DB, 'DELETE FROM sessions WHERE token_hash = ? AND role = ? AND club_id = ?',
      await sessionHash(env, role, token), role, env.CLUB_SCOPE).run();
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
    || !isSixDigitPin(newPin) || weakPin(newPin)) {
    throw new ApiError(400, '반복이나 연속 숫자를 피해서 새 PIN을 숫자 6자리로 입력해 주세요.');
  }
  if (currentPin === newPin) throw new ApiError(400, '현재 비밀번호와 다른 PIN을 입력해 주세요.');
  const source = await ipLimit(env, request, 'pin');
  const limitKey = memberLimitKey('pin', user.id);
  const expiresAt = await reserveAttempt(env, limitKey, 5);
  const row = await sql(env.DB, `
    SELECT name, credential_salt, credential_hash, must_change FROM members
    WHERE id = ? AND club_id = ? AND active = 1 AND credential_version = ?
  `, user.id, env.CLUB_SCOPE, user.version).first();
  if (!row) throw new ApiError(401, '다시 로그인해 주세요.');
  const matched = await matchedMemberSecret(env, row, currentPin, true);
  if (!matched) throw new ApiError(400, '현재 비밀번호가 맞지 않아요.');
  if (matched === newPin || (row.must_change && fullBirthday(matched) && matched.slice(2) === newPin)) {
    throw new ApiError(400, '현재 비밀번호와 다른 PIN을 입력해 주세요.');
  }
  const name = row.name.normalize('NFC');
  const candidates = await membersNamed(env, name, row.name);
  if (await organizerUses(env, name, newPin) ||
      (await matchingCredentials(env, candidates.filter(candidate => candidate.id !== user.id), newPin, true)).length) {
    throw new ApiError(409, '같은 이름으로 사용 중인 번호예요. 다른 번호를 입력해 주세요.');
  }

  const version = randomHex(16);
  const salt = randomHex(16);
  const hash = await credentialHash(env, newPin, salt);
  const updated = { ...user, version, mustChange: false };
  const { token, statement } = await sessionInsert(env, updated);
  const results = await env.DB.batch([
    sql(env.DB, `
      UPDATE members SET credential_version = ?, credential_salt = ?, credential_hash = ?, must_change = 0
      WHERE id = ? AND club_id = ? AND name = ? AND active = 1 AND credential_version = ?
        AND NOT EXISTS (
          SELECT 1 FROM members WHERE club_id = ? AND name IN (?, ?, ?)
            AND credential_version NOT IN (SELECT value FROM json_each(?))
        )
    `, version, salt, hash, user.id, env.CLUB_SCOPE, row.name, user.version, env.CLUB_SCOPE, name, name.normalize('NFD'), row.name,
    JSON.stringify(candidates.map(candidate => candidate.credential_version))),
    sql(env.DB, `
      DELETE FROM sessions WHERE role = 'member' AND member_id = ? AND credential_version = ?
        AND EXISTS (SELECT 1 FROM members WHERE id = ? AND credential_version = ?)
    `, user.id, user.version, user.id, version),
    statement,
    ...releaseAttempt(env, source.key, source.expiresAt),
    ...releaseAttempt(env, limitKey, expiresAt),
  ]);
  if (!results[0].meta.changes || !results[2].meta.changes) {
    throw new ApiError(409, '회원 정보가 변경됐어요. 다시 로그인해 주세요.');
  }
  return { user: clientUser(updated), cookie: sessionCookie(request, env, 'member', token) };
}

// An organiser sets their own PIN; after a console-issued temporary PIN nothing else opens until they do (api.mjs).
export async function changeOrganizerPin(request, env, user, body) {
  const { currentPin, newPin } = body;
  if (typeof currentPin !== 'string' || !currentPin || currentPin.length > 128
    || !isSixDigitPin(newPin) || weakPin(newPin)) {
    throw new ApiError(400, '반복이나 연속 숫자를 피해서 새 번호를 숫자 6자리로 입력해 주세요.');
  }
  if (currentPin === newPin) throw new ApiError(400, '지금 번호와 다른 번호를 입력해 주세요.');
  const source = await ipLimit(env, request, 'pin');
  const limitKey = 'pin-organizer:' + user.id;
  const expiresAt = await reserveAttempt(env, limitKey, 5);
  const row = await sql(env.DB, `
    SELECT name, credential_salt, credential_hash FROM organizers
    WHERE id = ? AND club_id = ? AND active = 1 AND credential_version = ?
  `, user.id, env.CLUB_SCOPE, user.version).first();
  if (!row) throw new ApiError(401, '다시 로그인해 주세요.');
  if (!equalDigest(row.credential_hash, await credentialHash(env, currentPin, row.credential_salt))) {
    throw new ApiError(400, '지금 번호가 맞지 않아요.');
  }
  if ((await matchingCredentials(env, await membersNamed(env, row.name.normalize('NFC'), row.name), newPin, true)).length) {
    throw new ApiError(409, '같은 이름의 회원이 쓰는 번호예요. 다른 번호를 입력해 주세요.');
  }
  const { hash, salt, version } = await makeMemberCredential(env, newPin);
  const updated = { ...user, version, mustChange: false };
  const { token, statement } = await sessionInsert(env, updated);
  const results = await env.DB.batch([
    sql(env.DB, `
      UPDATE organizers SET credential_version = ?, credential_salt = ?, credential_hash = ?, must_change = 0
      WHERE id = ? AND club_id = ? AND active = 1 AND credential_version = ?
    `, version, salt, hash, user.id, env.CLUB_SCOPE, user.version),
    sql(env.DB, `
      DELETE FROM sessions WHERE role = 'admin' AND organizer_id = ? AND credential_version = ?
        AND EXISTS (SELECT 1 FROM organizers WHERE id = ? AND credential_version = ?)
    `, user.id, user.version, user.id, version),
    statement,
    ...releaseAttempt(env, source.key, source.expiresAt),
    ...releaseAttempt(env, limitKey, expiresAt),
  ]);
  if (!results[0].meta.changes || !results[2].meta.changes) {
    throw new ApiError(409, '운영진 정보가 변경됐어요. 다시 로그인해 주세요.');
  }
  return { user: clientUser(updated), cookie: sessionCookie(request, env, 'admin', token) };
}

export async function makeMemberCredential(env, activationSecret) {
  const salt = randomHex(16);
  const hash = await credentialHash(env, activationSecret, salt);
  return { hash, salt, version: randomHex(16) };
}

export function temporaryPin() {
  // Rejection sampling avoids bias when shortening a random uint32 to six digits.
  const codes = 1_000_000;
  const upperBound = Math.floor(2 ** 32 / codes) * codes;
  const sample = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(sample);
    if (sample[0] >= upperBound) continue;
    const pin = String(sample[0] % codes).padStart(6, '0');
    if (!weakPin(pin)) return pin;
  }
}
