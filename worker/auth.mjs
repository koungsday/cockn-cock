import { audit, organizerActor } from './audit.mjs';

const encoder = new TextEncoder();
// Members stay signed in on their phone for half a year (사용자 결정, 2026-11-26: name and 6 digits once, not every
// visit); a PIN change or a reset by the organisers still ends it (credential_version).
const memberSessionAge = 180 * 24 * 60 * 60;
export const adminSessionAge = 30 * 24 * 60 * 60;
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

// Accounts (ROLES.md 1단계): every person is one member row; `organizer` marks the 운영 권한. A club from before the
// console also has one organiser in Worker secrets (CLUB_ADMIN_ID/PIN). The first sign-in with those makes them a
// member with the 운영 권한; once any member has that name, the secrets no longer sign anyone in.
function legacyAdmin(env, name, rows) {
  const id = env.CLUB_ADMIN_ID;
  const pin = env.CLUB_ADMIN_PIN;
  return !rows.length && isAdminId(id) && isSixDigitPin(pin) && name === id ? { id, pin } : null;
}

// A member joins the roster of every event whose vote is still open and not wrapped up (also api.mjs, organizers.mjs).
export function rosterOpenEvents(db, club, id, version = null) {
  return sql(db, `
    INSERT INTO roster (event_id, member_id)
    SELECT e.id, m.id FROM events e CROSS JOIN members m
    WHERE m.id = ? AND m.club_id = ? AND e.club_id = m.club_id AND m.active = 1 AND e.deadline_at > unixepoch()
      AND (? IS NULL OR m.credential_version = ?)
      AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.event_id = e.id AND s.confirmed = 1)
    ON CONFLICT (event_id, member_id) DO NOTHING
  `, id, club, version, version);
}

async function adoptLegacyAdmin(env, legacy) {
  const { hash, salt, version } = await makeMemberCredential(env, legacy.pin);
  const id = crypto.randomUUID();
  await env.DB.batch([
    sql(env.DB, `
      INSERT INTO members (id, club_id, name, credential_salt, credential_hash, credential_version, must_change, organizer)
      SELECT ?, ?, ?, ?, ?, ?, 0, 1 WHERE NOT EXISTS (SELECT 1 FROM members WHERE club_id = ? AND name = ?)
    `, id, env.CLUB_SCOPE, legacy.id, salt, hash, version, env.CLUB_SCOPE, legacy.id),
    rosterOpenEvents(env.DB, env.CLUB_SCOPE, id)
  ]);
  return sql(env.DB, `
    SELECT id, name, credential_version, must_change, organizer FROM members
    WHERE club_id = ? AND name = ? AND active = 1 AND organizer = 1
  `, env.CLUB_SCOPE, legacy.id).first();
}

// One session per person, in one cookie. Every account is a member row, so it keeps the member cookie and session
// role: member sessions from before the merge stay signed in.
function cookieName(request, env) {
  const scope = (env.CLUB_SCOPE ?? 'suncok19') + '-member';
  return new URL(request.url).protocol === 'https:' ? '__Host-' + scope : scope + '-dev';
}

// The 운영 권한 keeps the organisers' 30 days (the home-screen app); members stay signed in for half a year (#44).
function sessionCookie(request, env, token = '', organizer = false) {
  const name = cookieName(request, env);
  const secure = name.startsWith('__Host-') ? '; Secure' : '';
  const maxAge = !token ? '; Max-Age=0' : '; Max-Age=' + (organizer ? adminSessionAge : memberSessionAge);
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure}`;
}

function cookieToken(request, env) {
  const name = cookieName(request, env) + '=';
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const value = cookie.trim();
    if (value.startsWith(name) && /^[0-9a-f]{64}$/.test(value.slice(name.length))) return value.slice(name.length);
  }
  return null;
}

async function sessionHash(env, token) {
  return sha256('session\0member\0' + pepper(env) + '\0' + token);
}

// role is the screen the answer is for: 'admin' only with the 운영 권한 (api.mjs route). organizer tells the one club
// screen which menus to draw (ROLES.md 2단계).
export function clientUser(user, role = 'member') {
  if (!user) return null;
  const { id, name, mustChange } = user;
  return { id, name, role, mustChange, organizer: Boolean(user.organizer) };
}

// The signed-in person, with the 운영 권한 read from their member row on every request: turning it off takes effect at
// once. Sessions from before the merge that point at an organiser row are never read (0010 removed them).
export async function readSession(request, env) {
  const token = cookieToken(request, env);
  if (!token) return null;
  const tokenHash = await sessionHash(env, token);
  const found = await sql(env.DB, `
    SELECT s.member_id, s.credential_version AS session_version, m.name, m.active, m.must_change, m.organizer,
      m.credential_version AS member_version
    FROM sessions s JOIN members m ON s.member_id = m.id
    WHERE s.token_hash = ? AND s.role = 'member' AND s.club_id = ? AND m.club_id = s.club_id AND s.expires_at > ?
  `, tokenHash, env.CLUB_SCOPE, currentSeconds()).first();
  if (!found || !found.active || found.member_version !== found.session_version) return null;
  return {
    id: found.member_id, name: found.name, organizer: Boolean(found.organizer),
    mustChange: Boolean(found.must_change), tokenHash, version: found.member_version
  };
}

async function sessionInsert(env, user) {
  const token = randomHex(32);
  const hash = await sessionHash(env, token);
  const expiresAt = currentSeconds() + (user.organizer ? adminSessionAge : memberSessionAge);
  const statement = sql(env.DB, `
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

