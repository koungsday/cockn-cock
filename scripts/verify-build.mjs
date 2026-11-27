import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { PLATFORM_NAME, CLUBS } from '../platform/clubs.mjs';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const remote = process.argv[2] ? new URL(process.argv[2]) : null;
if (remote && !remote.pathname.endsWith('/')) remote.pathname += '/';

async function read(path = '') {
  if (!remote) return readFile(join(dist, path, !path || path.endsWith('/') ? 'index.html' : ''));
  const url = new URL(path, remote);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, url.href);
  if (path.endsWith('.png')) assert.match(response.headers.get('content-type') || '', /^image\/png\b/);
  return Buffer.from(await response.arrayBuffer());
}

const club = CLUBS.find(item => item.slug === 'suncok19');
const clubPath = `clubs/${club.slug}/`;
const catalog = (await read()).toString();
// One club address for both views, as the live club (ROLES.md 3단계); the old 운영 화면 address leads to it.
const home = (await read(clubPath)).toString();
const adminPath = clubPath + 'admin/';
const moved = (await read(adminPath)).toString();
assert(catalog.includes(PLATFORM_NAME));
assert(!catalog.includes('id="clubs"') && !catalog.includes(club.name), 'the intro home lists no clubs (PLATFORM.md)');
for (const view of ['#member', '#home']) {
  assert(catalog.includes(`href="${remote?.pathname ?? ''}${clubPath}${view}"`) ||
    (!remote && catalog.includes(`${clubPath}${view}"`)), `the demo try links open the club page at ${view}`);
}
assert.doesNotMatch(catalog, /CLUB_AUTH_PEPPER|CLUB_ADMIN_ID|CLUB_ADMIN_PIN|CLUB_ADMIN_PASSWORD|예시 회원|roster/);
assert(home.includes(`<title>${club.name} · ${PLATFORM_NAME}</title>`));
assert.match(moved, new RegExp(`location\\.replace\\("[^"]*/${clubPath}" \\+ location\\.search \\+ location\\.hash\\)`), 'the old 운영 화면 address moves to the club page');
const basePath = /<meta name="platform-home" content="([^"]+)">/.exec(home)?.[1];
assert(basePath, 'the club demo links back to the directory');
assert((await read('platform.css')).length > 0);
assert(catalog.includes(`src="${basePath}shuttlecock.js"`));
assert(catalog.includes(`src="${basePath}recent-club.js"`));
assert((await read('recent-club.js')).length > 0);
assert((await read('shuttlecock.js')).length > 0);
const legacy = (await read('legacy-links.js')).toString();
let redirect;
const oldHash = '#public-vote/e-nov28';
runInNewContext(legacy, { location: { hash: oldHash, search: '', replace: target => { redirect = target; } } });
assert.equal(redirect, basePath + clubPath + oldHash);
redirect = undefined;
runInNewContext(legacy, { location: { hash: '#clubs', search: '', replace: target => { redirect = target; } } });
assert.equal(redirect, undefined);
const required = ['styles.css', 'share.css', 'flow.js', 'calendar.js', 'state.js', 'screens.js', 'share.js', 'published-shares.js', 'form-pickers.js', 'app.js'];
const runtime = new Map();
for (const file of required) {
  assert(home.includes(`="${basePath}${file}"`), `${file} is referenced by the demo`);
  const content = await read(file);
  assert(content.length > 0, `${file} is available`);
  if (file.endsWith('.js')) runtime.set(file, content.toString());
}
assert(home.includes(`src="${basePath}form-pickers.js"`));
assert(home.indexOf(`src="${basePath}published-shares.js"`) < home.indexOf(`src="${basePath}app.js"`));
assert((await read('assets/court.webp')).length > 0);
for (const file of ['styles.css', 'platform.css']) {
  const css = (await read(file)).toString();
  const urls = [...css.matchAll(/url\("(assets\/fonts\/[^"]+\.(?:woff2|ttf))"\)/g)].map(match => match[1]);
  assert.equal(urls.length, 3, `${file} references the title, body and fallback fonts`);
  await Promise.all(urls.map(async url => {
    const bytes = await read(url);
    assert.equal(bytes.subarray(0, 4).toString('hex'), url.endsWith('.woff2') ? '774f4632' : '00010000');
  }));
}

const window = { localStorage: { getItem: () => null } };
assert(home.indexOf(`src="${basePath}flow.js"`) < home.indexOf(`src="${basePath}app.js"`), 'the flow rules load before the demo');
for (const file of ['flow.js', 'calendar.js', 'state.js', 'screens.js', 'share.js']) {
  runInNewContext(runtime.get(file), { URL, window }, { filename: file });
}
assert.equal(typeof window.clubFlow.flowOrder, 'function', 'flow.js gives the demo the live flow rules');
assert.equal(typeof window.clubCalendar.calendarBlock, 'function', 'calendar.js gives the demo the live month grid');
const seed = window.clubModel.load();
const { linkFor } = window.clubShare;

function openDemo(suffix) {
  const address = new URL(basePath + clubPath, remote ?? 'http://localhost:4173/');
  const location = new URL(suffix(address.href), address);
  const content = { innerHTML: '', dataset: {} };
  const app = {
    innerHTML: '', dataset: {}, addEventListener() {},
    querySelector: selector => selector === '#main-content' ? content : null,
  };
  const document = {
    addEventListener() {},
    querySelector: selector => selector === '#app' ? app : { addEventListener() {} },
  };
  const history = { replaceState: (_, __, hash) => { location.hash = hash; } };
  runInNewContext(runtime.get('app.js'), {
    location, history, document,
    window: { ...window, location, addEventListener() {}, matchMedia: () => ({ addEventListener() {} }) },
  }, { filename: 'app.js' });
  return { html: app.innerHTML + content.innerHTML, hash: location.hash };
}

const joinedVote = openDemo(address => `${oldHash}${address}#home`);
assert.equal(joinedVote.hash, oldHash, 'recover the vote from two pasted demo URLs');
assert.match(joinedVote.html, /<h1 tabindex="-1">일요 정기 운동<\/h1>/);
// 회원 보기 in the one shell: the member menus and the way back to the 일정 list (worker/public/views.mjs memberPage).
assert.match(joinedVote.html, /data-route="member-events">[^<]*<svg[\s\S]*?<\/svg> 일정<\/a>/);
for (const label of ['홈', '일정', '공지', '내 기록']) assert.match(joinedVote.html, new RegExp(`<span>${label}<\/span>`), `the member menu has ${label}`);
assert.doesNotMatch(joinedVote.html, /<span>회원 관리<\/span>/);
assert.match(openDemo(() => '#home').html, /<h1 class="sr-only">운영 홈<\/h1>/);
for (const label of ['홈', '일정', '공지', '회원 관리', '반기 집계']) {
  assert.match(openDemo(() => '#home').html, new RegExp(`<span>${label}<\/span>`), `the organiser menu has ${label} as the live club names it`);
}
// 일정 흐름 (FLOW.md): the demo home holds the first of the 진행 중인 일정 in the 지금 할 일 card and lists the rest in
// the live order (flow.js) as whole-row links (단순화 3); the member home bundles the votes still to answer.
const demoHome = openDemo(() => '#home').html;
assert.match(demoHome, /진행 중인 일정 \d+개/);
assert.match(demoHome, /<section class="panel now-card" aria-labelledby="next-event-title"/);
assert.match(demoHome, /<ol class="now-steps" aria-label="일정 진행 \d\/4단계: [^"]+">/);
assert.match(demoHome, /<h2 id="home-todo-title">다른 일정<\/h2>/);
assert.match(demoHome, /<a class="event-link" href="#event\/[^"]+\/(poll|attendance|settlement)"/);
for (const gone of ['class="featured"', 'poll-dashboard', 'dashboard-metrics']) assert(!demoHome.includes(gone), `the home no longer draws ${gone}`);
// The member home shares the live member home's markup and stylesheet (worker/public/views.mjs homeScreen).
const memberHome = openDemo(() => '#member').html;
assert.match(memberHome, /<h2 id="member-waiting">응답할 투표 \d+개<\/h2>/);
for (const marker of ['public-share-card member-next', 'member-next-action', 'member-records', 'data-route="public-vote/e-nov28"']) {
  assert(memberHome.includes(marker), `the demo member home uses ${marker}`);
}
// 일정 달력 (DESIGN.md 5): both 일정 lists keep the month grid folded behind 달력으로 보기 (단순화 2); the grid itself is
// checked in worker/calendar.test.mjs.
for (const hash of ['#events', '#member-events']) {
  const page = openDemo(() => hash).html;
  assert.match(page, /data-action="calendar-toggle">달력으로 보기</, `${hash} offers the calendar`);
  assert.doesNotMatch(page, /<div class="calendar" data-month=/, `${hash} opens with the list alone`);
}
assert(home.includes(`href="${basePath}share.css"`));
assert.match(openDemo(() => '#public-vote/').html, /공유 내용을 찾을 수 없어요/);

for (const [kind, id, title] of [
  ['vote', 'e-nov28', '일요 정기 운동'],
  ['notice', 'n-schedule', '일요모임 이용 안내'],
]) {
  const oldPath = `share/${kind}/${id}/`;
  const path = clubPath + oldPath;
  const html = (await read(path)).toString();
  assert.equal((await read(oldPath)).toString(), html, 'legacy address returns the same preview');
  const head = /<head>([\s\S]+?)<\/head>/.exec(html)?.[1];
  assert(head, `${path} has a head element`);
  const og = Object.fromEntries(
    Array.from(head.matchAll(/<meta property="og:([\w:]+)" content="([^"]+)">/g), ([, name, value]) => [name, value]),
  );
  assert(og.title.includes(title), `${path} OG title`);
  assert(og.description.length > 0, `${path} OG description`);
  const canonical = new URL(og.url);
  assert(canonical.pathname.endsWith('/' + path));
  assert.equal(og.site_name, PLATFORM_NAME);
  const clubBase = new URL('../../../', canonical);
  const base = new URL('../../', clubBase);
  if (remote) assert.equal(base.href, remote.href);
  assert(head.includes(`<link rel="canonical" href="${og.url}">`));
  assert(head.includes(`href="${base.pathname}styles.css"`));
  assert(head.includes(`href="${base.pathname}share.css"`));

  const imagePath = `assets/kakao-${kind}.png`;
  assert.equal(og.image, new URL(imagePath, base).href);
  const png = await read(imagePath);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), Number(og['image:width']));
  assert.equal(png.readUInt32BE(20), Number(og['image:height']));
  assert.equal(og['image:width'], '1200');
  assert.equal(og['image:height'], '630');
  const demoHash = `#public-${kind}/${id}`;
  assert(html.includes(`href="${clubBase.pathname}${demoHash}"`));
  assert.doesNotMatch(html, /<script\b|<form\b|김서윤|localStorage/);

  const records = kind === 'vote' ? seed.events : seed.notices;
  const item = records.find(record => record.id === id);
  window.location = new URL('#home', clubBase);
  const localHref = new URL(demoHash, clubBase).href;
  delete window.clubPublishedShares;
  assert.equal(linkFor(kind, item).href, localHref);
  assert.equal(linkFor(kind, item).published, false);

  runInNewContext(runtime.get('published-shares.js'), { window }, { filename: 'published-shares.js' });
  const published = base.protocol === 'https:';
  const stockLink = linkFor(kind, item);
  assert.equal(stockLink.href, published ? og.url : localHref);
  assert.equal(stockLink.published, published);
  assert.doesNotMatch(runtime.get('published-shares.js'), /김서윤|roster|votes|attendance/);
  const publicFields = kind === 'vote'
    ? ['title', 'date', 'time', 'endTime', 'place', 'deadline', 'deadlineTime', 'earlyTime', 'lateTime', 'notes', 'pollOpen', 'finalized']
    : ['title', 'date', 'body'];
  for (const field of publicFields) {
    const modified = { ...item, [field]: typeof item[field] === 'boolean' ? !item[field] : item[field] + '!' };
    const link = linkFor(kind, modified);
    assert.equal(link.href, localHref, `${kind} modified ${field} uses local preview`);
    assert.equal(link.published, false);
  }
  const otherItem = records.find(record => record.id !== id);
  assert.equal(linkFor(kind, otherItem).published, false);

  const helpers = { escape: String, icon: () => '', dateLabel: window.clubModel.dateLabel };
  const dialog = window.clubShare.renderShare({ kind, id }, seed, helpers);
  assert(dialog.includes(`value="${stockLink.href}"`));
  assert(dialog.includes(published ? '카카오톡 공유용 예시 링크' : '이 브라우저 미리보기 링크'));
  console.log(`Verified ${og.url}: HTML head, OG PNG 1200×630, share dialog, modified-record fallback.`);
}
console.log('Verified demo routes and runtime assets.');
