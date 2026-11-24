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
    return `<span class="share-brand-mark" aria-hidden="true">${helpers.icon('shuttle', 24)}</span>`;
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
    if (example?.href.startsWith('https://') &&
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
    if (!event.pollOpen || event.finalized || (helpers.deadlinePassed ? helpers.deadlinePassed(event) : event.deadline < helpers.today)) {
      return '<p class="public-status">현재는 참석 투표를 받고 있지 않아요.</p>';
    }

    const names = event.roster.map(id => state.members.find(member => member.id === id)).filter(Boolean);
    if (!names.length) return '<p class="public-status">이 일정에 투표할 멤버가 아직 없습니다.</p>';

    const receipt = helpers.publicReceipts?.[event.id];
    const receiptMember = receipt && names.find(member => member.id === receipt.member);
    const {escape} = helpers;
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
          <legend>운동 참석</legend>
          <div class="public-choice-row public-choice-slots">
            ${slots.map(([key, label]) => `<label class="public-choice">
              <input type="radio" name="vote" value="${key}" required${ownVote === key ? ' checked' : ''}>
              <span>${escape(label)}</span>
            </label>`).join('')}
          </div>
        </fieldset>
        <label class="public-lunch"><input type="checkbox" name="lunch"${ownLunch ? ' checked' : ''}> 점심 함께해요</label>
        <button class="share-button share-button--primary" type="submit">${receiptMember ? '내 응답 변경' : '응답 보내기'}</button>
      </form>`;
  }

  function renderPublic(route, state, helpers) {
    const kind = route.page === 'public-vote' ? 'vote' : 'notice';
    const item = content(kind, route.id, state);
    const escape = helpers.escape;
    const masthead = `
      <div class="public-masthead">
        <span class="public-brand">${mark(helpers)} <strong>썬콕19</strong></span>
        <span class="public-example">${helpers.platformHome ? `<a href="${escape(helpers.platformHome)}">콕콕콕! 모임 목록</a>` : '멤버 화면 예시'}</span>
      </div>
      ${helpers.returnFromPublic ? `<button class="public-return" type="button" data-route="${escape(helpers.returnFromPublic)}">운영 화면으로</button>` : ''}`;

    if (!item) {
      return `
        <section class="public-share-page">
          ${masthead}
          <div class="public-share-card">
            <h1>공유 내용을 찾을 수 없어요</h1>
            <p>모임 운영자에게 링크를 다시 받아 주세요.</p>
          </div>
        </section>`;
    }

    const description = kind === 'vote'
      ? `<dl class="public-event-facts">
          <div><dt>일시</dt><dd>${escape(summary(kind, item, helpers))}–${escape(item.endTime)}</dd></div>
          <div><dt>장소</dt><dd>${escape(item.place)}</dd></div>
          <div><dt>투표 마감</dt><dd>${escape(helpers.dateLabel(item.deadline))} ${escape(item.deadlineTime)}</dd></div>
        </dl>
        ${item.notes ? `<p class="public-share-body">${escape(item.notes)}</p>` : ''}
        ${voteForm(item, state, helpers)}`
      : `<p class="public-share-body">${escape(item.body)}</p>`;

    return `
      <section class="public-share-page">
        ${masthead}
        <article class="public-share-card">
          <header class="public-story-head share-art--${kind}">
            <span class="public-share-type">${kind === 'vote' ? '참석 투표' : '모임 공지'}</span>
            <h1>${escape(item.title)}</h1>
            ${kind === 'notice' ? `<time datetime="${escape(item.date)}">${escape(helpers.dateLabel(item.date))}</time>` : ''}
            ${decoration()}
          </header>
          <div class="public-share-content">
            ${description}
          </div>
        </article>
      </section>`;
  }

  window.clubShare = { renderPublic, renderShare, linkFor };
})();
