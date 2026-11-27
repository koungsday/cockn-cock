import assert from 'node:assert/strict';
import test from 'node:test';
import { loadingKind, shellSkeleton } from './public/skeleton.mjs';

// Each address opens the skeleton of the screen it will show (DESIGN.md 6 로딩), for a member and for an organiser.
test('the skeleton follows the address and the role', () => {
  const member = {
    '': 'member-home', '#home': 'member-home', '#event': 'member-events', '#event/e1': 'member-vote',
    '#notices': 'member-notices', '#notices/n1': 'notice', '#record': 'record',
  };
  const organiser = {
    '': 'home', '#home': 'home', '#event': 'event-list', '#event/e1': 'event', '#event/e1/attendance': 'event',
    '#notices': 'list', '#notices/n1': 'notice', '#record': 'record', '#members': 'list', '#progress': 'list', '#rules': 'list',
  };
  for (const [hash, kind] of Object.entries(member)) assert.equal(loadingKind(hash, false), kind, `member ${hash}`);
  for (const [hash, kind] of Object.entries(organiser)) assert.equal(loadingKind(hash, true), kind, `organiser ${hash}`);
  // A section only an organiser has opens their list even before the role is known.
  assert.equal(loadingKind('#members', false), 'list');
});

test('every kind has its own body, and the first paint is the bare shell', () => {
  const kinds = ['home', 'event-list', 'event', 'list', 'member-home', 'member-events', 'member-vote', 'member-notices', 'notice', 'record'];
  const bodies = kinds.map(kind => /<div class="main-content admin-content">([\s\S]*?)<\/div>\s*<div class="tab-bar">/.exec(shellSkeleton(kind))[1]);
  for (const [index, body] of bodies.entries()) assert(body.trim(), `${kinds[index]} has a body`);
  assert.equal(new Set(bodies).size, kinds.length, 'no two screens share a skeleton');
  assert.match(shellSkeleton('member-events'), /sk-calendar/);
  assert.match(shellSkeleton('event-list'), /sk-calendar/);
  assert.match(shellSkeleton('notice'), /sk-card-head--notice/);
  assert.equal(/<div class="main-content admin-content">([\s\S]*?)<\/div>\s*<div class="tab-bar">/.exec(shellSkeleton())[1], '');
  // The menu bars follow the role: four for a member, seven with the 운영 권한.
  assert.equal(shellSkeleton('member-home').match(/sk-nav-item/g).length, 4);
  assert.equal(shellSkeleton('home', true).match(/sk-nav-item/g).length, 7);
});
