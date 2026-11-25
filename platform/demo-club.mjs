import { PLATFORM_NAME } from './clubs.mjs';

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const koreanDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC',
});

export function renderDemoClub({ club, basePath, vote, notice }) {
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (!base.startsWith('/') || base.startsWith('//') || /[\\?#]/.test(base)) {
    throw new Error('Demo club basePath must be a same-site path.');
  }

  const root = escape(base);
  const brand = escape(PLATFORM_NAME);
  const name = escape(club.name);
  const clubPath = base + 'clubs/' + encodeURIComponent(club.slug) + '/';
  const votePath = escape(clubPath + 'share/vote/' + encodeURIComponent(vote.id) + '/');
  const noticePath = escape(clubPath + 'share/notice/' + encodeURIComponent(notice.id) + '/');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f2f3f1">
  <meta name="description" content="${name} 회원 화면에서 일정, 투표, 공지를 체험하세요.">
  <title>${name} · ${brand}</title>
  <link rel="stylesheet" href="${root}platform.css">
  <script src="${root}legacy-links.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#content">본문 바로가기</a>
  <header class="site-header">
    <div class="page-width header-inner">
      <a class="site-brand" href="${root}" aria-label="${brand} 등록 모임"><img class="brand-mark" width="35" height="35" src="${root}assets/shuttlecock-icon-96.png" alt="">${brand}</a>
      <a class="header-link member-admin-link" href="${escape(clubPath + 'admin/')}">운영 화면 체험</a>
    </div>
  </header>
  <main id="content" class="page-width member-page">
    <section class="hero member-hero" aria-labelledby="club-title">
      <div class="hero-copy">
        <p class="hero-label">${escape(club.subtitle)}</p>
        <h1 id="club-title">${name}</h1>
        <span class="demo-label member-demo-label">가상 데이터 체험</span>
      </div>
    </section>
    <div class="member-panel-grid">
      <section class="member-panel member-panel-vote" aria-labelledby="vote-label">
        <p id="vote-label" class="member-panel-label">다음 운동</p>
        <h2>${escape(vote.title)}</h2>
        <p class="member-vote-meta"><time datetime="${escape(vote.date)}">${escape(koreanDate.format(new Date(vote.date + 'T00:00:00Z')))}</time><span>${escape(vote.time)}–${escape(vote.endTime)}</span></p>
        <p class="member-panel-detail">${escape(vote.place)}</p>
        <a class="club-action" href="${votePath}">참석 투표 보기</a>
      </section>
      <section class="member-panel" aria-labelledby="notice-label">
        <p id="notice-label" class="member-panel-label">모임 공지</p>
        <h2>${escape(notice.title)}</h2>
        <p class="member-panel-detail">${escape(notice.body)}</p>
        <a class="club-action member-action-secondary" href="${noticePath}">공지 내용 보기</a>
      </section>
    </div>
    <p class="directory-note">체험 응답은 이 브라우저에 저장됩니다.</p>
  </main>
</body>
</html>`;
}
