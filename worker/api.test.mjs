import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleApi } from './api.mjs';
import { createHash } from 'node:crypto';
import { credentialHash } from './auth.mjs';

const migrationFolder = new URL('./migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationFolder)).filter(file => file.endsWith('.sql')).sort()
  .map(file => readFile(new URL(file, migrationFolder), 'utf8')));
const origin = 'https://club.test';
const adminId = 'fixture-organizer';
const adminPin = '583471';

function makeDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
  let pauseAfterRead;
  return {
    onRead(callback) { pauseAfterRead = callback; },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      function bind(...args) {
        return {
          bind,
          all: async () => ({ results: statement.all(...args) }),
          first: async () => {
            const row = statement.get(...args) ?? null;
            if (pauseAfterRead) await pauseAfterRead(sql);
            return row;
          },
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
    },
    close: () => sqlite.close()
  };
}

function setup(t) {
  const DB = makeDatabase();
  t.after(() => DB.close());
  const env = {
    DB, CLUB_SCOPE: 'suncok19', CLUB_ADMIN_ID: adminId, CLUB_ADMIN_PIN: adminPin,
    CLUB_AUTH_PEPPER: 'local-test-cryptographic-pepper-not-a-hosted-secret'
  };
  function client(ip = '203.0.113.10') {
    let cookie = '';
    let setCookie = '';
    let setCookies = [];
    return {
      get cookie() { return cookie; },
      get setCookie() { return setCookie; },
      get setCookies() { return setCookies; },
      async request(path, {method = 'GET', body, expect = 200, requestOrigin = origin, headerCookie = cookie} = {}) {
        const headers = {'CF-Connecting-IP': ip, 'Cookie': headerCookie};
        if (body !== undefined) {
          headers.Origin = requestOrigin;
          headers['Content-Type'] = 'application/json';
        }
        const response = await handleApi(new Request(origin + path, {
          method, headers, ...(body !== undefined && {body: JSON.stringify(body)})
        }), env);
        const payload = await response.json();
        const responseExpected = Array.isArray(expect) ? expect : [expect];
        assert.ok(responseExpected.includes(response.status), method + ' ' + path + ': expected ' + expect
          + ', received ' + response.status + ' for ' + JSON.stringify(payload));
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        if (response.headers.has('set-cookie')) {
          setCookies = response.headers.getSetCookie();
          const [header] = setCookies;
          setCookie = header;
          assert.match(header, /HttpOnly/);
          assert.match(header, /Secure/);
          assert.match(header, /SameSite=Lax/);
          cookie = header.split(';')[0];
        }
        return payload;
      },
      login(name, credential, expect = 200) {
        return this.request('/api/login', {method:'POST', body:{name, credential}, expect});
      },
      adminLogin({ id = adminId, pin = adminPin, expect = 200 } = {}) {
        return this.login(id, pin, expect);
      }
    };
  }
  return { DB, client, env };
}

function futureEvent() {
  const local = new Date(Date.now() + 9 * 60 * 60 * 1000);
  local.setUTCDate(local.getUTCDate() + 2);
  const date = local.toISOString().slice(0, 10);
  return {
    title:'가상 일요 운동', date, time:'10:00', endTime:'13:00', place:'가상 운동장',
    deadline:date + 'T09:00', earlyTime:'09:30', lateTime:'09:50',
    notes:'공개 예시 안내', published:true, open:true
  };
}

test('birthday sign-in opens the vote and PIN or reset rotates the member credential', async t => {
  const {DB, client} = setup(t);
  const admin = client();
  const visitor = client();
  await visitor.request('/api/admin', {expect:401});
  assert.equal((await admin.adminLogin()).user.role, 'admin');

  const member = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 회원 가', birthday:'19880517'}
  });
  assert.deepEqual(Object.keys(member), ['member']);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM members').first()).count, 1);
  const {event} = await admin.request('/api/admin/events', {method:'POST', body:futureEvent(), expect:201});
  // Before sign-in (사용자 결정, 2026-11-26): when it is and its deadline show; the place, the notes, the member's own
  // answer and 내 기록 wait for sign-in, and answering needs it.
  const before = await visitor.request('/api/public');
  assert.deepEqual([before.events[0].title, before.events[0].deadline, before.events[0].place, before.events[0].eligible, before.record],
    [event.title, event.deadline, null, false, null]);
  const anonymousEvent = (await visitor.request('/api/public/vote/' + event.id)).event;
  assert.deepEqual([anonymousEvent.date, anonymousEvent.canVote, anonymousEvent.place, anonymousEvent.notes], [event.date, true, null, null]);
  await visitor.request('/api/votes/' + event.id, {expect:401});
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'early', lunch:false}, expect:401});
  const name = member.member.name;
  assert.equal((await visitor.login(name.normalize('NFD'), '19880517')).user.mustChange, true);
  const publicEvent = (await visitor.request('/api/public/vote/' + event.id)).event;
  assert.equal(publicEvent.title, event.title);
  assert.equal(publicEvent.canVote, true);
  assert.deepEqual([publicEvent.place, publicEvent.notes], [event.place, event.notes]);
  // Lunch shows only as the counts' total (응답 현황), never as anyone's own choice.
  const {counts, ...shownEvent} = publicEvent;
  assert.deepEqual(Object.keys(counts), ['early', 'late', 'no', 'lunch']);
  assert.doesNotMatch(JSON.stringify(shownEvent), /가상 회원|19880517|memberCode|roster|lunch/);
  assert.equal((await visitor.request('/api/votes/' + event.id)).vote, null);
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'late', lunch:true}});
  const listed = (await visitor.request('/api/public')).events.find(item => item.id === event.id);
  assert.deepEqual([listed.open, listed.eligible, listed.mySlot], [true, true, 'late']);
  const {counts: listedCounts, ...listedEvent} = listed;
  assert.deepEqual(listedCounts, {early:0, late:1, no:0, lunch:1});
  assert.doesNotMatch(JSON.stringify(listedEvent), /가상 회원|lunch|roster/);
  await visitor.request('/api/pin', {method:'POST', body:{currentPin:'19880517', newPin:'19880517'}, expect:400});
  await visitor.request('/api/pin', {method:'POST', body:{currentPin:'000537', newPin:'684270'}, expect:400});
  const previousCookie = visitor.cookie;
  assert.equal((await visitor.request('/api/pin', {
    method:'POST', body:{currentPin:'19880517', newPin:'684270'}
  })).user.mustChange, false);
  assert.notEqual(visitor.cookie, previousCookie);
  await client().login(name, '19880517', 401);
  assert.equal((await client().login(name, '684270')).user.id, member.member.id);
  await visitor.request('/api/votes/' + event.id, {expect:401, headerCookie:previousCookie});
  await visitor.request('/api/admin', {expect:401});

  assert.deepEqual((await visitor.request('/api/votes/' + event.id)).vote, { slot:'late', lunch:true });
  await visitor.request('/api/votes/' + event.id, {
    method:'PUT', body:{slot:'early', lunch:true}, requestOrigin:'https://unrelated.test', expect:403
  });
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'early', lunch:true}});
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'late', lunch:false}});
  const details = await admin.request('/api/admin/events/' + event.id);
  assert.equal(details.roster.length, 1);
  assert.equal(details.roster[0].slot, 'late');
  assert.equal(details.roster[0].lunch, false);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM votes').first()).count, 1);

  await admin.request('/api/admin/events/' + event.id, {method:'PATCH', body:{open:false}});
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'early', lunch:true}, expect:409});
  await admin.request('/api/admin/events/' + event.id + '/votes/' + member.member.id, {
    method:'PUT', body:{slot:'early', lunch:true}
  });
  assert.deepEqual((await visitor.request('/api/votes/' + event.id)).vote, {slot:'early', lunch:true});

  const reset = await admin.request('/api/admin/members/' + member.member.id + '/reset', {method:'POST', body:{}});
  await visitor.request('/api/votes/' + event.id, {expect:401});
  assert.deepEqual(Object.keys(reset), ['temporaryPin']);
  assert.match(reset.temporaryPin, /^\d{6}$/);
  assert.notEqual(reset.temporaryPin, '684270');
  await visitor.login(name, '684270', 401);
  assert.equal((await visitor.login(name, reset.temporaryPin)).user.mustChange, true);
});

