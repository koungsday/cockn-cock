// 총괄 콘솔 (PLATFORM.md): the one platform operator signs in at /console/, makes clubs and issues their organisers.
// It sees each club as numbers and organiser names only, never members or answers.
// The server draws every page with the live stylesheet; there is no script, and the forms post back here.
import {
  ApiError, currentSeconds, equalDigest, isAdminId, isSixDigitPin, makeMemberCredential, randomHex, releaseAttempt,
  reserveAttempt, sql, temporaryPin
} from './auth.mjs';
import { issueOrganizer, organizerName, reissueOrganizer, retireOrganizer } from './organizers.mjs';
import { actionLabels, audit, auditTime, consoleActor } from './audit.mjs';
import { allClubs, findClub, scopeEnv, slugPattern } from './scope.mjs';

const encoder = new TextEncoder();
const sessionAge = 12 * 60 * 60;
// The same PBKDF2 budget as member PINs (Workers Free CPU limit); this password has 12 characters or more.
const iterations = 24000;
// Colons rather than '$' keep the value as written in worker/.dev.vars.
const secretPattern = /^pbkdf2-sha256:(\d{4,6}):([0-9a-f]{32}):([0-9a-f]{64})$/;
const bodyLimit = 4096;
const invalidLogin = '아이디나 비밀번호를 확인해 주세요.';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const clubAction = new RegExp(`^/console/clubs/([a-z0-9-]{1,64})/(organizers|status|log)(?:/(${uuid})/(reset|remove))?$`);
const plus = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

async function derive(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: rounds }, key, 256
  ));
}

// PLATFORM_ADMIN_PASSWORD_HASH. scripts/console-password.mjs makes it; the password itself is stored nowhere.
export async function consoleSecret(password, salt = randomHex(16)) {
  return `pbkdf2-sha256:${iterations}:${salt}:${await derive(password, salt, iterations)}`;
}

function settings(env) {
  const parsed = typeof env.PLATFORM_ADMIN_PASSWORD_HASH === 'string' ? secretPattern.exec(env.PLATFORM_ADMIN_PASSWORD_HASH) : null;
  if (!isAdminId(env.PLATFORM_ADMIN_ID) || !parsed || !env.DB) return null;
  return {
    id: env.PLATFORM_ADMIN_ID, secret: env.PLATFORM_ADMIN_PASSWORD_HASH,
    rounds: Number(parsed[1]), salt: parsed[2], hash: parsed[3]
  };
}

const cookieName = url => url.protocol === 'https:' ? '__Host-console' : 'console-dev';

