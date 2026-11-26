import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventStage, flowOrder, koreanNow } from './public/flow.mjs';

// FLOW.md 7장의 상황들. 지금은 2026-11-26(목) 12:00, 한국 시각.
const now = { day: '2026-11-26', minute: '2026-11-26T12:00' };
const event = (id, date, fields = {}) => ({
  id, date, time: '10:00', published: true, open: true, deadline: `${date}T09:00`, settled: false, ...fields
});

test('stages come from what is saved', () => {
  assert.equal(eventStage(event('a', '2026-11-29', { published: false }), now), 'draft');
  assert.equal(eventStage(event('a', '2026-11-29', { open: false }), now), 'waiting');
  assert.equal(eventStage(event('a', '2026-11-29'), now), 'voting');
  // 9: the deadline passed while the vote was left open: closed, as members see it.
  assert.equal(eventStage(event('a', '2026-11-29', { deadline: '2026-11-26T11:59' }), now), 'closed');
  assert.equal(eventStage(event('a', '2026-11-26'), now), 'today');
  assert.equal(eventStage(event('a', '2026-11-22'), now), 'wrapup');
  // 8: a confirmed 마무리 ends the flow, whatever the date.
  assert.equal(eventStage(event('a', '2026-11-22', { settled: true }), now), 'done');
});

test('the 운영 홈 order: today, a vote closing within a day, wrap-ups oldest first, open votes, drafts, the rest', () => {
  const order = flowOrder([
    event('later-vote', '2026-12-06', { deadline: '2026-12-05T20:00' }),
    event('closing-vote', '2026-11-29', { deadline: '2026-11-27T09:00' }),
    event('draft', '2026-12-13', { published: false }),
    event('wrapup-new', '2026-11-22'),
    event('today', '2026-11-26'),
    event('wrapup-old', '2026-11-15'),
    event('done', '2026-11-08', { settled: true }),
    event('closed', '2026-11-28', { deadline: '2026-11-26T08:00' }),
  ], now).map(item => item.id);
  assert.deepEqual(order, ['today', 'closing-vote', 'wrapup-old', 'wrapup-new', 'later-vote', 'draft', 'closed']);
});

test('two open votes in one week both show, the earlier deadline first (1)', () => {
  const order = flowOrder([
    event('sunday', '2026-11-29', { deadline: '2026-11-28T20:00' }),
    event('wednesday', '2026-12-02', { deadline: '2026-11-28T18:00' }),
  ], now).map(item => item.id);
  assert.deepEqual(order, ['wednesday', 'sunday']);
});

test('every draft shows, not only the earliest (6)', () => {
  const order = flowOrder([
    event('draft-2', '2026-12-13', { published: false }),
    event('draft-1', '2026-12-06', { published: false }),
  ], now).map(item => item.id);
  assert.deepEqual(order, ['draft-1', 'draft-2']);
});

test('pinned events come first in the order they were pinned, then the rest by urgency (3)', () => {
  const order = flowOrder([
    event('vote', '2026-11-29'),
    event('today', '2026-11-26'),
    event('year-end', '2026-12-13', { published: false, pinnedAt: 200 }),
    event('trip', '2026-12-20', { pinnedAt: 100 }),
    // A confirmed 마무리 leaves the list even if a pin was left on it.
    event('done', '2026-11-08', { settled: true, pinnedAt: 50 }),
  ], now).map(item => item.id);
  assert.deepEqual(order, ['trip', 'year-end', 'today', 'vote']);
});

test('Korean time is nine hours ahead of UTC', () => {
  assert.deepEqual(koreanNow(Date.parse('2026-11-25T15:30:00Z')), { day: '2026-11-26', minute: '2026-11-26T00:30' });
});