test('credential limits are tracked before verification for name and source address', async t => {
  const {client} = setup(t);
  const admin = client('203.0.113.11');
  await admin.adminLogin();
  const {member} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 회원 나', birthday:'19770210'}
  });
  const failedMember = client('203.0.113.20');
  for (let i = 0; i < 5; i++) await failedMember.login(member.name, '000001', 401);
  await failedMember.login(member.name, '19770210', 429);
  assert.equal((await client('203.0.113.30').login(member.name, '19770210')).user.id, member.id);

  const repeated = client('203.0.113.31');
  for (let i = 0; i < 30; i++) await repeated.login('등록하지 않은 예시 ' + i, '000001', 401);
  await repeated.login(member.name, '000001', 429);
  const failedAdmin = client('203.0.113.32');
  for (let i = 0; i < 5; i++) await failedAdmin.adminLogin({ pin:'583470', expect:401 });
  await failedAdmin.adminLogin({ expect:429 });
  assert.equal((await client('203.0.113.33').adminLogin()).user.role, 'admin');
});

test('same-name records use their own credentials and identical matches are denied', async t => {
  const {DB, client} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const name = '가상 동명이인';
  async function add(birthday) {
    return (await admin.request('/api/admin/members', {
      method:'POST', expect:201, body:{name, birthday}
    })).member;
  }
  const first = await add('19870714');
  const second = await add('19860916');
  assert.equal((await client().login(name, '19870714')).user.id, first.id);
  assert.equal((await client().login(name, '19860916')).user.id, second.id);
  await admin.request('/api/admin/members', {
    method:'POST', expect:409, body:{name, birthday:'19870714'}
  });
  await admin.request('/api/admin/members/' + first.id, {method:'PATCH', body:{active:false}});
  await admin.request('/api/admin/members', {method:'POST', expect:409, body:{name, birthday:'19870714'}});
  await admin.request('/api/admin/members/' + first.id, {method:'PATCH', body:{active:true}});
  assert.equal((await client().login(name, '19870714')).user.id, first.id);
  const duplicate = await add('19850812');
  // Model an ambiguous legacy pair from before duplicate registration checks.
  const stored = await DB.prepare(
    'SELECT credential_salt, credential_hash FROM members WHERE id = ?'
  ).bind(first.id).first();
  await DB.prepare('UPDATE members SET credential_salt = ?, credential_hash = ? WHERE id = ?')
    .bind(stored.credential_salt, stored.credential_hash, duplicate.id).run();
  await client().login(name, '19870714', 401);
  const {temporaryPin} = await admin.request('/api/admin/members/' + duplicate.id + '/reset', {method:'POST', body:{}});
  assert.equal((await client().login(name, '19870714')).user.id, first.id);
  assert.equal((await client().login(name, temporaryPin)).user.id, duplicate.id);
});

