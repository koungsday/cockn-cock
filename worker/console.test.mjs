import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { consoleSecret } from './console.mjs';
import { createWorker } from './index.mjs';

const migrationFolder = new URL('./migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationFolder)).filter(file => file.endsWith('.sql')).sort()
  .map(file => readFile(new URL(file, migrationFolder), 'utf8')));
const origin = 'https://clubs.test';
const style = '/club-ui/0123456789abcdef0123/live.css';
const password = 'fixture-console-password';
// Clubs from before the console: they keep their own secrets (platform/clubs.mjs). Clubs made in the console have none.
const clubs = ['first', 'second'].map((key, index) => ({
  slug: key + '-club', name: `가상 ${['첫', '둘째'][index]} 모임`, subtitle: '운동', schedule: '일요일',
  adminIdBinding: key.toUpperCase() + '_ID', adminPinBinding: key.toUpperCase() + '_ADMIN', authPepperBinding: key.toUpperCase() + '_PEPPER'
}));
const day = offset => new Date(Date.now() + (9 + offset * 24) * 60 * 60 * 1000).toISOString().slice(0, 10);

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
  const club = sqlite.prepare('INSERT INTO clubs (id, name, subtitle, schedule) VALUES (?, ?, ?, ?)');
  for (const { slug, name, subtitle, schedule } of clubs) club.run(slug, name, subtitle, schedule);
  const member = (id, club, name, active) => sqlite.prepare(`INSERT INTO members (id, club_id, name, active, credential_salt, credential_hash, credential_version)
    VALUES (?, ?, ?, ?, 's', 'h', 'v')`).run(id, club, name, active);
  member('m1', 'first-club', '가상 회원 하나', 1);
  member('m2', 'first-club', '가상 회원 둘', 1);
  member('m3', 'first-club', '가상 쉬는 회원', 0);
  member('m4', 'second-club', '가상 다른 모임 회원', 1);
  const event = (id, club, date) => sqlite.prepare(`INSERT INTO events (id, club_id, title, date, time, end_time, place, deadline, deadline_at, early_time, late_time)
    VALUES (?, ?, '가상 회차', ?, '10:00', '13:00', '가상 체육관', ? || 'T09:00', 0, '09:30', '09:50')`).run(id, club, date, date);
  event('e1', 'first-club', day(-7));
  event('e2', 'first-club', day(3));
  t.after(() => sqlite.close());
  return {
    sqlite,
    prepare(query) {
      const statement = sqlite.prepare(query);
      function bind(...args) {
        return {
          bind,
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          run: async () => statement.columns().length
            ? { results: statement.all(...args), meta: { changes: 0 } }
            : { results: [], meta: { changes: statement.run(...args).changes } }
        };
      }
      return bind();
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

async function setup(t) {
  const worker = createWorker(clubs);
  const env = {
    DB: database(t),
    FIRST_ID: 'fixture-first-admin', FIRST_ADMIN: '548617', FIRST_PEPPER: 'first-club-test-only-pepper-value',
    SECOND_ID: 'fixture-second-admin', SECOND_ADMIN: '275419', SECOND_PEPPER: 'second-club-test-only-pepper-value',
    // Clubs made in the console derive their pepper from this one (worker/scope.mjs).
    CLUB_AUTH_PEPPER: 'root-test-only-pepper-for-console-clubs',
    PLATFORM_ADMIN_ID: 'console-fixture',
    PLATFORM_ADMIN_PASSWORD_HASH: await consoleSecret(password),
    ASSETS: {
      async fetch(request) {
        if (!['/index.html', '/admin-shell.html'].includes(new URL(request.url).pathname)) return new Response(null, { status: 404 });
        return new Response(`<html><head><title>원본</title><link rel="stylesheet" href="${style}"><!-- club-context --><!-- share-meta --><!-- admin-app --></head><body></body></html>`, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
  };
  function receive(path, { method = 'GET', form, cookie, requestOrigin = origin, ip = '203.0.113.40', json } = {}) {
    const headers = new Headers({ 'CF-Connecting-IP': ip });
    if (cookie) headers.set('Cookie', cookie);
    let body;
    if (form) {
      headers.set('Origin', requestOrigin);
      headers.set('Content-Type', 'application/x-www-form-urlencoded');
      body = new URLSearchParams(form).toString();
    }
    if (json) {
      headers.set('Origin', requestOrigin);
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(json);
    }
    return worker.fetch(new Request(origin + path, { method, headers, body }), env);
  }
  const signIn = (form, options = {}) => receive('/console/login', { method: 'POST', form, ...options });
  return { env, receive, signIn };
}

const cookieOf = response => response.headers.get('Set-Cookie')?.split(';')[0];
const clubPanels = html => Object.fromEntries(html.split('<section class="panel" id="club-').slice(1).map(part => [part.slice(0, part.indexOf('"')), part]));
const issuedPin = html => html.match(/<dt>임시 번호<\/dt><dd>(\d{6})<\/dd>/)?.[1];

test('the console asks for its own login, is never cached or indexed, and the home links its login', async t => {
  const { env, receive } = await setup(t);
  const bare = await receive('/console');
  assert.equal(bare.status, 308);
  assert.equal(bare.headers.get('Location'), origin + '/console/');

  const page = await receive('/console/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  // A form post from a no-referrer page carries Origin: null, which the Origin check would refuse (seen in Chromium).
  assert.equal(page.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal(page.headers.get('Set-Cookie'), null);
  const html = await page.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert(html.includes(`<link rel="stylesheet" href="${style}">`), 'the release stylesheet');
  assert.match(html, /<form class="form login-form login-card console-login" method="post" action="\/console\/login"/);
  assert.match(html, /name="id"[^>]*autocomplete="username"/);
  assert.match(html, /name="password" type="password" autocomplete="current-password"/);
  assert.doesNotMatch(html, /가상|first-club|<script/);
  assert.equal((await receive('/console/other')).status, 404);
  assert.equal((await receive('/console/', { method: 'POST', form: {} })).status, 405);
  assert.equal((await receive('/console/login')).status, 405);
  // The live home's 로그인 section links it (user decision, 2026-11-26); the page itself stays out of search.
  assert.match(await (await receive('/')).text(), /<a href="\/console\/">총괄 관리자 로그인<\/a>/);

  delete env.PLATFORM_ADMIN_PASSWORD_HASH;
  const unset = await receive('/console/');
  assert.equal(unset.status, 503);
  assert.match(await unset.text(), /총괄 로그인을 준비 중이에요/);
});

test('only the configured ID and password open the club numbers, from this page only', async t => {
  const { env, receive, signIn } = await setup(t);
  assert.equal((await signIn({ id: 'console-fixture', password }, { requestOrigin: 'https://elsewhere.test' })).status, 403);
  for (const form of [{ id: 'console-fixture', password: password + 'x' }, { id: 'someone-else', password }]) {
    const wrong = await signIn(form);
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('Set-Cookie'), null);
    const html = await wrong.text();
    assert.match(html, /아이디나 비밀번호를 확인해 주세요/);
    assert(html.includes(`value="${form.id}"`), 'the ID stays in the field');
  }

  const signedIn = await signIn({ id: 'console-fixture', password });
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('Location'), origin + '/console/');
  assert.match(signedIn.headers.get('Set-Cookie'), /^__Host-console=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
  const cookie = cookieOf(signedIn);
  assert.deepEqual(env.DB.sqlite.prepare('SELECT count FROM attempts').all().map(row => row.count), [2, 2],
    'per place and in total, the two failures still count after the success');

  const list = await receive('/console/', { cookie });
  assert.equal(list.status, 200);
  const html = await list.text();
  const panels = clubPanels(html);
  // The migrations add 썬콕19 too (0003, 0005); the fixtures add two older clubs.
  assert.deepEqual(Object.keys(panels), ['first-club', 'second-club', 'suncok19']);
  assert.match(panels['first-club'], /운영 중/);
  assert.match(panels['first-club'], /<dt>활동 회원<\/dt><dd>2명<\/dd>/);
  // Before its first sign-in, the organiser in Worker secrets is listed as the club's existing account.
  assert.match(panels['first-club'], /<dt>운영진<\/dt><dd>1명<\/dd>/);
  assert.match(panels['first-club'], /fixture-first-admin<\/td><td><span class="pill">기존 계정/);
  assert.doesNotMatch(panels['first-club'], /<dt>최근 회차<\/dt><dd>없음/);
  assert.doesNotMatch(panels['first-club'], /<dt>다음 회차<\/dt><dd>없음/);
  assert.match(panels['second-club'], /<dt>활동 회원<\/dt><dd>1명<\/dd>/);
  assert.match(panels['second-club'], /<dt>다음 회차<\/dt><dd>없음<\/dd>/);
  assert.doesNotMatch(html, /가상 회원|가상 쉬는 회원|가상 다른 모임 회원/, 'no member names');
  assert.match(html, /<form method="post" action="\/console\/logout">/);
  assert.match(html, /<a class="btn btn-primary btn-icon" href="\/console\/new" aria-label="새 모임" title="새 모임">/);

  // A club secret that is missing shows up here instead of silently failing for that club's organisers.
  delete env.SECOND_PEPPER;
  const missing = clubPanels(await (await receive('/console/', { cookie })).text());
  assert.match(missing['second-club'], /설정 확인 필요[\s\S]*인증 비밀값이 비어 있거나/);
});

test('console and club sessions never open each other', async t => {
  const { env, receive, signIn } = await setup(t);
  const clubLogin = await receive('/clubs/first-club/api/login', { method: 'POST', json: { name: env.FIRST_ID, credential: env.FIRST_ADMIN } });
  assert.equal(clubLogin.status, 200);
  const clubCookie = cookieOf(clubLogin);
  const consolePage = await (await receive('/console/', { cookie: clubCookie })).text();
  assert.match(consolePage, /console-login/, 'a club organiser sees the console login');

  const consoleCookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  const token = consoleCookie.split('=')[1];
  assert.equal((await receive('/clubs/first-club/api/admin', { cookie: consoleCookie })).status, 401);
  assert.equal((await receive('/clubs/first-club/api/admin', { cookie: '__Host-first-club-admin=' + token })).status, 401);
});

test('a new password signs every console session out, and logout ends this one', async t => {
  const { env, receive, signIn } = await setup(t);
  const first = cookieOf(await signIn({ id: 'console-fixture', password }));
  assert.match(await (await receive('/console/', { cookie: first })).text(), /class="console-page"/);

  env.PLATFORM_ADMIN_PASSWORD_HASH = await consoleSecret(password);
  assert.match(await (await receive('/console/', { cookie: first })).text(), /console-login/, 'same password, new value: signed out');

  const second = cookieOf(await signIn({ id: 'console-fixture', password }));
  assert.equal((await receive('/console/logout', { method: 'POST', form: {}, cookie: second, requestOrigin: 'https://elsewhere.test' })).status, 403);
  const out = await receive('/console/logout', { method: 'POST', form: {}, cookie: second });
  assert.equal(out.status, 303);
  assert.match(out.headers.get('Set-Cookie'), /^__Host-console=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0; Secure$/);
  assert.match(await (await receive('/console/', { cookie: second })).text(), /console-login/);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM console_sessions WHERE expires_at > unixepoch()').get().count, 1,
    'only the session from before the password change is left, and it no longer matches');
});

test('ten wrong passwords from one place lock it for 15 minutes, even with the right one', async t => {
  const { signIn } = await setup(t);
  for (let attempt = 1; attempt <= 10; attempt++) {
    assert.equal((await signIn({ id: 'console-fixture', password: 'wrong-password-' + attempt })).status, 401);
  }
  const locked = await signIn({ id: 'console-fixture', password });
  assert.equal(locked.status, 429);
  assert.match(await locked.text(), /15분 뒤에 다시 시도해 주세요/);
  assert.equal((await signIn({ id: 'console-fixture', password }, { ip: '198.51.100.7' })).status, 303, 'another place still can');
});

test('twenty wrong passwords from anywhere lock the console for everyone for 15 minutes', async t => {
  const { signIn } = await setup(t);
  for (let place = 1; place <= 20; place++) {
    assert.equal((await signIn({ id: 'console-fixture', password: 'wrong-password' }, { ip: `198.51.100.${place}` })).status, 401);
  }
  // The trade-off (PLATFORM.md 인증): spread-out guessing stops, and so does the right password from a new place.
  assert.equal((await signIn({ id: 'console-fixture', password }, { ip: '203.0.113.99' })).status, 429);
});

test('the old workers.dev address cannot take a console login: its pages all move, so no form there can pass the Origin check', async t => {
  const { env, receive } = await setup(t);
  env.CLUB_LEGACY_ORIGIN = origin;
  env.CLUB_PUBLIC_ORIGIN = 'https://club-example.pages.dev';
  const moved = await receive('/console/');
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get('Location'), 'https://club-example.pages.dev/console/');
  const fromElsewhere = await receive('/console/login', { method: 'POST', form: { id: 'console-fixture', password }, requestOrigin: env.CLUB_PUBLIC_ORIGIN });
  assert.equal(fromElsewhere.status, 403);
  assert.equal(fromElsewhere.headers.get('Set-Cookie'), null);
});

test('the console makes a club that opens at once, and its first organiser sets their own PIN first', async t => {
  const { receive, signIn } = await setup(t);
  const cookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  const blank = await receive('/console/new', { cookie });
  assert.equal(blank.status, 200);
  assert.match(await blank.text(), /<form class="form" method="post" action="\/console\/clubs">/);
  assert.match(await (await receive('/console/new')).text(), /console-login/, 'the form needs the console login');

  const club = { slug: 'new-club', name: '가상 새 모임', subtitle: '', schedule: '토요일', place: '가상 체육관', organizer: '가상 운영진' };
  assert.equal((await receive('/console/clubs', { method: 'POST', form: club })).status, 401, 'not signed in');
  assert.equal((await receive('/console/clubs', { method: 'POST', form: club, cookie, requestOrigin: 'https://elsewhere.test' })).status, 403);
  const made = await receive('/console/clubs', { method: 'POST', form: club, cookie });
  assert.equal(made.status, 201);
  const page = await made.text();
  const pin = issuedPin(page);
  assert.match(pin, /^\d{6}$/);
  assert(page.includes(`임시 번호: ${pin}`) && page.includes(`${origin}/clubs/new-club/admin/`), 'a message to send');

  for (const [form, status, text] of [
    [club, 409, '이미 쓰는 모임 주소예요'],
    [{ ...club, slug: 'first-club' }, 409, '이미 쓰는 모임 주소예요'],
    [{ ...club, slug: 'Bad Slug' }, 400, '모임 주소는 영문 소문자'],
    [{ ...club, slug: 'other-club', name: '' }, 400, '모임 이름'],
  ]) {
    const refused = await receive('/console/clubs', { method: 'POST', form, cookie });
    assert.equal(refused.status, status, form.slug);
    const html = await refused.text();
    assert(html.includes(text) && html.includes(`value="${form.organizer}"`), 'the form comes back with what was typed');
  }

  const clubPage = await receive('/clubs/new-club/');
  assert.equal(clubPage.status, 200);
  assert.match(await clubPage.text(), /<meta name="club-name" content="가상 새 모임">/);
  const api = (path, options = {}) => receive('/clubs/new-club/api' + path, options);
  const first = await api('/login', { method: 'POST', json: { name: '가상 운영진', credential: pin } });
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).user.mustChange, true);
  const temporary = cookieOf(first);
  const blocked = await api('/admin', { cookie: temporary });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /임시 번호를 내 번호로/);
  assert.equal((await api('/admin/pin', { method: 'POST', cookie: temporary, json: { currentPin: '000000', newPin: '615293' } })).status, 400);
  const changed = await api('/admin/pin', { method: 'POST', cookie: temporary, json: { currentPin: pin, newPin: '615293' } });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).user.mustChange, false);
  const own = cookieOf(changed);
  assert.equal((await api('/admin', { cookie: own })).status, 200);
  assert.equal((await api('/admin/session', { cookie: temporary })).status, 200);
  assert.equal((await (await api('/admin/session', { cookie: temporary })).json()).user, null, 'the temporary session ended');
  assert.equal((await api('/login', { method: 'POST', json: { name: '가상 운영진', credential: pin }, ip: '198.51.100.30' })).status, 401);

  const listed = clubPanels(await (await receive('/console/', { cookie })).text());
  assert.match(listed['new-club'], /가상 운영진<\/td>[\s\S]*사용 중/);
  assert.match(listed['new-club'], /<dt>운영진<\/dt><dd>1명<\/dd>/);
});

