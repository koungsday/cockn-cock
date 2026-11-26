// 일정 흐름 (FLOW.md): each event's stage, worked out from what is saved, and the order the 운영 홈 shows unfinished
// events in. No imports, so worker/flow.test.mjs runs it as it is and the club UI bundles it (worker/prepare.mjs).
//
// now: { day: 'YYYY-MM-DD', minute: 'YYYY-MM-DDTHH:MM' }, both Korean time, as events store date and deadline.

// draft 준비 (not public) · waiting 투표 대기 (public, closed, before the deadline) · voting 투표 중 · closed 투표 마감
// (deadline passed, before the day) · today 당일 · wrapup 마무리 전 (day passed, 마무리 not confirmed) · done 끝.
export function eventStage(event, now) {
  if (event.settled) return 'done';
  if (event.date < now.day) return 'wrapup';
  if (event.date === now.day) return 'today';
  if (!event.published) return 'draft';
  if (event.deadline <= now.minute) return 'closed';
  return event.open ? 'voting' : 'waiting';
}

// FLOW.md 4장: 오늘 → 마감 24시간 안의 투표 → 마무리 전(오래된 것부터) → 열린 투표 → 비공개 준비 → 그 외 예정.
// Votes within a rank go by deadline, the rest by date and time. 상단 고정 comes first once events can be pinned.
export function flowOrder(events, now) {
  const soon = new Date(Date.parse(now.minute + ':00Z') + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const rank = event => {
    const stage = eventStage(event, now);
    if (stage === 'today') return 0;
    if (stage === 'voting') return event.deadline <= soon ? 1 : 3;
    if (stage === 'wrapup') return 2;
    if (stage === 'draft') return 4;
    return 5;
  };
  const key = event => [1, 3].includes(rank(event)) ? event.deadline : `${event.date}T${event.time}`;
  return events.filter(event => eventStage(event, now) !== 'done')
    .sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

// Korean time now, as eventStage and flowOrder read it.
export function koreanNow(ms = Date.now()) {
  const minute = new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return { day: minute.slice(0, 10), minute };
}
