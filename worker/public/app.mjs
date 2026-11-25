import {
  adminHome, adminMenu, adminShell, attendanceForm, button, countEvent, esc, eventDefaults, eventForm, eventScreen,
  homeVoteCounts,
  guestForm, homeScreen, loginHelp, loginScreen, memberForm, membersScreen, memberVoteScreen, noticeForm, noticeScreen,
  noticesScreen, overrideForm, pinForm, progressScreen, reportText, today, voteMetrics,
} from './views.mjs';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const clubLink = document.querySelector('#club-home');
const loginMenu = document.querySelector('#login-menu');
const dialog = document.querySelector('#dialog');
const message = document.querySelector('#message');
const desktopNavigation = window.matchMedia('(min-width: 900px)');
const loadingMarkup = '<p role="status">모임을 불러오는 중이에요.</p>';

const meta = name => document.querySelector(`meta[name="${name}"]`)?.content.trim() ?? '';
const clubBase = meta('club-base');
const club = {
  home: `${clubBase}/`,
  admin: `${clubBase}/admin/`,
  name: meta('club-name'),
  subtitle: meta('club-subtitle'),
  defaultPlace: meta('club-default-place'),
};
const scopedPath = /^\/clubs\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clubBase)
  && location.pathname.startsWith(club.home)
  ? location.pathname.slice(clubBase.length)
  : '';
const path = scopedPath.match(/^\/(vote|notice)\/([^/]+)\/?$/);
const route = path ? { kind: path[1], id: path[2] }
  : scopedPath === '/' ? { kind: 'home' }
  : scopedPath === '/admin/' || scopedPath === '/admin' ? { kind: 'admin' } : null;
const date = today();
const state = {
  user: null,
  section: 'home',
  selectedEvent: null,
  admin: null,
  upcoming: null,
  listing: { events: [], notices: [] },
  detail: null,
  event: null,
  notice: null,
  vote: null,
  eligible: false,
  period: { year: Number(date.slice(0, 4)), half: Number(date.slice(5, 7)) < 7 ? 1 : 2 },
  progress: [],
};
let busy = false;
let messageTimer;
let eventSnapshot = null;
let navigationVersion = 0;
let renderedAccountUser;
let dialogOpener = null;
let startedOnBackdrop = false;
let dialogScrollTop = null;
const signIn = { name: null, numberStep: false };

const authRole = route?.kind === 'admin' ? 'admin' : 'member';
const authPath = command => `/api/${authRole === 'admin' ? 'admin/' : ''}${command}`;
const clubTitle = `${club.name} · 콕콕콕!`;
const savedNameKey = `cockcockcock:member-name:${clubBase}`;
const savedNameLifetime = 30 * 24 * 60 * 60 * 1000;

function rememberedName() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedNameKey));
    if (typeof saved?.name === 'string' && saved.name.length <= 60 && saved.expiresAt > Date.now()) return saved.name;
    localStorage.removeItem(savedNameKey);
  } catch {
    // Signing in still works if browser storage is unavailable.
  }
  return '';
}

function rememberName(name) {
  try {
    localStorage.setItem(savedNameKey, JSON.stringify({ name, expiresAt: Date.now() + savedNameLifetime }));
  } catch {
    // Signing in still works if browser storage is unavailable.
  }
}

class RequestError extends Error {
  constructor(text, status) {
    super(text);
    this.status = status;
  }
}

