import assert from 'node:assert/strict';
import { CLUBS } from '../platform/clubs.mjs';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
// The UI release this deploy built (scripts/deploy-live.mjs passes worker/site/club-ui/<hash>). Each request can reach an
// edge that still has the previous release, even after one request saw the new one (2026-11-27, #54: the page came back
// with the old hash and its files were already gone, 404). Without it, any release the page names is checked.
const expected = process.argv[3] ?? '';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const club = CLUBS[0];
const home = `/clubs/${club.slug}/`;
const admin = `${home}admin/`;

function get(path, method = 'GET') {
  return fetch(new URL(path, origin), { method, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}

async function shell(path) {
  const page = await get(path);
  assert.equal(page.status, 200, path);
  assert.equal(page.headers.get('cache-control'), 'no-store', path);
  const html = await page.text();
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  const style = html.match(/href="(\/club-ui\/[a-f0-9]{20}\/live\.css)"/)?.[1];
  const script = html.match(/src="(\/club-ui\/[a-f0-9]{20}\/app\.mjs)"/)?.[1];
  assert(style && script, `${path} must reference versioned UI assets`);
  assert.equal(style.replace('live.css', ''), script.replace('app.mjs', ''));
  return { style, script, html };
}

const intro = await get('/');
assert.equal(intro.status, 200, 'the root serves the intro home');
const introHtml = await intro.text();
// PLATFORM.md: the public intro lists no clubs; a device that opened one sees it through the recent-club cookie.
assert(!introHtml.includes(`href="${home}"`) && !introHtml.includes(club.name), 'the intro home lists no clubs');
assert(introHtml.includes('<script src="/recent-club.js" defer></script>'), 'the intro home loads the recent-club script');
assert.doesNotMatch(introHtml, /CLUB_AUTH_PEPPER|CLUB_ADMIN_ID|CLUB_ADMIN_PIN|_DB\b/);
// PLATFORM.md 총괄 콘솔: the login form, never cached or indexed; the intro's 로그인 section links it and opens clubs by address.
// Before npm run console:password sets its secrets, only the explicit 'not set up' page may answer 503.
const consolePage = await get('/console/');
const consoleHtml = await consolePage.text();
assert(consolePage.status === 200 ? consoleHtml.includes('console-login')
  : consolePage.status === 503 && consoleHtml.includes('총괄 로그인을 준비 중이에요'), `the console login page (${consolePage.status})`);
assert.equal(consolePage.headers.get('cache-control'), 'no-store');
assert.equal(consolePage.headers.get('x-robots-tag'), 'noindex, nofollow');
assert(introHtml.includes('href="/console/"') && introHtml.includes('action="/go"'), 'the intro home has the 로그인 section');
const entry = await get(`/go?club=${club.slug}`);
assert.equal(entry.status, 303, 'the club address opens the club');
assert.equal(entry.headers.get('location'), new URL(home, origin).href);
const recentScript = await get('/recent-club.js');
assert.equal(recentScript.status, 200, 'the recent-club script is served');
assert.match(recentScript.headers.get('content-type') ?? '', /javascript/);
const remembered = (await get(home)).headers.get('set-cookie') ?? '';
// The Worker marks this cookie Secure only over https (recentCookie in worker/index.mjs), so the local http check expects none.
const secure = origin.protocol === 'https:' ? '; Secure' : '';
assert.match(remembered, new RegExp(`^cockcockcock-recent=[^;]+; Path=/; Max-Age=15552000; SameSite=Lax${secure}$`), 'a club page remembers itself');

// One club address for everyone (ROLES.md 2단계): the old 운영 화면 address leads to it, and so does its app manifest.
// Right after wrangler deploy the new Worker version takes a while to reach every edge (#46 on 2026-11-26: about 35 s,
// #47), so these can briefly come from the previous release. Fetch them again until they show this one, for at most
// 60 s; what still differs after that fails the asserts below.
async function release() {
  const [page, moved, manifest, oldManifest] = await Promise.all([
    shell(home), get(admin), get(`${home}manifest.webmanifest`), get(`${admin}manifest.webmanifest`),
  ]);
  const starts = await Promise.all([manifest, oldManifest].map(response => response.ok ? response.json().then(body => body.start_url) : null));
  return { page, moved, manifest, starts };
}
const releaseOf = page => page.script.split('/')[2];
const settled = ({ page, moved, starts }) => moved.status === 308 && page.html.includes(`href="${home}manifest.webmanifest"`)
  && starts.every(start => start === home) && (!expected || releaseOf(page) === expected);
let current = await release();
const settleStart = Date.now();
let waits = 0;
while (!settled(current) && Date.now() - settleStart < 60000) {
  waits++;
  console.log(`모임 페이지가 아직 이전 배포입니다 (화면 ${releaseOf(current.page)}${expected ? `, 기다리는 화면 ${expected}` : ''}, 옛 운영 주소 ${current.moved.status}, 앱 시작 주소 ${current.starts.join(' · ')}). 5초 뒤 다시 받습니다 (${waits}번째).`);
  await wait(5000);
  current = await release();
}
if (waits) {
  const seconds = Math.round((Date.now() - settleStart) / 1000);
  console.log(settled(current) ? `${waits}번 기다린 뒤(${seconds}초) 새 배포가 됐습니다.` : `${waits}번 기다렸지만(${seconds}초) 여전히 이전 배포라 실패합니다.`);
}
const { moved, manifest, starts } = current;
if (expected) assert.equal(releaseOf(current.page), expected, `the club page serves this deploy's UI (${expected})`);
assert.equal(moved.status, 308, 'the old 운영 화면 address moves to the club address');
assert.equal(moved.headers.get('location'), new URL(home, origin).href);
assert(current.page.html.includes(`href="${home}manifest.webmanifest"`));
assert.equal(manifest.status, 200);
assert.deepEqual(starts, [home, home], 'both app manifests start at the club address');
const privateApi = await get(`${home}api/admin`);
assert.equal(privateApi.status, 401);
assert.equal(privateApi.headers.get('cache-control'), 'private, no-store');

// Every module app.mjs imports must be served from the same release folder, or the screen never leaves its skeleton.
// A file can still come from an edge without this release (404 for a moment), so a failed round fetches the page again
// and checks its release once more, for at most 60 s; what still fails then is reported.
const assets = page => Promise.all([page.style, page.script, ...['views.mjs', 'skeleton.mjs', 'shuttlecock.mjs', 'flow.mjs', 'calendar.mjs']
  .map(file => page.script.replace('app.mjs', file))].map(async path => {
  const asset = await get(path);
  assert.equal(asset.status, 200, path);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable', path);
  if (path !== page.style) return;
  const css = await asset.text();
  const urls = [...css.matchAll(/url\("(\/assets\/fonts\/[^"]+\.(woff2|ttf))"\)/g)];
  assert.equal(urls.length, 3);
  await Promise.all(urls.map(async ([, url, format]) => {
    const font = await get(url, 'HEAD');
    assert.equal(font.status, 200, url);
    assert.equal(font.headers.get('content-type'), `font/${format}`, url);
    assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable', url);
  }));
}));
let page = current.page;
const assetStart = Date.now();
for (let round = 1; ; round++) {
  try {
    // A page fetched again from an edge with the previous release must not pass with that release's files.
    if (expected) assert.equal(releaseOf(page), expected, `the club page serves this deploy's UI (${expected})`);
    await assets(page);
    if (round > 1) console.log(`${round}번째에 화면 파일이 모두 확인됐습니다 (${Math.round((Date.now() - assetStart) / 1000)}초).`);
    break;
  } catch (error) {
    if (Date.now() - assetStart >= 60000) throw error;
    console.log(`화면 파일 확인 실패(${error.message.split('\n')[0]}). 5초 뒤 모임 페이지부터 다시 받습니다 (${round}번째).`);
    await wait(5000);
    page = await shell(home);
  }
}

for (const [kind, value] of [['vote', process.env.CLUB_VOTE_PATH], ['notice', process.env.CLUB_NOTICE_PATH]]) {
  const image = new URL(`/assets/kakao-${kind}.png`, origin).href;
  if (value) {
    const url = new URL(value, origin);
    assert.equal(url.origin, origin.origin);
    assert(url.pathname.startsWith(`${home}${kind}/`));
    const page = await shell(url.pathname);
    assert.match(page.html, /property="og:image:width" content="1200"/);
    assert.match(page.html, /property="og:image:height" content="630"/);
    assert(page.html.includes(`property="og:url" content="${origin.origin}${url.pathname.replace(/\/$/, '')}"`));
    assert(page.html.includes(`<meta property="og:image" content="${image}">`));
  }
  // The shared card every other club's links use (worker/index.mjs shareTags) must be there too.
  for (const href of [image, new URL(`/assets/kakao-${kind}-common.png`, origin).href]) {
    const png = await get(href);
    assert.equal(png.status, 200, href);
    assert.match(png.headers.get('content-type') ?? '', /^image\/png\b/);
    const bytes = Buffer.from(await png.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
  }
}

// A UI file of no release is never cached (worker/index.mjs): right after a deploy an edge may still run the previous
// version, which marks it immutable, so ask again for at most 60 s.
let missing;
for (const start = Date.now(); ;) {
  missing = await get('/club-ui/00000000000000000000/live.css');
  if (missing.headers.get('cache-control') === 'no-store' || Date.now() - start > 60000) break;
  console.log('없는 화면 파일 응답이 아직 이전 배포입니다. 5초 뒤 다시 받습니다.');
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.equal(missing.status, 404);
assert.equal(missing.headers.get('cache-control'), 'no-store', 'a missing UI file is not cached');

console.log(`Verified ${origin.origin}: club shell and old 운영 화면 address, console, UI release hashes, missing UI files uncached, fonts, protected API, app manifest, share images${
  process.env.CLUB_VOTE_PATH || process.env.CLUB_NOTICE_PATH ? ', selected share previews' : ''}.`);
