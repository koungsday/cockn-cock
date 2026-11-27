(() => {
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const voteLabels = { early: '선발', late: '후발', yes: '참석 · 시간 미정', no: '불참' };
  const recognitionLabels = {direct: '직접', substitute: '대타', approved: '별도 인정'};

  function makeView(helpers) {
    const { escape: e, icon, dateLabel, today, counts, attendanceCounts, stats, deadlinePassed, settlement, qualification,
      flowEvents, flowFacts, finishedEvents, pinMark, kindPrefix, kindLabels, defaultTab, calendar, calendarOpen, calendarToggle, selectedCalendarDate } = helpers;
    const { genderChoices, memberNameTag } = window.clubMemberLabel;

    function action(text, name, id, options = {}) {
      const { tone = 'secondary', symbol, extra = '' } = options;
      return `<button class="btn btn-${tone}" type="button" data-action="${name}"${id ? ` data-id="${e(id)}"` : ''} ${extra}>${symbol ? icon(symbol) : ''}${text}</button>`;
    }

    // 박스 오른쪽 위 아이콘 (the live iconAction / boxActions, DESIGN.md 5 박스 동작): no border or fill at rest, a filled
    // square on hover; a pressed toggle (상단 고정) is drawn filled. 더보기 goes last.
    function iconAction(glyph, name, id, label, { kind = '', pressed = null, disabled = false } = {}) {
      return `<button class="icon-button box-action" type="button" data-action="${name}"${id ? ` data-id="${e(id)}"` : ''}${kind ? ` data-kind="${kind}"` : ''} aria-label="${e(label)}" title="${e(label)}"${pressed === null ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' disabled' : ''}>${icon(glyph, 20)}</button>`;
    }
    function boxActions(...actions) {
      return `<div class="box-actions">${actions.filter(Boolean).join('')}</div>`;
    }

    // The one create action at the end of a screen's head line (the live pageHead): + and its name.
    function addButton(label, name) {
      return `<button class="btn btn-secondary btn-small" type="button" data-action="${name}">${icon('plus', 17)} ${e(label)}</button>`;
    }

    function routeLink(text, route, tone = 'text', symbol = '') {
      return `<a class="btn btn-${tone}" href="#${e(route)}" data-route="${e(route)}">${symbol ? icon(symbol) : ''}${text}</a>`;
    }

    // The head of a screen (the live pageHead): the top bar already names it, so the h1 is for reading programs; what
    // shows is one quiet line and one action.
    function heading(title, description, actions = '') {
      return `<header class="list-tools"><h1 class="sr-only">${title}</h1><p>${description}</p>${actions}</header>`;
    }

    function panel(title, content, options = {}) {
      const { subtitle = '', actions = '' } = options;
      return `<section class="panel"><header class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header><div class="panel-body">${content}</div></section>`;
    }

    function empty(message) {
      return `<p class="empty-state">${message}</p>`;
    }

    function table(columns, rows, css = '') {
      return `<div class="data-table-wrap"><table class="data-table${css ? ` ${css}` : ''}"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function eventPath(event, tab = 'poll') {
      return `event/${encodeURIComponent(event.id)}/${tab}`;
    }

    function eventTime(event) {
      return `${e(event.time)}–${e(event.endTime)}`;
    }

    // One event in the 일정 list: the whole row opens its detail (the live eventLink, FLOW.md 5 운영 일정 화면).
    function eventLink(event, title, detail) {
      const path = eventPath(event, defaultTab(event));
      return `<li data-date="${e(event.date)}"><a class="event-link" href="#${path}" data-route="${path}"><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron-right', 18)}</a></li>`;
    }

    // 일정 (the live eventList): a count line with the calendar toggle and 새 일정, the month's calendar, every
    // unfinished event in the 운영 홈 order as rows on the page, then the finished ones folded under 끝난 일정.
    function eventList(state) {
      const flows = flowEvents();
      const selected = selectedCalendarDate();
      const flowRow = event => {
        const { title, detail } = flowFacts(event);
        return eventLink(event, title, detail);
      };
      const pastRow = event => eventLink(event, e(event.title), e(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${event.cancelled ? '취소' : '마무리 완료'}`));
      const rows = flows.filter(event => event.date !== selected).map(flowRow);
      const past = finishedEvents();
      const pastRows = past.filter(event => event.date !== selected).map(pastRow);
      const dayRows = selected ? state.events.filter(event => event.date === selected).sort((a, b) => a.time.localeCompare(b.time))
        .map(event => past.includes(event) ? pastRow(event) : flowRow(event)) : [];
      const add = selected ? action(`${icon('plus', 16)} 일정 추가`, 'new-event', selected, {tone:'text btn-small'}) : '';
      return `<header class="list-tools"><h1 class="sr-only">일정</h1><p>진행 중 ${flows.length}개</p>
          ${calendarToggle()}</header>`
        + window.clubCalendar.calendarPanel(calendarOpen() ? calendar(state.events)
          + window.clubCalendar.calendarDayPanel(selected, dayRows, {action:add}) : '')
        + `<div class="calendar-other-dates">${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : selected ? '' : '<p class="muted home-empty">진행 중인 일정이 없어요. 새 일정을 만들어 투표를 시작하세요.</p>'}
        ${pastRows.length ? `<details class="event-past"><summary>끝난 일정 ${pastRows.length}개${icon('chevron-right', 16)}</summary><ul class="event-list">${pastRows.join('')}</ul></details>` : ''}</div>`;
    }

    function eventDetail(route, state) {
      const event = state.events.find(item => item.id === route.id);
      if (!event) return heading('일정', '일정을 찾을 수 없어요.', routeLink('일정 목록', 'events', 'secondary btn-small'));
      const pollAvailable = event.pollOpen && !event.finalized && !deadlinePassed(event);
      const nav = `<nav class="tabs" aria-label="일정 단계">${[['poll', '참석 투표'], ['attendance', '출석 체크'], ['settlement', '마무리']].map(([tab, label]) => {
        const path = eventPath(event, tab);
        const active = tab === route.tab;
        return `<a href="#${path}" data-route="${path}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
      }).join('')}</nav>`;
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
      const slotLabel = vote => vote === 'early' ? `${event.earlyTime} 선발` : vote === 'late' ? `${event.lateTime} 후발` : voteLabels[vote] || '미응답';

      // 참석 투표 (the live vote box and voteRoster): the numbers and the link to share, then who has not answered, then
      // everyone who has, folded. 응답 변경 opens 응답 조정 with that member picked.
      function poll() {
        const report = counts(event);
        const responded = report.yes + report.no + report.waiting;
        const row = (member, detail) => `<li><span>${memberNameTag(member, e)}${detail ? `<small>${e(detail)}</small>` : ''}</span>${event.finalized ? ''
          : action('응답 변경', 'open-vote', event.id, {tone: 'text btn-small', extra: `data-kind="${e(member.id)}" aria-label="${e(member.name)} 응답 변경"`})}</li>`;
        const silent = members.filter(member => !event.votes[member.id]);
        const closed = !event.cancelled && !pollAvailable && (event.voteClosed || deadlinePassed(event) || Object.values(event.votes).some(Boolean));
        const order = {early: 0, late: 1, yes: 1, no: 2};
        const position = member => window.clubModel.waitingPosition(event, member.id);
        const waiting = members.filter(position).sort((a, b) => position(a) - position(b));
        const answered = members.filter(member => event.votes[member.id] && !position(member)).sort((a, b) => order[event.votes[a.id]] - order[event.votes[b.id]]);
        return `<section class="vote-box" aria-label="참석 투표 현황"><div id="vote-counts"><p class="vote-total">응답 ${responded} / ${report.total}명</p>
            ${event.capacity ? `<p class="muted">정원 ${event.capacity}명 · 확정 ${report.yes}명 · 대기 ${report.waiting}명</p>` : ''}
            <p class="muted">선발 ${report.early} · 후발 ${report.late} · 불참 ${report.no} · 점심 ${report.lunch}</p>
            <svg class="now-meter" viewBox="0 0 ${Math.max(report.total, 1)} 1" preserveAspectRatio="none" role="img" aria-label="응답 ${responded}/${report.total}명"><rect width="${responded}" height="1"/></svg></div>
            <div class="now-actions">${action(closed ? '마감 안내 복사' : '투표 링크 복사', closed ? 'copy-vote-closed' : 'copy-link', event.id, {tone: pollAvailable || closed ? 'primary' : 'secondary', extra: 'data-kind="vote"'})}</div>
            ${pollAvailable && members.length ? `<a class="btn btn-text now-own" href="#public-vote/${encodeURIComponent(event.id)}" data-route="public-vote/${encodeURIComponent(event.id)}">회원 화면 체험</a>` : ''}</section>
          <section class="vote-roster" aria-label="응답 명단"><header class="list-tools"><h2>미응답 ${silent.length}명</h2></header>
            ${silent.length ? `<ul class="name-list">${silent.map(member => row(member, '')).join('')}</ul>` : `<p class="muted home-empty">${members.length ? '모두 응답했어요.' : '이 일정에 등록된 멤버가 없어요.'}</p>`}
            ${waiting.length ? `<h2>대기 ${waiting.length}명</h2><ul class="name-list">${waiting.map(member => row(member, `대기 ${position(member)}번`)).join('')}</ul>` : ''}
            ${answered.length ? `<details class="event-past"><summary>응답한 ${answered.length}명${icon('chevron-right', 16)}</summary><ul class="name-list">${answered.map(member =>
              row(member, `${slotLabel(event.votes[member.id])}${event.lunch[member.id] ? ' · 점심' : ''}`)).join('')}</ul></details>` : ''}</section>`;
      }

      // 당일 출석 (the live attendancePanel): the whole row is the check, 결석 and 줄서기 인정 wait behind 상세; the members
      // who said 불참 or nothing are folded below; the count stays in sight with 미확인만 보기.
      function attendance() {
        const report = attendanceCounts(event);
        const actionAllowed = event.date <= today && !event.finalized && !event.cancelled;
        const coming = member => ['early', 'late', 'yes'].includes(event.votes[member.id]) && !window.clubModel.waitingPosition(event, member.id);
        const row = member => {
          const status = event.attendance[member.id];
          const present = status === 'present';
          const recognition = recognitionLabels[event.recognized[member.id]];
          const facts = [slotLabel(event.votes[member.id]), event.lunch[member.id] ? '점심' : '', status === 'absent' ? '결석' : '', recognition ? `${recognition} 인정` : ''].filter(Boolean).join(' · ');
          return `<li data-selected="${present}"><button class="att-row" type="button" data-action="mark-attendance" data-id="${e(event.id)}" data-member="${e(member.id)}" data-value="${present ? '' : 'present'}" aria-pressed="${present}" aria-label="${e(member.name)} 출석"${helpers.justChecked() === member.id && present ? ' data-just' : ''}${actionAllowed ? '' : ' disabled'}>
              <span>${memberNameTag(member, e)}<small>${e(facts)}</small></span><span class="att-check" aria-hidden="true"></span></button>
            <button class="icon-button" type="button" data-action="open-attendance" data-id="${e(event.id)}" data-kind="${e(member.id)}" aria-label="${e(member.name)} 출석 상세" title="${e(member.name)} 출석 상세"${actionAllowed ? '' : ' disabled'}>${icon('more', 20)}</button></li>`;
        };
        const list = people => `<ul class="att-list">${people.map(row).join('')}</ul>`;
        const going = members.filter(coming).sort((a, b) => (event.votes[a.id] === 'early' ? 0 : 1) - (event.votes[b.id] === 'early' ? 0 : 1));
        const others = members.filter(member => !coming(member));
        const note = event.finalized ? '확정한 출석 기록이 통계에 반영됐어요.' : actionAllowed ? '' : '일정 당일부터 출석을 기록할 수 있어요.';
        const actions = event.finalized
          ? action('출석 다시 열기', 'reopen-attendance', event.id)
          : actionAllowed
            ? (report.pending ? action('미확인 모두 결석', 'mark-pending-absent', event.id) : '') + action('출석·게스트 확정', 'finalize', event.id, {tone: 'primary', extra: report.pending ? 'disabled' : ''})
            : '';
        return `<section id="attendance" class="att" aria-label="출석 체크"${helpers.onlyUnmarked() ? ' data-only="unmarked"' : ''}>
            ${note ? `<p class="form-note">${note}</p>` : ''}
            ${members.length ? '' : '<p class="muted home-empty">이 일정에 등록된 멤버가 없어요.</p>'}
            ${going.length ? list(going) : members.length ? '<p class="muted home-empty">참석한다고 응답한 회원이 아직 없어요.</p>' : ''}
            ${others.length ? `<details class="event-past att-others"${going.length ? '' : ' open'}><summary>참석 예정이 아닌 회원 ${others.length}명${icon('chevron-right', 16)}</summary>${list(others)}</details>` : ''}
            <div class="att-foot"><strong id="att-count" role="status">출석 ${report.present}명 · 미확인 ${report.pending}명</strong>
              <button class="btn btn-text btn-small" type="button" data-action="att-filter" aria-pressed="${helpers.onlyUnmarked()}">미확인만 보기</button></div>
            ${actions ? `<div class="form-actions att-actions">${actions}</div>` : ''}
          </section>` + guests();
      }

      // 게스트 (the live guestsPanel): rows on the page; the whole row opens 게스트 수정, + 게스트 추가 opens the same window.
      function guests() {
        const facts = guest => [guest.arrived ? '도착' : event.date > today ? '신청' : '미도착', guest.paid ? '비용 확인' : '비용 미확인',
          guest.transferWon ? `이체 ${guest.transferWon.toLocaleString('ko-KR')}원` : '', guest.receivedShuttles ? `콕 ${guest.receivedShuttles}개` : ''].filter(Boolean).join(' · ');
        const rows = event.guests.map(guest => `<li><button class="event-link" type="button" data-action="open-guest" data-id="${e(event.id)}" data-kind="${e(guest.id)}" aria-label="${e(guest.name)} 게스트 수정"${event.finalized ? ' disabled' : ''}>
          <span><strong>${e(guest.name)}</strong><small>${e(facts(guest))}</small></span>${event.finalized ? '' : icon('chevron-right', 18)}</button></li>`);
        const arrived = event.guests.filter(guest => guest.arrived).length;
        return `<section id="guests" class="home-list guest-list" aria-labelledby="guests-title"><header class="list-tools"><h2 id="guests-title">게스트 ${event.guests.length}명${event.guests.length ? ` · 도착 ${arrived}명` : ''}</h2>
            <button class="btn btn-secondary btn-small" type="button" data-action="open-guest" data-id="${e(event.id)}"${event.finalized ? ' disabled' : ''}>${icon('plus', 16)} 게스트 추가</button></header>
          ${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : '<p class="muted home-empty">등록된 게스트가 없어요.</p>'}
          <p class="form-note">도착을 확인한 게스트만 실제 참여 인원에 들어가요.</p></section>`;
      }

      function finish() {
        const report = settlement(event);
        const previous = state.events.filter(item => item.finalized && !item.cancelled
          && `${item.date}T${item.time}/${item.id}` < `${event.date}T${event.time}/${event.id}`
          && settlement(item).recorded).sort((a, b) =>
            `${b.date}T${b.time}/${b.id}`.localeCompare(`${a.date}T${a.time}/${a.id}`))[0];
        const legacy = report.recorded && report.legacy;
        const opening = report.openingShuttles ?? (previous ? settlement(previous).closingShuttles : 0);
        const fields = (legacy ? [
          ['이전 이월 (낱개)', 'priorSingles', report.priorSingles], ['이전 이월 (타)', 'priorTubes', report.priorTubes],
          ['당일 잔여 (낱개)', 'remainingSingles', report.remainingSingles]
        ] : [
          ['이전 이월 (개)', 'openingShuttles', opening], ['이번에 추가 (개)', 'addedShuttles', report.addedShuttles],
          ['이번에 사용 (개)', 'usedShuttles', report.usedShuttles]
        ]).concat([['코트 찬조금 (원)', 'courtDonation', report.courtDonation]]);
        const enabled = event.date <= today && !event.finalized;
        const form = enabled
          ? `<form class="settlement-form form-grid" data-form="settlement" data-id="${e(event.id)}">
              ${fields.map(([label, key, amount]) => field(label, input(key, amount, 'type="number" min="0" max="10000000" required'))).join('')}
              ${legacy ? '' : `<p class="stock-total form-field-full" aria-live="polite">최종 잔량 <strong data-stock-total>${report.recorded ? report.closingShuttles : opening}개</strong></p>`}
              <div class="form-field-full"><button class="btn btn-primary" type="submit">마무리 기록 저장</button></div>
            </form>`
          : '';
        const ready = event.finalized && report.recorded;
        const paid = report.guestPaid ? `게스트 비용 확인 ${report.guestPaid}명${report.transferWon ? ` · 이체 ${report.transferWon.toLocaleString('ko-KR')}원` : ''}${report.receivedShuttles ? ` · 콕 ${report.receivedShuttles}개` : ''}` : '';
        const note = event.finalized ? (report.recorded ? '' : '출석을 다시 열어 콕과 찬조금 기록을 입력할 수 있어요.')
          : enabled ? '콕 잔여와 찬조금을 저장하고 출석 체크에서 출석을 확정하세요.' : '출석 체크가 시작되면 마무리 기록을 입력할 수 있어요.';
        // The live settlementPanel: the numbers read as one line, as 참석 투표; the form on the page with no box.
        return `<section id="settlement" class="settle-box" aria-labelledby="settlement-title"><h2 id="settlement-title" class="sr-only">모임 마무리</h2>
          <p class="vote-total">실제 참여 ${report.total}명</p>
          <p class="muted">회원 ${report.members}명 · 게스트 도착 ${report.arrivals}명${report.recorded ? ` · 콕 이월 ${report.closingShuttles}개 · 코트 찬조금 ${report.courtDonation.toLocaleString('ko-KR')}원` : ''}${event.finalized ? ' · 마무리 확정' : ''}</p>
          ${paid ? `<p class="form-note">${paid}</p>` : ''}
          <div class="now-actions">${action('마무리 글 복사', 'copy-settlement', event.id, {tone: ready ? 'primary' : 'secondary', symbol: 'clipboard', extra: ready ? '' : 'disabled'})}</div>
          ${note ? `<p class="form-note">${note}</p>` : ''}
          ${form}</section>`;
      }

      // 박스 동작 (DESIGN.md 5), as the live 회차 박스: 상단 고정 and 일정 수정 are icons at the head's top-right with 더보기
      // last (공지 초안, 투표 마감, 응답 조정, 카톡 미리보기, 일정 취소 in actionsDialog); a cancelled event says so with the
      // way back.
      const cancelled = event.cancelled && !event.finalized
        ? `<div class="event-cancelled"><p><strong>취소한 일정이에요.</strong> 이 브라우저에서 취소 상태를 확인할 수 있어요.</p>${action('취소 안내 복사', 'copy-event-update', event.id)}${action('취소 풀기', 'restore-event', event.id, { tone: 'text' })}</div>` : '';
      // 상단 고정 and 일정 수정 as icons at the head's top-right, 더보기 last (the live 회차 박스); the pin shows the state.
      const open = !event.finalized && !event.cancelled;
      const tools = boxActions(
        open && iconAction('pushpin', 'toggle-pin', event.id, `${event.title} 상단 고정`, {kind: 'event', pressed: Boolean(event.pinnedAt)}),
        iconAction('edit', 'open-event', event.id, `${event.title} 일정 수정`),
        iconAction('more', 'open-actions', event.id, `${event.title} 일정 메뉴`, {kind: 'event'}));
      const stands = event.cancelled ? '취소한 일정' : event.finalized ? '마무리 완료'
        : pollAvailable ? `공개 중 · ${dateLabel(event.deadline)} ${event.deadlineTime} 투표 마감` : `공개 중 · ${event.pollOpen || deadlinePassed(event) ? '투표 마감' : '투표 닫힘'}`;
      // The event names the screen (the live event head): its title, one line of when and where, one of where it stands.
      return `<header class="event-head"><h1>${open ? '' : pinMark(event)}${e(event.title)}</h1>${tools}
          <div class="event-facts"><p>${e(kindPrefix(event))}${e(dateLabel(event.date))} ${eventTime(event)} · ${e(event.place)}</p><p class="muted">${e(stands)}</p></div></header>${cancelled}`
        + nav + (event.notes ? `<p class="event-notes">${e(event.notes)}</p>` : '')
        + (route.tab === 'attendance' ? attendance() : route.tab === 'settlement' ? finish() : poll() + guests());
    }

    function notices(state) {
      // 상단 고정 first, in the order pinned, then the newest (the live noticesScreen).
      const ordered = [...state.notices].sort((a, b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.date.localeCompare(a.date));
      // 링크 복사 · 상단 고정 · 수정 as icons at the notice's top-right, 더보기 last (the live noticesScreen).
      const items = ordered.map(notice => `<article class="notice-item">
        <div class="box-top"><div><div class="notice-date"><time datetime="${e(notice.date)}">${e(dateLabel(notice.date))}</time></div>
          <h2>${e(notice.title)}</h2></div>
          ${boxActions(
            iconAction('copy', 'copy-link', notice.id, `${notice.title} 링크 복사`, {kind: 'notice'}),
            iconAction('pushpin', 'toggle-pin', notice.id, `${notice.title} 상단 고정`, {kind: 'notice', pressed: Boolean(notice.pinnedAt)}),
            iconAction('edit', 'open-notice', notice.id, `${notice.title} 공지 수정`),
            iconAction('more', 'open-actions', notice.id, `${notice.title} 공지 메뉴`, {kind: 'notice'}))}</div>
        <p class="preserve-lines">${e(notice.body)}</p>
      </article>`);
      return heading('공지', `공지 ${items.length}개`, addButton('새 공지', 'open-notice'))
        + (items.length ? `<div class="notice-list">${items.join('')}</div>` : '<p class="muted home-empty">등록된 공지가 없어요.</p>');
    }

    function option(value, label, selected) {
      return `<option value="${e(value)}"${String(value) === String(selected) ? ' selected' : ''}>${e(label)}</option>`;
    }

    function members(state, ui) {
      const query = ui.memberQuery.trim().toLocaleLowerCase('ko-KR');
      const filtered = state.members.filter(member =>
        (ui.memberStatus === 'all' || member.status === ui.memberStatus) && member.name.toLocaleLowerCase('ko-KR').includes(query));
      const activeCount = state.members.filter(member => member.status === 'active').length;
      const controls = `<div class="filters">
        <label class="search-field">${icon('search')}<input type="search" data-filter="member-query" aria-label="이름 검색" placeholder="이름 검색" value="${e(ui.memberQuery)}"></label>
        <select data-filter="member-status" aria-label="활동 상태">${[['all', '전체 상태'], ['active', '활동 중'], ['inactive', '활동 중지']].map(([value, label]) => option(value, label, ui.memberStatus)).join('')}</select>
      </div>`;
      // The live 회원 명단 (views.mjs membersScreen): one row a member, the whole row opens 회원 수정; what is not the usual
      // (활동 중지, 운영진) is said under the name. 가입일 stays in 회원 수정.
      const rows = filtered.map(member => {
        const marks = [member.status === 'active' ? '' : '활동 중지', member.role === '운영진' ? '운영진' : ''].filter(Boolean).join(' · ');
        return `<li><button class="event-link" type="button" data-action="open-member" data-id="${e(member.id)}" aria-label="${e(member.name)} 회원 수정"><span>${memberNameTag(member, e)}${marks ? `<small>${marks}</small>` : ''}</span>${icon('chevron-right', 18)}</button></li>`;
      });
      return heading('회원 관리', `전체 ${state.members.length}명 · 활동 중 ${activeCount}명`, addButton('회원 추가', 'open-member'))
        + `<div class="list-search">${controls}</div>`
        + `<div class="member-rows">${rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : '<p class="muted home-empty">조건에 맞는 멤버가 없어요.</p>'}</div>`;
    }

    function statistics(state, ui) {
      const matches = member => ui.statsGender === 'all' || (member.gender ?? '') === ui.statsGender;
      const selected = ui.statsGender === 'all' ? null : state.members.filter(matches);
      const report = stats(state, ui.statsMonth, selected);
      const months = [...new Set([today.slice(0, 7), ...state.events.filter(event => event.finalized).map(event => event.date.slice(0, 7))])].sort().reverse();
      const selector = `<select data-filter="stats-month" aria-label="반기 집계 기간">${option('', '전체 기간', ui.statsMonth)}${months.map(month => {
        const [year, monthNumber] = month.split('-');
        return option(month, `${year}년 ${Number(monthNumber)}월`, ui.statsMonth);
      }).join('')}</select>`;
      const genderFilter = `<select data-filter="stats-gender" aria-label="성별 필터">
        ${[['all', '전체 성별'], ...genderChoices()].map(([value, label]) => option(value, label, ui.statsGender)).join('')}
      </select>`;
      const bars = report.byEvent.map(({event, present, total, rate}) => `<div class="bar-item">
        <div class="bar-label"><span>${e(dateLabel(event.date))} · ${e(event.title)}</span><strong>${present}명 / ${total}명</strong></div>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width: ${rate}%"></div></div>
      </div>`);
      const rows = report.byMember.map(({member, present, total, rate}) => `<tr>
        <td>${memberNameTag(member, e)}</td><td>${present}회</td><td>${total}회</td><td>${rate}%</td>
      </tr>`);
      const credits = qualification(state);
      const creditRows = credits.byMember.filter(({member}) => matches(member)).map(({member, first, second, met}) => `<tr><td>${memberNameTag(member, e)}</td>
        <td>${first} / 3회</td><td>${second} / 3회</td><td>${met ? '<span class="state-word state-due">기준 충족</span>' : '<span class="state-word state-quiet">진행 중</span>'}</td></tr>`);
      return heading('반기 집계', '실제 출석과 반기 줄서기 인정 횟수를 확인하세요.')
        + `<div class="progress-filters">${selector}${genderFilter}</div>`
        + `<section class="settle-box" aria-label="출석 요약"><p class="vote-total">전체 출석률 ${report.total ? `${report.rate}%` : '—'}</p><p class="muted">일정 ${report.sessions}회 · 누적 출석 ${report.present}회</p></section>`
        + panel(`${credits.period} 줄서기 인정`, creditRows.length ? table(['멤버', credits.ranges[0], credits.ranges[1], '예시 3+3 기준'], creditRows) : empty('집계할 회원이 없어요.'), {
          subtitle: '확정한 일정에서 직접·대타·별도 인정을 합산한 횟수입니다. 수령 확정은 실제 기준에 따라 운영진이 확인합니다.'
        })
        + panel('일정별 출석', bars.length ? `<div class="bar-chart">${bars.join('')}</div>` : empty('이 기간에 확정된 출석 기록이 없어요.'), {subtitle: '일정 참여 대상 중 실제 출석한 인원이에요.'})
        + panel('멤버별 출석', rows.length ? table(['멤버', '출석', '참여 대상 일정', '출석률'], rows) : empty('집계할 출석 기록이 없어요.'));
    }

    function repeat(state) {
      const rule = state.repeat;
      const steps = [
        ['다음 일정 만들기', '정해둔 요일, 시간, 장소를 새 일정에 불러와요.'],
        ['공지와 투표 공유', '일정에서 공지 초안을 만들고, 공지와 참석 투표 링크를 단체 채팅방에 올리세요.'],
        ['당일 체크와 마무리', '회원 실제 출석, 줄서기 인정, 게스트 도착을 확인하고 콕과 찬조금을 기록해요.']
      ];
      return heading('반복 일정', '정기 일정과 참석 투표를 한 번에 준비하세요.',
        action('반복 설정 수정', 'open-repeat', '', {symbol: 'settings'}))
        + panel('반복 설정', `<dl class="public-event-facts">
          <div><dt>일정 이름</dt><dd>${e(rule.title)}</dd></div>
          <div><dt>시간</dt><dd>매주 ${weekdays[rule.weekday]} ${eventTime(rule)}</dd></div>
          <div><dt>장소</dt><dd>${e(rule.place)}</dd></div>
          <div><dt>투표 마감</dt><dd>${rule.deadlineDays ? `일정 ${e(rule.deadlineDays)}일 전` : '일정 당일'} ${e(rule.deadlineTime)}</dd></div>
        </dl><div class="form-actions">${action('다음 일정 만들기', 'generate-next', '', {tone: 'primary', symbol: 'plus', extra: rule.enabled ? '' : 'disabled'})}</div>`, {
          subtitle: '다음 일정 만들기를 누르면 이 설정으로 일정과 투표를 준비해요.',
          actions: rule.enabled ? '<span class="state-word state-due">사용 중</span>' : '<span class="state-word state-quiet">사용 중지</span>'
        })
        + panel('정기 일정 운영 순서', `<ol class="routine-list">${steps.map(([title, description]) => `<li><strong>${title}</strong><p>${description}</p></li>`).join('')}</ol>`);
    }

    function field(label, control, full = false) {
      return `<label class="form-field${full ? ' form-field-full' : ''}"><span>${label}</span>${control}</label>`;
    }

    function input(name, value, options = '') {
      return `<input name="${name}" value="${e(value ?? '')}" ${options}>`;
    }

    function check(name, label, on) {
      return `<label class="form-check form-field-full"><input name="${name}" type="checkbox"${on ? ' checked' : ''}> <span>${label}</span></label>`;
    }

    function slotFields(event) {
      return field('선발 시간', input('earlyTime', event.earlyTime, 'type="time" required'))
        + field('후발 시간', input('lateTime', event.lateTime, 'type="time" required'));
    }

    function form(dialog, title, content, submit = '저장') {
      return `<header class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="닫기">${icon('x')}</button></header>
        <form data-form="${dialog.type}"${dialog.id ? ` data-id="${e(dialog.id)}"` : ''}>
          <div class="dialog-body form-grid">${content}</div>
          <footer class="dialog-footer form-actions">${action('취소', 'close-dialog')}<button class="btn btn-primary" type="submit">${submit}</button></footer>
        </form>`;
    }

    function eventDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id) || {
        ...state.repeat, title:'', ...(dialog.onDate && {date:dialog.onDate, deadline:helpers.addDays(dialog.onDate, -1), pollOpen:false})
      };
      // Three groups, as the live eventForm (DESIGN.md 6 UX 점검표 16): what and where, when, what members see.
      const group = (legend, body) => `<fieldset class="form-group"><legend>${legend}</legend><div class="form-grid">${body}</div></fieldset>`;
      return form(dialog, dialog.id ? '일정 수정' : '새 일정',
        group('기본 정보', field('일정 제목', input('title', event.title, 'required maxlength="80" placeholder="제목을 입력해 주세요"'), true)
          + field('장소', input('place', event.place, 'required maxlength="100" placeholder="장소를 입력해 주세요"'), true)
          + field('일정 종류', `<select name="kind">${Object.entries(kindLabels).map(([value, label]) => option(value, label, event.kind ?? 'regular')).join('')}</select>`)
          + field('신청 정원 (선택)', input('capacity', event.capacity, 'type="number" min="1" max="10000" step="1" inputmode="numeric" placeholder="신청 정원 (선택)"')))
        + group('날짜와 시간', field('날짜', input('date', event.date || today, 'type="date" required'), true)
          + field('시작 시간', input('time', event.time, 'type="time" required'))
          + field('종료 시간', input('endTime', event.endTime, 'type="time" required'))
          + slotFields(event)
          + field('투표 마감일', input('deadline', event.deadline || today, 'type="date" required'))
          + field('투표 마감 시간', input('deadlineTime', event.deadlineTime, 'type="time" required')))
        + group('공개 설정', field('안내 메모', `<textarea name="notes" rows="3" maxlength="500" placeholder="준비물이나 안내를 적어 주세요">${e(event.notes || '')}</textarea>`, true)
          + check('pollOpen', '참석 투표 열기', event.cancelled ? false : event.pollOpen ?? true)));
    }

    // 비밀번호 재설정 (the live memberAccess, worker/public/views.mjs): the same section and words under 회원 수정. Here it is
    // a .dialog-body of its own below the form's 취소 · 저장 footer, so its line runs the dialog's width like the footer's.
    function memberAccess(member) {
      const active = member.status === 'active';
      return `<section class="dialog-body member-access" aria-labelledby="member-access-title"><h3 id="member-access-title">비밀번호 재설정</h3>
        <p class="member-access-lead">비밀번호를 잊었거나 로그인이 안 될 때 임시 번호 6자리를 새로 발급합니다. 되돌릴 수 없습니다.</p>
        <ol class="member-access-steps">
          <li>기존 비밀번호는 즉시 삭제되고, 모든 기기에서 로그아웃됩니다.</li>
          <li>발급 후 뜨는 접속 안내(임시 번호 6자리 포함)를 '접속 안내 복사'로 복사해 회원에게 보내 주세요. (창을 닫으면 다시 볼 수 없습니다.)</li>
          <li>회원은 이름과 임시 번호로 로그인한 뒤, 내 기록의 'PIN 만들기'에서 새 번호로 바꿀 수 있습니다. 운영 권한이 있는 회원은 홈의 '내 번호 정하기'로 새 번호를 정해야 운영 메뉴가 열립니다.</li>
        </ol>
        <p class="form-note">※ 기존 투표 및 출석 기록은 그대로 유지됩니다.</p>
        <button class="btn btn-secondary" type="button" data-action="reset-member" data-id="${e(member.id)}" aria-label="${e(member.name)} 비밀번호 재설정"${active ? '' : ' disabled'}>비밀번호 재설정</button>
        ${active ? '' : '<p class="form-note">활동 중지한 회원은 재설정할 수 없어요. 활동 회원으로 저장한 뒤에 할 수 있어요.</p>'}</section>`;
    }

    function memberDialog(dialog, state) {
      const found = state.members.find(member => member.id === dialog.id);
      const member = found || {role: '회원', status: 'active'};
      return form(dialog, dialog.id ? '멤버 수정' : '멤버 추가',
        field('이름', input('name', member.name, 'required maxlength="40"'), true)
        + field('역할', `<select name="role">${['회원', '운영진'].map(role => option(role, role, member.role)).join('')}</select>`)
        + field('활동 상태', `<select name="status">${option('active', '활동 중', member.status)}${option('inactive', '활동 중지', member.status)}</select>`)
        + field('가입일', input('joined', member.joined || today, 'type="date" required'), true)
        + field('성별', `<select name="gender">${genderChoices()
          .map(([value, label]) => option(value, label, member.gender ?? '')).join('')}</select>`)
        + field('메모 (운영진만 볼 수 있어요)', `<textarea name="notes" rows="3" maxlength="500">${e(member.notes || '')}</textarea>`, true))
        + (found ? memberAccess(found) : '');
    }

    function noticeDialog(dialog, state) {
      const notice = state.notices.find(notice => notice.id === dialog.id) || dialog.draft || {};
      return form(dialog, dialog.id ? '공지 수정' : '새 공지',
        field('제목', input('title', notice.title, 'required maxlength="100"'), true)
        + field('내용', `<textarea name="body" rows="6" required maxlength="2000">${e(notice.body || '')}</textarea>`, true),
        dialog.id ? '저장' : '공지 올리기');
    }

    function repeatDialog(dialog, state) {
      const rule = state.repeat;
      return form(dialog, '반복 일정 설정',
        check('enabled', '반복 설정 사용', rule.enabled)
        + field('일정 이름', input('title', rule.title, 'required maxlength="80"'), true)
        + field('반복 요일', `<select name="weekday">${weekdays.map((day, index) => option(index, day, rule.weekday)).join('')}</select>`)
        + field('투표 마감 (며칠 전)', input('deadlineDays', rule.deadlineDays, 'type="number" min="0" max="6" required'))
        + field('시작 시간', input('time', rule.time, 'type="time" required'))
        + field('종료 시간', input('endTime', rule.endTime, 'type="time" required'))
        + slotFields(rule)
        + field('투표 마감 시간', input('deadlineTime', rule.deadlineTime, 'type="time" required'))
        + field('장소', input('place', rule.place, 'required maxlength="100"'), true));
    }

    function voteDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id);
      if (!event) return '';
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
      return form(dialog, '예시 응답 조정',
        `<p class="form-note form-field-full">예시 회원의 응답을 정정합니다. 저장하면 기존 응답 한 건이 갱신됩니다.</p>`
        + field('멤버', `<select name="member" required><option value="">선택하세요</option>${members.map(member => option(member.id, member.name, dialog.kind ?? '')).join('')}</select>`, true)
        + field('응답', `<select name="vote" required><option value="">선택하세요</option>${option('early', `${event.earlyTime} 선발`, '')}${option('late', `${event.lateTime} 후발`, '')}${option('no', '불참', '')}</select>`, true)
        + check('lunch', '점심에 함께해요', false),
        '응답 저장');
    }

    // 게스트 등록·수정 (the live guestForm, on the demo's guest record: 도착 and 비용 as checks).
    function guestDialog(dialog, state) {
      const event = state.events.find(item => item.id === dialog.id);
      if (!event || event.finalized) return '';
      const guest = event.guests.find(item => item.id === dialog.kind) ?? {};
      const payment = guest.transferWon != null || guest.receivedShuttles != null;
      return form(dialog, guest.id ? '게스트 수정' : '게스트 등록',
        (guest.id ? `<input type="hidden" name="guest" value="${e(guest.id)}">` : '')
        + field('이름', input('guestName', guest.name ?? '', 'required maxlength="40" placeholder="예시 게스트 03"'), true)
        + (event.date <= today ? check('arrived', '도착을 확인했어요', guest.arrived) : '')
        + check('paid', '게스트 비용 확인', guest.paid)
        + `<details class="event-past form-field-full"${payment ? ' open' : ''}><summary>이체·콕 기록 (선택)</summary><div class="form-grid">
          ${field('이체액 (원)', input('transferWon', guest.transferWon ?? '', 'type="number" min="0" max="10000000" step="1" inputmode="numeric"'))}
          ${field('받은 콕 (개)', input('receivedShuttles', guest.receivedShuttles ?? '', 'type="number" min="0" max="10000000" step="1" inputmode="numeric"'))}
        </div></details>`, guest.id ? '게스트 저장' : '게스트 등록');
    }

    // 출석 상세 (the live attendanceForm): 결석 and 줄서기 인정, the two things a tap on the row does not record.
    function attendanceDialog(dialog, state) {
      const event = state.events.find(item => item.id === dialog.id);
      const member = state.members.find(item => item.id === dialog.kind);
      if (!event || !member) return '';
      const status = event.attendance[member.id] ?? '';
      const recognition = event.recognized[member.id] ?? '';
      return form(dialog, `${e(member.name)} 출석 상세`,
        `<input type="hidden" name="member" value="${e(member.id)}">`
        + field('실제 출석', `<select name="status">${option('', '미확인', status)}${option('present', '출석', status)}${option('absent', '결석', status)}</select>`)
        + field('줄서기 인정', `<select name="recognition">${option('', '미인정', recognition)}${Object.entries(recognitionLabels).map(([value, label]) => option(value, label, recognition)).join('')}</select>`)
        + '<p class="form-note form-field-full">직접·대타 인정은 출석으로 기록한 회원에게만 남아요.</p>', '기록 저장');
    }

    // Confirmations (the live dialogs): a question and the one button that does it; ×, the backdrop and Esc close them.
    function confirm(title, body, button) {
      return `<header class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="닫기">${icon('x')}</button></header>
        <div class="dialog-body">${body}${button}</div>`;
    }

    function pinDialog(dialog, state) {
      const notice = dialog.kind === 'notice';
      const list = notice ? state.notices : state.events;
      const oldest = list.filter(item => item.pinnedAt && !item.finalized && !item.cancelled).sort((a, b) => a.pinnedAt - b.pinnedAt)[0];
      if (!oldest) return '';
      return confirm('상단 고정', `<p>상단 고정은 ${notice ? '공지' : '일정'} 3개까지예요. 가장 오래 고정한 "${e(oldest.title)}"의 고정을 풀고 이 ${notice ? '공지를' : '일정을'} 고정할까요?</p>`,
        action('바꿔서 고정하기', 'confirm-pin', dialog.id, { tone: 'primary', extra: `data-kind="${notice ? 'notice' : 'event'}"` }));
    }

    // 비밀번호 재설정's second ask and its 접속 안내 (the live reset-member, credentialDialog). dialog.kind carries the made-up
    // temporary number; the 가상 체험 saves nothing and nobody's number changes.
    function resetDialog(dialog, state) {
      const member = state.members.find(item => item.id === dialog.id);
      if (!member || member.status !== 'active') return '';
      return confirm('회원 비밀번호 재설정', '<p>재설정하면 기존 비밀번호와 로그인 상태가 만료됩니다. 임시 번호를 받을 회원이 맞는지 확인해 주세요.</p>',
        action('새 임시 번호 만들기', 'confirm-reset-member', member.id, { tone: 'primary' }));
    }

    function credentialDialog(dialog, state) {
      const member = state.members.find(item => item.id === dialog.id);
      if (!member || !dialog.kind) return '';
      const text = `썬콕19 접속 안내\n성함 ${member.name}\n임시 번호 ${dialog.kind}\n성함을 입력하고 임시 번호 6자리를 입력해 주세요.\n새 PIN을 설정할 때까지 임시 번호로 로그인할 수 있어요.\n${location.href.split('#')[0]}`;
      return confirm('비밀번호 재설정', `<p>${e(member.name)} 회원에게 이 내용을 개인 메시지로 전달해 주세요. 임시 번호는 이 창을 닫으면 다시 볼 수 없어요.</p>
        <p class="form-note">가상 체험이라 실제 번호는 바뀌지 않아요.</p>
        <textarea class="copy-text" readonly rows="6" aria-label="회원 접속 안내">${e(text)}</textarea>`, action('접속 안내 복사', 'copy-invitation', '', { tone: 'primary' }));
    }

    function cancelDialog(dialog, state) {
      const event = state.events.find(item => item.id === dialog.id);
      if (!event) return '';
      return confirm('일정 취소', `<p>"${e(event.title)}" 일정을 취소할까요? 투표가 닫히고 회원 화면에는 "취소됐어요"로 보여요. 받은 응답은 지우지 않고, 취소 풀기로 되돌릴 수 있어요.</p>
        <p>취소 사유는 일정 수정의 안내 메모에 적으면 회원에게 보여요.</p>`, action('일정 취소하기', 'confirm-cancel-event', event.id, { tone: 'primary' }));
    }

    // 회차 메뉴 / 공지 메뉴 (더보기, the live eventMenu / noticeMenu): the rarely used buttons of one event or notice, with
    // the same rules as where they were before.
    function actionsDialog(dialog, state) {
      const buttons = [];
      if (dialog.kind === 'notice') {
        const notice = state.notices.find(item => item.id === dialog.id);
        if (!notice) return '';
        // 복사·상단 고정·수정 are icons on the notice.
        buttons.push(action('텍스트 복사', 'copy-notice', notice.id, {symbol: 'clipboard'}),
          action('카톡 미리보기', 'open-share', notice.id, {symbol: 'share', extra: 'data-kind="notice"'}));
      } else {
        const event = state.events.find(item => item.id === dialog.id);
        if (!event) return '';
        const open = !event.finalized && !event.cancelled;
        // 상단 고정·일정 수정 are icons on the head, 링크 복사 on the 참석 응답 panel.
        buttons.push(action('공지 초안 만들기', 'open-event-notice', event.id, {symbol: 'megaphone'}));
        if (open && !deadlinePassed(event)) buttons.push(action(event.pollOpen ? '투표 마감' : '투표 열기', 'toggle-poll', event.id));
        if (!event.finalized && event.roster.length) buttons.push(action('응답 조정', 'open-vote', event.id));
        buttons.push(action('카톡 미리보기', 'open-share', event.id, {symbol: 'share', extra: 'data-kind="vote"'}));
        if (!event.cancelled) buttons.push(action('변경 안내 복사', 'copy-event-update', event.id));
        if (open) buttons.push(action('일정 취소', 'cancel-event', event.id, {tone: 'text'}));
      }
      return confirm(dialog.kind === 'notice' ? '공지 메뉴' : '일정 메뉴', `<div class="menu-actions action-menu">${buttons.join('')}</div>`, '');
    }

    return {eventList, eventDetail, notices, members, statistics, repeat, eventDialog, memberDialog, noticeDialog, repeatDialog, voteDialog, attendanceDialog, guestDialog, pinDialog, cancelDialog,
      resetDialog, credentialDialog, actionsDialog};
  }

  window.clubScreens = {
    renderScreen(route, state, ui, helpers) {
      const view = makeView(helpers);
      const content = {
        events: () => view.eventList(state),
        event: () => view.eventDetail(route, state),
        notices: () => view.notices(state),
        members: () => view.members(state, ui),
        stats: () => view.statistics(state, ui),
        repeat: () => view.repeat(state)
      }[route.page]?.();
      // Every screen is a single column, as the 운영 홈 (styles.css .event-page, .plain-page).
      const css = { events: 'event-page', event: 'event-page event-detail' }[route.page] ?? 'plain-page';
      return content ? `<div class="${css}">${content}</div>` : '';
    },
    renderDialog(dialog, state, helpers) {
      const view = makeView(helpers);
      const render = {
        event: view.eventDialog,
        member: view.memberDialog,
        notice: view.noticeDialog,
        repeat: view.repeatDialog,
        vote: view.voteDialog,
        attendance: view.attendanceDialog,
        guest: view.guestDialog,
        pin: view.pinDialog,
        cancel: view.cancelDialog,
        reset: view.resetDialog,
        credential: view.credentialDialog,
        actions: view.actionsDialog
      }[dialog.type];
      return render ? render(dialog, state) : '';
    }
  };
})();
