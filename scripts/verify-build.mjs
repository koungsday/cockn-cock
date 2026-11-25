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
const memberHome = (await read(clubPath)).toString();
const adminPath = clubPath + 'admin/';
const home = (await read(adminPath)).toString();
assert(catalog.includes(PLATFORM_NAME));
assert(catalog.includes(club.name));
assert(catalog.includes(`href="${remote?.pathname ?? ''}${clubPath}"`) ||
  (!remote && catalog.includes(`${clubPath}"`)), 'the directory links to the club page');
assert.doesNotMatch(catalog, /CLUB_AUTH_PEPPER|CLUB_ADMIN_PASSWORD|예시 회원|roster/);
assert(memberHome.includes(`<title>${club.name} · ${PLATFORM_NAME}</title>`));
assert(home.includes(`<title>${club.name} · ${PLATFORM_NAME}</title>`));
assert(memberHome.includes('/' + adminPath + '"'));
assert(memberHome.includes('/' + clubPath + 'share/vote/e-nov28/"'));
assert.doesNotMatch(memberHome, /<form\b|CLUB_ADMIN_PASSWORD/);
const basePath = /<meta name="platform-home" content="([^"]+)">/.exec(home)?.[1];
assert(basePath, 'the club demo links back to the directory');
assert((await read('platform.css')).length > 0);
const legacy = (await read('legacy-links.js')).toString();
let redirect;
const oldHash = '#public-vote/e-nov28';
runInNewContext(legacy, { location: { hash: oldHash, search: '', replace: target => { redirect = target; } } });
assert.equal(redirect, basePath + adminPath + oldHash);
redirect = undefined;
runInNewContext(legacy, { location: { hash: '#clubs', search: '', replace: target => { redirect = target; } } });
assert.equal(redirect, undefined);
const required = ['styles.css', 'share.css', 'state.js', 'screens.js', 'share.js', 'published-shares.js', 'app.js'];
const runtime = new Map();
for (const file of required) {
  assert(home.includes(`="${basePath}${file}"`), `${file} is referenced by the demo`);
  const content = await read(file);
  assert(content.length > 0, `${file} is available`);
  if (file.endsWith('.js')) runtime.set(file, content.toString());
}
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
for (const file of ['state.js', 'share.js']) {
  runInNewContext(runtime.get(file), { URL, window }, { filename: file });
}
const seed = window.clubModel.load();
const { linkFor } = window.clubShare;

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
  assert(html.includes(`href="${clubBase.pathname}admin/${demoHash}"`));
  assert.doesNotMatch(html, /<script\b|<form\b|김서윤|localStorage/);

  const records = kind === 'vote' ? seed.events : seed.notices;
  const item = records.find(record => record.id === id);
  const adminBase = new URL('admin/', clubBase);
  window.location = new URL('#home', adminBase);
  const localHref = new URL(demoHash, adminBase).href;
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
