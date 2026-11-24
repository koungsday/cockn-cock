import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleApi } from './api.mjs';
import { credentialHash } from './auth.mjs';

const migrations = await Promise.all(['0001.sql', '0002_member_name.sql'].map(
  file => readFile(new URL('./migrations/' + file, import.meta.url), 'utf8')
));
const origin = 'https://club.test';
const adminId = 'fixture-organizer';
const adminPassword = ' local-test-organizer-secret ';

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
    DB, CLUB_ADMIN_ID: adminId, CLUB_ADMIN_PASSWORD: adminPassword,
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
      adminLogin({ id = adminId, password = adminPassword, expect = 200 } = {}) {
        return this.login(id, password, expect);
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
  await visitor.request('/api/public', {expect:401});
  await visitor.request('/api/public/vote/' + event.id, {expect:401});
  await visitor.request('/api/votes/' + event.id, {expect:401});
  const name = member.member.name;
  assert.equal((await visitor.login(name.normalize('NFD'), '19880517')).user.mustChange, true);
  const publicEvent = (await visitor.request('/api/public/vote/' + event.id)).event;
  assert.equal(publicEvent.title, event.title);
  assert.equal(publicEvent.canVote, true);
  assert.doesNotMatch(JSON.stringify(publicEvent), /가상 회원|19880517|memberCode|roster|lunch/);
  assert.equal((await visitor.request('/api/votes/' + event.id)).vote, null);
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'late', lunch:true}});
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
  for (let i = 0; i < 5; i++) await failedAdmin.adminLogin({ password:'wrong-local-password', expect:401 });
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
  await admin.request('/api/login', {method:'POST', body:{memberCode:'admin', credential:adminPassword}, expect:400});
  const wrongId = await admin.adminLogin({ id:'wrong-operator', expect:401 });
  const wrongPassword = await admin.adminLogin({ password:adminPassword.trim(), expect:401 });
  assert.deepEqual(wrongId, wrongPassword);
  await admin.request('/api/login', {method:'POST', body:{name:adminId, credential:adminPassword}, requestOrigin:'https://unrelated.test', expect:403});
  await admin.adminLogin();
  assert.match(admin.setCookie, /^__Host-suncok19-admin=/);
  assert.match(admin.setCookie, /Max-Age=2592000/);
  const lifetime = (await DB.prepare("SELECT expires_at - unixepoch() AS seconds FROM sessions WHERE role='admin'").first()).seconds;
  assert.ok(lifetime <= 2592000 && lifetime >= 2591999);
  assert.equal((await admin.request('/api/admin/session')).user.role, 'admin');
  assert.equal((await admin.request('/api/session')).user, null);
  await admin.request('/api/public', {expect:401});
  await admin.request('/api/admin/login', {method:'POST', body:{adminId, credential:adminPassword}, expect:404});
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
  assert.doesNotMatch(memberClient.setCookie, /Max-Age/);
  const memberLifetime = (await DB.prepare("SELECT expires_at - unixepoch() AS seconds FROM sessions WHERE role='member'").first()).seconds;
  assert.ok(memberLifetime <= 43200 && memberLifetime >= 43199);
  const both = admin.cookie + '; ' + memberClient.cookie;
  assert.equal((await admin.request('/api/admin/session', {headerCookie:both})).user.role, 'admin');
  assert.equal((await admin.request('/api/session', {headerCookie:both})).user.id, member.id);
  await admin.request('/api/admin', {headerCookie:memberClient.cookie.replace('-member=', '-admin='), expect:401});
  await memberClient.request('/api/logout', {method:'POST', body:{}, headerCookie:both});
  assert.equal((await admin.request('/api/admin/session')).user.role, 'admin');

  env.CLUB_ADMIN_ID = 'rotated-fixture-operator';
  assert.equal((await admin.request('/api/admin/session')).user, null);
  await admin.adminLogin({id:env.CLUB_ADMIN_ID});
  env.CLUB_ADMIN_PASSWORD = 'rotated-fixture-operator-secret';
  assert.equal((await admin.request('/api/admin/session')).user, null);
  await admin.adminLogin({id:env.CLUB_ADMIN_ID, password:env.CLUB_ADMIN_PASSWORD});
  const expiredCookie = admin.cookie;
  await DB.prepare("UPDATE sessions SET expires_at = unixepoch() WHERE role='admin'").run();
  await admin.request('/api/admin', {headerCookie:expiredCookie, expect:401});
});

