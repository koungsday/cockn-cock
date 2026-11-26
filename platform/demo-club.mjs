import { PLATFORM_NAME } from './clubs.mjs';

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const courtLines = '<div class="share-art-decoration" aria-hidden="true"><span></span><span></span><span></span></div>';
const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

// 응답 현황, as the live countsBlock (worker/public/views.mjs) draws it: counts on the event's roster, never names.
function countsBlock(event) {
  const count = slot => event.roster.filter(id => event.votes[id] === slot).length;
  const counts = { early: count('early'), late: count('late'), lunch: event.roster.filter(id => event.lunch?.[id]).length };
  const coming = counts.early + counts.late;
  if (!coming && !counts.lunch) return '<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>아직 응답이 없어요</span></p></div>';
  const rows = [[`${event.earlyTime} 선발`, counts.early, 'slot'], [`${event.lateTime} 후발`, counts.late, 'slot'], ['점심 함께', counts.lunch, 'lunch']];
  return `<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>참석 ${coming}명</span></p>
  <ul>${rows.map(([label, n, tone]) => `<li><span>${escape(label)}</span><strong>${n}명</strong><svg class="member-count-bar" viewBox="0 0 ${Math.max(coming, counts.lunch)} 1" preserveAspectRatio="none" aria-hidden="true"><rect class="member-count-${tone}" width="${n}" height="1"/></svg></li>`).join('')}</ul>
  <p class="member-counts-note">누가 응답했는지는 보이지 않아요</p></div>`;
}

// The demo member home uses the live member home's markup (worker/public/views.mjs homeScreen) and the same share.css.
// The demo has no sign-in, so the next event always offers 투표하기 with an example member, and there is no 내 기록.
export function renderDemoClub({ club, basePath, vote, notices, dateLabel }) {
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (!base.startsWith('/') || base.startsWith('//') || /[\\?#]/.test(base)) {
    throw new Error('Demo club basePath must be a same-site path.');
  }

  const root = escape(base);
  const brand = escape(PLATFORM_NAME);
  const name = escape(club.name);
  const home = base + 'clubs/' + encodeURIComponent(club.slug) + '/';
  const admin = home + 'admin/';
  const route = (kind, id) => escape(`${admin}#public-${kind}/${encodeURIComponent(id)}`);
  const noticeRows = notices.map(notice => `<li class="member-record"><a class="member-record-link" href="${route('notice', notice.id)}">
          <span><strong>${escape(notice.title)}</strong><time class="member-record-meta" datetime="${escape(notice.date)}">${escape(dateLabel(notice.date))}</time></span>
          <span class="member-record-arrow" aria-hidden="true">${chevron}</span></a></li>`).join('');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f2ec">
  <meta name="description" content="${name} 회원 화면에서 일정, 투표, 공지를 체험하세요.">
  <title>${name} · ${brand}</title>
  <link rel="icon" type="image/png" sizes="96x96" href="${root}assets/shuttlecock-icon-96.png">
  <link rel="stylesheet" href="${root}styles.css">
  <link rel="stylesheet" href="${root}share.css">
  <link rel="stylesheet" href="${root}platform.css">
  <script src="${root}legacy-links.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main-content">본문 바로가기</a>
  <header class="site-header">
    <div class="page-width header-inner">
      <a class="site-brand" href="${escape(home)}" aria-label="${name} 모임 홈"><img class="brand-mark" width="35" height="35" src="${root}assets/shuttlecock-icon-96.png" alt="">${brand}</a>
      <a class="header-link" href="${escape(admin)}">운영 화면 체험</a>
    </div>
  </header>
  <main id="main-content" class="public-share-page member-page" tabindex="-1">
    <div class="member-demo-head">
      <h1>${name} <span class="sr-only">모임 홈</span></h1>
      <span class="demo-label">가상 데이터 체험</span>
    </div>
    <article class="public-share-card member-next" aria-labelledby="member-next-title">
      <header class="public-story-head share-art--vote">${courtLines}<span class="public-share-type">참석 투표</span>
        <h2 id="member-next-title" class="public-title">${escape(vote.title)}</h2><time datetime="${escape(vote.date)}">${escape(dateLabel(vote.date))} ${escape(vote.time)}–${escape(vote.endTime)}</time></header>
      <div class="public-share-content">
        <dl class="public-event-facts"><div><dt>장소</dt><dd>${escape(vote.place)}</dd></div><div><dt>투표 마감</dt><dd>${escape(dateLabel(vote.deadline))} ${escape(vote.deadlineTime)}</dd></div></dl>${countsBlock(vote)}
        <p class="member-answer">예시 회원을 골라 응답해 볼 수 있어요.</p>
        <a class="share-button share-button--primary member-next-action" href="${route('vote', vote.id)}">투표하기</a>
      </div>
    </article>
    <section class="public-share-card member-list" aria-labelledby="member-notices"><div class="public-share-content">
      <h2 id="member-notices">공지</h2><ul class="member-records">${noticeRows}</ul></div></section>
    <p class="public-form-note member-demo-note">체험 응답은 이 브라우저에만 저장돼요.</p>
  </main>
</body>
</html>`;
}
