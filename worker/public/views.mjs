import { shuttlecockMark } from './shuttlecock.mjs';
import { loadingCenter, shellSkeleton } from './skeleton.mjs';
import { awaitingVote, eventStage, finished, flowOrder, koreanNow, memberOrder } from './flow.mjs';
import { calendarBlock } from './calendar.mjs';

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
    deadline: `${addDays(date, -1)}T15:30`, notes: '', open: false, published: false, kind: 'regular',
  };
}

// 일정 종류 (worker/migrations/0008_pins_kinds.sql). 정기 is the usual one, so lists name only the others.
export const eventKindLabels = { regular: '정기', flash: '번개', match: '대회', social: '모임' };

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
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7m-7 7h15"/>',
  edit: '<path d="m14 5 5 5M4 20l4.5-1 12-12-3.5-3.5-12 12z"/>',
  megaphone: '<path d="m3 11 15-6v14L3 15v-4Zm3 5 2.5 5h3l-2-4m11-6 1-1m-1 5 1 1"/>',
  // 카톡 공유: a chat bubble, the same in the demo (app.js icons).
  share: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
  // 상단 고정: a push pin (the map marker above is `pin`, for places).
  pushpin: '<path d="M12 16v6M8 3h8l-1.5 6.5L18 13v3H6v-3l3.5-3.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3m-5-3 5-5-5-5m5 5H3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4m-4 5a8 8 0 0 0 14.9 4M20 20v-4h-4"/>',
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

export function loader(text, css = '') {
  return `<div class="shuttle-loader${css ? ` ${css}` : ''}" role="status">${shuttlecockMark()}<span>${esc(text)}</span></div>`;
}

// kind: the screen's skeleton (skeleton.mjs loadingKind) in the one shell everyone has (ROLES.md 2단계).
export function loadingPage(kind, operating = false, text = undefined) {
  return shellSkeleton(kind, operating) + loadingCenter(shuttlecockMark(), text);
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

function table(columns, rows, empty, css = '') {
  if (!rows.length) return `<p class="empty-state">${empty}</p>`;
  return `<div class="data-table-wrap"><table class="data-table${css ? ` ${css}` : ''}"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
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

// Members choose 선발 or 후발 (worker/api.mjs memberSlots); the organisers' 회원 응답 변경 also offers 불참.
function choiceFields(event, vote, lunchLabel, slots = ['early', 'late', 'no']) {
  const choices = slots.map(slot => `<label class="public-choice">
    <input type="radio" name="slot" value="${slot}"${vote?.slot === slot ? ' checked' : ''} required><span>${esc(voteLabel(slot, event))}</span></label>`);
  return `<fieldset class="public-choices"><legend>참석</legend><div class="public-choice-row${slots.length === 3 ? ' public-choice-slots' : ''}">${choices.join('')}</div></fieldset>
    <label class="public-lunch"><input type="checkbox" name="lunch"${vote?.lunch ? ' checked' : ''}> ${lunchLabel}</label>`;
}

/* Member screens: the demo's public share card (share.css). */

const courtLines = '<div class="share-art-decoration" aria-hidden="true"><span></span><span></span><span></span></div>';

function memberCard(kind, type, title, head, content) {
  return `<article class="public-share-card">
    <header class="public-story-head share-art--${kind}">${courtLines}<span class="public-share-type">${type}</span><h1 tabindex="-1">${esc(title)}</h1>${head}</header>
    <div class="public-share-content">${content}</div></article>`;
}

// The member screens sit in the one shell (ROLES.md 2단계) as a single column of cards (DESIGN.md 4). Links are the
// shell's own addresses (#event/<id>), so they open in place (app.mjs follows the address); back names the list
// they came from as [section, label].
function memberPage(content, { back = null } = {}) {
  return `<div class="public-share-page member-page">
    ${back ? `<a class="member-back" href="#${back[0]}">${icon('arrow-left', 18)} ${back[1]}</a>` : ''}${content}</div>`;
}

// organizer: the organiser's own number (PLATFORM.md 인증).
export function pinForm({ organizer = false } = {}) {
  const pin = 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required';
  const word = organizer ? '번호' : 'PIN';
  return form('pin', field(organizer ? '지금 번호' : '현재 로그인 번호', 'currentPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="off" enterkeyhint="next" ${pin}`,
    help: organizer ? '지금 로그인할 때 쓰는 번호를 입력해 주세요. 생년월일 6자리나 받은 임시 번호도 돼요.' : '지금 로그인할 때 쓰는 생년월일, PIN 또는 임시 번호를 입력해 주세요.',
  }) + field(`새 ${word}`, 'newPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="new-password" enterkeyhint="next" ${pin}`,
    help: '숫자 6자리를 사용해 주세요. 생년월일과 연속·반복 숫자는 피해주세요.',
  }) + field(`새 ${word} 확인`, 'confirmPin', '', {
    type: 'password', wide: true, attrs: `autocomplete="new-password" enterkeyhint="done" ${pin}`,
  }), `새 ${word} 저장`, '', 'form-grid');
}

// Someone signed in with a birthday or a temporary number (mustChange). With the 운영 권한 the 운영 메뉴 opens only after
// they set their own number (ROLES.md 계정·데이터); the member menus are open meanwhile.
function pinCard(user) {
  if (!user?.mustChange) return '';
  if (user.organizer) {
    return `<section class="member-pin" aria-labelledby="member-pin-title"><h2 id="member-pin-title">내 번호 정하기</h2>
    <p>운영 권한이 있어요. 운영 메뉴는 나만 아는 번호 6자리를 정한 뒤에 열려요.</p>
    <button type="button" class="share-button share-button--secondary" data-action="pin">내 번호 정하기</button></section>`;
  }
  return `<section class="member-pin" aria-labelledby="member-pin-title"><h2 id="member-pin-title">내 로그인</h2>
    <p>지금은 생년월일 뒤 6자리나 임시 번호로 로그인해요. 원하면 나만 아는 PIN 6자리로 바꿀 수 있어요.</p>
    <button type="button" class="share-button share-button--secondary" data-action="pin">PIN 만들기</button></section>`;
}

// Before sign-in: what signing in adds (홈, 내 기록).
const signInCard = `<section class="member-pin" aria-labelledby="member-sign-in-title"><h2 id="member-sign-in-title">로그인</h2>
    <p>성함과 6자리로 한 번 로그인하면 이 휴대폰에서 6개월 동안 유지돼요. 장소와 안내, 공지 전체, 내 기록을 보고 투표할 수 있어요.</p>
    <button type="button" class="share-button share-button--secondary" data-action="sign-in">로그인</button></section>`;

// 응답 현황: how many answered each way, never who (worker/api.mjs countColumns), drawn like the club's 카카오톡 투표:
// a bar per choice as a share of everyone coming (선발 + 후발; members have no 불참). The live CSP blocks style
// attributes, so each bar is an SVG sized by its viewBox, as the organisers' .poll-track is. The demo's share.js
// draws the same markup.
function countsBlock(counts, event) {
  if (!counts) return '';
  const coming = counts.early + counts.late;
  if (!coming && !counts.lunch) return '<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>아직 응답이 없어요</span></p></div>';
  const rows = [[voteLabel('early', event), counts.early, 'slot'], [voteLabel('late', event), counts.late, 'slot'], ['점심 함께', counts.lunch, 'lunch']];
  return `<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>참석 ${coming}명</span></p>
    <ul>${rows.map(([label, n, tone]) => `<li><span>${esc(label)}</span><strong>${n}명</strong><svg class="member-count-bar" viewBox="0 0 ${Math.max(coming, counts.lunch)} 1" preserveAspectRatio="none" aria-hidden="true"><rect class="member-count-${tone}" width="${n}" height="1"/></svg></li>`).join('')}</ul>
    <p class="member-counts-note">누가 응답했는지는 보이지 않아요</p></div>`;
}

