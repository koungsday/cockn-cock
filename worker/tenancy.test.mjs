import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createWorker } from './index.mjs';
import { membersNamed, readSession } from './auth.mjs';

const migrationFolder = new URL('./migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationFolder)).filter(file => file.endsWith('.sql')).sort()
  .map(file => readFile(new URL(file, migrationFolder), 'utf8')));
const origin = 'https://clubs.test';
const first = {
  slug: 'first-club', name: '가상 첫 모임', subtitle: '일요일 운동', schedule: '일요일',
  adminIdBinding: 'FIRST_ID', adminPinBinding: 'FIRST_ADMIN', authPepperBinding: 'FIRST_PEPPER'
};
const second = {
  slug: 'second-club', name: '가상 둘째 모임', subtitle: '토요일 운동', schedule: '토요일',
  adminIdBinding: 'SECOND_ID', adminPinBinding: 'SECOND_ADMIN', authPepperBinding: 'SECOND_PEPPER'
};

// Both fixture clubs live in the one database, as every club does in production (PLATFORM.md).
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
  const club = sqlite.prepare('INSERT INTO clubs (id, name, subtitle, schedule) VALUES (?, ?, ?, ?)');
  for (const { slug, name, subtitle, schedule } of [first, second]) club.run(slug, name, subtitle, schedule);
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
    DB: database(t),
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
  assert.doesNotMatch(catalogHtml, /clubs\/(first|second)-club|FIRST_DB|FIRST_ADMIN|FIRST_PEPPER/);

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

test('missing or shared club secrets are rejected instead of serving a club with the wrong settings', async t => {
  assert.throws(() => createWorker([first, { ...second, slug: first.slug }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'bad--slug' }]));
  assert.throws(() => createWorker([first, { ...second, slug: 'x'.repeat(65) }]));
  assert.throws(() => createWorker([first, { ...second, adminPinBinding: first.authPepperBinding }]));
  const { env, receive, request } = setup(t);
  const db = env.DB;

  delete env.DB;
  assert.equal((await receive('/clubs/second-club/')).status, 503);
  assert.equal((await request(first, '/session')).status, 503);
  assert.equal((await request(second, '/session')).status, 503);

  env.DB = db;
  assert.equal((await request(first, '/session')).status, 200);
  // Organisers are D1 accounts now; what keeps two older clubs apart is their pepper (PLATFORM.md 인증).
  env.SECOND_PEPPER = env.FIRST_PEPPER;
  assert.equal((await request(first, '/session')).status, 503);
  assert.equal((await request(second, '/session')).status, 503);
  delete env.SECOND_PEPPER;
  assert.equal((await request(first, '/session')).status, 200);
  assert.equal((await request(second, '/session')).status, 503);
});

