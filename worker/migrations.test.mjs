import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const folder = new URL('./migrations/', import.meta.url);
const files = (await readdir(folder)).filter(file => file.endsWith('.sql')).sort();
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(new URL(file, folder), 'utf8')])));
const tables = ['members', 'sessions', 'attempts', 'events', 'roster', 'votes', 'attendance', 'guests', 'settlements', 'notices', 'rewards'];

// Fictional rows in the pre-0003 shape, covering every table and every cascade a careless rebuild would trigger.
function seedSingleClub(db) {
  const member = (id, name, active = 1) => db.prepare(`
    INSERT INTO members (id, name, active, code_hash, credential_salt, credential_hash, credential_version, must_change)
    VALUES (?, ?, ?, ?, 'salt-' || ?, 'hash-' || ?, 'version-' || ?, 0)
  `).run(id, name, active, 'code-' + id, id, id, id);
  const event = (id, date) => db.prepare(`
    INSERT INTO events (id, title, date, time, end_time, place, deadline, deadline_at, early_time, late_time, notes, open, published)
    VALUES (?, '가상 회차', ?, '10:00', '13:00', '가상 체육관', ? || 'T09:00', 0, '09:30', '09:50', '', 1, 1)
  `).run(id, date, date);
  member('m1', '가상 회원 하나');
  member('m2', '가상 회원 둘');
  member('m3', '가상 쉬는 회원', 0);
  event('e1', '2026-11-01');
  event('e2', '2026-11-08');
  for (const [eventId, memberId] of [['e1', 'm1'], ['e1', 'm2'], ['e2', 'm1'], ['e2', 'm2']]) {
    db.prepare('INSERT INTO roster (event_id, member_id) VALUES (?, ?)').run(eventId, memberId);
  }
  db.prepare("INSERT INTO votes VALUES ('e1', 'm1', 'early', 1), ('e1', 'm2', 'late', 0), ('e2', 'm1', 'no', 0)").run();
  db.prepare("INSERT INTO attendance VALUES ('e1', 'm1', 1, 'direct'), ('e1', 'm2', 0, NULL)").run();
  db.prepare("INSERT INTO guests VALUES ('g2', 'e1', '가상 게스트 둘', '', '', 'confirmed', 1), ('g1', 'e1', '가상 게스트 하나', 'C', 'm1', 'pending', 0)").run();
  db.prepare("INSERT INTO settlements VALUES ('e1', 3, 1, 2, 10000, 1)").run();
  db.prepare("INSERT INTO notices VALUES ('n2', '가상 공지 둘', '본문', '2026-11-02', 1), ('n1', '가상 공지 하나', '본문', '2026-11-02', 0)").run();
  db.prepare('INSERT INTO rewards VALUES (2026, 2, ?)').run('m1');
  db.prepare("INSERT INTO sessions VALUES ('t-admin', 'admin', NULL, 'admin-version', 9999999999), ('t-member', 'member', 'm1', 'version-m1', 9999999999)").run();
  db.prepare("INSERT INTO attempts VALUES ('pin-member:m2', 2, 9999999999)").run();
}

function snapshot(db) {
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT rowid AS row_id, * FROM ${table} ORDER BY rowid`).all()
    .map(row => { const { club_id: _club, code_hash: _code, ...rest } = row; return rest; })]));
}

test('0003 moves every existing row into the one-database shape as 썬콕19 without losing a child row', () => {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  try {
    const before = files.indexOf('0003_one_database.sql');
    assert(before > 0, 'the one-database migration exists');
    for (const file of files.slice(0, before)) db.exec(sources[file]);
    seedSingleClub(db);
    const old = snapshot(db);

    db.exec(sources['0003_one_database.sql']);

    assert.deepEqual(snapshot(db), old, 'every row and rowid of every table is unchanged');
    assert.deepEqual(db.prepare('SELECT id FROM clubs').all().map(row => row.id), ['suncok19']);
    for (const table of ['members', 'sessions', 'events', 'notices']) {
      assert.deepEqual(db.prepare(`SELECT DISTINCT club_id FROM ${table}`).all().map(row => row.club_id), ['suncok19'], table);
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'copy_%'").all(), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('members') WHERE name = 'code_hash'").get().count, 0);

    // A forgotten club_id must fail loudly instead of landing in some default club.
    assert.throws(() => db.prepare("INSERT INTO notices (id, title, body, date) VALUES ('n3', '제목', '본문', '2026-11-03')").run(), /NOT NULL/);
    assert.throws(() => db.prepare("INSERT INTO notices (id, club_id, title, body, date) VALUES ('n3', 'nobody', '제목', '본문', '2026-11-03')").run(), /FOREIGN KEY/);
    assert.throws(() => db.prepare("INSERT INTO clubs (id) VALUES ('Bad Slug')").run(), /CHECK/);
  } finally {
    db.close();
  }
});