function sessionCookie(url, token = '') {
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? sessionAge : 0}${
    url.protocol === 'https:' ? '; Secure' : ''}`;
}

function cookieToken(request, url) {
  const prefix = cookieName(url) + '=';
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix) && /^[0-9a-f]{64}$/.test(value.slice(prefix.length))) return value.slice(prefix.length);
  }
  return null;
}

const tokenHash = token => sha256('console-session\0' + token);
const credentialVersion = config => sha256('console-version\0' + config.id + '\0' + config.secret);

async function signedIn(request, env, url, config) {
  const token = cookieToken(request, url);
  if (!token) return false;
  const row = await sql(env.DB, 'SELECT credential_version FROM console_sessions WHERE token_hash = ? AND expires_at > ?',
    await tokenHash(token), currentSeconds()).first();
  return Boolean(row) && equalDigest(row.credential_version, await credentialVersion(config));
}

async function readForm(request, url) {
  if (request.headers.get('origin') !== url.origin) throw new ApiError(403, '이 화면에서 다시 시도해 주세요.');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    throw new ApiError(415, '요청 형식을 확인해 주세요.');
  }
  if (Number(request.headers.get('content-length')) > bodyLimit) throw new ApiError(413, '요청이 너무 커요.');
  let text = '';
  if (request.body) {
    const reader = request.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
      if (text.length > bodyLimit) {
        await reader.cancel();
        throw new ApiError(413, '요청이 너무 커요.');
      }
    }
  }
  return new URLSearchParams(text);
}

async function login(request, env, url, config, form) {
  const id = (form.get('id') ?? '').trim().slice(0, 64);
  const password = (form.get('password') ?? '').slice(0, 256);
  // One source may try 10 times and everyone together 20 times in 15 minutes, as with the club administrator PIN.
  const source = request.headers.get('CF-Connecting-IP') || 'local';
  const limits = [];
  for (const [kind, limit, value] of [['source', 10, source], ['all', 20, '']]) {
    const key = await sha256(`console-login-${kind}\0${config.secret}\0${value}`);
    limits.push({ key, expiresAt: await reserveAttempt(env, key, limit) });
  }
  const matches = equalDigest(await derive(password, config.salt, config.rounds), config.hash) && id === config.id;
  if (!matches) return { status: 401, id, error: invalidLogin };

  const token = randomHex(32);
  const now = currentSeconds();
  const previous = cookieToken(request, url);
  await env.DB.batch([
    sql(env.DB, 'INSERT INTO console_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)',
      await tokenHash(token), await credentialVersion(config), now + sessionAge),
    sql(env.DB, 'DELETE FROM console_sessions WHERE expires_at <= ?', now),
    ...(previous ? [sql(env.DB, 'DELETE FROM console_sessions WHERE token_hash = ?', await tokenHash(previous))] : []),
    ...limits.flatMap(({ key, expiresAt }) => releaseAttempt(env, key, expiresAt))
  ]);
  return { status: 303, location: new URL('/console/', url.origin).href, cookie: sessionCookie(url, token) };
}

async function logout(request, env, url) {
  const token = cookieToken(request, url);
  if (token) await sql(env.DB, 'DELETE FROM console_sessions WHERE token_hash = ?', await tokenHash(token)).run();
  return { status: 303, location: new URL('/console/', url.origin).href, cookie: sessionCookie(url) };
}

/* Clubs and organisers. */

function kstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function field(form, name, label, max, { required = true } = {}) {
  const value = (form.get(name) ?? '').trim().normalize('NFC');
  if ((required && !value) || value.length > max || value.includes('\0')) {
    throw new ApiError(400, `${label}을(를) ${required ? '' : '비우거나 '}${max}자 이내로 입력해 주세요.`);
  }
  return value;
}

async function scoped(env, legacy, slug) {
  const club = await findClub(env, slug);
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요.');
  const scope = await scopeEnv(club, legacy, env);
  if (!scope) throw new ApiError(503, '이 모임의 인증 비밀값을 확인해 주세요.');
  return { club, scope };
}

async function createClub(env, legacy, form) {
  const slug = (form.get('slug') ?? '').trim().toLowerCase();
  if (slug.length < 2 || slug.length > 40 || !slugPattern.test(slug)) {
    throw new ApiError(400, '모임 주소는 영문 소문자·숫자와 가운데 하이픈(-)으로 2~40자예요.');
  }
  const club = {
    slug, name: field(form, 'name', '모임 이름', 30),
    subtitle: field(form, 'subtitle', '부제', 60, { required: false }),
    schedule: field(form, 'schedule', '모임 요일', 20, { required: false }),
    defaultPlace: field(form, 'place', '기본 장소', 60, { required: false })
  };
  const organizer = field(form, 'organizer', '첫 운영진 성함', 60);
  if (legacy.has(slug) || await findClub(env, slug) !== null) throw new ApiError(409, '이미 쓰는 모임 주소예요. 다른 주소를 입력해 주세요.');
  const scope = await scopeEnv(club, legacy, env);
  if (!scope) throw new ApiError(503, '인증 비밀값(CLUB_AUTH_PEPPER)을 확인해 주세요.');
  const pin = temporaryPin();
  const { hash, salt, version } = await makeMemberCredential(scope, pin);
  const now = currentSeconds();
  const organizerId = crypto.randomUUID();
  try {
    await env.DB.batch([
      sql(env.DB, `INSERT INTO clubs (id, name, subtitle, schedule, default_place, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?)`, slug, club.name, club.subtitle, club.schedule, club.defaultPlace, now),
      // The first organiser is a member with the 운영 권한 (ROLES.md 1단계); a new club has no events to join yet.
      sql(env.DB, `INSERT INTO members (id, club_id, name, credential_salt, credential_hash, credential_version, must_change, organizer)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)`, organizerId, slug, organizer, salt, hash, version)
    ]);
  } catch (error) {
    if (await findClub(env, slug) === null) throw error;
    throw new ApiError(409, '이미 쓰는 모임 주소예요. 다른 주소를 입력해 주세요.');
  }
  await audit(env.DB, slug, consoleActor, 'club.create', slug, () => club.name);
  await audit(env.DB, slug, consoleActor, 'organizer.add', organizerId, () => organizer);
  return { title: '모임을 만들었어요', club, organizer, pin };
}

async function addOrganizer(env, legacy, slug, form) {
  const { club, scope } = await scoped(env, legacy, slug);
  const issued = await issueOrganizer(scope, organizerName(form.get('organizer')));
  await audit(env.DB, slug, consoleActor, 'organizer.add', issued.id, () => issued.name);
  return { title: '운영진 추가', club, organizer: issued.name, pin: issued.pin };
}

async function resetOrganizer(env, legacy, slug, id) {
  const { club, scope } = await scoped(env, legacy, slug);
  const issued = await reissueOrganizer(scope, id);
  await audit(env.DB, slug, consoleActor, 'organizer.reset', id, () => issued.name);
  return { title: '비밀번호 재설정', club, organizer: issued.name, pin: issued.pin };
}

async function removeOrganizer(env, legacy, slug, id) {
  const { scope } = await scoped(env, legacy, slug);
  const retired = await retireOrganizer(scope, id);
  await audit(env.DB, slug, consoleActor, 'organizer.remove', id, () => retired.name);
}

async function setStatus(env, slug, form) {
  const status = form.get('status');
  if (!['active', 'suspended'].includes(status)) throw new ApiError(400, '모임 상태를 확인해 주세요.');
  const result = await sql(env.DB, "UPDATE clubs SET status = ? WHERE id = ? AND name != ''", status, slug).run();
  if (!result.meta.changes) throw new ApiError(404, '모임을 찾을 수 없어요.');
  await audit(env.DB, slug, consoleActor, status === 'active' ? 'club.resume' : 'club.suspend', slug);
}

async function overview(env, legacy) {
  const today = kstToday();
  const [clubs, [numbers, organizers]] = await Promise.all([allClubs(env), env.DB.batch([
    sql(env.DB, `SELECT c.id,
      (SELECT COUNT(*) FROM members WHERE club_id = c.id AND active = 1) AS members,
      (SELECT MAX(date) FROM events WHERE club_id = c.id AND date <= ?) AS last_date,
      (SELECT MIN(date) FROM events WHERE club_id = c.id AND date > ?) AS next_date
      FROM clubs c`, today, today),
    sql(env.DB, 'SELECT id, club_id, name, active, must_change FROM members WHERE organizer = 1 ORDER BY name, id')
  ])]);
  const counts = new Map(numbers.results.map(row => [row.id, row]));
  return {
    today,
    clubs: await Promise.all(clubs.map(async club => {
      const scope = await scopeEnv(club, legacy, env);
      const rows = organizers.results.filter(row => row.club_id === club.slug);
      // An older club's first organiser may still be in Worker secrets until their first sign-in: the secrets count
      // only while no member has that name (auth.mjs legacyAdmin).
      const pending = scope && isAdminId(scope.CLUB_ADMIN_ID) && isSixDigitPin(scope.CLUB_ADMIN_PIN)
        && !await sql(env.DB, 'SELECT 1 FROM members WHERE club_id = ? AND name = ?', club.slug, scope.CLUB_ADMIN_ID).first()
        ? scope.CLUB_ADMIN_ID : null;
      return { ...club, ...counts.get(club.slug), ready: Boolean(scope), pending, organizers: rows.filter(row => row.active) };
    }))
  };
}

/* Pages. Markup follows the organiser screens (worker/public/views.mjs, DESIGN.md 5). */

function shortDate(value, today) {
  if (!value) return '없음';
  const [year, month, day] = value.split('-').map(Number);
  return `${year === Number(today.slice(0, 4)) ? '' : year + '년 '}${month}월 ${day}일`;
}

function pageHead(title, description, actions = '') {
  return `<header class="page-head"><div><h1>${title}</h1><div class="page-description">${description}</div></div>${
    actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
}