test('reissue, removal and a pause take effect at once', async t => {
  const { receive, signIn } = await setup(t);
  const cookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  const club = { slug: 'paused-club', name: '가상 쉬는 모임', subtitle: '', schedule: '', place: '', organizer: '가상 첫 운영진' };
  const pin = issuedPin(await (await receive('/console/clubs', { method: 'POST', form: club, cookie })).text());
  const api = (path, options = {}) => receive('/clubs/paused-club/api' + path, options);
  const own = cookieOf(await api('/admin/pin', { method: 'POST', json: { currentPin: pin, newPin: '615293' },
    cookie: cookieOf(await api('/login', { method: 'POST', json: { name: club.organizer, credential: pin } })) }));
  const id = (await (await api('/admin/session', { cookie: own })).json()).user.id;

  const reissued = await receive(`/console/clubs/paused-club/organizers/${id}/reset`, { method: 'POST', form: {}, cookie });
  assert.equal(reissued.status, 200);
  const again = issuedPin(await reissued.text());
  assert.equal((await (await api('/admin/session', { cookie: own })).json()).user, null, 'reissuing ends their sessions');
  assert.equal((await (await api('/login', { method: 'POST', json: { name: club.organizer, credential: again } })).json()).user.mustChange, true);

  const added = await receive('/console/clubs/paused-club/organizers', { method: 'POST', form: { organizer: '가상 둘째 운영진' }, cookie });
  assert.equal(added.status, 201);
  const second = issuedPin(await added.text());
  assert.equal((await receive('/console/clubs/paused-club/organizers', { method: 'POST', form: { organizer: '가상 둘째 운영진' }, cookie })).status, 409);
  const secondLogin = await api('/login', { method: 'POST', json: { name: '가상 둘째 운영진', credential: second } });
  const secondId = (await secondLogin.json()).user.id;
  const asked = await receive(`/console/clubs/paused-club/organizers/${secondId}/remove`, { cookie });
  assert.equal(asked.status, 200);
  assert.match(await asked.text(), /가상 둘째 운영진님을 해지할까요\?[\s\S]*<form method="post" action="\/console\/clubs\/paused-club\/organizers\/[0-9a-f-]+\/remove">/);
  assert.equal((await (await api('/admin/session', { cookie: cookieOf(secondLogin) })).json()).user.id, secondId, 'asking removes nothing');
  const removed = await receive(`/console/clubs/paused-club/organizers/${secondId}/remove`, { method: 'POST', form: {}, cookie });
  assert.equal(removed.status, 303);
  assert.equal(removed.headers.get('Location'), origin + '/console/#club-paused-club');
  assert.equal((await (await api('/admin/session', { cookie: cookieOf(secondLogin) })).json()).user, null);
  assert.equal((await api('/login', { method: 'POST', json: { name: '가상 둘째 운영진', credential: second }, ip: '198.51.100.31' })).status, 401);
  assert.equal((await receive(`/console/clubs/paused-club/organizers/${secondId}/remove`, { method: 'POST', form: {} })).status, 401);

  assert.equal((await receive('/console/clubs/paused-club/status', { method: 'POST', form: { status: 'suspended' }, cookie })).status, 303);
  const pausedPage = await receive('/clubs/paused-club/');
  assert.equal(pausedPage.status, 403);
  assert.match(await pausedPage.text(), /이 모임은 지금 쉬고 있어요/);
  assert.equal((await api('/session')).status, 403);
  assert.match(clubPanels(await (await receive('/console/', { cookie })).text())['paused-club'], /쉬는 중[\s\S]*다시 열기/);
  assert.equal((await receive('/console/clubs/paused-club/status', { method: 'POST', form: { status: 'active' }, cookie })).status, 303);
  assert.equal((await receive('/clubs/paused-club/')).status, 200);
});

