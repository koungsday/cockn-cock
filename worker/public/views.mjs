const escapeChars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => escapeChars[char]);
}

const days = ['일', '월', '화', '수', '목', '금', '토'];
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function today() {
  return dateFormatter.format(new Date());
}

export function dateLabel(date) {
  if (!date) return '';
  const [, month, day] = date.split('-');
  const weekday = days[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return weekday ? `${Number(month)}월 ${Number(day)}일 (${weekday})` : date;
}

function addDays(date, daysToAdd) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + daysToAdd);
  return value.toISOString().slice(0, 10);
}

export function eventDefaults(previous = null) {
  if (previous) {
    return {
      ...previous,
      date: addDays(previous.date, 7),
      deadline: `${addDays(previous.deadline.slice(0, 10), 7)}${previous.deadline.slice(10)}`,
      open: false,
      published: false,
    };
  }
  const base = today();
  const weekday = new Date(`${base}T00:00:00Z`).getUTCDay();
  const date = addDays(base, (7 - weekday) % 7);
  return {
    title: '일요 운동', date, time: '10:00', endTime: '13:00',
    earlyTime: '09:30', lateTime: '09:50', place: '당고개 배드민턴체육관',
    deadline: `${addDays(date, -1)}T15:30`, notes: '', open: false, published: false,
  };
}

export function button(text, action, { id = '', css = '', disabled = false } = {}) {
  return `<button type="button"${css ? ` class="${css}"` : ''} data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}>${text}</button>`;
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
}

function field(label, name, value = '', { type = 'text', attrs = '', wide = false, help = '' } = {}) {
  return `<label class="field${wide ? ' wide' : ''}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}>${help ? `<small>${help}</small>` : ''}</label>`;
}

