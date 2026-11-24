import {
  adminShell, attendanceForm, button, countEvent, esc, eventDefaults, eventForm, eventScreen,
  guestForm, homeScreen, loginScreen, memberForm, membersScreen, memberVoteScreen, noticeForm, noticeScreen,
  noticesScreen, overrideForm, pinForm, progressScreen, reportText, today, voteMetrics,
} from './views.mjs';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const dialog = document.querySelector('#dialog');
const message = document.querySelector('#message');
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
  section: 'event',
  selectedEvent: null,
  admin: null,
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
const adminEventPath = () => `/api/admin/events/${id(state.selectedEvent)}`;
const votePath = () => `/api/votes/${id(route.id)}`;

function showMessage(text, error = false) {
  clearTimeout(messageTimer);
  message.textContent = text;
  message.classList.toggle('error', error);
  message.hidden = false;
  messageTimer = setTimeout(() => { message.hidden = true; }, 5000);
}

function renderAccount() {
  document.title = state.user?.role === 'admin' ? `${club.name} 운영진 · 콕콕콕!` : clubTitle;
  if (!state.user || (route.kind === 'admin' && state.user.role !== 'admin')) {
    account.innerHTML = '';
    return;
  }
  const user = state.user;
  account.innerHTML = `<span class="account-name">${user.role === 'admin' ? '이 모임 운영진' : esc(user.name)}</span>
    ${user.role === 'member' ? button('PIN 설정·변경', 'pin', { css: 'quiet compact' }) : ''}
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

async function loadProgress() {
  const { year, half } = state.period;
  const response = await request(`/api/admin/progress?year=${year}&half=${half}`);
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
    if (!events.some(event => event.id === state.selectedEvent)) {
      const soonest = [...events].reverse().find(event => event.date >= today());
      state.selectedEvent = soonest?.id ?? events[0]?.id ?? null;
    }
    if (state.section === 'event') await loadEvent();
    if (state.section === 'progress') await loadProgress();
  }
}

function render() {
  const search = main.querySelector('input[data-filter]');
  renderAccount();
  const isAdmin = route.kind === 'admin' && state.user?.role === 'admin';
  main.classList.toggle('narrow', !isAdmin);
  if (!state.user) {
    main.innerHTML = loginScreen(club, rememberedName());
  } else if (route.kind === 'vote') {
    main.innerHTML = memberVoteScreen(state.event, state.vote, state.eligible, club);
  } else if (route.kind === 'notice') {
    main.innerHTML = noticeScreen(state.notice, club);
  } else if (route.kind === 'home') {
    main.innerHTML = homeScreen(state.listing, club);
  } else if (isAdmin) {
    let body;
    if (state.section === 'members') body = membersScreen(state.admin.members);
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
    user: null, section: 'event', selectedEvent: null, admin: null, listing: { events: [], notices: [] },
    detail: null, event: null, notice: null, vote: null, eligible: false, progress: [],
  });
  eventSnapshot = null;
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
  account.replaceChildren();
  document.title = clubTitle;
  clearTimeout(messageTimer);
  message.textContent = '';
  message.hidden = true;
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

function openDialog(title, body) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="stack"><div class="heading-line"><h2 id="dialog-title">${title}</h2>${button('닫기', 'close', { css: 'quiet compact' })}</div>
    <p class="inline-error" role="alert" hidden></p>${body}</div>`;
  dialog.showModal();
}

