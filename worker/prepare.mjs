import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { CLUBS } from '../platform/clubs.mjs';
import { verifyDatabaseBindings } from './bindings.mjs';

const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
verifyDatabaseBindings(CLUBS, config.d1_databases);

const site = new URL('./site/', import.meta.url);
const theme = await readFile(new URL('../platform/theme.css', import.meta.url), 'utf8');
await rm(site, { recursive: true, force: true });
await cp(new URL('./public/', import.meta.url), site, { recursive: true });
const platformCss = await readFile(new URL('../platform/platform.css', import.meta.url), 'utf8');
await writeFile(new URL('./platform.css', site), theme + '\n' + platformCss);
await mkdir(new URL('./assets/', site), { recursive: true });
for (const file of [
  'court.webp', 'kakao-vote.png', 'kakao-notice.png', 'admin-icon-192.png', 'admin-icon-512.png',
  'shuttlecock-icon-96.png', 'shuttlecock-icon-192.png', 'shuttlecock-icon-512.png',
]) {
  await copyFile(new URL('../assets/' + file, import.meta.url), new URL('./assets/' + file, site));
}

const entries = await Promise.all(['live.css', 'app.mjs', 'views.mjs'].map(async file => [
  file, (file === 'live.css' ? theme + '\n' : '') + await readFile(new URL(file, site), 'utf8')
]));
const hash = createHash('sha256');
for (const [file, source] of entries) hash.update(file).update(source);
const prefix = `club-ui/${hash.digest('hex').slice(0, 20)}/`;
await mkdir(new URL(prefix, site), { recursive: true });
for (const [file, source] of entries) await writeFile(new URL(prefix + file, site), source);
const template = await readFile(new URL('index.html', site), 'utf8');
const shell = template
  .replace('href="/live.css"', `href="/${prefix}live.css"`)
  .replace('src="/app.mjs"', `src="/${prefix}app.mjs"`);
await writeFile(new URL('index.html', site), shell);
await writeFile(new URL('admin-shell.html', site), shell);
