(() => {
  const model = window.clubModel;
  const {today, dateLabel, counts, attendanceCounts, stats, addDays, deadlinePassed, settlement, qualification} = model;
  const app = document.querySelector('#app');
  const modal = document.querySelector('#dialog');
  const mobileNav = document.querySelector('#mobile-navigation');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const menuIcon = '<svg class="menu-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path class="menu-icon-top" d="M4 9h16"/><path class="menu-icon-bottom" d="M4 15h16"/></svg>';
  let menuClosing = null;
  const toast = document.querySelector('#toast');
  const state = model.load();
  const ui = {memberQuery:'', memberStatus:'active', statsMonth:today.slice(0, 7), publicReceipts:{}};
  // The live menu names (ROLES.md 3단계: worker/public/views.mjs organizerSections) where the demo has the same screen;
  // 반복 설정 is the demo's own (the live club has 모임 규칙 instead).
  const pages = [
    ['home','홈','home'], ['events','일정','calendar'], ['notices','공지','megaphone'],
    ['members','회원 관리','users'], ['stats','반기 집계','chart'], ['repeat','반복 설정','repeat']
  ];
  // 회원 보기: the live member menus (memberSections). The demo has no sign-in, so the top bar switches between views.
  const memberPages = [['member','홈','home'], ['member-events','일정','calendar'], ['member-notices','공지','megaphone'], ['member-record','내 기록','user']];
  // 'members' (회원 관리) is an organiser page: only 'member' and 'member-…' are the member view.
  const memberView = route => route.page === 'member' || route.page.startsWith('member-') || route.page.startsWith('public-');
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    user:'<circle cx="12" cy="7" r="3.5"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9" cy="7" r="4"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3-.6 2.5-2 .9L5 5.2 3.2 7l1.2 2.4-.9 2L1 12l.6 2.5 2.5.5 1 2-1.2 2.5L6 21.2l2.4-1.2 2 .8.6 2.2H14l.6-2.4 2-.9 2.4 1.2 1.8-1.8-1.2-2.4.9-2 2.5-.6v-2.5l-2.5-.6-.9-2 1.2-2.4L19 5l-2.4 1.2-2-.9L14 3z" transform="translate(1 0) scale(.92)"/>',
    repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15m-14 16-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
    chart:'<path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5"/>',
    clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>',
    'chevron-right':'<path d="m9 6 6 6-6 6"/>',
    'chevron-left':'<path d="m15 6-6 6 6 6"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    'arrow-left':'<path d="m12 19-7-7 7-7m-7 7h15"/>',
    edit:'<path d="m14 5 5 5M4 20l4.5-1 12-12-3.5-3.5-12 12z"/>',
    megaphone:'<path d="m3 11 15-6v14L3 15v-4Zm3 5 2.5 5h3l-2-4m11-6 1-1m-1 5 1 1"/>',
    share:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    // 상단 고정: a push pin, as the live views.mjs (the map marker above is `pin`, for places).
    pushpin:'<path d="M12 16v6M8 3h8l-1.5 6.5L18 13v3H6v-3l3.5-3.5z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };

  function icon(name, size=20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  }
  function avatar(member, extra='') {
    const seed = Array.from(member?.name || '').reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    return `<span class="avatar tone-${seed % 5} ${escape(extra)}" aria-hidden="true">${escape((member?.name || '?').slice(0, 1))}</span>`;
  }

  const platformHome = document.querySelector('meta[name=platform-home]')?.content;
  const brandAsset = `${platformHome ?? ''}assets/shuttlecock-icon-96.png`;
  // 일정 흐름 rules shared with the live club (see flowEvent below).
  const flow = window.clubFlow;
  const flowNow = {day: today, minute: model.demoNow};
  const pinLimit = 3;
  const kindLabels = {regular:'정기', flash:'번개', match:'대회', social:'모임'};
  const helpers = {escape, icon, dateLabel, today, counts, attendanceCounts, stats, avatar, deadlinePassed, settlement, qualification, brandAsset,
    flowEvents, flowFacts, finishedEvents, pinMark, kindPrefix, kindLabels, defaultTab, pinLimit, flowNow, calendar, calendarOpen, calendarToggle, onlyUnmarked, justChecked};
  let currentRoute = {page:'home'};
  let dialogTrigger;
  let toastTimer;
  let navScroll = null;
  let navTrigger;

  function routeFromHash() {
    let hash = location.hash;
    const pastedLink = hash.indexOf(`${location.origin}${location.pathname}#`);
    if (pastedLink > 1) {
      hash = hash.slice(0, pastedLink);
      history.replaceState(history.state, '', hash);
    }
    const [page, id, tab] = hash.slice(1).split('/');
    // #event alone is the 일정 list, as in the live club (DESIGN.md 4).
    if (page === 'event' && !id) return {page:'events'};
    if (page === 'event' || page === 'public-notice' || page === 'public-vote') return {page, id, tab:['attendance','settlement'].includes(tab) ? tab : 'poll'};
    return {page:[...pages, ...memberPages].some(([key]) => key === page) ? page : 'home'};
  }
  function routeTo(target) {
    const before = currentRoute;
    const fromDialog = modal.open;
    const sameRoute = location.hash === '#' + target;
    if (mobileNav.open) closeMobileMenu(sameRoute, !sameRoute);
    if (sameRoute) {
      if (fromDialog) modal.close();
      return;
    }
    location.hash = target;
  }
  // The side a page comes in from (the live goTo): a later menu or an item opened from its list from the right, an
  // earlier menu or back to the list from the left; another tab of the same event does not move.
  function arriveSide(before, after) {
    const order = [...pages, ...memberPages].map(([key]) => key);
    const menu = route => ({event:'events', 'public-vote':'member-events', 'public-notice':'member-notices'})[route.page] ?? route.page;
    if (menu(before) === menu(after) && (before.id ?? '') === (after.id ?? '')) return '';
    const step = order.indexOf(menu(after)) - order.indexOf(menu(before));
    return step > 0 || (!step && after.id) ? 'next' : 'back';
  }
  function currentLabel(route) {
    if (route.page === 'event' || route.page === 'public-vote') return '일정';
    if (route.page === 'public-notice') return '공지';
    return [...pages, ...memberPages].find(([key]) => key === route.page)?.[1] || '홈';
  }
  function persist(message) {
    showToast(model.save(state) ? message : message + ' · 브라우저 저장 공간을 사용할 수 없어요.');
  }
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3700);
  }
  function readPeriod(date) {
    const [, month, day] = date.split('-').map(Number);
    return `${month}월 ${day}일`;
  }
  function fullDate(date) {
    const label = dateLabel(date);
    return label.replace(/ \(([일월화수목금토])\)$/, ' $1요일');
  }
  function brand() {
    return `<a class="brand" href="#home" data-route="home"><img class="brand-mark" width="43" height="43" src="${escape(brandAsset)}" alt=""><span><strong>썬콕19</strong><small>일요 배드민턴 모임</small></span></a>`;
  }
  function navLink([key, label, glyph], active) {
    return `<a class="nav-link${active === key ? ' active' : ''}" href="#${key}" data-route="${key}"${active === key ? ' aria-current="page"' : ''}>${icon(glyph,19)}<span>${label}</span>${active === key ? '<i aria-hidden="true"></i>' : ''}</a>`;
  }
  function menuLinks(active, member) {
    if (member) {
      return `<nav class="navigation" aria-label="모임 메뉴"><div class="nav-heading">모임</div>${memberPages.map(item => navLink(item, active)).join('')}</nav>`;
    }
    return `<nav class="navigation" aria-label="모임 메뉴">
      <div class="nav-heading">모임 운영</div>
      ${pages.slice(0, 5).map(item => navLink(item, active)).join('')}
      <div class="nav-heading nav-heading-settings">설정</div>
      ${navLink(pages[5], active)}
    </nav>`;
  }
  function menuPage() {
    return {event:'events', 'public-vote':'member-events', 'public-notice':'member-notices'}[currentRoute.page] ?? currentRoute.page;
  }
  // Phones: the first four sections stay one tap away; 더보기 opens the full menu (DESIGN.md 4).
  // Same markup as the live app (worker/public/views.mjs adminTabBar): four icons; the menu opens from the top bar.
  function tabBar(active, member) {
    const current = (member ? memberPages : pages).slice(0, 4).findIndex(([key]) => key === active);
    return `<nav class="tab-bar" aria-label="바로가기"${current < 0 ? '' : ` data-current="${current}"`}>
      ${current < 0 ? '' : '<span class="tab-bar-mark" aria-hidden="true"></span>'}${(member ? memberPages : pages).slice(0, 4).map(([key, label, glyph]) => `<a class="tab-bar-link" href="#${key}" data-route="${key}" title="${label}"${active === key ? ' aria-current="page"' : ''}>${icon(glyph,23)}<span class="sr-only">${label}</span></a>`).join('')}
    </nav>`;
  }
  // Same drawer as the live app (worker/public/app.mjs openAdminMenu): the top bar's two lines turn into × in place.
  function openMobileMenu(trigger) {
    if (mobileNav.open) return;
    mobileNav.innerHTML = `<button class="icon-button menu-toggle" type="button" data-action="close-menu" aria-label="메뉴 닫기" autofocus>${menuIcon}</button>
    <div class="menu-panel"><header class="mobile-nav-header">${brand()}</header><div class="mobile-nav-links">
      ${platformHome ? `<a class="platform-link" href="${escape(platformHome)}">콕콕콕! 모임 목록</a>` : ''}
      ${menuLinks(menuPage(), memberView(currentRoute))}
    </div></div>`;

    navScroll = Math.max(window.scrollY, 0);
    navTrigger = trigger;
    document.body.style.setProperty('--menu-scroll-top', `-${navScroll}px`);
    document.documentElement.classList.add('menu-locked');
    mobileNav.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  }
  function unlockMobileMenu(restoreFocus) {
    if (navScroll === null) return;
    const scroll = navScroll;
    navScroll = null;
    document.documentElement.classList.remove('menu-locked');
    document.body.style.removeProperty('--menu-scroll-top');
    window.scrollTo(0, scroll);
    if (navTrigger?.isConnected) {
      navTrigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) navTrigger.focus({preventScroll:true});
    }
  }
  // ×, Esc and the dim area slide the drawer back out; moving to another page closes it at once.
  function closeMobileMenu(restoreFocus = true, instant = false) {
    if (menuClosing) {
      if (!instant) return;
      clearTimeout(menuClosing);
      menuClosing = null;
    }
    const finish = () => {
      mobileNav.classList.remove('is-closing');
      if (mobileNav.open) mobileNav.close();
      unlockMobileMenu(restoreFocus);
    };
    if (!instant && mobileNav.open && !reducedMotion.matches) {
      mobileNav.classList.add('is-closing');
      menuClosing = setTimeout(() => {
        menuClosing = null;
        finish();
      }, 220);
      return;
    }
    finish();
  }
  // 보기 전환 (ROLES.md 3단계): in the live club the sign-in decides the menus; here the visitor picks a view.
  function viewSwitch(member) {
    return `<nav class="view-switch" aria-label="보기 전환">${[['home', '운영진', !member], ['member', '회원', member]].map(([route, label, on]) =>
      `<a class="btn btn-small ${on ? 'btn-secondary' : 'btn-text'}" href="#${route}" data-route="${route}"${on ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  }
  function renderShell() {
    const member = memberView(currentRoute);
    app.innerHTML = `
      <aside class="sidebar">
        ${brand()}
        ${platformHome ? `<a class="platform-link" href="${escape(platformHome)}">콕콕콕! 모임 목록</a>` : ''}
        ${menuLinks(menuPage(), member)}
        <div class="sidebar-footer">
          <span class="operator-mark">${icon('user',18)}</span>
          <span>${member ? '<strong>예시 회원</strong><small>회원 화면</small>' : '<strong>모임 운영진</strong><small>운영 화면</small>'}</span>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <div class="breadcrumb">
            <span class="breadcrumb-parent">썬콕19</span><span class="breadcrumb-divider">/</span><strong>${currentLabel(currentRoute)}</strong>
          </div>
          <div class="topbar-actions">${viewSwitch(member)}<span class="demo-label"><i></i> 가상 데이터 체험</span>
            <button type="button" class="icon-button topbar-menu" data-action="open-menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false">${menuIcon}</button></div>
        </header>
        <main class="main-content" id="main-content" tabindex="-1"></main>
        ${tabBar(menuPage(), member)}
      </div>`;
  }
  // arrive (DESIGN.md 6 섹션 도착, as the live render): 'next' or 'back' slides the page in from that side, 'enter' rises it.
  function renderPage({focus = false, arrive = ''} = {}) {
    const member = memberView(currentRoute);
    const label = currentLabel(currentRoute);
    // The shell is redrawn when the breadcrumb or the view changes; the menus follow the view.
    const section = `${member ? 'member' : 'organizer'}:${label}:${menuPage()}`;
    document.title = `${label} · 썬콕19 · 콕콕콕!`;
    const lastTab = app.querySelector('.tab-bar')?.dataset.current;
    if (!app.querySelector('.main-shell') || app.dataset.section !== section) renderShell();
    // The lime mark slides from the tab the last page was on (the live render).
    const bar = app.querySelector('.tab-bar');
    if (bar?.dataset.current && lastTab && lastTab !== bar.dataset.current) {
      bar.style.setProperty('--tab-from', lastTab);
      bar.dataset.slide = '';
    }
    const content = app.querySelector('#main-content');
    if (arrive) content.dataset.arrive = arrive;
    else delete content.dataset.arrive;
    content.innerHTML = member ? window.clubShare.renderMember(currentRoute, state, {...helpers, publicReceipts:ui.publicReceipts})
      : currentRoute.page === 'home' ? renderHome()
      : window.clubScreens.renderScreen(currentRoute, state, ui, helpers);
    // The check just made was drawn once (screens.js attendance); a later redraw shows it as it is.
    ui.justChecked = null;
    app.dataset.section = section;
    if (focus) app.querySelector('#main-content')?.focus({preventScroll:true});
  }

  // 일정 흐름 (FLOW.md), read through the live rules (worker/public/flow.mjs, built into flow.js as window.clubFlow).
  // The demo's events in the live terms: the demo has no 비공개 회차, its 마감 is a date and a time, and 출석·게스트 확정
  // (finalized) closes a session as the live 마무리 확정 does.
  function flowEvent(event) {
    return {id:event.id, date:event.date, time:event.time, published:true, open:event.pollOpen,
      deadline:`${event.deadline}T${event.deadlineTime || '23:59'}`, settled:event.finalized, cancelled:event.cancelled,
      pinnedAt:event.pinnedAt, kind:event.kind, source:event};
  }
  // Every unfinished event in the 운영 홈 order: pinned first, then today, a vote closing within a day, wrap-ups...
  function flowEvents() {
    return flow.flowOrder(state.events.map(flowEvent), flowNow).map(item => item.source);
  }
  // 마무리 확정 or 취소, the latest first (the 일정 list folds them under 끝난 일정).
  function finishedEvents() {
    return state.events.filter(event => flow.finished(flowEvent(event), flowNow))
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }
  function pill(label, tone) {
    return `<span class="pill pill-${tone}">${label}</span>`;
  }
  // 상단 고정: a push pin by the title wherever a pinned event or notice shows (the live pinMark).
  function pinMark(item) {
    return item?.pinnedAt ? `<span class="pin-mark" title="상단 고정">${icon('pushpin', 15)}<span class="sr-only">상단 고정</span></span>` : '';
  }
  // 일정 종류 in a line of facts: only the ones other than 정기, and not when the title already says it.
  function kindPrefix(event) {
    const label = kindLabels[event.kind];
    return label && event.kind !== 'regular' && !event.title.includes(label) ? `${label} · ` : '';
  }
  // The tab a session opens on, as the live defaultTab: the vote before the day, check-in on the day, wrap-up after it.
  function defaultTab(event) {
    return event.date > today ? 'poll' : event.date === today ? 'attendance' : 'settlement';
  }
  // What one unfinished event shows in the 운영 홈 rows and the 일정 list (the live flowFacts).
  function flowFacts(event) {
    const stage = flow.eventStage(flowEvent(event), flowNow);
    const late = Math.round((Date.parse(today) - Date.parse(event.date)) / 86400000);
    const waiting = counts(event).pending;
    const stands = {
      draft:'공개 전',
      waiting:'투표 닫힘',
      voting:`투표 중 · 미응답 ${waiting}명`,
      closed:`투표 마감 · 미응답 ${waiting}명`,
      today:'오늘 · 출석 체크',
      wrapup:`마무리 전 · ${late}일 지남`
    }[stage];
    return {stage, title:`${pinMark(event)}${escape(event.title)}`, detail:escape(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${stands}`)};
  }
  // 일정 달력 (worker/public/calendar.mjs, built into calendar.js): the live month grid; the past, the finished and the
  // cancelled quiet. ui.calendarMonth is the month picked, this month when none was.
  function calendar(events) {
    const marks = events.map(event => ({date:event.date, title:event.title, kind:kindLabels[event.kind] ?? kindLabels.regular,
      regular:(event.kind ?? 'regular') === 'regular', done:event.date < today || flow.finished(flowEvent(event), flowNow)}));
    return window.clubCalendar.calendarBlock(marks, {month:ui.calendarMonth ?? today.slice(0, 7), today, icon});
  }
  // 달력으로 보기 / 달력 접기 (the live calendarToggle): the month grid is folded until asked for.
  function calendarOpen() { return Boolean(ui.calendarOpen); }
  // 당일 출석 (screens.js attendance): 미확인만 보기, and the member just checked, whose check is drawn once.
  function onlyUnmarked() { return Boolean(ui.onlyUnmarked); }
  function justChecked() { return ui.justChecked; }
  function calendarToggle() { return `<button class="btn btn-text btn-small calendar-toggle" type="button" data-action="calendar-toggle">${calendarOpen() ? '달력 접기' : '달력으로 보기'}</button>`; }
  function pollIsOpen(event) {
    return event.pollOpen && !event.finalized && !event.cancelled && !deadlinePassed(event);
  }
  // 운영 홈 (the live adminHome, DESIGN.md 4): the 지금 할 일 card, then 다른 일정, 최근 공지 and 지난 일정 as rows.
  function renderHome() {
    const flows = flowEvents();
    const [upcoming] = flows;
    const last = state.events.filter(event => event.finalized && !event.cancelled).sort((a,b) => b.date.localeCompare(a.date))[0];
    const latest = [...state.notices].sort((a,b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.date.localeCompare(a.date)).slice(0,3);
    const wrapups = flows.filter(event => flowFacts(event).stage === 'wrapup').length;
    const summary = flows.length ? `진행 중인 일정 ${flows.length}개${wrapups ? ` · 마무리 전 ${wrapups}개` : ''}` : '진행 중인 일정이 없어요.';
    return `<div class="home-page">
      <header class="list-tools"><h1 class="sr-only">운영 홈</h1><p>${summary}</p><button class="btn btn-secondary btn-small" type="button" data-action="open-event">${icon('plus',17)} 새 일정</button></header>
      <div id="home-now">${renderNow(upcoming)}</div>
      <div id="home-flows">${renderFlows(flows, upcoming?.id)}</div>
      ${homeList('최근 공지', 'home-notices-title', latest.map(notice => homeRow(`public-notice/${notice.id}`, `${pinMark(notice)}${escape(notice.title)}`,
        `<time datetime="${escape(notice.date)}">${readPeriod(notice.date)}</time>`)), '아직 등록한 공지가 없어요.', moreLink('notices'))}
      ${renderLast(last)}
    </div>`;
  }
  function sessionStage(event) {
    return event.finalized ? 4 : event.date < today ? 3 : event.date === today ? 2 : 1;
  }
  const stepNames = ['일정 준비', '참석 투표', '당일 출석', '마무리'];
  function nowSteps(stage) {
    const at = Math.min(stage, 3);
    return `<ol class="now-steps" aria-label="일정 진행 ${at + 1}/4단계: ${stepNames[at]}">${stepNames.map((name, index) => {
      const step = stage === 4 || index < at ? 'done' : index === at ? 'now' : 'next';
      return `<li data-step="${step}"${step === 'now' ? ' aria-current="step"' : ''}><i></i>${name}</li>`;
    }).join('')}</ol>`;
  }
  function nowStats(items, value, total, label) {
    return `<dl class="now-stats">${items.map(([name, n]) => `<div><dt>${name}</dt><dd>${n}명</dd></div>`).join('')}</dl>
      <svg class="now-meter" viewBox="0 0 ${Math.max(total, 1)} 1" preserveAspectRatio="none" role="img" aria-label="${label}"><rect width="${Math.min(value, total)}" height="1"/></svg>`;
  }
  // 지금 할 일 (the live homeNow): the first of the 진행 중인 일정, where it stands, its numbers and the one thing to do.
  function renderNow(event) {
    if (!event) {
      return `<section class="panel now-card" aria-labelledby="next-event-title"><p class="now-when">지금 할 일</p>
        <h2 id="next-event-title">예정된 일정이 없어요</h2>
        <div class="now-actions"><button class="btn btn-primary" type="button" data-action="open-event">새 일정 만들기</button></div></section>`;
    }
    const id = escape(event.id);
    const stage = sessionStage(event);
    const {yes, no, pending, total, early, late, lunch} = counts(event);
    const present = attendanceCounts(event).present;
    const arrived = event.guests.filter(guest => guest.arrived).length;
    const open = (label, tab) => `<a class="btn btn-primary" href="#event/${id}/${tab}" data-route="event/${id}/${tab}">${label}</a>`;
    const attendance = () => nowStats(stage === 2 ? [['참석 예정', yes], ['출석', present], ['게스트 도착', arrived]]
      : [['출석', present], ['게스트 도착', arrived], ['참석 예정', yes]], present, yes, `출석 ${present}/${yes}명`);
    const vote = pollIsOpen(event) ? `${dateLabel(event.deadline)} ${event.deadlineTime} 투표 마감` : event.pollOpen || deadlinePassed(event) ? '투표가 마감됐어요' : '투표가 닫혀 있어요';
    const [kicker, fact, numbers, actions] = {
      1:() => ['다음 일정', `${escape(event.place)} · ${escape(vote)}`,
        nowStats([['선발', early], ['후발', late], ['점심', lunch], ['불참', no], ['미응답', pending]], yes + no, total, `응답 ${yes + no}/${total}명`),
        open(pending > 0 ? `미응답 ${pending}명 보기` : '응답 명단 보기', 'poll')
          + `<button class="btn btn-secondary" type="button" data-action="copy-link" data-kind="vote" data-id="${id}">투표 링크 복사</button>`],
      2:() => ['오늘 일정', escape(event.place), attendance(), open('출석 체크', 'attendance')],
      3:() => ['마무리할 일정', '운동이 끝났어요. 마무리만 남았어요.', attendance(), open('마무리하기', 'settlement')],
      4:() => ['마무리한 일정', '마무리를 확정했어요.', attendance(), open('마무리 보기', 'settlement')]
    }[stage]();
    return `<section class="panel now-card" aria-labelledby="next-event-title" data-fresh>
      <p class="now-when">${kicker} · ${escape(kindPrefix(event))}${fullDate(event.date)} · ${escape(event.time)}${event.endTime ? '–'+escape(event.endTime) : ''}</p>
      <h2 id="next-event-title">${pinMark(event)}${escape(event.title)}</h2>
      <p class="now-fact">${fact}</p>${nowSteps(stage)}${numbers}
      <div class="now-actions">${actions}</div>
      <a class="btn btn-text now-own" href="#public-vote/${id}" data-route="public-vote/${id}">회원 화면 체험</a></section>`;
  }
  // A list on the page itself (the live homeList and homeRow): a quiet label with one action, then whole rows.
  function homeList(title, titleId, rows, empty, action = '', css = '') {
    return `<section class="home-list${css ? ` ${css}` : ''}" aria-labelledby="${titleId}"><header class="list-tools"><h2 id="${titleId}">${title}</h2>${action}</header>
      ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : `<p class="muted home-empty">${empty}</p>`}</section>`;
  }
  function homeRow(path, title, detail) {
    return `<li><a class="event-link" href="#${escape(path)}" data-route="${escape(path)}"><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron-right',18)}</a></li>`;
  }
  function moreLink(route) {
    return `<a class="btn btn-text btn-small" href="#${route}" data-route="${route}">전체 보기</a>`;
  }
  // 다른 일정 (the live homeFlows): every unfinished event but the one in the card, in the same order; the whole row
  // opens the event on the tab its stage needs.
  function renderFlows(flows, featuredId) {
    const rows = flows.filter(event => event.id !== featuredId).map(event => {
      const {stage, title, detail} = flowFacts(event);
      return homeRow(`event/${event.id}/${{today:'attendance', wrapup:'settlement'}[stage] ?? 'poll'}`, title, detail);
    });
    if (state.events.length && !state.events.some(event => event.date >= today)) {
      rows.push(`<li><button class="event-link" type="button" data-action="${state.repeat.enabled ? 'generate-next' : 'open-event'}"><span><strong>${state.repeat.enabled ? '다음 일정 만들기' : '새 일정 만들기'}</strong>
        <small>예정된 일정이 없어요. ${state.repeat.enabled ? '반복 일정으로 만들 수 있어요.' : '새 일정을 만들어 투표를 시작하세요.'}</small></span>${icon('plus',18)}</button></li>`);
    }
    return homeList('다른 일정', 'home-todo-title', rows, featuredId ? '다른 진행 중인 일정이 없어요.' : '지금 챙길 일이 없어요.', moreLink('events'), 'home-flows');
  }
  // 지난 일정 (the live homeLast): the latest session whose 출석·게스트 확정 is done.
  function renderLast(event) {
    if (!event) return '';
    const present = attendanceCounts(event).present;
    const arrived = event.guests.filter(guest => guest.arrived).length;
    const skipped = event.roster.filter(id => ['early','late'].includes(event.votes[id]) && event.attendance[id] === 'absent').length;
    return homeList('지난 일정', 'home-last-title', [homeRow(`event/${event.id}/settlement`, escape(event.title),
      escape(`${dateLabel(event.date)} · 출석 ${present}명 · 게스트 ${arrived}명 · 응답 후 불참 ${skipped}명`))], '');
  }

  // A step inside an open dialog (비밀번호 재설정 → 확인 → 접속 안내, or a 더보기 menu → 공지 초안) took the pressed button
  // away: focus starts again at ×.
  function showModal() {
    if (!modal.open) return modal.showModal();
    modal.querySelector('[data-action="close-dialog"]')?.focus();
  }
  function openDialog(type,id,trigger,kind) {
    const data = {type,id,kind};
    modal.innerHTML = type === 'share'
      ? window.clubShare.renderShare(data,state,helpers)
      : window.clubScreens.renderDialog(data,state,helpers);
    if (!modal.innerHTML.trim()) return;
    dialogTrigger = trigger;
    showModal();
  }
  function openEventNotice(event,trigger) {
    const draft = {
      title:`${readPeriod(event.date)} ${event.title} 안내`,
      body:[`${fullDate(event.date)} ${event.time}–${event.endTime}`, event.place, event.notes,
        `선발 ${event.earlyTime} · 후발 ${event.lateTime} · 점심 별도 선택`,
        event.deadline ? `${readPeriod(event.deadline)} ${event.deadlineTime}까지 웹에서 응답해 주세요.` : ''].filter(Boolean).join('\n')
    };
    modal.innerHTML = window.clubScreens.renderDialog({type:'notice',draft}, state, helpers);
    dialogTrigger = trigger;
    showModal();
  }
  function idFor(prefix) {
    return prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  function generateNext(trigger) {
    const {repeat} = state;
    if (!repeat.enabled) return openDialog('repeat',undefined,trigger);
    const weekdayOf = (date) => new Date(date+'T12:00:00Z').getUTCDay();
    const latest = state.events.filter(event => event.title === repeat.title && event.place === repeat.place
        && event.date >= today && weekdayOf(event.date) === repeat.weekday)
      .map(event => event.date).sort().at(-1);
    const firstWithLeadTime = addDays(today,repeat.deadlineDays);
    const afterLatest = latest ? addDays(latest,1) : today;
    const start = afterLatest > firstWithLeadTime ? afterLatest : firstWithLeadTime;
    const date = addDays(start,(repeat.weekday - weekdayOf(start) + 7) % 7);
    const event = {
      id:idFor('event'), title:repeat.title, date, time:repeat.time, endTime:repeat.endTime, place:repeat.place,
      earlyTime:repeat.earlyTime, lateTime:repeat.lateTime, deadline:addDays(date,-repeat.deadlineDays),
      deadlineTime:repeat.deadlineTime, notes:'', pollOpen:true, finalized:false, kind:'regular', pinnedAt:null, cancelled:false,
      roster:state.members.filter(member => member.status === 'active').map(member => member.id),
      votes:{}, lunch:{}, attendance:{}, recognized:{}, guests:[], settlement:{}
    };
    state.events.push(event);
    persist(dateLabel(date) + ' 모임을 만들었어요.');
    routeTo('event/'+event.id+'/poll');
  }
  async function copy(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly','');
      field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
      const focused = document.activeElement;
      (modal.open ? modal : document.body).append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch {}
      field.remove();
      focused?.focus();
      return copied;
    }
  }
  function notifyCopy(copied, success) {
    const message = copied ? success : '자동 복사를 사용할 수 없어요. 내용을 선택해 직접 복사해 주세요.';
    const shareFeedback = modal.open && modal.querySelector('.share-feedback');
    if (shareFeedback) shareFeedback.textContent = message;
    else showToast(message);
  }
  app.addEventListener('click', handleClick);
  modal.addEventListener('click', handleClick);
  mobileNav.addEventListener('click', handleClick);
  // The dialog fills the screen, so a tap on its own surface is a tap on the dim area beside the drawer.
  mobileNav.addEventListener('click', event => {
    if (event.target === mobileNav) closeMobileMenu();
  });
  mobileNav.addEventListener('cancel', event => {
    event.preventDefault();
    closeMobileMenu();
  });
  mobileNav.addEventListener('close', () => {
    if (!mobileNav.open) unlockMobileMenu(true);
  });
  window.matchMedia('(max-width: 700px)').addEventListener('change', event => {
    if (!event.matches) closeMobileMenu(false, true);
  });
  function handleClick(ev) {
    const control = ev.target.closest('[data-route], [data-action]');
    if (!control) return;
    if (control.dataset.route) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      routeTo(control.dataset.route);
      return;
    }
    const {action,id,kind,member,value} = control.dataset;
    const controlLabel = control.getAttribute('aria-label');
    const event = state.events.find(item => item.id === id);
    const openTypes = ['event','member','notice','repeat','vote','attendance','share','actions'];
    // 더보기 (DESIGN.md 6 UX 점검표 15): a dialog opened from the menu takes its place and gives focus back to 더보기 when
    // it closes; a button that saves closes the menu first (the live app does the same in app.mjs).
    const inMenu = Boolean(control.closest('.action-menu'));
    const trigger = inMenu ? dialogTrigger : control;
    const opensDialog = openTypes.includes(action.replace(/^open-/, '')) || ['cancel-event', 'open-event-notice', 'close-dialog'].includes(action);
    if (inMenu && !opensDialog) modal.close();
    if (openTypes.includes(action.replace(/^open-/, ''))) {
      openDialog(action.slice(5),id,trigger,kind);
      return;
    }
    // 일정 달력 (the live doAction): the asked month slides in from its side; a date marks its rows in the list below.
    if (action === 'calendar-month') {
      const shown = app.querySelector('.calendar')?.dataset.month;
      const month = shown && window.clubCalendar.calendarTarget(shown, id, today);
      if (!month || month === shown) return;
      ui.calendarMonth = month;
      renderPage();
      const days = app.querySelector('.calendar-days');
      if (days) days.dataset.slide = month > shown ? 'next' : 'back';
      app.querySelector(`.calendar [data-action="calendar-month"][data-id="${id}"]`)?.focus({preventScroll:true});
      return;
    }
    if (action === 'calendar-toggle') {
      ui.calendarOpen = !ui.calendarOpen;
      ui.calendarMonth = null;
      renderPage();
      app.querySelector('.calendar-toggle')?.focus({preventScroll:true});
      return;
    }
    // 미확인만 보기 (the live att-filter): hides the checked rows in place, no redraw.
    if (action === 'att-filter') {
      ui.onlyUnmarked = !ui.onlyUnmarked;
      app.querySelector('#attendance')?.toggleAttribute('data-only', ui.onlyUnmarked);
      control.setAttribute('aria-pressed', String(ui.onlyUnmarked));
      return;
    }
    if (action === 'calendar-day') {
      window.clubCalendar.pickCalendarDay(app, id, !reducedMotion.matches);
      return;
    }
    if (action === 'close-dialog') modal.close();
    // 비밀번호 재설정 (the live reset-member): asked once more, then a made-up temporary number. The 연필 that opened 회원 수정
    // gets the focus back however the dialog closes.
    if (action === 'reset-member') return openDialog('reset', id, dialogTrigger);
    if (action === 'confirm-reset-member') {
      const temporary = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      return openDialog('credential', id, dialogTrigger, temporary);
    }
    if (action === 'copy-invitation') {
      copy(modal.querySelector('.copy-text').value).then(result => notifyCopy(result, '접속 안내를 복사했어요.'));
      return;
    }
    if (action === 'open-menu') openMobileMenu(control);
    if (action === 'close-menu') closeMobileMenu();
    if (action === 'generate-next') generateNext(control);
    // 링크 복사 (the live copy-vote-link / copy-notice-link): the link the share dialog would show, copied at once.
    if (action === 'copy-link') {
      const item = kind === 'notice' ? state.notices.find(entry => entry.id === id) : event;
      if (!item) return;
      const {href, published} = window.clubShare.linkFor(kind === 'notice' ? 'notice' : 'vote', item);
      const what = kind === 'notice' ? '공지' : '투표';
      copy(href).then(result => notifyCopy(result, published ? `${what} 공개 예시 링크를 복사했어요.` : `${what} 링크(이 브라우저 미리보기)를 복사했어요.`));
      return;
    }
    if (action === 'copy-share') {
      const href = modal.querySelector('#share-link').value;
      const message = control.hasAttribute('data-published-link')
        ? '공개 예시 링크를 복사했어요.'
        : '이 브라우저 미리보기 링크를 복사했어요.';
      copy(href).then(result => notifyCopy(result, message));
      return;
    }
    if (action === 'copy-notice') {
      const notice = state.notices.find(item => item.id === id);
      if (notice) copy(`${notice.title}\n\n${notice.body}`).then(result => notifyCopy(result,'공지 내용을 복사했어요.'));
    }
    // 상단 고정 (FLOW.md 5): three events and three notices at most; a fourth asks before letting go of the oldest.
    if (action === 'toggle-pin' || action === 'confirm-pin') {
      const list = kind === 'notice' ? state.notices : state.events;
      const item = list.find(entry => entry.id === id);
      if (!item || item.finalized || item.cancelled) return;
      const pinned = () => list.filter(entry => entry.pinnedAt && !entry.finalized && !entry.cancelled).sort((a, b) => a.pinnedAt - b.pinnedAt);
      let message = '상단 고정을 풀었어요.';
      if (action === 'toggle-pin' && item.pinnedAt) item.pinnedAt = null;
      else if (action === 'toggle-pin' && pinned().length >= pinLimit) return openDialog('pin', id, control, kind);
      else {
        // Pin first, then let go of whatever is over the limit, oldest first (the live setPinned).
        item.pinnedAt = Math.max(0, ...list.map(entry => entry.pinnedAt ?? 0)) + 1;
        const released = pinned().slice(0, Math.max(0, pinned().length - pinLimit));
        for (const entry of released) entry.pinnedAt = null;
        message = released.length ? `"${released[0].title}"의 고정을 풀고 맨 위에 고정했어요.` : '맨 위에 고정했어요.';
      }
      if (modal.open) { dialogTrigger = null; modal.close(); }
      persist(message);
      renderPage();
      app.querySelector(`[data-action="toggle-pin"][data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
      return;
    }
    if (!event) return;
    // 일정 취소 (FLOW.md 10): asked once, undone with 취소 풀기; the answers stay.
    if (action === 'cancel-event' && !event.finalized && !event.cancelled) return openDialog('cancel', id, trigger);
    if ((action === 'confirm-cancel-event' && !event.finalized && !event.cancelled) || (action === 'restore-event' && event.cancelled)) {
      const cancelling = action === 'confirm-cancel-event';
      Object.assign(event, cancelling ? {cancelled:true, pollOpen:false, pinnedAt:null} : {cancelled:false});
      if (modal.open) { dialogTrigger = null; modal.close(); }
      persist(cancelling ? '일정을 취소했어요.' : '취소를 풀었어요. 투표는 닫혀 있으니 필요하면 다시 열어 주세요.');
      renderPage();
      app.querySelector(`[data-action="${cancelling ? 'restore-event' : 'cancel-event'}"]`)?.focus({preventScroll:true});
      return;
    }
    if (action === 'open-event-notice') return openEventNotice(event,trigger);
    if (action === 'copy-settlement' && event.finalized) {
      const report = settlement(event);
      if (!report.recorded) return showToast('콕과 찬조금 기록을 먼저 입력해 주세요.');
      const lines = [`썬콕19 모임 마무리 · ${fullDate(event.date)}`, `운동 ${event.time}–${event.endTime} · ${event.place}`,
        `총 ${report.total}명 (회원 ${report.members}명 · 게스트 ${report.arrivals}명)`,
        `콕 이월 ${report.singles}개 + ${report.priorTubes}타 (당일 잔여 ${report.remainingSingles}개)`,
        `코트 찬조금 ${report.courtDonation.toLocaleString('ko-KR')}원`];
      copy(lines.join('\n')).then(result => notifyCopy(result,'가상 모임 마무리 공지를 복사했어요.'));
      return;
    }
    if (action === 'toggle-poll' && !event.finalized && !event.cancelled && !deadlinePassed(event)) {
      event.pollOpen = !event.pollOpen;
      persist(pollIsOpen(event) ? '참석 투표를 열었어요.' : '참석 투표를 닫았어요.');
    } else if (action === 'mark-attendance' && event.date <= today && !event.finalized && event.roster.includes(member)) {
      if (value === 'present' || value === 'absent') event.attendance[member] = value;
      else delete event.attendance[member];
      if (value !== 'present' && event.recognized[member] !== 'approved') delete event.recognized[member];
      ui.justChecked = value === 'present' ? member : null;
      if (!model.save(state)) showToast('브라우저 저장 공간을 사용할 수 없어요.');
    } else if (action === 'mark-pending-absent' && event.date <= today && !event.finalized) {
      for (const id of event.roster) {
        if (!event.attendance[id]) event.attendance[id] = 'absent';
      }
      persist('미확인 회원만 결석으로 기록했어요.');
    } else if (action === 'mark-guest' && !event.finalized && (value === 'paid' || (value === 'arrived' && event.date <= today))) {
      const guest = event.guests.find(item => item.id === member);
      if (!guest) return;
      guest[value] = !guest[value];
      if (!model.save(state)) showToast('브라우저 저장 공간을 사용할 수 없어요.');
    } else if (action === 'finalize' && event.date <= today && !event.finalized && !event.cancelled) {
      if (attendanceCounts(event).pending) return showToast('아직 출석을 기록하지 않은 회원이 있어요.');
      event.finalized = true;
      event.pollOpen = false;
      persist('출석을 마감했어요. 통계에 반영됩니다.');
    } else if (action === 'reopen-attendance' && event.finalized) {
      event.finalized = false;
      persist('출석 기록을 다시 수정할 수 있어요.');
    } else if (action === 'cancel-public-vote' && pollIsOpen(event) && ui.publicReceipts[id]) {
      // 응답 취소 on the member vote screen, as the live one (worker/public/app.mjs cancel-vote).
      const {member: own} = ui.publicReceipts[id];
      delete event.votes[own];
      delete event.lunch[own];
      delete ui.publicReceipts[id];
      persist('응답을 취소했어요.');
    } else return;
    renderPage();
    if (action === 'cancel-public-vote') return app.querySelector('[data-form="public-vote"] select[name="member"]')?.focus({preventScroll:true});
    Array.from(app.querySelectorAll('[data-action]')).find(button => button.dataset.action === action
      && button.dataset.id === id && button.dataset.member === member
      && button.getAttribute('aria-label') === controlLabel)?.focus({preventScroll:true});
  }

  function fieldError(form, key, message) {
    const field = form.elements.namedItem(key);
    field.setCustomValidity(message);
    field.reportValidity();
  }

  function filterMembers(input) {
    if (input.dataset.filter !== 'member-query') return;
    ui.memberQuery = input.value;
    const view = document.createElement('template');
    view.innerHTML = window.clubScreens.renderScreen(currentRoute,state,ui,helpers);
    app.querySelector('.member-rows').replaceWith(view.content.querySelector('.member-rows'));
  }
  document.addEventListener('input', ev => {
    const input = ev.target;
    if (input.form && input.setCustomValidity) input.setCustomValidity('');
    if (!ev.isComposing) filterMembers(input);
  });
  document.addEventListener('compositionend', ev => filterMembers(ev.target));
  document.addEventListener('change', ev => {
    const input = ev.target;
    if (['event','repeat'].includes(input.form?.dataset.form)) {
      for (const key of ['deadline','endTime','date','lateTime']) input.form.elements.namedItem(key)?.setCustomValidity('');
    }
    if (input.dataset.filter === 'member-status' || input.dataset.filter === 'stats-month') {
      ui[input.dataset.filter === 'member-status' ? 'memberStatus' : 'statsMonth'] = input.value;
      renderPage();
      app.querySelector(`[data-filter="${input.dataset.filter}"]`)?.focus();
    }
  });

  document.addEventListener('submit', ev => {
    const form = ev.target;
    const type = form.dataset.form;
    if (!type) return;
    ev.preventDefault();
    const id = form.dataset.id;
    const formData = new FormData(form);
    const value = (key) => String(formData.get(key) ?? '').trim();
    const required = {
      event:['title','date','time','place','earlyTime','lateTime','deadlineTime'], notice:['title','body'],
      member:['name','joined'], repeat:['title','time','place','earlyTime','lateTime','deadlineTime'], guest:['guestName']
    };
    for (const key of required[type] || []) {
      if (!value(key)) return fieldError(form,key,'이 항목을 입력해 주세요.');
    }
    if ((type === 'event' || type === 'repeat') && value('endTime') && value('endTime') <= value('time')) {
      return fieldError(form,'endTime','종료 시간은 시작 시간보다 늦어야 해요.');
    }
    if ((type === 'event' || type === 'repeat') && value('lateTime') <= value('earlyTime')) {
      return fieldError(form,'lateTime','후발 시간은 선발 시간보다 늦어야 해요.');
    }
    let message;
    let target;
    if (type === 'event') {
      if (value('deadline') && value('deadline') > value('date')) return fieldError(form,'deadline','투표 마감은 일정 날짜 이전으로 정해 주세요.');
      let event = state.events.find(item => item.id === id);
      if (event?.finalized && value('date') > today) return fieldError(form,'date','출석을 확정한 모임은 미래 날짜로 옮길 수 없어요.');
      if (!event) {
        event = {id:idFor('event'),finalized:false,pinnedAt:null,cancelled:false,roster:state.members.filter(member => member.status === 'active').map(member => member.id),
          votes:{},lunch:{},attendance:{},recognized:{},guests:[],settlement:{}};
        state.events.push(event);
      }
      Object.assign(event, Object.fromEntries(['title','date','time','endTime','earlyTime','lateTime','place','deadline','deadlineTime','notes'].map(key => [key,value(key)])));
      event.kind = kindLabels[value('kind')] ? value('kind') : 'regular';
      event.pollOpen = formData.has('pollOpen') && !event.finalized && !event.cancelled;
      target = 'event/'+event.id+'/poll';
      message = '모임 일정을 저장했어요.';
    } else if (type === 'notice') {
      const notice = state.notices.find(item => item.id === id) || {id:idFor('notice'),date:today};
      if (!id) state.notices.unshift(notice);
      Object.assign(notice,{title:value('title'),body:value('body'),pinnedAt:notice.pinnedAt ?? null});
      target = 'notices';
      message = '공지를 저장했어요.';
    } else if (type === 'member') {
      const isNew = !id;
      const member = state.members.find(item => item.id === id) || {id:idFor('member'),joined:today};
      if (isNew) state.members.push(member);
      Object.assign(member,{name:value('name'),role:value('role'),status:value('status'),joined:value('joined'),notes:value('notes')});
      ui.memberQuery = '';
      ui.memberStatus = member.status;
      target = 'members';
      message = '회원 정보를 저장했어요.';
    } else if (type === 'repeat') {
      Object.assign(state.repeat,{enabled:formData.has('enabled'),weekday:Number(value('weekday')),title:value('title'),time:value('time'),endTime:value('endTime'),
        earlyTime:value('earlyTime'),lateTime:value('lateTime'),deadlineTime:value('deadlineTime'),place:value('place'),deadlineDays:Number(value('deadlineDays'))});
      message = '반복 일정 설정을 저장했어요.';
    } else if (type === 'guest' || type === 'settlement') {
      const event = state.events.find(item => item.id === id);
      if (!event || event.finalized || (type === 'settlement' && event.date > today)) return showToast('현재는 이 기록을 수정할 수 없어요.');
      if (type === 'guest') {
        event.guests.push({id:idFor('guest'),name:value('guestName'),arrived:false,paid:false});
        message = '게스트를 추가했어요.';
      } else {
        const fields = ['priorSingles','priorTubes','remainingSingles','courtDonation'];
        for (const key of fields) {
          const number = Number(value(key));
          if (!Number.isSafeInteger(number) || number < 0 || number > 100000000) return fieldError(form,key,'0에서 1억 사이의 숫자를 입력해 주세요.');
        }
        event.settlement = Object.fromEntries(fields.map(key => [key,Number(value(key))]));
        message = '마무리 기록을 저장했어요.';
      }
    } else if (type === 'attendance') {
      // 출석 상세 (screens.js attendanceDialog): 직접·대타 인정 stays only with 출석, as the row tap keeps it.
      const event = state.events.find(item => item.id === id);
      const member = value('member');
      if (!event || event.date > today || event.finalized || !event.roster.includes(member)) return showToast('지금은 출석을 고칠 수 없어요.');
      const status = value('status');
      const recognition = value('recognition');
      if (status === 'present' || status === 'absent') event.attendance[member] = status;
      else delete event.attendance[member];
      if (recognition === 'approved' || (['direct','substitute'].includes(recognition) && status === 'present')) event.recognized[member] = recognition;
      else delete event.recognized[member];
      message = '출석 기록을 저장했어요.';
    } else if (type === 'vote' || type === 'public-vote') {
      const event = state.events.find(item => item.id === id);
      const member = value('member');
      const vote = value('vote');
      if (!event || event.finalized || (type === 'public-vote' && !pollIsOpen(event))) return showToast('이 모임의 투표가 마감됐어요.');
      if (type === 'public-vote' && !ui.publicReceipts[id] && value('demoPin') !== '190019') {
        return fieldError(form,'demoPin','화면에 보이는 체험 번호 190019를 입력해 주세요.');
      }
      if (!event.roster.includes(member) || !['early','late','no'].includes(vote)
          || (type === 'public-vote' && ui.publicReceipts[id] && ui.publicReceipts[id].member !== member)) {
        return showToast('예시 회원과 응답을 선택해 주세요.');
      }
      const lunch = formData.has('lunch');
      event.votes[member] = vote;
      event.lunch[member] = lunch;
      if (type === 'public-vote') ui.publicReceipts[id] = {member,vote,lunch};
      message = vote === 'early' ? '선발로 응답했어요.' : vote === 'late' ? '후발로 응답했어요.' : '불참을 기록했어요.';
    } else return;
    if (modal.open) modal.close();
    persist(message);
    renderPage();
    if (target) routeTo(target);
  });

  modal.addEventListener('click', ev => {
    if (ev.target !== modal) return;
    const bounds = modal.getBoundingClientRect();
    if (ev.clientX < bounds.left || ev.clientX > bounds.right || ev.clientY < bounds.top || ev.clientY > bounds.bottom) modal.close();
  });
  // Focus goes back to what opened the dialog; when a save from a 더보기 menu redrew the page, to the same 더보기.
  modal.addEventListener('close', () => {
    // A save redraws the page: the opener's twin (same action and id, like the 연필 of the row just saved) takes the focus,
    // as the live matchingControl does.
    const {action, id} = dialogTrigger?.dataset ?? {};
    const twin = !dialogTrigger?.isConnected && action && id
      ? app.querySelector(`[data-action="${CSS.escape(action)}"][data-id="${CSS.escape(id)}"]`) : null;
    (dialogTrigger?.isConnected ? dialogTrigger : twin)?.focus({preventScroll:true});
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#main-content') return;
    if (modal.open) modal.close();
    const before = currentRoute;
    currentRoute = routeFromHash();
    if (before.page !== currentRoute.page) ui.calendarMonth = null;
    if (mobileNav.open) closeMobileMenu(false);
    renderPage({focus:true, arrive:arriveSide(before, currentRoute)});
    window.scrollTo(0,0);
  });
  window.addEventListener('storage', ev => {
    if (ev.key !== model.storageKey) return;
    Object.assign(state,model.load());
    if (!modal.open) renderPage();
  });
  currentRoute = routeFromHash();
  renderPage({arrive:'enter'});
})();
