import { cp, copyFile, mkdir, rm } from 'node:fs/promises';

const site = new URL('./site/', import.meta.url);
await rm(site, { recursive: true, force: true });
await cp(new URL('./public/', import.meta.url), site, { recursive: true });
await mkdir(new URL('./assets/', site), { recursive: true });
for (const file of ['court.webp', 'kakao-vote.png', 'kakao-notice.png']) {
  await copyFile(new URL('../assets/' + file, import.meta.url), new URL('./assets/' + file, site));
}