// 로그인 없이 보기 (사용자 결정, 2026-11-26): before sign-in (signedIn false) the place reads 로그인 후 보여요, there are no
// notes, and answering offers sign-in instead of the form.
export function memberVoteScreen(event, vote, eligible, voteSaved = false, signedIn = true) {
  const facts = `<dl class="public-event-facts">
    <div><dt>일시</dt><dd>${esc(dateLabel(event.date))} <span class="nowrap">${esc(event.time)}–${esc(event.endTime)}</span></dd></div>
    <div><dt>장소</dt><dd>${placeText(event)}</dd></div>
    <div><dt>투표 마감</dt><dd>${esc(deadlineLabel(event.deadline))}</dd></div></dl>`;
  const notes = event.notes ? `<p class="public-share-body">${esc(event.notes)}</p>` : '';
  // The answer comes before the 응답 현황 (DESIGN.md 6 UX 점검표 13 피츠): on a phone the choices and 응답 저장 sit in the
  // first screen above the tab bar instead of below it.
  return memberPage(memberCard('vote', event.cancelled ? '취소된 일정' : '참석 투표', event.title, '', facts + notes
    + voteResponse(event, vote, eligible, voteSaved, signedIn) + countsBlock(event.counts, event)), { back: ['event', '일정'] });
}

// The answer part of a vote: the member's own form (or why there is none). The organisers' 일정 상세 shows the same
// part as 내 응답, since organisers vote as members (ROLES.md 2단계).
function voteResponse(event, vote, eligible, voteSaved = false, signedIn = true) {
  const current = vote ? `<p class="public-receipt" role="status">내 응답 <strong>${esc(voteLabel(vote.slot, event))}${vote.lunch ? ' · 점심 참여' : ''}</strong>${voteSaved ? ' <span class="member-confirmed">저장 완료</span>' : ''}</p>` : '';
  let response = `<div class="public-form">${current}<p class="public-status">${event.open ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.'}</p></div>`;
  if (event.cancelled) {
    response = `<div class="public-form">${current}<p class="public-status"><strong>이 일정은 취소됐어요.</strong>${event.notes ? '위 안내를 확인해 주세요.' : ''}</p></div>`;
  } else if (event.canVote && !signedIn) {
    response = `<div class="public-form"><p class="public-status"><strong>투표하려면 로그인해 주세요.</strong>성함과 6자리로 한 번 로그인하면 이 휴대폰에서 계속 바로 투표할 수 있어요.</p>
      <button class="share-button share-button--primary" type="button" data-action="sign-in">로그인하고 투표하기</button></div>`;
  } else if (event.canVote && eligible) {
    response = `<form class="public-form" data-form="vote" data-id="${esc(event.id)}">${current}${choiceFields(event, vote, '점심 식사에도 참여해요', ['early', 'late'])}
      <p class="inline-error" role="alert" hidden></p>
      <button class="share-button share-button--primary" type="submit">${vote ? '응답 변경' : '응답 저장'}</button>
      ${vote ? '<button class="share-button share-button--secondary" type="button" data-action="cancel-vote">응답 취소</button>' : ''}</form>`;
  } else if (event.canVote) {
    response = '<div class="public-form"><p class="public-status"><strong>이 회차에 응답할 수 없어요.</strong>운영진에게 참석 명단을 확인해 주세요.</p></div>';
  }
  return response;
}

// Before sign-in the body is null and only its start (preview) shows, with the way to the whole notice when the start
// was cut (worker/api.mjs noticePreview ends it with …); a short notice is whole in its preview.
export function noticeScreen(notice) {
  const date = `<time datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time>`;
  const more = notice.body === null && notice.preview.endsWith('…');
  const body = `<p class="public-share-body">${esc(notice.body ?? notice.preview)}</p>${more ? `
      <div class="public-form"><p class="public-status"><strong>전체 내용은 로그인 후 볼 수 있어요.</strong></p>
      <button class="share-button share-button--primary" type="button" data-action="sign-in">로그인하고 전체 보기</button></div>` : ''}`;
  return memberPage(memberCard('notice', '모임 공지', notice.title, date, body), { back: ['notices', '공지'] });
}

// The place before sign-in (worker/api.mjs listPublic, fetchPublic give null).
function placeText(event) {
  return event.place === null ? '<span class="member-locked">로그인 후 보여요</span>' : esc(event.place);
}

const slotWords = { early: '선발', late: '후발', no: '불참' };