test('a short operator PIN needs a current proof issued by a strong login on this club', async t => {
  const { client, env } = setup(t);
  env.CLUB_ADMIN_ID = '가상 운영진';
  env.CLUB_ADMIN_PIN = '583471';
  const enrolled = client();
  const otherBrowser = client('203.0.113.25');
  const { CLUB_ADMIN_ID: name, CLUB_ADMIN_PIN: pin } = env;
  await otherBrowser.login(name, pin, 401);
  assert.equal((await enrolled.login(name.normalize('NFD'), adminPassword)).user.role, 'admin');
  const strongSession = enrolled.cookie;
  const [, proof] = enrolled.setCookies;
  assert.match(proof, /^__Host-suncok19-admin-device=/);
  assert.match(proof, /Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure$/);
  assert.doesNotMatch(proof, /Domain=/i);
  const deviceCookie = proof.split(';')[0];
  const pinLogin = (browser, credential, headerCookie, expect = 200) => browser.request('/api/login', {
    method:'POST', body:{name, credential}, headerCookie, expect
  });
  assert.equal((await enrolled.request('/api/admin/session', {headerCookie:deviceCookie})).user, null);
  await pinLogin(otherBrowser, pin, strongSession, 401);
  await pinLogin(otherBrowser, pin, deviceCookie + '0', 401);
  assert.equal((await pinLogin(enrolled, pin, deviceCookie)).user.role, 'admin');
  assert.equal(enrolled.setCookies.length, 1);
  const pinSession = enrolled.cookie;
  assert.equal((await enrolled.request('/api/admin/session')).user.role, 'admin');

  env.CLUB_ADMIN_PIN = '316794';
  assert.equal((await enrolled.request('/api/admin/session', {headerCookie:pinSession})).user, null);
  assert.equal((await enrolled.request('/api/admin/session', {headerCookie:strongSession})).user.role, 'admin');
  await pinLogin(otherBrowser, env.CLUB_ADMIN_PIN, deviceCookie, 401);
  env.CLUB_ADMIN_PIN = pin;
  const otherClub = env.CLUB_SCOPE = 'second-club';
  await pinLogin(otherBrowser, pin, deviceCookie.replace('suncok19', otherClub), 401);
  env.CLUB_SCOPE = 'suncok19';
  const expiry = Number(deviceCookie.split('=')[1].split('.')[0]);
  t.mock.timers.enable({apis:['Date'], now: expiry * 1000});
  await pinLogin(otherBrowser, pin, deviceCookie, 401);
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
    INSERT INTO members (id, name, code_hash, credential_salt, credential_hash, credential_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(legacyId, legacyName, 'existing-fixture-code', salt, hash, 'existing-fixture-version').run();
  await admin.request('/api/admin/members', {
    method:'POST', body:{ name:legacyName, birthday:'880131' }, expect:409
  });
  assert.equal((await client().login(legacyName, '19880131')).user.id, legacyId);
  assert.equal((await DB.prepare('SELECT credential_hash FROM members WHERE id=?').bind(legacyId).first()).credential_hash, hash);
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
  const endpoint = '/api/admin/progress?year=' + year + '&half=2';
  const progress = (await admin.request(endpoint)).members[0];
  assert.deepEqual(progress, {id:member.id, name:member.name, first:1, second:1, rewarded:false});

  await admin.request(lastPath + '/guests', {
    method:'POST', expect:201, body:{name:'가상 게스트', level:'A', invitedBy:member.name, status:'arrived', paid:true}
  });
  const saved = await admin.request(lastPath + '/settlement', {method:'PUT', body:patchSettlement});
  assert.deepEqual(saved.settlement, patchSettlement);
  await admin.request(lastPath + '/attendance/' + member.id, {
    method:'PUT', body:{present:false, recognition:null}, expect:409
  });
  await admin.request(lastPath + '/guests', {
    method:'POST', expect:409, body:{name:'가상 마감 뒤 게스트', status:'pending', paid:false}
  });
  await admin.request(lastPath, {method:'PATCH', body:{open:true}, expect:409});
  const final = (await admin.request(endpoint)).members[0];
  assert.equal(final.first, 1);
  assert.equal(final.second, 2);
  assert.equal(final.rewarded, false);

  await admin.request('/api/admin/progress', {method:'PUT', body:{year, half:2, memberId:member.id, rewarded:true}});
  assert.equal((await admin.request(endpoint)).members[0].rewarded, true);
  await admin.request(afterBoundary + '/settlement', {method:'PUT', body:{...patchSettlement, confirmed:false}});
  assert.equal((await admin.request(endpoint)).members[0].second, 1);
});

test('published notices and KST deadlines are respected without exposing drafts', async t => {
  const {client} = setup(t);
  const admin = client();
  const visitor = client();
  await admin.adminLogin();
  const draft = {title:'가상 공지', body:'가상 공지 본문', published:false};
  const {notice} = await admin.request('/api/admin/notices', {method:'POST', expect:201, body:draft});
  await visitor.request('/api/public/notice/' + notice.id, {expect:401});
  const profile = {name:'가상 공지 열람 회원', birthday:'19870204'};
  await admin.request('/api/admin/members', {method:'POST', expect:201, body:profile});
  await visitor.login(profile.name, profile.birthday);
  await visitor.request('/api/public/notice/' + notice.id, {expect:404});
  await admin.request('/api/admin/notices', {method:'POST', body:{...draft, id:notice.id, published:true}});
  assert.deepEqual((await visitor.request('/api/public/notice/' + notice.id)).notice, {...notice, published:true});

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
