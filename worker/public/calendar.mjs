// 일정 달력 (DESIGN.md 5): one month, Sunday first, the events on their dates above the 일정 list. The live club
// (worker/public/views.mjs) and the demo (scripts/build.mjs makes calendar.js, window.clubCalendar) draw the same markup
// from here. No imports, as flow.mjs, so the demo build only drops the exports.

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);

// month 'YYYY-MM' moved by step months.
export function shiftMonth(month, step) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + step, 1));
  return date.toISOString().slice(0, 7);
}

// events: [{ date 'YYYY-MM-DD', title, kind (its label), regular, done }]. done (지난 일정, 마무리 확정, 취소) is drawn quiet.
// A date with events is a button (calendar-day): it marks that date's rows in the list below (pickCalendarDay).
export function calendarBlock(events, { month, today, selected = '', icon }) {
  const [year, index] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(year, index - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const byDate = new Map();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  const cells = [];
  for (let cell = 0; cell < Math.ceil((lead + length) / 7) * 7; cell++) {
    const date = new Date(Date.UTC(year, index - 1, 1 - lead + cell));
    const iso = date.toISOString().slice(0, 10);
    const other = date.getUTCMonth() !== index - 1;
    const day = date.getUTCDate();
    const list = other ? [] : byDate.get(iso) ?? [];
    const css = `calendar-day${other ? ' is-other' : ''}${iso === today ? ' is-today' : ''}`;
    if (!list.length) {
      cells.push(`<li class="${css}" aria-hidden="true"><span class="calendar-slot"><span class="calendar-number">${day}</span></span></li>`);
      continue;
    }
    const [first] = list;
    const label = `${index}월 ${day}일 ${weekdays[date.getUTCDay()]}요일${iso === today ? ' 오늘' : ''} · ${list.map(event => `${event.kind} ${event.title}`).join(', ')}`;
    cells.push(`<li class="${css}"><button type="button" class="calendar-date" data-action="calendar-day" data-id="${iso}" aria-pressed="${iso === selected}" aria-label="${escapeText(label)}">
      <span class="calendar-number">${day}</span><span class="calendar-kind${first.done ? ' is-done' : first.regular ? '' : ' is-special'}">${escapeText(first.kind)}${list.length > 1 ? `<small>+${list.length - 1}</small>` : ''}</span><span class="calendar-name">${escapeText(first.title)}</span></button></li>`);
  }
  return `<div class="calendar" data-month="${month}">
    <div class="calendar-head">
      <h2 class="calendar-title" id="calendar-title">${year}년 ${index}월</h2>
      <div class="calendar-steps">
        <button type="button" class="icon-button calendar-step" data-action="calendar-month" data-id="prev" aria-label="이전 달">${icon('chevron-left', 18)}</button>
        <button type="button" class="btn btn-small btn-secondary calendar-today" data-action="calendar-month" data-id="today">오늘</button>
        <button type="button" class="icon-button calendar-step" data-action="calendar-month" data-id="next" aria-label="다음 달">${icon('chevron-right', 18)}</button>
      </div>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">${weekdays.map(name => `<span>${name}</span>`).join('')}</div>
    <ol class="calendar-days" aria-labelledby="calendar-title">${cells.join('')}</ol>
  </div>`;
}

// The month a calendar-month button opens from the month on screen: prev, next, or today's.
export function calendarTarget(month, step, today) {
  return step === 'today' ? today.slice(0, 7) : shiftMonth(month, step === 'next' ? 1 : -1);
}

// A date picked on the calendar: its button pressed, its rows in the list below marked and brought into view (a
// finished one folded under 끝난 일정 opens it). The list is not redrawn, so nothing else moves.
export function pickCalendarDay(root, date, smooth) {
  for (const button of root.querySelectorAll('.calendar-date')) button.setAttribute('aria-pressed', String(button.dataset.id === date));
  const rows = [...root.querySelectorAll('[data-date]')];
  for (const row of rows) row.classList.toggle('is-picked', row.dataset.date === date);
  const first = rows.find(row => row.dataset.date === date);
  if (!first) return;
  const folded = first.closest('details:not([open])');
  if (folded) folded.open = true;
  first.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
}
