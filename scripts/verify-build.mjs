import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
assert.match(home, /<title>콕앤콕/);
const required = ['styles.css', 'share.css', 'state.js', 'screens.js', 'share.js', 'app.js'];
for (const file of required) {
  assert(home.includes(`="${file}"`), `${file} is referenced by the demo`);
  assert((await read(file)).length > 0, `${file} is available`);
}
assert((await read('assets/court.webp')).length > 0);

for (const [kind, id, title] of [
  ['vote', 'e-nov28', '토요 정기 운동'],
  ['notice', 'n-schedule', '11월 정기 운동 안내'],
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
  assert(html.includes(`href="${base.pathname}#public-${kind}/${id}"`));
  assert.doesNotMatch(html, /<script\b|<form\b|김서윤|localStorage/);
  console.log(`Verified ${og.url}: HTML head, canonical URL, OG PNG 1200×630, member demo link.`);
}
console.log('Verified demo routes and runtime assets.');
