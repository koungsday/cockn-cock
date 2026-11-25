import { PLATFORM_NAME } from './clubs.mjs';
import { shuttlecockPath } from './shuttlecock.mjs';

const restingShuttlecock = shuttlecockPath();

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function renderCatalog({ clubs, basePath, mode }) {
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (!base.startsWith('/') || base.startsWith('//') || /[\\?#]/.test(base)) {
    throw new Error('Catalog basePath must be a same-site path.');
  }

  const demo = mode === 'demo';
  const root = escape(base);
  const brand = escape(PLATFORM_NAME);
  const clubCards = clubs.map(club => {
    const href = escape(base + 'clubs/' + encodeURIComponent(club.slug) + '/');
    const clubName = escape(club.name);
    return `<li><a class="club-entry" href="${href}" aria-label="${clubName} 모임 들어가기">
      <div class="club-mark" aria-hidden="true"></div>
      <div class="club-info">
        <h3>${clubName}</h3>
        <p>${escape(club.subtitle)}</p>
      </div>
      ${club.schedule ? `<span class="club-schedule">${escape(club.schedule)}</span>` : ''}
      <span class="club-action">모임 들어가기</span>
    </a></li>`;
  }).join('');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f2ec">
  <meta name="description" content="등록된 배드민턴 모임의 일정과 공지, 참석 투표를 확인하세요.">
  <title>${brand} · 배드민턴 모임 관리</title>
  <link rel="stylesheet" href="${root}platform.css">
  <script type="module" src="${root}shuttlecock.js"></script>
  ${demo ? `<script src="${root}legacy-links.js" defer></script>` : ''}
</head>
<body>
  <a class="skip-link" href="#content">본문 바로가기</a>
  <header class="site-header">
    <div class="page-width header-inner">
      <a class="site-brand" href="${root}"><img class="brand-mark" width="35" height="35" src="${root}assets/shuttlecock-icon-96.png" alt="">${brand}</a>
      ${demo ? '<span class="demo-label">가상 데이터 체험</span>' : '<a class="header-link" href="#clubs">등록 모임</a>'}
    </div>
  </header>
  <main id="content" class="page-width">
    <section class="hero" aria-labelledby="site-title">
      <div class="hero-copy">
        <p class="hero-label">배드민턴 모임 관리</p>
        <h1 id="site-title">${brand}</h1>
        <p>참여할 모임을 선택해 일정과 공지, 참석 투표를 확인하세요.</p>
      </div>
    </section>
    <section id="clubs" class="directory" aria-labelledby="directory-title">
      <h2 id="directory-title">등록 모임</h2>
      ${clubCards ? `<ul class="club-list">${clubCards}</ul>` : '<p class="empty">현재 등록된 모임이 없습니다.</p>'}
      ${demo ? '<p class="directory-note">가상 데이터로 투표와 운영 화면을 체험할 수 있어요.</p>' : '<p class="directory-note">투표와 운영 메뉴는 해당 모임에서 로그인해 이용할 수 있어요.</p>'}
    </section>
  </main>
  <footer class="site-footer">
    <label class="shuttlecock">
      <input class="shuttlecock-toggle" type="checkbox" aria-label="셔틀콕 계속 회전" disabled>
      <svg class="shuttlecock-scene" viewBox="0 0 120 112" aria-hidden="true">
        <defs>
          <filter id="shuttlecock-gap-rounding" x="0" y="0" width="120" height="112" filterUnits="userSpaceOnUse">
            <feGaussianBlur in="SourceAlpha" stdDeviation=".75"/>
            <feComponentTransfer result="rounded-gaps">
              <feFuncA type="linear" slope="12" intercept="-6.18"/>
            </feComponentTransfer>
            <feFlood flood-color="currentColor"/>
            <feComposite in2="rounded-gaps" operator="in" result="fillets"/>
            <feMerge><feMergeNode in="fillets"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path fill="currentColor" filter="url(#shuttlecock-gap-rounding)" d="${restingShuttlecock}"/>
      </svg>
    </label>
  </footer>
</body>
</html>`;
}
