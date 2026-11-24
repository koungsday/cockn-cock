import {
  adminShell, attendanceForm, button, countEvent, esc, eventDefaults, eventForm, eventScreen,
  guestForm, homeScreen, memberForm, membersScreen, memberVoteScreen, noticeForm, noticeScreen,
  noticesScreen, overrideForm, pinForm, progressScreen, reportText, today, voteMetrics,
} from './views.mjs';

const main = document.querySelector('#main');
const account = document.querySelector('#account');
const dialog = document.querySelector('#dialog');
const message = document.querySelector('#message');

const path = location.pathname.match(/^\/(vote|notice)\/([^/]+)\/?$/);
const route = path ? { kind: path[1], id: path[2] } : { kind: 'home' };
const date = today();
const state = {
  user: null,
  section: 'event',
  adminLogin: true,
  selectedEvent: null,
  admin: null,
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

class RequestError extends Error {
  constructor(text, status) {
    super(text);
    this.status = status;
  }
}

async function request(url, method = 'GET', body = undefined) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new RequestError('서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.', 0);
  }
  const result = await response.json().catch(() => null);
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
  if (!state.user) {
    account.innerHTML = '';
    return;
  }
  const user = state.user;
  account.innerHTML = `<span class="account-name">${esc(user.name)}</span>
    ${user.role === 'member' && !user.mustChange ? button('PIN 변경', 'pin', { css: 'quiet compact' }) : ''}
    ${button('로그아웃', 'logout', { css: 'quiet compact' })}`;
}

function failedPage(error) {
  renderAccount();
  main.classList.add('narrow');
  main.innerHTML = `<div class="panel"><h1>${error.status === 404 ? '페이지를 찾을 수 없어요' : '모임을 불러오지 못했어요'}</h1>
    <p>${error.status === 404 ? '공지나 투표 링크를 운영진에게 확인해 주세요.' : esc(error.message)}</p>
    <div class="actions">${button('다시 불러오기', 'reload', { css: 'secondary' })}<a class="button secondary" href="/">처음으로</a></div></div>`;
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
  if (route.kind === 'vote') {
    ({ event: state.event } = await request(`/api/public/vote/${id(route.id)}`));
    state.vote = null;
    state.eligible = false;
    if (state.user?.role === 'member' && !state.user.mustChange) {
      try {
        ({ vote: state.vote } = await request(votePath()));
        state.eligible = true;
      } catch (error) {
        if (error.status !== 403 && error.status !== 404) throw error;
      }
    }
  } else if (route.kind === 'notice') {
    ({ notice: state.notice } = await request(`/api/public/notice/${id(route.id)}`));
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
  const isAdmin = route.kind === 'home' && state.user?.role === 'admin';
  main.classList.toggle('narrow', !isAdmin);
  if (route.kind === 'vote') {
    main.innerHTML = memberVoteScreen(state.event, state.user, state.vote, state.eligible);
  } else if (route.kind === 'notice') {
    main.innerHTML = noticeScreen(state.notice);
  } else if (isAdmin) {
    let body;
    if (state.section === 'members') body = membersScreen(state.admin.members);
    else if (state.section === 'notices') body = noticesScreen(state.admin.notices);
    else if (state.section === 'progress') body = progressScreen(state.period.year, state.period.half, state.progress);
    else body = eventScreen(state.admin.events, state.detail);
    main.innerHTML = adminShell(state.section, body);
    const newSearch = main.querySelector('input[data-filter]');
    if (newSearch && search?.dataset.filter === newSearch.dataset.filter) {
      newSearch.value = search.value;
      applyFilter(newSearch);
    }
  } else {
    main.innerHTML = homeScreen(state.user, state.adminLogin);
  }
}

async function initialize() {
  try {
    ({ user: state.user } = await request('/api/session'));
    await load();
    render();
  } catch (error) {
    failedPage(error);
  }
}

function openDialog(title, body) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="stack"><div class="heading-line"><h2 id="dialog-title">${title}</h2>${button('닫기', 'close', { css: 'quiet compact' })}</div>
    <p class="inline-error" role="alert" hidden></p>${body}</div>`;
  dialog.showModal();
}

function credentialDialog(name, memberCode, temporaryPin) {
  const text = temporaryPin
    ? `썬콕19 회원 코드 ${memberCode}\n한 번 사용할 임시 번호 ${temporaryPin}\n로그인 후 새 PIN을 설정해 주세요.`
    : `썬콕19 회원 코드 ${memberCode}\n처음에는 생년월일 8자리로 로그인하고 새 PIN을 설정해 주세요.`;
  openDialog('회원에게 보낼 접속 안내', `<p>${esc(name)} 회원에게 이 내용을 개인 메시지로 전달해 주세요.</p>
    <textarea class="copy-text" readonly rows="4" aria-label="회원 접속 안내">${esc(text)}</textarea>
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
  } catch {
    // The existing counts remain visible when a background refresh cannot reach the server.
  }
}

