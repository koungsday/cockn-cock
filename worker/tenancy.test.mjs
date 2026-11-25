import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createWorker } from './index.mjs';

const migrations = await Promise.all(['0001.sql', '0002_member_name.sql'].map(
  file => readFile(new URL('./migrations/' + file, import.meta.url), 'utf8')
));
const origin = 'https://clubs.test';
const first = {
  slug: 'first-club', name: '가상 첫 모임', subtitle: '일요일 운동', schedule: '일요일',
  databaseBinding: 'FIRST_DB', adminIdBinding: 'FIRST_ID', adminPinBinding: 'FIRST_ADMIN', authPepperBinding: 'FIRST_PEPPER'
};
const second = {
  slug: 'second-club', name: '가상 둘째 모임', subtitle: '토요일 운동', schedule: '토요일',
  databaseBinding: 'SECOND_DB', adminIdBinding: 'SECOND_ID', adminPinBinding: 'SECOND_ADMIN', authPepperBinding: 'SECOND_PEPPER'
};

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
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
    FIRST_ID: 'fixture-first-admin', SECOND_ID: 'fixture-second-admin',
    FIRST_ADMIN: '548617',
    SECOND_ADMIN: '275419',
    FIRST_PEPPER: 'first-club-test-only-pepper-value',
    SECOND_PEPPER: 'second-club-test-only-pepper-value',
    ASSETS: {
      async fetch(request) {
        if (!['/index.html', '/admin-shell.html'].includes(new URL(request.url).pathname)) return new Response(null, { status: 404 });
        return new Response('<html><head><title>원본</title><!-- club-context --><!-- share-meta --><!-- admin-app --></head><body></body></html>', {
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
  async function signIn(club, path, body, status = 200) {
    const response = await request(club, path, { method: 'POST', body });
    assert.equal(response.status, status);
    return { user: (await response.json()).user, cookie: response.headers.get('Set-Cookie')?.split(';')[0] };
  }
  const login = (club, name, credential, status) => signIn(club, '/login', { name, credential }, status);
  const adminLogin = (club, credential = env[club.adminPinBinding], status) =>
    login(club, env[club.adminIdBinding], credential, status);
  return { env, receive, request, login, adminLogin };
}

test('catalog, canonical club links and legacy shares do not expose unscoped APIs', async t => {
  const { env, receive, request, login, adminLogin } = setup(t);
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

  const { cookie } = await adminLogin(first);
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
  assert.match(publicHtml, /가상 첫 모임 공지/);
  assert.doesNotMatch(publicHtml, /가상 공지|공개할 예시 문장/);
  assert.equal((await request(first, '/public/notice/' + notice.id)).status, 401);
  const head = await request(first, '/public/notice/' + notice.id, {method:'HEAD'});
  assert.equal(head.status, 401);
  assert.equal(await head.text(), '');
  assert.match(publicHtml, /property="og:url" content="https:\/\/clubs.test\/clubs\/first-club\/notice\//);
  const otherPage = await receive('/clubs/second-club/notice/' + notice.id);
  assert.equal(otherPage.status, 200);
  assert.doesNotMatch(await otherPage.text(), /가상 공지|공개할 예시 문장/);
});

test('a club administrator and a member cannot use their roles or credentials in another club', async t => {
  const { env, request, login, adminLogin } = setup(t);
  const { cookie: firstCookie } = await adminLogin(first);
  assert.match(firstCookie, /^__Host-first-club-admin=/);
  assert.equal((await request(second, '/admin', { cookie: firstCookie })).status, 401);
  assert.equal((await request(second, '/admin', {
    cookie: firstCookie.replace('__Host-first-club-admin=', '__Host-second-club-admin=')
  })).status, 401);
  await adminLogin(second, env.FIRST_ADMIN, 401);

  const create = await request(first, '/admin/members', {
    method: 'POST', cookie: firstCookie, body: { name: '가상 회원', birthday: '19890124' }
  });
  assert.equal(create.status, 201);
  const { member } = await create.json();
  await login(second, member.name, '19890124', 401);
  const { user, cookie: memberCookie } = await login(first, member.name, '19890124');
  assert.equal(user.role, 'member');
  assert.equal((await request(first, '/admin', { cookie: memberCookie })).status, 401);
  assert.equal((await request(second, '/admin', { cookie: memberCookie })).status, 401);

  const { cookie: secondCookie } = await adminLogin(second);
  const secondAdmin = await request(second, '/admin', { cookie: firstCookie + '; ' + secondCookie });
  assert.equal(secondAdmin.status, 200);
  assert.deepEqual((await secondAdmin.json()).members, []);
  assert.equal((await request(second, '/admin/members/' + member.id, {
    method: 'PATCH', cookie: secondCookie, body: { active: false }
  })).status, 404);
  const firstAdmin = await request(first, '/admin', { cookie: firstCookie + '; ' + secondCookie });
  assert.equal(firstAdmin.status, 200);
  assert.deepEqual((await firstAdmin.json()).members.map(row => row.name), ['가상 회원']);
  const firstLogout = await request(first, '/admin/logout', {
    method: 'POST', cookie: firstCookie + '; ' + secondCookie, body: {}
  });
  assert.equal(firstLogout.status, 200);
  assert.match(firstLogout.headers.get('Set-Cookie'), /^__Host-first-club-admin=;.*Max-Age=0/);
  assert.equal((await request(first, '/admin', { cookie: firstCookie })).status, 401);
  assert.equal((await request(second, '/admin', { cookie: secondCookie })).status, 200);

  const localOrigin = 'http://127.0.0.1:8787';
  const localLogin = await request(second, '/login', {
    method: 'POST', protocol: localOrigin, requestOrigin: localOrigin,
    body: { name: env.SECOND_ID, credential: env.SECOND_ADMIN }
  });
  assert.equal(localLogin.status, 200);
  assert.match(localLogin.headers.get('Set-Cookie'), /^second-club-admin-dev=/);
});

test('duplicate or missing tenant configuration is rejected without falling back to a different DB', async t => {
  assert.throws(() => createWorker([first, { ...second, slug: first.slug }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'bad--slug' }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'x'.repeat(65) }]));
  assert.throws(() => createWorker([first, { ...second, databaseBinding: first.databaseBinding }]));
  assert.throws(() => createWorker([first, { ...second, adminPinBinding: first.authPepperBinding }]));
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

test('member overview requires login and limits records to published upcoming events and notices', async t => {
  const { env, receive, request, login, adminLogin } = setup(t);
  const { cookie } = await adminLogin(first);
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

  assert.equal((await request(first, '/public')).status, 401);
  const profile = {name:'가상 첫 모임 회원', birthday:'19900517'};
  const added = await request(first, '/admin/members', {method:'POST', cookie, body:profile});
  assert.equal(added.status, 201);
  const {cookie: memberCookie} = await login(first, profile.name, profile.birthday);
  const list = await request(first, '/public', {cookie:memberCookie});
  assert.equal(list.status, 200);
  assert.match(list.headers.get('Cache-Control'), /no-store/);
  assert.equal(list.headers.get('Set-Cookie'), null);
  const result = await list.json();
  assert.deepEqual(result.events, published.slice(0, 12).map(({ id, title, date, time, endTime, place, deadline }) =>
    ({ id, title, date, time, endTime, place, deadline, canVote: true, open: true, eligible: true, mySlot: null })
  ));
  assert.doesNotMatch(JSON.stringify(result.events), /lunch|roster|가상 첫 모임 회원/);
  assert.deepEqual(result.notices, notices.slice(1, 9).reverse().map(({ id, title, date }) => ({ id, title, date })));
  assert.ok(result.events.every(event => event.id !== draft.id && event.id !== previous.id));
  assert.equal((await request(second, '/public', {cookie:memberCookie})).status, 401);
  assert.equal((await request(first, '/public', { method: 'POST', body: {} })).status, 405);
  const head = await request(first, '/public', { method: 'HEAD', cookie: memberCookie });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await receive('/clubs/first--club/')).status, 404);
});

test('administration shell contains no private data and scoped admin API still requires authentication', async t => {
  const { env, receive, request, login, adminLogin } = setup(t);
  const { cookie } = await adminLogin(first);
  const created = await request(first, '/admin/members', {
    method: 'POST', cookie, body: { name: '가상 운영진 전용 회원', birthday: '19890124' }
  });
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(await created.json()), ['member']);

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
    assert.match(html, /rel="manifest" href="\/clubs\/first-club\/admin\/manifest\.webmanifest"/);
    assert.equal(page.headers.get('Set-Cookie'), null);
  }
  const anonymous = await request(first, '/admin');
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('Cache-Control'), /no-store/);
  assert.equal((await request(first, '/admin', { cookie })).status, 200);
  assert.equal((await receive('/clubs/first-club/admin/other')).status, 404);
  const openApp = await receive('/clubs/first-club/admin/manifest.webmanifest');
  assert.equal(openApp.status, 200);
  assert.match(openApp.headers.get('Content-Type'), /^application\/manifest\+json/);
  assert.match(openApp.headers.get('Cache-Control'), /^public, max-age=3600$/);
  const manifest = await openApp.json();
  assert.equal(manifest.start_url, '/clubs/first-club/admin/');
  assert.equal(manifest.scope, manifest.start_url);
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);

});

