import { shuttlecockMark } from './shuttlecock.mjs';
import { loadingCenter, shellSkeleton } from './skeleton.mjs';
import { awaitingVote, eventStage, finished, flowOrder, koreanNow, memberOrder } from './flow.mjs';
import { calendarBlock, calendarDayPanel, calendarPanel, calendarToggle } from './calendar.mjs';
import { genderChoices, memberNameTag } from './member-label.mjs';

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

export function eventDefaults(previous = null, defaultPlace = '', { keepFuture = false, onDate = null } = {}) {
  if (previous) {
    const weeks = keepFuture ? Math.max(1, Math.floor((Date.parse(today()) - Date.parse(previous.date)) / 604800000) + 1) : 1;
    const daysToAdd = weeks * 7;
    return {
      ...previous,
      date: addDays(previous.date, daysToAdd),
      deadline: `${addDays(previous.deadline.slice(0, 10), daysToAdd)}${previous.deadline.slice(10)}`,
      open: false,
      published: false,
      capacity: null,
    };
  }
  const base = today();
  const day = new Date(`${base}T00:00:00Z`).getUTCDay();
  const date = onDate ?? addDays(base, (7 - day) % 7);
  return {
    title: '', date, time: '10:00', endTime: '13:00',
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
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7m-7 7h15"/>',
  edit: '<path d="m14 5 5 5M4 20l4.5-1 12-12-3.5-3.5-12 12z"/>',
  megaphone: '<path d="m3 11 15-6v14L3 15v-4Zm3 5 2.5 5h3l-2-4m11-6 1-1m-1 5 1 1"/>',
  // 카톡 미리보기: a chat bubble, the same in the demo (app.js icons).
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

const tones = { primary: 'btn-primary', secondary: 'btn-secondary', quiet: 'btn-text', text: 'btn-text' };

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

// 박스 오른쪽 위 아이콘 (DESIGN.md 5 박스 동작): no border or fill at rest, a filled square on hover (.icon-button), the
// name in aria-label and title. pressed: a toggle that is on (상단 고정), drawn filled in --court.
export function iconAction(glyph, action, { id = '', label, pressed = null, disabled = false } = {}) {
  return `<button type="button" class="icon-button box-action" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''} aria-label="${esc(label)}" title="${esc(label)}"${pressed === null ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' disabled' : ''}>${icon(glyph, 20)}</button>`;
}

// The icons of one box at its top-right corner, 더보기 (점 세 개) last.
function boxActions(...actions) {
  return `<div class="box-actions">${actions.filter(Boolean).join('')}</div>`;
}

// A state said in words (단순화 7, DESIGN.md 5 상태 글자): plain, 'due' for the one to act on (--court, 600), 'quiet' for
// the usual state (--muted). No coloured chips.
function word(text, tone = '') {
  return `<span class="state-word${tone ? ` state-${tone}` : ''}">${esc(text)}</span>`;
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

// The head of a screen (단순화 5): the top bar already names it, so the h1 is for reading programs and focus; what shows
// is one quiet line (a count or what the screen is for) and one action.
function pageHead(title, description = '', actions = '') {
  return `<header class="list-tools"><h1 tabindex="-1" class="sr-only">${title}</h1><p>${description}</p>${actions}</header>`;
}

function panel(title, content, { subtitle = '', actions = '', id = '', titleId = '' } = {}) {
  return `<section class="panel"${id ? ` id="${id}"` : ''}><header class="panel-head"><div><h2${titleId ? ` id="${titleId}"` : ''}>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header><div class="panel-body">${content}</div></section>`;
}

function table(columns, rows, empty, css = '') {
  if (!rows.length) return `<p class="empty-state">${empty}</p>`;
  return `<div class="data-table-wrap"><table class="data-table${css ? ` ${css}` : ''}"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
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

// 선발, 후발, 불참 for members and for the organisers' 회원 응답 변경 alike (사용자 결정 2026-11-27).
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
// a bar per choice as a share of everyone coming (선발 + 후발); 불참 is said beside the total. The live CSP blocks style
// attributes, so each bar is an SVG sized by its viewBox, as the organisers' .poll-track is. The demo's share.js
// draws the same markup.
function countsBlock(counts, event) {
  if (!counts) return '';
  const coming = counts.early + counts.late;
  if (!coming && !counts.lunch && !counts.no && !counts.waiting) return '<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>아직 응답이 없어요</span></p></div>';
  const rows = [[voteLabel('early', event), counts.early, 'slot'], [voteLabel('late', event), counts.late, 'slot'], ['점심 함께', counts.lunch, 'lunch']];
  return `<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>참석 ${coming}명${counts.waiting ? ` · 대기 ${counts.waiting}명` : ''}${counts.no ? ` · 불참 ${counts.no}명` : ''}</span></p>
    <ul>${rows.map(([label, n, tone]) => `<li><span>${esc(label)}</span><strong>${n}명</strong><svg class="member-count-bar" viewBox="0 0 ${Math.max(coming, counts.lunch, 1)} 1" preserveAspectRatio="none" aria-hidden="true"><rect class="member-count-${tone}" width="${n}" height="1"/></svg></li>`).join('')}</ul>
    <p class="member-counts-note">누가 응답했는지는 보이지 않아요</p></div>`;
}

// 로그인 없이 보기 (사용자 결정, 2026-11-26): before sign-in (signedIn false) the place reads 로그인 후 보여요, there are no
// notes, and answering offers sign-in instead of the form.
function capacityInfo(event, counts = event.counts) {
  if (!event.capacity) return '';
  const confirmed = (counts?.early ?? 0) + (counts?.late ?? 0);
  return `정원 ${event.capacity}명${counts ? ` · 확정 ${confirmed}명${counts.waiting ? ` · 대기 ${counts.waiting}명` : ''}` : ''}`;
}

export function memberVoteScreen(event, vote, eligible, voteSaved = false, signedIn = true) {
  const facts = `<dl class="public-event-facts">
    <div><dt>일시</dt><dd>${esc(dateLabel(event.date))} <span class="nowrap">${esc(event.time)}–${esc(event.endTime)}</span></dd></div>
    <div><dt>장소</dt><dd>${placeText(event)}</dd></div>
    <div><dt>투표 마감</dt><dd>${esc(deadlineLabel(event.deadline))}</dd></div></dl>`;
  const notes = event.notes ? `<p class="public-share-body">${esc(event.notes)}</p>` : '';
  // The answer comes before the 응답 현황 (DESIGN.md 6 UX 점검표 13 피츠): on a phone the choices and 응답 저장 sit in the
  // first screen above the tab bar instead of below it.
  return memberPage(memberCard('vote', event.cancelled ? '취소된 일정' : '참석 투표', event.title, '', facts + notes
    + (capacityInfo(event) ? `<p class="public-form-note">${capacityInfo(event)}</p>` : '')
    + voteResponse(event, vote, eligible, voteSaved, signedIn) + countsBlock(event.counts, event)), { back: ['event', '일정'] });
}

// The answer part of a vote: the member's own form (or why there is none). The organisers' 일정 상세 shows the same
// part as 내 응답, since organisers vote as members (ROLES.md 2단계).
function voteResponse(event, vote, eligible, voteSaved = false, signedIn = true) {
  const status = vote?.waitingPosition ? ` · 대기 ${vote.waitingPosition}번` : event.capacity && vote?.slot !== 'no' ? ' · 참석 확정' : '';
  const current = vote ? `<p class="public-receipt" role="status">내 응답 <strong>${esc(voteLabel(vote.slot, event))}${vote.lunch ? ' · 점심 참여' : ''}${event.cancelled ? '' : status}</strong>${voteSaved ? ' <span class="member-confirmed">저장 완료</span>' : ''}</p>` : '';
  const closed = event.voteClosed || deadlinePassed(event);
  let response = `<div class="public-form">${current}<p class="public-status">${closed ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.'}</p>
    ${closed && !signedIn ? '<button class="share-button share-button--secondary" type="button" data-action="sign-in">로그인하고 내 응답 보기</button>' : ''}</div>`;
  if (event.cancelled) {
    response = `<div class="public-form">${current}<p class="public-status"><strong>이 일정은 취소됐어요.</strong>${event.notes ? '위 안내를 확인해 주세요.' : ''}</p></div>`;
  } else if (event.canVote && !signedIn) {
    response = `<div class="public-form"><p class="public-status"><strong>투표하려면 로그인해 주세요.</strong>성함과 6자리로 한 번 로그인하면 이 휴대폰에서 계속 바로 투표할 수 있어요.</p>
      <button class="share-button share-button--primary" type="button" data-action="sign-in">로그인하고 투표하기</button></div>`;
  } else if (event.canVote && eligible) {
    response = `<form class="public-form" data-form="vote" data-id="${esc(event.id)}">${current}
      ${event.capacity ? '<p class="public-form-note">정원이 차면 참석 응답은 대기로 등록돼요. 자리가 나면 순서대로 확정돼요.</p>' : ''}
      ${choiceFields(event, vote, '점심 함께해요')}
      <p class="inline-error" role="alert" hidden></p>
      <button class="share-button share-button--primary" type="submit">${vote ? '응답 변경' : '응답 저장'}</button>
      ${vote ? '<button class="share-button share-button--secondary" type="button" data-action="cancel-vote">응답 취소</button>' : ''}</form>`;
  } else if (event.canVote) {
    response = '<div class="public-form"><p class="public-status"><strong>이 일정에 응답할 수 없어요.</strong>운영진에게 참석 명단을 확인해 주세요.</p></div>';
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
  if (event.myWaitingPosition) return { action: event.canVote ? '응답 변경' : '일정 확인', primary: false,
    row: `대기 ${event.myWaitingPosition}번`, note: `내 응답 <strong>대기 ${event.myWaitingPosition}번</strong>` };
  if (event.canVote && !signedIn) return { action: '투표하기', primary: true, row: '투표하기', note: '로그인하면 투표할 수 있어요.' };
  if (event.canVote && event.eligible) {
    return event.mySlot
      ? { action: '응답 변경', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong> · 마감 전까지 바꿀 수 있어요.` }
      : { action: '투표하기', primary: true, row: '투표하기', note: '아직 응답하지 않았어요.' };
  }
  if (event.mySlot) return { action: '일정 확인', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong>` };
  if (event.canVote) return { action: '일정 확인', primary: false, row: '일정 확인', note: '이 일정에 응답할 수 없어요. 운영진에게 참석 명단을 확인해 주세요.' };
  return { action: '일정 확인', primary: false, row: '일정 확인', note: event.voteClosed || deadlinePassed(event) ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.' };
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
  const reward = record.rewarded ? '수령 완료' : record.eligible ? '수령 대상' : '미수령';
  return `<section class="public-share-card member-list member-record-card" aria-labelledby="member-record"><div class="public-share-content">
    <h1 id="member-record" tabindex="-1">내 기록</h1>
    <dl class="public-event-facts"><div><dt>콕 수령</dt><dd><strong>${reward}</strong></dd></div>
      ${record.periods.map((marks, index) => {
        const remaining = Math.max(0, record.goal - marks.length);
        return `<div><dt>${months[index]} 인정</dt><dd>${marks.length}/${record.goal}회 · <strong>${remaining ? `${remaining}회 남음` : '목표 달성'}</strong></dd></div>`;
      }).join('')}</dl>
    <p class="public-form-note">${record.year}년 ${record.half === 1 ? '상반기' : '하반기'} · 확정된 일정의 기록이에요.</p>
    <details class="event-past"><summary>출석·인정 상세</summary>
    ${attendanceMonths(record.year, record.attendance)}
    ${record.periods.map((marks, index) => markSlots(periodName(record.periods.length, index), months[index], marks, record.goal)).join('')}
    </details></div></section>`;
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
      <h2 id="member-next-title" class="public-title">예정된 일정이 없어요.</h2></header>
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
    done: `${event.date}T${event.endTime}` <= now.minute || finished(event, now) }));
}

// 일정 (회원): every published upcoming event in the member order (FLOW.md 4), each opening its vote, with the month's
// calendar above them when asked for. month: the calendar's 'YYYY-MM', this month when none was picked.
export function memberEventsScreen({ events }, monthEvents, user, { month, selected, calendarOpen }) {
  const now = koreanNow();
  const row = event => memberEventRow(event, Boolean(user));
  const rows = memberOrder(events, now).filter(event => event.date !== selected).map(row);
  const dayRows = selected ? monthEvents.filter(event => event.date === selected).map(row) : [];
  const calendar = calendarOpen ? calendarBlock(calendarEvents(monthEvents, now), { month, selected, today: now.day, icon }) : '';
  return memberPage(`<section class="public-share-card member-list" aria-labelledby="member-events"><div class="public-share-content">
    <h1 id="member-events" tabindex="-1">일정</h1><div class="list-tools"><span>예정 ${events.length}개</span>${calendarToggle(calendarOpen, icon)}</div>
    ${calendarPanel(calendar + calendarDayPanel(selected, dayRows, { listClass: 'member-records',
      done: calendarEvents(monthEvents.filter(event => event.date === selected), now).every(event => event.done) }))}
    <div class="calendar-other-dates">${rows.length ? `<ul class="member-records">${rows.join('')}</ul>` : selected ? '' : `<p class="public-form-note">${noEvents}</p>`}</div>
    </div></section>`);
}

export function memberNoticesScreen({ notices }) {
  return memberPage(memberListCard('member-notices', '공지', notices.map(memberNoticeRow), '게시된 공지가 없어요.', 'h1'));
}

// 내 기록: the record, then the PIN 안내 for a birthday or temporary sign-in; before sign-in what signing in adds.
export function memberRecordScreen({ record }, user = null) {
  if (!user) return memberPage(`<h1 class="sr-only" tabindex="-1">내 기록</h1>${signInCard}`);
  return memberPage(recordCard(record) + pinCard(user));
}

export function loginForm(name, numberStep) {
  const label = numberStep ? '번호 6자리' : '성함';
  const input = !numberStep
    ? `<input id="login-value" name="name" type="text" value="${esc(name)}" autocomplete="off" autocapitalize="off"
      spellcheck="false" maxlength="64" enterkeyhint="next" required>`
    : `<span class="login-code">
      <input id="login-value" name="credential" type="password" inputmode="numeric" autocomplete="off" enterkeyhint="go"
        maxlength="6" pattern="[0-9]{6}" data-login-code required>
      <span class="login-code-cells" aria-hidden="true">${'<span></span>'.repeat(6)}</span>
    </span>`;
  return `<form class="form login-form" aria-label="로그인" data-form="${numberStep ? 'login' : 'login-name'}">
      ${numberStep ? `<div class="login-greeting"><button type="button" class="icon-button login-back" data-action="login-back" aria-label="성함 입력으로 돌아가기">${icon('arrow-left')}</button>
        <p id="login-greeting">안녕하세요. ${esc(name)}님!</p></div>` : ''}
      <div class="login-field">
        <label for="login-value">${label}</label>
        ${input}
        ${numberStep ? `<p class="login-pending" role="status" hidden>${shuttlecockMark('shuttle-spin shuttle-inline')}로그인 중…</p>` : ''}
        <p id="login-error" class="inline-error" role="alert" hidden></p>
      </div>
      <button type="submit" class="btn btn-primary login-submit"${numberStep ? ' hidden' : ''}>${numberStep ? '로그인' : '다음'}</button>
    </form>
    <details class="login-help"><summary>로그인 도움말</summary><div class="login-guide">
      <p><strong>회원</strong> 생년월일 뒤 6자리, 내 PIN 또는 임시 번호</p><p><strong>운영진</strong> 운영 번호 6자리</p>
    </div></details>
    <p class="login-browse">${button('로그인 없이 보기', 'close', { css: 'text small' })}</p>`;
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

// 카톡 미리보기 (운영 화면 더보기): the chat preview members will see, read from the share page's own tags (app.mjs
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
export function accountActions(user) {
  return user ? button(`${icon('lock', 17)} 번호 바꾸기`, 'pin', { css: 'text small' }) + button(`${icon('logout', 17)} 로그아웃`, 'logout', { css: 'text small' })
    : button('로그인', 'sign-in', { css: 'text small' });
}

function sidebarAccount(user) {
  const avatar = `<span class="operator-mark">${icon('user', 18)}</span>`;
  if (!user) {
    return `<button type="button" class="sidebar-user" data-action="sign-in">${avatar}<strong>로그인</strong></button>`;
  }
  return `<details class="profile-menu"><summary class="sidebar-user" id="profile-toggle">${avatar}
    <span class="sidebar-user-info"><strong>${esc(user.name)}</strong><small>${operating(user) ? '운영진' : '회원'}</small></span>
    <span class="profile-caret">${icon('chevron-right', 16)}</span></summary>
    <div class="profile-actions">${accountActions(user)}</div></details>`;
}

export function adminShell(section, contents, club, user, hasEvent = false) {
  const sections = appSections(user);
  const title = sections.find(([name]) => name === section)?.[1] ?? sections[0][1];
  const schedule = section === 'event' && operating(user);
  const eventDetail = schedule && hasEvent;
  return `<div class="admin-app">
    <aside class="sidebar">${brand(club)}${adminMenu(section, user)}
      <div class="sidebar-footer">${sidebarAccount(user)}</div>
    </aside>
    <div class="main-shell${schedule ? ' schedule-shell' : ''}">
      <header class="topbar"><div class="topbar-inner">
        ${eventDetail ? button(`${icon('arrow-left', 20)} 뒤로`, 'event-list', { css: 'text schedule-back' }) : ''}
        <div class="breadcrumb">
          ${eventDetail ? '' : `<span class="breadcrumb-parent">${esc(club.name)}</span><span class="breadcrumb-divider">/</span>`}<strong>${title}</strong>
        </div>
        <div class="topbar-actions">${schedule && !hasEvent ? iconAction('plus', 'new-event', { label: '새 일정' }) : ''}${user ? '' : accountActions(user)}
          <button type="button" class="icon-button topbar-menu" data-action="admin-menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="dialog">${menuIcon}</button></div>
      </div></header>
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

// The tab a session opens on when none was picked: the vote before the day, check-in on the day, wrap-up after it.
export function defaultTab(event) {
  const day = today();
  return event.date > day ? 'poll' : event.date === day ? 'attendance' : 'settlement';
}

// 지금 할 일 (DESIGN.md 4 운영 홈): one white card for the first of the 진행 중인 일정 (FLOW.md, flow.mjs): when, the title,
// one fact, where it stands in four steps, that step's numbers and the one thing to do now. No photo, no big number.
const stepNames = ['일정 준비', '참석 투표', '출석 체크', '마무리'];

function nowSteps(stage) {
  const at = Math.min(stage, 3);
  return `<ol class="now-steps" aria-label="일정 진행 ${at + 1}/4단계: ${stepNames[at]}">${stepNames.map((name, index) => {
    const step = stage === 4 || index < at ? 'done' : index === at ? 'now' : 'next';
    return `<li data-step="${step}"${step === 'now' ? ' aria-current="step"' : ''}><i></i>${name}</li>`;
  }).join('')}</ol>`;
}

// The live CSP blocks style attributes, so the bar is an SVG sized by its viewBox (as .member-count-bar is).
function nowStats(items, value, total, label) {
  return `<dl class="now-stats">${items.map(([name, n]) => `<div><dt>${name}</dt><dd>${n}명</dd></div>`).join('')}</dl>
    <svg class="now-meter" viewBox="0 0 ${Math.max(total, 1)} 1" preserveAspectRatio="none" role="img" aria-label="${label}"><rect width="${Math.min(value, total)}" height="1"/></svg>`;
}

// listing: the organiser's own member listing (worker/api.mjs listPublic), to say when their own answer is missing
// (ROLES.md 결정 5: organisers vote as members). fresh: the first paint, when the bar grows in; the 15-second refresh
// redraws the card without it.
export function homeNow(detail, listing = null, fresh = false) {
  const event = detail?.event;
  if (!event) {
    return `<section class="panel now-card" aria-labelledby="next-event-title"><p class="now-when">지금 할 일</p>
      <h2 id="next-event-title">예정된 일정이 없어요</h2>
      <div class="now-actions">${button('새 일정 만들기', 'new-event')}</div></section>`;
  }
  const stage = sessionStage(detail);
  const active = detail.roster.filter(member => member.active);
  const counts = countEvent(active, []);
  const going = counts.early + counts.late;
  const responded = going + counts.no + counts.waiting;
  const waiting = active.length - responded;
  const present = detail.roster.filter(row => row.present === true).length;
  const arrived = (detail.guests ?? []).filter(guest => guest.status === 'arrived').length;
  const open = (label, tab) => button(label, 'open-event', { id: event.id, tab });
  const attendance = () => nowStats(stage === 2 ? [['참석 예정', going], ['출석', present], ['게스트 도착', arrived]]
    : [['출석', present], ['게스트 도착', arrived], ['참석 예정', going]], present, going, `출석 ${present}/${going}명`);
  const vote = event.canVote ? `${deadlineLabel(event.deadline)} 투표 마감` : event.voteClosed || event.open || deadlinePassed(event) ? '투표가 마감됐어요' : '투표가 닫혀 있어요';
  const [kicker, fact, numbers, actions] = [
    () => ['다음 일정', '아직 회원에게 보이지 않아요. 공개해야 투표할 수 있어요.', '', open('일정 열어 공개하기', 'poll')],
    () => ['다음 일정', `${esc(event.place)} · ${esc(vote)}`,
      active.length ? nowStats([['선발', counts.early], ['후발', counts.late], ['점심', counts.lunch], ['불참', counts.no], ...(event.capacity ? [['대기', counts.waiting]] : []), ['미응답', waiting]],
        responded, active.length, `응답 ${responded}/${active.length}명`)
        : '<p class="now-note">투표 대상 회원이 없어요. 회원 관리에서 활동 회원을 확인해 주세요.</p>',
      voteClosedForSharing(event, active)
        ? button('마감 안내 복사', 'copy-vote-closed', { id: event.id }) + open('응답 명단 보기', 'poll')
        : open(waiting > 0 ? `미응답 ${waiting}명 보기` : '응답 명단 보기', 'poll') + button('투표 링크 복사', 'copy-vote-link', { id: event.id, css: 'secondary' })],
    () => ['오늘 일정', esc(event.place), attendance(), open('출석 체크', 'attendance')],
    () => ['마무리할 일정', '운동이 끝났어요. 마무리만 남았어요.', attendance(), open('마무리하기', 'settlement')],
    () => ['마무리한 일정', '마무리를 확정했어요.', attendance(), open('마무리 보기', 'settlement')],
  ][stage]();
  const own = (listing?.events ?? []).some(item => item.id === event.id && awaitingVote(item))
    ? button('내 응답은 아직이에요 · 지금 하기', 'my-vote', { id: event.id, css: 'text now-own' }) : '';
  return `<section class="panel now-card" aria-labelledby="next-event-title"${fresh ? ' data-fresh' : ''}>
    <p class="now-when">${kicker} · <time datetime="${esc(`${event.date}T${event.time}`)}">${esc(`${kindPrefix(event)}${fullDate(event.date)} · ${event.time}–${event.endTime}`)}</time></p>
    <h2 id="next-event-title">${pinMark(event)}${esc(event.title)}</h2>
    <p class="now-fact">${fact}</p>${nowSteps(stage)}${numbers}
    <div class="now-actions">${actions}</div>${own}</section>`;
}

// 상단 고정 (FLOW.md 5): a push pin by the title wherever a pinned event or notice shows; pinning itself is on the
// 회차 화면 and the 공지 list.
function pinMark(item) {
  return item?.pinnedAt ? `<span class="pin-mark" title="상단 고정">${icon('pushpin', 15)}<span class="sr-only">상단 고정</span></span>` : '';
}

// 일정 종류 in a line of facts: only the ones other than the usual 정기, and not when the title already says it
// ("수요 번개").
function kindPrefix(event) {
  const label = eventKindLabels[event.kind];
  return label && event.kind !== 'regular' && !event.title.includes(label) ? `${label} · ` : '';
}

// What one unfinished event shows wherever it is listed (운영 홈 rows, the 일정 list): its title, then one quiet line of
// its date and where it stands (단순화 3: words, no coloured chip per row).
function flowFacts(event, now) {
  const stage = eventStage(event, now);
  const late = Math.round((Date.parse(now.day) - Date.parse(event.date)) / 86400000);
  const stands = {
    draft: '공개 전',
    waiting: '투표 닫힘',
    voting: `투표 중 · 미응답 ${event.waiting}명`,
    closed: `투표 마감 · 미응답 ${event.waiting}명`,
    today: '오늘 · 출석 체크',
    wrapup: `마무리 전 · ${late}일 지남`,
  }[stage];
  return { stage, title: `${pinMark(event)}${esc(event.title)}`, detail: esc(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${stands}`) };
}

// A list on the page itself: a quiet label with one action, then whole rows (.event-link), no box around them.
function homeList(title, titleId, rows, empty, action = '') {
  return `<section class="home-list" aria-labelledby="${titleId}"><header class="list-tools"><h2 id="${titleId}">${title}</h2>${action}</header>
    ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : `<p class="muted home-empty">${empty}</p>`}</section>`;
}

function homeRow(action, id, title, detail, { tab = '' } = {}) {
  return `<li><button type="button" class="event-link" data-action="${action}" data-id="${esc(id)}"${tab ? ` data-tab="${tab}"` : ''}><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron-right', 18)}</button></li>`;
}

// The count excludes the featured event and links to the full schedule (DESIGN.md 4).
export function homeFlows(events, featuredId, now = koreanNow()) {
  const count = flowOrder(events, now).filter(event => event.id !== featuredId).length;
  return `<div class="home-flows"><button type="button" class="event-link" data-action="event-list"><span><strong>다른 일정</strong></span><small>${count}개</small>${icon('chevron-right', 18)}</button></div>`;
}

// 지난 일정: the latest event whose 마무리 is confirmed (unfinished ones are among the 진행 중인 일정), with its counts
// and the 마무리 글 to paste into the group chat.
function homeLast(last) {
  if (!last) return '';
  if (last.failed) return homeList('지난 일정', 'home-last-title', [], '마무리한 일정을 불러오지 못했어요. 잠시 뒤 홈을 다시 열어 주세요.');
  const { event, roster, guests } = last;
  const c = countEvent(roster, guests);
  const skipped = roster.filter(row => !row.waitingPosition && (row.slot === 'early' || row.slot === 'late') && row.present === false).length;
  return homeList('지난 일정', 'home-last-title', [homeRow('open-event', event.id, esc(event.title),
    esc(`${dateLabel(event.date)} · 출석 ${c.members}명 · 게스트 ${c.guests}명 · 응답 후 불참 ${skipped}명`), { tab: 'settlement' })], '',
  button('마무리 글 복사', 'copy-last-report', { css: 'text small' }));
}

// The line above the card says how many events are under way, so a phone that shows only the card at first still tells
// there are more below.
function flowSummary(events) {
  const now = koreanNow();
  const flows = flowOrder(events, now);
  const wrapups = flows.filter(event => eventStage(event, now) === 'wrapup').length;
  return flows.length ? `진행 중인 일정 ${flows.length}개${wrapups ? ` · 마무리 전 ${wrapups}개` : ''}` : '진행 중인 일정이 없어요.';
}

// 운영 홈: 지금 할 일 card → 다른 일정 → 최근 공지 → 지난 일정, one column (단순화 3). The current menu names the view.
export function adminHome({ events, notices }, upcoming, last = null, listing = null) {
  const recent = notices.slice(0, 3).map(notice => homeRow('edit-notice', notice.id, `${pinMark(notice)}${esc(notice.title)}`,
    `<time datetime="${esc(notice.date)}">${esc(shortDate(notice.date))}</time>${notice.published ? '' : ' · 비공개'}`));
  return `<div class="home-page">
    <header class="list-tools"><h1 tabindex="-1" class="sr-only">운영 홈</h1><p>${esc(flowSummary(events))}</p>${button(`${icon('plus', 17)} 새 일정`, 'new-event', { css: 'secondary small' })}</header>
    <div id="home-now">${homeNow(upcoming, listing, true)}</div>
    <div id="home-flows">${homeFlows(events, upcoming?.event.id)}</div>
    ${homeList('최근 공지', 'home-notices-title', recent, '아직 등록한 공지가 없어요.', button('전체 보기', 'tab', { id: 'notices', css: 'text small' }))}
    ${homeLast(last)}
  </div>`;
}

function voteClosedForSharing(event, roster) {
  return event.published && !event.cancelled && !event.canVote && (event.voteClosed || deadlinePassed(event) || roster.some(person => person.slot));
}

export function voteShareAction(event, roster) {
  if (!event.published) return button('회원에게 공개하기', 'publish-event');
  const closed = voteClosedForSharing(event, roster);
  return button(closed ? '마감 안내 복사' : '투표 링크 복사', closed ? 'copy-vote-closed' : 'copy-vote-link',
    { id: event.id, css: event.canVote || closed ? '' : 'secondary' });
}

export function countEvent(roster, guests) {
  return {
    early: roster.filter(row => row.slot === 'early' && !row.waitingPosition).length,
    late: roster.filter(row => row.slot === 'late' && !row.waitingPosition).length,
    no: roster.filter(row => row.slot === 'no').length,
    lunch: roster.filter(row => row.lunch && !row.waitingPosition).length,
    waiting: roster.filter(row => row.waitingPosition).length,
    members: roster.filter(row => row.present === true).length,
    unmarked: roster.filter(row => row.present == null).length,
    guests: guests.filter(row => row.status === 'arrived').length,
  };
}

// One labelled group of a form (.form-group): a small heading and space, no box (DESIGN.md 5 폼).
function formGroup(legend, body) {
  return `<fieldset class="form-group"><legend>${legend}</legend>${body}</fieldset>`;
}

// Three groups instead of ten fields in a row (DESIGN.md 6 UX 점검표 16 밀러): what and where, when, what members see.
export function eventForm(event, id = '') {
  const time = { type: 'time', attrs: 'required' };
  return form('event',
    formGroup('기본 정보', `<div class="form-grid">
      ${field('일정 제목', 'title', event.title, { wide: true, attrs: 'required maxlength="120" placeholder="제목을 입력해 주세요"' })}
      ${field('장소', 'place', event.place, { wide: true, attrs: 'required maxlength="120" placeholder="장소를 입력해 주세요"' })}
      ${select('일정 종류', 'kind', Object.entries(eventKindLabels), event.kind ?? 'regular')}
      ${field('신청 정원 (선택)', 'capacity', event.capacity ?? '', { type: 'number',
        attrs: 'min="1" max="10000" step="1" inputmode="numeric" placeholder="신청 정원 (선택)"', help: '정원이 차면 대기로 등록돼요.' })}
    </div>`)
    + formGroup('날짜와 시간', `<div class="form-grid">
      ${field('날짜', 'date', event.date, { type: 'date', wide: true, attrs: 'required' })}
      ${field('시작 시간', 'time', event.time, time)}
      ${field('종료 시간', 'endTime', event.endTime, time)}
      ${field('선발 모임', 'earlyTime', event.earlyTime, time)}
      ${field('후발 모임', 'lateTime', event.lateTime, time)}
      ${field('투표 마감 (한국 시간)', 'deadline', event.deadline, { type: 'datetime-local', wide: true, attrs: 'required' })}
    </div>`)
    + formGroup('공개 설정', `<div class="form-grid">
      ${textarea('공개 안내', 'notes', event.notes, 'maxlength="3000" placeholder="날짜별 준비물이나 안내를 적어 주세요."')}
    </div>`
      + note('로그인한 회원에게 표시되는 안내입니다. 개인 연락처와 회원 명단은 별도로 전달해 주세요.')
      + check('회원에게 일정 공개', 'published', event.published)
      + check('웹 투표 열기', 'open', event.open)),
    id ? '일정 저장' : '일정 만들기', id);
}

const sessionTabs = [['poll', '참석 투표'], ['attendance', '출석 체크'], ['settlement', '마무리']];

// One event in the 일정 list: the whole row opens its detail (FLOW.md 5 운영 일정 화면).
function eventLink(event, title, detail) {
  return `<li data-date="${esc(event.date)}"><button type="button" class="event-link" data-action="open-event" data-id="${esc(event.id)}"><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron-right', 18)}</button></li>`;
}

// 일정 (#event): a count line with the calendar toggle and 새 일정, the month's calendar, every unfinished event
// in the 운영 홈 order as rows on the page, then the finished ones (마무리 확정 or 취소) folded under 끝난 일정, latest first.
function eventList(events, month, calendarOpen, selected) {
  const now = koreanNow();
  const calendar = calendarOpen ? calendarBlock(calendarEvents(events, now),
    { month, selected, today: now.day, icon }) : '';
  const flows = flowOrder(events, now);
  const past = events.filter(event => finished(event, now))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const flowRow = event => {
    const { title, detail } = flowFacts(event, now);
    return eventLink(event, title, detail);
  };
  const pastRow = event => eventLink(event, esc(event.title),
    esc(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${event.cancelled ? '취소' : '마무리 완료'}`));
  const rows = flows.filter(event => event.date !== selected).map(flowRow);
  const pastRows = past.filter(event => event.date !== selected).map(pastRow);
  const dayRows = selected ? events.filter(event => event.date === selected).sort((a, b) => a.time.localeCompare(b.time))
    .map(event => finished(event, now) ? pastRow(event) : flowRow(event)) : [];
  // 일정 추가 only from today on: a day that has gone takes no new event.
  const add = selected && selected >= now.day ? button(`${icon('plus', 16)} 일정 추가`, 'new-event', { id: selected, css: 'text small' }) : '';
  const dayDone = calendarEvents(events.filter(event => event.date === selected), now).every(event => event.done);
  return `<header class="list-tools"><h1 tabindex="-1" class="sr-only">일정</h1><p>진행 중 ${flows.length}개</p>
      ${calendarToggle(calendarOpen, icon)}</header>
    ${calendarPanel(calendar + calendarDayPanel(selected, dayRows, { action: add, done: dayDone }))}
    <div class="calendar-other-dates">
    ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : selected ? '' : '<p class="muted home-empty">진행 중인 일정이 없어요. 새 일정을 만들어 투표를 시작하세요.</p>'}
    ${pastRows.length ? `<details class="event-past"><summary>끝난 일정 ${pastRows.length}개${icon('chevron-right', 16)}</summary><ul class="event-list">${pastRows.join('')}</ul></details>` : ''}</div>`;
}

// own: the organiser's own answer ({ vote, eligible, saved }); 내 응답 shows when they are on the roster or answered.
// month: the list's calendar month (calendar.mjs); calendarOpen: whether the list shows it.
// view: tab (the tab picked), own (the organiser's own answer, below), month and calendarOpen (the list's calendar,
// calendar.mjs), onlyUnmarked (당일 출석 shows only the members not yet checked), myVoteOpen (내 응답 is unfolded).
export function eventScreen(events, detail, { tab = null, own = null, month = koreanNow().day.slice(0, 7), selected = '', calendarOpen = true, onlyUnmarked = false, myVoteOpen = false } = {}) {
  const event = detail?.event;
  if (!event) {
    return `<div class="event-page">${eventList(events, month, calendarOpen, selected)}</div>`;
  }
  const { roster, guests, settlement } = detail;
  const counts = countEvent(roster, guests);
  // A cancelled event says so with the way back in sight; 일정 취소 itself is in the 회차 메뉴 (eventMenu).
  const cancelled = event.cancelled && !settlement?.confirmed
    ? `<div class="event-cancelled"><p><strong>취소한 일정이에요.</strong> ${event.published ? '같은 링크에서 취소 상태를 확인할 수 있어요.' : '회원에게 공개되지 않은 일정이에요.'}
      받은 응답은 그대로 있어요.</p>
      ${event.published ? button('취소 안내 복사', 'copy-event-update', { id: event.id, css: 'secondary small' }) : ''}
      ${button('취소 풀기', 'restore-event', { id: event.id, css: 'text small' })}</div>` : '';
  // 박스 동작 (DESIGN.md 5, UX 점검표 15 힉): 상단 고정 and 회차 수정 as icons at the head's top-right, the rarely used rest
  // in 더보기 last. The pin icon shows whether the event is pinned; without it (마무리·취소) the title keeps its mark.
  const open = !settlement?.confirmed && !event.cancelled;
  const tools = boxActions(
    open && iconAction('pushpin', 'pin-event', { id: event.id, label: `${event.title} 상단 고정`, pressed: Boolean(event.pinnedAt) }),
    iconAction('edit', 'edit-event', { label: `${event.title} 일정 수정` }),
    iconAction('more', 'event-menu', { id: event.id, label: `${event.title} 일정 메뉴` }));
  // The event names the screen: its title, one line of when and where, one quiet line of where it stands. No box.
  const stands = event.cancelled ? '취소한 일정' : settlement?.confirmed ? '마무리 완료' : !event.published ? '공개 전 · 회원에게 보이지 않아요'
    : event.canVote ? `공개 중 · ${deadlineLabel(event.deadline)} 투표 마감` : `공개 중 · ${event.voteClosed || event.open || deadlinePassed(event) ? '투표 마감' : '투표 닫힘'}`;
  const head = `<header class="event-head"><h1 tabindex="-1">${open ? '' : pinMark(event)}${esc(event.title)}</h1>${tools}
      <div class="event-facts"><p>${esc(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time}–${event.endTime} · ${event.place}`)}</p><p class="muted">${esc(stands)}</p></div></header>${cancelled}`;
  // The three steps of a session are tabs, as in the demo (screens.js eventDetail), so the gym check-in is one tap away.
  const current = tab ?? defaultTab(event);
  const nav = `<nav class="tabs" aria-label="일정 단계">${sessionTabs.map(([name, label]) => `<button type="button" data-action="event-tab" data-id="${name}"${name === current ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
  const guestList = guestsPanel(guests, settlement?.confirmed);
  // 내 응답 (ROLES.md 2단계: organisers vote as members): one line under the numbers that says the answer and unfolds
  // the same form the members get, so the names to chase stay on the first screen. app.mjs keeps it open through a save.
  const mine = own && (own.eligible || own.vote)
    ? `<details class="event-past my-vote" id="my-vote"${myVoteOpen ? ' open' : ''}><summary>내 응답 · ${own.vote ? esc(`${voteLabel(own.vote.slot, event)}${own.vote.waitingPosition ? ` · 대기 ${own.vote.waitingPosition}번` : ''}${own.vote.lunch ? ' · 점심' : ''}`)
      : event.canVote ? '아직 안 했어요' : '응답하지 않았어요'}${icon('chevron-right', 16)}</summary>${voteResponse(event, own.vote, own.eligible, own.saved, true)}</details>` : '';
  const late = !event.canVote && deadlinePassed(event) && (event.open || event.date >= today())
    ? '<p class="form-note">투표 마감 시각이 지났습니다. 다시 받으려면 마감 시각을 먼저 변경해 주세요.</p>' : '';
  // 카톡 공유 is copying the vote link (DESIGN.md 5 카톡 공유); the KakaoTalk preview waits in 더보기.
  const vote = `<section class="vote-box" aria-label="참석 투표 현황"><div id="vote-counts">${voteSummary(roster, event)}</div>${late}
    <div class="now-actions" id="vote-share">${voteShareAction(event, roster)}</div></section>`;
  const poll = vote + mine + voteRoster(event, roster, false, Boolean(event.capacity && (event.cancelled || settlement?.confirmed)));
  const content = current === 'attendance' ? attendancePanel(event, roster, counts, settlement?.confirmed, onlyUnmarked) + guestList
    : current === 'settlement' ? settlementPanel(settlement, counts, detail.carryStock, guests) : poll + guestList;
  return `<div class="event-page event-detail">${head}${nav}${content}</div>`;
}

// 참석 투표 현황: how many of the active members answered, then each way, and the bar (the 운영 홈 card's numbers).
// Redrawn every 15 seconds (app.mjs refreshVoteCounts).
export function voteSummary(roster, event = {}) {
  const active = roster.filter(member => member.active);
  const counts = countEvent(active, []);
  const responded = counts.early + counts.late + counts.no + counts.waiting;
  return `<p class="vote-total">응답 ${responded} / ${active.length}명</p>
    ${event.capacity ? `<p class="muted">${capacityInfo(event, countEvent(roster, []))}</p>` : ''}
    <p class="muted">선발 ${counts.early} · 후발 ${counts.late} · 불참 ${counts.no} · 점심 ${counts.lunch}</p>
    <svg class="now-meter" viewBox="0 0 ${Math.max(active.length, 1)} 1" preserveAspectRatio="none" role="img" aria-label="응답 ${responded}/${active.length}명"><rect width="${responded}" height="1"/></svg>`;
}

// 응답 명단: who has not answered first (the active members the organiser will chase), then everyone who answered,
// folded. 응답 변경 on each name opens the organisers' 회원 응답 변경. foldOpen keeps the fold as it was on a redraw.
export function voteRoster(event, roster, foldOpen = false, locked = false) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const row = (person, detail) => `<li><span>${memberNameTag(person, esc)}${detail ? `<small>${esc(detail)}</small>` : ''}</span>${button('응답 변경', 'vote-override', { id: person.id, css: 'text small', label: `${person.name} 응답 변경`, disabled: locked })}</li>`;
  const silent = roster.filter(person => person.active && !person.slot).sort(byName);
  const order = { early: 0, late: 1, no: 2 };
  const waiting = roster.filter(person => person.waitingPosition).sort((a, b) => a.waitingPosition - b.waitingPosition);
  const answered = roster.filter(person => person.slot && !person.waitingPosition).sort((a, b) => order[a.slot] - order[b.slot] || byName(a, b));
  return `<section class="vote-roster" aria-label="응답 명단"><header class="list-tools"><h2>미응답 ${silent.length}명</h2></header>
    ${silent.length ? `<ul class="name-list">${silent.map(person => row(person, '')).join('')}</ul>` : `<p class="muted home-empty">${roster.some(person => person.active) ? '모두 응답했어요.' : '이 일정에 등록된 회원이 없습니다.'}</p>`}
    ${waiting.length ? `<header class="list-tools"><h2>대기 ${waiting.length}명</h2></header><ul class="name-list">${waiting.map(person => row(person,
      `대기 ${person.waitingPosition}번 · ${voteLabel(person.slot, event)}`)).join('')}</ul>` : ''}
    ${answered.length ? `<details class="event-past"${foldOpen ? ' open' : ''}><summary>응답한 ${answered.length}명${icon('chevron-right', 16)}</summary><ul class="name-list">${answered.map(person =>
      row(person, `${voteLabel(person.slot, event)}${person.lunch ? ' · 점심' : ''}${person.active ? '' : ' · 비활성'}`)).join('')}</ul></details>` : ''}</section>`;
}

// 회차 메뉴 (eventScreen 더보기): the session's rarely used actions, the same ones and rules as before they moved here.
// 상단 고정 and 회차 수정 are icons on the box.
export function eventMenu({ event, settlement }) {
  const open = !settlement?.confirmed && !event.cancelled;
  return `<div class="menu-actions action-menu">${[
    button(event.published ? '공개 내리기' : '링크 공개', 'publish-event', { css: 'secondary' }),
    // Opening a vote whose deadline has passed would say "열었어요" while members still cannot answer, so it waits for a new deadline.
    button(event.open ? '투표 닫기' : '투표 열기', 'toggle-vote', { css: 'secondary', disabled: !event.published || event.cancelled || (!event.open && deadlinePassed(event)) }),
    button('다음 주 복제', 'clone-event', { css: 'secondary' }),
    // The KakaoTalk preview of the link the copy icon gives (worker/index.mjs shareTags).
    button(`${icon('share', 16)} 카톡 미리보기`, 'copy-vote', { id: event.id, css: 'secondary', disabled: !event.published }),
    event.published && !event.cancelled ? button('변경 안내 복사', 'copy-event-update', { id: event.id, css: 'secondary' }) : '',
    // 일정 취소 (FLOW.md 10): asked once more in its own dialog.
    open ? button('일정 취소', 'cancel-event', { id: event.id, css: 'text' }) : '',
  ].join('')}</div>`;
}

// 공지 메뉴 (noticesScreen 더보기): the KakaoTalk preview of one notice; 복사·상단 고정·공지 수정 are icons on the notice.
export function noticeMenu(notice) {
  return `<div class="menu-actions action-menu">${button(`${icon('share', 16)} 카톡 미리보기`, 'copy-notice', { id: notice.id, css: 'secondary', disabled: !notice.published })}</div>`;
}

const recognitionLabel = { direct: '직접 인정', substitute: '대타 인정', approved: '별도 승인' };

// One row of 당일 출석: the whole row is the check (one tap at the gym door), the rest (불참 확인, 줄서기 인정) waits behind
// 상세. The live app redraws only this row after a check-in (app.mjs markPresent).
export function attendanceRow(event, person, confirmed) {
  const present = person.present === true;
  const facts = [person.waitingPosition ? `대기 ${person.waitingPosition}번` : '', voteLabel(person.slot, event), person.lunch ? '점심' : '', person.present === false ? '불참 확인' : '', recognitionLabel[person.recognition] ?? ''].filter(Boolean).join(' · ');
  return `<li data-member="${esc(person.id)}" data-search="${esc(person.name)}" data-selected="${present}">
      <button type="button" class="att-row" data-action="mark-present" data-id="${esc(person.id)}" aria-pressed="${present}" aria-label="${esc(person.name)} 출석"${confirmed ? ' disabled' : ''}>
        <span>${memberNameTag(person, esc)}<small>${esc(facts)}</small></span><span class="att-check" aria-hidden="true"></span></button>
      <button type="button" class="icon-button" data-action="attendance" data-id="${esc(person.id)}" aria-label="${esc(person.name)} 출석 상세" title="${esc(person.name)} 출석 상세"${confirmed ? ' disabled' : ''}>${icon('more', 20)}</button>
    </li>`;
}

export function attendanceCount(counts) {
  return `출석 ${counts.members}명 · 미확인 ${counts.unmarked}명`;
}

// 당일 출석: the names first (선발, then 후발), a tap each; the members who said 불참 or nothing wait folded below. The
// count stays in sight at the bottom with 미확인만 보기.
function attendancePanel(event, roster, counts, confirmed, onlyUnmarked = false) {
  const favor = row => row.slot === 'early' ? 0 : 1;
  const byOrder = (a, b) => favor(a) - favor(b) || a.name.localeCompare(b.name, 'ko');
  const coming = roster.filter(row => !row.waitingPosition && (row.slot === 'early' || row.slot === 'late')).sort(byOrder);
  const others = roster.filter(row => !coming.includes(row)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const list = people => `<ul class="att-list">${people.map(person => attendanceRow(event, person, confirmed)).join('')}</ul>`;
  return `<section id="attendance" class="att" aria-label="출석 체크"${onlyUnmarked ? ' data-only="unmarked"' : ''}>
    <div class="list-tools">${search('attendance')}${button(`${icon('refresh', 16)} 새로고침`, 'refresh', { css: 'text small' })}</div>
    ${confirmed ? '<p class="form-note">마무리한 일정입니다. 출석을 고치려면 마무리 확인을 먼저 해제해 주세요.</p>' : ''}
    ${roster.length ? '' : '<p class="muted home-empty">이 일정에 등록된 회원이 없습니다.</p>'}
    ${coming.length ? list(coming) : roster.length ? '<p class="muted home-empty">참석한다고 응답한 회원이 아직 없어요.</p>' : ''}
    ${others.length ? `<details class="event-past att-others"${coming.length ? '' : ' open'}><summary>참석 예정이 아닌 회원 ${others.length}명${icon('chevron-right', 16)}</summary>${list(others)}</details>` : ''}
    <div class="att-foot"><strong id="att-count" role="status">${attendanceCount(counts)}</strong>
      <button type="button" class="btn btn-text btn-small" data-action="att-filter" aria-pressed="${onlyUnmarked}">미확인만 보기</button></div>
  </section>`;
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

function guestPaymentText(guest) {
  return [guest.transferWon ? `이체 ${guest.transferWon.toLocaleString('ko-KR')}원` : '',
    guest.receivedShuttles ? `콕 ${guest.receivedShuttles}개` : ''].filter(Boolean).join(' · ');
}

// 게스트 (단순화 7): a list on the page like the 회원 명단: the whole row opens 게스트 수정, and the state and cost are
// words on the line under the name (no chips). Once 마무리 is confirmed the rows are read only.
function guestsPanel(guests, confirmed) {
  const facts = guest => [guestStatus[guest.status] ?? '', guest.paid ? '비용 확인' : '비용 미확인', guestPaymentText(guest),
    guest.level, guest.invitedBy && `${guest.invitedBy} 초대`].filter(Boolean).join(' · ');
  const rows = guests.map(guest => `<li><button type="button" class="event-link" data-action="edit-guest" data-id="${esc(guest.id)}" aria-label="${esc(guest.name)} 게스트 수정"${confirmed ? ' disabled' : ''}>
    <span><strong>${esc(guest.name)}</strong><small>${esc(facts(guest))}</small></span>${confirmed ? '' : icon('chevron-right', 18)}</button></li>`);
  const arrived = guests.filter(guest => guest.status === 'arrived').length;
  return `<section id="guests" class="home-list guest-list" aria-labelledby="guests-title"><header class="list-tools"><h2 id="guests-title">게스트 ${guests.length}명${guests.length ? ` · 도착 ${arrived}명` : ''}</h2>
      ${button(`${icon('plus', 16)} 게스트 추가`, 'new-guest', { css: 'secondary small', disabled: confirmed })}</header>
    ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : '<p class="muted home-empty">등록된 게스트가 없어요.</p>'}
    <p class="form-note">도착을 확인한 게스트만 실제 참여 인원에 들어가요.</p></section>`;
}

export function guestForm(guest = null) {
  return form('guest', `<div class="form-grid">
    ${field('이름', 'name', guest?.name, { attrs: 'required maxlength="60"' })}
    ${field('급수 (선택)', 'level', guest?.level, { attrs: 'maxlength="30"' })}
    ${field('초대한 회원 (선택)', 'invitedBy', guest?.invitedBy, { attrs: 'maxlength="60"' })}
    ${select('상태', 'status', Object.entries(guestStatus), guest?.status ?? 'pending')}</div>`
    + check('게스트 비용 확인', 'paid', guest?.paid)
    + `<details class="event-past"${guestPaymentText(guest ?? {}) ? ' open' : ''}><summary>이체·콕 기록 (선택)</summary>
    <div class="form-grid">
      ${field('이체액 (원)', 'transferWon', guest?.transferWon ?? '', { type: 'number', attrs: 'min="0" max="10000000" step="1" inputmode="numeric"' })}
      ${field('받은 콕 (개)', 'receivedShuttles', guest?.receivedShuttles ?? '', { type: 'number', attrs: 'min="0" max="10000000" step="1" inputmode="numeric"' })}
    </div></details>`, guest ? '게스트 저장' : '게스트 등록', guest?.id);
}

function guestPaymentSummary(guests) {
  const paid = guests.filter(guest => guest.paid && guest.status !== 'cancelled');
  const won = paid.reduce((sum, guest) => sum + (guest.transferWon ?? 0), 0);
  const shuttles = paid.reduce((sum, guest) => sum + (guest.receivedShuttles ?? 0), 0);
  const unspecified = paid.filter(guest => guest.transferWon == null && guest.receivedShuttles == null).length;
  return paid.length ? `게스트 비용 확인 ${paid.length}명${won ? ` · 이체 ${won.toLocaleString('ko-KR')}원` : ''}${shuttles ? ` · 콕 ${shuttles}개` : ''}${unspecified ? ` · 세부 미기록 ${unspecified}명` : ''}` : '';
}

export function settlementPanel(value, counts, carry = null, guests = []) {
  const s = value ?? {};
  const legacy = value && s.openingShuttles == null;
  const numberField = (label, key, amount) => field(label, key, amount,
    { type: 'number', attrs: 'min="0" max="10000000" step="1" inputmode="numeric" required' });
  const opening = s.openingShuttles ?? carry?.shuttles ?? 0;
  const numbers = (legacy ? [
    ['이전 이월 (낱개)', 'priorSingles', s.priorSingles], ['이전 이월 (타)', 'priorTubes', s.priorTubes],
    ['당일 잔여 (낱개)', 'remainingSingles', s.remainingSingles],
  ] : [
    ['이전 이월 (개)', 'openingShuttles', opening], ['이번에 추가 (개)', 'addedShuttles', s.addedShuttles ?? 0],
    ['이번에 사용 (개)', 'usedShuttles', s.usedShuttles ?? 0],
  ]).map(([label, key, amount]) => numberField(label, key, amount)).join('');
  const stock = legacy ? '' : `<p class="form-note">${!value && carry ? `${dateLabel(carry.date)} ${esc(carry.time)} 확정 잔량을 불러왔어요. ` : ''}게스트 콕을 공용 재고에 넣었다면 추가 수량에 포함해 주세요.</p>
    <p class="stock-total" aria-live="polite">최종 잔량 <strong data-stock-total>${s.closingShuttles ?? opening}개</strong></p>`;
  const payment = guestPaymentSummary(guests);
  // 단순화 7: the numbers read as one line, as 참석 투표 does; the form follows on the page with no box around it.
  return `<section id="settlement" class="settle-box" aria-labelledby="settlement-title">
    <h2 id="settlement-title" class="sr-only">모임 마무리</h2>
    <p class="vote-total">실제 참석 ${counts.members + counts.guests}명</p>
    <p class="muted">회원 ${counts.members}명 · 게스트 도착 ${counts.guests}명${s.confirmed ? ' · 마무리 확정' : ''}</p>
    ${payment ? note(payment) : ''}${counts.unmarked ? note(`출석을 확인하지 않은 회원 ${counts.unmarked}명은 마무리 집계에서 빠져요.`) : ''}
    <div class="now-actions">${button(`${icon('clipboard', 16)} 마무리 글 복사`, 'copy-report', { css: s.confirmed ? '' : 'secondary', disabled: !s.confirmed })}</div>
    ${s.confirmed ? '' : '<p class="form-note">마무리를 확정하면 단체방에 붙여 넣을 마무리 글을 복사할 수 있어요.</p>'}
    ${form('settlement', `<div class="form-grid">${numbers}${numberField('코트 찬조금 (원)', 'courtDonation', s.courtDonation ?? 0)}</div>`
      + stock + check('마무리 집계를 확인했어요', 'confirmed', s.confirmed)
      + (s.confirmed ? note('확인을 해제하고 저장하면 출석과 게스트를 다시 고칠 수 있어요.') : ''), '마무리 기록 저장', '', 'settlement-form')}
  </section>`;
}

export function reportText(detail, clubName) {
  const { event, roster, guests, settlement: s } = detail;
  const c = countEvent(roster, guests);
  return [
    `${clubName} ${event.title} 마무리`,
    `${dateLine(event)} / ${event.place}`,
    `실제 참석 ${c.members + c.guests}명 (회원 ${c.members}명, 게스트 ${c.guests}명)`,
    s.closingShuttles == null
      ? `콕 이월 ${s.priorSingles + s.remainingSingles}개 + ${s.priorTubes}타 (이전 ${s.priorSingles}개 + ${s.priorTubes}타, 당일 잔여 ${s.remainingSingles}개)`
      : `콕 최종 잔량 ${s.closingShuttles}개 (이월 ${s.openingShuttles} + 추가 ${s.addedShuttles} − 사용 ${s.usedShuttles})`,
    `코트 찬조금 ${Number(s.courtDonation).toLocaleString('ko-KR')}원`,
  ].filter(Boolean).join('\n');
}

function organizersPanel(organizers, me) {
  const rows = organizers.map(organizer => {
    const self = organizer.id === me;
    return `<tr><td><div class="member-name">${avatar(organizer.name)}<strong>${esc(organizer.name)}</strong></div></td>
    <td>${self ? word('나') : organizer.mustChange ? word('자기 번호 정하기 전', 'due') : word('사용 중', 'quiet')}</td>
    <td class="table-actions">${self ? ''
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
  // One row a member, the whole row opens 회원 수정; what is not the usual (비활성, 운영진) is said under the name.
  const rows = members.map(member => `<li data-search="${esc(member.name)}"><button type="button" class="event-link" data-action="edit-member" data-id="${esc(member.id)}" aria-label="${esc(member.name)} 회원 수정"><span>${memberNameTag(member, esc)}
    ${member.active && !organizerIds.has(member.id) ? '' : `<small>${[member.active ? '' : '비활성', organizerIds.has(member.id) ? '운영진' : ''].filter(Boolean).join(' · ')}</small>`}</span>${icon('chevron-right', 18)}</button></li>`);
  return `<div class="plain-page">${pageHead('회원 관리', `전체 ${members.length}명 · 활동 중 ${active}명`, button(`${icon('plus', 17)} 회원 추가`, 'new-member', { css: 'secondary small' }))}
    <div class="list-search">${search('members')}</div>
    ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : '<p class="muted home-empty">등록된 회원이 없습니다.</p>'}
    <p class="form-note">회원은 등록한 이름과 생년월일 6자리로 처음 로그인합니다.</p>
    ${organizersPanel(organizers, me)}</div>`;
}

export function memberForm(member = null) {
  const birthday = member ? '' : field('생년월일 6자리', 'birthday', '', {
      type: 'password', wide: true, attrs: 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required',
      help: '회원이 첫 로그인에 입력합니다. 가입 처리 후에는 이 화면에서 조회할 수 없어요.',
  });
  return form('member', `<div class="form-grid">${field('이름', 'name', member?.name, { wide: true, attrs: 'maxlength="60" required' })}
    ${birthday}
    ${select('성별', 'gender', genderChoices(), member?.gender)}
    ${textarea('메모 (운영진만 볼 수 있어요)', 'memo', member?.memo, 'rows="3" maxlength="500"')}</div>`
    + (member ? check('활동 회원', 'active', member.active) : ''), member ? '회원 저장' : '회원 등록', member?.id);
}

// 비밀번호 재설정 under 회원 수정, apart from 회원 저장, read by 운영진: the user's layout (one line, three steps, a ※ note)
// matched to what happens (2026-11-27). worker/api.mjs resetMember: a new six-digit temporary number shown once in the
// 접속 안내 (접속 안내 복사), the old number replaced and every sign-in ended, votes and attendance kept, no undo. The member
// signs in with it; a member sets a PIN under 내 기록 (PIN 만들기), one with the 운영 권한 must, from 홈 (내 번호 정하기),
// before the 운영 메뉴 opens (views.mjs pinCard, operating). It still asks once more (app.mjs reset-member). The demo's 회원 수정 (screens.js memberDialog) has the same section.
export function memberAccess(member) {
  return `<section class="member-access" aria-labelledby="member-access-title"><h3 id="member-access-title">비밀번호 재설정</h3>
    <p class="member-access-lead">비밀번호를 잊었거나 로그인이 안 될 때 임시 번호 6자리를 새로 발급합니다. 되돌릴 수 없습니다.</p>
    <ol class="member-access-steps">
      <li>기존 비밀번호는 즉시 삭제되고, 모든 기기에서 로그아웃됩니다.</li>
      <li>발급 후 뜨는 접속 안내(임시 번호 6자리 포함)를 '접속 안내 복사'로 복사해 회원에게 보내 주세요. (창을 닫으면 다시 볼 수 없습니다.)</li>
      <li>회원은 이름과 임시 번호로 로그인한 뒤, 내 기록의 'PIN 만들기'에서 새 번호로 바꿀 수 있습니다. 운영 권한이 있는 회원은 홈의 '내 번호 정하기'로 새 번호를 정해야 운영 메뉴가 열립니다.</li>
    </ol>
    <p class="form-note">※ 기존 투표 및 출석 기록은 그대로 유지됩니다.</p>
    ${button('비밀번호 재설정', 'reset-member', { id: member.id, css: 'secondary', disabled: !member.active, label: `${member.name} 비밀번호 재설정` })}
    ${member.active ? '' : note('활동 중지한 회원은 재설정할 수 없어요. 활동 회원으로 저장한 뒤에 할 수 있어요.')}</section>`;
}

export function noticeForm(notice = null) {
  return form('notice', `<div class="form-grid">${field('제목', 'title', notice?.title, { wide: true, attrs: 'required maxlength="120"' })}
    ${textarea('공지 내용', 'body', notice?.body, 'required maxlength="4000" rows="6"')}</div>`
    + note('공개한 공지는 로그인한 회원이 볼 수 있습니다. 계좌번호와 개인 정보는 공지에서 빼 주세요.')
    + check('링크 공개', 'published', notice?.published), '공지 저장', notice?.id);
}

export function noticesScreen(notices) {
  // 박스 동작 (DESIGN.md 5): 링크 복사 · 상단 고정 · 공지 수정 as icons at the notice's top-right, 더보기 last; the pin icon
  // shows whether it is pinned.
  const items = notices.map(notice => `<article class="notice-item">
    <div class="box-top"><div><div class="notice-date"><time datetime="${esc(notice.date)}">${esc(dateLabel(notice.date))}</time><span>· ${notice.published ? '공개' : '비공개'}</span></div>
      <h2>${esc(notice.title)}</h2></div>
      ${boxActions(
        iconAction('copy', 'copy-notice-link', { id: notice.id, label: `${notice.title} 링크 복사`, disabled: !notice.published }),
        iconAction('pushpin', 'pin-notice', { id: notice.id, label: `${notice.title} 상단 고정`, pressed: Boolean(notice.pinnedAt) }),
        iconAction('edit', 'edit-notice', { id: notice.id, label: `${notice.title} 공지 수정` }),
        // 더보기 holds only 카톡 미리보기, which a notice not yet public cannot use: no empty menu for it.
        notice.published && iconAction('more', 'notice-menu', { id: notice.id, label: `${notice.title} 공지 메뉴` }))}</div>
    ${notice.body ? `<p class="preserve-lines">${esc(notice.body)}</p>` : ''}
  </article>`);
  const shown = notices.filter(notice => notice.published).length;
  return `<div class="plain-page">${pageHead('공지', `공지 ${notices.length}개 · 회원에게 공개 ${shown}개`, button(`${icon('plus', 17)} 새 공지`, 'new-notice', { css: 'secondary small' }))}
    ${items.length ? `<div class="notice-list">${items.join('')}</div>` : '<p class="muted home-empty">등록된 공지가 없습니다.</p>'}</div>`;
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
  return `<div class="plain-page">${pageHead('모임 규칙', '줄서기 인정과 콕 수령을 우리 모임 방식대로 셉니다.')}
    ${panel('집계 기준', form('rules', body, '규칙 저장', '', 'rules-form'))}</div>`;
}

export function progressScreen(year, half, members, rules, gender) {
  const months = periodMonths(Number(half), rules.periods);
  // 콕 수령 as words (단순화 7): 수령 대상 is the one to act on, so it alone is in --court.
  const reward = row => row.rewarded ? word('수령') : row.eligible ? word('수령 대상', 'due') : word('미수령', 'quiet');
  // Every 구간 sits in one cell as a box, green once its goal is met, so a month-by-month club does not push the table
  // past a phone's edge (live.css .period-counts).
  const counts = periods => `<ul class="period-counts">${periods.map((count, index) => `<li${count >= rules.goal ? ' class="period-met"' : ''}><span>${months[index]}</span><strong>${count}<small>/${rules.goal}</small></strong></li>`).join('')}</ul>`;
  const rows = members.map(row => `<tr data-search="${esc(row.name)}" data-gender="${esc(row.gender)}"><td>${memberNameTag(row, esc)}</td>
    <td class="progress-periods">${counts(row.periods)}</td><td>${reward(row)}</td>
    <td class="table-actions">${button(row.rewarded ? '수령 취소' : '수령 기록', 'reward', { id: row.id, css: row.rewarded ? 'text small' : 'secondary small', label: `${row.name} ${row.rewarded ? '수령 취소' : '수령 기록'}` })}</td></tr>`);
  const period = form('progress', `<div class="form-grid">${field('연도', 'year', year, { type: 'number', attrs: 'min="2000" max="2100" step="1" required' })}
    ${select('기간', 'half', [[1, '상반기'], [2, '하반기']], half)}</div>`, '집계 조회', '', 'progress-form');
  const columns = ['회원', `구간별 인정 (목표 ${rules.goal}회)`, '콕 수령', '<span class="sr-only">기록</span>'];
  const genderFilter = `<select data-progress-gender aria-label="성별 필터">
    ${[['all', '전체 성별'], ...genderChoices()].map(([value, label]) => option(value, label, gender)).join('')}
  </select>`;
  const emptyFilter = rows.length ? '<p class="empty-state" role="status" data-progress-empty hidden>조건에 맞는 회원이 없어요.</p>' : '';
  return `<div class="plain-page">${pageHead('반기 집계', `구간마다 줄서기 인정 ${rules.goal}회가 목표예요.`,
    button(`${icon('sliders', 17)} 모임 규칙`, 'tab', { id: 'rules', css: 'secondary small' }))}
    <div class="progress-period">${period}</div>
    ${panel(`${esc(year)}년 ${Number(half) === 1 ? '상반기' : '하반기'} 줄서기 인정`, table(columns, rows, '해당 기간에 확인할 회원이 없습니다.', 'stack-table progress-table') + emptyFilter, {
    actions: `<div class="progress-filters">${genderFilter}${search('progress')}</div>`,
  })}
    <p class="form-note">구간 목표와 구간 나누기는 모임 규칙에서 바꿔요. 지급은 운영진이 확인한 뒤 기록해 주세요.</p></div>`;
}