test('shared login assigns role and cookie lifetime on the server', async t => {
  const {DB, client, env} = setup(t);
  const admin = client();
  await admin.request('/api/login', {method:'POST', body:{memberCode:'admin', credential:adminPin}, expect:400});
  const wrongId = await admin.adminLogin({ id:'wrong-operator', expect:401 });
  const wrongPin = await admin.adminLogin({ pin:'583470', expect:401 });
  assert.deepEqual(wrongId, wrongPin);
  await admin.request('/api/login', {method:'POST', body:{name:adminId, credential:adminPin}, requestOrigin:'https://unrelated.test', expect:403});
  await admin.adminLogin();
  assert.match(admin.setCookie, /^__Host-suncok19-admin=/);
  assert.match(admin.setCookie, /Max-Age=2592000/);
  const lifetime = (await DB.prepare("SELECT expires_at - unixepoch() AS seconds FROM sessions WHERE role='admin'").first()).seconds;
  assert.ok(lifetime <= 2592000 && lifetime >= 2591999);
  assert.equal((await admin.request('/api/admin/session')).user.role, 'admin');
  assert.equal((await admin.request('/api/session')).user, null);
  // An organiser's session is no member's: the member home opens as it does before sign-in (no 내 기록).
  assert.equal((await admin.request('/api/public')).record, null);
  await admin.request('/api/admin/login', {method:'POST', body:{adminId, credential:adminPin}, expect:404});
  const sharedName = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:adminId, birthday:'19890810'}
  });
  const memberWithSharedName = client();
  assert.equal((await memberWithSharedName.login(adminId, '19890810')).user.id, sharedName.member.id);
  await memberWithSharedName.request('/api/admin', {expect:401});

  const {member} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 별도 로그인 회원', birthday:'19890810'}
  });
  const memberClient = client();
  await memberClient.request('/api/login', {
    method:'POST', body:{name:member.name, credential:'19890810', role:'admin', remember:true}
  });
  assert.match(memberClient.setCookie, /^__Host-suncok19-member=/);
  // Members stay signed in on the phone for half a year (사용자 결정, 2026-11-26).
  assert.match(memberClient.setCookie, /Max-Age=15552000/);
  const memberLifetime = (await DB.prepare("SELECT expires_at - unixepoch() AS seconds FROM sessions WHERE role='member'").first()).seconds;
  assert.ok(memberLifetime <= 15552000 && memberLifetime >= 15551999);
  const both = admin.cookie + '; ' + memberClient.cookie;
  assert.equal((await admin.request('/api/admin/session', {headerCookie:both})).user.role, 'admin');
  assert.equal((await admin.request('/api/session', {headerCookie:both})).user.id, member.id);
  await admin.request('/api/admin', {headerCookie:memberClient.cookie.replace('-member=', '-admin='), expect:401});
  await memberClient.request('/api/logout', {method:'POST', body:{}, headerCookie:both});
  assert.equal((await admin.request('/api/admin/session')).user.role, 'admin');

  // The organiser now has a D1 account (PLATFORM.md 인증): their own PIN change ends the old PIN and other sessions,
  // and the Worker secrets that seeded the account sign no one in any more.
  const otherBrowser = client('203.0.113.12');
  await otherBrowser.adminLogin();
  const changed = await admin.request('/api/admin/pin', {method:'POST', body:{currentPin:adminPin, newPin:'316794'}});
  assert.deepEqual(changed.user, {id:changed.user.id, name:adminId, role:'admin', mustChange:false});
  assert.equal((await otherBrowser.request('/api/admin/session')).user, null);
  await client('203.0.113.13').adminLogin({expect:401});
  assert.equal(env.CLUB_ADMIN_PIN, adminPin);
  await admin.adminLogin({pin:'316794'});
  const expiredCookie = admin.cookie;
  await DB.prepare("UPDATE sessions SET expires_at = unixepoch() WHERE role='admin'").run();
  await admin.request('/api/admin', {headerCookie:expiredCookie, expect:401});
});

test('a fresh browser signs in with an administrator name and PIN alone', async t => {
  const { client, env } = setup(t);
  env.CLUB_ADMIN_ID = '가상 운영진';
  env.CLUB_ADMIN_PASSWORD = 'fixture-only-former-enrollment';
  const browser = client();
  assert.equal(browser.cookie, '');
  const name = env.CLUB_ADMIN_ID.normalize('NFD');
  await browser.login(name, env.CLUB_ADMIN_PASSWORD, 401);
  assert.equal(browser.cookie, '');
  assert.equal((await browser.login(name, adminPin)).user.role, 'admin');
  assert.equal(browser.setCookies.length, 1);
  assert.match(browser.setCookie, /^__Host-suncok19-admin=/);
  assert.equal((await browser.request('/api/admin/session')).user.role, 'admin');
  await browser.request('/api/admin');
});

test('member changes cannot create the same login as the administrator', async t => {
  const { client, env } = setup(t);
  env.CLUB_ADMIN_PIN = '580724';
  const admin = client();
  await admin.adminLogin({pin:env.CLUB_ADMIN_PIN});
  await admin.request('/api/admin/members', {
    method:'POST', expect:409, body:{name:adminId, birthday:'19580724'}
  });
  const {member: alias} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 관리자와 같은 번호', birthday:'19580724'}
  });
  // Organiser PINs are hashed, so a rename cannot be compared with them; the shared pair is refused at sign-in.
  await admin.request('/api/admin/members/' + alias.id, {method:'PATCH', body:{name:adminId}});
  await client('203.0.113.14').login(adminId, env.CLUB_ADMIN_PIN, 401);
  const {member: sameName} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:adminId, birthday:'780925'}
  });
  const member = client();
  assert.equal((await member.login(adminId, '780925')).user.id, sameName.id);
  await member.request('/api/pin', {
    method:'POST', expect:400, body:{currentPin:'780925', newPin:'6534983'}
  });
  await member.request('/api/pin', {
    method:'POST', expect:409, body:{currentPin:'780925', newPin:env.CLUB_ADMIN_PIN}
  });
  await member.request('/api/admin', {expect:401});
  const {temporaryPin: reset} = await admin.request('/api/admin/members/' + sameName.id + '/reset', {method:'POST', body:{}});
  assert.match(reset, /^\d{6}$/);
  assert.notEqual(reset, env.CLUB_ADMIN_PIN);
  assert.equal((await member.login(adminId, reset)).user.id, sameName.id);
});

test('an organiser cannot take a same-named member credential, and secrets stop counting once the account moved', async t => {
  const { DB, client, env } = setup(t);
  const operator = client();
  await operator.adminLogin();
  const {member} = await operator.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:adminId, birthday:'780925'}
  });
  const memberPin = '780925';
  assert.equal((await client().login(adminId, memberPin)).user.id, member.id);
  await operator.request('/api/admin/pin', {method:'POST', expect:409, body:{currentPin:adminPin, newPin:memberPin}});

  env.CLUB_ADMIN_PIN = memberPin;
  assert.equal((await operator.request('/api/admin/session')).user.role, 'admin');
  assert.equal((await client('203.0.113.15').login(adminId, memberPin)).user.role, 'member');
  await DB.prepare('UPDATE organizers SET active = 0').run();
  await client('203.0.113.16').adminLogin({pin:memberPin, expect:200}).then(({user}) => assert.equal(user.role, 'member'));
  await client('203.0.113.17').adminLogin({expect:401});
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM organizers').first()).count, 1, 'a retired organiser is not recreated from the secrets');
  await operator.request('/api/admin', {expect:401});
});

test('administrator PIN attempts share a limit across source addresses', async t => {
  const { client } = setup(t);
  const operator = client();
  await operator.adminLogin();
  const {member} = await operator.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'별도 가상 회원', birthday:'880726'}
  });
  t.mock.timers.enable({apis:['Date'], now:Date.now()});
  for (let attempt = 0; attempt < 20; attempt++) {
    await client('203.0.113.' + (60 + attempt)).adminLogin({pin:'583470', expect:401});
  }
  const newBrowser = client('203.0.113.90');
  await newBrowser.adminLogin({expect:429});
  assert.equal((await newBrowser.login(member.name, '880726')).user.id, member.id);
  assert.equal((await operator.request('/api/admin/session')).user.role, 'admin');
  t.mock.timers.tick(15 * 60 * 1000);
  assert.equal((await newBrowser.adminLogin()).user.role, 'admin');
});