function textarea(label, name, value, attrs = '') {
  return `<label class="field"><span>${label}</span><textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
}

function check(label, name, checked = false, attrs = '') {
  return `<label class="check"><input type="checkbox" name="${name}"${checked ? ' checked' : ''} ${attrs}><span>${label}</span></label>`;
}

function select(label, name, choices, current) {
  return `<label class="field"><span>${label}</span><select name="${name}">${choices.map(([value, text]) => option(value, text, current)).join('')}</select></label>`;
}

function form(kind, body, label, id = '') {
  return `<form class="form" data-form="${kind}"${id ? ` data-id="${esc(id)}"` : ''}>${body}<button type="submit">${label}</button></form>`;
}

function list(items, empty) {
  return items.length ? `<ul class="rows">${items.join('')}</ul>` : `<p class="muted">${empty}</p>`;
}

export function dateLine(event) {
  return `${dateLabel(event.date)} ${event.time}–${event.endTime}`;
}

export function deadlineLabel(deadline) {
  const [day, time] = String(deadline ?? '').split('T');
  return day && time ? `${dateLabel(day)} ${time}` : '운영진에게 확인';
}

export function hero(title, type, meta = []) {
  return `<div class="hero"><p class="tagline">${esc(type)}</p><h1>${esc(title)}</h1>${meta.length ? `<div class="hero-meta">${meta.map(line => `<span>${esc(line)}</span>`).join('')}</div>` : ''}</div>`;
}

function voteLabel(slot, event) {
  if (slot === 'early') return `${event.earlyTime || '선발'}${event.earlyTime ? ' 선발' : ''}`;
  if (slot === 'late') return `${event.lateTime || '후발'}${event.lateTime ? ' 후발' : ''}`;
  if (slot === 'no') return '불참';
  return '미응답';
}

export function loginForm(admin = false) {
  const member = admin ? '<input type="hidden" name="memberCode" value="admin">' : field('회원 코드', 'memberCode', '', {
    attrs: 'autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="128" required',
    help: '운영진이 개인에게 보내준 코드를 입력해 주세요.',
  });
  const password = field(admin ? '운영진 비밀번호' : '생년월일 또는 PIN', 'credential', '', {
    type: 'password',
    attrs: admin ? 'autocomplete="current-password" required' : 'autocomplete="current-password" maxlength="20" required',
    help: admin ? '' : '처음이면 생년월일 8자리, 재설정한 경우에는 운영진에게 받은 임시 번호를 입력합니다.',
  });
  return form('login', member + password, admin ? '운영진 로그인' : '회원 로그인');
}

export function pinForm(mustChange) {
  return form('pin', field(mustChange ? '처음 로그인한 번호' : '현재 PIN', 'currentPin', '', {
    type: 'password', attrs: 'autocomplete="current-password" pattern="[0-9a-fA-F]{6,20}" maxlength="20" required',
    help: mustChange ? '처음 로그인에 사용한 생년월일 또는 임시 번호를 한 번 더 입력해 주세요.' : '',
  }) + field('새 PIN', 'newPin', '', {
    type: 'password', attrs: 'autocomplete="new-password" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required',
    help: '6~10자리 숫자를 사용해 주세요. 생년월일과 연속·반복 숫자는 피해주세요.',
  }) + field('새 PIN 확인', 'confirmPin', '', {
    type: 'password', attrs: 'autocomplete="new-password" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required',
  }), mustChange ? 'PIN 정하고 계속하기' : 'PIN 변경');
}

export function memberVoteScreen(event, user, vote, eligible) {
  const head = hero(event.title, '일요 운동 참석 투표', [dateLine(event), event.place]);
  const hint = `<div class="help-box">응답 마감 ${esc(deadlineLabel(event.deadline))}${event.notes ? `<p class="preserve">${esc(event.notes)}</p>` : ''}</div>`;
  let panel = '<p>투표가 마감됐습니다.</p>';
  if (user?.role === 'admin') {
    panel = '<p>운영진 화면에서 응답을 확인하거나 수정할 수 있어요.</p><a class="button secondary" href="/">운영진 화면 열기</a>';
  } else if (user?.mustChange) {
    panel = '<h2>사용할 PIN을 정해 주세요</h2><p>다음부터는 생년월일 대신 새 PIN으로 로그인합니다.</p>' + pinForm(true);
  } else if (event.canVote && !user) {
    panel = '<h2>운동 참석을 알려 주세요</h2>' + loginForm();
  } else if (event.canVote && eligible && user) {
    panel = '<h2>운동 참석을 알려 주세요</h2>' + form('vote', voteFields(event, vote), vote ? '응답 변경' : '응답 저장', event.id);
  } else if (user && !eligible && event.canVote) {
    panel = '<h2>이 회차에 응답할 수 없어요</h2><p>운영진에게 참석 명단을 확인해 주세요.</p>';
  }
  const current = vote ? `<p role="status" class="badge">내 응답 ${esc(voteLabel(vote.slot, event))}${vote.lunch ? ' / 점심 참여' : ''}</p>` : '';
  return `<div class="stack">${head}${hint}<section class="panel">${current}${panel}</section></div>`;
}

export function noticeScreen(notice) {
  return `<div class="stack">${hero(notice.title, '모임 공지', [dateLabel(notice.date)])}<article class="panel preserve">${esc(notice.body)}</article></div>`;
}

function voteFields(event, vote) {
  const choices = [['early', voteLabel('early', event)], ['late', voteLabel('late', event)], ['no', '운동 불참']];
  return `<fieldset class="choice-group"><legend>운동 선택</legend>${choices.map(([slot, label]) => `<label class="choice"><input type="radio" name="slot" value="${slot}"${vote?.slot === slot ? ' checked' : ''} required><strong>${esc(label)}</strong></label>`).join('')}</fieldset>` + check('점심 식사에도 참여해요', 'lunch', vote?.lunch);
}

export function adminShell(section, contents) {
  const tabs = [['event', '운동 운영'], ['members', '회원 관리'], ['progress', '반기 집계'], ['notices', '공지']];
  return `<div class="stack stack-wide"><nav class="tabbar" aria-label="운영 메뉴">${tabs.map(([name, title]) => `<button type="button" data-action="tab" data-id="${name}"${section === name ? ' aria-current="page"' : ''}>${title}</button>`).join('')}</nav>${contents}</div>`;
}

export function homeScreen(user, adminLogin) {
  if (user?.mustChange) {
    return `<div class="stack">${hero('사용할 PIN을 정해 주세요', '회원 인증')}<section class="panel">${pinForm(true)}</section></div>`;
  }
  if (user) {
    return `<div class="stack">${hero('일요 운동 참석 투표', '썬콕19')}<section class="panel"><p>카카오톡 단체방에서 받은 투표 링크를 열어 주세요. 응답과 변경 사항은 운영진 화면에 바로 반영됩니다.</p></section></div>`;
  }
  const label = adminLogin ? '회원 로그인' : '운영진 로그인';
  return `<div class="stack">${hero('일요 모임 운영', '썬콕19')}<section class="panel"><h2>${adminLogin ? '운영진 로그인' : '회원 로그인'}</h2>${loginForm(adminLogin)}${button(label, 'login-mode', { css: 'quiet' })}</section></div>`;
}

export function eventForm(event, id = '') {
  const head = !id ? '<p class="help">일시, 장소와 마감 시각을 확인해 주세요. 새 회차는 준비 상태로 저장할 수 있어요.</p>' : '';
  return form('event',
    head + `<div class="fields">
      ${field('모임 이름', 'title', event.title, { wide: true, attrs: 'required maxlength="120"' })}
      ${field('날짜', 'date', event.date, { type: 'date', attrs: 'required' })}
      ${field('장소', 'place', event.place, { attrs: 'required maxlength="120"' })}
      ${field('운동 시작', 'time', event.time, { type: 'time', attrs: 'required' })}
      ${field('운동 종료', 'endTime', event.endTime, { type: 'time', attrs: 'required' })}
      ${field('선발 모임', 'earlyTime', event.earlyTime, { type: 'time', attrs: 'required' })}
      ${field('후발 모임', 'lateTime', event.lateTime, { type: 'time', attrs: 'required' })}
      ${field('투표 마감 (한국 시간)', 'deadline', event.deadline, { type: 'datetime-local', wide: true, attrs: 'required' })}
    </div>`
    + textarea('공개 안내', 'notes', event.notes, 'maxlength="3000" placeholder="날짜별 준비물이나 안내를 적어 주세요."')
    + '<p class="help">투표 링크에서 누구나 볼 수 있는 안내입니다. 개인 연락처와 회원 명단은 별도로 전달해 주세요.</p>'
    + check('카톡 공유 링크 공개', 'published', event.published)
    + check('웹 투표 열기', 'open', event.open),
    id ? '회차 저장' : '회차 만들기', id);
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

export function voteMetrics(counts) {
  const items = [
    ['선발', counts.early], ['후발', counts.late], ['불참', counts.no],
    ['점심', counts.lunch], ['실제 운동', counts.members + counts.guests],
  ];
  return `<dl class="metrics">${items.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
}

export function eventScreen(events, detail) {
  const event = detail?.event;
  const top = `<div class="page-head"><div class="heading-line"><h1>운동 운영</h1><div class="actions">${button('새 회차', 'new-event')}${event ? button('다음 주 복제', 'clone-event', { css: 'secondary' }) : ''}</div></div>
    ${events.length ? select('확인할 회차', 'event-id', events.map(item => [item.id, `${dateLabel(item.date)} ${item.title}`]), event?.id).replace('<select ', '<select data-action="switch-event" ') : ''}</div>`;
  if (!event) return top + '<section class="panel"><p>회차를 만들면 참석 투표와 당일 체크를 시작할 수 있어요.</p></section>';
  const { roster, guests, settlement } = detail;
  const counts = countEvent(roster, guests);
  const parts = [
    hero(event.title, event.published ? '공개 중' : '비공개 준비', [dateLine(event), event.place, `마감 ${deadlineLabel(event.deadline)}`]),
    `<section class="panel full"><div class="heading-line"><h2>웹 참석 투표</h2><div class="actions">
      ${button('회차 수정', 'edit-event', { css: 'secondary' })}
      ${button(event.published ? '공개 내리기' : '링크 공개', 'publish-event', { css: 'secondary' })}
      ${button(event.open ? '투표 닫기' : '투표 열기', 'toggle-vote', { css: 'secondary', disabled: !event.published })}
      ${button('카톡 링크 복사', 'copy-vote', { disabled: !event.published })}
    </div></div>
    <div id="vote-counts">${voteMetrics(counts)}</div>
    ${event.published ? `<a href="/vote/${esc(event.id)}" target="_blank" rel="noopener">공유 화면 보기</a>` : ''}
    ${event.open && !event.canVote ? '<p class="help">투표 마감 시각이 지났습니다. 다시 받으려면 마감 시각을 먼저 변경해 주세요.</p>' : ''}
    </section>`,
    attendancePanel(event, roster, counts, settlement?.confirmed),
    `<div class="stack">${guestsPanel(guests, settlement?.confirmed)}${settlementPanel(settlement, counts)}</div>`,
  ];
  return top + `<div class="stack">${parts[0]}<div class="layout">${parts.slice(1).join('')}</div></div>`;
}

const recognitionLabel = { direct: '직접 인정', substitute: '대타 인정', approved: '별도 승인' };

function attendancePanel(event, roster, counts, confirmed) {
  const favor = row => row.slot === 'early' ? 0 : row.slot === 'late' ? 1 : 2;
  const rows = [...roster].sort((a, b) => favor(a) - favor(b) || a.name.localeCompare(b.name, 'ko')).map(person => {
    const stand = person.present === true ? '출석' : person.present === false ? '불참 확인' : '미확인';
    const vote = voteLabel(person.slot, event);
    return `<li class="row member-row" data-search="${esc(person.name)}" data-selected="${person.present === true}"><div class="person">
      <b>${esc(person.name)}</b> <span class="badge">${stand}</span>
      <p class="sub">${esc(vote)}${person.lunch ? ' / 점심' : ''}${person.recognition ? ` / ${recognitionLabel[person.recognition] ?? ''}` : ''}</p></div>
      <div class="actions">${button(person.present === true ? '출석 취소' : '출석 체크', 'mark-present', { id: person.id, css: person.present === true ? 'secondary compact' : 'compact', disabled: confirmed })}
      ${button('상세', 'attendance', { id: person.id, css: 'quiet compact', disabled: confirmed })}${button('응답 변경', 'vote-override', { id: person.id, css: 'quiet compact' })}</div></li>`;
  });
  return `<section class="panel" id="attendance"><div class="heading-line"><h2>당일 출석</h2><div class="actions"><span class="badge">${counts.members}명 출석 / ${counts.unmarked}명 미확인</span>${button('명단 새로고침', 'refresh', { css: 'quiet compact' })}</div></div>
    <p class="help">${confirmed ? '마무리한 회차입니다. 출석을 고치려면 마무리 확인을 먼저 해제해 주세요.' : '실제 출석과 줄서기 인정은 따로 기록합니다.'}</p>
    ${search('회원 이름 검색', 'attendance')}${list(rows, '이 회차에 등록된 회원이 없습니다.')}
  </section>`;
}

function search(label, target) {
  return `<label class="field"><span>${label}</span><input type="search" data-filter="${target}" maxlength="80" autocomplete="off"></label>`;
}

export function attendanceForm(person) {
  return form('attendance',
    '<p class="help">대타 인정은 당일 운동 출석도 함께 체크해 주세요. 별도 승인 사유와 증빙은 이 화면에 기록하지 않습니다.</p>'
    + select('실제 출석', 'present', [['', '미확인'], ['true', '출석'], ['false', '불참 확인']], person.present)
    + select('줄서기 인정', 'recognition', [['', '해당 없음'], ...Object.entries(recognitionLabel)], person.recognition), '기록 저장', person.id);
}

export function overrideForm(event, person) {
  return form('vote-override', '<p class="help">운영진이 회원의 응답을 대신 변경합니다.</p>' + voteFields(event, person), '응답 저장', person.id)
    + (person.slot ? button('응답 삭제', 'clear-vote', { id: person.id, css: 'quiet' }) : '');
}

const guestStatus = { pending: '신청', confirmed: '확정', arrived: '도착', cancelled: '취소' };

function guestsPanel(guests, confirmed) {
  const lines = guests.map(guest => `<li class="row"><div><b>${esc(guest.name)}</b> <span class="badge">${guestStatus[guest.status] ?? ''}</span><p class="sub">${esc([guest.level, guest.invitedBy, guest.paid ? '비용 확인' : '비용 미확인'].filter(Boolean).join(' / '))}</p></div>${button('수정', 'edit-guest', { id: guest.id, css: 'secondary compact', disabled: confirmed })}</li>`);
  return `<section class="panel" id="guests"><div class="heading-line"><h2>게스트</h2>${button('게스트 추가', 'new-guest', { css: 'secondary compact', disabled: confirmed })}</div>${list(lines, '등록된 게스트가 없습니다.')}</section>`;
}

export function guestForm(guest = null) {
  return form('guest',
    field('이름', 'name', guest?.name, { attrs: 'required maxlength="60"' })
    + field('급수 (선택)', 'level', guest?.level, { attrs: 'maxlength="30"' })
    + field('초대한 회원 (선택)', 'invitedBy', guest?.invitedBy, { attrs: 'maxlength="60"' })
    + select('상태', 'status', Object.entries(guestStatus), guest?.status ?? 'pending')
    + check('게스트 비용 확인', 'paid', guest?.paid), guest ? '게스트 저장' : '게스트 등록', guest?.id);
}

export function settlementPanel(value, counts) {
  const s = value ?? {};
  const numbers = [
    ['이전 이월 (낱개)', 'priorSingles'], ['이전 이월 (타)', 'priorTubes'], ['당일 잔여 (낱개)', 'remainingSingles'], ['코트 찬조금 (원)', 'courtDonation'],
  ].map(([label, key]) => field(label, key, s[key] ?? 0, {
    type: 'number', attrs: 'min="0" max="10000000" step="1" required',
  })).join('');
  return `<section class="panel" id="settlement"><h2>모임 마무리</h2>
    <p>실제 참석 ${counts.members + counts.guests}명. 회원 ${counts.members}명, 게스트 ${counts.guests}명.</p>
    ${counts.unmarked ? `<p class="help">출석을 확인하지 않은 회원 ${counts.unmarked}명은 마무리 집계에서 빠집니다.</p>` : ''}
    ${form('settlement', `<div class="fields">${numbers}</div>` + check('마무리 집계를 확인했어요', 'confirmed', s.confirmed)
      + (s.confirmed ? '<p class="help">확인을 해제하고 저장하면 출석과 게스트를 다시 편집할 수 있습니다.</p>' : ''), '마무리 기록 저장')}
    ${button('마무리 글 복사', 'copy-report', { css: 'secondary', disabled: !s.confirmed })}
  </section>`;
}

export function reportText(detail) {
  const { event, roster, guests, settlement: s } = detail;
  const c = countEvent(roster, guests);
  return [
    `썬콕19 ${event.title} 마무리`,
    `${dateLine(event)} / ${event.place}`,
    `실제 참석 ${c.members + c.guests}명 (회원 ${c.members}명, 게스트 ${c.guests}명)`,
    `콕 이월 ${s.priorSingles + s.remainingSingles}개 + ${s.priorTubes}타 (이전 ${s.priorSingles}개 + ${s.priorTubes}타, 당일 잔여 ${s.remainingSingles}개)`,
    `코트 찬조금 ${Number(s.courtDonation).toLocaleString('ko-KR')}원`,
  ].join('\n');
}

export function membersScreen(members) {
  const rows = members.map(member => `<li class="row" data-search="${esc(member.name)}"><div><b>${esc(member.name)}</b> <span class="badge">${member.active ? '활동 중' : '비활성'}</span></div><div class="actions">
    ${button('회원 수정', 'edit-member', { id: member.id, css: 'secondary compact' })}${button('접속 재설정', 'reset-member', { id: member.id, css: 'quiet compact', disabled: !member.active })}</div></li>`);
  return `<div class="stack"><div class="heading-line"><h1>회원 관리</h1>${button('회원 추가', 'new-member')}</div>
    <section class="panel"><p class="help">회원 코드는 가입할 때 한 번 보여드립니다. 개인 메시지로 전달해 주세요.</p>
    ${search('회원 이름 검색', 'members')}${list(rows, '등록된 회원이 없습니다.')}</section></div>`;
}

export function memberForm(member = null) {
  return form('member',
    field('이름', 'name', member?.name, { attrs: 'maxlength="60" required' })
    + (member ? check('활동 회원', 'active', member.active) : field('생년월일 8자리', 'birthday', '', {
      type: 'password', attrs: 'inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off" required',
      help: '회원이 첫 로그인에 입력합니다. 가입 처리 후에는 이 화면에서 조회할 수 없어요.',
    })), member ? '회원 저장' : '등록하고 회원 코드 받기', member?.id);
}

export function noticeForm(notice = null) {
  return form('notice',
    field('제목', 'title', notice?.title, { attrs: 'required maxlength="120"' })
    + textarea('공지 내용', 'body', notice?.body, 'required maxlength="4000"')
    + '<p class="help">공개한 공지는 링크를 가진 누구나 볼 수 있습니다. 계좌번호와 개인 정보는 공지에서 빼 주세요.</p>'
    + check('링크 공개', 'published', notice?.published), '공지 저장', notice?.id);
}

export function noticesScreen(notices) {
  const rows = notices.map(notice => `<li class="row"><div><b>${esc(notice.title)}</b> <span class="badge">${notice.published ? '공개' : '비공개'}</span>
    <p class="sub">${esc(dateLabel(notice.date))}</p></div><div class="actions">
    ${button('공지 수정', 'edit-notice', { id: notice.id, css: 'secondary compact' })}
    ${button('카톡 링크 복사', 'copy-notice', { id: notice.id, css: 'compact', disabled: !notice.published })}</div></li>`);
  return `<div class="stack"><div class="heading-line"><h1>공지</h1>${button('새 공지', 'new-notice')}</div><section class="panel">${list(rows, '등록된 공지가 없습니다.')}</section></div>`;
}

export function progressScreen(year, half, members) {
  const rows = members.map(row => `<li class="row" data-search="${esc(row.name)}"><div><b>${esc(row.name)}</b><p class="sub">1차 ${row.first}/3 · 2차 ${row.second}/3</p></div>${button(row.rewarded ? '수령 취소' : '수령 기록', 'reward', { id: row.id, css: 'secondary compact' })}</li>`);
  return `<div class="stack"><h1>반기 집계</h1><section class="panel">${form('progress',
    `<div class="fields">${field('연도', 'year', year, { type: 'number', attrs: 'min="2000" max="2100" step="1" required' })}${select('기간', 'half', [[1, '상반기'], [2, '하반기']], half)}</div>`,
    '집계 조회')}${search('회원 이름 검색', 'progress')}${list(rows, '해당 기간에 확인할 회원이 없습니다.')}
    <p class="help">각 구간에서 줄서기 인정을 받은 횟수입니다. 지급은 운영진이 확인한 뒤 기록해 주세요.</p></section></div>`;
}
