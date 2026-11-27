import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { shuttlecockMark } from '../platform/shuttlecock.mjs';
import { loadingCenter, shellSkeleton } from './public/skeleton.mjs';

const site = new URL('./site/', import.meta.url);
const theme = (await readFile(new URL('../platform/theme.css', import.meta.url), 'utf8')).replaceAll('../assets/fonts/', '/assets/fonts/');
await rm(site, { recursive: true, force: true });
await cp(new URL('./public/', import.meta.url), site, { recursive: true });
const platformCss = await readFile(new URL('../platform/platform.css', import.meta.url), 'utf8');
await writeFile(new URL('./platform.css', site), theme + '\n' + platformCss);
await copyFile(new URL('../platform/shuttlecock.mjs', import.meta.url), new URL('./shuttlecock.js', site));
await copyFile(new URL('../platform/recent-club.js', import.meta.url), new URL('./recent-club.js', site));
await mkdir(new URL('./assets/', site), { recursive: true });
await cp(new URL('../assets/fonts/', import.meta.url), new URL('./assets/fonts/', site), { recursive: true });
for (const file of [
  'court.webp', 'kakao-vote.png', 'kakao-notice.png', 'kakao-vote-common.png', 'kakao-notice-common.png', 'admin-icon-192.png', 'admin-icon-512.png', 'intro-member.webp', 'intro-admin.webp',
  'shuttlecock-icon-96.png', 'shuttlecock-icon-192.png', 'shuttlecock-icon-512.png',
]) {
  await copyFile(new URL('../assets/' + file, import.meta.url), new URL('./assets/' + file, site));
}

// The demo's stylesheets are the shared design layer (DESIGN.md); live.css only adds live-only screens.
const shared = (await Promise.all(['../styles.css', '../share.css'].map(file => readFile(new URL(file, import.meta.url), 'utf8'))))
  .join('\n').replaceAll("url('assets/", "url('/assets/");
const entries = [
  ['form-pickers.js', await readFile(new URL('../platform/form-pickers.js', import.meta.url), 'utf8')],
  ['live.css', `${theme}\n${shared}\n${await readFile(new URL('live.css', site), 'utf8')}`],
  ['app.mjs', await readFile(new URL('app.mjs', site), 'utf8')],
  ['views.mjs', await readFile(new URL('views.mjs', site), 'utf8')],
  ['skeleton.mjs', await readFile(new URL('skeleton.mjs', site), 'utf8')],
  ['flow.mjs', await readFile(new URL('flow.mjs', site), 'utf8')],
  ['calendar.mjs', await readFile(new URL('calendar.mjs', site), 'utf8')],
  ['shuttlecock.mjs', await readFile(new URL('../platform/shuttlecock.mjs', import.meta.url), 'utf8')],
];
const hash = createHash('sha256');
for (const [file, source] of entries) hash.update(file).update(source);
const prefix = `club-ui/${hash.digest('hex').slice(0, 20)}/`;
await mkdir(new URL(prefix, site), { recursive: true });
for (const [file, source] of entries) await writeFile(new URL(prefix + file, site), source);
const template = await readFile(new URL('index.html', site), 'utf8');
const shell = template
  .replace('href="/live.css"', `href="/${prefix}live.css"`)
  .replace('src="/app.mjs"', `src="/${prefix}app.mjs"`);
// The first paint is the one shell everyone has (ROLES.md 2단계) with an empty body: the server sees neither the address
// after # nor who opens it, and a wrong screen's shape is worse than none. app.mjs draws the screen's skeleton at once.
const loading = loadingCenter(shuttlecockMark('shuttle-spin', 'shuttle-gap-static'));
await writeFile(new URL('index.html', site), shell.replace('<!-- loading -->', () => shellSkeleton() + loading));