const postButton = (action, label, css = 'btn-secondary btn-small', fields = '') =>
  `<form method="post" action="${action}">${fields}<button type="submit" class="btn ${css}">${label}</button></form>`;

function confirmAction(summary, action, note, label, fields = '') {
  return `<details class="console-confirm"><summary class="btn btn-text btn-small">${summary}</summary>
    <div class="console-confirm-body"><p class="form-note">${note}</p>${postButton(action, label, 'btn-secondary btn-small', fields)}</div></details>`;
}

// 운영진 of one club as rows like the club's own 운영진 list (단순화 8): name and state on the left, the actions at the right.
function organizerRows(club) {
  const base = `/console/clubs/${escape(club.slug)}/organizers`;
  const rows = club.organizers.map(row => `<li><span><strong>${escape(row.name)}</strong>
      <small>${row.must_change ? '<span class="state-word state-due">자기 번호 정하기 전</span>' : '<span class="state-word state-quiet">사용 중</span>'}</small></span>
      <div class="name-actions">${postButton(`${base}/${row.id}/reset`, '번호 재발급', 'btn-text btn-small')}
        <a class="btn btn-text btn-small" href="${base}/${row.id}/remove">해지</a></div></li>`);
  if (club.pending) {
    rows.unshift(`<li><span><strong>${escape(club.pending)}</strong><small>기존 계정 · 처음 로그인하면 이 목록으로 옮겨져요</small></span></li>`);
  }
  return rows.length ? `<ul class="name-list" aria-label="운영진">${rows.join('')}</ul>` : '<p class="form-note">운영진이 없어요. 아래에서 추가해 주세요.</p>';
}

