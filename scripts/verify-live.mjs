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

const [memberPage, adminPage, privateApi, manifest] = await Promise.all([
  shell(home), shell(admin), get(`${home}api/admin`), get(`${admin}manifest.webmanifest`),
]);
assert.equal(memberPage.style, adminPage.style);
assert.equal(memberPage.script, adminPage.script);
assert(!memberPage.html.includes('rel="manifest"'));
assert(adminPage.html.includes(`href="${admin}manifest.webmanifest"`));
assert.equal(privateApi.status, 401);
assert.equal(privateApi.headers.get('cache-control'), 'private, no-store');
assert.equal(manifest.status, 200);
assert.equal((await manifest.json()).start_url, admin);

const views = adminPage.script.replace('app.mjs', 'views.mjs');
await Promise.all([adminPage.style, adminPage.script, views].map(async path => {
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
  const png = await get(image);
  assert.equal(png.status, 200);
  assert.match(png.headers.get('content-type') ?? '', /^image\/png\b/);
  const bytes = Buffer.from(await png.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
}

console.log(`Verified ${origin.origin}: member/admin shells, UI release hashes, fonts, protected API, app manifest, share images${
  process.env.CLUB_VOTE_PATH || process.env.CLUB_NOTICE_PATH ? ', selected share previews' : ''}.`);
