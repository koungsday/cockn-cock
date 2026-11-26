import assert from 'node:assert/strict';
import { CLUBS } from '../platform/clubs.mjs';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
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

const [privateApi, manifest] = await Promise.all([get(`${home}api/admin`), get(`${admin}manifest.webmanifest`)]);
// Right after wrangler deploy the new Worker version takes a while to reach every edge (#46 on 2026-11-26: about 35 s),
// so the two pages can briefly come from different releases. Fetch both again until they match, for at most 60 s;
// a mismatch that outlasts that still fails the assert below.
let [memberPage, adminPage] = await Promise.all([shell(home), shell(admin)]);
const settleStart = Date.now();
let waits = 0;
while (memberPage.style !== adminPage.style && Date.now() - settleStart < 60000) {
  waits++;
  console.log(`회원·운영 페이지의 화면 묶음이 다릅니다 (회원 ${memberPage.style} / 운영 ${adminPage.style}). 5초 뒤 다시 받습니다 (${waits}번째).`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  [memberPage, adminPage] = await Promise.all([shell(home), shell(admin)]);
}
if (waits) {
  const seconds = Math.round((Date.now() - settleStart) / 1000);
  console.log(memberPage.style === adminPage.style
    ? `${waits}번 기다린 뒤(${seconds}초) 두 페이지가 같은 화면 묶음이 됐습니다.`
    : `${waits}번 기다렸지만(${seconds}초) 여전히 달라 실패합니다.`);
}
assert.equal(memberPage.style, adminPage.style);
assert.equal(memberPage.script, adminPage.script);
assert(!memberPage.html.includes('rel="manifest"'));
assert(adminPage.html.includes(`href="${admin}manifest.webmanifest"`));
assert.equal(privateApi.status, 401);
assert.equal(privateApi.headers.get('cache-control'), 'private, no-store');
assert.equal(manifest.status, 200);
assert.equal((await manifest.json()).start_url, admin);

// Every module app.mjs imports must be served from the same release folder, or the screen never leaves its skeleton.
const modules = ['views.mjs', 'skeleton.mjs', 'shuttlecock.mjs', 'flow.mjs'].map(file => adminPage.script.replace('app.mjs', file));
await Promise.all([adminPage.style, adminPage.script, ...modules].map(async path => {
  const asset = await get(path);
  assert.equal(asset.status, 200, path);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable', path);
  if (path !== adminPage.style) return;
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

console.log(`Verified ${origin.origin}: member/admin shells, console, UI release hashes, fonts, protected API, app manifest, share images${
  process.env.CLUB_VOTE_PATH || process.env.CLUB_NOTICE_PATH ? ', selected share previews' : ''}.`);
