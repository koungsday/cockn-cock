import { shuttlecockMark } from './shuttlecock.mjs';
import { adminSkeleton, loadingCenter, memberSkeleton } from './skeleton.mjs';

// Markup follows the demo (app.js, screens.js, share.js) so both share styles.css and share.css. See DESIGN.md.
const escapeChars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => escapeChars[char]);
}

const days = ['일', '월', '화', '수', '목', '금', '토'];
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function today() {
  return dateFormatter.format(new Date());
}

// event.deadline is 'YYYY-MM-DDTHH:MM' in 한국 시간. A closed vote has canVote=false whatever its deadline, so the screen
// needs this to tell "열면 받을 수 있음" from "마감 시각이 지나 열어도 못 받음". For an open vote the server's canVote decides.
export function deadlinePassed(event) {
  return event.deadline <= new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function weekday(date) {
  return days[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function dateLabel(date) {
  if (!date) return '';
  const [, month, day] = date.split('-');
  const name = weekday(date);
  return name ? `${Number(month)}월 ${Number(day)}일 (${name})` : date;
}

function fullDate(date) {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일 ${weekday(date)}요일`;
}

function shortDate(date) {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

function addDays(date, daysToAdd) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + daysToAdd);
  return value.toISOString().slice(0, 10);
}

export function eventDefaults(previous = null, defaultPlace = '', { keepFuture = false } = {}) {
  if (previous) {
    const weeks = keepFuture ? Math.max(1, Math.floor((Date.parse(today()) - Date.parse(previous.date)) / 604800000) + 1) : 1;
    const daysToAdd = weeks * 7;
    return {
      ...previous,
      date: addDays(previous.date, daysToAdd),
      deadline: `${addDays(previous.deadline.slice(0, 10), daysToAdd)}${previous.deadline.slice(10)}`,
      open: false,
      published: false,
    };
  }
  const base = today();
  const day = new Date(`${base}T00:00:00Z`).getUTCDay();
  const date = addDays(base, (7 - day) % 7);
  return {
    title: '정기 운동', date, time: '10:00', endTime: '13:00',
    earlyTime: '09:30', lateTime: '09:50', place: defaultPlace,
    deadline: `${addDays(date, -1)}T15:30`, notes: '', open: false, published: false,
  };
}

const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  user: '<circle cx="12" cy="7" r="3.5"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9" cy="7" r="4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  chart: '<path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15m-14 16-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7m-7 7h15"/>',
  edit: '<path d="m14 5 5 5M4 20l4.5-1 12-12-3.5-3.5-12 12z"/>',
  megaphone: '<path d="m3 11 15-6v14L3 15v-4Zm3 5 2.5 5h3l-2-4m11-6 1-1m-1 5 1 1"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a3 3 0 1 1-4-4l4-4a3 3 0 0 1 4 0m2 8a3 3 0 0 0 4 0l4-4a3 3 0 1 0-4-4l-1 1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3m-5-3 5-5-5-5m5 5H3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4m-4 5a8 8 0 0 0 14.9 4M20 20v-4h-4"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

export function loader(text, css = '') {
  return `<div class="shuttle-loader${css ? ` ${css}` : ''}" role="status">${shuttlecockMark()}<span>${esc(text)}</span></div>`;
}

// kind: 'admin:home' | 'admin:event' | 'admin:list' | 'member:home' | 'member:vote' | 'member:notice' (skeleton.mjs).
export function loadingPage(kind = 'member:home', text = undefined) {
  const [area, screen] = kind.split(':');
  return (area === 'admin' ? adminSkeleton(screen) : memberSkeleton(screen)) + loadingCenter(shuttlecockMark(), text);
}

const tones = { primary: 'btn-primary', secondary: 'btn-secondary', quiet: 'btn-text', text: 'btn-text', lime: 'btn-lime', glass: 'btn-glass' };

// css takes a tone (secondary, quiet/text, lime, glass) and "compact"/"small"; other words pass through.
// The phone menu button: two lines that cross into × inside the open menu (styles.css .menu-toggle).
export const menuIcon = '<svg class="menu-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path class="menu-icon-top" d="M4 9h16"/><path class="menu-icon-bottom" d="M4 15h16"/></svg>';

// tab opens a session on that tab (poll, attendance, settlement) with open-event.
// An icon-only button (css 'btn-icon') takes its name from label, shown on hover as the title too.
export function button(text, action, { id = '', css = '', disabled = false, label = '', tab = '' } = {}) {
  const words = css.split(/\s+/).filter(Boolean);
  const tone = words.find(word => tones[word]) ?? 'primary';
  const extra = words.filter(word => !tones[word]).map(word => word === 'compact' || word === 'small' ? 'btn-small' : word);
  return `<button type="button" class="${['btn', tones[tone], ...extra].join(' ')}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}${tab ? ` data-tab="${tab}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}${label && words.includes('btn-icon') ? ` title="${esc(label)}"` : ''}${disabled ? ' disabled' : ''}>${text}</button>`;
}

function pill(text, tone = 'muted') {
  return `<span class="pill pill-${tone}">${text}</span>`;
}

function avatar(name) {
  const seed = Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return `<span class="avatar tone-${seed % 4}" aria-hidden="true">${esc(name.slice(0, 1))}</span>`;
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
}

function field(label, name, value = '', { type = 'text', attrs = '', wide = false, help = '' } = {}) {
  return `<label class="form-field${wide ? ' form-field-full' : ''}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}>${help ? `<small class="form-note">${help}</small>` : ''}</label>`;
}

function textarea(label, name, value, attrs = '') {
  return `<label class="form-field form-field-full"><span>${label}</span><textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
}

function check(label, name, checked = false) {
  return `<label class="form-check"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
}

function select(label, name, choices, current, attrs = '') {
  return `<label class="form-field"><span>${label}</span><select name="${name}" ${attrs}>${choices.map(([value, text]) => option(value, text, current)).join('')}</select></label>`;
}

function note(text) {
  return `<p class="form-note">${text}</p>`;
}

function form(kind, body, label, id = '', css = '') {
  return `<form class="form${css ? ` ${css}` : ''}" data-form="${kind}"${id ? ` data-id="${esc(id)}"` : ''}>${body}
    <div class="form-actions"><button type="submit" class="btn btn-primary">${label}</button></div></form>`;
}

function pageHead(title, description = '', actions = '') {
  return `<header class="page-head"><div><h1 tabindex="-1">${title}</h1>${description ? `<div class="page-description">${description}</div>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
}

function panel(title, content, { subtitle = '', actions = '', id = '', titleId = '' } = {}) {
  return `<section class="panel"${id ? ` id="${id}"` : ''}><header class="panel-head"><div><h2${titleId ? ` id="${titleId}"` : ''}>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header><div class="panel-body">${content}</div></section>`;
}

function table(columns, rows, empty) {
  if (!rows.length) return `<p class="empty-state">${empty}</p>`;
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function summary(items) {
  return `<dl class="summary-grid">${items.map(([label, value, tone]) => `<div class="summary-item${tone ? ` summary-${tone}` : ''}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function search(target) {
  return `<label class="search-field">${icon('search', 18)}<input type="search" data-filter="${target}" aria-label="회원 이름 검색" placeholder="이름 검색" maxlength="80" autocomplete="off"></label>`;
}

export function dateLine(event) {
  return `${dateLabel(event.date)} ${event.time}–${event.endTime}`;
}

export function deadlineLabel(deadline) {
  const [day, time] = String(deadline ?? '').split('T');
  return day && time ? `${dateLabel(day)} ${time}` : '운영진에게 확인';
}

function voteLabel(slot, event) {
  if (slot === 'early') return `${event.earlyTime || '선발'}${event.earlyTime ? ' 선발' : ''}`;
  if (slot === 'late') return `${event.lateTime || '후발'}${event.lateTime ? ' 후발' : ''}`;
  if (slot === 'no') return '불참';
  return '미응답';
}

function choiceFields(event, vote, lunchLabel) {
  const choices = ['early', 'late', 'no'].map(slot => `<label class="public-choice">
    <input type="radio" name="slot" value="${slot}"${vote?.slot === slot ? ' checked' : ''} required><span>${esc(voteLabel(slot, event))}</span></label>`);
  return `<fieldset class="public-choices"><legend>운동 참석</legend><div class="public-choice-row public-choice-slots">${choices.join('')}</div></fieldset>
    <label class="public-lunch"><input type="checkbox" name="lunch"${vote?.lunch ? ' checked' : ''}> ${lunchLabel}</label>`;
}

/* Member screens: the demo's public share card (share.css). */

const courtLines = '<div class="share-art-decoration" aria-hidden="true"><span></span><span></span><span></span></div>';

function memberCard(kind, type, title, head, content) {
  return `<article class="public-share-card">
    <header class="public-story-head share-art--${kind}">${courtLines}<span class="public-share-type">${type}</span><h1>${esc(title)}</h1>${head}</header>
    <div class="public-share-content">${content}</div></article>`;
}

function memberPage(club, content, { back = true } = {}) {
  return `<main id="main-content" class="public-share-page member-page" tabindex="-1">
    ${back ? `<a class="member-back" href="${esc(club.home)}">${icon('arrow-left', 18)} 모임 홈</a>` : ''}${content}</main>`;
}

// organizer: the organiser's own number (PLATFORM.md 인증). inline: the form stands on a page, not in a dialog.
export function pinForm({ organizer = false, inline = false } = {}) {
  const pin = 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required';
  const word = organizer ? '번호' : 'PIN';
  return form('pin', (inline ? '<p class="inline-error form-field-full" role="alert" hidden></p>' : '') + field(organizer ? '지금 번호' : '현재 로그인 번호', 'currentPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="off" enterkeyhint="next" ${pin}`,
    help: organizer ? '받은 임시 번호나 지금 쓰는 번호를 입력해 주세요.' : '지금 로그인할 때 쓰는 생년월일, PIN 또는 임시 번호를 입력해 주세요.',
  }) + field(`새 ${word}`, 'newPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="new-password" enterkeyhint="next" ${pin}`,
    help: '숫자 6자리를 사용해 주세요. 생년월일과 연속·반복 숫자는 피해주세요.',
  }) + field(`새 ${word} 확인`, 'confirmPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="new-password" enterkeyhint="done" ${pin}`,
  }), `새 ${word} 저장`, '', 'form-grid');
}