async function request(url, method = 'GET', body = undefined) {
  const version = navigationVersion;
  let response;
  try {
    response = await fetch(`${clubBase}${url}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    if (version !== navigationVersion) throw new DOMException('페이지가 이동했습니다.', 'AbortError');
    throw new RequestError('서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.', 0);
  }
  const result = await response.json().catch(() => null);
  if (version !== navigationVersion) throw new DOMException('페이지가 이동했습니다.', 'AbortError');
  if (!response.ok) throw new RequestError(result?.error || '저장한 내용을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', response.status);
  if (!result) throw new RequestError('서버의 응답을 확인하지 못했어요.', response.status);
  return result;
}

const id = value => encodeURIComponent(value);
const adminEventPath = (eventId = state.selectedEvent) => `/api/admin/events/${id(eventId)}`;
const votePath = () => `/api/votes/${id(route.id)}`;

function hideMessage() {
  clearTimeout(messageTimer);
  message.textContent = '';
  message.hidden = true;
}

function showMessage(text, error = false, { visuallyHidden = false } = {}) {
  clearTimeout(messageTimer);
  message.textContent = text;
  message.classList.toggle('error', error);
  message.classList.toggle('visually-hidden', visuallyHidden);
  message.hidden = false;
  messageTimer = setTimeout(() => { message.hidden = true; }, 5000);
}

function renderAccount() {
  document.title = state.user?.role === 'admin' ? `${club.name} 운영진 · 콕콕콕!` : clubTitle;
  if (renderedAccountUser === state.user) return;
  renderedAccountUser = state.user;
  const signedIn = state.user?.role === authRole;
  clubLink.hidden = !signedIn;
  loginMenu.hidden = signedIn;
  if (!signedIn) {
    account.innerHTML = '';
    return;
  }
  const user = state.user;
  clubLink.href = user.role === 'admin' ? club.admin : club.home;
  account.innerHTML = `${user.role === 'admin' ? `<button class="quiet admin-menu-toggle" type="button" data-action="admin-menu" aria-label="운영 메뉴 열기" aria-haspopup="dialog" aria-controls="dialog"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>` : ''}
    <span class="account-name">${user.role === 'admin' ? '이 모임 운영진' : esc(user.name)}</span>
    ${user.role === 'member' ? button('PIN 관리', 'pin', { css: 'quiet compact' }) : ''}
    ${button('로그아웃', 'logout', { css: 'quiet compact' })}`;
}

function failedPage(error) {
  renderAccount();
  main.classList.add('narrow');
  main.innerHTML = `<div class="panel"><h1>${error.status === 404 ? '페이지를 찾을 수 없어요' : '모임을 불러오지 못했어요'}</h1>
    <p>${error.status === 404 ? '공지나 투표 링크를 운영진에게 확인해 주세요.' : esc(error.message)}</p>
    <div class="actions">${button('다시 불러오기', 'reload', { css: 'secondary' })}<a class="button secondary" href="${esc(club.home)}">모임 홈으로</a></div></div>`;
}

async function loadEvent() {
  state.detail = state.selectedEvent ? await request(adminEventPath()) : null;
}

async function loadProgress(period = state.period) {
  const { year, half } = period;
  const response = await request(`/api/admin/progress?year=${year}&half=${half}`);
  state.period = period;
  state.progress = response.members;
}

async function load() {
  if (state.user?.role !== authRole) return;
  if (route.kind === 'vote') {
    ({ event: state.event } = await request(`/api/public/vote/${id(route.id)}`));
    state.vote = null;
    state.eligible = false;
    try {
      ({ vote: state.vote } = await request(votePath()));
      state.eligible = true;
    } catch (error) {
      if (error.status !== 403 && error.status !== 404) throw error;
    }
  } else if (route.kind === 'notice') {
    ({ notice: state.notice } = await request(`/api/public/notice/${id(route.id)}`));
  } else if (route.kind === 'home') {
    state.listing = await request('/api/public');
  } else if (state.user?.role === 'admin') {
    state.admin = await request('/api/admin');
    const events = state.admin.events.sort((a, b) => b.date.localeCompare(a.date));
    const kstMinute = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const soonest = [...events].reverse().find(event => `${event.date}T${event.endTime}` > kstMinute);
    if (!events.some(event => event.id === state.selectedEvent)) {
      state.selectedEvent = soonest?.id ?? events[0]?.id ?? null;
    }
    if (state.section === 'home') state.upcoming = soonest ? await request(adminEventPath(soonest.id)) : null;
    if (state.section === 'event') await loadEvent();
    if (state.section === 'progress') await loadProgress();
  }
}

function render({ voteSaved = false, motion = '' } = {}) {
  main.dataset.motion = motion;
  const search = main.querySelector('input[data-filter]');
  renderAccount();
  const isAdmin = route.kind === 'admin' && state.user?.role === 'admin';
  main.classList.toggle('narrow', !isAdmin);
  if (!state.user) {
    main.innerHTML = loginScreen(club, signIn.name ?? rememberedName(), signIn.numberStep);
  } else if (route.kind === 'vote') {
    main.innerHTML = memberVoteScreen(state.event, state.vote, state.eligible, club, voteSaved);
  } else if (route.kind === 'notice') {
    main.innerHTML = noticeScreen(state.notice, club);
  } else if (route.kind === 'home') {
    main.innerHTML = homeScreen(state.listing, club);
  } else if (isAdmin) {
    let body;
    if (state.section === 'home') body = adminHome(state.admin, state.upcoming, club);
    else if (state.section === 'members') body = membersScreen(state.admin.members);
    else if (state.section === 'notices') body = noticesScreen(state.admin.notices);
    else if (state.section === 'progress') body = progressScreen(state.period.year, state.period.half, state.progress);
    else body = eventScreen(state.admin.events, state.detail, club);
    main.innerHTML = adminShell(state.section, body);
    const newSearch = main.querySelector('input[data-filter]');
    if (newSearch && search?.dataset.filter === newSearch.dataset.filter) {
      newSearch.value = search.value;
      applyFilter(newSearch);
    }
  }
}

function clearProtectedView() {
  navigationVersion++;
  busy = false;
  Object.assign(state, {
    user: null, section: 'home', selectedEvent: null, admin: null, upcoming: null, listing: { events: [], notices: [] },
    detail: null, event: null, notice: null, vote: null, eligible: false, progress: [],
  });
  eventSnapshot = null;
  Object.assign(signIn, { name: null, numberStep: false });
  dialogOpener = null;
  closeDialog();
  dialog.replaceChildren();
  account.replaceChildren();
  clubLink.hidden = true;
  renderedAccountUser = undefined;
  document.title = clubTitle;
  hideMessage();
  main.classList.add('narrow');
  main.innerHTML = loadingMarkup;
}

function loginExpired() {
  clearProtectedView();
  render();
  showMessage('로그인이 만료됐어요. 다시 로그인해 주세요.', true);
}

async function initialize() {
  try {
    const { user } = await request(authPath('session'));
    state.user = user?.role === authRole ? user : null;
    if (!state.user && route.kind === 'home') {
      const adminSession = await request('/api/admin/session').catch(error => {
        if (error.name === 'AbortError') throw error;
        return null;
      });
      if (adminSession?.user?.role === 'admin') {
        location.replace(club.admin);
        return;
      }
    }
    await load();
    render();
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401) return loginExpired();
    failedPage(error);
  }
}

async function openSignedInPage() {
  main.innerHTML = loadingMarkup;
  try {
    await load();
    render();
  } catch (error) {
    if (error.name === 'AbortError' || error.status === 401) throw error;
    failedPage(error);
  }
  if (route.kind === 'admin') window.scrollTo(0, 0);
  main.focus({ preventScroll: route.kind === 'admin' });
}

async function checkAdminSession() {
  const user = state.user;
  if (document.hidden || user?.role !== 'admin') return;
  try {
    const { user: detected } = await request(authPath('session'));
    if (state.user === user && detected?.role !== 'admin') loginExpired();
  } catch (error) {
    if (state.user === user && error.status === 401) loginExpired();
  }
}

function openDialog(title, body, className = '') {
  startedOnBackdrop = false;
  dialog.className = className;
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title" tabindex="-1">${title}</h2>
    <button type="button" class="dialog-close" data-action="close" aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    <div class="dialog-body stack"><p class="inline-error" role="alert" hidden></p>${body}</div>`;
  if (!dialog.open) {
    dialogScrollTop = window.scrollY;
    document.body.style.top = `-${dialogScrollTop}px`;
    document.body.classList.add('dialog-scroll-lock');
    dialog.showModal();
  }
  dialog.querySelector('#dialog-title').focus({ preventScroll: true });
}

function unlockDialogScroll() {
  if (dialogScrollTop === null) return;
  document.body.classList.remove('dialog-scroll-lock');
  document.body.style.removeProperty('top');
  window.scrollTo({ top: dialogScrollTop, behavior: 'instant' });
  dialogScrollTop = null;
}

function closeDialog() {
  if (!dialog.open) return;
  dialog.close();
  unlockDialogScroll();
}

function matchingControl(control) {
  if (control?.isConnected) return control;
  if (!control?.dataset.action) return null;
  return [...document.querySelectorAll('button[data-action]')].find(candidate =>
    candidate.dataset.action === control.dataset.action && candidate.dataset.id === control.dataset.id && !candidate.disabled);
}

function credentialDialog(name, temporaryPin) {
  const text = `${club.name} 접속 안내\n성함 ${name}\n임시 번호 ${temporaryPin}\n성함을 입력하고 임시 번호 6자리를 입력해 주세요.\n새 PIN을 설정할 때까지 임시 번호로 로그인할 수 있어요.\n${new URL(club.home, location.origin).href}`;
  openDialog('회원에게 보낼 접속 안내', `<p>${esc(name)} 회원에게 이 내용을 개인 메시지로 전달해 주세요.</p>
    <textarea class="copy-text" readonly rows="6" aria-label="회원 접속 안내">${esc(text)}</textarea>
    ${button('접속 안내 복사', 'copy-invitation')}`);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showMessage('복사했어요.');
  } catch {
    openDialog('직접 복사하기', `<label class="field"><span>아래 내용을 선택해 복사해 주세요.</span>
      <textarea readonly rows="6">${esc(text)}</textarea></label>`);
    const textarea = dialog.querySelector('textarea');
    textarea.focus();
    textarea.select();
  }
}

async function update(url, method, data, notice) {
  await request(url, method, data);
  await showSaved(notice);
}

async function showSaved(notice, motion = '') {
  try {
    await load();
    render({ motion });
    showMessage(notice);
  } catch (error) {
    if (error.status === 401 || error.name === 'AbortError') throw error;
    failedPage(new RequestError(`${notice} 화면을 다시 불러와 확인해 주세요.`, error.status === 404 ? 0 : error.status));
  } finally {
    closeDialog();
  }
}

async function refreshVoteCounts() {
  if (document.hidden || busy || dialog.open || state.user?.role !== 'admin') return;
  const onHome = state.section === 'home';
  const target = main.querySelector(onHome ? '#home-vote-counts' : '#vote-counts');
  if (!target) return;
  try {
    const detail = await request(adminEventPath(onHome ? state.upcoming.event.id : state.selectedEvent));
    if (target.isConnected && !busy) {
      target.innerHTML = onHome ? homeVoteCounts(detail) : voteMetrics(countEvent(detail.roster, detail.guests));
      if (onHome) {
        for (const action of main.querySelectorAll('[data-home-published]')) {
          if (!detail.event.published && action.contains(document.activeElement)) {
            main.querySelector('[data-action=open-event]')?.focus({ preventScroll: true });
          }
          action.hidden = !detail.event.published;
        }
      }
    }
  } catch (error) {
    if (error.status === 401 && target.isConnected) loginExpired();
    // The existing counts remain visible when a background refresh cannot reach the server.
  }
}

function findRoster(personId) {
  return state.detail?.roster.find(person => person.id === personId);
}

function shareLink(kind, itemId) {
  return new URL(`${club.home}${kind}/${id(itemId)}`, location.origin).href;
}

function showLoginStep(motion) {
  hideMessage();
  render({ motion });
  main.querySelector('.login-form input').focus();
}

function clearLoginRejection(input) {
  const field = input.closest('.login-rejected');
  if (!field || !input.value) return;
  field.classList.remove('login-rejected');
  field.querySelector('#login-error').hidden = true;
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
}

function updateLoginCode(input) {
  const cells = input.nextElementSibling.children;
  for (let index = 0; index < cells.length; index++) {
    cells[index].toggleAttribute('data-filled', index < input.value.length);
    cells[index].toggleAttribute('data-position', index === Math.min(input.selectionStart, cells.length - 1));
  }
}

function submitCompleteCode(input) {
  updateLoginCode(input);
  if (input.value.length === 6 && !busy) input.form.requestSubmit();
}

async function doAction(action, itemId) {
  switch (action) {
    case 'reload':
      await initialize();
      break;
    case 'close':
      closeDialog();
      break;
    case 'login-menu': {
      const home = route.kind === 'home' ? '' : `<a class="button secondary" href="${esc(club.home)}">모임 홈</a>`;
      openDialog('메뉴', `<div class="stack">${home}${button('로그인 도움말', 'login-help', { css: 'secondary' })}</div>`, 'login-menu-dialog');
      break;
    }
    case 'login-help':
      hideMessage();
      openDialog('로그인 도움말', loginHelp());
      break;
    case 'login-back':
      signIn.numberStep = false;
      showLoginStep('login-back');
      break;
    case 'logout':
      await request(authPath('logout'), 'POST', {});
      clearProtectedView();
      render();
      showMessage('로그아웃했어요.');
      break;
    case 'pin':
      openDialog('PIN 설정·변경', pinForm());
      break;
    case 'admin-menu':
      openDialog('운영 메뉴', adminMenu(state.section), 'admin-menu-dialog');
      break;
    case 'open-event':
    case 'tab': {
      const section = action === 'open-event' ? 'event' : itemId;
      if (state.section !== section) dialogOpener = null;
      closeDialog();
      if (state.section === section) break;
      const previous = state.section;
      const previousEvent = state.selectedEvent;
      state.section = section;
      if (action === 'open-event') state.selectedEvent = itemId;
      try {
        await load();
      } catch (error) {
        if (state.section === section) {
          state.section = previous;
          state.selectedEvent = previousEvent;
        }
        throw error;
      }
      render({ motion: 'section' });
      window.scrollTo(0, 0);
      const target = desktopNavigation.matches ? main.querySelector('.admin-sidebar [aria-current="page"]') : main.querySelector('.admin-section-head h1');
      (target ?? main).focus({ preventScroll: true });
      break;
    }
    case 'refresh':
      await load();
      render();
      showMessage('응답과 출석을 다시 불러왔어요.');
      break;
    case 'new-event':
      openDialog('새 회차', eventForm(eventDefaults(null, club.defaultPlace)));
      break;
    case 'clone-event': {
      const event = itemId ? state.admin.events.find(event => event.id === itemId) : state.detail.event;
      openDialog('다음 주 회차', eventForm(eventDefaults(event, club.defaultPlace, { keepFuture: Boolean(itemId) })));
      break;
    }
    case 'edit-event':
      eventSnapshot = { ...state.detail.event };
      openDialog('회차 수정', eventForm(eventSnapshot, state.selectedEvent));
      break;
    case 'publish-event': {
      const published = !state.detail.event.published;
      const change = published ? { published: true } : { published: false, open: false };
      await update(adminEventPath(), 'PATCH', change, published ? '링크를 공개했어요.' : '링크 공개를 내렸어요.');
      break;
    }
    case 'toggle-vote': {
      const open = !state.detail.event.open;
      await update(adminEventPath(), 'PATCH', { open }, open ? '투표를 열었어요.' : '투표를 닫았어요.');
      break;
    }
    case 'copy-vote':
      await copy(shareLink('vote', itemId || state.selectedEvent));
      break;
    case 'copy-notice':
      await copy(shareLink('notice', itemId));
      break;
    case 'mark-present': {
      const member = findRoster(itemId);
      const present = member.present === true ? null : true;
      const recognition = present === null && member.recognition !== 'approved' ? null : member.recognition;
      await update(`${adminEventPath()}/attendance/${id(itemId)}`, 'PUT', { present, recognition },
        present ? '출석을 기록했어요.' : '출석 표시를 취소했어요.');
      break;
    }
    case 'attendance':
      openDialog('출석 상세 기록', attendanceForm(findRoster(itemId)));
      break;
    case 'vote-override':
      openDialog('회원 응답 변경', overrideForm(state.detail.event, findRoster(itemId)));
      break;
    case 'clear-vote':
      await update(`${adminEventPath()}/votes/${id(itemId)}`, 'PUT', { slot: null, lunch: false }, '응답을 삭제했어요.');
      break;
    case 'new-guest':
      openDialog('게스트 등록', guestForm());
      break;
    case 'edit-guest':
      openDialog('게스트 수정', guestForm(state.detail.guests.find(guest => guest.id === itemId)));
      break;
    case 'copy-report':
      await copy(reportText(state.detail, club.name));
      break;
    case 'new-member':
      openDialog('회원 등록', memberForm());
      break;
    case 'edit-member':
      openDialog('회원 수정', memberForm(state.admin.members.find(member => member.id === itemId)));
      break;
    case 'reset-member':
      openDialog('회원 접속 재설정', '<p>재설정하면 기존 비밀번호와 로그인 상태가 만료됩니다. 임시 번호를 받을 회원이 맞는지 확인해 주세요.</p>'
        + button('새 임시 번호 만들기', 'confirm-reset-member', { id: itemId }));
      break;
    case 'confirm-reset-member': {
      const member = state.admin.members.find(person => person.id === itemId);
      const result = await request(`/api/admin/members/${id(itemId)}/reset`, 'POST', {});
      credentialDialog(member.name, result.temporaryPin);
      break;
    }
    case 'copy-invitation':
      await copy(dialog.querySelector('.copy-text').value);
      break;
    case 'new-notice':
      openDialog('새 공지', noticeForm());
      break;
    case 'edit-notice':
      openDialog('공지 수정', noticeForm(state.admin.notices.find(notice => notice.id === itemId)));
      break;
    case 'reward': {
      const member = state.progress.find(person => person.id === itemId);
      await update('/api/admin/progress', 'PUT', { ...state.period, memberId: itemId, rewarded: !member.rewarded }, '콕 수령 기록을 저장했어요.');
      break;
    }
  }
}

const raw = (data, key) => String(data.get(key) ?? '');
const read = (data, key) => raw(data, key).trim();

function buildEvent(data) {
  const fields = ['title', 'date', 'time', 'endTime', 'place', 'deadline', 'earlyTime', 'lateTime', 'notes'];
  const event = Object.fromEntries(fields.map(key => [key, read(data, key)]));
  event.open = data.has('open');
  event.published = data.has('published');
  if (!event.published && event.open) throw new Error('웹 투표를 열려면 공유 링크도 공개해 주세요.');
  return event;
}

async function doSubmit(kind, itemId, data) {
  switch (kind) {
    case 'login-name': {
      const name = read(data, 'name');
      if (!name) throw new RequestError('성함을 입력해 주세요.', 400);
      signIn.name = name;
      signIn.numberStep = true;
      showLoginStep('login-next');
      break;
    }
    case 'login': {
      const { user } = await request('/api/login', 'POST', {
        name: signIn.name, credential: raw(data, 'credential'),
      });
      if (user?.role !== 'member' && user?.role !== 'admin') throw new Error('로그인 권한을 확인하지 못했어요.');
      if (user.role === 'member') rememberName(user.name);
      if (user.role !== authRole) {
        main.innerHTML = loadingMarkup;
        location.replace(user.role === 'admin' ? club.admin : club.home);
        break;
      }
      state.user = user;
      await openSignedInPage();
      break;
    }
    case 'pin': {
      const newPin = read(data, 'newPin');
      if (newPin !== read(data, 'confirmPin')) throw new Error('새 PIN이 서로 달라요. 다시 확인해 주세요.');
      ({ user: state.user } = await request('/api/pin', 'POST', { currentPin: raw(data, 'currentPin'), newPin }));
      await showSaved(state.user ? 'PIN을 저장했어요.' : 'PIN을 저장했어요. 새 PIN으로 다시 로그인해 주세요.');
      break;
    }
    case 'vote':
      ({ vote: state.vote } = await request(votePath(), 'PUT', { slot: read(data, 'slot'), lunch: data.has('lunch') }));
      render({ voteSaved: true });
      main.querySelector('[data-form="vote"] button[type="submit"]')?.focus({ preventScroll: true });
      showMessage('응답을 저장했어요.', false, { visuallyHidden: true });
      break;
    case 'event': {
      const values = buildEvent(data);
      const changed = itemId && eventSnapshot?.id === itemId
        ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== eventSnapshot[key]))
        : values;
      if (!Object.keys(changed).length) {
        closeDialog();
        showMessage('변경된 내용이 없어요.');
        break;
      }
      const result = await request(itemId ? `/api/admin/events/${id(itemId)}` : '/api/admin/events',
        itemId ? 'PATCH' : 'POST', changed);
      const fromHome = state.section === 'home';
      if (fromHome) {
        state.section = 'event';
        dialogOpener = null;
      }
      state.selectedEvent = result.event.id;
      await showSaved('회차를 저장했어요.', fromHome ? 'section' : '');
      if (fromHome) (main.querySelector('.admin-section-head h1') ?? main).focus({ preventScroll: true });
      break;
    }
    case 'attendance': {
      const presence = read(data, 'present');
      const present = presence ? presence === 'true' : null;
      const recognition = read(data, 'recognition') || null;
      if (present !== true && (recognition === 'substitute' || recognition === 'direct')) {
        throw new Error('직접·대타 인정은 해당 회원의 실제 출석을 함께 체크해 주세요.');
      }
      await update(`${adminEventPath()}/attendance/${id(itemId)}`, 'PUT', { present, recognition }, '출석 기록을 저장했어요.');
      break;
    }
    case 'vote-override':
      await update(`${adminEventPath()}/votes/${id(itemId)}`, 'PUT', { slot: read(data, 'slot'), lunch: data.has('lunch') }, '회원 응답을 저장했어요.');
      break;
    case 'guest': {
      const guest = {
        name: read(data, 'name'), level: read(data, 'level'), invitedBy: read(data, 'invitedBy'),
        status: read(data, 'status'), paid: data.has('paid'),
      };
      if (itemId) guest.id = itemId;
      await update(`${adminEventPath()}/guests`, 'POST', guest, '게스트 정보를 저장했어요.');
      break;
    }
    case 'settlement': {
      const fields = ['priorSingles', 'priorTubes', 'remainingSingles', 'courtDonation'];
      const settlement = Object.fromEntries(fields.map(key => [key, Number(read(data, key))]));
      settlement.confirmed = data.has('confirmed');
      await update(`${adminEventPath()}/settlement`, 'PUT', settlement, '마무리 기록을 저장했어요.');
      break;
    }
    case 'member': {
      const name = read(data, 'name');
      if (itemId) {
        await update(`/api/admin/members/${id(itemId)}`, 'PATCH', { name, active: data.has('active') }, '회원 정보를 저장했어요.');
      } else {
        await request('/api/admin/members', 'POST', { name, birthday: read(data, 'birthday') });
        await showSaved('회원을 등록했어요.');
      }
      break;
    }
    case 'notice': {
      const notice = { title: read(data, 'title'), body: read(data, 'body'), published: data.has('published') };
      if (itemId) notice.id = itemId;
      await update('/api/admin/notices', 'POST', notice, '공지를 저장했어요.');
      break;
    }
    case 'progress':
      await loadProgress({ year: Number(read(data, 'year')), half: Number(read(data, 'half')) });
      render();
      break;
  }
}