test('an admin session from before organiser accounts signs in again and then moves the account once', async t => {
  const { DB, client, env } = setup(t);
  const token = 'a'.repeat(64);
  const hash = createHash('sha256').update('session\0admin\0' + env.CLUB_AUTH_PEPPER + '\0' + token).digest('hex');
  await DB.prepare(`INSERT INTO sessions (token_hash, club_id, role, member_id, credential_version, expires_at)
    VALUES (?, 'suncok19', 'admin', NULL, 'before-organizers', unixepoch() + 3600)`).bind(hash).run();
  const browser = client();
  assert.equal((await browser.request('/api/admin/session', {headerCookie:'__Host-suncok19-admin=' + token})).user, null);
  await browser.request('/api/admin', {headerCookie:'__Host-suncok19-admin=' + token, expect:401});
  assert.equal((await browser.adminLogin()).user.name, adminId);
  await client('203.0.113.18').adminLogin();
  const rows = await DB.prepare('SELECT name, must_change FROM organizers').all();
  assert.deepEqual(rows.results.map(row => ({...row})), [{name:adminId, must_change:0}], 'one account, no forced change for a known PIN');
});

test('six-digit birthday enrollments preserve full entry and block duplicates of legacy birthdays', async t => {
  const { DB, client, env } = setup(t);
  const admin = client();
  await admin.adminLogin();
  const name = '가상 새 생년월일';
  const legacyName = '가상 기존 생년월일';
  const legacyId = crypto.randomUUID();
  const salt = 'fictional-existing-birthday-salt';
  const hash = await credentialHash(env, '19880131', salt);
  await DB.prepare(`
    INSERT INTO members (id, club_id, name, credential_salt, credential_hash, credential_version)
    VALUES (?, 'suncok19', ?, ?, ?, ?)
  `).bind(legacyId, legacyName, salt, hash, 'existing-fixture-version').run();
  await admin.request('/api/admin/members', {
    method:'POST', body:{ name:legacyName, birthday:'880131' }, expect:409
  });
  assert.equal((await client().login(legacyName, '19880131')).user.id, legacyId);
  assert.equal((await DB.prepare('SELECT credential_hash FROM members WHERE id=?').bind(legacyId).first()).credential_hash, hash);
  const legacyShort = client();
  assert.equal((await legacyShort.login(legacyName, '880131')).user.id, legacyId);
  await legacyShort.request('/api/pin', {method:'POST', body:{currentPin:'880131', newPin:'698358'}});
  assert.equal((await client().login(legacyName, '698358')).user.id, legacyId);
  await admin.request('/api/admin/members', {method:'POST', body:{name, birthday:'990231'}, expect:400});
  const {member} = await admin.request('/api/admin/members', {
    method:'POST', body:{name, birthday:'881031'}, expect:201
  });
  assert.equal((await client().login(name, '881031')).user.id, member.id);
  const fullEntry = client();
  assert.equal((await fullEntry.login(name, '19881031')).user.id, member.id);
  await fullEntry.request('/api/pin', {
    method:'POST', body:{currentPin:'19881031', newPin:'580916'}
  });
  await client().login(name, '19580916', 401);
  await client().login(name, '19881031', 401);
  assert.equal((await client().login(name, '580916')).user.id, member.id);
});

test('attendance, guests and shuttle balances drive only finalized half-year recognition', async t => {
  const {client} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const {member} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 회원 다', birthday:'19831031'}
  });
  const year = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear() - 1;
  const patchSettlement = {priorSingles:273, priorTubes:7, remainingSingles:6, courtDonation:8000, confirmed:true};
  const dates = ['06-30', '09-30', '10-01', '12-31'];
  const events = [];
  for (const suffix of dates) {
    const date = year + '-' + suffix;
    const {event} = await admin.request('/api/admin/events', {
      method:'POST', expect:201, body:{...futureEvent(), date, deadline:date + 'T09:00'}
    });
    const path = '/api/admin/events/' + event.id;
    events.push(path);
    await admin.request(path + '/attendance/' + member.id, {
      method:'PUT', body:{present:false, recognition:'direct'}, expect:400
    });
    await admin.request(path + '/attendance/' + member.id, {
      method:'PUT', body:{present:true, recognition:suffix === '10-01' ? 'substitute' : 'direct'}
    });
    if (suffix !== '12-31') {
      await admin.request(path + '/settlement', {method:'PUT', body:patchSettlement});
    }
  }
  const [, , afterBoundary, lastPath] = events;
  const settled = async path => (await admin.request('/api/admin')).events.find(item => '/api/admin/events/' + item.id === path).settled;
  assert.equal(await settled(afterBoundary), true);
  assert.equal(await settled(lastPath), false);
  const endpoint = '/api/admin/progress?year=' + year + '&half=2';
  const progress = (await admin.request(endpoint)).members[0];
  assert.deepEqual(progress, {id:member.id, name:member.name, periods:[1, 1], rewarded:false, eligible:false});

  await admin.request(lastPath + '/guests', {
    method:'POST', expect:201, body:{name:'가상 게스트', level:'A', invitedBy:member.name, status:'arrived', paid:true}
  });
  const saved = await admin.request(lastPath + '/settlement', {method:'PUT', body:patchSettlement});
  assert.deepEqual(saved.settlement, patchSettlement);
  assert.equal(await settled(lastPath), true);
  assert.equal('settled' in (await admin.request(lastPath)).event, false, 'the shared event shape stays without settled');
  await admin.request(lastPath + '/attendance/' + member.id, {
    method:'PUT', body:{present:false, recognition:null}, expect:409
  });
  await admin.request(lastPath + '/guests', {
    method:'POST', expect:409, body:{name:'가상 마감 뒤 게스트', status:'pending', paid:false}
  });
  await admin.request(lastPath, {method:'PATCH', body:{open:true}, expect:409});
  const final = (await admin.request(endpoint)).members[0];
  assert.deepEqual(final.periods, [1, 2]);
  assert.equal(final.rewarded, false);

  await admin.request('/api/admin/progress', {method:'PUT', body:{year, half:2, memberId:member.id, rewarded:true}});
  assert.equal((await admin.request(endpoint)).members[0].rewarded, true);
  await admin.request(afterBoundary + '/settlement', {method:'PUT', body:{...patchSettlement, confirmed:false}});
  assert.equal((await admin.request(endpoint)).members[0].periods[1], 1);
  assert.equal(await settled(afterBoundary), false);

  // 모임 규칙: the defaults are how the table counted before; a club can cut the half by month, count only some 인정
  // 방식, and show 수령 대상 to whoever met the goal in every 구간.
  const defaults = {periods:2, goal:3, kinds:['direct', 'substitute', 'approved'], reward:'manual', eventKinds:['regular', 'flash', 'match']};
  assert.deepEqual((await admin.request('/api/admin/rules')).rules, defaults);
  assert.deepEqual((await admin.request('/api/admin')).rules, defaults);
  for (const body of [{...defaults, periods:4}, {...defaults, goal:0}, {...defaults, goal:21}, {...defaults, kinds:[]},
    {...defaults, kinds:['direct', 'late']}, {...defaults, reward:'auto'}, {...defaults, eventKinds:[]},
    {...defaults, eventKinds:['regular', 'party']}, {periods:2, goal:3, kinds:['direct'], reward:'manual'}]) {
    await admin.request('/api/admin/rules', {method:'PUT', body, expect:400});
  }
  await admin.request(afterBoundary + '/settlement', {method:'PUT', body:patchSettlement});
  const monthly = {periods:6, goal:1, kinds:['direct'], reward:'goal', eventKinds:['regular']};
  assert.deepEqual((await admin.request('/api/admin/rules', {method:'PUT', body:monthly})).rules, monthly);
  // July to December: 09-30 and 12-31 were direct; 10-01 was 대타, which this club no longer counts.
  const byMonth = (await admin.request(endpoint)).members[0];
  assert.deepEqual([byMonth.periods, byMonth.eligible], [[0, 0, 1, 0, 0, 1], false]);
  await admin.request('/api/admin/rules', {method:'PUT', body:{periods:1, goal:3, kinds:['substitute', 'direct'], reward:'goal', eventKinds:['match', 'regular']}});
  const whole = await admin.request(endpoint);
  assert.deepEqual(whole.rules, {periods:1, goal:3, kinds:['direct', 'substitute'], reward:'goal', eventKinds:['regular', 'match']});
  assert.deepEqual([whole.members[0].periods, whole.members[0].eligible], [[3], true]);
  await admin.request('/api/admin/rules', {method:'PUT', body:{periods:1, goal:3, kinds:['direct', 'substitute'], reward:'manual', eventKinds:['regular']}});
  assert.equal((await admin.request(endpoint)).members[0].eligible, false);
});

