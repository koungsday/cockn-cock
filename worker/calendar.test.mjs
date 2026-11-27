import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarBlock, calendarDayPanel, calendarPanel, calendarTarget, calendarToggle, shiftMonth } from './public/calendar.mjs';

const icon = name => `<svg data-icon="${name}"></svg>`;
const cells = html => [...html.matchAll(/<li class="(calendar-day[^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map(([, css, body]) => ({ css, body }));

test('the icon toggle names the action and points at the same panel when folded', () => {
  for (const [open, label] of [[true, '달력 접기'], [false, '달력으로 보기']]) {
    const html = calendarToggle(open, icon);
    assert.match(html, new RegExp(`aria-expanded="${open}" aria-controls="calendar-panel" aria-label="${label}"`));
    assert.match(html, /><svg data-icon="calendar"><\/svg><\/button>$/);
  }
  assert.equal(calendarPanel(''), '<div class="calendar-fold" id="calendar-panel"></div>');
});

test('months move across the year', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(calendarTarget('2026-12', 'next'), '2027-01');
  assert.equal(calendarTarget('2026-12', 'prev'), '2026-11');
});

test('a month starts on its weekday under 일 and fills whole weeks', () => {
  // 2026-11-01 is a Sunday: no days from October, 30 days, five weeks.
  const november = cells(calendarBlock([], { month: '2026-11', today: '2026-11-27', icon }));
  assert.equal(november.length, 35);
  assert.match(november[0].body, />1</);
  assert.doesNotMatch(november[0].css, /is-other/);
  // 2026-12-01 is a Tuesday: 29 and 30 November lead, the 31st ends on a Thursday, five weeks.
  const december = cells(calendarBlock([], { month: '2026-12', today: '2026-11-27', icon }));
  assert.equal(december.length, 35);
  assert.match(december[0].css, /is-other/);
  assert.match(december[0].body, />29</);
  assert.match(december[0].body, /data-id="2026-11-29".*aria-label="11월 29일 일요일"/);
  assert.match(december[2].body, />1</);
});

test('event dates use number buttons, quiet when done, with event names in their labels', () => {
  const html = calendarBlock([
    { date: '2026-11-22', title: '일요 정기 운동', kind: '정기', regular: true, done: true },
    { date: '2026-11-29', title: '일요 정기 운동', kind: '정기', regular: true, done: false },
    { date: '2026-11-29', title: '저녁 번개', kind: '번개', regular: false, done: false },
    { date: '2026-12-02', title: '수요 번개', kind: '번개', regular: false, done: false },
  ], { month: '2026-11', today: '2026-11-27', selected: '2026-11-29', icon });
  assert.match(html, /<h2 class="calendar-title" id="calendar-title">2026년 11월<\/h2>/);
  const days = cells(html);
  const day = number => days.find(({ css, body }) => !css.includes('is-other') && new RegExp(`calendar-number">${number}<`).test(body));
  assert.match(day(22).body, /data-id="2026-11-22" aria-pressed="false"/);
  assert.match(day(22).css, /is-done/);
  // Two events on one day: the label names both without crowding the visible cell.
  assert.match(day(29).body, /aria-pressed="true" aria-label="11월 29일 일요일 · 정기 일요 정기 운동, 번개 저녁 번개"/);
  assert.doesNotMatch(day(29).body, /calendar-kind|calendar-name/);
  assert.match(day(27).css, /is-today/);
  assert.match(day(27).body, /data-id="2026-11-27".*일정 없음/);
  assert.match(day(27).body, /aria-current="date"/);
  assert.doesNotMatch(day(27).css, /has-events|is-done/);
  assert.match(day(27).css, /calendar-day is-today/);
  // Another month's event is not drawn on this month's spill-over days.
  assert.doesNotMatch(html, /수요 번개/);
  for (const step of ['prev', 'next']) assert.match(html, new RegExp(`data-action="calendar-month" data-id="${step}"`));
});

test('selected dates with and without events have a heading and preserve available actions', () => {
  const date = '2026-11-27';
  assert.match(calendarDayPanel(date, []), /11월 27일 금요일[\s\S]*이 날짜에 일정이 없어요\./);
  const html = calendarDayPanel(date, ['<li>첫 일정</li>', '<li>다음 일정</li>'], { action: '<button>일정 추가</button>' });
  assert.match(html, /일정 추가[\s\S]*첫 일정[\s\S]*다음 일정/);
  assert.doesNotMatch(html, /일정이 없어요/);
  assert.equal(calendarDayPanel('', []), '');
});

test('titles are escaped in the labels', () => {
  const html = calendarBlock([{ date: '2026-11-29', title: '<b>"운동"</b>', kind: '정기', regular: true, done: false }],
    { month: '2026-11', today: '2026-11-27', icon });
  assert.match(html, /&lt;b&gt;&quot;운동&quot;&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>"운동"/);
});
