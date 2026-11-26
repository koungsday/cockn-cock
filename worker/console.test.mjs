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
const clubs = ['first', 'second', 'third'].map((key, index) => ({
  slug: key + '-club', name: `가상 ${['첫', '둘째', '셋째'][index]} 모임`, subtitle: '운동', schedule: '일요일',
  adminIdBinding: key.toUpperCase() + '_ID', adminPinBinding: key.toUpperCase() + '_ADMIN', authPepperBinding: key.toUpperCase() + '_PEPPER'
}));
const day = offset => new Date(Date.now() + (9 + offset * 24) * 60 * 60 * 1000).toISOString().slice(0, 10);

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
  // The third club is in the registry but has no clubs row, as a forgotten D1 step would leave it.
  sqlite.exec("INSERT INTO clubs (id) VALUES ('first-club'), ('second-club')");
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
    THIRD_ID: 'fixture-third-admin', THIRD_ADMIN: '613920', THIRD_PEPPER: 'third-club-test-only-pepper-value',
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

test('the console asks for its own login, is never cached or indexed, and is linked from nowhere public', async t => {
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
  assert.doesNotMatch(await (await receive('/')).text(), /console/);

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
  const panels = Object.fromEntries(html.split('<section class="panel"').slice(1).map(part => [part.match(/id="club-([a-z-]+)"/)[1], part]));
  assert.deepEqual(Object.keys(panels), ['first-club', 'second-club', 'third-club']);
  assert.match(panels['first-club'], /운영 중/);
  assert.match(panels['first-club'], /<dt>활동 회원<\/dt><dd>2명<\/dd>/);
  assert.match(panels['first-club'], /<dt>운영진 계정<\/dt><dd>1개<\/dd>/);
  assert.doesNotMatch(panels['first-club'], /<dt>최근 회차<\/dt><dd>없음/);
  assert.doesNotMatch(panels['first-club'], /<dt>다음 회차<\/dt><dd>없음/);
  assert.match(panels['second-club'], /<dt>활동 회원<\/dt><dd>1명<\/dd>/);
  assert.match(panels['second-club'], /<dt>다음 회차<\/dt><dd>없음<\/dd>/);
  assert.match(panels['third-club'], /설정 확인 필요/);
  assert.match(panels['third-club'], /D1 clubs 표에 이 모임이 없어서/);
  assert.doesNotMatch(html, /가상 회원|가상 쉬는 회원|가상 다른 모임 회원/, 'no member names');
  assert.match(html, /<form method="post" action="\/console\/logout">/);

  // A club secret that is missing shows up here instead of silently failing for that club's organisers.
  delete env.SECOND_ADMIN;
  const missing = await (await receive('/console/', { cookie })).text();
  assert.match(missing.split('id="club-second-club"')[1].split('<section')[0], /설정 확인 필요[\s\S]*운영진 계정이나 인증 비밀값/);
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