test('members see vote counts without names and their own half-year record', async t => {
  const {client} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const profiles = [{name:'가상 회원 가', birthday:'19800101'}, {name:'가상 회원 나', birthday:'19800202'}];
  const members = [];
  for (const profile of profiles) {
    members.push((await admin.request('/api/admin/members', {method:'POST', expect:201, body:profile})).member);
  }
  const {event} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:futureEvent()});
  const first = client('203.0.113.21');
  const second = client('203.0.113.22');
  await first.login(profiles[0].name, '800101');
  await second.login(profiles[1].name, '800202');
  const votePath = '/api/votes/' + event.id;
  // 진행 중인 일정 (FLOW.md) reads 미응답 from the organisers' list: active members on the roster without an answer.
  const waiting = async () => (await admin.request('/api/admin')).events.find(item => item.id === event.id).waiting;
  assert.equal(await waiting(), 2);
  assert.deepEqual((await first.request(votePath, {method:'PUT', body:{slot:'early', lunch:true}})).counts, {early:1, late:0, no:0, lunch:1});
  // Members answer 선발 or 후발 only; 불참 is the organisers' record.
  await second.request(votePath, {method:'PUT', body:{slot:'no', lunch:false}, expect:400});
  assert.deepEqual((await second.request(votePath, {method:'PUT', body:{slot:'late', lunch:false}})).counts, {early:1, late:1, no:0, lunch:1});
  assert.equal(await waiting(), 0);

  const home = await first.request('/api/public');
  const listed = home.events.find(item => item.id === event.id);
  assert.deepEqual(listed.counts, {early:1, late:1, no:0, lunch:1});
  assert.deepEqual([listed.earlyTime, listed.lateTime], [event.earlyTime, event.lateTime]);
  const shown = await first.request('/api/public/vote/' + event.id);
  assert.deepEqual(shown.event.counts, {early:1, late:1, no:0, lunch:1});
  assert.doesNotMatch(JSON.stringify([home, shown]), /가상 회원 나/);
  // 응답 취소 removes the answer; cancelling again is harmless, and after the deadline the answer stays.
  assert.deepEqual(await second.request(votePath, {method:'PUT', body:{slot:null, lunch:false}}), {vote:null, counts:{early:1, late:0, no:0, lunch:1}});
  assert.equal((await second.request(votePath)).vote, null);
  assert.equal(await waiting(), 1);
  assert.equal((await second.request(votePath, {method:'PUT', body:{slot:null, lunch:false}})).vote, null);
  await second.request(votePath, {method:'PUT', body:{slot:null, lunch:true}, expect:400});
  await admin.request('/api/admin/events/' + event.id, {method:'PATCH', body:{open:false}});
  await first.request(votePath, {method:'PUT', body:{slot:null, lunch:false}, expect:409});
  assert.deepEqual((await first.request(votePath)).vote, {slot:'early', lunch:true});
  await admin.request('/api/admin/events/' + event.id, {method:'PATCH', body:{open:true}});

  // 내 기록 is this member's row of this half's 반기 집계: an event today, finalized with a recognition.
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month] = today.split('-').map(Number);
  const half = month <= 6 ? 1 : 2;
  const noAttendance = {months:Array(12).fill(0), total:0};
  const record = (periods, rewarded, attendance) => ({year, half, periods, goal:3, reward:'manual', rewarded, eligible:false, attendance});
  assert.deepEqual(home.record, record([[], []], false, noAttendance));
  const {event: done} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:{
    ...futureEvent(), date:today, time:'00:01', endTime:'00:03', deadline:today + 'T00:00', earlyTime:'00:01', lateTime:'00:02'
  }});
  const donePath = '/api/admin/events/' + done.id;
  await admin.request(donePath + '/attendance/' + members[0].id, {method:'PUT', body:{present:true, recognition:'substitute'}});
  await admin.request(donePath + '/attendance/' + members[1].id, {method:'PUT', body:{present:false, recognition:null}});
  await admin.request(donePath + '/settlement', {method:'PUT', body:{priorSingles:1, priorTubes:0, remainingSingles:0, courtDonation:0, confirmed:true}});
  // Present at an event not yet finalized does not count until its 마무리 is confirmed.
  const {event: open} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:{
    ...futureEvent(), date:today, time:'00:04', endTime:'00:06', deadline:today + 'T00:00', earlyTime:'00:04', lateTime:'00:05'
  }});
  await admin.request('/api/admin/events/' + open.id + '/attendance/' + members[0].id, {method:'PUT', body:{present:true, recognition:null}});
  await admin.request('/api/admin/progress', {method:'PUT', body:{year, half, memberId:members[0].id, rewarded:true}});
  const firstPeriod = month % 6 >= 1 && month % 6 <= 3;
  const marks = [{date:today, kind:'substitute'}];
  // 출석 counts present at a finalized event: this month once, in all once; the other member none.
  const months = Array(12).fill(0);
  months[month - 1] = 1;
  assert.deepEqual((await first.request('/api/public')).record,
    record(firstPeriod ? [marks, []] : [[], marks], true, {months, total:1}));
  assert.deepEqual((await second.request('/api/public')).record, record([[], []], false, noAttendance));
  // The organisers' 반기 집계 counts the same marks.
  const {members: table} = await admin.request(`/api/admin/progress?year=${year}&half=${half}`);
  const row = table.find(item => item.id === members[0].id);
  assert.deepEqual(row.periods, [firstPeriod ? 1 : 0, firstPeriod ? 0 : 1]);
  // 내 기록 follows the 모임 규칙 too: one 구간, one 대타 needed, 수령 대상 shown.
  await admin.request('/api/admin/rules', {method:'PUT', body:{periods:1, goal:1, kinds:['substitute'], reward:'goal', eventKinds:['regular', 'flash', 'match']}});
  const ruled = (await first.request('/api/public')).record;
  assert.deepEqual([ruled.periods, ruled.goal, ruled.reward, ruled.eligible], [[marks], 1, 'goal', true]);
});