async function run(work, control) {
  if (busy) return;
  busy = true;
  const version = navigationVersion;
  const initialFocus = document.activeElement;
  const saved = control.disabled;
  control.disabled = true;
  const form = control.matches('button[type="submit"]') ? control.form : null;
  const inline = form?.querySelector('.inline-error') ?? (dialog.open ? dialog.querySelector('.inline-error') : null);
  const field = form?.querySelector('#login-value');
  const code = form?.querySelector('[data-login-code]');
  const pendingStatus = form?.querySelector('.login-pending');
  const section = ['tab', 'open-event'].includes(control.dataset.action) ? main.querySelector('.admin-content') : null;
  const sectionPendingMessage = '화면을 불러오는 중이에요.';
  if (code) {
    code.readOnly = true;
    control.hidden = true;
  }
  const label = control.textContent;
  const pending = setTimeout(() => {
    if (form) {
      form.setAttribute('aria-busy', 'true');
      if (pendingStatus) pendingStatus.hidden = false;
      else control.textContent = form.dataset.form === 'progress' ? '조회 중…' : '저장 중…';
    } else if (section) {
      section.setAttribute('aria-busy', 'true');
      showMessage(sectionPendingMessage);
    } else {
      control.setAttribute('data-pending', '');
    }
  }, 180);
  function finishPending() {
    clearTimeout(pending);
    control.removeAttribute('data-pending');
    section?.removeAttribute('aria-busy');
    if (section && message.textContent === sectionPendingMessage) hideMessage();
    if (pendingStatus) pendingStatus.hidden = true;
    if (form?.hasAttribute('aria-busy')) {
      form.removeAttribute('aria-busy');
      if (!pendingStatus) control.textContent = label;
    }
  }
  if (inline) inline.hidden = true;
  field?.removeAttribute('aria-invalid');
  field?.removeAttribute('aria-describedby');
  try {
    await work();
  } catch (error) {
    finishPending();
    if (error.name === 'AbortError') return;
    if (error.status === 401 && state.user) return loginExpired();
    if (inline?.isConnected && (form?.contains(inline) || dialog.open)) {
      inline.textContent = error.message;
      inline.hidden = false;
      if (code && (error.status === 0 || error.status >= 500)) {
        control.textContent = '다시 시도';
        control.hidden = false;
      }
      if (field && (error.status === 400 || error.status === 401 || error.status === 403)) {
        if (form.dataset.form === 'login' && error.status === 401) {
          field.value = '';
          if (code) {
            code.readOnly = false;
            updateLoginCode(code);
          }
          field.closest('.login-field').classList.add('login-rejected');
        }
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', inline.id);
        field.focus({ preventScroll: true });
      }
    } else {
      showMessage(error.message, true);
    }
  } finally {
    finishPending();
    if (code) code.readOnly = false;
    if (control.isConnected) control.disabled = saved;
    else if (!dialog.open && version === navigationVersion &&
      (document.activeElement === document.body || document.activeElement === initialFocus)) {
      matchingControl(control)?.focus({ preventScroll: true });
    }
    if (version === navigationVersion) busy = false;
  }
}

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, id: itemId } = control.dataset;
  void run(() => {
    if (!dialog.open) dialogOpener = control;
    return doAction(action, itemId);
  }, control);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (busy) return;
  const { form: kind, id: itemId } = form.dataset;
  const data = new FormData(form);
  const control = event.submitter || form.querySelector('button[type=submit]');
  void run(() => doSubmit(kind, itemId, data), control);
});

