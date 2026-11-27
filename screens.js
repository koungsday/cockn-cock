(() => {
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const voteLabels = { early: '선발', late: '후발', yes: '참석 · 시간 미정', no: '불참' };
  const attendanceLabels = { present: '출석', absent: '결석' };
  const recognitionLabels = {direct: '직접', substitute: '대타', approved: '별도 인정'};

  function makeView(helpers) {
    const { escape: e, icon, dateLabel, today, counts, attendanceCounts, stats, deadlinePassed, settlement, qualification,
      flowEvents, flowFacts, finishedEvents, pinMark, kindPrefix, kindLabels, defaultTab, calendar } = helpers;

    function action(text, name, id, options = {}) {
      const { tone = 'secondary', symbol, extra = '' } = options;
      return `<button class="btn btn-${tone}" type="button" data-action="${name}"${id ? ` data-id="${e(id)}"` : ''} ${extra}>${symbol ? icon(symbol) : ''}${text}</button>`;
    }

    // Icon-only control (DESIGN.md 5): + for the one create action in a page head.
    function addButton(label, name) {
      return `<button class="btn btn-primary btn-icon" type="button" data-action="${name}" aria-label="${e(label)}" title="${e(label)}">${icon('plus', 22)}</button>`;
    }

    function routeLink(text, route, tone = 'text', symbol = '') {
      return `<a class="btn btn-${tone}" href="#${e(route)}" data-route="${e(route)}">${symbol ? icon(symbol) : ''}${text}</a>`;
    }

    function heading(title, description, actions = '') {
      return `<header class="page-head"><div><h1>${title}</h1>${description ? `<div class="page-description">${description}</div>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    }

    function panel(title, content, options = {}) {
      const { subtitle = '', actions = '' } = options;
      return `<section class="panel"><header class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</header><div class="panel-body">${content}</div></section>`;
    }

    function pill(label, type = 'neutral') {
      return `<span class="pill pill-${type}">${label}</span>`;
    }

    function empty(message) {
      return `<p class="empty-state">${message}</p>`;
    }

    function table(columns, rows, css = '') {
      return `<div class="data-table-wrap"><table class="data-table${css ? ` ${css}` : ''}"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function summary(items) {
      return `<dl class="summary-grid">${items.map(([label, value, tone]) => `<div class="summary-item${tone ? ` summary-${tone}` : ''}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
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

    // 일정: the month's calendar (the live eventList), every unfinished event in the 운영 홈 order, then the finished ones
    // (확정 or 취소) folded under 끝난 일정.
    function eventList(state) {
      const rows = flowEvents().map(event => {
        const { title, detail } = flowFacts(event);
        return eventLink(event, title, detail);
      });
      const past = finishedEvents().map(event => eventLink(event, `${event.cancelled ? pill('취소', 'muted') : pill('마무리 완료', 'green')} ${e(event.title)}`,
        e(`${kindPrefix(event)}${dateLabel(event.date)} ${event.time} · ${event.place}`)));
      return heading('일정', '일정을 골라 투표 응답, 당일 출석, 마무리를 기록하세요.', addButton('새 일정', 'open-event'))
        + `<section class="panel calendar-panel" aria-labelledby="calendar-title"><div class="panel-body">${calendar(state.events)}</div></section>`
        + panel('진행 중인 일정', (rows.length ? `<ul class="event-list">${rows.join('')}</ul>` : empty('진행 중인 일정이 없어요. 새 회차를 만들어 투표를 시작하세요.'))
          + (past.length ? `<details class="event-past"><summary>끝난 일정 ${past.length}개${icon('chevron-right', 16)}</summary><ul class="event-list">${past.join('')}</ul></details>` : ''));
    }

    function eventDetail(route, state) {
      const event = state.events.find(item => item.id === route.id);
      if (!event) return heading('일정을 찾을 수 없어요', '', routeLink('일정 목록', 'events', 'secondary'));
      const pollAvailable = event.pollOpen && !event.finalized && !deadlinePassed(event);
      const subheader = `<div class="event-facts"><span>${icon('calendar')}${e(kindPrefix(event))}${e(dateLabel(event.date))}</span><span>${icon('clock')}${eventTime(event)}</span><span>${icon('pin')}${e(event.place)}</span></div>`;
      const nav = `<nav class="tabs" aria-label="회차 단계">${[['poll', '참석 투표'], ['attendance', '당일 출석'], ['settlement', '마무리']].map(([tab, label]) => {
        const path = eventPath(event, tab);
        const active = tab === route.tab;
        return `<a href="#${path}" data-route="${path}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
      }).join('')}</nav>`;
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);

      function poll() {
        const report = counts(event);
        // 투표 마감 and 응답 조정 wait in the 회차 메뉴 (actionsDialog), as in the live 회차 화면.
        const shareAction = action('카톡 공유', 'open-share', event.id, {tone: 'primary', symbol: 'share', extra: 'data-kind="vote"'});
        const voteLink = pollAvailable && members.length ? routeLink('회원 투표 체험', `public-vote/${encodeURIComponent(event.id)}`) : '';
        const rows = members.map(member => {
          const vote = event.votes[member.id];
          return `<tr><td><strong>${e(member.name)}</strong></td><td>${pill(voteLabels[vote] || '미응답', vote && vote !== 'no' ? 'green' : 'neutral')}</td><td>${event.lunch[member.id] ? '함께해요' : '—'}</td></tr>`;
        });
        return panel('참석 응답', summary([
          [`${e(event.earlyTime)} 선발`, `${report.early}명`, 'green'], [`${e(event.lateTime)} 후발`, `${report.late}명`],
          ['점심', `${report.lunch}명`], ['불참', `${report.no}명`], ['미응답', `${report.pending}명`]
        ])
          + (rows.length ? table(['멤버', '응답', '점심'], rows) : empty('이 일정에 등록된 멤버가 없어요.')), {
          subtitle: `참석 예정 ${report.yes}명 · ${e(dateLabel(event.deadline))} ${e(event.deadlineTime)} 마감`,
          actions: shareAction + voteLink
        });
      }

      function attendance() {
        const report = attendanceCounts(event);
        const actionAllowed = event.date <= today && !event.finalized && !event.cancelled;
        const priority = {early: 0, late: 1, yes: 1, no: 3};
        const sorted = [...members].sort((a, b) => (priority[event.votes[a.id]] ?? 2) - (priority[event.votes[b.id]] ?? 2));
        const rows = sorted.map(member => {
          const vote = event.votes[member.id];
          const status = event.attendance[member.id];
          const recognition = event.recognized[member.id];
          const buttons = ['present', 'absent'].map(value => {
            const active = status === value;
            return action(attendanceLabels[value], 'mark-attendance', event.id, {
              tone: active ? 'primary' : 'secondary',
              extra: `data-member="${e(member.id)}" data-value="${active ? '' : value}" aria-label="${e(member.name)} ${attendanceLabels[value]}" aria-pressed="${active}"`
            });
          }).join('');
          const control = actionAllowed
            ? `<select data-recognition data-id="${e(event.id)}" data-member="${e(member.id)}" aria-label="${e(member.name)} 줄서기 인정">
                ${option('', '미인정', recognition ?? '')}
                ${Object.entries(recognitionLabels).map(([value, label]) => `<option value="${value}"${value === recognition ? ' selected' : ''}${value !== 'approved' && status !== 'present' ? ' disabled' : ''}>${label}</option>`).join('')}
              </select>`
            : pill(recognitionLabels[recognition] || '미인정');
          return `<tr><td><strong>${e(member.name)}</strong></td><td>${voteLabels[vote] || '미응답'}</td><td>${actionAllowed
            ? `<div class="table-actions">${buttons}</div>`
            : pill(attendanceLabels[status] || '미확인', status === 'present' ? 'green' : 'neutral')}</td><td>${control}</td></tr>`;
        });
        const actions = event.finalized
          ? action('출석 다시 열기', 'reopen-attendance', event.id)
          : actionAllowed
            ? (report.pending ? action('미확인 모두 결석', 'mark-pending-absent', event.id) : '') + action('출석·게스트 확정', 'finalize', event.id, {tone: 'primary', extra: report.pending ? 'disabled' : ''})
            : '';
        const subtitle = event.finalized
          ? '확정한 출석 기록이 통계에 반영됐어요.'
          : actionAllowed
            ? '선발과 후발 응답을 위에 표시했어요. 실제 출석과 줄서기 인정은 각각 기록하세요.'
            : '일정 당일부터 출석을 기록할 수 있어요.';
        return panel('실제 출석', summary([['출석', `${report.present}명`, 'green'], ['결석', `${report.absent}명`], ['미확인', `${report.pending}명`], ['줄서기 인정', `${Object.keys(event.recognized).length}명`]])
          + (rows.length ? table(['멤버', '투표 응답', '실제 출석', '줄서기 인정'], rows) : empty('이 일정에 등록된 멤버가 없어요.')), { subtitle, actions }) + guests();
      }

      function guests() {
        const guestRows = event.guests.map(guest => {
          const toggle = (key, label, emptyLabel) => event.finalized || (key === 'arrived' && event.date > today)
            ? pill(guest[key] ? label : emptyLabel, guest[key] ? 'green' : 'neutral')
            : action(guest[key] ? label : emptyLabel, 'mark-guest', event.id, {
              tone: guest[key] ? 'primary' : 'secondary',
              extra: `data-value="${key}" data-member="${e(guest.id)}" aria-pressed="${Boolean(guest[key])}" aria-label="${e(guest.name)} ${label}"`
            });
          return `<tr><td><strong>${e(guest.name)}</strong></td><td>${toggle('arrived','도착 확인','미도착')}</td><td>${toggle('paid','입금 확인','미확인')}</td></tr>`;
        });
        const addGuest = event.finalized ? '' : `<form class="guest-form" data-form="guest" data-id="${e(event.id)}">
          ${field('예시 게스트', input('guestName', '', 'required maxlength="40" placeholder="예시 게스트 03"'))}
          <button class="btn btn-secondary" type="submit">게스트 추가</button>
        </form>`;
        return panel('게스트', (guestRows.length ? table(['게스트', '도착', '입금'], guestRows) : empty('등록된 게스트가 없어요.')) + addGuest, {
          subtitle: '도착을 확인한 게스트만 실제 참여 인원에 포함됩니다.'
        });
      }

      function finish() {
        const report = settlement(event);
        const fields = [
          ['이전 모인 콕 (낱개)', 'priorSingles'], ['이전 모인 콕 (타)', 'priorTubes'],
          ['당일 잔여 콕 (낱개)', 'remainingSingles'], ['코트 찬조금 (원)', 'courtDonation']
        ];
        const enabled = event.date <= today && !event.finalized;
        const form = enabled
          ? `<form class="settlement-form form-grid" data-form="settlement" data-id="${e(event.id)}">
              ${fields.map(([label, key]) => field(label, input(key, report[key], 'type="number" min="0" max="100000000" required'))).join('')}
              <div class="form-field-full"><button class="btn btn-primary" type="submit">마무리 기록 저장</button></div>
            </form>`
          : '';
        const copy = event.finalized && report.recorded
          ? action('카톡 마무리 복사', 'copy-settlement', event.id, {tone:'primary', symbol:'clipboard'}) : '';
        return panel('모임 마무리', summary([
          ['실제 참여', `${report.total}명`, 'green'], ['회원', `${report.members}명`], ['게스트 도착', `${report.arrivals}명`],
          ['게스트 입금 확인', `${report.guestPaid}명`], ['콕 이월', report.recorded ? `${report.singles}개 + ${report.priorTubes}타` : '미기록'],
          ['코트 찬조금', report.recorded ? `${report.courtDonation.toLocaleString('ko-KR')}원` : '미기록']
        ]) + form, {
          subtitle: event.finalized ? (report.recorded ? '확정한 인원과 마무리 기록을 한 번에 복사하세요.' : '출석을 다시 열어 콕과 찬조금 기록을 입력할 수 있어요.')
            : enabled ? '콕 잔여와 찬조금을 저장하고 당일 체크에서 출석을 확정하세요.' : '당일 체크가 시작되면 마무리 기록을 입력할 수 있어요.',
          actions: copy
        });
      }

      // 더보기 (DESIGN.md 6 UX 점검표 15), as the live 회차 화면: 상단 고정, 공지 초안, 일정 수정, 투표 마감, 응답 조정 and
      // 일정 취소 wait in one menu (actionsDialog); a pinned event keeps its mark by the title, and a cancelled one says so
      // with the way back.
      const cancelled = event.cancelled && !event.finalized
        ? `<div class="event-cancelled"><p><strong>취소한 일정이에요.</strong> 회원에게 "취소됐어요"로 보이고, 받은 응답은 그대로 있어요.</p>${action('취소 풀기', 'restore-event', event.id)}</div>` : '';
      const more = `<button class="btn btn-secondary btn-icon" type="button" data-action="open-actions" data-id="${e(event.id)}" data-kind="event" aria-label="${e(event.title)} 회차 메뉴" title="${e(event.title)} 회차 메뉴">${icon('more', 22)}</button>`;
      return `<div class="back-link">${routeLink('일정 목록', 'events', 'text', 'arrow-left')}</div>`
        + heading(`${pinMark(event)}${e(event.title)}${event.cancelled ? ` ${pill('취소', 'muted')}` : ''}`, subheader + cancelled, more)
        + (event.notes ? `<p class="event-notes">${e(event.notes)}</p>` : '')
        + nav
        + (route.tab === 'attendance' ? attendance() : route.tab === 'settlement' ? finish() : poll() + guests());
    }

    function notices(state) {
      // 상단 고정 first, in the order pinned, then the newest (the live noticesScreen).
      const ordered = [...state.notices].sort((a, b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.date.localeCompare(a.date));
      const items = ordered.map(notice => `<article class="notice-item">
        <div class="notice-date"><time datetime="${e(notice.date)}">${e(dateLabel(notice.date))}</time>${pinMark(notice)}</div>
        <h3>${e(notice.title)}</h3>
        <p class="preserve-lines">${e(notice.body)}</p>
        <div class="notice-actions">${action('카톡 공유', 'open-share', notice.id, {symbol: 'share', extra: 'data-kind="notice"'})}<button class="btn btn-text btn-icon" type="button" data-action="open-actions" data-id="${e(notice.id)}" data-kind="notice" aria-label="${e(notice.title)} 공지 메뉴" title="${e(notice.title)} 공지 메뉴">${icon('more', 20)}</button></div>
      </article>`);
      return heading('공지', '일정 변경이나 모임 소식을 올리세요.', addButton('새 공지', 'open-notice'))
        + panel('공지 목록', items.length ? `<div class="notice-list">${items.join('')}</div>` : empty('등록된 공지가 없어요.'));
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
      // The live 회원 명단 (views.mjs membersScreen): name, state with 운영진 beside it, the 연필. On a phone each row is one
      // line (.stack-table.member-table); 가입일 stays in 회원 수정.
      const rows = filtered.map(member => `<tr>
        <td><div class="member-name"><span class="avatar" aria-hidden="true">${e(member.name.slice(0, 1))}</span><strong>${e(member.name)}</strong></div></td>
        <td>${member.status === 'active' ? pill('활동 중', 'green') : pill('활동 중지')}${member.role === '운영진' ? ` ${pill('운영진', 'green')}` : ''}</td>
        <td class="table-actions"><button class="btn btn-secondary btn-icon" type="button" data-action="open-member" data-id="${e(member.id)}" aria-label="${e(member.name)} 회원 수정" title="${e(member.name)} 회원 수정">${icon('edit')}</button></td>
      </tr>`);
      return heading('회원 관리', '새 회원을 추가하고 활동 상태를 관리하세요.', addButton('회원 추가', 'open-member'))
        + panel('회원 명단', rows.length ? table(['이름', '상태', '<span class="sr-only">회원 관리</span>'], rows, 'stack-table member-table') : empty('조건에 맞는 멤버가 없어요.'), {
          subtitle: `전체 ${state.members.length}명 · 활동 중 ${activeCount}명`, actions: controls
        });
    }

    function statistics(state, ui) {
      const report = stats(state, ui.statsMonth);
      const months = [...new Set([today.slice(0, 7), ...state.events.filter(event => event.finalized).map(event => event.date.slice(0, 7))])].sort().reverse();
      const selector = `<select data-filter="stats-month" aria-label="반기 집계 기간">${option('', '전체 기간', ui.statsMonth)}${months.map(month => {
        const [year, monthNumber] = month.split('-');
        return option(month, `${year}년 ${Number(monthNumber)}월`, ui.statsMonth);
      }).join('')}</select>`;
      const bars = report.byEvent.map(({event, present, total, rate}) => `<div class="bar-item">
        <div class="bar-label"><span>${e(dateLabel(event.date))} · ${e(event.title)}</span><strong>${present}명 / ${total}명</strong></div>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width: ${rate}%"></div></div>
      </div>`);
      const rows = report.byMember.map(({member, present, total, rate}) => `<tr>
        <td><strong>${e(member.name)}</strong></td><td>${present}회</td><td>${total}회</td><td>${rate}%</td>
      </tr>`);
      const credits = qualification(state);
      const creditRows = credits.byMember.map(({member, first, second, met}) => `<tr><td><strong>${e(member.name)}</strong></td>
        <td>${first} / 3회</td><td>${second} / 3회</td><td>${pill(met ? '기준 충족' : '진행 중', met ? 'green' : 'neutral')}</td></tr>`);
      return heading('반기 집계', '실제 출석과 반기 줄서기 인정 횟수를 확인하세요.', selector)
        + summary([['일정 횟수', `${report.sessions}회`], ['누적 출석', `${report.present}회`], ['전체 출석률', report.total ? `${report.rate}%` : '—', 'green']])
        + panel(`${credits.period} 줄서기 인정`, creditRows.length ? table(['멤버', credits.ranges[0], credits.ranges[1], '예시 3+3 기준'], creditRows) : empty('집계할 회원이 없어요.'), {
          subtitle: '확정한 회차에서 직접·대타·별도 인정을 합산한 횟수입니다. 수령 확정은 실제 기준에 따라 운영진이 확인합니다.'
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
        + panel('반복 설정', `<dl class="summary-grid">
          <div class="summary-item"><dt>일정 이름</dt><dd>${e(rule.title)}</dd></div>
          <div class="summary-item"><dt>시간</dt><dd>매주 ${weekdays[rule.weekday]} ${eventTime(rule)}</dd></div>
          <div class="summary-item"><dt>장소</dt><dd>${e(rule.place)}</dd></div>
          <div class="summary-item"><dt>투표 마감</dt><dd>${rule.deadlineDays ? `일정 ${e(rule.deadlineDays)}일 전` : '일정 당일'} ${e(rule.deadlineTime)}</dd></div>
        </dl><div class="form-actions">${action('다음 일정 만들기', 'generate-next', '', {tone: 'primary', symbol: 'plus', extra: rule.enabled ? '' : 'disabled'})}</div>`, {
          subtitle: '다음 일정 만들기를 누르면 이 설정으로 일정과 투표를 준비해요.',
          actions: rule.enabled ? pill('사용 중', 'green') : pill('사용 중지')
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
        + field('후발 시간', input('lateTime', event.lateTime, 'type="time" required'))
        + field('투표 마감 시간', input('deadlineTime', event.deadlineTime, 'type="time" required'));
    }

    function form(dialog, title, content, submit = '저장') {
      return `<header class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="닫기">${icon('x')}</button></header>
        <form data-form="${dialog.type}"${dialog.id ? ` data-id="${e(dialog.id)}"` : ''}>
          <div class="dialog-body form-grid">${content}</div>
          <footer class="dialog-footer form-actions">${action('취소', 'close-dialog')}<button class="btn btn-primary" type="submit">${submit}</button></footer>
        </form>`;
    }

    function eventDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id) || state.repeat;
      // Three groups, as the live eventForm (DESIGN.md 6 UX 점검표 16): what and where, when, what members see.
      const group = (legend, body) => `<fieldset class="form-group"><legend>${legend}</legend><div class="form-grid">${body}</div></fieldset>`;
      return form(dialog, dialog.id ? '일정 수정' : '새 일정',
        group('무엇을, 어디서', field('일정 이름', input('title', event.title, 'required maxlength="80"'))
          + field('종류', `<select name="kind">${Object.entries(kindLabels).map(([value, label]) => option(value, label, event.kind ?? 'regular')).join('')}</select>`)
          + field('장소', input('place', event.place, 'required maxlength="100"'), true))
        + group('언제', field('날짜', input('date', event.date || today, 'type="date" required'))
          + field('투표 마감일', input('deadline', event.deadline || today, 'type="date" required'))
          + field('시작 시간', input('time', event.time, 'type="time" required'))
          + field('종료 시간', input('endTime', event.endTime, 'type="time" required'))
          + slotFields(event))
        + group('회원에게 보이기', field('안내 메모', `<textarea name="notes" rows="3" maxlength="500">${e(event.notes || '')}</textarea>`, true)
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
        + field('메모', `<textarea name="notes" rows="3" maxlength="500">${e(member.notes || '')}</textarea>`, true))
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
        + field('장소', input('place', rule.place, 'required maxlength="100"'), true));
    }

    function voteDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id);
      if (!event) return '';
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
      return form(dialog, '예시 응답 조정',
        `<p class="form-note form-field-full">예시 회원의 응답을 정정합니다. 저장하면 기존 응답 한 건이 갱신됩니다.</p>`
        + field('멤버', `<select name="member" required><option value="">선택하세요</option>${members.map(member => option(member.id, member.name, '')).join('')}</select>`, true)
        + field('응답', `<select name="vote" required><option value="">선택하세요</option>${option('early', `${event.earlyTime} 선발`, '')}${option('late', `${event.lateTime} 후발`, '')}${option('no', '불참', '')}</select>`, true)
        + check('lunch', '점심에 함께해요', false),
        '응답 저장');
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
      return confirm('회원에게 보낼 접속 안내', `<p>${e(member.name)} 회원에게 이 내용을 개인 메시지로 전달해 주세요. 임시 번호는 이 창을 닫으면 다시 볼 수 없어요.</p>
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
        buttons.push(action('수정', 'open-notice', notice.id, {symbol: 'edit'}), action('텍스트 복사', 'copy-notice', notice.id, {symbol: 'clipboard'}),
          action(notice.pinnedAt ? '고정 해제' : '상단 고정', 'toggle-pin', notice.id, {symbol: 'pushpin', extra: 'data-kind="notice"'}));
      } else {
        const event = state.events.find(item => item.id === dialog.id);
        if (!event) return '';
        const open = !event.finalized && !event.cancelled;
        buttons.push(action('일정 수정', 'open-event', event.id, {symbol: 'edit'}), action('공지 초안 만들기', 'open-event-notice', event.id, {symbol: 'megaphone'}));
        if (open && !deadlinePassed(event)) buttons.push(action(event.pollOpen ? '투표 마감' : '투표 열기', 'toggle-poll', event.id));
        if (!event.finalized && event.roster.length) buttons.push(action('응답 조정', 'open-vote', event.id));
        if (open) buttons.push(action(event.pinnedAt ? '고정 해제' : '상단 고정', 'toggle-pin', event.id, {symbol: 'pushpin', extra: 'data-kind="event"'}),
          action('일정 취소', 'cancel-event', event.id, {tone: 'text'}));
      }
      return confirm(dialog.kind === 'notice' ? '공지 메뉴' : '회차 메뉴', `<div class="menu-actions action-menu">${buttons.join('')}</div>`, '');
    }

    return {eventList, eventDetail, notices, members, statistics, repeat, eventDialog, memberDialog, noticeDialog, repeatDialog, voteDialog, pinDialog, cancelDialog,
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
      return content ? `<div class="secondary-page">${content}</div>` : '';
    },
    renderDialog(dialog, state, helpers) {
      const view = makeView(helpers);
      const render = {
        event: view.eventDialog,
        member: view.memberDialog,
        notice: view.noticeDialog,
        repeat: view.repeatDialog,
        vote: view.voteDialog,
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