test('published notices and KST deadlines are respected without exposing drafts', async t => {
  const {client} = setup(t);
  const admin = client();
  const visitor = client();
  await admin.adminLogin();
  const draft = {title:'가상 공지', body:'가상 공지 본문', published:false};
  const {notice} = await admin.request('/api/admin/notices', {method:'POST', expect:201, body:draft});
  // A draft stays hidden before sign-in too.
  await visitor.request('/api/public/notice/' + notice.id, {expect:404});
  const profile = {name:'가상 공지 열람 회원', birthday:'19870204'};
  await admin.request('/api/admin/members', {method:'POST', expect:201, body:profile});
  await visitor.login(profile.name, profile.birthday);
  await visitor.request('/api/public/notice/' + notice.id, {expect:404});
  await admin.request('/api/admin/notices', {method:'POST', body:{...draft, id:notice.id, published:true}});
  assert.deepEqual((await visitor.request('/api/public/notice/' + notice.id)).notice, {...notice, published:true});
  // Before sign-in a published notice shows its title, date and the start of its body; the whole body waits.
  const long = '가상 공지 본문 '.repeat(10);
  await admin.request('/api/admin/notices', {method:'POST', body:{...draft, id:notice.id, body:long, published:true}});
  const anonymousNotice = (await client('203.0.113.30').request('/api/public/notice/' + notice.id)).notice;
  assert.deepEqual([anonymousNotice.title, anonymousNotice.date, anonymousNotice.body], [draft.title, notice.date, null]);
  assert.ok(anonymousNotice.preview.endsWith('…') && [...anonymousNotice.preview].length <= 61);
  assert.ok(long.startsWith(anonymousNotice.preview.slice(0, -1)));
  assert.equal((await visitor.request('/api/public/notice/' + notice.id)).notice.body, long.trim());

  const inKorea = offset => new Date(Date.now() + (9 * 60 + offset) * 60 * 1000).toISOString().slice(0, 16);
  const date = inKorea(24 * 60).slice(0, 10);
  const recent = {...futureEvent(), date, deadline:inKorea(-15)};
  const {event} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:recent});
  assert.equal((await visitor.request('/api/public/vote/' + event.id)).event.canVote, false);
  await admin.request('/api/admin/events/' + event.id, {
    method:'PATCH', body:{date:inKorea(48 * 60).slice(0, 10), deadline:inKorea(15)}
  });
  assert.equal((await visitor.request('/api/public/vote/' + event.id)).event.canVote, true);
});

test('concurrent schedule patches do not silently overwrite one another', async t => {
  const {client, DB} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const {event} = await admin.request('/api/admin/events', {
    method:'POST', expect:201, body:futureEvent()
  });
  const path = '/api/admin/events/' + event.id;
  let remaining = 2;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  DB.onRead(async statement => {
    if (!statement.startsWith('SELECT id, title, date, time') || remaining <= 0) return;
    if (--remaining === 0) release();
    await gate;
  });
  const edits = await Promise.all([
    admin.request(path, {method:'PATCH', body:{open:false}, expect:[200,409]}),
    admin.request(path, {method:'PATCH', body:{notes:'새로운 가상 안내'}, expect:[200,409]})
  ]);
  assert.equal(edits.filter(edit => edit.event).length, 1);
  assert.equal(edits.filter(edit => edit.error).length, 1);
  const details = await admin.request(path);
  assert.equal(details.event.open, edits[0].error ? true : false);
  assert.equal(details.event.notes, edits[1].error ? event.notes : '새로운 가상 안내');
});