// What the member can do with one event: 투표하기 / 응답 변경 / 일정 확인 and the sentence that explains it.
function memberEventState(event, signedIn = true) {
  if (event.cancelled) return { action: '일정 확인', primary: false, row: '취소됨', note: '이 일정은 취소됐어요.' };
  if (event.canVote && !signedIn) return { action: '투표하기', primary: true, row: '투표하기', note: '로그인하면 투표할 수 있어요.' };
  if (event.canVote && event.eligible) {
    return event.mySlot
      ? { action: '응답 변경', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong> · 마감 전까지 바꿀 수 있어요.` }
      : { action: '투표하기', primary: true, row: '투표하기', note: '아직 응답하지 않았어요.' };
  }
  if (event.mySlot) return { action: '일정 확인', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong>` };
  if (event.canVote) return { action: '일정 확인', primary: false, row: '일정 확인', note: '이 회차에 응답할 수 없어요. 운영진에게 참석 명단을 확인해 주세요.' };
  return { action: '일정 확인', primary: false, row: '일정 확인', note: event.open ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.' };
}

function nextEventCard(event, signedIn) {
  const state = memberEventState(event, signedIn);
  const kind = event.cancelled ? '취소된 일정' : event.canVote ? '참석 투표' : event.date === today() ? '오늘 일정' : '다음 일정';
  const deadline = event.deadline ? `<div><dt>투표 마감</dt><dd>${esc(deadlineLabel(event.deadline))}</dd></div>` : '';
  return `<article class="public-share-card member-next" aria-labelledby="member-next-title">
    <header class="public-story-head share-art--vote">${courtLines}<span class="public-share-type">${kind}${pinMark(event)}</span>
      <h2 id="member-next-title" class="public-title">${esc(event.title)}</h2><time datetime="${esc(event.date)}">${esc(dateLine(event))}</time></header>
    <div class="public-share-content">
      <dl class="public-event-facts"><div><dt>장소</dt><dd>${placeText(event)}</dd></div>${deadline}</dl>${countsBlock(event.counts, event)}
      <p class="member-answer">${state.note}</p>
      <a class="share-button ${state.primary ? 'share-button--primary' : 'share-button--secondary'} member-next-action" href="#event/${encodeURIComponent(event.id)}">${state.action}</a>
    </div></article>`;
}

// The months of each 구간 of a half under the 모임 규칙 (worker/api.mjs periodOf): ['7~9월', '10~12월'], ['7월', …].
export function periodMonths(half, periods) {
  const length = 6 / periods;
  return Array.from({ length: periods }, (_, index) => {
    const from = (half === 1 ? 1 : 7) + index * length;
    return length === 1 ? `${from}월` : `${from}~${from + length - 1}월`;
  });
}

const periodName = (periods, index) => periods === 1 ? '반기' : `${index + 1}차 구간`;

// One 구간 of 내 기록 as the club's 출석완료자 명단 sheet keeps it: a date slot per 줄서기 인정 the 모임 규칙 asks for
// (more if earned), a filled slot with its kind when it was not direct. Empty slots are only drawn; the count says how
// many are filled.
function markSlots(label, months, marks, goal) {
  const filled = marks.map(mark => `<li class="member-mark"><span>${Number(mark.date.slice(5, 7))}/${Number(mark.date.slice(8, 10))}</span>${mark.kind === 'direct' ? '' : `<small>${recognitionLabel[mark.kind]}</small>`}</li>`);
  const empty = Array.from({ length: Math.max(0, goal - marks.length) }, () => '<li class="member-mark member-mark-empty" aria-hidden="true"></li>');
  return `<div class="member-marks"><p class="member-marks-head"><strong>${label}</strong><span>${months}</span><span class="member-marks-count">${marks.length} / ${goal}회</span></p>
    <ol class="member-mark-slots">${filled.join('')}${empty.join('')}</ol></div>`;
}

// 출석 in 내 기록: this year by month as bars and the count in all. The live CSP blocks style attributes, so each bar
// is an SVG sized by its viewBox, as 응답 현황 draws them; the numbers are spoken once by the group's label.
function attendanceMonths(year, { months, total }) {
  const max = Math.max(1, ...months);
  const now = today().startsWith(year + '-') ? Number(today().slice(5, 7)) : 0;
  const spoken = months.map((n, index) => `${index + 1}월 ${n}회`).join(', ');
  const bars = months.map((n, index) => `<span class="member-month${index + 1 === now ? ' member-month-now' : ''}"><small>${n || ''}</small>
      <svg viewBox="0 0 1 ${max}" preserveAspectRatio="none"><rect y="${max - n}" width="1" height="${n}"/></svg><span>${index + 1}</span></span>`);
  return `<div class="member-marks"><p class="member-marks-head"><strong>출석</strong><span>${year}년 ${months.reduce((sum, n) => sum + n, 0)}회</span><span class="member-marks-count">전체 ${total}회</span></p>
    <div class="member-months" role="img" aria-label="${year}년 월별 출석: ${spoken}">${bars.join('')}</div></div>`;
}

// 내 기록: this member's 출석 and row of this half's 반기 집계 (progressScreen), so they need not ask an organiser.
function recordCard(record) {
  if (!record) return '';
  const months = periodMonths(record.half, record.periods.length);
  const reward = record.rewarded ? '받았어요' : record.eligible ? '수령 대상이에요' : '아직이에요';
  return `<section class="public-share-card member-list member-record-card" aria-labelledby="member-record"><div class="public-share-content">
    <h1 id="member-record" tabindex="-1">내 기록</h1>
    ${attendanceMonths(record.year, record.attendance)}
    <p class="public-form-note">${record.year}년 ${record.half === 1 ? '상반기' : '하반기'} 줄서기 인정</p>
    ${record.periods.map((marks, index) => markSlots(periodName(record.periods.length, index), months[index], marks, record.goal)).join('')}
    <dl class="public-event-facts"><div><dt>콕 수령</dt><dd>${reward}</dd></div></dl>
    <p class="public-form-note">마무리한 회차에서 운영진이 기록한 출석과 인정만 세요.</p></div></section>`;
}

// One event or notice in the member lists (홈, 일정, 공지); the whole row opens it in the shell.
function memberEventRow(event, signedIn) {
  const state = memberEventState(event, signedIn);
  const tone = state.row === '투표하기' ? ' member-record-open' : state.row === '응답 완료' ? ' member-record-done' : '';
  return `<li class="member-record" data-date="${esc(event.date)}"><a class="member-record-link" href="#event/${encodeURIComponent(event.id)}">
    <span><strong>${pinMark(event)}${esc(event.title)}</strong><span class="member-record-meta"><time datetime="${esc(event.date)}">${esc(kindPrefix(event) + dateLine(event))}</time><span>${esc(event.place)}</span>${event.canVote && event.deadline ? `<span>투표 마감 ${esc(deadlineLabel(event.deadline))}</span>` : ''}</span></span>
    <span class="member-record-action${tone}">${state.row}</span></a></li>`;
}

function memberNoticeRow(notice) {
  return `<li class="member-record"><a class="member-record-link" href="#notices/${encodeURIComponent(notice.id)}">
    <span><strong>${pinMark(notice)}${esc(notice.title)}</strong><time class="member-record-meta" datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time></span>
    <span class="member-record-arrow" aria-hidden="true">${icon('chevron-right', 18)}</span></a></li>`;
}

// heading: 'h1' where the list is the whole screen (일정, 공지), 'h2' among the cards of 홈.
function memberListCard(id, title, rows, empty, heading = 'h2') {
  return `<section class="public-share-card member-list" aria-labelledby="${id}"><div class="public-share-content">
    <${heading} id="${id}"${heading === 'h1' ? ' tabindex="-1"' : ''}>${title}</${heading}>${rows.length ? `<ul class="member-records">${rows.join('')}</ul>` : `<p class="public-form-note">${empty}</p>`}</div></section>`;
}

const noEvents = '게시된 일정이 없어요. 운영진이 일정을 올리면 여기에 보여요.';

// No event yet: the big card still holds its place, as the 운영 홈 does (DESIGN.md 4 회원 화면), with a line instead of 새 회차.
function noNextCard() {
  return `<article class="public-share-card member-next" aria-labelledby="member-next-title">
    <header class="public-story-head share-art--vote">${courtLines}<span class="public-share-type">다음 일정</span>
      <h2 id="member-next-title" class="public-title">예정된 회차가 없어요.</h2></header>
    <div class="public-share-content"><p class="member-answer">운영진이 일정을 올리면 여기에 보여요.</p></div></article>`;
}

// 회원 홈 (FLOW.md 4·5): the big card is the member's first event (memberOrder), the votes they still have to answer
// follow it as one bundle ("응답할 투표 n개"), then the rest in the same order. 내 기록 and the PIN 안내 have their own
// menu (ROLES.md 2단계); an organiser who has yet to set their number sees that first, as it opens the 운영 메뉴.
export function homeScreen({ events, notices }, club, user = null) {
  const [next, ...others] = memberOrder(events, koreanNow());
  const waiting = others.filter(awaitingVote);
  const later = others.filter(event => !awaitingVote(event));
  const signedIn = Boolean(user);
  const first = next ? nextEventCard(next, signedIn) : noNextCard();
  return memberPage(`<h1 class="sr-only" tabindex="-1">${esc(club.name)} 모임 홈</h1>${user?.organizer ? pinCard(user) : ''}${first}
    ${waiting.length ? memberListCard('member-waiting', `응답할 투표 ${waiting.length}개`, waiting.map(event => memberEventRow(event, signedIn)), '') : ''}
    ${later.length ? memberListCard('member-events', '이후 일정', later.map(event => memberEventRow(event, signedIn)), '') : ''}
    ${memberListCard('member-notices', '공지', notices.map(memberNoticeRow), '게시된 공지가 없어요.')}${signedIn ? '' : signInCard}`);
}

// 일정 달력 (calendar.mjs): every event on its date; the past, the finished and the cancelled ones quiet.
function calendarEvents(events, now) {
  return events.map(event => ({ date: event.date, title: event.title, kind: eventKindLabels[event.kind] ?? eventKindLabels.regular,
    regular: (event.kind ?? 'regular') === 'regular', done: event.date < now.day || finished(event, now) }));
}

// 일정 (회원): the month's calendar above every published upcoming event in the member order (FLOW.md 4); each opens its
// vote. month: the calendar's 'YYYY-MM', this month when none was picked.
export function memberEventsScreen({ events }, user = null, month = null) {
  const now = koreanNow();
  const rows = memberOrder(events, now).map(event => memberEventRow(event, Boolean(user)));
  const calendar = calendarBlock(calendarEvents(events, now), { month: month ?? now.day.slice(0, 7), today: now.day, icon });
  return memberPage(`<section class="public-share-card member-list" aria-labelledby="member-events"><div class="public-share-content">
    <h1 id="member-events" tabindex="-1">일정</h1>${calendar}${rows.length ? `<ul class="member-records">${rows.join('')}</ul>` : `<p class="public-form-note">${noEvents}</p>`}</div></section>`);
}

export function memberNoticesScreen({ notices }) {
  return memberPage(memberListCard('member-notices', '공지', notices.map(memberNoticeRow), '게시된 공지가 없어요.', 'h1'));
}

// 내 기록: the record, then the PIN 안내 for a birthday or temporary sign-in; before sign-in what signing in adds.
export function memberRecordScreen({ record }, user = null) {
  if (!user) return memberPage(`<h1 class="sr-only" tabindex="-1">내 기록</h1>${signInCard}`);
  return memberPage(recordCard(record) + pinCard(user));
}

// browse: a member page asked for sign-in (worker/public/app.mjs sign-in), so 로그인 없이 보기 goes back to it.
export function loginScreen(club, name, numberStep, browse = false) {
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
    ${browse ? `<p class="login-browse">${button('로그인 없이 보기', 'sign-in-cancel', { css: 'text small' })}</p>` : ''}
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

/* The shell: the demo's operations shell and dashboard (styles.css), for everyone since ROLES.md 2단계. */

// The same frame and menu names for everyone; the 운영 권한 adds menus (ROLES.md 권한 표). The first four are the
// phone's tab bar.
const organizerSections = [
  ['home', '홈', 'home'], ['event', '일정', 'calendar'], ['notices', '공지', 'megaphone'],
  ['members', '회원 관리', 'users'], ['progress', '반기 집계', 'chart'], ['rules', '모임 규칙', 'sliders'], ['record', '내 기록', 'user'],
];
const memberSections = [['home', '홈', 'home'], ['event', '일정', 'calendar'], ['notices', '공지', 'megaphone'], ['record', '내 기록', 'user']];

// The 운영 메뉴 open with the 운영 권한 and the member's own number (ROLES.md 계정·데이터); the API refuses them otherwise.
export function operating(user) {
  return Boolean(user?.organizer && !user.mustChange);
}

export function appSections(user) {
  return operating(user) ? organizerSections : memberSections;
}

// 카톡 공유 (운영 화면): the chat preview members will see, read from the share page's own tags (app.mjs
// openSharePreview), then the link to paste. The same parts as the demo's share dialog (share.js renderShare).
export function sharePreview(link, preview) {
  const chat = preview ? `<div class="share-chat"><div class="share-chat-head"><strong>카카오톡 미리보기</strong><span>단체방에 이렇게 보여요</span></div>
      <div class="share-chat-thread"><img class="share-brand-mark" width="35" height="35" src="/assets/shuttlecock-icon-96.png" alt="">
        <div class="share-chat-message">${preview.image ? `<img class="share-chat-image" src="${esc(preview.image)}" width="1200" height="630" alt="${esc(preview.alt)}">` : ''}
          <div class="share-chat-caption"><strong>${esc(preview.title)}</strong><span>${esc(preview.description)}</span><small>${esc(new URL(link).host)}</small></div></div></div></div>`
    : '<p class="form-note">미리보기를 불러오지 못했어요. 링크는 그대로 복사할 수 있어요.</p>';
  return `<div class="share-preview">${chat}
    <label class="share-link-field"><span>단체방에 붙여 넣을 링크</span><input type="text" value="${esc(link)}" readonly></label>
    <div class="share-dialog-actions"><a class="share-button share-button--secondary" href="${esc(link)}" target="_blank" rel="noopener">링크 열기</a>
      <button type="button" class="share-button share-button--primary" data-action="copy-share-link" data-id="${esc(link)}">링크 복사</button></div></div>`;
}

export function brand(club) {
  return `<a class="brand" href="${esc(club.home)}"><img class="brand-mark" width="43" height="43" src="/assets/shuttlecock-icon-96.png" alt="">
    <span><strong>${esc(club.name)}</strong>${club.subtitle ? `<small>${esc(club.subtitle)}</small>` : ''}</span></a>`;
}

export function adminMenu(section, user) {
  return `<nav class="navigation" aria-label="모임 메뉴"><div class="nav-heading">${operating(user) ? '모임 운영' : '모임'}</div>
    ${appSections(user).map(([name, title, glyph]) => `<button type="button" class="nav-link${section === name ? ' active' : ''}" data-action="tab" data-id="${name}"${section === name ? ' aria-current="page"' : ''}>${icon(glyph, 19)}<span>${title}</span>${section === name ? '<i aria-hidden="true"></i>' : ''}</button>`).join('')}
  </nav>`;
}

// Phones: a floating bar of four icons follows the screen; the full menu opens from the top bar (DESIGN.md 4).
// The lime mark sits under the current one of the four (DESIGN.md 6 하단 메뉴); app.mjs slides it from the last one.
// data-current places it (styles.css): the live CSP (style-src 'self') drops style attributes written in markup.
function adminTabBar(section, user) {
  const current = appSections(user).slice(0, 4).findIndex(([name]) => name === section);
  return `<nav class="tab-bar" aria-label="바로가기"${current < 0 ? '' : ` data-current="${current}"`}>
    ${current < 0 ? '' : '<span class="tab-bar-mark" aria-hidden="true"></span>'}${appSections(user).slice(0, 4).map(([name, title, glyph]) => `<button type="button" class="tab-bar-link" data-action="tab" data-id="${name}" title="${title}"${section === name ? ' aria-current="page"' : ''}>${icon(glyph, 23)}<span class="sr-only">${title}</span></button>`).join('')}
  </nav>`;
}

// Signed in: 번호 바꾸기 and 로그아웃 (in the ☰ menu on a phone). Before sign-in: 로그인, on every width.
export function accountActions(user, css = '') {
  return user ? button(`${icon('lock', 17)} 번호 바꾸기`, 'pin', { css: `text small ${css}`.trim() }) + button(`${icon('logout', 17)} 로그아웃`, 'logout', { css: `text small ${css}`.trim() })
    : button('로그인', 'sign-in', { css: 'text small' });
}

export function adminShell(section, contents, club, user) {
  const sections = appSections(user);
  const title = sections.find(([name]) => name === section)?.[1] ?? sections[0][1];
  const role = operating(user) ? '운영진' : user ? '회원' : '보기만 할 수 있어요';
  return `<div class="admin-app">
    <aside class="sidebar">${brand(club)}${adminMenu(section, user)}
      <div class="sidebar-footer"><span class="operator-mark">${icon('user', 18)}</span><span><strong>${user ? esc(user.name) : '로그인 전'}</strong><small>${role}</small></span></div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <span class="breadcrumb-parent">${esc(club.name)}</span><span class="breadcrumb-divider">/</span><strong>${title}</strong>
        </div>
        <div class="topbar-actions">${accountActions(user, 'topbar-logout')}
          <button type="button" class="icon-button topbar-menu" data-action="admin-menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="dialog">${menuIcon}</button></div>
      </header>
      <main class="main-content admin-content" id="main-content" tabindex="-1">${contents}</main>
      ${adminTabBar(section, user)}
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

function featured(detail) {
  const event = detail?.event;
  if (!event) {
    return `<section class="featured" aria-labelledby="next-event-title"><div class="featured-content">
      <div class="featured-kicker"><i></i> 다음 일정</div><h2 id="next-event-title">예정된 회차가 없어요.</h2>
      <div class="featured-actions">${button(`${icon('plus', 17)} 새 회차`, 'new-event', { css: 'lime' })}</div></div></section>`;
  }
  const stage = sessionStage(detail);
  const go = stage === 2 ? '당일 출석 체크' : stage >= 3 ? '마무리하기' : '회차 관리';
  // The big card holds the first of the 진행 중인 일정 (FLOW.md), so it says which it is.
  const kicker = stage === 2 ? '오늘 일정' : stage === 3 ? '마무리할 일정' : '다음 일정';
  return `<section class="featured" aria-labelledby="next-event-title"><div class="featured-content">
    <div class="featured-kicker"><i></i> ${kicker}${pinMark(event)}</div>
    <h2 id="next-event-title">${esc(event.title)}</h2>
    <div class="featured-meta"><span>${icon('calendar', 18)} <time datetime="${esc(`${event.date}T${event.time}`)}">${esc(fullDate(event.date))} · ${esc(event.time)}–${esc(event.endTime)}</time></span>
      <span>${icon('pin', 18)} ${esc(event.place)}</span></div>
    <div class="featured-actions">${button(`${go} ${icon('chevron-right', 17)}`, 'open-event', { id: event.id, css: 'lime', tab: stageTabs[stage] })}</div>
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
      <span ${hidden}>${button(`${icon('share', 16)} 카톡 공유`, 'copy-vote', { id: event.id, css: 'secondary small' })}</span></div></section>`;
}

function metric(section, glyph, tone, label, value, unit) {
  return `<button type="button" class="panel metric" data-action="tab" data-id="${section}"><span class="metric-icon ${tone}">${icon(glyph, 21)}</span>
    <div><span class="metric-label">${label}</span><div class="metric-value">${value}<small>${unit}</small></div></div>${icon('chevron-right', 16)}</button>`;
}

function todoRow(title, detail, action) {
  return `<li class="todo-row"><div><strong>${title}</strong><p>${detail}</p></div>${action}</li>`;
}

// 상단 고정 (FLOW.md 5): a push pin by the title wherever a pinned event or notice shows; pinning itself is on the
// 회차 화면 and the 공지 list, so the 운영 홈 rows keep one action each.
function pinMark(item) {
  return item?.pinnedAt ? `<span class="pin-mark" title="상단 고정">${icon('pushpin', 15)}<span class="sr-only">상단 고정</span></span>` : '';
}

// 일정 종류 in a line of facts: only the ones other than the usual 정기, and not when the title already says it
// ("수요 번개").
function kindPrefix(event) {
  const label = eventKindLabels[event.kind];
  return label && event.kind !== 'regular' && !event.title.includes(label) ? `${label} · ` : '';
}

// 진행 중인 일정 (FLOW.md): every unfinished event but the one in the big card, in the 운영 홈 order (flow.mjs), each
// with its stage, its date first, and the one thing to do now. Redrawn with the vote counts.
const flowStages = {
  draft: ['준비', 'muted'], waiting: ['투표 대기', 'muted'], voting: ['투표 중', 'green'],
  closed: ['투표 마감', 'muted'], today: ['오늘', 'warm'], wrapup: ['마무리 전', 'warm'],
};

// What one unfinished event shows wherever it is listed (운영 홈 rows, the 일정 list): its stage, title and date
// first, then the one fact that matters now.
function flowFacts(event, now) {
  const stage = eventStage(event, now);
  const [word, tone] = flowStages[stage];
  const when = `${kindPrefix(event)}${dateLabel(event.date)} ${event.time}`;
  const late = Math.round((Date.parse(now.day) - Date.parse(event.date)) / 86400000);
  const detail = {
    draft: `${when} · 비공개예요. 공개해야 회원이 보고 투표할 수 있어요.`,
    waiting: `${when} · 투표가 닫혀 있어요. 열어야 회원이 응답할 수 있어요.`,
    voting: `${when} · ${deadlineLabel(event.deadline)} 마감 · 미응답 ${event.waiting}명`,
    closed: `${when} · 미응답 ${event.waiting}명`,
    today: `${when} · 출석과 게스트 도착을 체크해 주세요.`,
    wrapup: `${when} · ${late}일 지났어요`,
  }[stage];
  return { stage, title: `${pill(word, tone)} ${pinMark(event)}${esc(event.title)}`, detail: esc(detail) };
}

function flowRow(event, now) {
  const { stage, title, detail } = flowFacts(event, now);
  // The title and the date name the button, as weekly events often share a title.
  const named = label => `${event.title} ${dateLabel(event.date)} ${label}`;
  const go = (label, tab) => button(label, 'open-event', { id: event.id, css: 'secondary small', tab, label: named(label) });
  const action = {
    draft: () => go('회차 보기', 'poll'),
    waiting: () => go('회차 보기', 'poll'),
    voting: () => button(`${icon('share', 16)} 카톡 공유`, 'copy-vote', { id: event.id, css: 'secondary small', label: named('카톡 공유') }),
    closed: () => go('명단 확인', 'poll'),
    today: () => go('출석 체크', 'attendance'),
    wrapup: () => go('마무리하기', 'settlement'),
  }[stage]();
  return todoRow(title, detail, action);
}

export function homeFlows(events, featuredId, now = koreanNow()) {
  const rows = flowOrder(events, now).filter(event => event.id !== featuredId).map(event => flowRow(event, now));
  if (events.length && !events.some(event => event.date >= now.day)) {
    const latest = [...events].sort((a, b) => b.date.localeCompare(a.date))[0];
    rows.push(todoRow('예정된 회차가 없어요', '지난 회차를 복제해 다음 주 회차를 만들 수 있어요.',
      button('다음 주 회차 만들기', 'clone-event', { id: latest.id, css: 'secondary small' })));
  }
  return `<section class="panel todo-panel" aria-labelledby="home-todo-title"><header class="dashboard-panel-head"><h2 id="home-todo-title">진행 중인 일정</h2></header>
    ${rows.length ? `<ul class="todo-list">${rows.join('')}</ul>` : `<p class="muted todo-empty">${featuredId ? '다른 진행 중인 일정이 없어요.' : '지금 챙길 일이 없어요.'}</p>`}</section>`;
}

// 마무리한 회차: the latest event whose 마무리 is confirmed (unfinished ones are among the 진행 중인 일정), with its
// counts and the 마무리 글 to paste into the group chat.
function lastPanel(last) {
  let body = '<p class="muted">아직 마무리한 회차가 없어요.</p>';
  if (last?.failed) body = '<p class="muted">마무리한 회차를 불러오지 못했어요. 잠시 뒤 운영 홈을 다시 열어 주세요.</p>';
  else if (last) {
    const { event, roster, guests } = last;
    const c = countEvent(roster, guests);
    const skipped = roster.filter(row => (row.slot === 'early' || row.slot === 'late') && row.present === false).length;
    body = `<div class="last-session"><div><strong>${esc(event.title)}</strong><p>${esc(dateLabel(event.date))} · ${esc(event.place)}</p></div>${pill('마무리 완료', 'green')}</div>
      ${summary([['출석', `${c.members}명`, 'green'], ['게스트 도착', `${c.guests}명`], ['응답 후 불참', `${skipped}명`]])}
      <div class="last-session-action">${button(`${icon('clipboard', 16)} 마무리 글 복사`, 'copy-last-report', { css: 'secondary small' })}</div>`;
  }
  return `<section class="panel last-panel" aria-labelledby="home-last-title"><header class="dashboard-panel-head"><h2 id="home-last-title">마무리한 회차</h2></header>${body}</section>`;
}

// The heading says how many events are under way, so a phone that shows only the big card at first still tells
// there are more below (the list starts under the 참석 투표 panel).
function flowSummary(events) {
  const now = koreanNow();
  const flows = flowOrder(events, now);
  const wrapups = flows.filter(event => eventStage(event, now) === 'wrapup').length;
  return flows.length ? `진행 중인 일정 ${flows.length}개${wrapups ? ` · 마무리 전 ${wrapups}개` : ''}` : '진행 중인 일정이 없어요.';
}

// 응답할 투표 (ROLES.md 결정 5): organisers vote as members, so the votes they have not answered come first on the 홈.
// listing is their own member listing (worker/api.mjs listPublic); each row opens the 일정 상세 at 내 응답.
function myVotesPanel(listing) {
  const waiting = memberOrder(listing?.events ?? [], koreanNow()).filter(awaitingVote);
  if (!waiting.length) return '';
  const rows = waiting.map(event => `<li><button type="button" class="event-link" data-action="open-event" data-id="${esc(event.id)}" data-tab="poll"><span><strong>${pinMark(event)}${esc(event.title)}</strong>
    <small>${esc(`${kindPrefix(event)}${dateLine(event)} · ${deadlineLabel(event.deadline)} 마감`)}</small></span>${icon('chevron-right', 18)}</button></li>`);
  return `<div class="my-votes">${panel(`응답할 투표 ${waiting.length}개`, `<ul class="event-list">${rows.join('')}</ul>`, { subtitle: '운영진도 회원으로 투표해요.' })}</div>`;
}

export function adminHome({ events, members, notices }, upcoming, last = null, listing = null) {
  const month = today().slice(0, 7);
  const recent = notices.slice(0, 3).map(notice => `<div class="home-notice-row">
    <button type="button" class="notice-home-link" data-action="edit-notice" data-id="${esc(notice.id)}">${notice.published ? '' : '<span class="notice-tag">비공개</span>'}${pinMark(notice)}<span>${esc(notice.title)}</span></button>
    <time datetime="${esc(notice.date)}">${esc(shortDate(notice.date))}</time>
    ${notice.published ? `<button type="button" class="icon-button notice-share" data-action="copy-notice" data-id="${esc(notice.id)}" aria-label="${esc(notice.title)} 카톡 공유" title="카톡 공유">${icon('share', 17)}</button>` : ''}
  </div>`);
  return `<div class="dashboard">
    <header class="dashboard-heading">
      <div><h1 tabindex="-1">운영 홈</h1><p>${esc(flowSummary(events))}</p></div>
      <div class="heading-actions"><span class="today-label">${icon('calendar', 17)}${esc(fullDate(today()))}</span>${button(icon('plus', 22), 'new-event', { css: 'btn-icon', label: '새 회차' })}</div>
    </header>
    ${myVotesPanel(listing)}
    <div class="dashboard-grid">${featured(upcoming)}${pollPanel(upcoming)}</div>
    <div class="dashboard-grid dashboard-bottom">${homeFlows(events, upcoming?.event.id)}${lastPanel(last)}</div>
    <div class="dashboard-metrics" aria-label="모임 현황">
      ${metric('members', 'users', 'mint', '활동 회원', members.filter(member => member.active).length, '명')}
      ${metric('event', 'calendar', 'sand', `${Number(month.slice(5))}월 회차`, events.filter(event => event.date.startsWith(month) && !event.cancelled).length, '회')}
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
  if (includeAttendance) items.push(['실제 출석', `${counts.members + counts.guests}명`]);
  return summary(items);
}

// One labelled group of a form (.form-group): a small heading and space, no box (DESIGN.md 5 폼).
function formGroup(legend, body) {
  return `<fieldset class="form-group"><legend>${legend}</legend>${body}</fieldset>`;
}

// Three groups instead of ten fields in a row (DESIGN.md 6 UX 점검표 16 밀러): what and where, when, what members see.
export function eventForm(event, id = '') {
  const time = { type: 'time', attrs: 'required' };
  return form('event',
    (!id ? note('일시, 장소와 마감 시각을 확인해 주세요. 새 회차는 준비 상태로 저장할 수 있어요.') : '')
    + formGroup('무엇을, 어디서', `<div class="form-grid">
      ${field('모임 이름', 'title', event.title, { attrs: 'required maxlength="120"' })}
      ${select('종류', 'kind', Object.entries(eventKindLabels), event.kind ?? 'regular')}
      ${field('장소', 'place', event.place, { wide: true, attrs: 'required maxlength="120"' })}
    </div>`)
    + formGroup('언제', `<div class="form-grid">
      ${field('날짜', 'date', event.date, { type: 'date', wide: true, attrs: 'required' })}
      ${field('시작 시간', 'time', event.time, time)}
      ${field('종료 시간', 'endTime', event.endTime, time)}
      ${field('선발 모임', 'earlyTime', event.earlyTime, time)}
      ${field('후발 모임', 'lateTime', event.lateTime, time)}
      ${field('투표 마감 (한국 시간)', 'deadline', event.deadline, { type: 'datetime-local', wide: true, attrs: 'required' })}
    </div>`)
    + formGroup('회원에게 보이기', `<div class="form-grid">
      ${textarea('공개 안내', 'notes', event.notes, 'maxlength="3000" placeholder="날짜별 준비물이나 안내를 적어 주세요."')}
    </div>`
      + note('로그인한 회원에게 표시되는 안내입니다. 개인 연락처와 회원 명단은 별도로 전달해 주세요.')
      + check('카톡 공유 링크 공개', 'published', event.published)
      + check('웹 투표 열기', 'open', event.open)),
    id ? '회차 저장' : '회차 만들기', id);
}

const sessionTabs = [['poll', '참석 투표'], ['attendance', '당일 출석'], ['settlement', '마무리']];

// One event in the 일정 list: the whole row opens its detail (FLOW.md 5 운영 일정 화면).
function eventLink(event, title, detail) {
  return `<li data-date="${esc(event.date)}"><button type="button" class="event-link" data-action="open-event" data-id="${esc(event.id)}"><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron-right', 18)}</button></li>`;
}

// 일정 (#event): the month's calendar, then every unfinished event in the 운영 홈 order, then the finished ones (마무리
// 확정 or 취소) folded under 끝난 일정, the latest first.
function eventList(events, month) {
  const now = koreanNow();
  const calendar = `<section class="panel calendar-panel" aria-labelledby="calendar-title"><div class="panel-body">${calendarBlock(calendarEvents(events, now),
    { month: month ?? now.day.slice(0, 7), today: now.day, icon })}</div></section>`;
  const flows = flowOrder(events, now);
  const past = events.filter(event => finished(event, now))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const rows = flows.map(event => {
    const { title, detail } = flowFacts(event, now);
    return eventLink(event, title, detail);
  });
  const pastRows = past.map(event => eventLink(event, `${event.cancelled ? pill('취소', 'muted') : pill('마무리 완료', 'green')} ${esc(event.title)}`,
    esc(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${event.place}`)));
  return calendar + panel('진행 중인 일정', (rows.length ? `<ul class="event-list">${rows.join('')}</ul>`
    : '<p class="empty-state">진행 중인 일정이 없어요. 새 회차를 만들어 투표를 시작하세요.</p>')
    + (pastRows.length ? `<details class="event-past"><summary>끝난 일정 ${pastRows.length}개${icon('chevron-right', 16)}</summary><ul class="event-list">${pastRows.join('')}</ul></details>` : ''));
}

// own: the organiser's own answer ({ vote, eligible, saved }); 내 응답 shows when they are on the roster or answered.
// month: the list's calendar month (calendar.mjs).
export function eventScreen(events, detail, tab = null, own = null, month = null) {
  const event = detail?.event;
  const actions = button(icon('plus', 22), 'new-event', { css: 'btn-icon', label: '새 회차' });
  const head = pageHead('일정', event ? '투표 응답, 당일 출석, 마무리를 기록하세요.' : '일정을 골라 투표 응답, 당일 출석, 마무리를 기록하세요.', actions);
  if (!event) {
    return `<div class="secondary-page">${head}${events.length ? eventList(events, month)
      : panel('회차', '<p class="empty-state">회차를 만들면 참석 투표와 당일 체크를 시작할 수 있어요.</p>')}</div>`;
  }
  const { roster, guests, settlement } = detail;
  const counts = countEvent(roster, guests);
  // A cancelled event says so with the way back in sight; 일정 취소 itself is in the 회차 메뉴 (eventMenu).
  const cancelled = event.cancelled && !settlement?.confirmed
    ? `<div class="event-cancelled"><p><strong>취소한 일정이에요.</strong> 회원에게 "취소됐어요"로 보이고, 받은 응답은 그대로 있어요.</p>${button('취소 풀기', 'restore-event', { id: event.id, css: 'secondary small' })}</div>` : '';
  const back = `<div class="back-link">${button(`${icon('arrow-left', 17)} 일정 목록`, 'event-list', { css: 'text small' })}</div>`;
  // 더보기 (DESIGN.md 6 UX 점검표 15 힉): the rarely used actions of a session wait in one menu by the title, so the screen
  // shows the steps, 카톡 공유 and what the step needs. A pinned event keeps its mark by the title.
  const more = button(icon('more', 22), 'event-menu', { id: event.id, css: 'btn-icon secondary event-more', label: `${event.title} 회차 메뉴` });
  const overview = `<section class="panel event-overview" aria-labelledby="admin-event-title"><div class="panel-body">
    <div class="event-overview-title"><h2 id="admin-event-title">${pinMark(event)}${esc(event.title)}</h2>${event.cancelled ? pill('취소', 'muted') : pill(event.published ? '공개 중' : '비공개 준비', event.published ? 'green' : 'muted')}${more}</div>
    <div class="event-facts"><span>${icon('calendar', 18)}${esc(kindPrefix(event))}${esc(dateLabel(event.date))}</span><span>${icon('clock', 18)}${esc(event.time)}–${esc(event.endTime)}</span>
      <span>${icon('pin', 18)}${esc(event.place)}</span></div>
    ${cancelled}
  </div></section>`;
  const voteActions = button(`${icon('share', 16)} 카톡 공유`, 'copy-vote', { css: 'primary small', disabled: !event.published });
  const vote = panel('웹 참석 투표', `<div id="vote-counts">${voteMetrics(counts)}</div>
    ${!event.canVote && deadlinePassed(event) && (event.open || event.date >= today()) ? '<p class="form-note">투표 마감 시각이 지났습니다. 다시 받으려면 마감 시각을 먼저 변경해 주세요.</p>' : ''}`,
  { subtitle: `${esc(deadlineLabel(event.deadline))} 마감`, actions: voteActions });
  // The three steps of a session are tabs, as in the demo (screens.js eventDetail), so the gym check-in is one tap away.
  const current = tab ?? defaultTab(event);
  const nav = `<nav class="tabs" aria-label="회차 단계">${sessionTabs.map(([name, label]) => `<button type="button" data-action="event-tab" data-id="${name}"${name === current ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
  const guestList = guestsPanel(guests, settlement?.confirmed);
  // 내 응답 (ROLES.md 2단계): first while the vote is open, so saving an answer does not move it away; after the counts
  // once the vote is closed.
  const mine = own && (own.eligible || own.vote)
    ? panel('내 응답', voteResponse(event, own.vote, own.eligible, own.saved, true), { subtitle: '운영진도 회원으로 투표해요.', id: 'my-vote' }) : '';
  const poll = mine && event.canVote ? mine + vote : vote + mine;
  const content = current === 'attendance' ? attendancePanel(event, roster, counts, settlement?.confirmed) + guestList
    : current === 'settlement' ? settlementPanel(settlement, counts) : poll + guestList;
  return `<div class="secondary-page">${back}${head}${overview}${nav}${content}</div>`;
}

// 회차 메뉴 (eventScreen 더보기): the session's rarely used actions, the same ones and rules as before they moved here.
export function eventMenu({ event, settlement }) {
  const open = !settlement?.confirmed && !event.cancelled;
  return `<div class="menu-actions action-menu">${[
    button(`${icon('edit', 17)} 회차 수정`, 'edit-event', { css: 'secondary' }),
    button(event.published ? '공개 내리기' : '링크 공개', 'publish-event', { css: 'secondary' }),
    // Opening a vote whose deadline has passed would say "열었어요" while members still cannot answer, so it waits for a new deadline.
    button(event.open ? '투표 닫기' : '투표 열기', 'toggle-vote', { css: 'secondary', disabled: !event.published || event.cancelled || (!event.open && deadlinePassed(event)) }),
    // 상단 고정 (FLOW.md 5): a confirmed 마무리 or a cancelled event has left the flow.
    open ? button(`${icon('pushpin', 16)} ${event.pinnedAt ? '고정 해제' : '상단 고정'}`, 'pin-event', { id: event.id, css: 'secondary' }) : '',
    button('다음 주 복제', 'clone-event', { css: 'secondary' }),
    // 일정 취소 (FLOW.md 10): asked once more in its own dialog.
    open ? button('일정 취소', 'cancel-event', { id: event.id, css: 'text' }) : '',
  ].join('')}</div>`;
}

// 공지 메뉴 (noticesScreen 더보기): 공지 수정 and 상단 고정 of one notice.
export function noticeMenu(notice) {
  return `<div class="menu-actions action-menu">${button(`${icon('edit', 17)} 공지 수정`, 'edit-notice', { id: notice.id, css: 'secondary' })}
    ${button(`${icon('pushpin', 16)} ${notice.pinnedAt ? '고정 해제' : '상단 고정'}`, 'pin-notice', { id: notice.id, css: 'secondary' })}</div>`;
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

// kinds: the 인정 방식 this club counts (모임 규칙); a kind already recorded stays listed so saving keeps it.
export function attendanceForm(person, kinds) {
  const shown = Object.entries(recognitionLabel).filter(([kind]) => kinds.includes(kind) || kind === person.recognition);
  return form('attendance', note('대타 인정은 당일 출석도 함께 체크해 주세요. 별도 승인 사유와 증빙은 이 화면에 기록하지 않습니다.')
    + `<div class="form-grid">${select('실제 출석', 'present', [['', '미확인'], ['true', '출석'], ['false', '불참 확인']], person.present)}
      ${select('줄서기 인정', 'recognition', [['', '해당 없음'], ...shown], person.recognition)}</div>`, '기록 저장', person.id);
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
    <td>${self ? pill('나', 'green') : pill(organizer.mustChange ? '자기 번호 정하기 전' : '사용 중', organizer.mustChange ? 'warm' : 'green')}</td>
    <td class="table-actions">${self ? '<small>메뉴의 번호 바꾸기</small>'
      : button('번호 재발급', 'reset-organizer', { id: organizer.id, css: 'text small', label: `${organizer.name} 번호 재발급` })
        + button('해지', 'remove-organizer', { id: organizer.id, css: 'text small', label: `${organizer.name} 해지` })}</td>
  </tr>`;
  });
  return panel('운영진', table(['이름', '상태', '<span class="sr-only">운영진 관리</span>'], rows, '운영진이 없습니다.', 'stack-table'), {
    subtitle: '운영 메뉴를 쓰는 사람이에요. 회원 명단에서 고르거나, 명단에 없으면 새로 추가해요.',
    actions: button('운영진 추가', 'new-organizer', { css: 'secondary small' }),
  });
}

// 운영진 추가 (ROLES.md 2단계): someone on the 회원 명단 (candidates: active, without the 운영 권한) keeps their account
// and number; only someone not on it is added by name with a temporary number.
export function organizerForm(candidates = []) {
  const issue = form('organizer', `<div class="form-grid">${field(candidates.length ? '명단에 없는 사람의 성함' : '성함', 'name', '', {
    wide: true, attrs: 'maxlength="60" autocomplete="off" required', help: '새 계정을 만들어요. 이 성함과 임시 번호로 처음 로그인해요.',
  })}</div>`, '임시 번호 발급');
  if (!candidates.length) return issue;
  return form('organizer-grant', `<div class="form-grid">${select('회원 명단에서', 'member',
    [['', '회원을 고르세요'], ...candidates.map(member => [member.id, member.name])], '', 'required')}</div>`
    + note('지금 쓰는 계정과 번호 그대로 운영 메뉴가 열려요. 생년월일로 로그인하는 회원은 자기 번호를 정한 뒤에 열려요.'), '운영 권한 켜기')
    + issue;
}

export function membersScreen(members, organizers = [], me = null) {
  const active = members.filter(member => member.active).length;
  const organizerIds = new Set(organizers.map(organizer => organizer.id));
  const rows = members.map(member => `<tr data-search="${esc(member.name)}">
    <td><div class="member-name">${avatar(member.name)}<strong>${esc(member.name)}</strong></div></td>
    <td>${pill(member.active ? '활동 중' : '비활성', member.active ? 'green' : 'muted')}${organizerIds.has(member.id) ? ` ${pill('운영진', 'green')}` : ''}</td>
    <td class="table-actions">${button(icon('edit'), 'edit-member', { id: member.id, css: 'secondary btn-icon', label: `${member.name} 회원 수정` })}</td>
  </tr>`);
  return `<div class="secondary-page">${pageHead('회원 관리', '회원은 등록한 이름과 생년월일 6자리로 처음 로그인합니다.', button(icon('plus', 22), 'new-member', { css: 'btn-icon', label: '회원 추가' }))}
    ${panel('회원 명단', table(['이름', '상태', '<span class="sr-only">회원 관리</span>'], rows, '등록된 회원이 없습니다.', 'stack-table member-table'), {
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

// 접속 재설정 under 회원 수정, apart from 회원 저장: what it does as worker/api.mjs resetMember does it (a new temporary
// number shown once, the old number and every sign-in ended, records kept, no undo). It still asks once more
// (app.mjs reset-member). The demo's 회원 수정 (screens.js memberDialog) has the same section.
export function memberAccess(member) {
  return `<section class="member-access" aria-labelledby="member-access-title"><h3 id="member-access-title">접속 재설정</h3>
    <dl class="member-access-facts">
      <div><dt>언제 쓰나요</dt><dd>번호를 잊었거나 휴대폰을 잃어버렸을 때, 같은 이름·번호가 겹쳐 로그인이 안 될 때</dd></div>
      <div><dt>누르면</dt><dd>새 임시 번호 6자리가 한 번만 보여요. 쓰던 번호(생년월일이나 PIN)는 바로 막히고, 모든 휴대폰의 로그인이 끊겨요. 투표·출석 기록은 그대로예요.</dd></div>
      <div><dt>그 뒤 회원은</dt><dd>성함과 임시 번호로 다시 로그인해요. 원하면 내 기록에서 나만 아는 PIN으로 바꾸고, 운영 권한이 있으면 자기 번호를 정해야 운영 메뉴가 열려요.</dd></div>
      <div><dt>되돌리기</dt><dd>할 수 없어요. 예전 번호는 다시 살릴 수 없고, 임시 번호를 놓치면 다시 재설정해요.</dd></div>
    </dl>
    ${button('접속 재설정', 'reset-member', { id: member.id, css: 'secondary', disabled: !member.active, label: `${member.name} 접속 재설정` })}
    ${member.active ? '' : note('활동 중지한 회원은 재설정할 수 없어요. 활동 회원으로 저장한 뒤에 할 수 있어요.')}</section>`;
}

export function noticeForm(notice = null) {
  return form('notice', `<div class="form-grid">${field('제목', 'title', notice?.title, { wide: true, attrs: 'required maxlength="120"' })}
    ${textarea('공지 내용', 'body', notice?.body, 'required maxlength="4000" rows="6"')}</div>`
    + note('공개한 공지는 로그인한 회원이 볼 수 있습니다. 계좌번호와 개인 정보는 공지에서 빼 주세요.')
    + check('링크 공개', 'published', notice?.published), '공지 저장', notice?.id);
}

export function noticesScreen(notices) {
  const items = notices.map(notice => `<article class="notice-item">
    <div class="notice-date"><time datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time>${pill(notice.published ? '공개' : '비공개', notice.published ? 'green' : 'muted')}${pinMark(notice)}</div>
    <h3>${esc(notice.title)}</h3>
    ${notice.body ? `<p class="preserve-lines">${esc(notice.body)}</p>` : ''}
    <div class="notice-actions">${button(`${icon('share', 17)} 카톡 공유`, 'copy-notice', { id: notice.id, css: 'secondary small', disabled: !notice.published })}
      ${button(icon('more', 20), 'notice-menu', { id: notice.id, css: 'btn-icon text', label: `${notice.title} 공지 메뉴` })}</div>
  </article>`);
  return `<div class="secondary-page">${pageHead('공지', '공개한 공지는 로그인한 회원이 볼 수 있어요.', button(icon('plus', 22), 'new-notice', { css: 'btn-icon', label: '새 공지' }))}
    ${panel('공지 목록', items.length ? `<div class="notice-list">${items.join('')}</div>` : '<p class="empty-state">등록된 공지가 없습니다.</p>')}</div>`;
}

// rules: the 모임 규칙 this table was counted under (worker/api.mjs progress): its 구간, goal and 콕 수령 대상.
// 모임 규칙: how this club counts 줄서기 인정 and shows 콕 수령 (worker/api.mjs readRules, saveRules). The defaults are
// how the app counted before a club could choose; 줄서기 인정 시각 and 출석 체크 방식 come with QR 체크인.
export function rulesScreen(rules) {
  const periods = [[1, '반기 통째로 (6개월)'], [2, '반기를 2구간 (3개월씩)'], [3, '반기를 3구간 (2개월씩)'], [6, '매달 (1개월씩)']];
  const kinds = Object.entries(recognitionLabel).map(([kind, label]) => `<label class="form-check"><input type="checkbox" name="kinds" value="${kind}"${rules.kinds.includes(kind) ? ' checked' : ''}><span>${label}</span></label>`);
  const eventKinds = Object.entries(eventKindLabels).map(([kind, label]) => `<label class="form-check"><input type="checkbox" name="eventKinds" value="${kind}"${rules.eventKinds.includes(kind) ? ' checked' : ''}><span>${label}</span></label>`);
  const rewards = [['manual', '운영진이 직접 체크해요'], ['goal', '모든 구간에서 목표를 채운 회원을 반기 집계에 "수령 대상"으로 표시해요']]
    .map(([value, label]) => `<label class="form-check"><input type="radio" name="reward" value="${value}"${rules.reward === value ? ' checked' : ''} required><span>${label}</span></label>`);
  const body = `<div class="form-grid">${select('집계 구간', 'periods', periods, rules.periods)}
      ${field('구간 목표 (회)', 'goal', rules.goal, { type: 'number', attrs: 'min="1" max="20" step="1" inputmode="numeric" required' })}</div>
    <fieldset class="rule-choices"><legend>세는 줄서기 인정</legend>${kinds.join('')}</fieldset>
    <fieldset class="rule-choices"><legend>세는 일정 종류</legend>${eventKinds.join('')}</fieldset>
    <fieldset class="rule-choices"><legend>콕 수령</legend>${rewards.join('')}</fieldset>
    ${note('바꾸면 반기 집계와 회원 내 기록(출석 포함)에 바로 반영돼요. 지난 출석 기록은 그대로 두고 세는 방법만 바뀌어요. 콕 수령 기록은 어느 쪽이든 운영진이 해요.')}`;
  return `<div class="secondary-page">${pageHead('모임 규칙', '줄서기 인정과 콕 수령을 우리 모임 방식대로 셉니다.')}
    ${panel('집계 기준', form('rules', body, '규칙 저장', '', 'rules-form'))}</div>`;
}

export function progressScreen(year, half, members, rules) {
  const months = periodMonths(Number(half), rules.periods);
  const reward = row => row.rewarded ? pill('수령', 'green') : row.eligible ? pill('수령 대상', 'warm') : pill('미수령', 'muted');
  // Every 구간 sits in one cell as a box, green once its goal is met, so a month-by-month club does not push the table
  // past a phone's edge (live.css .period-counts).
  const counts = periods => `<ul class="period-counts">${periods.map((count, index) => `<li${count >= rules.goal ? ' class="period-met"' : ''}><span>${months[index]}</span><strong>${count}<small>/${rules.goal}</small></strong></li>`).join('')}</ul>`;
  const rows = members.map(row => `<tr data-search="${esc(row.name)}"><td class="member-name"><strong>${esc(row.name)}</strong></td>
    <td class="progress-periods">${counts(row.periods)}</td><td>${reward(row)}</td>
    <td class="table-actions">${button(row.rewarded ? '수령 취소' : '수령 기록', 'reward', { id: row.id, css: row.rewarded ? 'text small' : 'secondary small', label: `${row.name} ${row.rewarded ? '수령 취소' : '수령 기록'}` })}</td></tr>`);
  const period = form('progress', `<div class="form-grid">${field('연도', 'year', year, { type: 'number', attrs: 'min="2000" max="2100" step="1" required' })}
    ${select('기간', 'half', [[1, '상반기'], [2, '하반기']], half)}</div>`, '집계 조회', '', 'progress-form');
  const columns = ['회원', `구간별 인정 (목표 ${rules.goal}회)`, '콕 수령', '<span class="sr-only">기록</span>'];
  return `<div class="secondary-page">${pageHead('반기 집계', `각 구간에서 줄서기 인정을 받은 횟수입니다. 구간 목표 ${rules.goal}회와 구간 나누기는 모임 규칙에서 바꿔요. 지급은 운영진이 확인한 뒤 기록해 주세요.`,
    button(`${icon('sliders', 17)} 모임 규칙`, 'tab', { id: 'rules', css: 'secondary small' }))}
    ${panel('조회 기간', period)}
    ${panel(`${esc(year)}년 ${Number(half) === 1 ? '상반기' : '하반기'} 줄서기 인정`, table(columns, rows, '해당 기간에 확인할 회원이 없습니다.', 'stack-table progress-table'), {
    actions: search('progress'),
  })}</div>`;
}
