import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('./001.sql', import.meta.url), 'utf8');

test('fresh PostgreSQL refuses client role access and preserves roster, vote and attendance invariants', async (t) => {
  const db = await PGlite.create();
  t.after(() => db.close());

  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(migration);

  const permissions = await db.query(`
    SELECT rolname,
      has_schema_privilege(rolname, 'club', 'USAGE') AS schema_access,
      has_table_privilege(rolname, 'club.members', 'SELECT') AS roster_access,
      has_table_privilege(rolname, 'club.votes', 'INSERT') AS vote_access
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    ORDER BY rolname
  `);
  assert.deepEqual(permissions.rows, [
    { rolname: 'anon', schema_access: false, roster_access: false, vote_access: false },
    { rolname: 'authenticated', schema_access: false, roster_access: false, vote_access: false }
  ]);
  assert.deepEqual((await db.query('SELECT id FROM club.members')).rows, []);

  const { rows: [first, second] } = await db.query(`
    INSERT INTO club.members (name) VALUES ('가상 회원 A'), ('가상 회원 B') RETURNING id
  `);
  const { rows: [event] } = await db.query(`
    INSERT INTO club.events (title, starts_at, ends_at, vote_closes_at, place)
    VALUES ('가상 일정', '2026-11-28 19:00+09', '2026-11-28 21:00+09', '2026-11-27 23:59+09', '가상 체육관')
    RETURNING id, share_id
  `);
  assert.notEqual(event.id, event.share_id);

  await assert.rejects(
    db.query('INSERT INTO club.votes (event_id, member_id, response) VALUES ($1, $2, true)', [event.id, second.id]),
    { code: '23503' }
  );
  await assert.rejects(
    db.query('INSERT INTO club.attendance (event_id, member_id, present) VALUES ($1, $2, true)', [event.id, second.id]),
    { code: '23503' }
  );

  await db.query('INSERT INTO club.event_members (event_id, member_id) VALUES ($1, $2)', [event.id, first.id]);
  await db.query('INSERT INTO club.votes (event_id, member_id, response) VALUES ($1, $2, true)', [event.id, first.id]);
  await assert.rejects(
    db.query('INSERT INTO club.votes (event_id, member_id, response) VALUES ($1, $2, false)', [event.id, first.id]),
    { code: '23505' }
  );
  await db.query(`
    INSERT INTO club.votes (event_id, member_id, response) VALUES ($1, $2, false)
    ON CONFLICT (event_id, member_id) DO UPDATE SET response = EXCLUDED.response
  `, [event.id, first.id]);
  await db.query('INSERT INTO club.attendance (event_id, member_id, present) VALUES ($1, $2, true)', [event.id, first.id]);

  const result = await db.query(`
    SELECT votes.response, attendance.present
    FROM club.votes JOIN club.attendance USING (event_id, member_id)
    WHERE event_id = $1 AND member_id = $2
  `, [event.id, first.id]);
  assert.deepEqual(result.rows, [{ response: false, present: true }]);
});

test('the migration also applies without Supabase roles', async (t) => {
  const db = await PGlite.create();
  t.after(() => db.close());

  await db.exec(migration);
  const { rows } = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'club' ORDER BY tablename
  `);
  assert.deepEqual(rows.map(({ tablename }) => tablename), [
    'attendance', 'event_members', 'events', 'members', 'notices', 'repeat_settings', 'votes'
  ]);
  await assert.rejects(db.query(`
    INSERT INTO club.events (title, starts_at, ends_at, vote_closes_at, place)
    VALUES ('가상 일정', '2026-11-28 19:00+09', '2026-11-28 18:30+09', '2026-11-27 23:59+09', '가상 체육관')
  `), { code: '23514' });
});
