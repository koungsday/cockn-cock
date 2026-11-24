import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = process.env.SITE_URL || (productionHost && `https://${productionHost}`);
if (process.env.VERCEL === '1' && !siteUrl) {
  throw new Error('Vercel production URL is missing. Enable the system environment variables or set SITE_URL.');
}
const site = new URL(siteUrl || 'http://localhost:4173');
const isLoopback = site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname);
if ((site.protocol !== 'https:' && !isLoopback) || site.username || site.password || site.search || site.hash) {
  throw new Error('SITE_URL must be an HTTPS URL or a local HTTP URL.');
}
if (!site.pathname.endsWith('/')) site.pathname += '/';

const window = { localStorage: { getItem: () => null } };
runInNewContext(await readFile(join(root, 'state.js'), 'utf8'), { window }, { filename: 'state.js' });
const { load, dateLabel } = window.clubModel;
const seed = load();
const event = seed.events.find(item => item.id === 'e-nov28');
const notice = seed.notices.find(item => item.id === 'n-schedule');
if (!event || !notice) throw new Error('The share demo fixtures are missing.');

const entries = [
  {
    kind: 'vote',
    item: event,
    category: '참석 투표',
    publicFields: ['id', 'title', 'date', 'time', 'endTime', 'place', 'deadline', 'deadlineTime', 'earlyTime', 'lateTime', 'notes', 'pollOpen', 'finalized'],
    description: `${dateLabel(event.date)} ${event.time}–${event.endTime} · ${event.place}`,
    body: event.notes,
    cta: '투표 화면 체험하기',
  },
  {
    kind: 'notice',
    item: notice,
    category: '모임 공지',
    publicFields: ['id', 'title', 'date', 'body'],
    description: notice.body.replace(/\s+/g, ' ').trim(),
    body: notice.body,
    cta: '회원 화면 체험하기',
  },
];
const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value).replace(/[&<>"']/g, char => escapes[char]);

function shareUrl(kind, id) {
  return new URL(`share/${kind}/${id}/`, site);
}

function shareHtml(entry) {
  const { kind, item, category, description, body, cta } = entry;
  const title = `${category} · ${item.title} | 썬콕19`;
  const canonical = shareUrl(kind, item.id);
  const image = new URL(`assets/kakao-${kind}.png`, site);
  const demoRoute = `${site.pathname}#public-${kind}/${encodeURIComponent(item.id)}`;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${escape(canonical.href)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="썬콕19">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(canonical.href)}">
  <meta property="og:image" content="${escape(image.href)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escape(`${item.title} ${category} 카드`)}">
  <link rel="stylesheet" href="${escape(site.pathname)}styles.css">
  <link rel="stylesheet" href="${escape(site.pathname)}share.css">
</head>
<body>
  <main class="public-share-page">
    <div class="public-masthead">
      <a class="public-brand" href="${escape(site.pathname)}"><strong>썬콕19</strong></a>
      <span class="public-example">가상 데이터 예시</span>
    </div>
    <article class="public-share-card">
      <header class="public-story-head share-art--${kind}">
        <span class="public-share-type">${category}</span>
        <h1>${escape(item.title)}</h1>
        ${kind === 'notice' ? `<time datetime="${escape(item.date)}">${escape(dateLabel(item.date))}</time>` : ''}
      </header>
      <div class="public-share-content">
        ${kind === 'vote' ? `<p class="public-share-body">${escape(description)}</p>` : ''}
        <p class="public-share-body">${escape(body)}</p>
        <p class="public-share-body"><a class="share-button share-button--primary" href="${escape(demoRoute)}">${cta}</a></p>
      </div>
    </article>
  </main>
</body>
</html>
`;
}

await rm(dist, { recursive: true, force: true });
const staticFiles = [
  'styles.css', 'share.css', 'state.js', 'screens.js', 'share.js', 'app.js',
  'assets/court.webp', 'assets/kakao-notice.png', 'assets/kakao-vote.png',
];
for (const source of staticFiles) {
  const destination = join(dist, source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, source), destination);
}
const appScript = '<script defer src="app.js"></script>';
const index = await readFile(join(root, 'index.html'), 'utf8');
if (!index.includes(appScript)) throw new Error('The demo entry script is missing.');
await writeFile(
  join(dist, 'index.html'),
  index.replace(appScript, `<script defer src="published-shares.js"></script>
  ${appScript}`),
);
const publishedShares = Object.fromEntries(entries.map(({ kind, item, publicFields }) => [
  kind,
  {
    href: shareUrl(kind, item.id).href,
    fields: Object.fromEntries(publicFields.map(field => [field, item[field]])),
  },
]));
await writeFile(join(dist, 'published-shares.js'), `window.clubPublishedShares = ${JSON.stringify(publishedShares)};
`);

for (const entry of entries) {
  const destination = join(dist, 'share', entry.kind, entry.item.id, 'index.html');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, shareHtml(entry));
}
console.log(`Built ${staticFiles.length + 2} runtime files and ${entries.length} share pages in dist/.`);