function credentialDialog(name, temporaryPin) {
  const text = `${club.name} 접속 안내\n이름 ${name}\n임시 번호 ${temporaryPin}\n새 PIN을 설정할 때까지 임시 번호로 로그인할 수 있어요.\n${new URL(club.home, location.origin).href}`;
  openDialog('회원에게 보낼 접속 안내', `<p>${esc(name)} 회원에게 이 내용을 개인 메시지로 전달해 주세요.</p>
    <textarea class="copy-text" readonly rows="5" aria-label="회원 접속 안내">${esc(text)}</textarea>
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
  try {
    await load();
    render();
  } finally {
    dialog.close();
  }
  showMessage(notice);
}

async function refreshVoteCounts() {
  if (document.hidden || busy || dialog.open || state.user?.role !== 'admin') return;
  const target = main.querySelector('#vote-counts');
  if (!target) return;
  try {
    const { roster, guests } = await request(adminEventPath());
    if (target.isConnected && !busy) target.innerHTML = voteMetrics(countEvent(roster, guests));
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

async function doAction(action, itemId) {
  switch (action) {
    case 'reload':
      await initialize();
      break;
    case 'close':
      dialog.close();
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
    case 'tab':
      state.section = itemId;
      await load();
      render();
      main.querySelector('.tabbar [aria-current="page"]')?.focus();
      break;
    case 'refresh':
      await load();
      render();
      showMessage('응답과 출석을 다시 불러왔어요.');
      break;
    case 'new-event':
      openDialog('새 회차', eventForm(eventDefaults(null, club.defaultPlace)));
      break;
    case 'clone-event':
      openDialog('다음 주 회차', eventForm(eventDefaults(state.detail.event)));
      break;
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
      await copy(shareLink('vote', state.selectedEvent));
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
    case 'login': {
      const { user } = await request('/api/login', 'POST', {
        name: read(data, 'name'), credential: raw(data, 'credential'),
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
      dialog.close();
      await load();
      render();
      if (!state.user) showMessage('PIN을 저장했어요. 새 PIN으로 다시 로그인해 주세요.');
      else showMessage('PIN을 저장했어요.');
      break;
    }
    case 'vote':
      await request(votePath(), 'PUT', { slot: read(data, 'slot'), lunch: data.has('lunch') });
      await load();
      render();
      showMessage('응답을 저장했어요.');
      break;
    case 'event': {
      const values = buildEvent(data);
      const changed = itemId && eventSnapshot?.id === itemId
        ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== eventSnapshot[key]))
        : values;
      if (!Object.keys(changed).length) {
        dialog.close();
        showMessage('변경된 내용이 없어요.');
        break;
      }
      const result = await request(itemId ? `/api/admin/events/${id(itemId)}` : '/api/admin/events',
        itemId ? 'PATCH' : 'POST', changed);
      state.selectedEvent = result.event.id;
      try {
        await load();
        render();
      } finally {
        dialog.close();
      }
      showMessage('회차를 저장했어요.');
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
        dialog.close();
        try {
          await load();
          render();
          showMessage('회원을 등록했어요.');
        } catch (error) {
          if (error.status === 401 || error.name === 'AbortError') throw error;
          showMessage('회원을 등록했어요. 회원 목록은 다시 열어 주세요.', true);
        }
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
      state.period = { year: Number(read(data, 'year')), half: Number(read(data, 'half')) };
      await loadProgress();
      render();
      break;
  }
}

async function run(work, control) {
  if (busy) return;
  busy = true;
  const version = navigationVersion;
  const saved = control.disabled;
  control.disabled = true;
  const inline = dialog.open ? dialog.querySelector('.inline-error') : null;
  if (inline) inline.hidden = true;
  try {
    await work();
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.status === 401 && state.user) return loginExpired();
    if (inline?.isConnected && dialog.open) {
      inline.textContent = error.message;
      inline.hidden = false;
    } else {
      showMessage(error.message, true);
    }
  } finally {
    if (control.isConnected) control.disabled = saved;
    if (version === navigationVersion) busy = false;
  }
}

document.addEventListener('click', event => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, id: itemId } = control.dataset;
  void run(() => doAction(action, itemId), control);
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
    state.selectedEvent = control.value;
    await loadEvent();
    render();
  }, control);
});

function applyFilter(control) {
  const term = control.value.trim().toLocaleLowerCase('ko-KR');
  for (const item of main.querySelectorAll('.row[data-search]')) {
    item.hidden = !item.dataset.search.toLocaleLowerCase('ko-KR').includes(term);
  }
}

main.addEventListener('input', event => {
  if (event.target.dataset.filter) applyFilter(event.target);
});

dialog.addEventListener('close', () => {
  if (!dialog.open) dialog.replaceChildren();
});

if (route && club.name) {
  document.title = clubTitle;
  const clubLink = document.querySelector('#club-home');
  clubLink.href = club.home;
  document.querySelector('#club-name').textContent = club.name;
  document.querySelector('#club-subtitle').textContent = club.subtitle;
  clubLink.hidden = false;
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