test('/go opens a club from its address, and only an open one', async t => {
  const { env, receive, signIn } = await setup(t);
  const pasted = encodeURIComponent('https://cockcockcock.pages.dev/clubs/first-club/vote/00000000-0000-4000-8000-000000000000');
  for (const path of ['/go?club=first-club', '/go?club=%20First-Club%20', '/go/first-club', '/go?club=clubs/first-club/',
    `/go?club=${pasted}`, '/go?club=cockcockcock.pages.dev%2Fclubs%2Ffirst-club%2Fadmin%2F']) {
    const moved = await receive(path);
    assert.equal(moved.status, 303, path);
    assert.equal(moved.headers.get('Location'), origin + '/clubs/first-club/', path);
  }
  for (const path of ['/go?club=nobody', '/go?club=', '/go?club=../first-club', '/go/%E0%A4%A']) {
    const missing = await receive(path);
    assert.equal(missing.status, 404, path);
    assert.match(await missing.text(), /모임 주소를 찾을 수 없어요/);
  }
  assert.equal((await receive('/go', { method: 'POST', form: {} })).status, 405);
  const cookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  await receive('/console/clubs/second-club/status', { method: 'POST', form: { status: 'suspended' }, cookie });
  const paused = await receive('/go?club=second-club');
  assert.equal(paused.status, 403, 'a paused club is not opened');
  assert.match(await paused.text(), /이 모임은 지금 쉬고 있어요/, 'the same words as the club page');
  assert.equal(env.DB.sqlite.prepare("SELECT status FROM clubs WHERE id = 'second-club'").get().status, 'suspended');
});