main.addEventListener('change', event => {
  const control = event.target;
  if (!control.matches('[data-action=switch-event]')) return;
  void run(async () => {
    const selected = control.value;
    const previous = state.selectedEvent;
    try {
      state.detail = await request(`/api/admin/events/${id(selected)}`);
    } catch (error) {
      control.value = previous;
      throw error;
    }
    state.selectedEvent = selected;
    render();
    main.querySelector('[data-action=switch-event]')?.focus({ preventScroll: true });
  }, control);
});

function applyFilter(control) {
  const term = control.value.trim().toLocaleLowerCase('ko-KR');
  for (const item of main.querySelectorAll('.row[data-search]')) {
    item.hidden = !item.dataset.search.toLocaleLowerCase('ko-KR').includes(term);
  }
}

main.addEventListener('input', event => {
  const input = event.target;
  if (input.hasAttribute('data-login-code')) {
    const digits = input.value.replace(/[^0-9]/g, '');
    if (input.value !== digits) input.value = digits;
    clearLoginRejection(input);
    submitCompleteCode(input);
  } else if (input.dataset.filter) applyFilter(input);
});

for (const type of ['focusin', 'click', 'keyup', 'select']) {
  main.addEventListener(type, event => {
    if (event.target.hasAttribute('data-login-code')) updateLoginCode(event.target);
  });
}

