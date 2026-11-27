(() => {
  // Keep the native control as the source of truth for form values and constraints.
  const selector = 'select, input:is([type=date], [type=time], [type=datetime-local])';
  if (!HTMLElement.prototype.showPopover) return;

  const repositioners = new WeakMap();
  function repositionOpen(event) {
    const popup = document.querySelector('.picker-popup:popover-open');
    if (popup && (!(event.target instanceof Node) || !popup.contains(event.target))) repositioners.get(popup)?.();
  }
  window.addEventListener('resize', repositionOpen);
  document.addEventListener('scroll', repositionOpen, true);

  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const two = value => String(value).padStart(2, '0');
  const make = (tag, text, attributes = {}) => {
    const element = document.createElement(tag);
    element.textContent = text;
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const button = (text, attrs) => make('button', text, { type: 'button', ...attrs });

  function voteStart(field) {
    const form = field.form;
    if (form?.dataset.form !== 'event' || !['deadline', 'deadlineTime'].includes(field.name)) return '';
    if (form.elements.namedItem('pollOpen')?.checked) return window.clubModel.demoNow;
    if (!form.elements.namedItem('open')?.checked) return '';
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })
      .format(new Date()).replace(' ', 'T');
  }

  function calendar(panel, date, onPick, min, max) {
    const initialDay = date || today();
    const firstDay = min && initialDay < min ? min : initialDay;
    let [year, month] = firstDay.split('-').map(Number);
    const header = make('div', '', { class: 'picker-month' });
    const previous = button('‹', { 'aria-label': '이전 달' });
    const next = button('›', { 'aria-label': '다음 달' });
    const heading = make('strong', '', { 'aria-live': 'polite' });
    const days = make('div', '', { class: 'picker-days' });
    header.append(previous, heading, next);
    panel.append(header, days);

    function render() {
      const prefix = year + '-' + two(month);
      heading.textContent = year + '년 ' + month + '월';
      days.replaceChildren(...[...'일월화수목금토'].map(day => make('span', day)));
      const start = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let blank = 0; blank < start; blank++) days.append(make('span', ''));
      for (let day = 1; day <= end; day++) {
        const value = prefix + '-' + two(day);
        const choice = button(String(day), { 'aria-label': value, 'aria-pressed': String(value === date) });
        choice.disabled = Boolean((min && value < min) || (max && value > max));
        choice.addEventListener('click', () => {
          date = value;
          days.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
          choice.setAttribute('aria-pressed', 'true');
          onPick(value);
        });
        days.append(choice);
      }
    }
    function move(offset) {
      const target = new Date(Date.UTC(year, month - 1 + offset, 1));
      year = target.getUTCFullYear();
      month = target.getUTCMonth() + 1;
      render();
    }
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    render();
  }

  function clockChoices(label, count, step, selected, onPick) {
    const group = make('div', '', { class: 'picker-clock-group' });
    const options = make('div', '', { class: 'picker-clock-options', role: 'group', 'aria-label': label });
    group.append(make('strong', label), options);
    // The steps, plus a value already saved off them (23:59 from before the pickers), so keeping it needs no change.
    const values = Array.from({ length: count }, (_, index) => two(index * step));
    if (selected && !values.includes(selected)) values.push(selected);
    for (const value of values.sort()) {
      const choice = button(value, { 'aria-label': value + label, 'aria-pressed': String(value === selected) });
      choice.addEventListener('click', () => {
        options.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
        choice.setAttribute('aria-pressed', 'true');
        onPick(value);
      });
      options.append(choice);
    }
    return group;
  }

  function positionPopup(popup, trigger, wrapper) {
    const field = trigger.getBoundingClientRect();
    const viewport = document.documentElement;
    const height = viewport.clientHeight;
    const below = height - field.bottom - 8;
    const above = field.top - 8;
    popup.style.width = field.width + 'px';
    popup.style.maxHeight = '';
    const naturalHeight = popup.offsetHeight;
    const flip = below < naturalHeight && above > below;
    wrapper.dataset.side = flip ? 'above' : 'below';
    popup.style.maxHeight = Math.max(0, Math.min(naturalHeight, flip ? above : below)) + 'px';
    popup.style.left = field.left + 'px';
    popup.style.top = (flip ? field.top - popup.offsetHeight : field.bottom) + 'px';
  }

  function scheduleValue(value, type) {
    if (!value) return '선택하세요';
    const [day, clock] = value.split('T');
    const [year, month, date] = type === 'time' ? [] : day.split('-');
    const dateText = year ? `${year}년 ${Number(month)}월 ${Number(date)}일` : '';
    const time = type === 'time' ? day : clock;
    if (!time) return dateText;
    const [hour, minute] = time.split(':');
    const timeText = `${Number(hour) < 12 ? '오전' : '오후'} ${Number(hour) % 12 || 12}시 ${minute}분`;
    return dateText ? `${dateText} · ${timeText}` : timeText;
  }

  // Keys inside an open picker (a select's): ↑↓ through the list or the hours and minutes, ←→↑↓ by day and week in the
  // calendar, Home and End, and a first letter or digit for the next option starting with it. Disabled ones are passed.
  function moveWithin(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const current = document.activeElement;
    if (!(current instanceof HTMLButtonElement)) return;
    const days = current.closest('.picker-days');
    const group = days || current.closest('.picker-clock-options') || (current.classList.contains('picker-option') ? current.parentElement : null);
    if (!group) return;
    const items = [...group.querySelectorAll(days ? 'button' : current.classList.contains('picker-option') ? '.picker-option' : 'button')];
    const index = items.indexOf(current);
    const step = { ArrowDown: days ? 7 : 1, ArrowUp: days ? -7 : -1, ArrowRight: days ? 1 : 0, ArrowLeft: days ? -1 : 0 }[event.key];
    let next;
    if (step) {
      for (let at = index + step; at >= 0 && at < items.length; at += step) if (!items[at].disabled) { next = items[at]; break; }
    } else if (event.key === 'Home' || event.key === 'End') {
      next = (event.key === 'Home' ? items : [...items].reverse()).find(item => !item.disabled);
    } else if (!days && event.key.length === 1 && event.key.trim()) {
      const key = event.key.toLocaleLowerCase('ko-KR');
      next = [...items.slice(index + 1), ...items.slice(0, index + 1)]
        .find(item => !item.disabled && item.textContent.trim().toLocaleLowerCase('ko-KR').startsWith(key));
    }
    if (!next || next === current) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  // A form clears a cross-field message (종료 시간, 투표 마감) when another field changes; the picker showing it follows on
  // the next turn, after the page's own change handlers ran.
  function settle() {
    setTimeout(() => {
      for (const trigger of document.querySelectorAll('.picker-trigger[aria-invalid=true]')) {
        const wrapper = trigger.closest('.form-picker');
        if (!wrapper?.previousElementSibling?.validity?.valid) continue;
        trigger.removeAttribute('aria-invalid');
        const problem = wrapper.querySelector('.picker-problem');
        if (problem) problem.textContent = '';
      }
    });
  }
  document.addEventListener('input', settle);
  document.addEventListener('change', settle);

  function enhance(field) {
    if (field.nextElementSibling?.classList.contains('form-picker')) return;
    const select = field instanceof HTMLSelectElement;
    const date = field.type !== 'time';
    const time = field.type !== 'date';
    const name = field.getAttribute('aria-label') || field.labels?.[0]?.querySelector('span')?.textContent || '값 선택';
    const trigger = button('', { class: 'picker-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    const schedule = field.form?.dataset.form === 'event';
    const display = schedule ? make('strong', '', { class: 'picker-value' }) : trigger;
    if (schedule) trigger.append(make('span', name, { class: 'picker-caption' }), display);
    const popup = make('div', '', { class: 'picker-popup', popover: 'auto', role: 'dialog', 'aria-label': name });
    const wrapper = make('span', '', { class: 'form-picker' });
    const problem = make('span', '', { class: 'picker-problem', role: 'status' });
    wrapper.append(trigger, problem, popup);
    field.after(wrapper);
    field.classList.add('picker-native');
    field.tabIndex = -1;
    field.setAttribute('aria-hidden', 'true');

    function refresh() {
      const value = (select ? field.selectedOptions[0]?.label : schedule ? scheduleValue(field.value, field.type) : field.value.replace('T', ' ')) || '선택하세요';
      display.textContent = value;
      trigger.setAttribute('aria-label', name + ' ' + value);
      trigger.disabled = field.matches(':disabled') || field.readOnly;
    }
    function commit(value) {
      field.value = value;
      popup.hidePopover();
      trigger.removeAttribute('aria-invalid');
      problem.textContent = '';
      refresh();
      trigger.focus({ preventScroll: true });
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    field.addEventListener('focus', () => trigger.focus());
    field.addEventListener('change', refresh);
    field.addEventListener('invalid', event => {
      event.preventDefault();
      trigger.setAttribute('aria-invalid', 'true');
      problem.textContent = field.validationMessage;
      trigger.focus();
    });
    const position = () => positionPopup(popup, trigger, wrapper);
    repositioners.set(popup, position);
    popup.addEventListener('beforetoggle', event => {
      trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
    });
    popup.addEventListener('focusout', event => {
      if (event.relatedTarget instanceof Node && !popup.contains(event.relatedTarget) && popup.matches(':popover-open')) popup.hidePopover();
    });
    popup.addEventListener('keydown', moveWithin);
    // Pressing the button of an open picker: the press closes it as a click outside would, so the click that follows must
    // not open it again.
    let openAtPress = false;
    trigger.addEventListener('pointerdown', () => { openAtPress = popup.matches(':popover-open'); });
    trigger.addEventListener('click', () => {
      const wasOpen = openAtPress || popup.matches(':popover-open');
      openAtPress = false;
      if (wasOpen) {
        if (popup.matches(':popover-open')) popup.hidePopover();
        return;
      }
      const close = button('×', { class: 'icon-button picker-close', 'aria-label': '닫기' });
      close.addEventListener('click', () => { popup.hidePopover(); trigger.focus(); });
      const header = make('div', '', { class: 'picker-heading' });
      header.append(make('strong', name), close);
      popup.replaceChildren(header);
      if (select) {
        for (const option of field.options) {
          const choice = button(option.label, { class: 'picker-option', 'aria-pressed': String(option.selected) });
          choice.disabled = option.disabled || Boolean(option.closest('optgroup')?.disabled);
          if (option.hidden) continue;
          choice.addEventListener('click', () => commit(option.value));
          popup.append(choice);
        }
      } else {
        let [day, clock] = field.value.split('T');
        if (!date) { clock = day; day = ''; }
        const minDay = [field.min.slice(0, 10), voteStart(field).slice(0, 10)].sort().at(-1);
        let refreshClock;
        if (date) calendar(popup, day, value => {
          day = value;
          refreshClock?.();
          if (!time) commit(day);
        }, minDay, field.max.slice(0, 10));
        if (time) {
          let [hour = '', minute = ''] = (clock || '').split(':');
          const apply = button('선택 적용', { class: 'btn btn-secondary' });
          const error = make('p', '', { role: 'status' });
          const row = make('div', '', { class: 'picker-clock' });
          const hours = clockChoices('시', 24, 1, hour, value => { hour = value; refreshClock(); });
          const minutes = clockChoices('분', 6, 10, minute, value => { minute = value; });
          refreshClock = () => {
            const start = voteStart(field);
            const dateValue = date ? day : field.form?.elements.namedItem('deadline')?.value;
            for (const choice of hours.querySelectorAll('button')) {
              choice.disabled = Boolean(start && dateValue && `${dateValue}T${choice.textContent}:50` <= start);
            }
            for (const choice of minutes.querySelectorAll('button')) {
              choice.disabled = Boolean(start && dateValue && hour && `${dateValue}T${hour}:${choice.textContent}` <= start);
            }
          };
          row.append(hours, minutes);
          refreshClock();
          popup.append(row, apply, error);
          apply.addEventListener('click', () => {
            if ((date && !day) || !hour || !minute) {
              error.textContent = date ? '날짜와 시간을 골라 주세요.' : '시와 분을 골라 주세요.';
              return;
            }
            const value = (date ? day + 'T' : '') + hour + ':' + minute;
            const start = voteStart(field);
            const deadline = date ? value : `${field.form?.elements.namedItem('deadline')?.value ?? ''}T${value}`;
            if (start && deadline <= start) {
              error.textContent = '투표 마감은 투표를 여는 시각보다 늦어야 해요.';
              return;
            }
            const check = field.cloneNode();
            check.value = value;
            if (!check.checkValidity()) { error.textContent = '선택할 수 있는 시각을 확인해 주세요.'; return; }
            commit(value);
          });
        }
      }
      popup.showPopover({ source: trigger });
      position();
      for (const options of popup.querySelectorAll('.picker-clock-options')) {
        const current = options.querySelector('[aria-pressed=true]');
        if (current) options.scrollTop = current.offsetTop - (options.clientHeight - current.offsetHeight) / 2;
      }
      // The chosen value, else the first one that can be chosen (not ×), so ↑↓ and a first letter work at once.
      (popup.querySelector('[aria-pressed=true]:enabled') || popup.querySelector('.picker-option:enabled, .picker-days button:enabled, .picker-clock-options button:enabled')
        || popup.querySelector('button')).focus({ preventScroll: true });
    });
    refresh();
    if (document.activeElement === field) trigger.focus();
  }

  function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.matches(selector)) enhance(root);
    root.querySelectorAll(selector).forEach(enhance);
  }
  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(scan);
  }).observe(document.body, { childList: true, subtree: true });
})();