async function startSession(request, env, user, limits, role) {
  const { token, statement } = await sessionInsert(env, user);
  const previous = cookieToken(request, env);
  const statements = [statement, ...cleanExpired(env)];
  for (const { key, expiresAt } of limits) statements.push(...releaseAttempt(env, key, expiresAt));
  if (previous) {
    statements.push(sql(env.DB, "DELETE FROM sessions WHERE token_hash = ? AND role = 'member' AND club_id = ?",
      await sessionHash(env, previous), env.CLUB_SCOPE));
  }
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) throw new ApiError(409, '로그인 정보가 변경됐어요. 다시 로그인해 주세요.');
  return { user: clientUser(user, role), cookie: sessionCookie(request, env, token, user.organizer) };
}

// 성함 비교 (DESIGN.md 6 UX 점검표 18 포스텔의 법칙): spaces inside a name do not tell two members apart, so "홍 길동"
// signs in as "홍길동" and the same-name checks (sign-in, new member, number change, reset) see one name. spaceless() is
// the JavaScript side, sameName() the SQL side (the space and the full-width space U+3000).
export const spaceless = value => value.replace(/\s+/g, '');
export const sameName = column => `replace(replace(${column}, ' ', ''), '　', '')`;

export async function membersNamed(env, name, input = name) {
  // New rows use NFC. Preserve exact and decomposed spellings already stored.
  const { results } = await sql(env.DB, `
    SELECT id, name, active, organizer, credential_salt, credential_hash, credential_version, must_change
    FROM members WHERE club_id = ? AND ${sameName('name')} IN (?, ?, ?)
  `, env.CLUB_SCOPE, spaceless(name), spaceless(name.normalize('NFD')), spaceless(input)).all();
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
  // Every spacing of one name shares its attempt budget (spaceless), as they reach the same member.
  const namedSource = await ipLimit(env, request, loginNamespace, spaceless(name));
  const limits = [source, namedSource];
  const named = await membersNamed(env, name, input);
  const candidates = named.filter(row => row.active);
  const legacy = legacyAdmin(env, name, named);
  if (candidates.some(row => row.organizer) || legacy) {
    // A six-digit organiser PIN also needs a budget shared across source IPs.
    const key = await sha256(loginNamespace + '-admin\0' + pepper(env) + '\0' + spaceless(name));
    limits.push({ key, expiresAt: await reserveAttempt(env, key, 20) });
  }
  if (legacy && equalDigest(legacy.pin, credential)) {
    const organizer = await adoptLegacyAdmin(env, legacy);
    if (organizer) {
      await audit(env.DB, env.CLUB_SCOPE, organizerActor(organizer), 'organizer.adopt', organizer.id, () => organizer.name);
      return startSession(request, env, sessionUser(organizer), limits, body.as === 'member' ? 'member' : 'admin');
    }
  }
  if (!candidates.length) await credentialHash(env, credential, '00000000000000000000000000000000');
  // The same name and credential for two people is never resolved by guessing.
  const matching = await matchingCredentials(env, candidates, credential, true);
  if (matching.length !== 1) {
    await env.DB.batch(cleanExpired(env));
    throw new ApiError(401, invalidLogin);
  }
  const user = sessionUser(matching[0]);
  // The screen says which page it signs in for: the 운영 화면 opens only with the 운영 권한, and an organiser signing in
  // from a 카톡 vote link stays on that vote. Without it (an older screen) an organiser goes to the 운영 화면 as before.
  return startSession(request, env, user, limits, user.organizer && body.as !== 'member' ? 'admin' : 'member');
}

function sessionUser(row) {
  return {
    id: row.id, name: row.name, organizer: Boolean(row.organizer), mustChange: Boolean(row.must_change),
    version: row.credential_version
  };
}

export async function logout(request, env) {
  const token = cookieToken(request, env);
  if (token) {
    await sql(env.DB, "DELETE FROM sessions WHERE token_hash = ? AND role = 'member' AND club_id = ?",
      await sessionHash(env, token), env.CLUB_SCOPE).run();
  }
  return sessionCookie(request, env);
}

function weakPin(pin) {
  return /^(\d)\1+$/.test(pin) || /^(.{2,3})\1+$/.test(pin)
    || '01234567890123456789'.includes(pin) || '98765432109876543210'.includes(pin);
}

// Members and organisers alike (one account): after a temporary PIN, an organiser's 운영 화면 opens only once they set
// their own (api.mjs). role is the screen asking, as for sign-in.
export async function changePin(request, env, user, body, role = 'member') {
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
  if ((await matchingCredentials(env, candidates.filter(candidate => candidate.id !== user.id), newPin, true)).length) {
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
          SELECT 1 FROM members WHERE club_id = ? AND ${sameName('name')} IN (?, ?, ?)
            AND credential_version NOT IN (SELECT value FROM json_each(?))
        )
    `, version, salt, hash, user.id, env.CLUB_SCOPE, row.name, user.version, env.CLUB_SCOPE,
    spaceless(name), spaceless(name.normalize('NFD')), spaceless(row.name),
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
  return { user: clientUser(updated, role), cookie: sessionCookie(request, env, token, updated.organizer) };
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