test('changes are recorded per club with who and what, never birthdays or PINs, and a failed record never blocks a save', async t => {
  const { env, receive, signIn } = await setup(t);
  const cookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  const club = { slug: 'log-club', name: '가상 기록 모임', subtitle: '', schedule: '', place: '', organizer: '가상 기록 운영진' };
  const pin = issuedPin(await (await receive('/console/clubs', { method: 'POST', form: club, cookie })).text());
  const api = (path, options = {}) => receive('/clubs/log-club/api' + path, options);
  const temporary = cookieOf(await api('/login', { method: 'POST', json: { name: club.organizer, credential: pin } }));
  const own = cookieOf(await api('/admin/pin', { method: 'POST', cookie: temporary, json: { currentPin: pin, newPin: '615293' } }));
  const as = (path, method, json) => api(path, { method, json, cookie: own });

  const { member } = await (await as('/admin/members', 'POST', { name: '가상 기록 회원', birthday: '19900517' })).json();
  const date = new Date(Date.now() + (9 + 3 * 24) * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { event } = await (await as('/admin/events', 'POST', {
    title: '가상 기록 회차', date, time: '10:00', endTime: '13:00', place: '가상 체육관',
    deadline: date + 'T09:00', earlyTime: '09:30', lateTime: '09:50', published: false, open: false
  })).json();
  assert.equal((await as(`/admin/events/${event.id}`, 'PATCH', { published: true, open: true, place: '가상 둘째 체육관' })).status, 200);
  assert.equal((await as(`/admin/events/${event.id}/votes/${member.id}`, 'PUT', { slot: 'early', lunch: true })).status, 200);
  assert.equal((await as(`/admin/events/${event.id}/attendance/${member.id}`, 'PUT', { present: true, recognition: 'direct' })).status, 200);
  assert.equal((await as(`/admin/events/${event.id}/guests`, 'POST', { name: '가상 기록 게스트', status: 'arrived', paid: true })).status, 201);
  assert.equal((await as(`/admin/events/${event.id}/settlement`, 'PUT', { priorSingles: 1, priorTubes: 0, remainingSingles: 0, courtDonation: 0, confirmed: false })).status, 200);
  assert.equal((await as('/admin/notices', 'POST', { title: '가상 기록 공지', body: '본문', published: true })).status, 201);
  assert.equal((await as('/admin/progress', 'PUT', { year: 2026, half: 2, memberId: member.id, rewarded: true })).status, 200);
  const reset = await (await as(`/admin/members/${member.id}/reset`, 'POST', {})).json();
  assert.equal((await as(`/admin/members/${member.id}`, 'PATCH', { active: false })).status, 200);
  await receive('/console/clubs/log-club/status', { method: 'POST', form: { status: 'suspended' }, cookie });
  await receive('/console/clubs/log-club/status', { method: 'POST', form: { status: 'active' }, cookie });

  const log = await receive('/console/clubs/log-club/log', { cookie });
  assert.equal(log.status, 200);
  const html = await log.text();
  const rows = [...html.matchAll(/<tr><td>[^<]+<\/td><td>([^<]+)<\/td>\s*<td>([^<]+)<\/td><td>([^<]*)<\/td><\/tr>/g)].map(([, who, what, summary]) => [who, what, summary]);
  assert.deepEqual(rows.map(([who, what]) => `${who}: ${what}`), [
    '총괄: 모임 다시 열기', '총괄: 모임 정지',
    '가상 기록 운영진: 회원 수정', '가상 기록 운영진: 회원 접속 재설정', '가상 기록 운영진: 콕 수령 기록', '가상 기록 운영진: 공지 작성',
    '가상 기록 운영진: 마무리', '가상 기록 운영진: 게스트 추가', '가상 기록 운영진: 출석 기록', '가상 기록 운영진: 대신 응답',
    '가상 기록 운영진: 회차 수정', '가상 기록 운영진: 회차 만들기', '가상 기록 운영진: 회원 등록',
    '가상 기록 운영진: 운영진 번호 변경', '총괄: 운영진 추가', '총괄: 모임 만들기',
  ]);
  const summary = what => rows.find(row => row[1] === what)[2];
  assert.match(summary('회차 수정'), /가상 기록 회차 · 장소, 공개, 투표 열기$/);
  assert.match(summary('대신 응답'), /가상 기록 회원 · 선발, 점심$/);
  assert.match(summary('출석 기록'), /가상 기록 회원 · 출석 \(직접 인정\)$/);
  assert.match(summary('회원 수정'), /^가상 기록 회원 · 활동 중지$/);
  for (const secret of ['19900517', '900517', pin, '615293', reset.temporaryPin]) assert(!html.includes(secret), 'no birthday or PIN in the log');
  assert.equal((await receive('/console/clubs/log-club/log', { method: 'POST', form: {}, cookie })).status, 405);
  assert.match(await (await receive('/console/clubs/log-club/log')).text(), /console-login/, 'the log needs the console login');
  assert.doesNotMatch(await (await receive('/console/clubs/first-club/log', { cookie })).text(), /가상 기록/, 'each club sees its own');

  // The organiser in Worker secrets moving into an account is recorded as that organiser.
  await receive('/clubs/first-club/api/login', { method: 'POST', json: { name: env.FIRST_ID, credential: env.FIRST_ADMIN } });
  assert.match(await (await receive('/console/clubs/first-club/log', { cookie })).text(), /fixture-first-admin<\/td>\s*<td>기존 운영진 계정 옮김/);

  env.DB.sqlite.exec('DROP TABLE audit_log');
  const saved = await as('/admin/members', 'POST', { name: '가상 기록 없는 회원', birthday: '19910101' });
  assert.equal(saved.status, 201, 'a failed record never undoes or blocks the save');
});

test('the change log keeps one year: older rows go as new ones are written', async t => {
  const { env, receive, signIn } = await setup(t);
  const cookie = cookieOf(await signIn({ id: 'console-fixture', password }));
  const old = env.DB.sqlite.prepare(`INSERT INTO audit_log (club_id, at, actor, actor_id, actor_name, action, target_id, summary)
    VALUES ('first-club', unixepoch() - ?, 'console', NULL, '총괄', 'club.suspend', 'first-club', '')`);
  old.run(366 * 24 * 60 * 60);
  old.run(364 * 24 * 60 * 60);
  await receive('/console/clubs/second-club/status', { method: 'POST', form: { status: 'suspended' }, cookie });
  const ages = env.DB.sqlite.prepare('SELECT unixepoch() - at AS age FROM audit_log ORDER BY id').all().map(row => Math.round(row.age / 86400));
  assert.deepEqual(ages, [364, 0], 'the 366-day row is gone, the 364-day row and the new one stay');
});
