import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

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

const home = (await read()).toString();
assert.match(home, /<title>썬콕19/);
const required = ['styles.css', 'share.css', 'state.js', 'screens.js', 'share.js', 'published-shares.js', 'app.js'];
const runtime = new Map();
for (const file of required) {
  assert(home.includes(`="${file}"`), `${file} is referenced by the demo`);
  const content = await read(file);
  assert(content.length > 0, `${file} is available`);
  if (file.endsWith('.js')) runtime.set(file, content.toString());
}
assert(home.indexOf('src="published-shares.js"') < home.indexOf('src="app.js"'));
assert((await read('assets/court.webp')).length > 0);

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
  const path = `share/${kind}/${id}/`;
  const html = (await read(path)).toString();
  const head = /<head>([\s\S]+?)<\/head>/.exec(html)?.[1];
  assert(head, `${path} has a head element`);
  const og = Object.fromEntries(
    Array.from(head.matchAll(/<meta property="og:([\w:]+)" content="([^"]+)">/g), ([, name, value]) => [name, value]),
  );
  assert(og.title.includes(title), `${path} OG title`);
  assert(og.description.length > 0, `${path} OG description`);
  const canonical = new URL(og.url);
  assert(canonical.pathname.endsWith('/' + path));
  const base = new URL('../../../', canonical);
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
  assert(html.includes(`href="${base.pathname}${demoHash}"`));
  assert.doesNotMatch(html, /<script\b|<form\b|김서윤|localStorage/);

  const records = kind === 'vote' ? seed.events : seed.notices;
  const item = records.find(record => record.id === id);
  window.location = new URL('#home', base);
  const localHref = new URL(demoHash, base).href;
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