// 상단 고정 (FLOW.md 4·5·9): three events and three notices at most, the fourth asks first and then lets go of the
// longest-pinned one; a confirmed 마무리 leaves the 진행 중인 일정 and cannot be pinned.
test('organisers pin up to three events and three notices, oldest first, and a fourth replaces the oldest only when asked', async t => {
  const {client, DB} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const events = [];
  for (let index = 0; index < 5; index += 1) {
    events.push((await admin.request('/api/admin/events', {method:'POST', expect:201, body:{...futureEvent(), title:'가상 고정 ' + index}})).event);
  }
  assert.equal(events[0].pinnedAt, null);
  const pin = (event, body, expect = 200) => admin.request('/api/admin/events/' + event.id, {method:'PATCH', body, expect});
  for (const event of events.slice(0, 3)) assert.ok((await pin(event, {pinned:true})).pinnedAt);
  const fourth = await pin(events[3], {pinned:true}, 409);
  assert.match(fourth.error, /3개까지/);
  assert.match(fourth.error, /가상 고정 0/);
  const pinnedIds = async () => (await admin.request('/api/admin')).events.filter(event => event.pinnedAt)
    .sort((a, b) => a.pinnedAt - b.pinnedAt).map(event => event.title);
  assert.deepEqual(await pinnedIds(), ['가상 고정 0', '가상 고정 1', '가상 고정 2']);
  const replaced = await pin(events[3], {pinned:true, replaceOldest:true});
  assert.deepEqual(replaced.released, {id:events[0].id, title:'가상 고정 0'});
  assert.deepEqual(await pinnedIds(), ['가상 고정 1', '가상 고정 2', '가상 고정 3']);
  // Pinning again keeps its place; letting go frees one.
  assert.equal((await pin(events[1], {pinned:true})).released, null);
  assert.deepEqual(await pinnedIds(), ['가상 고정 1', '가상 고정 2', '가상 고정 3']);
  await pin(events[2], {pinned:false});
  await pin(events[4], {pinned:true});
  assert.deepEqual(await pinnedIds(), ['가상 고정 1', '가상 고정 3', '가상 고정 4']);
  // The pin is its own change: it does not ride on a form save, and a form save does not touch it.
  await pin(events[1], {pinned:false, title:'다른 제목'}, 400);
  await pin(events[1], {title:'가상 고정 1 수정'});
  assert.ok((await admin.request('/api/admin/events/' + events[1].id)).event.pinnedAt);
  // A confirmed 마무리 takes the event out: it frees its place and cannot be pinned again.
  const lastWeek = new Date(Date.now() + 9 * 60 * 60 * 1000 - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const {event: past} = await admin.request('/api/admin/events', {
    method:'POST', expect:201, body:{...futureEvent(), title:'가상 지난 고정', date:lastWeek, deadline:lastWeek + 'T09:00'}
  });
  await pin(events[4], {pinned:false});
  await pin(past, {pinned:true});
  const settlement = {priorSingles:10, priorTubes:1, remainingSingles:2, courtDonation:0, confirmed:true};
  await admin.request('/api/admin/events/' + past.id + '/settlement', {method:'PUT', body:settlement});
  assert.deepEqual(await pinnedIds(), ['가상 고정 1 수정', '가상 고정 3']);
  await pin(events[0], {pinned:true});
  assert.deepEqual(await pinnedIds(), ['가상 고정 1 수정', '가상 고정 3', '가상 고정 0']);
  const closed = await pin(past, {pinned:true}, 409);
  assert.match(closed.error, /마무리를 확정한 일정/);
  await admin.request('/api/admin/events/00000000-0000-4000-8000-000000000000', {method:'PATCH', body:{pinned:true}, expect:404});

  // Notices: pinned first in the order pinned, then the newest.
  const notices = [];
  for (let index = 0; index < 4; index += 1) {
    notices.push((await admin.request('/api/admin/notices', {method:'POST', expect:201, body:{title:'가상 공지 ' + index, body:'본문', published:true}})).notice);
  }
  const pinNotice = (notice, body, expect = 200) => admin.request('/api/admin/notices/' + notice.id, {method:'PATCH', body, expect});
  await pinNotice(notices[1], {pinned:true});
  await pinNotice(notices[0], {pinned:true});
  const listed = (await admin.request('/api/admin')).notices.map(notice => notice.title);
  assert.deepEqual(listed, ['가상 공지 1', '가상 공지 0', '가상 공지 3', '가상 공지 2']);
  await pinNotice(notices[2], {pinned:true});
  assert.match((await pinNotice(notices[3], {pinned:true}, 409)).error, /가상 공지 1/);
  await pinNotice(notices[3], {pinned:true, replaceOldest:true});
  assert.deepEqual((await admin.request('/api/admin')).notices.filter(notice => notice.pinnedAt).map(notice => notice.title),
    ['가상 공지 0', '가상 공지 2', '가상 공지 3']);
  await pinNotice(notices[0], {title:'바꾼 제목'}, 400);
  await admin.request('/api/admin/notices/' + notices[0].id, {method:'POST', body:{pinned:true}, expect:405});

  const log = (await DB.prepare("SELECT action, summary FROM audit_log WHERE action IN ('event.pin', 'notice.pin') ORDER BY id").all()).results;
  assert.ok(log.some(row => row.action === 'event.pin' && /가상 고정 3 · 고정 \(가상 고정 0 고정 해제\)/.test(row.summary)));
  assert.ok(log.some(row => row.action === 'notice.pin' && row.summary === '가상 공지 2 · 고정'));
});

// 일정 종류 (FLOW.md 6): every event is 정기 unless chosen, and only the kinds the 모임 규칙 count go into 줄서기 인정,
// the 반기 집계 and 출석 in 내 기록.
test('event kinds default to 정기 and the 모임 규칙 choose which kinds count', async t => {
  const {client} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const {member} = await admin.request('/api/admin/members', {method:'POST', expect:201, body:{name:'가상 종류 회원', birthday:'19850505'}});
  const year = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear() - 1;
  const settlement = {priorSingles:10, priorTubes:1, remainingSingles:2, courtDonation:0, confirmed:true};
  const ids = {};
  for (const [kind, date] of [[undefined, '08-02'], ['flash', '08-05'], ['social', '08-09']]) {
    const {event} = await admin.request('/api/admin/events', {
      method:'POST', expect:201, body:{...futureEvent(), date:year + '-' + date, deadline:year + '-' + date + 'T09:00', ...(kind && {kind})}
    });
    ids[kind ?? 'regular'] = event.id;
    assert.equal(event.kind, kind ?? 'regular');
    const path = '/api/admin/events/' + event.id;
    await admin.request(path + '/attendance/' + member.id, {method:'PUT', body:{present:true, recognition:'direct'}});
    await admin.request(path + '/settlement', {method:'PUT', body:settlement});
  }
  await admin.request('/api/admin/events', {method:'POST', expect:400, body:{...futureEvent(), kind:'party'}});
  const {event: upcoming} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:futureEvent()});
  assert.equal((await admin.request('/api/admin/events/' + upcoming.id, {method:'PATCH', body:{kind:'match'}})).event.kind, 'match');

  const endpoint = '/api/admin/progress?year=' + year + '&half=2';
  // The default counts 정기·번개·대회: the 모임 (social) is left out.
  assert.deepEqual((await admin.request(endpoint)).members[0].periods, [2, 0]);
  const rules = {periods:2, goal:3, kinds:['direct', 'substitute', 'approved'], reward:'manual'};
  await admin.request('/api/admin/rules', {method:'PUT', body:{...rules, eventKinds:['regular', 'flash', 'match', 'social']}});
  assert.deepEqual((await admin.request(endpoint)).members[0].periods, [3, 0]);
  await admin.request('/api/admin/rules', {method:'PUT', body:{...rules, eventKinds:['regular']}});
  assert.deepEqual((await admin.request(endpoint)).members[0].periods, [1, 0]);

  // 내 기록's 출석 follows the same rule (this year's months only count when the events are this year).
  const self = client();
  await self.login('가상 종류 회원', '19850505');
  assert.equal((await self.request('/api/public')).record.attendance.total, 1);
  await admin.request('/api/admin/rules', {method:'PUT', body:{...rules, eventKinds:['flash', 'social']}});
  assert.equal((await self.request('/api/public')).record.attendance.total, 2);
});

