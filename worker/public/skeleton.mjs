// Loading skeletons (DESIGN.md 6): the still shape of the screen that is coming, with one moving shuttlecock in the
// middle of the screen. app.mjs draws the one for the address and the role (loadingKind); prepare.mjs puts the bare shell
// into the HTML, since the server cannot see the address after # nor who will open it.
// No imports, so prepare.mjs can run this module in Node.

const bar = css => `<span class="sk ${css}"></span>`;
const bars = (count, css) => Array.from({ length: count }, () => bar(css)).join('');
const panel = body => `<section class="panel sk-panel">${body}</section>`;
// plain: a member row (a title over its date line, the answer on the right) instead of an organiser row with its dot.
const rows = (count, plain = false) => `<div class="sk-rows">${Array.from({ length: count }, () => plain
  ? `<div class="sk-row sk-row--plain"><span class="sk-stack">${bar('sk-line')}${bar('sk-meta')}</span>${bar('sk-chip')}</div>`
  : `<div class="sk-row">${bar('sk-dot')}${bar('sk-line')}${bar('sk-chip')}</div>`).join('')}</div>`;
// The 장소·마감 lines and the 응답 현황 bars of a member's event card (views.mjs nextEventCard, memberVoteScreen).
const facts = count => `<div class="sk-facts">${bars(count, 'sk-fact')}</div>`;
const counts = `<div class="sk-counts">${bar('sk-h2')}${Array.from({ length: 3 }, () => `<span class="sk-count">${bar('sk-line')}${bar('sk-meter')}</span>`).join('')}${bar('sk-meta')}</div>`;
const head = `<div class="page-head sk-head"><div>${bar('sk-h1')}${bar('sk-text')}</div>${bar('sk-button')}</div>`;
// A member card (worker/public/views.mjs memberCard): one white surface, its label·title·date head (or none), then its
// content (단순화 2: no green or sand head).
const card = (body, head = false) => `<div class="public-share-card sk-card">${head ? `<div class="sk-card-head">${bar('sk-kicker')}${bar('sk-card-title')}${bar('sk-card-date')}</div>` : ''}
  <div class="public-share-content">${body}</div></div>`;
// A member list (views.mjs memberList): rows on the page itself under a muted label, or under the 일정 count and its
// 달력으로 보기 (tools).
const list = (count, top = 'label') => `<div class="sk-list">${top === 'tools' ? `<div class="sk-tools">${bar('sk-meta')}${bar('sk-chip')}</div>` : top ? bar('sk-meta sk-label') : ''}${rows(count, true)}</div>`;
const memberPage = (body, back = false) => `<div class="public-share-page member-page">${back ? bar('sk-back') : ''}${body}</div>`;

const bodies = {
  // 운영 권한: 운영 홈, 일정 목록 (달력 + 진행 중인 일정), 회차 상세, 그 밖의 목록 (공지·회원 관리·반기 집계·모임 규칙).
  // 운영 홈 (views.mjs adminHome): the count line with 새 일정, the 지금 할 일 card (when, title, fact, four steps, numbers,
  // bar, button), then 다른 일정 as rows.
  home: `<div class="home-page"><div class="sk-tools">${bar('sk-meta')}${bar('sk-chip')}</div>
    <div class="panel sk-panel sk-now">${bar('sk-kicker')}${bar('sk-card-title')}${bar('sk-fact')}<div class="sk-steps">${bars(4, 'sk-step')}</div>${bar('sk-line')}${bar('sk-meter')}${bar('sk-cta')}</div>
    ${list(4)}</div>`,
  // 일정 (views.mjs eventList): the count line with 달력으로 보기 and 새 일정, then rows on the page.
  'event-list': `<div class="event-page">${list(5, 'tools')}</div>`,
  // 일정 하나 (views.mjs eventScreen): ← 일정, the title with its two lines, the three tabs, then the tab's numbers,
  // bar and button over a list of names.
  event: `<div class="event-page">${bar('sk-back')}<div class="sk-event-head">${bar('sk-card-title')}${bar('sk-fact')}${bar('sk-meta')}</div>
    <div class="sk-tabs">${bars(3, 'sk-tab')}</div>
    <div class="sk-event-body">${bar('sk-h2')}${bar('sk-meter')}${bar('sk-cta')}</div>${list(4)}</div>`,
  list: `<div class="secondary-page">${head}${panel(bar('sk-h2') + rows(6))}</div>`,
  // 회원·로그인 전 (and 내 기록·공지 하나, the same screens for everyone): one card for the next event, lists as rows.
  'member-home': memberPage(card(facts(2) + counts + bar('sk-text') + bar('sk-cta'), true) + list(3)),
  'member-events': memberPage(list(3, 'tools')),
  'member-vote': memberPage(card(facts(3) + `<div class="sk-choices">${bars(3, 'sk-choice')}</div>` + bar('sk-cta') + counts, true), true),
  'member-notices': memberPage(list(4, '')),
  notice: memberPage(card(bars(2, 'sk-line') + bar('sk-text'), true), true),
  record: memberPage(card(bar('sk-h1') + `<div class="sk-months">${bars(12, 'sk-month')}</div>` + bar('sk-text') + `<div class="sk-slots">${bars(3, 'sk-slot')}</div>`)),
};

// kind: one of the bodies above; '' draws the shell alone (the HTML's first paint). operating: seven menu bars, else four.
export function shellSkeleton(kind = '', operating = false) {
  return `<div class="admin-app admin-skeleton" aria-hidden="true">
    <aside class="sidebar"><div class="brand"><img class="brand-mark" width="43" height="43" src="/assets/shuttlecock-icon-96.png" alt="">${bar('sk-brand')}</div>
      <div class="sk-nav">${bars(operating ? 7 : 4, 'sk-nav-item')}</div></aside>
    <div class="main-shell">
      <div class="topbar">${bar('sk-crumb')}${bar('sk-icon')}</div>
      <div class="main-content admin-content">${bodies[kind] ?? ''}</div>
      <div class="tab-bar">${Array.from({ length: 4 }, () => `<span class="tab-bar-link">${bar('sk-icon')}</span>`).join('')}</div>
    </div>
  </div>`;
}

// The skeleton for an address (#section/item) and a role, before the screen's data arrives. A section only an organiser
// has opens their list even when the role is not known yet.
export function loadingKind(hash, operating) {
  const [section = '', item = ''] = hash.replace(/^#/, '').split('/');
  if (section === 'notices' && item) return 'notice';
  if (section === 'record') return 'record';
  if (['members', 'progress', 'rules'].includes(section)) return 'list';
  if (operating) return section === 'event' ? (item ? 'event' : 'event-list') : section === 'notices' ? 'list' : 'home';
  return section === 'event' ? (item ? 'member-vote' : 'member-events') : section === 'notices' ? 'member-notices' : 'member-home';
}

// The one moving thing while a screen loads: the shuttlecock in the middle of the viewport, with its sentence.
export function loadingCenter(shuttle, text = '모임을 불러오는 중이에요.') {
  return `<main id="main-content" class="loading-center" tabindex="-1"><div class="shuttle-loader" role="status">${shuttle}<span>${text}</span></div></main>`;
}