// PLATFORM.md 데이터 규칙: with every club in one D1, an id from another club must behave as if it did not exist.
test('two clubs in the one database never read or change each other\'s records', async t => {
  const { request, login, adminLogin } = setup(t);
  const day = offset => new Date(Date.now() + (9 + offset * 24) * 60 * 60 * 1000).toISOString().slice(0, 10);
  const clubs = {};
  for (const club of [first, second]) {
    const { cookie } = await adminLogin(club);
    const admin = (path, options = {}) => request(club, path, { cookie, ...options });
    // The same name and birthday in two clubs are two different people: duplicate checks are per club.
    const member = await admin('/admin/members', { method: 'POST', body: { name: '가상 같은 이름', birthday: '19900517' } });
    assert.equal(member.status, 201, club.slug);
    const event = await admin('/admin/events', { method: 'POST', body: {
      title: club.name + ' 회차', date: day(3), time: '10:00', endTime: '13:00', place: '가상 운동장',
      deadline: day(2) + 'T09:00', earlyTime: '09:30', lateTime: '09:50', published: true, open: true
    } });
    assert.equal(event.status, 201, club.slug);
    const notice = await admin('/admin/notices', { method: 'POST', body: { title: club.name + ' 공지', body: '가상 본문', published: true } });
    assert.equal(notice.status, 201, club.slug);
    clubs[club.slug] = {
      admin, member: (await member.json()).member, event: (await event.json()).event, notice: (await notice.json()).notice
    };
  }
  const a = clubs[first.slug];
  const b = clubs[second.slug];
  const { user: memberA, cookie: memberACookie } = await login(first, '가상 같은 이름', '19900517');
  assert.equal(memberA.id, a.member.id);

  const { user: memberB, cookie: firstCookie } = await login(second, '가상 같은 이름', '19900517');
  assert.equal(memberB.id, b.member.id);
  const changed = await request(second, '/pin', {
    method: 'POST', cookie: firstCookie, body: { currentPin: '19900517', newPin: '684270' }
  });
  assert.equal(changed.status, 200, 'a same-named member in another club does not block a PIN change');
  const memberBCookie = changed.headers.get('Set-Cookie').split(';')[0];

  const eventA = '/admin/events/' + a.event.id;
  for (const [method, path, body] of [
    ['GET', eventA],
    ['PATCH', eventA, { title: '다른 모임이 바꾼 제목' }],
    ['PUT', eventA + '/attendance/' + a.member.id, { present: true, recognition: null }],
    ['PUT', eventA + '/votes/' + a.member.id, { slot: 'early', lunch: false }],
    ['POST', eventA + '/guests', { name: '가상 게스트', status: 'pending', paid: false }],
    ['PUT', eventA + '/settlement', { priorSingles: 1, priorTubes: 1, remainingSingles: 1, courtDonation: 0, confirmed: false }],
    ['PATCH', '/admin/members/' + a.member.id, { active: false }],
    ['POST', '/admin/members/' + a.member.id + '/reset', {}],
    ['POST', '/admin/notices', { id: a.notice.id, title: '다른 모임이 바꾼 공지', body: '바꾼 본문', published: false }],
    ['PUT', '/admin/progress', { year: 2026, half: 2, memberId: a.member.id, rewarded: true }],
  ]) {
    assert.equal((await b.admin(path, { method, body })).status, 404, `${method} ${path} from the other club`);
  }

  const listB = await (await b.admin('/admin')).json();
  assert.deepEqual(listB.members.map(row => row.id), [b.member.id]);
  assert.deepEqual(listB.events.map(row => row.id), [b.event.id]);
  assert.deepEqual(listB.notices.map(row => row.id), [b.notice.id]);
  const progressB = await (await b.admin('/admin/progress?year=2026&half=2')).json();
  assert.deepEqual(progressB.members.map(row => row.id), [b.member.id]);
  // Rosters are filled when an event or a member is added: only from the same club.
  for (const club of [a, b]) {
    const detail = await (await club.admin('/admin/events/' + club.event.id)).json();
    assert.deepEqual(detail.roster.map(row => row.id), [club.member.id]);
  }

  const memberApi = (path, options = {}) => request(second, path, { cookie: memberBCookie, ...options });
  const home = await (await memberApi('/public')).json();
  assert.deepEqual(home.events.map(row => row.id), [b.event.id]);
  assert.deepEqual(home.notices.map(row => row.id), [b.notice.id]);
  assert.equal((await memberApi('/public/vote/' + a.event.id)).status, 404);
  assert.equal((await memberApi('/public/notice/' + a.notice.id)).status, 404);
  assert.equal((await memberApi('/votes/' + a.event.id, { method: 'PUT', body: { slot: 'early', lunch: false } })).status, 404);
  assert.equal((await memberApi('/votes/' + b.event.id, { method: 'PUT', body: { slot: 'early', lunch: false } })).status, 200);

  // Nothing of the first club moved.
  const listA = await (await a.admin('/admin')).json();
  assert.deepEqual(listA.members, [a.member]);
  assert.deepEqual(listA.notices, [a.notice]);
  const detailA = await (await a.admin(eventA)).json();
  assert.deepEqual(detailA.event, a.event);
  assert.deepEqual(detailA.roster, [{
    id: a.member.id, name: a.member.name, active: true, slot: null, lunch: false, present: null, recognition: null
  }]);
  assert.deepEqual(detailA.guests, []);
  assert.equal(detailA.settlement, null);
  const progressA = await (await a.admin('/admin/progress?year=2026&half=2')).json();
  assert.deepEqual(progressA.members.map(row => [row.id, row.rewarded]), [[a.member.id, false]]);
  assert.equal((await request(first, '/public', { cookie: memberACookie })).status, 200, 'the first club member is still signed in');
  assert.equal((await login(first, '가상 같은 이름', '19900517')).user.id, a.member.id, 'the first club member PIN was not reset');
});

