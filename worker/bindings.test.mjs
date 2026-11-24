import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyDatabaseBindings } from './bindings.mjs';

test('deployment requires a distinct physical D1 database for each club', () => {
  const existing = { slug: 'sample-first', databaseBinding: 'FIRST' };
  const second = { slug: 'sample-second', databaseBinding: 'SECOND' };
  const clubs = [existing, second];
  const first = { binding: 'FIRST', database_id: '00000000-0000-4000-a000-000000000001' };
  const other = { binding: 'SECOND', database_id: '00000000-0000-4000-a000-000000000002' };
  assert.doesNotThrow(() => verifyDatabaseBindings([existing], [{ binding: 'FIRST' }]));
  assert.doesNotThrow(() => verifyDatabaseBindings(clubs, [first, other]));
  assert.throws(() => verifyDatabaseBindings(clubs, [first, { binding: 'SECOND' }]), /explicit D1/);
  assert.throws(() => verifyDatabaseBindings(clubs, [first, { ...other, database_id: first.database_id }]), /share a D1/);
  assert.throws(() => verifyDatabaseBindings(clubs, [first, { ...other, preview_database_id: first.database_id }]), /share a D1/);
});