function clubPanel(club, today) {
  const heading = 'club-' + escape(club.slug);
  const suspended = club.status !== 'active';
  const problem = !club.ready ? '이 모임의 인증 비밀값이 비어 있거나 다른 모임과 겹쳐요.' : '';
  const [pill, word] = problem ? ['pill-warm', '설정 확인 필요'] : suspended ? ['', '쉬는 중'] : ['pill-green', '운영 중'];
  const items = [
    ['활동 회원', `${Number(club.members ?? 0)}명`],
    ['운영진', `${club.organizers.length + (club.pending ? 1 : 0)}명`],
    ['최근 일정', shortDate(club.last_date, today)],
    ['다음 일정', shortDate(club.next_date, today)]
  ];
  const status = `/console/clubs/${escape(club.slug)}/status`;
  return `<section class="panel" id="${heading}" aria-labelledby="${heading}-title">
      <header class="panel-head"><div><h2 id="${heading}-title">${escape(club.name)}</h2>
        <p><a class="console-address" href="/clubs/${escape(club.slug)}/">/clubs/${escape(club.slug)}/</a></p></div>
        <div class="panel-actions"><a class="btn btn-text btn-small" href="/console/clubs/${escape(club.slug)}/log">변경 기록</a><span class="pill ${pill}">${word}</span></div></header>
      <div class="panel-body">${problem ? `<p class="form-note">${problem}</p>` : ''}
        <dl class="summary-grid">${items.map(([label, value]) =>
          `<div class="summary-item"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        ${organizerRows(club)}
        <form class="form console-inline-form" method="post" action="/console/clubs/${escape(club.slug)}/organizers">
          <label class="form-field"><span>운영진 추가</span><input name="organizer" type="text" maxlength="60" autocomplete="off" placeholder="성함" required></label>
          <button type="submit" class="btn btn-secondary">임시 번호 발급</button>
        </form>
        <div class="console-club-status">${suspended
          ? postButton(status, '다시 열기', 'btn-secondary btn-small', '<input type="hidden" name="status" value="active">')
          : confirmAction('모임 정지', status, '회원과 운영진 화면이 "이 모임은 지금 쉬고 있어요"로 바뀌어요. 기록은 지우지 않고, 다시 열면 그대로예요.', '정지하기', '<input type="hidden" name="status" value="suspended">')}</div>
      </div>
    </section>`;
}

// 변경 기록: the newest 200 changes of one club, newest first.
async function logPage(env, slug) {
  const club = await findClub(env, slug);
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요.');
  const { results } = await sql(env.DB, `
    SELECT at, actor_name, action, summary FROM audit_log WHERE club_id = ? ORDER BY id DESC LIMIT 200
  `, slug).all();
  const rows = results.map(row => `<tr><td>${auditTime(row.at)}</td><td>${escape(row.actor_name)}</td>
      <td>${escape(actionLabels[row.action] ?? row.action)}</td><td>${escape(row.summary)}</td></tr>`).join('');
  return `<main id="main-content" class="console-page" tabindex="-1">
    ${pageHead(`${escape(club.name)} 변경 기록`, '운영진과 총괄이 바꾼 것을 최근 200건까지 보여요. 1년이 지나면 지워지고, 생년월일과 번호는 남기지 않아요.',
      `<a class="btn btn-secondary" href="/console/#club-${escape(slug)}">모임 목록으로</a>`)}
    <section class="panel"><div class="panel-body">${rows ? `<div class="data-table-wrap"><table class="data-table console-log">
      <thead><tr><th scope="col">시각</th><th scope="col">누가</th><th scope="col">무엇</th><th scope="col">내용</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="form-note">아직 기록이 없어요.</p>'}</div></section>
  </main>`;
}

// 해지 asks on its own page: a confirm step inside the table would push it sideways on a phone.
async function removePage(env, slug, id) {
  const row = await sql(env.DB, 'SELECT name FROM members WHERE id = ? AND club_id = ? AND active = 1 AND organizer = 1', id, slug).first();
  if (!row) throw new ApiError(404, '운영진을 찾을 수 없어요.');
  return `<main id="main-content" class="console-page" tabindex="-1">
    ${pageHead(`${escape(row.name)}님을 해지할까요?`, '운영 권한이 꺼지고 로그인이 바로 끊겨요. 회원으로는 남아 지금 번호로 다시 로그인해 투표할 수 있어요.')}
    <section class="panel"><div class="panel-body">
      <form method="post" action="/console/clubs/${escape(slug)}/organizers/${id}/remove">
        <div class="form-actions"><a class="btn btn-secondary" href="/console/#club-${escape(slug)}">취소</a><button type="submit" class="btn btn-primary">해지하기</button></div>
      </form>
    </div></section>
  </main>`;
}

function clubList({ today, clubs }) {
  return `<main id="main-content" class="console-page" tabindex="-1">
    ${pageHead('모임', '모임마다 숫자와 운영진을 보여요. 회원 이름과 응답은 각 모임의 변경 기록에 나와요.',
      `<a class="btn btn-primary btn-icon" href="/console/new" aria-label="새 모임" title="새 모임">${plus}</a>`)}
    ${clubs.length ? clubs.map(club => clubPanel(club, today)).join('\n    ') : '<p class="form-note">아직 모임이 없어요. + 버튼으로 첫 모임을 만들어 주세요.</p>'}
  </main>`;
}

function newClubForm(form = new URLSearchParams(), error = '') {
  const value = name => escape(form.get(name) ?? '');
  const input = (name, label, attrs, help = '', wide = false) => `<label class="form-field${wide ? ' form-field-full' : ''}"><span>${label}</span><input name="${name}" type="text" value="${value(name)}" ${attrs}>${help ? `<small class="form-note">${help}</small>` : ''}</label>`;
  return `<main id="main-content" class="console-page" tabindex="-1">
    ${pageHead('새 모임', '만들면 배포 없이 바로 주소가 열리고, 첫 운영진의 임시 번호가 한 번 보여요.')}
    <section class="panel"><div class="panel-body">
      <form class="form" method="post" action="/console/clubs">
        ${error ? `<p class="inline-error" role="alert">${escape(error)}</p>` : ''}
        <div class="form-grid">
          ${input('slug', '모임 주소', 'required maxlength="40" autocapitalize="off" spellcheck="false" pattern="[a-z0-9]+(-[a-z0-9]+)*" inputmode="url"', '/clubs/ 뒤에 붙는 영문 소문자·숫자·하이픈(-). 카톡 링크에 들어가니 만든 뒤에는 바꾸지 않아요.', true)}
          ${input('name', '모임 이름', 'required maxlength="30"')}
          ${input('subtitle', '부제 (선택)', 'maxlength="60"')}
          ${input('schedule', '모임 요일 (선택)', 'maxlength="20"')}
          ${input('place', '기본 장소 (선택)', 'maxlength="60"')}
          ${input('organizer', '첫 운영진 성함', 'required maxlength="60" autocomplete="off"', '이 이름과 임시 번호로 운영 화면에 처음 들어가요.', true)}
        </div>
        <div class="form-actions"><a class="btn btn-secondary" href="/console/">취소</a><button type="submit" class="btn btn-primary">모임 만들기</button></div>
      </form>
    </div></section>
  </main>`;
}

function issuedPage(url, { title, club, organizer, pin }) {
  const admin = `${url.origin}/clubs/${club.slug}/admin/`;
  const message = `[콕콕콕!] ${club.name} 운영진 로그인\n주소: ${admin}\n성함: ${organizer}\n임시 번호: ${pin}\n처음 로그인하면 나만 아는 번호 6자리로 바꿔 주세요.`;
  return `<main id="main-content" class="console-page" tabindex="-1">
    ${pageHead(title, '임시 번호는 이 화면에서만 보여요. 닫기 전에 운영진에게 개인 메시지로 보내 주세요.')}
    <section class="panel" aria-labelledby="issued-title">
      <header class="panel-head"><div><h2 id="issued-title">${escape(club.name)}</h2>
        <p><a href="/clubs/${escape(club.slug)}/admin/">/clubs/${escape(club.slug)}/admin/</a></p></div></header>
      <div class="panel-body">
        <dl class="summary-grid console-issued"><div class="summary-item"><dt>운영진</dt><dd>${escape(organizer)}</dd></div>
          <div class="summary-item"><dt>임시 번호</dt><dd>${pin}</dd></div></dl>
        <label class="form-field form-field-full"><span>보낼 문구</span><textarea class="copy-text" rows="5" readonly>${escape(message)}</textarea></label>
        <p class="form-note">받은 사람이 이 번호로 처음 로그인하면 운영 화면보다 먼저 번호 바꾸기가 열려요.</p>
        <div class="form-actions"><a class="btn btn-primary" href="/console/#club-${escape(club.slug)}">모임 목록으로</a></div>
      </div>
    </section>
  </main>`;
}

function loginForm(id = '', error = '') {
  const invalid = error ? ' aria-invalid="true" aria-describedby="console-error"' : '';
  return `<main id="main-content" class="login-page" tabindex="-1"><div class="login-stack">
    <div class="hero"><p class="tagline">console</p><h1>콕콕콕! 총괄</h1><div class="hero-meta"><span>모임 발급과 운영 현황</span></div></div>
    <form class="form login-form login-card console-login" method="post" action="/console/login" aria-label="총괄 로그인">
      <div class="login-field"><div class="login-label-row"><label for="console-id">아이디</label></div>
        <input id="console-id" name="id" type="text" value="${escape(id)}" autocomplete="username" autocapitalize="off"
          spellcheck="false" maxlength="64" required${id ? '' : ' autofocus'}></div>
      <div class="login-field"><div class="login-label-row"><label for="console-password">비밀번호</label></div>
        <input id="console-password" name="password" type="password" autocomplete="current-password" maxlength="256"
          required${id ? ' autofocus' : ''}${invalid}>
        ${error ? `<p id="console-error" class="inline-error" role="alert">${escape(error)}</p>` : ''}</div>
      <button type="submit" class="btn btn-primary login-submit">로그인</button>
    </form>
  </div></main>`;
}

function notice(title, body, link = '') {
  return `<main id="main-content" class="public-share-page" tabindex="-1"><div class="public-share-card"><h1>${escape(title)}</h1>
    <p class="public-share-body">${escape(body)}</p>${link}</div></main>`;
}

function page(style, main, signedInNow = false) {
  const account = signedInNow ? `<form method="post" action="/console/logout"><button type="submit" class="btn btn-text btn-small">로그아웃</button></form>` : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f2ec">
  <meta name="robots" content="noindex, nofollow">
  <title>총괄 · 콕콕콕!</title>
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/shuttlecock-icon-96.png">
  <link rel="stylesheet" href="${escape(style)}">
</head>
<body>
  <a class="skip-link" href="#main-content">본문 바로가기</a>
  <header class="site-header">
    <div class="header-inner">
      <nav class="club-navigation" aria-label="서비스">
        <a href="/console/" class="brand" aria-label="총괄 콘솔 첫 화면">
          <img class="brand-mark" src="/assets/shuttlecock-icon-96.png" width="42" height="42" alt="">
        </a>
        <a class="current-club" href="/console/"><strong>총괄</strong><small>콕콕콕!</small></a>
      </nav>
      <div id="account">${account}</div>
    </div>
  </header>
  <div id="main" class="main">${main}</div>
</body>
</html>`;
}

// The versioned live stylesheet of this release, as the club page (one shell since ROLES.md 2단계) references it.
async function stylesheet(env, url) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
  if (!shell.ok) return null;
  return (await shell.text()).match(/href="(\/club-ui\/[a-f0-9]{20}\/live\.css)"/)?.[1] ?? null;
}

const back = '<div class="form-actions message-actions"><a class="btn btn-secondary" href="/console/">모임 목록으로</a></div>';

// Returns { status, html, allow? } or a redirect { status, location, cookie? }; worker/index.mjs adds the headers.
// legacy: clubs from before the console and their secret names (scope.mjs).
export async function consolePage(request, env, url, legacy) {
  const path = url.pathname;
  if (path === '/console') return { status: 308, location: new URL('/console/', url.origin).href };
  const action = clubAction.exec(path);
  const route = { '/console/': 'home', '/console/new': 'new', '/console/login': 'login', '/console/logout': 'logout',
    '/console/clubs': 'create' }[path] ?? (action ? 'club' : null);
  const style = await stylesheet(env, url);
  if (!style) {
    return { status: 503, html: '<!doctype html><html lang="ko"><meta charset="utf-8"><title>총괄 · 콕콕콕!</title><p>화면을 불러올 수 없어요.</p></html>' };
  }
  if (!route) return { status: 404, html: page(style, notice('페이지를 찾을 수 없어요', '주소를 확인해 주세요.')) };
  const reads = route === 'home' || route === 'new'
    || (route === 'club' && (action[2] === 'log' || (action[4] === 'remove' && request.method !== 'POST')));
  const reading = request.method === 'GET' || request.method === 'HEAD';
  if (reads ? !reading : request.method !== 'POST') {
    return { status: 405, allow: reads ? 'GET, HEAD' : 'POST', html: page(style, notice('지원하지 않는 요청이에요', '총괄 화면에서 다시 시도해 주세요.')) };
  }
  const config = settings(env);
  if (!config) return { status: 503, html: page(style, notice('총괄 로그인을 준비 중이에요', '설정이 끝나면 이 주소에서 로그인할 수 있어요.')) };
  let form = null;
  try {
    if (!reads) form = await readForm(request, url);
    if (route === 'login') {
      const result = await login(request, env, url, config, form);
      return result.location ? result : { status: result.status, html: page(style, loginForm(result.id, result.error)) };
    }
    if (route === 'logout') return await logout(request, env, url);
    if (!await signedIn(request, env, url, config)) return { status: reads ? 200 : 401, html: page(style, loginForm()) };
    if (route === 'home') return { status: 200, html: page(style, clubList(await overview(env, legacy)), true) };
    if (route === 'new') return { status: 200, html: page(style, newClubForm(), true) };
    if (route === 'club' && reads) {
      return { status: 200, html: page(style, action[2] === 'log' ? await logPage(env, action[1]) : await removePage(env, action[1], action[3]), true) };
    }
    if (route === 'create') return { status: 201, html: page(style, issuedPage(url, await createClub(env, legacy, form)), true) };
    const [, slug, kind, organizerId, verb] = action;
    if (kind === 'status') await setStatus(env, slug, form);
    else if (!organizerId) return { status: 201, html: page(style, issuedPage(url, await addOrganizer(env, legacy, slug, form)), true) };
    else if (verb === 'reset') return { status: 200, html: page(style, issuedPage(url, await resetOrganizer(env, legacy, slug, organizerId)), true) };
    else await removeOrganizer(env, legacy, slug, organizerId);
    return { status: 303, location: new URL(`/console/#club-${slug}`, url.origin).href };
  } catch (error) {
    // Never print request bodies or credentials; ApiError messages are written for the operator.
    const known = error instanceof ApiError;
    const message = known ? error.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
    const status = known ? error.status : 500;
    if (route === 'login') return { status, html: page(style, loginForm('', message)) };
    if (route === 'create' && known && form) return { status, html: page(style, newClubForm(form, message), true) };
    return { status, html: page(style, notice('처리하지 못했어요', message, back), route !== 'logout') };
  }
}
