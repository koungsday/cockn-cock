import { PLATFORM_NAME } from './clubs.mjs';
import { awaitingVote, memberOrder } from '../worker/public/flow.mjs';

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const courtLines = '<div class="share-art-decoration" aria-hidden="true"><span></span><span></span><span></span></div>';
const pushpin = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16v6M8 3h8l-1.5 6.5L18 13v3H6v-3l3.5-3.5z"/></svg>';
const kindLabels = { regular: '정기', flash: '번개', match: '대회', social: '모임' };
// 상단 고정 and 일정 종류 as the live views.mjs pinMark and kindPrefix draw them.
const pinMark = item => item.pinnedAt ? `<span class="pin-mark" title="상단 고정">${pushpin}<span class="sr-only">상단 고정</span></span>` : '';
const kindPrefix = event => kindLabels[event.kind] && event.kind !== 'regular' && !event.title.includes(kindLabels[event.kind]) ? `${kindLabels[event.kind]} · ` : '';
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

// The demo member home uses the live member home's markup and order (worker/public/views.mjs homeScreen, flow.mjs
// memberOrder) and the same share.css: the big card, 응답할 투표 n개, 이후 일정 and 공지 with the pinned first. The demo has
// no sign-in, so every open vote waits for the visitor, who answers as an example member; there is no 내 기록.
export function renderDemoClub({ club, basePath, events, notices, dateLabel, now }) {
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
  const listed = events.filter(event => event.date >= now.day && !event.finalized).map(event => ({
    ...event, canVote: event.pollOpen && !event.cancelled && `${event.deadline}T${event.deadlineTime}` > now.minute,
    deadlineAt: `${event.deadline}T${event.deadlineTime}`, eligible: true, mySlot: null
  })).map(event => ({ ...event, deadline: event.deadlineAt, deadlineDate: event.deadline }));
  const [next, ...others] = memberOrder(listed, now);
  const waiting = others.filter(awaitingVote);
  const later = others.filter(event => !awaitingVote(event));
  const when = event => `${dateLabel(event.date)} ${event.time}–${event.endTime}`;
  const deadline = event => `${dateLabel(event.deadlineDate)} ${event.deadline.slice(11)}`;
  // 투표하기 / 일정 확인 / 취소됨 and the sentence that explains it (the live memberEventState, as a visitor).
  const state = event => event.cancelled ? { action: '일정 확인', primary: false, row: '취소됨', note: '이 일정은 취소됐어요.' }
    : event.canVote ? { action: '투표하기', primary: true, row: '투표하기', note: '예시 회원을 골라 응답해 볼 수 있어요.' }
      : { action: '일정 확인', primary: false, row: '일정 확인', note: event.pollOpen ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.' };
  const eventRow = event => {
    const { row } = state(event);
    return `<li class="member-record"><a class="member-record-link" href="${route('vote', event.id)}">
          <span><strong>${pinMark(event)}${escape(event.title)}</strong><span class="member-record-meta"><time datetime="${escape(event.date)}">${escape(kindPrefix(event) + when(event))}</time><span>${escape(event.place)}</span>${event.canVote ? `<span>투표 마감 ${escape(deadline(event))}</span>` : ''}</span></span>
          <span class="member-record-action${row === '투표하기' ? ' member-record-open' : ''}">${row}</span></a></li>`;
  };
  const listCard = (id, title, rows) => `<section class="public-share-card member-list" aria-labelledby="${id}"><div class="public-share-content">
      <h2 id="${id}">${title}</h2><ul class="member-records">${rows.join('')}</ul></div></section>`;
  const first = next ? (() => {
    const { action, primary, note } = state(next);
    const kind = next.cancelled ? '취소된 일정' : next.canVote ? '참석 투표' : next.date === now.day ? '오늘 일정' : '다음 일정';
    return `<article class="public-share-card member-next" aria-labelledby="member-next-title">
      <header class="public-story-head share-art--vote">${courtLines}<span class="public-share-type">${kind}${pinMark(next)}</span>
        <h2 id="member-next-title" class="public-title">${escape(next.title)}</h2><time datetime="${escape(next.date)}">${escape(when(next))}</time></header>
      <div class="public-share-content">
        <dl class="public-event-facts"><div><dt>장소</dt><dd>${escape(next.place)}</dd></div><div><dt>투표 마감</dt><dd>${escape(deadline(next))}</dd></div></dl>${countsBlock(next)}
        <p class="member-answer">${note}</p>
        <a class="share-button ${primary ? 'share-button--primary' : 'share-button--secondary'} member-next-action" href="${route('vote', next.id)}">${action}</a>
      </div>
    </article>`;
  })() : listCard('member-events', '일정', []).replace('<ul class="member-records"></ul>', '<p class="public-form-note">게시된 일정이 없어요. 운영진이 일정을 올리면 여기에 보여요.</p>');
  const pinnedFirst = [...notices].sort((a, b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.date.localeCompare(a.date));
  const noticeRows = pinnedFirst.map(notice => `<li class="member-record"><a class="member-record-link" href="${route('notice', notice.id)}">
          <span><strong>${pinMark(notice)}${escape(notice.title)}</strong><time class="member-record-meta" datetime="${escape(notice.date)}">${escape(dateLabel(notice.date))}</time></span>
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
    ${first}
    ${waiting.length ? listCard('member-waiting', `응답할 투표 ${waiting.length}개`, waiting.map(eventRow)) : ''}
    ${later.length ? listCard('member-events', '이후 일정', later.map(eventRow)) : ''}
    <section class="public-share-card member-list" aria-labelledby="member-notices"><div class="public-share-content">
      <h2 id="member-notices">공지</h2><ul class="member-records">${noticeRows}</ul></div></section>
    <p class="public-form-note member-demo-note">체험 응답은 이 브라우저에만 저장돼요.</p>
  </main>
</body>
</html>`;
}
