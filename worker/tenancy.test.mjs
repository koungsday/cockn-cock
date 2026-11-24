import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createWorker } from './index.mjs';

const migration = await readFile(new URL('./migrations/0001.sql', import.meta.url), 'utf8');
const origin = 'https://clubs.test';
const first = {
  slug: 'first-club', name: '가상 첫 모임', subtitle: '일요일 운동', schedule: '일요일',
  databaseBinding: 'FIRST_DB', adminPasswordBinding: 'FIRST_ADMIN', authPepperBinding: 'FIRST_PEPPER'
};
const second = {
  slug: 'second-club', name: '가상 둘째 모임', subtitle: '토요일 운동', schedule: '토요일',
  databaseBinding: 'SECOND_DB', adminPasswordBinding: 'SECOND_ADMIN', authPepperBinding: 'SECOND_PEPPER'
};

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  t.after(() => sqlite.close());
  return {
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

function setup(t) {
  const worker = createWorker([first, second], { legacyClub: first.slug });
  const env = {
    FIRST_DB: database(t), SECOND_DB: database(t),
    FIRST_ADMIN: 'first-club-test-only-password',
    SECOND_ADMIN: 'second-club-test-only-password',
    FIRST_PEPPER: 'first-club-test-only-pepper-value',
    SECOND_PEPPER: 'second-club-test-only-pepper-value',
    ASSETS: {
      async fetch(request) {
        if (new URL(request.url).pathname !== '/index.html') return new Response(null, { status: 404 });
        return new Response('<html><head><title>원본</title><!-- club-context --><!-- share-meta --></head><body></body></html>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
  };
  function receive(path, { method = 'GET', body, cookie, requestOrigin = origin, protocol = origin } = {}) {
    const headers = new Headers({ 'CF-Connecting-IP': '203.0.113.22' });
    if (cookie) headers.set('Cookie', cookie);
    if (body !== undefined) {
      headers.set('Origin', requestOrigin);
      headers.set('Content-Type', 'application/json');
    }
    return worker.fetch(new Request(protocol + path, {
      method, headers, ...(body !== undefined && { body: JSON.stringify(body) })
    }), env);
  }
  function request(club, path, options = {}) {
    return receive('/clubs/' + club.slug + '/api' + path, options);
  }
  async function login(club, memberCode, credential, status = 200) {
    const response = await request(club, '/login', { method: 'POST', body: { memberCode, credential } });
    assert.equal(response.status, status);
    return { user: (await response.json()).user, cookie: response.headers.get('Set-Cookie') };
  }
  return { env, receive, request, login };
}

test('catalog, canonical club links and legacy shares do not expose unscoped APIs', async t => {
  const { env, receive, request, login } = setup(t);
  const catalog = await receive('/');
  assert.equal(catalog.status, 200);
  assert.match(catalog.headers.get('Cache-Control'), /^public, max-age=60, s-maxage=60$/);
  const catalogHtml = await catalog.text();
  assert.match(catalogHtml, /콕콕콕!/);
  assert.match(catalogHtml, /clubs\/first-club/);
  assert.doesNotMatch(catalogHtml, /FIRST_DB|FIRST_ADMIN|FIRST_PEPPER/);

  const page = await receive('/clubs/first-club/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.match(await page.text(), /<meta name="club-base" content="\/clubs\/first-club">/);
  assert.equal((await receive('/clubs/unregistered/')).status, 404);
  assert.equal((await receive('/clubs/unregistered/api/session')).status, 404);
  assert.equal((await receive('/api/admin')).status, 404);
  assert.equal((await receive('/api/login', { method: 'POST', body: {} })).status, 404);

  const { cookie } = await login(first, 'admin', env.FIRST_ADMIN);
  const create = await request(first, '/admin/notices', {
    method: 'POST', cookie, body: { title: '가상 공지', body: '공개할 예시 문장', published: true }
  });
  assert.equal(create.status, 201);
  const { notice } = await create.json();
  const old = await receive('/notice/' + notice.id);
  assert.equal(old.status, 308);
  assert.equal(old.headers.get('Location'), origin + '/clubs/first-club/notice/' + notice.id);
  const publicPage = await receive('/clubs/first-club/notice/' + notice.id);
  const publicHtml = await publicPage.text();
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.headers.get('Cache-Control'), 'no-store');
  assert.match(publicHtml, /property="og:site_name" content="콕콕콕!"/);
  assert.match(publicHtml, /가상 공지[^<]*가상 첫 모임/);
  assert.match(publicHtml, /property="og:url" content="https:\/\/clubs.test\/clubs\/first-club\/notice\//);
  assert.equal((await receive('/clubs/second-club/notice/' + notice.id)).status, 404);
});

test('a club administrator and a member cannot use their roles or credentials in another club', async t => {
  const { env, request, login } = setup(t);
  const { cookie: firstCookie } = await login(first, 'admin', env.FIRST_ADMIN);
  assert.match(firstCookie, /^__Host-first-club=/);
  assert.match(firstCookie, /HttpOnly.*Secure/);
  assert.equal((await request(second, '/admin', { cookie: firstCookie })).status, 401);
  assert.equal((await request(second, '/admin', {
    cookie: firstCookie.replace('__Host-first-club=', '__Host-second-club=')
  })).status, 401);
  await login(second, 'admin', env.FIRST_ADMIN, 401);

  const create = await request(first, '/admin/members', {
    method: 'POST', cookie: firstCookie, body: { name: '가상 회원', birthday: '19890124' }
  });
  assert.equal(create.status, 201);
  const { member, memberCode } = await create.json();
  await login(second, memberCode, '19890124', 401);
  const { user, cookie: memberCookie } = await login(first, memberCode, '19890124');
  assert.equal(user.role, 'member');
  assert.equal((await request(first, '/admin', { cookie: memberCookie })).status, 403);
  assert.equal((await request(second, '/admin', { cookie: memberCookie })).status, 401);

  const { cookie: secondCookie } = await login(second, 'admin', env.SECOND_ADMIN);
  const secondAdmin = await request(second, '/admin', { cookie: firstCookie + '; ' + secondCookie });
  assert.equal(secondAdmin.status, 200);
  assert.deepEqual((await secondAdmin.json()).members, []);
  assert.equal((await request(second, '/admin/members/' + member.id, {
    method: 'PATCH', cookie: secondCookie, body: { active: false }
  })).status, 404);
  const firstAdmin = await request(first, '/admin', { cookie: firstCookie + '; ' + secondCookie });
  assert.equal(firstAdmin.status, 200);
  assert.deepEqual((await firstAdmin.json()).members.map(row => row.name), ['가상 회원']);
  const firstLogout = await request(first, '/logout', {
    method: 'POST', cookie: firstCookie + '; ' + secondCookie, body: {}
  });
  assert.equal(firstLogout.status, 200);
  assert.match(firstLogout.headers.get('Set-Cookie'), /^__Host-first-club=;.*Max-Age=0/);
  assert.equal((await request(first, '/admin', { cookie: firstCookie })).status, 401);
  assert.equal((await request(second, '/admin', { cookie: secondCookie })).status, 200);

  const localOrigin = 'http://127.0.0.1:8787';
  const localLogin = await request(second, '/login', {
    method: 'POST', protocol: localOrigin, requestOrigin: localOrigin,
    body: { memberCode: 'admin', credential: env.SECOND_ADMIN }
  });
  assert.equal(localLogin.status, 200);
  assert.match(localLogin.headers.get('Set-Cookie'), /^second-club_dev=/);
});

test('duplicate or missing tenant configuration is rejected without falling back to a different DB', async t => {
  assert.throws(() => createWorker([first, { ...second, slug: first.slug }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'bad--slug' }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'x'.repeat(65) }]));
  assert.throws(() => createWorker([first, { ...second, databaseBinding: first.databaseBinding }]));
  assert.throws(() => createWorker([first, { ...second, adminPasswordBinding: first.authPepperBinding }]));
  const { env, receive, request } = setup(t);
  const secondDb = env.SECOND_DB;

  delete env.SECOND_DB;
  assert.equal((await receive('/clubs/second-club/')).status, 503);
  assert.equal((await request(second, '/session')).status, 503);
  assert.equal((await request(first, '/session')).status, 200);

  env.SECOND_DB = env.FIRST_DB;
  assert.equal((await request(first, '/session')).status, 503);
  assert.equal((await request(second, '/session')).status, 503);

  env.SECOND_DB = secondDb;
  env.SECOND_ADMIN = env.FIRST_ADMIN;
  assert.equal((await request(first, '/session')).status, 503);
  assert.equal((await request(second, '/session')).status, 503);
});

test('club overview is public and limited to published upcoming events and notices', async t => {
  const { env, receive, request, login } = setup(t);
  const { cookie } = await login(first, 'admin', env.FIRST_ADMIN);
  const futureDate = offset => new Date(Date.now() + (9 + offset * 24) * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function addEvent(title, date, published = true) {
    const response = await request(first, '/admin/events', {
      method: 'POST', cookie, body: {
        title, date, time: '10:00', endTime: '13:00', place: '가상 운동장',
        deadline: date + 'T09:00', earlyTime: '09:30', lateTime: '09:50',
        notes: '목록에는 나오지 않는 상세 안내', published, open: true
      }
    });
    assert.equal(response.status, 201);
    return (await response.json()).event;
  }

  const published = [];
  for (let offset = 1; offset <= 13; offset++) {
    published.push(await addEvent('가상 예정 일정 ' + offset, futureDate(offset)));
  }
  const draft = await addEvent('가상 비공개 일정', futureDate(1), false);
  const previous = await addEvent('가상 지난 일정', futureDate(-1));
  const notices = [];
  for (let index = 0; index <= 9; index++) {
    const response = await request(first, '/admin/notices', {
      method: 'POST', cookie, body: {
        title: '가상 공지 ' + index, body: '목록에 노출하지 않는 안내 본문', published: index < 9
      }
    });
    assert.equal(response.status, 201);
    notices.push((await response.json()).notice);
  }

  const list = await request(first, '/public');
  assert.equal(list.status, 200);
  assert.match(list.headers.get('Cache-Control'), /no-store/);
  assert.equal(list.headers.get('Set-Cookie'), null);
  const result = await list.json();
  assert.deepEqual(result.events, published.slice(0, 12).map(({ id, title, date, time, endTime, place, deadline }) =>
    ({ id, title, date, time, endTime, place, deadline, canVote: true })
  ));
  assert.deepEqual(result.notices, notices.slice(1, 9).reverse().map(({ id, title, date }) => ({ id, title, date })));
  assert.ok(result.events.every(event => event.id !== draft.id && event.id !== previous.id));
  assert.deepEqual(await (await request(second, '/public')).json(), { events: [], notices: [] });
  assert.equal((await request(first, '/public', { method: 'POST', body: {} })).status, 405);
  const head = await request(first, '/public', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await receive('/clubs/first--club/')).status, 404);
});

test('administration shell contains no private data and scoped admin API still requires authentication', async t => {
  const { env, receive, request, login } = setup(t);
  const { cookie } = await login(first, 'admin', env.FIRST_ADMIN);
  const created = await request(first, '/admin/members', {
    method: 'POST', cookie, body: { name: '가상 운영진 전용 회원', birthday: '19890124' }
  });
  assert.equal(created.status, 201);
  const { memberCode } = await created.json();

  const canonical = await receive('/clubs/first-club/admin');
  assert.equal(canonical.status, 308);
  assert.equal(canonical.headers.get('Location'), origin + '/clubs/first-club/admin/');
  for (const session of [null, cookie]) {
    const page = await receive('/clubs/first-club/admin/', { cookie: session });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('Cache-Control'), 'no-store');
    const html = await page.text();
    assert.match(html, /<meta name="club-base" content="\/clubs\/first-club">/);
    assert.doesNotMatch(html, /가상 운영진 전용 회원|19890124/);
    assert.ok(!html.includes(memberCode));
    assert.equal(page.headers.get('Set-Cookie'), null);
  }
  const anonymous = await request(first, '/admin');
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('Cache-Control'), /no-store/);
  assert.equal((await request(first, '/admin', { cookie })).status, 200);
  assert.equal((await receive('/clubs/first-club/admin/other')).status, 404);
});