// An organiser who signed in with a temporary number from the console sets their own before anything else opens.
export function organizerPinScreen(club, user) {
  return `<main id="main-content" class="login-page" tabindex="-1"><div class="login-stack">
    <div class="hero"><p class="tagline">first login</p><h1>${esc(club.name)}</h1><div class="hero-meta"><span>${esc(user.name)}님, 내 번호를 정해 주세요</span></div></div>
    <section class="login-card organizer-pin" aria-labelledby="organizer-pin-title">
      <h2 id="organizer-pin-title">내 번호 정하기</h2>
      <p class="form-note">총괄 관리자가 보낸 임시 번호는 처음 한 번만 써요. 운영 화면을 열기 전에 나만 아는 숫자 6자리로 바꿔 주세요.</p>
      ${pinForm({ organizer: true, inline: true })}
    </section>
  </div></main>`;
}

export function memberVoteScreen(event, vote, eligible, club, voteSaved = false) {
  const facts = `<dl class="public-event-facts">
    <div><dt>일시</dt><dd>${esc(dateLine(event))}</dd></div>
    <div><dt>장소</dt><dd>${esc(event.place)}</dd></div>
    <div><dt>투표 마감</dt><dd>${esc(deadlineLabel(event.deadline))}</dd></div></dl>`;
  const notes = event.notes ? `<p class="public-share-body">${esc(event.notes)}</p>` : '';
  const current = vote ? `<p class="public-receipt" role="status">내 응답 <strong>${esc(voteLabel(vote.slot, event))}${vote.lunch ? ' · 점심 참여' : ''}</strong>${voteSaved ? ' <span class="member-confirmed">저장 완료</span>' : ''}</p>` : '';
  let response = `<div class="public-form">${current}<p class="public-status">${event.open ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.'}</p></div>`;
  if (event.canVote && eligible) {
    response = `<form class="public-form" data-form="vote" data-id="${esc(event.id)}">${current}${choiceFields(event, vote, '점심 식사에도 참여해요')}
      <p class="inline-error" role="alert" hidden></p>
      <button class="share-button share-button--primary" type="submit">${vote ? '응답 변경' : '응답 저장'}</button></form>`;
  } else if (event.canVote) {
    response = '<div class="public-form"><p class="public-status"><strong>이 회차에 응답할 수 없어요.</strong> 운영진에게 참석 명단을 확인해 주세요.</p></div>';
  }
  return memberPage(club, memberCard('vote', '참석 투표', event.title, '', facts + notes + response));
}

export function noticeScreen(notice, club) {
  const date = `<time datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time>`;
  return memberPage(club, memberCard('notice', '모임 공지', notice.title, date, `<p class="public-share-body">${esc(notice.body)}</p>`));
}

const slotWords = { early: '선발', late: '후발', no: '불참' };

