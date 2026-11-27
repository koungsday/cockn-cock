// 일정 달력 (DESIGN.md 5): one month, Sunday first, the events on their dates above the 일정 list. The live club
// (worker/public/views.mjs) and the demo (scripts/build.mjs makes calendar.js, window.clubCalendar) draw the same markup
// from here. No imports, as flow.mjs, so the demo build only drops the exports.

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
const dayLabel = date => `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${weekdays[date.getUTCDay()]}요일`;

// month 'YYYY-MM' moved by step months.
export function shiftMonth(month, step) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + step, 1));
  return date.toISOString().slice(0, 7);
}

// events: [{ date 'YYYY-MM-DD', title, kind (its label), done }]. done (지난 일정, 마무리 확정, 취소) is drawn quiet.
// Every visible date is a button, including spillover days. Only the shown month has event markers.
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
    const css = `calendar-day${other ? ' is-other' : ''}${iso === today ? ' is-today' : ''}${list.length ? ' has-events' : ''}${list.length && list.every(event => event.done) ? ' is-done' : ''}`;
    const description = list.length ? ` · ${list.map(event => `${event.kind} ${event.title}`).join(', ')}` : other ? '' : ' · 일정 없음';
    const label = `${dayLabel(date)}${iso === today ? ' 오늘' : ''}${description}`;
    cells.push(`<li class="${css}"><button type="button" class="calendar-date" data-action="calendar-day" data-id="${iso}" aria-pressed="${iso === selected}" aria-label="${escapeText(label)}"${iso === today ? ' aria-current="date"' : ''}>
      <span class="calendar-number">${day}</span></button></li>`);
  }
  return `<div class="calendar" data-month="${month}"${selected ? ' data-selected' : ''}>
    <div class="calendar-head">
      <button type="button" class="icon-button calendar-step" data-action="calendar-month" data-id="prev" aria-label="이전 달">${icon('chevron-left', 18)}</button>
      <h2 class="calendar-title" id="calendar-title">${year}년 ${index}월</h2>
      <button type="button" class="icon-button calendar-step" data-action="calendar-month" data-id="next" aria-label="다음 달">${icon('chevron-right', 18)}</button>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">${weekdays.map(name => `<span>${name}</span>`).join('')}</div>
    <ol class="calendar-days" aria-labelledby="calendar-title">${cells.join('')}</ol>
  </div>`;
}

// The month a calendar-month button opens from the month on screen: prev or next.
export function calendarTarget(month, step) {
  return shiftMonth(month, step === 'next' ? 1 : -1);
}

export function calendarDayPanel(date, rows, { listClass = 'event-list', action = '' } = {}) {
  if (!date) return '';
  const label = dayLabel(new Date(`${date}T00:00:00Z`));
  return `<section class="calendar-selection" aria-labelledby="calendar-selected-title">
    <div class="calendar-selection-head"><div><h3 id="calendar-selected-title"><time datetime="${escapeText(date)}">${label}</time></h3>
      ${rows.length ? '' : '<p>이 날짜에 일정이 없어요.</p>'}</div>${action}</div>
    ${rows.length ? `<ul class="${listClass}">${rows.join('')}</ul>` : ''}
  </section>`;
}
