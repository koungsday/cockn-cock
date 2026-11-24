import { cp, copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { CLUBS } from '../platform/clubs.mjs';
import { verifyDatabaseBindings } from './bindings.mjs';

const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
verifyDatabaseBindings(CLUBS, config.d1_databases);

const site = new URL('./site/', import.meta.url);
await rm(site, { recursive: true, force: true });
await cp(new URL('./public/', import.meta.url), site, { recursive: true });
await copyFile(new URL('../platform/platform.css', import.meta.url), new URL('./platform.css', site));
await mkdir(new URL('./assets/', site), { recursive: true });
for (const file of ['court.webp', 'kakao-vote.png', 'kakao-notice.png']) {
  await copyFile(new URL('../assets/' + file, import.meta.url), new URL('./assets/' + file, site));
}
