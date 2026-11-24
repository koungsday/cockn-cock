import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleApi } from './api.mjs';

const migration = await readFile(new URL('./migrations/0001.sql', import.meta.url), 'utf8');
const origin = 'https://club.test';
const adminPassword = 'local-test-organizer-secret';

function makeDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
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
    DB, CLUB_ADMIN_PASSWORD: adminPassword,
    CLUB_AUTH_PEPPER: 'local-test-cryptographic-pepper-not-a-hosted-secret'
  };
  function client(ip = '203.0.113.10') {
    let cookie = '';
    return {
      get cookie() { return cookie; },
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
          const header = response.headers.get('set-cookie');
          assert.match(header, /HttpOnly/);
          assert.match(header, /Secure/);
          assert.match(header, /SameSite=Lax/);
          cookie = header.split(';')[0];
        }
        return payload;
      },
      login(memberCode, credential, expect = 200) {
        return this.request('/api/login', {method:'POST', body:{memberCode, credential}, expect});
      }
    };
  }
  return { DB, client };
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

test('activation, persistent web voting, role checks and record isolation', async t => {
  const {DB, client} = setup(t);
  const admin = client();
  const visitor = client();
  await visitor.request('/api/admin', {expect:401});
  assert.equal((await admin.login('admin', adminPassword)).user.role, 'admin');

  const member = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 회원 가', birthday:'19880517'}
  });
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM members').first()).count, 1);
  const {event} = await admin.request('/api/admin/events', {method:'POST', body:futureEvent(), expect:201});
  const publicEvent = (await visitor.request('/api/public/vote/' + event.id)).event;
  assert.equal(publicEvent.title, event.title);
  assert.equal(publicEvent.canVote, true);
  assert.doesNotMatch(JSON.stringify(publicEvent), /가상 회원|19880517|memberCode|roster|lunch/);
  await visitor.request('/api/votes/' + event.id, {expect:401});

  assert.equal((await visitor.login(member.memberCode, '19880517')).user.mustChange, true);
  await visitor.request('/api/votes/' + event.id, {method:'PUT', body:{slot:'late', lunch:true}, expect:403});
  await visitor.request('/api/pin', {method:'POST', body:{currentPin:'19880517', newPin:'19880517'}, expect:400});
  await visitor.request('/api/pin', {method:'POST', body:{currentPin:'000537', newPin:'684270'}, expect:400});
  const previousCookie = visitor.cookie;
  assert.equal((await visitor.request('/api/pin', {
    method:'POST', body:{currentPin:'19880517', newPin:'684270'}
  })).user.mustChange, false);
  assert.notEqual(visitor.cookie, previousCookie);
  await visitor.request('/api/votes/' + event.id, {expect:401, headerCookie:previousCookie});
  await visitor.request('/api/admin', {expect:403});

  assert.equal((await visitor.request('/api/votes/' + event.id)).vote, null);
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
  await visitor.login(member.memberCode, '684270', 401);
  assert.equal((await visitor.login(reset.memberCode, reset.temporaryPin)).user.mustChange, true);
});

test('credential limits are tracked before verification for a member and source address', async t => {
  const {client} = setup(t);
  const admin = client('203.0.113.11');
  await admin.login('admin', adminPassword);
  const {memberCode} = await admin.request('/api/admin/members', {
    method:'POST', expect:201, body:{name:'가상 회원 나', birthday:'19770210'}
  });
  for (let i = 0; i < 5; i++) {
    await client('203.0.113.' + (20 + i)).login(memberCode, '000001', 401);
  }
  await client('203.0.113.30').login(memberCode, '19770210', 429);

  const repeated = client('203.0.113.31');
  for (let i = 0; i < 30; i++) await repeated.login((i + 256).toString(16).padStart(16, '0'), '000001', 401);
  await repeated.login('a'.repeat(16), '000001', 429);
  const failedAdmin = client('203.0.113.32');
  for (let i = 0; i < 30; i++) await failedAdmin.login('admin', 'wrong-local-password', 401);
  await failedAdmin.login('admin', adminPassword, 429);
  assert.equal((await client('203.0.113.33').login('admin', adminPassword)).user.role, 'admin');
});

test('attendance, guests and shuttle balances drive only finalized half-year recognition', async t => {
  const {client} = setup(t);
  const admin = client();
  await admin.login('admin', adminPassword);
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
  await admin.login('admin', adminPassword);
  const draft = {title:'가상 공지', body:'가상 공지 본문', published:false};
  const {notice} = await admin.request('/api/admin/notices', {method:'POST', expect:201, body:draft});
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
  await admin.login('admin', adminPassword);
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
