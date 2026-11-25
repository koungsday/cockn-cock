(() => {
  const model = window.clubModel;
  const {today, dateLabel, counts, attendanceCounts, stats, addDays, deadlinePassed, settlement, qualification} = model;
  const app = document.querySelector('#app');
  const modal = document.querySelector('#dialog');
  const mobileNav = document.querySelector('#mobile-navigation');
  const toast = document.querySelector('#toast');
  const state = model.load();
  const ui = {memberQuery:'', memberStatus:'active', statsMonth:today.slice(0, 7), publicReceipts:{}};
  const pages = [
    ['home','운영 홈','home'], ['events','모임 일정','calendar'], ['notices','공지사항','megaphone'],
    ['members','회원 관리','users'], ['stats','출석 통계','chart'], ['repeat','반복 설정','repeat']
  ];
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
    'arrow-left':'<path d="m12 19-7-7 7-7m-7 7h15"/>',
    edit:'<path d="m14 5 5 5M4 20l4.5-1 12-12-3.5-3.5-12 12z"/>',
    megaphone:'<path d="m3 11 15-6v14L3 15v-4Zm3 5 2.5 5h3l-2-4m11-6 1-1m-1 5 1 1"/>',
    link:'<path d="m10 13 4-4m-6 6-1 1a3 3 0 1 1-4-4l4-4a3 3 0 0 1 4 0m2 8a3 3 0 0 0 4 0l4-4a3 3 0 1 0-4-4l-1 1"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
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
  const helpers = {escape, icon, dateLabel, today, counts, attendanceCounts, stats, avatar, deadlinePassed, settlement, qualification, brandAsset};
  let currentRoute = {page:'home'};
  let dialogTrigger;
  let toastTimer;
  let navScroll = null;
  let navTrigger;
  let returnFromPublic = null;

  function routeFromHash() {
    let hash = location.hash;
    const pastedLink = hash.indexOf(`${location.origin}${location.pathname}#`);
    if (pastedLink > 1) {
      hash = hash.slice(0, pastedLink);
      history.replaceState(history.state, '', hash);
    }
    const [page, id, tab] = hash.slice(1).split('/');
    if (page === 'event' || page === 'public-notice' || page === 'public-vote') return {page, id, tab:['attendance','settlement'].includes(tab) ? tab : 'poll'};
    return {page:pages.some(([key]) => key === page) ? page : 'home'};
  }
  function routeTo(target) {
    const before = currentRoute;
    const fromDialog = modal.open;
    if (target.startsWith('public-') && !before.page.startsWith('public-')) returnFromPublic = location.hash.slice(1) || 'home';
    const sameRoute = location.hash === '#' + target;
    if (mobileNav.open) closeMobileMenu(sameRoute);
    if (sameRoute) {
      if (fromDialog) modal.close();
      return;
    }
    location.hash = target;
  }
  function currentLabel(route) {
    return route.page === 'event' ? '모임 일정' : pages.find(([key]) => key === route.page)?.[1] || '운영 홈';
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
  function menuLinks(active) {
    return `<nav class="navigation" aria-label="모임 관리">
      <div class="nav-heading">모임 운영</div>
      ${pages.slice(0, 5).map(item => navLink(item, active)).join('')}
      <div class="nav-heading nav-heading-settings">설정</div>
      ${navLink(pages[5], active)}
    </nav>`;
  }
  function menuPage() {
    return currentRoute.page === 'event' ? 'events' : currentRoute.page;
  }
  // Phones: the first four sections stay one tap away; 더보기 opens the full menu (DESIGN.md 4).
  // Same markup as the live app (worker/public/views.mjs adminTabBar): four icons; the menu opens from the top bar.
  function tabBar(active) {
    return `<nav class="tab-bar" aria-label="모임 관리 바로가기">
      ${pages.slice(0, 4).map(([key, label, glyph]) => `<a class="tab-bar-link" href="#${key}" data-route="${key}" title="${label}"${active === key ? ' aria-current="page"' : ''}>${icon(glyph,23)}<span class="sr-only">${label}</span></a>`).join('')}
    </nav>`;
  }
  function openMobileMenu(trigger) {
    if (mobileNav.open) return;
    mobileNav.innerHTML = `<header class="mobile-nav-header">
      ${brand()}
      <button class="icon-button" type="button" data-action="close-menu" aria-label="메뉴 닫기" autofocus>${icon('x',24)}</button>
    </header><div class="mobile-nav-links">
      ${platformHome ? `<a class="platform-link" href="${escape(platformHome)}">콕콕콕! 모임 목록</a>` : ''}
      ${menuLinks(menuPage())}
    </div>`;

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
  function closeMobileMenu(restoreFocus = true) {
    if (mobileNav.open) mobileNav.close();
    unlockMobileMenu(restoreFocus);
  }
  function renderShell() {
    app.innerHTML = `
      <aside class="sidebar">
        ${brand()}
        ${platformHome ? `<a class="platform-link" href="${escape(platformHome)}">콕콕콕! 모임 목록</a>` : ''}
        ${menuLinks(menuPage())}
        <div class="sidebar-footer">
          <span class="operator-mark">${icon('user',18)}</span>
          <span><strong>모임 운영진</strong><small>관리자 화면</small></span>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <div class="breadcrumb">
            <span class="breadcrumb-parent">모임 관리</span><span class="breadcrumb-divider">/</span><strong>${currentLabel(currentRoute)}</strong>
          </div>
          <div class="topbar-actions"><span class="demo-label"><i></i> 가상 데이터 체험</span>
            <button type="button" class="icon-button topbar-menu" data-action="open-menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false">${icon('menu',24)}</button></div>
        </header>
        <main class="main-content" id="main-content" tabindex="-1"></main>
        ${tabBar(menuPage())}
      </div>`;
  }
  function renderPage({focus = false} = {}) {
    const publicView = currentRoute.page.startsWith('public-');
    const section = publicView ? (currentRoute.page === 'public-vote' ? '참석 투표' : '공지') : currentLabel(currentRoute);
    document.title = `${section} · 썬콕19 · 콕콕콕!`;
    if (publicView) {
      app.innerHTML = `<main id="main-content" class="public-shell" tabindex="-1">${window.clubShare.renderPublic(currentRoute, state, {...helpers, publicReceipts:ui.publicReceipts, returnFromPublic, platformHome})}</main>`;
    } else {
      if (!app.querySelector('.main-shell') || app.dataset.section !== section) renderShell();
      const content = app.querySelector('#main-content');
      content.innerHTML = currentRoute.page === 'home'
        ? renderHome()
        : window.clubScreens.renderScreen(currentRoute, state, ui, helpers);
    }
    app.dataset.section = section;
    if (focus) app.querySelector('#main-content')?.focus({preventScroll:true});
  }

  function nextEvent() {
    return state.events.filter(event => event.date >= today && !event.finalized)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  }
  function pollIsOpen(event) {
    return event.pollOpen && !event.finalized && !deadlinePassed(event);
  }
  function renderHome() {
    const upcoming = nextEvent();
    const last = state.events.filter(event => event.date < today)
      .sort((a,b) => b.date.localeCompare(a.date))[0];
    const latest = [...state.notices].sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date)).slice(0,3);
    const monthly = stats(state, today.slice(0,7));
    return `<div class="dashboard">
      <header class="dashboard-heading">
        <div><h1>운영 홈</h1><p>이번 회차의 진행 단계와 챙길 일을 가상 데이터로 체험하세요.</p></div>
        <div class="heading-actions"><span class="today-label">${icon('calendar',17)}${fullDate(today)}</span>
          <button class="btn btn-primary" type="button" data-action="open-event">${icon('plus',18)} 모임 만들기</button>
        </div>
      </header>
      <div class="dashboard-grid">
        ${upcoming ? renderFeatured(upcoming) : `<section class="panel empty-state"><h2>다음 모임을 등록하세요.</h2><button class="btn btn-primary" type="button" data-action="open-event">${icon('plus',18)} 모임 만들기</button></section>`}
        ${upcoming ? renderPoll(upcoming) : `<section class="panel empty-state"><h2>참석 투표</h2><p>모임을 등록하면 응답을 여기서 볼 수 있어요.</p></section>`}
      </div>
      <div class="dashboard-grid dashboard-bottom">${renderTodo(upcoming, last)}${renderLast(last)}</div>
      <div class="dashboard-metrics" aria-label="모임 요약">
        ${metric('members','users','mint','활동 회원',state.members.filter(member => member.status === 'active').length,'명')}
        ${metric('stats','calendar','sand','11월 운동',monthly.sessions,'회')}
        ${metric('stats','chart','lavender','11월 출석률',monthly.sessions ? monthly.rate : '–',monthly.sessions ? '%' : '')}
      </div>
      <div class="dashboard-bottom">
        <section class="panel dashboard-notices">
          <header class="dashboard-panel-head"><h2>최근 공지</h2><a class="small-link" href="#notices" data-route="notices">전체 보기 ${icon('chevron-right',15)}</a></header>
          <div class="home-notice-list">${latest.length ? latest.map((notice) => `
            <div class="home-notice-row">
              <a href="#public-notice/${escape(notice.id)}" data-route="public-notice/${escape(notice.id)}" class="notice-home-link">${notice.pinned ? '<span class="notice-tag">고정</span>' : ''}<span>${escape(notice.title)}</span></a>
              <time datetime="${escape(notice.date)}">${readPeriod(notice.date)}</time>
              <button type="button" class="icon-button notice-share" data-action="open-share" data-id="${escape(notice.id)}" data-kind="notice" aria-label="${escape(notice.title)} 카톡 공유" title="카톡 공유">${icon('link',17)}</button>
            </div>`).join('') : '<p class="muted">아직 등록한 공지가 없어요.</p>'}</div>
        </section>
      </div>
    </div>`;
  }
  // Same markup as the live home (worker/public/views.mjs adminHome). The demo has no 비공개 회차, so 회차 준비 is always done,
  // and 출석·게스트 확정 (finalized) is what closes a demo session.
  function sessionStage(event) {
    return event.finalized ? 4 : event.date < today ? 3 : event.date === today ? 2 : 1;
  }
  function routeButton(label, path, tone = 'secondary btn-small') {
    return `<a class="btn btn-${tone}" href="#${escape(path)}" data-route="${escape(path)}">${label}</a>`;
  }
  function renderSteps(event, stage) {
    const steps = [
      ['회차 준비', '일정 등록함'],
      ['참석 투표', pollIsOpen(event) ? `${dateLabel(event.deadline)} ${event.deadlineTime} 마감` : event.pollOpen || deadlinePassed(event) ? '마감됨' : '투표 닫힘'],
      ['당일 출석', stage >= 2 ? `${attendanceCounts(event).present}명 출석` : dateLabel(event.date)],
      ['마무리', stage === 4 ? '확정' : '콕·찬조금 기록']
    ];
    return `<ol class="session-steps" aria-label="회차 진행">${steps.map(([label, detail], index) => {
      const [step, word] = index < stage ? ['done', '완료'] : index === stage ? ['now', '지금'] : ['next', '예정'];
      return `<li data-step="${step}"${step === 'now' ? ' aria-current="step"' : ''}><span class="session-step-state">${word}</span><strong>${label}</strong><small>${escape(detail)}</small></li>`;
    }).join('')}</ol>`;
  }
  function todoRow(glyph, tone, title, detail, action) {
    return `<li class="todo-row"><span class="metric-icon ${tone}">${icon(glyph,19)}</span><div><strong>${title}</strong><p>${detail}</p></div>${action}</li>`;
  }
  function renderTodo(upcoming, last) {
    const items = [];
    if (upcoming && !upcoming.pollOpen && !deadlinePassed(upcoming) && sessionStage(upcoming) < 2) {
      items.push(todoRow('clipboard','sand','참석 투표가 닫혀 있어요',`${escape(dateLabel(upcoming.date))} 회차 투표를 열어야 회원이 응답할 수 있어요.`,
        routeButton('회차 열기', `event/${upcoming.id}/poll`)));
    } else if (upcoming && pollIsOpen(upcoming) && counts(upcoming).pending) {
      items.push(todoRow('users','mint',`미응답 ${counts(upcoming).pending}명`,`${escape(dateLabel(upcoming.deadline))} ${escape(upcoming.deadlineTime)} 마감이에요. 단체방에 투표 링크를 다시 올려 주세요.`,
        `<button class="btn btn-secondary btn-small" type="button" data-action="open-share" data-kind="vote" data-id="${escape(upcoming.id)}">${icon('link',16)} 카톡 공유</button>`));
    }
    if (last && !last.finalized) {
      items.push(todoRow('clipboard','mint',`${escape(dateLabel(last.date))} 회차 출석 확정 전이에요`,'출석과 게스트를 확정해야 통계와 마무리 글에 반영돼요.',
        routeButton('출석 확정하기', `event/${last.id}/attendance`)));
    }
    if (!upcoming) {
      items.push(todoRow('repeat','mint','예정된 회차가 없어요', state.repeat.enabled ? '반복 일정으로 다음 회차를 만들 수 있어요.' : '새 회차를 만들어 투표를 시작하세요.',
        `<button class="btn btn-secondary btn-small" type="button" data-action="${state.repeat.enabled ? 'generate-next' : 'open-event'}">${state.repeat.enabled ? '다음 회차 만들기' : '새 회차'}</button>`));
    }
    return `<section class="panel todo-panel" aria-labelledby="home-todo-title"><header class="dashboard-panel-head"><h2 id="home-todo-title">챙길 일</h2></header>
      ${items.length ? `<ul class="todo-list">${items.join('')}</ul>` : '<p class="muted todo-empty">지금 챙길 일이 없어요.</p>'}</section>`;
  }
  function renderLast(event) {
    let body = '<p class="muted">아직 지난 회차가 없어요.</p>';
    if (event) {
      const present = attendanceCounts(event).present;
      const arrived = event.guests.filter(guest => guest.arrived).length;
      const skipped = event.roster.filter(id => ['early','late'].includes(event.votes[id]) && event.attendance[id] === 'absent').length;
      body = `<div class="last-session"><div><strong>${escape(event.title)}</strong><p>${escape(dateLabel(event.date))} · ${escape(event.place)}</p></div><span class="pill pill-${event.finalized ? 'green' : 'warm'}">${event.finalized ? '마무리 완료' : '마무리 전'}</span></div>
        <dl class="summary-grid">${[['출석',present,' summary-green'],['게스트 도착',arrived,''],['응답 후 불참',skipped,'']].map(([label,value,tone]) => `<div class="summary-item${tone}"><dt>${label}</dt><dd>${value}명</dd></div>`).join('')}</dl>
        <div class="last-session-action">${event.finalized ? routeButton('마무리 보기', `event/${event.id}/settlement`) : routeButton('출석 확정하기', `event/${event.id}/attendance`)}</div>`;
    }
    return `<section class="panel last-panel" aria-labelledby="home-last-title"><header class="dashboard-panel-head"><h2 id="home-last-title">지난 회차</h2></header>${body}</section>`;
  }
  function renderFeatured(event) {
    const id = escape(event.id);
    const stage = sessionStage(event);
    const [label, tab] = stage === 2 ? ['당일 출석 체크', 'attendance'] : stage >= 3 ? ['마무리하기', 'settlement'] : ['회차 관리', 'poll'];
    return `<section class="featured" aria-label="다음 모임">
      <div class="featured-content">
        <div class="featured-kicker"><i></i> 다음 모임</div>
        <h2>${escape(event.title)}</h2>
        <div class="featured-meta"><span>${icon('calendar',18)} ${fullDate(event.date)} · ${escape(event.time)}${event.endTime ? '–'+escape(event.endTime) : ''}</span><span>${icon('pin',18)} ${escape(event.place)}</span></div>
        <div class="featured-actions"><a class="btn btn-lime" href="#event/${id}/${tab}" data-route="event/${id}/${tab}">${label} ${icon('chevron-right',17)}</a>
          <a class="btn btn-glass" href="#public-vote/${id}" data-route="public-vote/${id}">${icon('clipboard',17)} 회원 화면 체험</a></div>
      </div>${renderSteps(event, stage)}
    </section>`;
  }
  function renderPoll(event) {
    const {yes,no,pending,total,early,late,lunch} = counts(event);
    const opened = pollIsOpen(event);
    const percent = total ? Math.round((yes+no) / total * 100) : 0;
    const branch = (part) => total ? (part / total * 100) + '%' : '0%';
    return `<section class="panel poll-dashboard" aria-label="참석 투표 현황">
      <header class="dashboard-panel-head"><h2>참석 투표</h2><span class="poll-status${opened ? '' : ' closed'}"><i></i>${opened ? '투표 진행 중' : '투표 마감'}</span></header>
      <div class="progress-meta"><span>응답률</span><strong>${percent}<small>%</small></strong></div>
      <div class="poll-track" role="img" aria-label="응답률 ${percent}%"><span class="vote-yes" style="width:${branch(yes)}"></span><span class="vote-no" style="width:${branch(no)}"></span></div>
      <div class="poll-grid">${[['선발',early,'yes'],['후발',late,'yes'],['점심',lunch,'no']].map(([name,n,status])=>`<div><span><i class="vote-${status}"></i>${name}</span><strong>${n}<small>명</small></strong></div>`).join('')}</div>
      <p class="poll-subline">참석 예정 ${yes}명 · 불참 ${no}명 · 미응답 ${pending}명</p>
      <div class="poll-footer"><span>${icon('clock',16)} ${event.deadline ? `${readPeriod(event.deadline)} ${escape(event.deadlineTime)} 마감` : '마감일 미설정'}</span><button class="btn btn-secondary btn-small" type="button" data-action="open-share" data-kind="vote" data-id="${escape(event.id)}">${icon('link',16)} 카톡 공유</button></div>
    </section>`;
  }
  function metric(route, glyph, tone, label, value, unit) {
    return `<a class="panel metric" href="#${route}" data-route="${route}"><span class="metric-icon ${tone}">${icon(glyph,21)}</span><div><span class="metric-label">${label}</span><div class="metric-value">${value}<small>${unit}</small></div></div>${icon('chevron-right',16)}</a>`;
  }

  function openDialog(type,id,trigger,kind) {
    const data = {type,id,kind};
    modal.innerHTML = type === 'share'
      ? window.clubShare.renderShare(data,state,helpers)
      : window.clubScreens.renderDialog(data,state,helpers);
    if (!modal.innerHTML.trim()) return;
    dialogTrigger = trigger;
    if (!modal.open) modal.showModal();
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
    modal.showModal();
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
      deadlineTime:repeat.deadlineTime, notes:'', pollOpen:true, finalized:false,
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
  mobileNav.addEventListener('cancel', event => {
    event.preventDefault();
    closeMobileMenu();
  });
  mobileNav.addEventListener('close', () => {
    if (!mobileNav.open) unlockMobileMenu(true);
  });
  window.matchMedia('(max-width: 700px)').addEventListener('change', event => {
    if (!event.matches) closeMobileMenu(false);
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
    const openTypes = ['event','member','notice','repeat','vote','share'];
    if (openTypes.includes(action.replace(/^open-/, ''))) {
      openDialog(action.slice(5),id,control,kind);
      return;
    }
    if (action === 'close-dialog') modal.close();
    if (action === 'open-menu') openMobileMenu(control);
    if (action === 'close-menu') closeMobileMenu();
    if (action === 'generate-next') generateNext(control);
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
    if (!event) return;
    if (action === 'open-event-notice') return openEventNotice(event,control);
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
    if (action === 'toggle-poll' && !event.finalized && !deadlinePassed(event)) {
      event.pollOpen = !event.pollOpen;
      persist(pollIsOpen(event) ? '참석 투표를 열었어요.' : '참석 투표를 닫았어요.');
    } else if (action === 'mark-attendance' && event.date <= today && !event.finalized && event.roster.includes(member)) {
      if (value === 'present' || value === 'absent') event.attendance[member] = value;
      else delete event.attendance[member];
      if (value !== 'present' && event.recognized[member] !== 'approved') delete event.recognized[member];
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
    } else if (action === 'finalize' && event.date <= today && !event.finalized) {
      if (attendanceCounts(event).pending) return showToast('아직 출석을 기록하지 않은 회원이 있어요.');
      event.finalized = true;
      event.pollOpen = false;
      persist('출석을 마감했어요. 통계에 반영됩니다.');
    } else if (action === 'reopen-attendance' && event.finalized) {
      event.finalized = false;
      persist('출석 기록을 다시 수정할 수 있어요.');
    } else return;
    renderPage();
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
    app.querySelector('.secondary-page .panel-body').replaceWith(view.content.querySelector('.panel-body'));
  }
  document.addEventListener('input', ev => {
    const input = ev.target;
    if (input.form && input.setCustomValidity) input.setCustomValidity('');
    if (!ev.isComposing) filterMembers(input);
  });
  document.addEventListener('compositionend', ev => filterMembers(ev.target));
  document.addEventListener('change', ev => {
    const input = ev.target;
    if (input.matches('[data-recognition]')) {
      const event = state.events.find(item => item.id === input.dataset.id);
      const member = input.dataset.member;
      if (!event || event.date > today || event.finalized || !event.roster.includes(member)) return;
      if (input.value === 'approved' || (['direct','substitute'].includes(input.value) && event.attendance[member] === 'present')) event.recognized[member] = input.value;
      else delete event.recognized[member];
      persist('줄서기 인정 기록을 갱신했어요.');
      return;
    }
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
      if (value('deadline') && value('deadline') > value('date')) return fieldError(form,'deadline','투표 마감은 운동 날짜 이전으로 정해 주세요.');
      let event = state.events.find(item => item.id === id);
      if (event?.finalized && value('date') > today) return fieldError(form,'date','출석을 확정한 모임은 미래 날짜로 옮길 수 없어요.');
      if (!event) {
        event = {id:idFor('event'),finalized:false,roster:state.members.filter(member => member.status === 'active').map(member => member.id),
          votes:{},lunch:{},attendance:{},recognized:{},guests:[],settlement:{}};
        state.events.push(event);
      }
      Object.assign(event, Object.fromEntries(['title','date','time','endTime','earlyTime','lateTime','place','deadline','deadlineTime','notes'].map(key => [key,value(key)])));
      event.pollOpen = formData.has('pollOpen') && !event.finalized;
      target = 'event/'+event.id+'/poll';
      message = '모임 일정을 저장했어요.';
    } else if (type === 'notice') {
      const notice = state.notices.find(item => item.id === id) || {id:idFor('notice'),date:today};
      if (!id) state.notices.unshift(notice);
      Object.assign(notice,{title:value('title'),body:value('body'),pinned:formData.has('pinned')});
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
  modal.addEventListener('close', () => {
    if (dialogTrigger?.isConnected) dialogTrigger.focus({preventScroll:true});
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#main-content') return;
    if (modal.open) modal.close();
    currentRoute = routeFromHash();
    if (mobileNav.open) closeMobileMenu(false);
    renderPage({focus:true});
    window.scrollTo(0,0);
  });
  window.addEventListener('storage', ev => {
    if (ev.key !== model.storageKey) return;
    Object.assign(state,model.load());
    if (!modal.open) renderPage();
  });
  currentRoute = routeFromHash();
  renderPage();
})();