main.addEventListener('paste', event => {
  const input = event.target;
  if (!input.hasAttribute('data-login-code') || input.readOnly || !event.clipboardData) return;
  const digits = event.clipboardData.getData('text').replace(/[\s.-]/g, '');
  event.preventDefault();
  if (!/^[0-9]{1,6}$/.test(digits)) return;
  if (digits.length === 6) input.value = digits;
  else {
    const { selectionStart, selectionEnd } = input;
    const available = 6 - input.value.length + selectionEnd - selectionStart;
    input.setRangeText(digits.slice(0, available), selectionStart, selectionEnd, 'end');
  }
  clearLoginRejection(input);
  submitCompleteCode(input);
});

function onDialogBackdrop(event) {
  if (event.target !== dialog) return false;
  const { top, right, bottom, left } = dialog.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
}

dialog.addEventListener('pointerdown', event => {
  startedOnBackdrop = event.button === 0 && onDialogBackdrop(event);
});
dialog.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
dialog.addEventListener('click', event => {
  if (!busy && startedOnBackdrop && onDialogBackdrop(event)) closeDialog();
  startedOnBackdrop = false;
});
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (!busy) closeDialog();
});
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  unlockDialogScroll();
  dialog.className = '';
  dialog.replaceChildren();
  const opener = dialogOpener;
  dialogOpener = null;
  const target = matchingControl(opener);
  if (target) target.focus({ preventScroll: true });
  else if (opener && document.activeElement === document.body) main.focus({ preventScroll: true });
});
desktopNavigation.addEventListener('change', event => {
  if (!event.matches || !dialog.open || !dialog.classList.contains('admin-menu-dialog')) return;
  dialogOpener = main.querySelector('.admin-sidebar [aria-current="page"]');
  closeDialog();
});

if (route && club.name) {
  document.title = clubTitle;
  clubLink.href = club.home;
  document.querySelector('#club-name').textContent = club.name;
  document.querySelector('#club-subtitle').textContent = club.subtitle;
  window.addEventListener('pagehide', clearProtectedView);
  window.addEventListener('pageshow', event => {
    if (event.persisted) void initialize();
  });
  if (authRole === 'admin') document.addEventListener('visibilitychange', checkAdminSession);
  await initialize();
  setInterval(refreshVoteCounts, 15_000);
} else {
  main.classList.add('narrow');
  main.innerHTML = '<section class="panel"><h1>모임을 찾을 수 없어요</h1><p><a href="/">콕콕콕! 모임 목록으로</a></p></section>';
}
