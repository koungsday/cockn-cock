(function () {
  'use strict';

  function content(kind, id, state) {
    return (kind === 'vote' ? state.events : state.notices).find(item => item.id === id);
  }

  function summary(kind, item, helpers) {
    if (kind === 'vote') return `${helpers.dateLabel(item.date)} ${item.time}`;
    return item.body.replace(/\s+/g, ' ').trim();
  }

  function mark(helpers) {
    return `<img class="share-brand-mark" width="34" height="34" src="${helpers.escape(helpers.brandAsset ?? 'assets/shuttlecock-icon-96.png')}" alt="">`;
  }

  function decoration() {
    return '<div class="share-art-decoration" aria-hidden="true"><span></span><span></span><span></span></div>';
  }

  function art(kind, item, helpers) {
    const isVote = kind === 'vote';
    const label = isVote ? '참석 투표' : '새 공지';
    const detail = summary(kind, item, helpers);

    return `
      <div class="share-art share-art--${kind}" data-share-image="${kind}" aria-hidden="true">
        <div class="share-art-content">
          <span class="share-art-brand">${mark(helpers)} 썬콕19</span>
          <span class="share-art-label">${label}</span>
          <strong class="share-art-title">${helpers.escape(item.title)}</strong>
          <span class="share-art-detail">${helpers.escape(detail)}</span>
        </div>
        ${decoration()}
      </div>`;
  }

  function linkFor(kind, item) {
    const example = window.clubPublishedShares?.[kind];
    if (!item.cancelled && example?.href.startsWith('https://') &&
        Object.entries(example.fields).every(([field, value]) => item[field] === value)) {
      return { href: example.href, published: true };
    }

    const link = new URL(window.location.href);
    link.hash = `public-${kind}/${item.id}`;
    return { href: link.href, published: false };
  }

  function renderShare(dialog, state, helpers) {
    const { kind, id } = dialog;
    const item = content(kind, id, state);
    if (!item) return '';

    const isVote = kind === 'vote';
    const title = isVote ? '참석 투표 공유' : '공지 공유';
    const description = isVote
      ? `${summary(kind, item, helpers)} · ${item.place}`
      : summary(kind, item, helpers);
    const publicRoute = `public-${kind}/${id}`;
    const link = linkFor(kind, item);
    const linkLabel = link.published ? '카카오톡 공유용 예시 링크' : '이 브라우저 미리보기 링크';
    const linkNote = link.published
      ? '카카오톡에 붙여 넣으면 고정된 예시가 열려요. 편집 내용과 투표 응답은 이 브라우저에만 저장돼요.'
      : '이 링크로는 이 브라우저에 저장된 내용을 확인할 수 있어요. 다른 사람에게 편집 내용이나 카카오톡 미리보기가 전달되지 않아요.';

    return `
      <div class="share-dialog-content">
        <div class="share-dialog-head">
          <h2 id="dialog-title">${title}</h2>
          <button type="button" class="share-close" data-action="close-dialog" aria-label="닫기">&times;</button>
        </div>
        <div class="share-chat">
          <div class="share-chat-head">
            <strong>카카오톡 미리보기</strong>
            <span>예시</span>
          </div>
          <div class="share-chat-thread">
            ${mark(helpers)}
            <div class="share-chat-message">
              ${art(kind, item, helpers)}
              <div class="share-chat-caption">
                <strong>${helpers.escape(item.title)}</strong>
                <span>${helpers.escape(description)}</span>
                <small>썬콕19 일요모임</small>
              </div>
            </div>
          </div>
        </div>
        <label class="share-link-field">
          <span>${linkLabel}</span>
          <input id="share-link" type="text" value="${helpers.escape(link.href)}" readonly>
        </label>
        <div class="share-dialog-actions">
          <button type="button" class="share-button share-button--secondary" data-route="${helpers.escape(publicRoute)}">받는 화면 보기</button>
          <button type="button" class="share-button share-button--primary" data-action="copy-share"${link.published ? ' data-published-link' : ''}>링크 복사</button>
        </div>
        <p class="share-feedback" role="status"></p>
        <p class="share-preview-note">${linkNote}</p>
      </div>`;
  }

  function voteForm(event, state, helpers) {
    // 일정 취소 (FLOW.md 10), as the live memberVoteScreen: no form, and the notes above say why.
    if (event.cancelled) {
      return `<p class="public-status"><strong>이 일정은 취소됐어요.</strong>${event.notes ? '위 안내를 확인해 주세요.' : ''}</p>`;
    }
    if (!event.pollOpen || event.finalized || (helpers.deadlinePassed ? helpers.deadlinePassed(event) : event.deadline < helpers.today)) {
      return '<p class="public-status">현재는 참석 투표를 받고 있지 않아요.</p>';
    }

    const names = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
    if (!names.length) return '<p class="public-status">이 일정에 투표할 멤버가 아직 없습니다.</p>';

    const receipt = helpers.publicReceipts?.[event.id];
    const receiptMember = receipt && names.find(member => member.id === receipt.member);
    const {escape} = helpers;
    // 선발, 후발, 불참 (the live choiceFields; 사용자 결정 2026-11-27).
    const slots = [['early', `${event.earlyTime} 선발`], ['late', `${event.lateTime} 후발`], ['no', '불참']];
    const ownVote = receiptMember ? event.votes[receiptMember.id] : null;
    const ownLunch = Boolean(receiptMember && event.lunch[receiptMember.id]);
    const receiptVote = slots.find(([key]) => key === ownVote)?.[1] || '기존';

    return `
      <form class="public-form" data-form="public-vote" data-id="${helpers.escape(event.id)}">
        ${receiptMember ? `<p class="public-receipt" role="status">${escape(receiptMember.name)}님의 ${escape(receiptVote)} 응답입니다. 마감 전까지 바꿀 수 있어요.</p>
          <input name="member" type="hidden" value="${escape(receiptMember.id)}">` : `
          <p class="public-form-note">가상 화면입니다. 실제 생년월일이나 개인 PIN을 넣지 마세요.</p>
          <label class="public-field">
            <span>예시 회원</span>
            <select name="member" required>
              <option value="" selected disabled>예시 회원 선택</option>
              ${names.map(member => `<option value="${escape(member.id)}">${escape(member.name)}</option>`).join('')}
            </select>
          </label>
          <label class="public-field">
            <span>체험 번호</span>
            <input name="demoPin" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" aria-describedby="demo-pin-help" required>
          </label>`}
        ${receiptMember ? '' : '<p class="public-form-note" id="demo-pin-help">예시 공용 번호는 190019입니다.</p>'}
        <fieldset class="public-choices">
          <legend>참석</legend>
          <div class="public-choice-row public-choice-slots">
            ${slots.map(([key, label]) => `<label class="public-choice">
              <input type="radio" name="vote" value="${key}" required${ownVote === key ? ' checked' : ''}>
              <span>${escape(label)}</span>
            </label>`).join('')}
          </div>
        </fieldset>
        <label class="public-lunch"><input type="checkbox" name="lunch"${ownLunch ? ' checked' : ''}> 점심 함께해요</label>
        <button class="share-button share-button--primary" type="submit">${receiptMember ? '내 응답 변경' : '응답 보내기'}</button>
        ${receiptMember ? `<button class="share-button share-button--secondary" type="button" data-action="cancel-public-vote" data-id="${escape(event.id)}">응답 취소</button>` : ''}
      </form>`;
  }

  // 응답 현황, as the live countsBlock (worker/public/views.mjs) draws it: counts on the event's roster, never names.
  function countsBlock(event, escape) {
    const count = slot => event.roster.filter(id => event.votes[id] === slot).length;
    const counts = { early: count('early'), late: count('late'), no: count('no'), lunch: event.roster.filter(id => event.lunch?.[id]).length };
    const coming = counts.early + counts.late;
    if (!coming && !counts.lunch && !counts.no) return '<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>아직 응답이 없어요</span></p></div>';
    const rows = [[`${event.earlyTime} 선발`, counts.early, 'slot'], [`${event.lateTime} 후발`, counts.late, 'slot'], ['점심 함께', counts.lunch, 'lunch']];
    return `<div class="member-counts"><p class="member-counts-head"><strong>응답 현황</strong><span>참석 ${coming}명${counts.no ? ` · 불참 ${counts.no}명` : ''}</span></p>
    <ul>${rows.map(([label, n, tone]) => `<li><span>${escape(label)}</span><strong>${n}명</strong><svg class="member-count-bar" viewBox="0 0 ${Math.max(coming, counts.lunch, 1)} 1" preserveAspectRatio="none" aria-hidden="true"><rect class="member-count-${tone}" width="${n}" height="1"/></svg></li>`).join('')}</ul>
    <p class="member-counts-note">누가 응답했는지는 보이지 않아요</p></div>`;
  }

  // 회원 보기 (ROLES.md 3단계): the live member screens (worker/public/views.mjs) inside the same shell, one centred column
  // of cards. Links are the shell's own routes, so the demo opens them in place.
  function memberPage(content, helpers, back = null) {
    const { escape } = helpers;
    return `<div class="public-share-page member-page">${back ? `<a class="member-back" href="#${escape(back[0])}" data-route="${escape(back[0])}">${helpers.icon('arrow-left', 18)} ${back[1]}</a>` : ''}${content}</div>`;
  }

  function renderPublic(route, state, helpers) {
    const kind = route.page === 'public-vote' ? 'vote' : 'notice';
    const item = content(kind, route.id, state);
    const escape = helpers.escape;
    const back = kind === 'vote' ? ['member-events', '일정'] : ['member-notices', '공지'];
    if (!item) {
      return memberPage(`<div class="public-share-card"><div class="public-share-content">
        <h1 tabindex="-1">공유 내용을 찾을 수 없어요</h1><p>모임 운영자에게 링크를 다시 받아 주세요.</p></div></div>`, helpers, back);
    }

    const description = kind === 'vote'
      ? `<dl class="public-event-facts">
          <div><dt>일시</dt><dd>${escape(helpers.dateLabel(item.date))} <span class="nowrap">${escape(item.time)}–${escape(item.endTime)}</span></dd></div>
          <div><dt>장소</dt><dd>${escape(item.place)}</dd></div>
          <div><dt>투표 마감</dt><dd>${escape(helpers.dateLabel(item.deadline))} ${escape(item.deadlineTime)}</dd></div>
        </dl>
        ${item.notes ? `<p class="public-share-body">${escape(item.notes)}</p>` : ''}
        ${voteForm(item, state, helpers)}
        ${countsBlock(item, escape)}`
      : `<p class="public-share-body">${escape(item.body)}</p>`;

    return memberPage(`
        <article class="public-share-card">
          <header class="public-story-head share-art--${kind}">
            <span class="public-share-type">${kind === 'vote' ? (item.cancelled ? '취소된 일정' : '참석 투표') : '모임 공지'}</span>
            <h1 tabindex="-1">${escape(item.title)}</h1>
            ${kind === 'notice' ? `<time datetime="${escape(item.date)}">${escape(helpers.dateLabel(item.date))}</time>` : ''}
            ${decoration()}
          </header>
          <div class="public-share-content">
            ${description}
          </div>
        </article>`, helpers, back);
  }

  // The member's events as the live listPublic gives them: upcoming and not wrapped up. The demo has no sign-in, so
  // every open vote waits for the visitor; one they answered here (publicReceipts) reads 응답 완료.
  function memberEvents(state, helpers) {
    const now = helpers.flowNow;
    const listed = state.events.filter(event => event.date >= now.day && !event.finalized).map(event => ({
      ...event, canVote: event.pollOpen && !event.cancelled && `${event.deadline}T${event.deadlineTime}` > now.minute,
      deadlineDate: event.deadline, deadline: `${event.deadline}T${event.deadlineTime}`, eligible: true,
      mySlot: helpers.publicReceipts?.[event.id]?.vote ?? null,
    }));
    return window.clubFlow.memberOrder(listed, now);
  }

  const slotWords = { early: '선발', late: '후발' };
  // 투표하기 / 응답 변경 / 일정 확인 and the sentence that explains it (the live memberEventState).
  function eventState(event) {
    if (event.cancelled) return { action: '일정 확인', primary: false, row: '취소됨', note: '이 일정은 취소됐어요.' };
    if (event.canVote && event.mySlot) return { action: '응답 변경', primary: false, row: '응답 완료', note: `내 응답 <strong>${slotWords[event.mySlot]}</strong> · 마감 전까지 바꿀 수 있어요.` };
    if (event.canVote) return { action: '투표하기', primary: true, row: '투표하기', note: '예시 회원을 골라 응답해 볼 수 있어요.' };
    return { action: '일정 확인', primary: false, row: '일정 확인', note: event.pollOpen ? '투표가 마감됐어요.' : '현재는 참석 투표를 받고 있지 않아요.' };
  }

  function memberRoutes(helpers) {
    const { escape, dateLabel } = helpers;
    const link = (kind, id) => `href="#public-${kind}/${escape(id)}" data-route="public-${kind}/${escape(id)}"`;
    const when = event => `${dateLabel(event.date)} ${event.time}–${event.endTime}`;
    const deadline = event => `${dateLabel(event.deadlineDate)} ${event.deadline.slice(11)}`;
    const eventRow = event => {
      const { row } = eventState(event);
      const tone = row === '투표하기' ? ' member-record-open' : row === '응답 완료' ? ' member-record-done' : '';
      return `<li class="member-record" data-date="${escape(event.date)}"><a class="member-record-link" ${link('vote', event.id)}>
        <span><strong>${helpers.pinMark(event)}${escape(event.title)}</strong><span class="member-record-meta"><time datetime="${escape(event.date)}">${escape(helpers.kindPrefix(event) + when(event))}</time><span>${escape(event.place)}</span>${event.canVote ? `<span>투표 마감 ${escape(deadline(event))}</span>` : ''}</span></span>
        <span class="member-record-action${tone}">${row}</span></a></li>`;
    };
    const noticeRow = notice => `<li class="member-record"><a class="member-record-link" ${link('notice', notice.id)}>
        <span><strong>${helpers.pinMark(notice)}${escape(notice.title)}</strong><time class="member-record-meta" datetime="${escape(notice.date)}">${escape(dateLabel(notice.date))}</time></span>
        <span class="member-record-arrow" aria-hidden="true">${helpers.icon('chevron-right', 18)}</span></a></li>`;
    const listCard = (id, title, rows, empty, heading = 'h2') => `<section class="public-share-card member-list" aria-labelledby="${id}"><div class="public-share-content">
      <${heading} id="${id}"${heading === 'h1' ? ' tabindex="-1"' : ''}>${title}</${heading}>${rows.length ? `<ul class="member-records">${rows.join('')}</ul>` : `<p class="public-form-note">${empty}</p>`}</div></section>`;
    const nextCard = event => {
      const { action, primary, note } = eventState(event);
      const kind = event.cancelled ? '취소된 일정' : event.canVote ? '참석 투표' : event.date === helpers.flowNow.day ? '오늘 일정' : '다음 일정';
      return `<article class="public-share-card member-next" aria-labelledby="member-next-title">
        <header class="public-story-head share-art--vote">${decoration()}<span class="public-share-type">${kind}${helpers.pinMark(event)}</span>
          <h2 id="member-next-title" class="public-title">${escape(event.title)}</h2><time datetime="${escape(event.date)}">${escape(when(event))}</time></header>
        <div class="public-share-content">
          <dl class="public-event-facts"><div><dt>장소</dt><dd>${escape(event.place)}</dd></div><div><dt>투표 마감</dt><dd>${escape(deadline(event))}</dd></div></dl>${countsBlock(event, escape)}
          <p class="member-answer">${note}</p>
          <a class="share-button ${primary ? 'share-button--primary' : 'share-button--secondary'} member-next-action" ${link('vote', event.id)}>${action}</a>
        </div></article>`;
    };
    // No event yet: the big card keeps its place (the live noNextCard).
    const noNextCard = () => `<article class="public-share-card member-next" aria-labelledby="member-next-title">
        <header class="public-story-head share-art--vote">${decoration()}<span class="public-share-type">다음 일정</span>
          <h2 id="member-next-title" class="public-title">예정된 일정이 없어요.</h2></header>
        <div class="public-share-content"><p class="member-answer">운영진이 일정을 올리면 여기에 보여요.</p></div></article>`;
    return { eventRow, noticeRow, listCard, nextCard, noNextCard };
  }

  const noEvents = '게시된 일정이 없어요. 운영진이 일정을 올리면 여기에 보여요.';
  const pinnedFirst = notices => [...notices].sort((a, b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.date.localeCompare(a.date));

  // 회원 보기 routes: #member (홈), #member-events (일정), #member-notices (공지), #member-record (내 기록), and the
  // vote and notice they open (#public-vote/<id>, #public-notice/<id>, also what the 카톡 links lead to).
  function renderMember(route, state, helpers) {
    if (route.page === 'public-vote' || route.page === 'public-notice') return renderPublic(route, state, helpers);
    const { eventRow, noticeRow, listCard, nextCard, noNextCard } = memberRoutes(helpers);
    const events = memberEvents(state, helpers);
    // 일정: the month's calendar above the list in one card (the live memberEventsScreen).
    if (route.page === 'member-events') {
      return memberPage(`<section class="public-share-card member-list" aria-labelledby="member-events"><div class="public-share-content">
        <h1 id="member-events" tabindex="-1">일정</h1><div class="list-tools"><span>예정 ${events.length}개</span>${helpers.calendarToggle()}</div>${helpers.calendarOpen() ? helpers.calendar(events) : ''}${events.length ? `<ul class="member-records">${events.map(eventRow).join('')}</ul>` : `<p class="public-form-note">${noEvents}</p>`}</div></section>`, helpers);
    }
    if (route.page === 'member-notices') {
      return memberPage(listCard('member-notices', '공지', pinnedFirst(state.notices).map(noticeRow), '게시된 공지가 없어요.', 'h1'), helpers);
    }
    if (route.page === 'member-record') {
      return memberPage(`<section class="public-share-card member-list" aria-labelledby="member-record"><div class="public-share-content">
        <h1 id="member-record" tabindex="-1">내 기록</h1>
        <p class="public-form-note">가상 체험에는 로그인이 없어 내 기록을 보여 주지 않아요. 실사용에서는 로그인한 회원에게 이번 해 출석, 반기 줄서기 인정, 콕 수령이 보여요.</p>
        </div></section>`, helpers);
    }
    // 회원 홈 (FLOW.md 4·5): the big card, 응답할 투표 n개, 이후 일정 and 공지 with the pinned first.
    const [next, ...others] = events;
    const waiting = others.filter(window.clubFlow.awaitingVote);
    const later = others.filter(event => !window.clubFlow.awaitingVote(event));
    return memberPage(`<h1 class="sr-only" tabindex="-1">썬콕19 모임 홈</h1>
      ${next ? nextCard(next) : noNextCard()}
      ${waiting.length ? listCard('member-waiting', `응답할 투표 ${waiting.length}개`, waiting.map(eventRow), '') : ''}
      ${later.length ? listCard('member-events', '이후 일정', later.map(eventRow), '') : ''}
      ${listCard('member-notices', '공지', pinnedFirst(state.notices).map(noticeRow), '게시된 공지가 없어요.')}
      <p class="public-form-note">체험 응답은 이 브라우저에만 저장돼요.</p>`, helpers);
  }

  window.clubShare = { renderPublic, renderMember, renderShare, linkFor };
})();