// What the member can do with one event: 투표하기 / 응답 변경 / 일정 확인 and the sentence that explains it.
function memberEventState(event) {
  if (event.canVote && event.eligible) {
    return event.mySlot
      ? { action: '응답 변경', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong> · 마감 전까지 바꿀 수 있어요.` }
      : { action: '투표하기', primary: true, row: '투표하기', note: '아직 응답하지 않았어요.' };
  }
  if (event.mySlot) return { action: '일정 확인', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong>` };
  if (event.canVote) return { action: '일정 확인', primary: false, row: '일정 확인', note: '이 회차에 응답할 수 없어요. 운영진에게 참석 명단을 확인해 주세요.' };
  return { action: '일정 확인', primary: false, row: '일정 확인', note: event.open ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.' };
}

function nextEventCard(event, club) {
  const state = memberEventState(event);
  const kind = event.canVote ? '참석 투표' : event.date === today() ? '오늘 운동' : '다음 운동';
  const deadline = event.deadline ? `<div><dt>투표 마감</dt><dd>${esc(deadlineLabel(event.deadline))}</dd></div>` : '';
  return `<article class="public-share-card member-next" aria-labelledby="member-next-title">
    <header class="public-story-head share-art--vote">${courtLines}<span class="public-share-type">${kind}</span>
      <h2 id="member-next-title" class="public-title">${esc(event.title)}</h2><time datetime="${esc(event.date)}">${esc(dateLine(event))}</time></header>
    <div class="public-share-content">
      <dl class="public-event-facts"><div><dt>장소</dt><dd>${esc(event.place)}</dd></div>${deadline}</dl>
      <p class="member-answer">${state.note}</p>
      <a class="share-button ${state.primary ? 'share-button--primary' : 'share-button--secondary'} member-next-action" href="${esc(club.home)}vote/${encodeURIComponent(event.id)}">${state.action}</a>
    </div></article>`;
}

export function homeScreen({ events, notices }, club, user = null) {
  const [next, ...later] = events;
  const eventRows = later.map(event => {
    const state = memberEventState(event);
    const tone = state.row === '투표하기' ? ' member-record-open' : state.row === '응답 완료' ? ' member-record-done' : '';
    return `<li class="member-record"><a class="member-record-link" href="${esc(club.home)}vote/${encodeURIComponent(event.id)}">
    <span><strong>${esc(event.title)}</strong><span class="member-record-meta"><time datetime="${esc(event.date)}">${esc(dateLine(event))}</time><span>${esc(event.place)}</span>${event.canVote && event.deadline ? `<span>투표 마감 ${esc(deadlineLabel(event.deadline))}</span>` : ''}</span></span>
    <span class="member-record-action${tone}">${state.row}</span></a></li>`;
  });
  const noticeRows = notices.map(notice => `<li class="member-record"><a class="member-record-link" href="${esc(club.home)}notice/${encodeURIComponent(notice.id)}">
    <span><strong>${esc(notice.title)}</strong><time class="member-record-meta" datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time></span>
    <span class="member-record-arrow" aria-hidden="true">${icon('chevron-right', 18)}</span></a></li>`);
  const listCard = (id, title, rows, empty) => `<section class="public-share-card member-list" aria-labelledby="${id}"><div class="public-share-content">
    <h2 id="${id}">${title}</h2>${rows.length ? `<ul class="member-records">${rows.join('')}</ul>` : `<p class="public-form-note">${empty}</p>`}</div></section>`;
  const first = next ? nextEventCard(next, club)
    : listCard('member-events', '운동 일정', [], '게시된 운동 일정이 없어요. 운영진이 일정을 올리면 여기에 보여요.');
  const pin = user?.mustChange ? `<section class="member-pin" aria-labelledby="member-pin-title"><h2 id="member-pin-title">내 로그인</h2>
    <p>지금은 생년월일 뒤 6자리나 임시 번호로 로그인해요. 원하면 나만 아는 PIN 6자리로 바꿀 수 있어요.</p>
    <button type="button" class="share-button share-button--secondary" data-action="pin">PIN 만들기</button></section>` : '';
  return memberPage(club, `<h1 class="sr-only">${esc(club.name)} 모임 홈</h1>${first}
    ${later.length ? listCard('member-events', '이후 운동 일정', eventRows, '') : ''}
    ${listCard('member-notices', '공지', noticeRows, '게시된 공지가 없어요.')}${pin}`, { back: false });
}

export function loginScreen(club, name, numberStep) {
  const label = numberStep ? '번호 6자리' : '성함';
  const input = !numberStep
    ? `<input id="login-value" name="name" type="text" value="${esc(name)}" autocomplete="off" autocapitalize="off"
      spellcheck="false" maxlength="64" enterkeyhint="next" required>`
    : `<span class="login-code">
      <input id="login-value" name="credential" type="password" inputmode="numeric" autocomplete="off" enterkeyhint="go"
        maxlength="6" pattern="[0-9]{6}" data-login-code required>
      <span class="login-code-cells" aria-hidden="true">${'<span></span>'.repeat(6)}</span>
    </span>`;
  return `<main id="main-content" class="login-page" tabindex="-1"><div class="login-stack">
    <div class="hero"><p class="tagline">login</p><h1>${esc(club.name)}</h1>${club.subtitle ? `<div class="hero-meta"><span>${esc(club.subtitle)}</span></div>` : ''}</div>
    <form class="form login-form login-card" aria-label="로그인" data-form="${numberStep ? 'login' : 'login-name'}">
      ${numberStep ? `<div class="login-greeting"><button type="button" class="icon-button login-back" data-action="login-back" aria-label="성함 입력으로 돌아가기">${icon('arrow-left')}</button>
        <p id="login-greeting">안녕하세요. ${esc(name)}님!</p></div>` : ''}
      <div class="login-field">
        <div class="login-label-row"><label for="login-value">${label}</label>
          <button type="button" class="icon-button login-help-button" data-action="login-help" aria-label="로그인 도움말" aria-haspopup="dialog">${icon('info')}</button>
        </div>
        ${input}
        ${numberStep ? `<p class="login-pending" role="status" hidden>${shuttlecockMark('shuttle-spin shuttle-inline')}로그인 중…</p>` : ''}
        <p id="login-error" class="inline-error" role="alert" hidden></p>
      </div>
      <button type="submit" class="btn btn-primary login-submit"${numberStep ? ' hidden' : ''}>${numberStep ? 'login' : '다음'}</button>
    </form>
  </div></main>`;
}

export function loginHelp() {
  return `<div class="login-guide">
    <p><strong>회원</strong> 생년월일 뒤 6자리, 내 PIN 또는 임시 번호</p>
    <p><strong>운영진</strong> 운영 번호 6자리</p>
  </div>`;
}

export function messagePage(title, body, actions = '') {
  return `<main id="main-content" class="public-share-page" tabindex="-1"><div class="public-share-card"><h1>${title}</h1>
    <p class="public-share-body">${body}</p>${actions ? `<div class="form-actions message-actions">${actions}</div>` : ''}</div></main>`;
}

/* Admin screens: the demo's operations shell and dashboard (styles.css). */

const adminSections = [
  ['home', '운영 홈', 'home'], ['event', '운동 운영', 'calendar'], ['notices', '공지', 'megaphone'],
  ['members', '회원 관리', 'users'], ['progress', '반기 집계', 'chart'],
];

export function brand(club) {
  return `<a class="brand" href="${esc(club.admin)}"><img class="brand-mark" width="43" height="43" src="/assets/shuttlecock-icon-96.png" alt="">
    <span><strong>${esc(club.name)}</strong>${club.subtitle ? `<small>${esc(club.subtitle)}</small>` : ''}</span></a>`;
}

export function adminMenu(section) {
  return `<nav class="navigation" aria-label="운영 메뉴"><div class="nav-heading">모임 운영</div>
    ${adminSections.map(([name, title, glyph]) => `<button type="button" class="nav-link${section === name ? ' active' : ''}" data-action="tab" data-id="${name}"${section === name ? ' aria-current="page"' : ''}>${icon(glyph, 19)}<span>${title}</span>${section === name ? '<i aria-hidden="true"></i>' : ''}</button>`).join('')}
  </nav>`;
}

// Phones: a floating bar of four icons follows the screen; the full menu opens from the top bar (DESIGN.md 4).
function adminTabBar(section) {
  return `<nav class="tab-bar" aria-label="운영 바로가기">
    ${adminSections.slice(0, 4).map(([name, title, glyph]) => `<button type="button" class="tab-bar-link" data-action="tab" data-id="${name}" title="${title}"${section === name ? ' aria-current="page"' : ''}>${icon(glyph, 23)}<span class="sr-only">${title}</span></button>`).join('')}
  </nav>`;
}

export function adminShell(section, contents, club, user) {
  const title = adminSections.find(([name]) => name === section)?.[1] ?? '운영 홈';
  return `<div class="admin-app">
    <aside class="sidebar">${brand(club)}${adminMenu(section)}
      <div class="sidebar-footer"><span class="operator-mark">${icon('user', 18)}</span><span><strong>${esc(user?.name ?? '운영진')}</strong><small>운영진</small></span></div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <span class="breadcrumb-parent">모임 관리</span><span class="breadcrumb-divider">/</span><strong>${title}</strong>
        </div>
        <div class="topbar-actions">${button(`${icon('lock', 17)} 번호 바꾸기`, 'pin', { css: 'text small topbar-logout' })}${button(`${icon('logout', 17)} 로그아웃`, 'logout', { css: 'text small topbar-logout' })}
          <button type="button" class="icon-button topbar-menu" data-action="admin-menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="dialog">${menuIcon}</button></div>
      </header>
      <main class="main-content admin-content" id="main-content" tabindex="-1">${contents}</main>
      ${adminTabBar(section)}
    </div>
  </div>`;
}

// Where a session stands (DESIGN.md 5 회차 진행): 0 회차 준비, 1 참석 투표, 2 당일 출석, 3 마무리, 4 마무리 확정.
export function sessionStage({ event, settlement }) {
  const day = today();
  return settlement?.confirmed ? 4 : event.date < day ? 3 : event.date === day ? 2 : event.published ? 1 : 0;
}

const stageTabs = ['poll', 'poll', 'attendance', 'settlement', 'settlement'];

// The tab a session opens on when none was picked: the vote before the day, check-in on the day, wrap-up after it.
export function defaultTab(event) {
  const day = today();
  return event.date > day ? 'poll' : event.date === day ? 'attendance' : 'settlement';
}

function sessionSteps(steps, stage) {
  return `<ol class="session-steps" aria-label="회차 진행">${steps.map(([label, detail], index) => {
    const [step, word] = index < stage ? ['done', '완료'] : index === stage ? ['now', '지금'] : ['next', '예정'];
    return `<li data-step="${step}"${step === 'now' ? ' aria-current="step"' : ''}><span class="session-step-state">${word}</span><strong>${label}</strong><small>${esc(detail)}</small></li>`;
  }).join('')}</ol>`;
}

function featured(detail, club) {
  const event = detail?.event;
  if (!event) {
    return `<section class="featured" aria-labelledby="next-event-title"><div class="featured-content">
      <div class="featured-kicker"><i></i> 다음 모임</div><h2 id="next-event-title">예정된 회차가 없어요.</h2>
      <div class="featured-actions">${button(`${icon('plus', 17)} 새 회차`, 'new-event', { css: 'lime' })}</div></div></section>`;
  }
  const stage = sessionStage(detail);
  const go = stage === 2 ? '당일 출석 체크' : stage >= 3 ? '마무리하기' : '회차 관리';
  const hidden = event.published ? 'data-home-published' : 'data-home-published hidden';
  return `<section class="featured" aria-labelledby="next-event-title"><div class="featured-content">
    <div class="featured-kicker"><i></i> 다음 모임</div>
    <h2 id="next-event-title">${esc(event.title)}</h2>
    <div class="featured-meta"><span>${icon('calendar', 18)} <time datetime="${esc(`${event.date}T${event.time}`)}">${esc(fullDate(event.date))} · ${esc(event.time)}–${esc(event.endTime)}</time></span>
      <span>${icon('pin', 18)} ${esc(event.place)}</span></div>
    <div class="featured-actions">${button(`${go} ${icon('chevron-right', 17)}`, 'open-event', { id: event.id, css: 'lime', tab: stageTabs[stage] })}
      <span ${hidden}><a class="btn btn-glass" href="${esc(club.home)}vote/${encodeURIComponent(event.id)}" target="_blank" rel="noopener">${icon('clipboard', 17)} 회원 투표 화면</a></span></div>
  </div>${homeSteps(detail)}</section>`;
}

// The step band alone, so the 15-second refresh can redraw it with the vote counts.
export function homeSteps(detail) {
  const { event } = detail;
  const stage = sessionStage(detail);
  const present = detail.roster.filter(row => row.present === true).length;
  return sessionSteps([
    ['회차 준비', event.published ? '링크 공개함' : '비공개 준비'],
    ['참석 투표', event.canVote ? `${deadlineLabel(event.deadline)} 마감` : !event.published ? '공개 후 시작' : event.open || deadlinePassed(event) ? '마감됨' : '투표 닫힘'],
    ['당일 출석', stage >= 2 ? `${present}명 출석` : dateLabel(event.date)],
    ['마무리', stage === 4 ? '확정' : '콕·찬조금 기록'],
  ], stage);
}

export function homeVoteCounts({ event, roster }) {
  const counts = countEvent(roster.filter(member => member.active), []);
  const total = roster.filter(member => member.active).length;
  const attending = counts.early + counts.late;
  const responded = attending + counts.no;
  const percent = total ? Math.round(responded / total * 100) : 0;
  const open = event.published && event.canVote;
  const status = !event.published ? '비공개' : event.canVote ? '투표 진행 중' : event.open ? '투표 마감' : '투표 닫힘';
  return `<header class="dashboard-panel-head"><h2 id="home-vote-title">참석 투표</h2><span class="poll-status${open ? '' : ' closed'}"><i></i>${status}</span></header>
    ${total ? `<div class="progress-meta"><span>응답률</span><strong>${percent}<small>%</small></strong></div>
    <svg class="poll-track" viewBox="0 0 ${total} 1" preserveAspectRatio="none" role="img" aria-label="응답률 ${percent}% (응답 ${responded}/${total}명)"><rect class="vote-yes" width="${attending}" height="1"/><rect class="vote-no" x="${attending}" width="${counts.no}" height="1"/></svg>
    <div class="poll-grid">${[['선발', counts.early, 'yes'], ['후발', counts.late, 'yes'], ['점심', counts.lunch, 'no']].map(([name, value, tone]) => `<div><span><i class="vote-${tone}"></i>${name}</span><strong>${value}<small>명</small></strong></div>`).join('')}</div>
    <p class="poll-subline">참석 예정 ${attending}명 · 불참 ${counts.no}명 · 미응답 ${total - responded}명</p>`
    : '<p class="poll-subline">투표 대상 회원이 없어요. 회원 관리에서 활동 회원을 확인해 주세요.</p>'}`;
}

function pollPanel(detail) {
  if (!detail?.event) {
    return `<section class="panel poll-dashboard" aria-labelledby="home-vote-title"><header class="dashboard-panel-head"><h2 id="home-vote-title">참석 투표</h2></header>
      <p class="poll-subline">회차를 만들고 투표를 열면 여기서 응답을 볼 수 있어요.</p></section>`;
  }
  const { event } = detail;
  const hidden = event.published ? 'data-home-published' : 'data-home-published hidden';
  return `<section class="panel poll-dashboard" aria-labelledby="home-vote-title"><div id="home-vote-counts">${homeVoteCounts(detail)}</div>
    <div class="poll-footer"><span>${icon('clock', 16)} ${esc(deadlineLabel(event.deadline))} 마감</span>
      <span ${hidden}>${button(`${icon('link', 16)} 카톡 링크 복사`, 'copy-vote', { id: event.id, css: 'secondary small' })}</span></div></section>`;
}

function metric(section, glyph, tone, label, value, unit) {
  return `<button type="button" class="panel metric" data-action="tab" data-id="${section}"><span class="metric-icon ${tone}">${icon(glyph, 21)}</span>
    <div><span class="metric-label">${label}</span><div class="metric-value">${value}<small>${unit}</small></div></div>${icon('chevron-right', 16)}</button>`;
}

function todoRow(glyph, tone, title, detail, action) {
  return `<li class="todo-row"><span class="metric-icon ${tone}">${icon(glyph, 19)}</span><div><strong>${title}</strong><p>${detail}</p></div>${action}</li>`;
}

// 챙길 일: only what the data shows to be true now, one action each (DESIGN.md 5). Redrawn with the vote counts.
export function homeTodo(events, upcoming, last) {
  const items = [];
  if (upcoming) {
    const { event } = upcoming;
    const when = dateLabel(event.date);
    const waiting = upcoming.roster.filter(row => row.active && !row.slot).length;
    const closedForGood = deadlinePassed(event);
    if (!event.published) {
      items.push(todoRow('calendar', 'sand', `${esc(when)} 회차가 아직 비공개예요`,
        closedForGood ? '링크를 공개해야 회원이 일정을 볼 수 있어요. 투표 마감 시각은 이미 지났어요.' : '링크를 공개해야 회원이 일정을 보고 투표할 수 있어요.',
        button('회차 열기', 'open-event', { id: event.id, css: 'secondary small', tab: 'poll' })));
    } else if (!event.open && !closedForGood && sessionStage(upcoming) < 2) {
      items.push(todoRow('clipboard', 'sand', '참석 투표가 닫혀 있어요', `${esc(when)} 회차 투표를 열어야 회원이 응답할 수 있어요.`,
        button('회차 열기', 'open-event', { id: event.id, css: 'secondary small', tab: 'poll' })));
    } else if (event.canVote && waiting) {
      items.push(todoRow('users', 'mint', `미응답 ${waiting}명`, `${esc(deadlineLabel(event.deadline))} 마감이에요. 단체방에 투표 링크를 다시 올려 주세요.`,
        button(`${icon('link', 16)} 카톡 링크 복사`, 'copy-vote', { id: event.id, css: 'secondary small' })));
    }
  }
  if (last && !last.failed && !last.settlement?.confirmed) {
    items.push(todoRow('clipboard', 'mint', `${esc(dateLabel(last.event.date))} 회차 마무리 전이에요`, '출석과 콕·찬조금을 기록하고 마무리 글을 올려 주세요.',
      button('마무리하기', 'open-event', { id: last.event.id, css: 'secondary small', tab: 'settlement' })));
  }
  if (!upcoming && events.length) {
    items.push(todoRow('repeat', 'mint', '예정된 회차가 없어요', '지난 회차를 복제해 다음 주 회차를 만들 수 있어요.',
      button('다음 주 회차 만들기', 'clone-event', { id: events[0].id, css: 'secondary small' })));
  }
  return `<section class="panel todo-panel" aria-labelledby="home-todo-title"><header class="dashboard-panel-head"><h2 id="home-todo-title">챙길 일</h2></header>
    ${items.length ? `<ul class="todo-list">${items.join('')}</ul>` : '<p class="muted todo-empty">지금 챙길 일이 없어요.</p>'}</section>`;
}

function lastPanel(last) {
  let body = '<p class="muted">아직 지난 회차가 없어요.</p>';
  if (last?.failed) body = '<p class="muted">지난 회차를 불러오지 못했어요. 잠시 뒤 운영 홈을 다시 열어 주세요.</p>';
  else if (last) {
    const { event, roster, guests, settlement } = last;
    const c = countEvent(roster, guests);
    const skipped = roster.filter(row => (row.slot === 'early' || row.slot === 'late') && row.present === false).length;
    const done = Boolean(settlement?.confirmed);
    body = `<div class="last-session"><div><strong>${esc(event.title)}</strong><p>${esc(dateLabel(event.date))} · ${esc(event.place)}</p></div>${pill(done ? '마무리 완료' : '마무리 전', done ? 'green' : 'warm')}</div>
      ${summary([['출석', `${c.members}명`, 'green'], ['게스트 도착', `${c.guests}명`], ['응답 후 불참', `${skipped}명`]])}
      <div class="last-session-action">${done
        ? button(`${icon('clipboard', 16)} 마무리 글 복사`, 'copy-last-report', { css: 'secondary small' })
        : button('마무리하기', 'open-event', { id: event.id, css: 'secondary small', tab: 'settlement' })}</div>`;
  }
  return `<section class="panel last-panel" aria-labelledby="home-last-title"><header class="dashboard-panel-head"><h2 id="home-last-title">지난 회차</h2></header>${body}</section>`;
}

export function adminHome({ events, members, notices }, upcoming, club, last = null) {
  const month = today().slice(0, 7);
  const recent = notices.slice(0, 3).map(notice => `<div class="home-notice-row">
    <button type="button" class="notice-home-link" data-action="edit-notice" data-id="${esc(notice.id)}">${notice.published ? '' : '<span class="notice-tag">비공개</span>'}<span>${esc(notice.title)}</span></button>
    <time datetime="${esc(notice.date)}">${esc(shortDate(notice.date))}</time>
    ${notice.published ? `<button type="button" class="icon-button notice-share" data-action="copy-notice" data-id="${esc(notice.id)}" aria-label="${esc(notice.title)} 카톡 링크 복사" title="카톡 링크 복사">${icon('link', 17)}</button>` : ''}
  </div>`);
  return `<div class="dashboard">
    <header class="dashboard-heading">
      <div><h1 tabindex="-1">운영 홈</h1><p>이번 회차의 진행 단계와 챙길 일을 확인하세요.</p></div>
      <div class="heading-actions"><span class="today-label">${icon('calendar', 17)}${esc(fullDate(today()))}</span>${button(icon('plus', 22), 'new-event', { css: 'btn-icon', label: '새 회차' })}</div>
    </header>
    <div class="dashboard-grid">${featured(upcoming, club)}${pollPanel(upcoming)}</div>
    <div class="dashboard-grid dashboard-bottom">${homeTodo(events, upcoming, last)}${lastPanel(last)}</div>
    <div class="dashboard-metrics" aria-label="모임 현황">
      ${metric('members', 'users', 'mint', '활동 회원', members.filter(member => member.active).length, '명')}
      ${metric('event', 'calendar', 'sand', `${Number(month.slice(5))}월 회차`, events.filter(event => event.date.startsWith(month)).length, '회')}
      ${metric('notices', 'megaphone', 'lavender', '공개 공지', notices.filter(notice => notice.published).length, '건')}
    </div>
    <div class="dashboard-bottom">
      <section class="panel dashboard-notices" aria-labelledby="home-notices-title">
        <header class="dashboard-panel-head"><h2 id="home-notices-title">최근 공지</h2><button type="button" class="small-link" data-action="tab" data-id="notices">전체 보기 ${icon('chevron-right', 15)}</button></header>
        <div class="home-notice-list">${recent.length ? recent.join('') : '<p class="muted">아직 등록한 공지가 없어요.</p>'}</div>
      </section>
    </div>
  </div>`;
}

export function countEvent(roster, guests) {
  return {
    early: roster.filter(row => row.slot === 'early').length,
    late: roster.filter(row => row.slot === 'late').length,
    no: roster.filter(row => row.slot === 'no').length,
    lunch: roster.filter(row => row.lunch).length,
    members: roster.filter(row => row.present === true).length,
    unmarked: roster.filter(row => row.present == null).length,
    guests: guests.filter(row => row.status === 'arrived').length,
  };
}

export function voteMetrics(counts, { includeAttendance = true } = {}) {
  const items = [['선발', `${counts.early}명`, 'green'], ['후발', `${counts.late}명`], ['불참', `${counts.no}명`], ['점심', `${counts.lunch}명`]];
  if (includeAttendance) items.push(['실제 운동', `${counts.members + counts.guests}명`]);
  return summary(items);
}

export function eventForm(event, id = '') {
  const time = { type: 'time', attrs: 'required' };
  return form('event',
    (!id ? note('일시, 장소와 마감 시각을 확인해 주세요. 새 회차는 준비 상태로 저장할 수 있어요.') : '') + `<div class="form-grid">
      ${field('모임 이름', 'title', event.title, { wide: true, attrs: 'required maxlength="120"' })}
      ${field('날짜', 'date', event.date, { type: 'date', attrs: 'required' })}
      ${field('장소', 'place', event.place, { attrs: 'required maxlength="120"' })}
      ${field('운동 시작', 'time', event.time, time)}
      ${field('운동 종료', 'endTime', event.endTime, time)}
      ${field('선발 모임', 'earlyTime', event.earlyTime, time)}
      ${field('후발 모임', 'lateTime', event.lateTime, time)}
      ${field('투표 마감 (한국 시간)', 'deadline', event.deadline, { type: 'datetime-local', wide: true, attrs: 'required' })}
      ${textarea('공개 안내', 'notes', event.notes, 'maxlength="3000" placeholder="날짜별 준비물이나 안내를 적어 주세요."')}
    </div>`
    + note('로그인한 회원에게 표시되는 안내입니다. 개인 연락처와 회원 명단은 별도로 전달해 주세요.')
    + check('카톡 공유 링크 공개', 'published', event.published)
    + check('웹 투표 열기', 'open', event.open),
    id ? '회차 저장' : '회차 만들기', id);
}

const sessionTabs = [['poll', '참석 투표'], ['attendance', '당일 출석'], ['settlement', '마무리']];

// One word per session in the picker, from GET /api/admin (settled is only on that listing).
function sessionStatus(item) {
  const day = today();
  if (item.settled) return '마무리 완료';
  if (!item.published) return '비공개';
  if (item.date < day) return '마무리 전';
  if (item.date === day) return '오늘';
  return item.canVote ? '투표 중' : item.open ? '투표 마감' : '투표 닫힘';
}

export function eventScreen(events, detail, club, tab = null) {
  const event = detail?.event;
  const actions = button(icon('plus', 22), 'new-event', { css: 'btn-icon', label: '새 회차' }) + (event ? button('다음 주 복제', 'clone-event', { css: 'secondary' }) : '');
  const head = pageHead('운동 운영', '회차를 골라 투표 응답, 당일 출석, 마무리를 기록하세요.', actions);
  if (!event) return `<div class="secondary-page">${head}${panel('회차', '<p class="empty-state">회차를 만들면 참석 투표와 당일 체크를 시작할 수 있어요.</p>')}</div>`;
  const { roster, guests, settlement } = detail;
  const counts = countEvent(roster, guests);
  const picker = `<label class="form-field event-picker"><span>확인할 회차</span><select name="event-id" data-action="switch-event">
    ${events.map(item => option(item.id, `${dateLabel(item.date)} ${item.title} · ${sessionStatus(item)}`, event.id)).join('')}</select></label>`;
  const overview = `<section class="panel event-overview" aria-labelledby="admin-event-title"><div class="panel-body">
    ${picker}
    <div class="event-overview-title"><h2 id="admin-event-title">${esc(event.title)}</h2>${pill(event.published ? '공개 중' : '비공개 준비', event.published ? 'green' : 'muted')}</div>
    <div class="event-facts"><span>${icon('calendar', 18)}${esc(dateLabel(event.date))}</span><span>${icon('clock', 18)}${esc(event.time)}–${esc(event.endTime)}</span>
      <span>${icon('pin', 18)}${esc(event.place)}</span></div>
  </div></section>`;
  const voteActions = button(`${icon('edit', 17)} 회차 수정`, 'edit-event', { css: 'secondary small' })
    + button(event.published ? '공개 내리기' : '링크 공개', 'publish-event', { css: 'secondary small' })
    // Opening a vote whose deadline has passed would say "열었어요" while members still cannot answer, so it waits for a new deadline.
    + button(event.open ? '투표 닫기' : '투표 열기', 'toggle-vote', { css: 'secondary small', disabled: !event.published || (!event.open && deadlinePassed(event)) })
    + button(`${icon('link', 16)} 카톡 링크 복사`, 'copy-vote', { css: 'primary small', disabled: !event.published });
  const vote = panel('웹 참석 투표', `<div id="vote-counts">${voteMetrics(counts)}</div>
    ${event.published ? `<a class="btn btn-text btn-small share-preview" href="${esc(club.home)}vote/${encodeURIComponent(event.id)}" target="_blank" rel="noopener">${icon('clipboard', 16)} 회원 투표 화면 보기</a>` : ''}
    ${!event.canVote && deadlinePassed(event) && (event.open || event.date >= today()) ? '<p class="form-note">투표 마감 시각이 지났습니다. 다시 받으려면 마감 시각을 먼저 변경해 주세요.</p>' : ''}`,
  { subtitle: `${esc(deadlineLabel(event.deadline))} 마감`, actions: voteActions });
  // The three steps of a session are tabs, as in the demo (screens.js eventDetail), so the gym check-in is one tap away.
  const current = tab ?? defaultTab(event);
  const nav = `<nav class="tabs" aria-label="회차 단계">${sessionTabs.map(([name, label]) => `<button type="button" data-action="event-tab" data-id="${name}"${name === current ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
  const guestList = guestsPanel(guests, settlement?.confirmed);
  const content = current === 'attendance' ? attendancePanel(event, roster, counts, settlement?.confirmed) + guestList
    : current === 'settlement' ? settlementPanel(settlement, counts) : vote + guestList;
  return `<div class="secondary-page">${head}${overview}${nav}${content}</div>`;
}

const recognitionLabel = { direct: '직접 인정', substitute: '대타 인정', approved: '별도 승인' };

// One row of 당일 출석. The live app redraws only this row after a check-in (app.mjs markPresent).
export function attendanceRow(event, person, confirmed) {
  const present = person.present === true;
  const stand = present ? '출석' : person.present === false ? '불참 확인' : '미확인';
  return `<tr data-member="${esc(person.id)}" data-search="${esc(person.name)}" data-selected="${present}">
      <td><div class="member-name">${avatar(person.name)}<strong>${esc(person.name)}</strong></div></td>
      <td>${esc(voteLabel(person.slot, event))}${person.lunch ? ' · 점심' : ''}${person.recognition ? `<small>${recognitionLabel[person.recognition] ?? ''}</small>` : ''}</td>
      <td>${pill(stand, present ? 'green' : 'muted')}</td>
      <td class="table-actions">${button(present ? '출석 취소' : '출석 체크', 'mark-present', { id: person.id, css: present ? 'secondary small' : 'small', disabled: confirmed, label: `${person.name} ${present ? '출석 취소' : '출석 체크'}` })}
        ${button('상세', 'attendance', { id: person.id, css: 'text small', disabled: confirmed, label: `${person.name} 출석 상세` })}${button('응답 변경', 'vote-override', { id: person.id, css: 'text small', label: `${person.name} 응답 변경` })}</td>
    </tr>`;
}

export function attendanceSubtitle(counts, confirmed) {
  return `${counts.members}명 출석 · ${counts.unmarked}명 미확인 · ${confirmed ? '마무리한 회차입니다. 출석을 고치려면 마무리 확인을 먼저 해제해 주세요.' : '실제 출석과 줄서기 인정은 따로 기록합니다.'}`;
}

function attendancePanel(event, roster, counts, confirmed) {
  const favor = row => row.slot === 'early' ? 0 : row.slot === 'late' ? 1 : 2;
  const rows = [...roster].sort((a, b) => favor(a) - favor(b) || a.name.localeCompare(b.name, 'ko')).map(person => attendanceRow(event, person, confirmed));
  return panel('당일 출석', table(['회원', '투표 응답', '출석', '<span class="sr-only">기록</span>'], rows, '이 회차에 등록된 회원이 없습니다.'), {
    id: 'attendance',
    subtitle: attendanceSubtitle(counts, confirmed),
    actions: search('attendance') + button(`${icon('refresh', 16)} 새로고침`, 'refresh', { css: 'text small' }),
  });
}

export function attendanceForm(person) {
  return form('attendance', note('대타 인정은 당일 운동 출석도 함께 체크해 주세요. 별도 승인 사유와 증빙은 이 화면에 기록하지 않습니다.')
    + `<div class="form-grid">${select('실제 출석', 'present', [['', '미확인'], ['true', '출석'], ['false', '불참 확인']], person.present)}
      ${select('줄서기 인정', 'recognition', [['', '해당 없음'], ...Object.entries(recognitionLabel)], person.recognition)}</div>`, '기록 저장', person.id);
}

export function overrideForm(event, person) {
  return form('vote-override', note('운영진이 회원의 응답을 대신 변경합니다.') + choiceFields(event, person, '점심 식사에도 참여해요'), '응답 저장', person.id)
    + (person.slot ? `<div class="form-actions">${button('응답 삭제', 'clear-vote', { id: person.id, css: 'text' })}</div>` : '');
}

const guestStatus = { pending: '신청', confirmed: '확정', arrived: '도착', cancelled: '취소' };

function guestsPanel(guests, confirmed) {
  const rows = guests.map(guest => `<tr><td><strong>${esc(guest.name)}</strong>${guest.level || guest.invitedBy ? `<small>${esc([guest.level, guest.invitedBy].filter(Boolean).join(' · '))}</small>` : ''}</td>
    <td>${pill(guestStatus[guest.status] ?? '', guest.status === 'arrived' ? 'green' : guest.status === 'cancelled' ? 'muted' : 'warm')}</td>
    <td>${guest.paid ? pill('비용 확인', 'green') : pill('미확인')}</td>
    <td class="table-actions">${button('수정', 'edit-guest', { id: guest.id, css: 'text small', disabled: confirmed, label: `${guest.name} 게스트 수정` })}</td></tr>`);
  return panel('게스트', table(['게스트', '상태', '비용', '<span class="sr-only">수정</span>'], rows, '등록된 게스트가 없습니다.'), {
    id: 'guests', subtitle: '도착을 확인한 게스트만 실제 참여 인원에 포함됩니다.',
    actions: button(`${icon('plus', 16)} 게스트 추가`, 'new-guest', { css: 'secondary small', disabled: confirmed }),
  });
}

export function guestForm(guest = null) {
  return form('guest', `<div class="form-grid">
    ${field('이름', 'name', guest?.name, { attrs: 'required maxlength="60"' })}
    ${field('급수 (선택)', 'level', guest?.level, { attrs: 'maxlength="30"' })}
    ${field('초대한 회원 (선택)', 'invitedBy', guest?.invitedBy, { attrs: 'maxlength="60"' })}
    ${select('상태', 'status', Object.entries(guestStatus), guest?.status ?? 'pending')}</div>`
    + check('게스트 비용 확인', 'paid', guest?.paid), guest ? '게스트 저장' : '게스트 등록', guest?.id);
}

export function settlementPanel(value, counts) {
  const s = value ?? {};
  const numbers = [
    ['이전 이월 (낱개)', 'priorSingles'], ['이전 이월 (타)', 'priorTubes'], ['당일 잔여 (낱개)', 'remainingSingles'], ['코트 찬조금 (원)', 'courtDonation'],
  ].map(([label, key]) => field(label, key, s[key] ?? 0, { type: 'number', attrs: 'min="0" max="10000000" step="1" required' })).join('');
  return panel('모임 마무리', summary([
    ['실제 참석', `${counts.members + counts.guests}명`, 'green'], ['회원', `${counts.members}명`], ['게스트 도착', `${counts.guests}명`],
  ]) + (counts.unmarked ? note(`출석을 확인하지 않은 회원 ${counts.unmarked}명은 마무리 집계에서 빠집니다.`) : '')
    + form('settlement', `<div class="form-grid">${numbers}</div>` + check('마무리 집계를 확인했어요', 'confirmed', s.confirmed)
      + (s.confirmed ? note('확인을 해제하고 저장하면 출석과 게스트를 다시 편집할 수 있습니다.') : ''), '마무리 기록 저장', '', 'settlement-form'), {
    id: 'settlement', subtitle: '콕 잔여와 찬조금을 저장하고 마무리 글을 단체방에 붙여 넣으세요.',
    actions: button(`${icon('clipboard', 16)} 마무리 글 복사`, 'copy-report', { css: 'secondary small', disabled: !s.confirmed }),
  });
}

export function reportText(detail, clubName) {
  const { event, roster, guests, settlement: s } = detail;
  const c = countEvent(roster, guests);
  return [
    `${clubName} ${event.title} 마무리`,
    `${dateLine(event)} / ${event.place}`,
    `실제 참석 ${c.members + c.guests}명 (회원 ${c.members}명, 게스트 ${c.guests}명)`,
    `콕 이월 ${s.priorSingles + s.remainingSingles}개 + ${s.priorTubes}타 (이전 ${s.priorSingles}개 + ${s.priorTubes}타, 당일 잔여 ${s.remainingSingles}개)`,
    `코트 찬조금 ${Number(s.courtDonation).toLocaleString('ko-KR')}원`,
  ].join('\n');
}

// 운영진 (PLATFORM.md 인증): who may open this screen. Another organiser is issued, reissued or retired here;
// one's own number is changed from the menu (번호 바꾸기).
function organizersPanel(organizers, me) {
  const rows = organizers.map(organizer => {
    const self = organizer.id === me;
    return `<tr><td><div class="member-name">${avatar(organizer.name)}<strong>${esc(organizer.name)}</strong></div></td>
    <td>${self ? pill('나', 'green') : pill(organizer.mustChange ? '임시 번호 전달 대기' : '사용 중', organizer.mustChange ? 'warm' : 'green')}</td>
    <td class="table-actions">${self ? '<small>메뉴의 번호 바꾸기</small>'
      : button('번호 재발급', 'reset-organizer', { id: organizer.id, css: 'text small', label: `${organizer.name} 번호 재발급` })
        + button('해지', 'remove-organizer', { id: organizer.id, css: 'text small', label: `${organizer.name} 해지` })}</td>
  </tr>`;
  });
  return panel('운영진', table(['이름', '상태', '<span class="sr-only">운영진 관리</span>'], rows, '운영진이 없습니다.'), {
    subtitle: '운영 화면에 들어오는 사람이에요. 추가하면 임시 번호가 한 번 보여요.',
    actions: button('운영진 추가', 'new-organizer', { css: 'secondary small' }),
  });
}

export function organizerForm() {
  return form('organizer', `<div class="form-grid">${field('성함', 'name', '', {
    wide: true, attrs: 'maxlength="60" autocomplete="off" required', help: '이 성함과 임시 번호로 운영 화면에 처음 들어와요.',
  })}</div>`, '임시 번호 발급');
}

export function membersScreen(members, organizers = [], me = null) {
  const active = members.filter(member => member.active).length;
  const rows = members.map(member => `<tr data-search="${esc(member.name)}">
    <td><div class="member-name">${avatar(member.name)}<strong>${esc(member.name)}</strong></div></td>
    <td>${pill(member.active ? '활동 중' : '비활성', member.active ? 'green' : 'muted')}</td>
    <td class="table-actions">${button('회원 수정', 'edit-member', { id: member.id, css: 'text small', label: `${member.name} 회원 수정` })}${button('접속 재설정', 'reset-member', { id: member.id, css: 'text small', disabled: !member.active, label: `${member.name} 접속 재설정` })}</td>
  </tr>`);
  return `<div class="secondary-page">${pageHead('회원 관리', '회원은 등록한 이름과 생년월일 6자리로 처음 로그인합니다.', button(icon('plus', 22), 'new-member', { css: 'btn-icon', label: '회원 추가' }))}
    ${panel('회원 명단', table(['이름', '상태', '<span class="sr-only">회원 관리</span>'], rows, '등록된 회원이 없습니다.'), {
    subtitle: `전체 ${members.length}명 · 활동 중 ${active}명`, actions: search('members'),
  })}
    ${organizersPanel(organizers, me)}</div>`;
}

export function memberForm(member = null) {
  return form('member', `<div class="form-grid">${field('이름', 'name', member?.name, { wide: true, attrs: 'maxlength="60" required' })}</div>`
    + (member ? check('활동 회원', 'active', member.active) : `<div class="form-grid">${field('생년월일 6자리', 'birthday', '', {
      type: 'password', wide: true, attrs: 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required',
      help: '회원이 첫 로그인에 입력합니다. 가입 처리 후에는 이 화면에서 조회할 수 없어요.',
    })}</div>`), member ? '회원 저장' : '회원 등록', member?.id);
}

export function noticeForm(notice = null) {
  return form('notice', `<div class="form-grid">${field('제목', 'title', notice?.title, { wide: true, attrs: 'required maxlength="120"' })}
    ${textarea('공지 내용', 'body', notice?.body, 'required maxlength="4000" rows="6"')}</div>`
    + note('공개한 공지는 로그인한 회원이 볼 수 있습니다. 계좌번호와 개인 정보는 공지에서 빼 주세요.')
    + check('링크 공개', 'published', notice?.published), '공지 저장', notice?.id);
}

export function noticesScreen(notices) {
  const items = notices.map(notice => `<article class="notice-item">
    <div class="notice-date"><time datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time>${pill(notice.published ? '공개' : '비공개', notice.published ? 'green' : 'muted')}</div>
    <h3>${esc(notice.title)}</h3>
    ${notice.body ? `<p class="preserve-lines">${esc(notice.body)}</p>` : ''}
    <div class="notice-actions">${button(`${icon('edit', 17)} 공지 수정`, 'edit-notice', { id: notice.id, css: 'secondary small' })}
      ${button(`${icon('link', 17)} 카톡 링크 복사`, 'copy-notice', { id: notice.id, css: 'text small', disabled: !notice.published })}</div>
  </article>`);
  return `<div class="secondary-page">${pageHead('공지', '공개한 공지는 로그인한 회원이 볼 수 있어요.', button(icon('plus', 22), 'new-notice', { css: 'btn-icon', label: '새 공지' }))}
    ${panel('공지 목록', items.length ? `<div class="notice-list">${items.join('')}</div>` : '<p class="empty-state">등록된 공지가 없습니다.</p>')}</div>`;
}

export function progressScreen(year, half, members) {
  const rows = members.map(row => `<tr data-search="${esc(row.name)}"><td><strong>${esc(row.name)}</strong></td>
    <td>${row.first} / 3회</td><td>${row.second} / 3회</td><td>${pill(row.rewarded ? '수령' : '미수령', row.rewarded ? 'green' : 'muted')}</td>
    <td class="table-actions">${button(row.rewarded ? '수령 취소' : '수령 기록', 'reward', { id: row.id, css: row.rewarded ? 'text small' : 'secondary small', label: `${row.name} ${row.rewarded ? '수령 취소' : '수령 기록'}` })}</td></tr>`);
  const period = form('progress', `<div class="form-grid">${field('연도', 'year', year, { type: 'number', attrs: 'min="2000" max="2100" step="1" required' })}
    ${select('기간', 'half', [[1, '상반기'], [2, '하반기']], half)}</div>`, '집계 조회', '', 'progress-form');
  return `<div class="secondary-page">${pageHead('반기 집계', '각 구간에서 줄서기 인정을 받은 횟수입니다. 지급은 운영진이 확인한 뒤 기록해 주세요.')}
    ${panel('조회 기간', period)}
    ${panel(`${esc(year)}년 ${Number(half) === 1 ? '상반기' : '하반기'} 줄서기 인정`, table(['회원', '1차 구간', '2차 구간', '콕 수령', '<span class="sr-only">기록</span>'], rows, '해당 기간에 확인할 회원이 없습니다.'), {
    actions: search('progress'),
  })}</div>`;
}