// Separate peppers already keep clubs apart; the club_id checks must hold on their own as well.
test('sessions and name lookups stay in their club even with a shared pepper', async t => {
  const { env, request, adminLogin } = setup(t);
  for (const club of [first, second]) {
    const created = await request(club, '/admin/members', {
      method: 'POST', cookie: (await adminLogin(club)).cookie, body: { name: '가상 같은 이름', birthday: '19900517' }
    });
    assert.equal(created.status, 201);
  }
  const { cookie } = await adminLogin(first);
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const firstEnv = {
    DB: env.DB, CLUB_SCOPE: first.slug, CLUB_ADMIN_ID: env.FIRST_ID, CLUB_ADMIN_PIN: env.FIRST_ADMIN, CLUB_AUTH_PEPPER: env.FIRST_PEPPER
  };
  const sameSecretsOtherClub = { ...firstEnv, CLUB_SCOPE: second.slug };
  const signedIn = path => new Request(origin + path, { headers: { Cookie: `__Host-${path.split('/')[2]}-admin=${token}` } });
  assert.equal((await readSession(signedIn('/clubs/first-club/api/admin'), firstEnv, 'admin')).role, 'admin');
  assert.equal(await readSession(signedIn('/clubs/second-club/api/admin'), sameSecretsOtherClub, 'admin'), null);
  assert.equal((await membersNamed(firstEnv, '가상 같은 이름')).length, 1);
  assert.equal((await membersNamed(sameSecretsOtherClub, '가상 같은 이름')).length, 1);
  assert.notEqual((await membersNamed(firstEnv, '가상 같은 이름'))[0].id, (await membersNamed(sameSecretsOtherClub, '가상 같은 이름'))[0].id);
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
  assert.deepEqual(result.events, published.slice(0, 12).map(({ id, title, date, time, endTime, place, deadline, earlyTime, lateTime }) =>
    ({ id, title, date, time, endTime, place, deadline, earlyTime, lateTime, canVote: true, open: true, eligible: true, mySlot: null,
      counts: { early: 0, late: 0, no: 0, lunch: 0 } })
  ));
  // Lunch shows only as the counts' total (응답 현황), never as anyone's own choice.
  assert.doesNotMatch(JSON.stringify(result.events.map(({ counts, ...event }) => event)), /lunch|roster|가상 첫 모임 회원/);
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
    // The page never touches login cookies; it only remembers the club for the intro home (PLATFORM.md).
    assert.equal(recentClub(page), 's=first-club&n=가상 첫 모임&v=admin');
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

function recentClub(response) {
  const cookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(cookie, /^cockcockcock-recent=[^;]+; Path=\/; Max-Age=15552000; SameSite=Lax; Secure$/);
  assert.doesNotMatch(cookie, /__Host-|admin=|member=/);
  return decodeURIComponent(cookie.slice('cockcockcock-recent='.length, cookie.indexOf(';')))
    .split('&').map(part => decodeURIComponent(part.replace(/\+/g, ' '))).join('&');
}

test('the root is the intro home and lists no clubs; a club page remembers itself for this device', async t => {
  const {env, receive} = setup(t);
  const worker = createWorker([first]);
  const response = await worker.fetch(new Request(origin + '/?from=homescreen'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=60');
  assert.equal(response.headers.get('Set-Cookie'), null);
  const html = await response.text();
  assert.match(html, /콕콕콕!/);
  assert.doesNotMatch(html, /first-club|second-club|가상 첫 모임|가상 둘째 모임/);
  assert.match(html, /<p id="recent-club" class="recent-club" data-base="\/" hidden>/);
  assert.match(html, /<form class="club-entry" action="\/go" method="get">/);
  assert.match(html, /<a class="header-link" href="#login">로그인<\/a>/);
  assert.match(html, /<script src="\/recent-club\.js" defer><\/script>/);
  const memberPage = await receive('/clubs/first-club/');
  assert.equal(memberPage.status, 200);
  assert.equal(recentClub(memberPage), 's=first-club&n=가상 첫 모임&v=member');
  const sharePage = await receive('/clubs/second-club/vote/00000000-0000-4000-8000-000000000000');
  assert.equal(recentClub(sharePage), 's=second-club&n=가상 둘째 모임&v=member');
  const api = await receive('/clubs/first-club/api/session');
  assert.equal(api.headers.get('Set-Cookie'), null);
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
