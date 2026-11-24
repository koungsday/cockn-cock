(() => {
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const voteLabels = { yes: '참석', no: '불참' };
  const attendanceLabels = { present: '출석', absent: '결석' };

  function makeView(helpers) {
    const { escape: e, icon, dateLabel, today, counts, attendanceCounts, stats } = helpers;

    function action(text, name, id, options = {}) {
      const { tone = 'secondary', symbol, extra = '' } = options;
      return `<button class="btn btn-${tone}" type="button" data-action="${name}"${id ? ` data-id="${e(id)}"` : ''} ${extra}>${symbol ? icon(symbol) : ''}${text}</button>`;
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

    function table(columns, rows) {
      return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function summary(items) {
      return `<dl class="summary-grid">${items.map(([label, value, tone]) => `<div class="summary-item${tone ? ` summary-${tone}` : ''}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
    }

    function eventStatus(event) {
      if (event.finalized) return pill('출석 마감', 'neutral');
      if (!event.pollOpen) return pill('투표 닫힘', 'neutral');
      if (event.deadline < today) return pill('투표 기한 종료', 'neutral');
      return pill('투표 진행 중', 'green');
    }

    function eventPath(event, tab = 'poll') {
      return `event/${encodeURIComponent(event.id)}/${tab}`;
    }

    function eventTime(event) {
      return `${e(event.time)}–${e(event.endTime)}`;
    }

    function eventList(state) {
      const compare = (a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      const ordered = [...state.events].sort(compare);
      const upcoming = ordered.filter(event => event.date >= today && !event.finalized);
      const upcomingIds = new Set(upcoming.map(event => event.id));
      const past = ordered.filter(event => !upcomingIds.has(event.id)).reverse();

      function rows(events) {
        return events.map(event => {
          const votes = counts(event);
          return `<tr>
            <td><strong>${e(dateLabel(event.date))}</strong><small>${eventTime(event)}</small></td>
            <td><a class="record-title" href="#${eventPath(event)}" data-route="${eventPath(event)}">${e(event.title)}</a><small>${e(event.place)}</small></td>
            <td>${eventStatus(event)}</td>
            <td>${votes.yes}명 참석</td>
            <td class="table-actions">${routeLink('보기', eventPath(event, event.finalized ? 'attendance' : 'poll'))}</td>
          </tr>`;
        });
      }

      const columns = ['일시', '일정', '상태', '참석 응답', '<span class="sr-only">일정 열기</span>'];
      return heading('일정·참석 투표', '예정된 운동과 지난 출석 기록을 확인하세요.', action('새 일정', 'open-event', '', {tone: 'primary', symbol: 'plus'}))
        + panel('예정된 일정', upcoming.length ? table(columns, rows(upcoming)) : empty('예정된 일정이 없어요.'))
        + panel('지난 일정', past.length ? table(columns, rows(past)) : empty('지난 일정이 없어요.'));
    }

    function eventDetail(route, state) {
      const event = state.events.find(item => item.id === route.id);
      if (!event) return heading('일정을 찾을 수 없어요', '', routeLink('일정 목록', 'events', 'secondary'));
      const isAttendance = route.tab === 'attendance';
      const pollAvailable = event.pollOpen && !event.finalized && event.deadline >= today;
      const subheader = `<div class="event-facts"><span>${icon('calendar')}${e(dateLabel(event.date))}</span><span>${icon('clock')}${eventTime(event)}</span><span>${icon('pin')}${e(event.place)}</span></div>`;
      const nav = `<nav class="tabs" aria-label="일정 상세 메뉴">${[['poll', '참석 투표'], ['attendance', '출석 체크']].map(([tab, label]) => {
        const path = eventPath(event, tab);
        const active = (tab === 'attendance') === isAttendance;
        return `<a href="#${path}" data-route="${path}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
      }).join('')}</nav>`;
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);

      function poll() {
        const report = counts(event);
        const closeAction = !event.finalized && event.deadline >= today ? action(event.pollOpen ? '투표 마감' : '투표 열기', 'toggle-poll', event.id) : '';
        const shareAction = action('카톡 공유', 'open-share', event.id, {tone: 'primary', symbol: 'link', extra: 'data-kind="vote"'});
        const actions = closeAction + shareAction + (pollAvailable && members.length ? action('회원 투표 체험', 'open-vote', event.id, {tone: 'text'}) : '');
        const rows = members.map(member => {
          const vote = event.votes[member.id];
          return `<tr><td><strong>${e(member.name)}</strong></td><td>${pill(voteLabels[vote] || '미응답', vote === 'yes' ? 'green' : 'neutral')}</td></tr>`;
        });
        return panel('참석 응답', summary([['참석', `${report.yes}명`, 'green'], ['불참', `${report.no}명`], ['미응답', `${report.pending}명`]])
          + (rows.length ? table(['멤버', '응답'], rows) : empty('이 일정에 등록된 멤버가 없어요.')), {
          subtitle: `투표 마감일 ${e(dateLabel(event.deadline))}`, actions
        });
      }

      function attendance() {
        const report = attendanceCounts(event);
        const actionAllowed = event.date <= today && !event.finalized;
        const rows = members.map(member => {
          const vote = event.votes[member.id];
          const status = event.attendance[member.id];
          const buttons = ['present', 'absent'].map(value => {
            const active = status === value;
            return action(attendanceLabels[value], 'mark-attendance', event.id, {
              tone: active ? 'primary' : 'secondary',
              extra: `data-member="${e(member.id)}" data-value="${active ? '' : value}" aria-label="${e(member.name)} ${attendanceLabels[value]}" aria-pressed="${active}"`
            });
          }).join('');
          return `<tr><td><strong>${e(member.name)}</strong></td><td>${voteLabels[vote] || '미응답'}</td><td>${actionAllowed
            ? `<div class="table-actions">${buttons}</div>`
            : pill(attendanceLabels[status] || '미확인', status === 'present' ? 'green' : 'neutral')}</td></tr>`;
        });
        const actions = event.finalized
          ? action('출석 다시 열기', 'reopen-attendance', event.id)
          : actionAllowed && report.total
            ? action('출석 확정', 'finalize', event.id, {tone: 'primary', extra: report.pending ? 'disabled' : ''})
            : '';
        const subtitle = event.finalized
          ? '확정한 출석 기록이 통계에 반영됐어요.'
          : actionAllowed
            ? '모든 멤버의 출석 또는 결석을 선택하면 출석을 확정할 수 있어요.'
            : '운동 당일부터 출석을 기록할 수 있어요.';
        return panel('실제 출석', summary([['출석', `${report.present}명`, 'green'], ['결석', `${report.absent}명`], ['미확인', `${report.pending}명`]])
          + (rows.length ? table(['멤버', '투표 응답', '실제 출석'], rows) : empty('이 일정에 등록된 멤버가 없어요.')), { subtitle, actions });
      }

      return `<div class="back-link">${routeLink('일정 목록', 'events', 'text', 'arrow-left')}</div>`
        + heading(e(event.title), subheader,
          action('공지 초안 만들기', 'open-event-notice', event.id, {symbol: 'megaphone'})
          + action('일정 수정', 'open-event', event.id, {symbol: 'edit'}))
        + (event.notes ? `<p class="event-notes">${e(event.notes)}</p>` : '')
        + nav
        + (isAttendance ? attendance() : poll());
    }

    function notices(state) {
      const ordered = [...state.notices].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
      const items = ordered.map(notice => `<article class="notice-item">
        <div class="notice-date"><time datetime="${e(notice.date)}">${e(dateLabel(notice.date))}</time>${notice.pinned ? pill('상단 고정', 'green') : ''}</div>
        <h3>${e(notice.title)}</h3>
        <p class="preserve-lines">${e(notice.body)}</p>
        <div class="notice-actions">${action('카톡 공유', 'open-share', notice.id, {symbol: 'link', extra: 'data-kind="notice"'})}${action('텍스트 복사', 'copy-notice', notice.id, {tone: 'text', symbol: 'clipboard'})}${action('수정', 'open-notice', notice.id, {tone: 'text', symbol: 'edit'})}</div>
      </article>`);
      return heading('공지사항', '운동 일정 변경이나 모임 소식을 올리세요.', action('새 공지', 'open-notice', '', {tone: 'primary', symbol: 'plus'}))
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
      const rows = filtered.map(member => `<tr>
        <td><div class="member-name"><span class="avatar" aria-hidden="true">${e(member.name.slice(0, 1))}</span><strong>${e(member.name)}</strong></div></td>
        <td>${e(member.role)}</td>
        <td>${member.status === 'active' ? pill('활동 중', 'green') : pill('활동 중지')}</td>
        <td>${e(dateLabel(member.joined))}</td>
        <td class="table-actions">${action('수정', 'open-member', member.id, {tone: 'text', extra: `aria-label="${e(member.name)} 정보 수정"`})}</td>
      </tr>`);
      return heading('멤버 관리', '새 멤버를 추가하고 활동 상태를 관리하세요.', action('멤버 추가', 'open-member', '', {tone: 'primary', symbol: 'plus'}))
        + panel('멤버 명단', rows.length ? table(['이름', '역할', '상태', '가입일', '<span class="sr-only">멤버 수정</span>'], rows) : empty('조건에 맞는 멤버가 없어요.'), {
          subtitle: `전체 ${state.members.length}명 · 활동 중 ${activeCount}명`, actions: controls
        });
    }

    function statistics(state, ui) {
      const report = stats(state, ui.statsMonth);
      const months = [...new Set([today.slice(0, 7), ...state.events.filter(event => event.finalized).map(event => event.date.slice(0, 7))])].sort().reverse();
      const selector = `<select data-filter="stats-month" aria-label="출석 통계 기간">${option('', '전체 기간', ui.statsMonth)}${months.map(month => {
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
      return heading('출석 통계', '확정한 출석 기록을 일정별로 확인하세요.', selector)
        + summary([['운동 횟수', `${report.sessions}회`], ['누적 출석', `${report.present}회`], ['전체 출석률', report.total ? `${report.rate}%` : '—', 'green']])
        + panel('일정별 출석', bars.length ? `<div class="bar-chart">${bars.join('')}</div>` : empty('이 기간에 확정된 출석 기록이 없어요.'), {subtitle: '일정 참여 대상 중 실제 출석한 인원이에요.'})
        + panel('멤버별 출석', rows.length ? table(['멤버', '출석', '참여 대상 일정', '출석률'], rows) : empty('집계할 출석 기록이 없어요.'));
    }

    function repeat(state) {
      const rule = state.repeat;
      const steps = [
        ['다음 일정 만들기', '정해둔 요일, 시간, 장소를 새 일정에 불러와요.'],
        ['공지와 투표 공유', '일정에서 공지 초안을 만들고, 공지와 참석 투표 링크를 단체 채팅방에 올리세요.'],
        ['당일 출석 기록', '운동 날 실제 출석을 확인한 뒤 기록을 확정해요.']
      ];
      return heading('반복 일정', '정기 운동의 일정과 참석 투표를 한 번에 준비하세요.',
        action('반복 설정 수정', 'open-repeat', '', {symbol: 'settings'}))
        + panel('반복 설정', `<dl class="summary-grid">
          <div class="summary-item"><dt>일정 이름</dt><dd>${e(rule.title)}</dd></div>
          <div class="summary-item"><dt>운동 시간</dt><dd>매주 ${weekdays[rule.weekday]} ${eventTime(rule)}</dd></div>
          <div class="summary-item"><dt>장소</dt><dd>${e(rule.place)}</dd></div>
          <div class="summary-item"><dt>투표 마감</dt><dd>${rule.deadlineDays ? `운동 ${e(rule.deadlineDays)}일 전` : '운동 당일'}</dd></div>
        </dl><div class="form-actions">${action('다음 일정 만들기', 'generate-next', '', {tone: 'primary', symbol: 'plus', extra: rule.enabled ? '' : 'disabled'})}</div>`, {
          subtitle: '다음 일정 만들기를 누르면 이 설정으로 일정과 투표를 준비해요.',
          actions: rule.enabled ? pill('사용 중', 'green') : pill('사용 중지')
        })
        + panel('정기 운동 운영 순서', `<ol class="routine-list">${steps.map(([title, description]) => `<li><strong>${title}</strong><p>${description}</p></li>`).join('')}</ol>`);
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

    function form(dialog, title, content, submit = '저장') {
      return `<header class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="닫기">${icon('x')}</button></header>
        <form data-form="${dialog.type}"${dialog.id ? ` data-id="${e(dialog.id)}"` : ''}>
          <div class="dialog-body form-grid">${content}</div>
          <footer class="dialog-footer form-actions">${action('취소', 'close-dialog')}<button class="btn btn-primary" type="submit">${submit}</button></footer>
        </form>`;
    }

    function eventDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id) || state.repeat;
      return form(dialog, dialog.id ? '일정 수정' : '새 일정',
        field('일정 이름', input('title', event.title, 'required maxlength="80"'), true)
        + field('운동 날짜', input('date', event.date || today, 'type="date" required'))
        + field('투표 마감일', input('deadline', event.deadline || today, 'type="date" required'))
        + field('시작 시간', input('time', event.time, 'type="time" required'))
        + field('종료 시간', input('endTime', event.endTime, 'type="time" required'))
        + field('장소', input('place', event.place, 'required maxlength="100"'), true)
        + field('안내 메모', `<textarea name="notes" rows="3" maxlength="500">${e(event.notes || '')}</textarea>`, true)
        + check('pollOpen', '참석 투표 열기', event.pollOpen ?? true));
    }

    function memberDialog(dialog, state) {
      const member = state.members.find(member => member.id === dialog.id) || {role: '회원', status: 'active'};
      return form(dialog, dialog.id ? '멤버 수정' : '멤버 추가',
        field('이름', input('name', member.name, 'required maxlength="40"'), true)
        + field('역할', `<select name="role">${['회원', '운영진'].map(role => option(role, role, member.role)).join('')}</select>`)
        + field('활동 상태', `<select name="status">${option('active', '활동 중', member.status)}${option('inactive', '활동 중지', member.status)}</select>`)
        + field('가입일', input('joined', member.joined || today, 'type="date" required'), true)
        + field('메모', `<textarea name="notes" rows="3" maxlength="500">${e(member.notes || '')}</textarea>`, true));
    }

    function noticeDialog(dialog, state) {
      const notice = state.notices.find(notice => notice.id === dialog.id) || dialog.draft || {};
      return form(dialog, dialog.id ? '공지 수정' : '새 공지',
        field('제목', input('title', notice.title, 'required maxlength="100"'), true)
        + field('내용', `<textarea name="body" rows="6" required maxlength="2000">${e(notice.body || '')}</textarea>`, true)
        + check('pinned', '공지 목록 상단에 고정', notice.pinned),
        dialog.id ? '저장' : '공지 올리기');
    }

    function repeatDialog(dialog, state) {
      const rule = state.repeat;
      return form(dialog, '반복 일정 설정',
        check('enabled', '반복 설정 사용', rule.enabled)
        + field('일정 이름', input('title', rule.title, 'required maxlength="80"'), true)
        + field('반복 요일', `<select name="weekday">${weekdays.map((day, index) => option(index, day, rule.weekday)).join('')}</select>`)
        + field('투표 마감 (운동 며칠 전)', input('deadlineDays', rule.deadlineDays, 'type="number" min="0" max="6" required'))
        + field('시작 시간', input('time', rule.time, 'type="time" required'))
        + field('종료 시간', input('endTime', rule.endTime, 'type="time" required'))
        + field('장소', input('place', rule.place, 'required maxlength="100"'), true));
    }

    function voteDialog(dialog, state) {
      const event = state.events.find(event => event.id === dialog.id);
      if (!event) return '';
      const members = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
      return form(dialog, '회원 투표 체험',
        `<p class="form-note form-field-full">${e(event.title)}에 참여할지 응답해 보세요. 저장하면 이 일정의 투표 결과에 반영돼요.</p>`
        + field('멤버', `<select name="member" required><option value="">선택하세요</option>${members.map(member => option(member.id, member.name, '')).join('')}</select>`, true)
        + field('참석 여부', `<select name="vote" required><option value="">선택하세요</option>${option('yes', '참석', '')}${option('no', '불참', '')}</select>`, true),
        '응답 저장');
    }

    return {eventList, eventDetail, notices, members, statistics, repeat, eventDialog, memberDialog, noticeDialog, repeatDialog, voteDialog};
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
        vote: view.voteDialog
      }[dialog.type];
      return render ? render(dialog, state) : '';
    }
  };
})();