function findRoster(personId) {
  return state.detail?.roster.find(person => person.id === personId);
}

function shareLink(kind, itemId) {
  return new URL(`/${kind}/${id(itemId)}`, location.origin).href;
}

async function doAction(action, itemId) {
  switch (action) {
    case 'reload':
      await initialize();
      break;
    case 'login-mode':
      state.adminLogin = !state.adminLogin;
      render();
      main.querySelector('input:not([type="hidden"])')?.focus();
      break;
    case 'close':
      dialog.close();
      break;
    case 'logout':
      await request('/api/logout', 'POST', {});
      state.user = null;
      state.admin = null;
      state.detail = null;
      state.vote = null;
      await load();
      render();
      showMessage('로그아웃했어요.');
      break;
    case 'pin':
      openDialog('PIN 변경', pinForm(false));
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
      openDialog('새 회차', eventForm(eventDefaults()));
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
      await copy(reportText(state.detail));
      break;
    case 'new-member':
      openDialog('회원 등록', memberForm());
      break;
    case 'edit-member':
      openDialog('회원 수정', memberForm(state.admin.members.find(member => member.id === itemId)));
      break;
    case 'reset-member':
      openDialog('회원 접속 재설정', '<p>재설정하면 기존 회원 코드와 로그인 상태가 만료됩니다. 새 코드를 받을 회원이 맞는지 확인해 주세요.</p>'
        + button('새 임시 번호 만들기', 'confirm-reset-member', { id: itemId }));
      break;
    case 'confirm-reset-member': {
      const member = state.admin.members.find(person => person.id === itemId);
      const result = await request(`/api/admin/members/${id(itemId)}/reset`, 'POST', {});
      credentialDialog(member.name, result.memberCode, result.temporaryPin);
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

const read = (data, key) => String(data.get(key) ?? '').trim();

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
    case 'login':
      ({ user: state.user } = await request('/api/login', 'POST', { memberCode: read(data, 'memberCode'), credential: read(data, 'credential') }));
      await load();
      render();
      main.focus();
      break;
    case 'pin': {
      const newPin = read(data, 'newPin');
      if (newPin !== read(data, 'confirmPin')) throw new Error('새 PIN이 서로 달라요. 다시 확인해 주세요.');
      ({ user: state.user } = await request('/api/pin', 'POST', { currentPin: read(data, 'currentPin'), newPin }));
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
        const result = await request('/api/admin/members', 'POST', { name, birthday: read(data, 'birthday') });
        credentialDialog(name, result.memberCode);
        try {
          await load();
          render();
        } catch {
          const warning = dialog.querySelector('.inline-error');
          if (warning) {
            warning.textContent = '회원 코드를 먼저 복사한 뒤 회원 목록을 다시 열어 주세요.';
            warning.hidden = false;
          }
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
  const saved = control.disabled;
  control.disabled = true;
  const inline = dialog.open ? dialog.querySelector('.inline-error') : null;
  if (inline) inline.hidden = true;
  try {
    await work();
  } catch (error) {
    if (error.status === 401 && state.user) {
      try {
        const { user } = await request('/api/session');
        if (!user) {
          state.user = null;
          state.admin = null;
          state.detail = null;
          dialog.close();
          await load();
          render();
          showMessage('로그인이 만료됐어요. 다시 로그인해 주세요.', true);
          return;
        }
      } catch (loadError) {
        showMessage(loadError.message, true);
        return;
      }
    }
    if (inline?.isConnected && dialog.open) {
      inline.textContent = error.message;
      inline.hidden = false;
    } else {
      showMessage(error.message, true);
    }
  } finally {
    if (control.isConnected) control.disabled = saved;
    busy = false;
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

await initialize();
setInterval(refreshVoteCounts, 15_000);