test('the root is the intro home even with a single registered club', async t => {
  const {env} = setup(t);
  const worker = createWorker([first]);
  const response = await worker.fetch(new Request(origin + '/?from=homescreen'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=60');
  const html = await response.text();
  assert.match(html, /콕콕콕!/);
  assert.match(html, /href="\/clubs\/first-club\/"/);
  assert.match(html, /한 회차가 이렇게 이어져요/);
  assert.doesNotMatch(html, /FIRST_DB|FIRST_ADMIN|FIRST_PEPPER|id="try"/);
});

test('a configured address move preserves paths without redirecting credential requests', async t => {
  const {env} = setup(t);
  const worker = createWorker([first]);
  env.CLUB_LEGACY_ORIGIN = origin;
  env.CLUB_PUBLIC_ORIGIN = 'https://club-example.pages.dev';
  const path = '/clubs/first-club/admin/?from=homescreen';
  const oldPage = await worker.fetch(new Request(origin + path), env);
  assert.equal(oldPage.status, 308);
  assert.equal(oldPage.headers.get('Location'), env.CLUB_PUBLIC_ORIGIN + path);
  assert.equal(oldPage.headers.get('Cache-Control'), 'no-store');
  const page = await worker.fetch(new Request(env.CLUB_PUBLIC_ORIGIN + path), env);
  assert.equal(page.status, 200);
  const sameOriginApi = await worker.fetch(new Request(origin + '/clubs/first-club/api/session'), env);
  assert.equal(sameOriginApi.status, 200);
  const login = await worker.fetch(new Request(origin + '/clubs/first-club/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ name: env.FIRST_ID, credential: env.FIRST_ADMIN })
  }), env);
  assert.equal(login.status, 200);
  assert.equal(login.headers.has('Location'), false);
});