// 일정 취소 (FLOW.md 10): the event stays with its answers, closes its vote, leaves its pin and cannot be wrapped up or
// reopened until the cancel is undone; members see it as cancelled and cannot answer.
test('organisers cancel an event and undo it; a cancelled event keeps its answers but takes no votes or 마무리', async t => {
  const {client, DB} = setup(t);
  const admin = client();
  await admin.adminLogin();
  await admin.request('/api/admin/members', {method:'POST', expect:201, body:{name:'가상 취소 회원', birthday:'19860606'}});
  const {event} = await admin.request('/api/admin/events', {method:'POST', expect:201, body:futureEvent()});
  const path = '/api/admin/events/' + event.id;
  assert.equal(event.cancelled, false);
  const member = client();
  await member.login('가상 취소 회원', '19860606');
  await member.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'early', lunch:false}});
  await admin.request(path, {method:'PATCH', body:{pinned:true}});

  await admin.request(path, {method:'PATCH', body:{cancelled:true, notes:'우천'}, expect:400});
  const cancelled = (await admin.request(path, {method:'PATCH', body:{cancelled:true}})).event;
  assert.deepEqual([cancelled.cancelled, cancelled.open, cancelled.canVote, cancelled.pinnedAt], [true, false, false, null]);
  // Answers stay; members see the event as cancelled and cannot answer.
  assert.equal((await admin.request(path)).roster.find(row => row.slot).slot, 'early');
  const listed = (await member.request('/api/public')).events.find(item => item.id === event.id);
  assert.deepEqual([listed.cancelled, listed.canVote, listed.mySlot], [true, false, 'early']);
  assert.equal((await member.request('/api/public/vote/' + event.id)).event.cancelled, true);
  await member.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'late', lunch:false}, expect:[403, 404, 409]});
  // No vote and no 마무리 until the cancel is undone; other edits still save.
  assert.match((await admin.request(path, {method:'PATCH', body:{open:true}, expect:409})).error, /취소를 풀어/);
  await admin.request(path, {method:'PATCH', body:{notes:'우천으로 취소해요'}});
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await admin.request(path, {method:'PATCH', body:{date:today, deadline:today + 'T00:00'}});
  const settlement = {priorSingles:10, priorTubes:1, remainingSingles:2, courtDonation:0, confirmed:true};
  assert.match((await admin.request(path + '/settlement', {method:'PUT', body:settlement, expect:409})).error, /취소한 일정은 마무리/);
  assert.match((await admin.request(path, {method:'PATCH', body:{pinned:true}, expect:409})).error, /취소한 일정은 고정/);

  // Undo: the event is live again with its vote still closed; it can be wrapped up, and then no longer cancelled.
  const restored = (await admin.request(path, {method:'PATCH', body:{cancelled:false}})).event;
  assert.deepEqual([restored.cancelled, restored.open], [false, false]);
  await admin.request(path + '/settlement', {method:'PUT', body:settlement});
  assert.match((await admin.request(path, {method:'PATCH', body:{cancelled:true}, expect:409})).error, /마무리를 확정한 일정/);
  await admin.request('/api/admin/events/00000000-0000-4000-8000-000000000000', {method:'PATCH', body:{cancelled:true}, expect:404});

  const log = (await DB.prepare("SELECT summary FROM audit_log WHERE action = 'event.cancel' ORDER BY id").all()).results.map(row => row.summary);
  assert.equal(log.length, 2);
  assert.match(log[0], / · 취소$/);
  assert.match(log[1], / · 취소 풀기$/);
});

// 상단 고정 under two organisers (verification note, 2026-11-26): while one asks to pin a fourth event in place of
// the oldest, another frees a place and pins that same event first. The first request must not also let go of the
// oldest pin for nothing.
test('a pin another organiser made first lets go of nothing', async t => {
  const {client, DB} = setup(t);
  const admin = client();
  await admin.adminLogin();
  const other = client('203.0.113.20');
  await other.adminLogin();
  const events = [];
  for (let index = 0; index < 4; index += 1) {
    events.push((await admin.request('/api/admin/events', {method:'POST', expect:201, body:{...futureEvent(), title:'가상 동시 ' + index}})).event);
  }
  const path = event => '/api/admin/events/' + event.id;
  for (const event of events.slice(0, 3)) await admin.request(path(event), {method:'PATCH', body:{pinned:true}});
  let raced = false;
  DB.onRead(async statement => {
    if (raced || !statement.startsWith('SELECT id, title, pinned_at FROM events')) return;
    raced = true;
    await other.request(path(events[1]), {method:'PATCH', body:{pinned:false}});
    await other.request(path(events[3]), {method:'PATCH', body:{pinned:true}});
  });
  const result = await admin.request(path(events[3]), {method:'PATCH', body:{pinned:true, replaceOldest:true}});
  assert.equal(raced, true);
  assert.ok(result.pinnedAt);
  assert.equal(result.released, null);
  const pinned = (await admin.request('/api/admin')).events.filter(event => event.pinnedAt)
    .sort((a, b) => a.pinnedAt - b.pinnedAt).map(event => event.title);
  assert.deepEqual(pinned, ['가상 동시 0', '가상 동시 2', '가상 동시 3']);
});
