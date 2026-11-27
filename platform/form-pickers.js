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

  function calendar(panel, date, onPick, min, max) {
    let [year, month] = (date || today()).split('-').map(Number);
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
    for (let index = 0; index < count; index++) {
      const value = two(index * step);
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

  function enhance(field) {
    if (field.nextElementSibling?.classList.contains('form-picker')) return;
    const select = field instanceof HTMLSelectElement;
    const date = field.type !== 'time';
    const time = field.type !== 'date';
    const name = field.getAttribute('aria-label') || field.labels?.[0]?.querySelector('span')?.textContent || '값 선택';
    const trigger = button('', { class: 'picker-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    const popup = make('div', '', { class: 'picker-popup', popover: 'auto', role: 'dialog', 'aria-label': name });
    const wrapper = make('span', '', { class: 'form-picker' });
    const problem = make('span', '', { class: 'picker-problem', role: 'status' });
    wrapper.append(trigger, problem, popup);
    field.after(wrapper);
    field.classList.add('picker-native');
    field.tabIndex = -1;
    field.setAttribute('aria-hidden', 'true');

    function refresh() {
      const value = (select ? field.selectedOptions[0]?.label : field.value.replace('T', ' ')) || '선택하세요';
      trigger.textContent = value;
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
    trigger.addEventListener('click', () => {
      if (popup.matches(':popover-open')) {
        popup.hidePopover();
        return;
      }
      const close = button('닫기', { class: 'btn btn-text' });
      close.addEventListener('click', () => { popup.hidePopover(); trigger.focus(); });
      const header = make('div', '', { class: 'picker-month' });
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
        if (date) calendar(popup, day, value => {
          day = value;
          if (!time) commit(day);
        }, field.min.slice(0, 10), field.max.slice(0, 10));
        if (time) {
          let [hour = '', minute = ''] = (clock || '').split(':');
          if (minute && Number(minute) % 10 !== 0) minute = '';
          const apply = button('선택 적용', { class: 'btn btn-secondary' });
          const error = make('p', '', { role: 'status' });
          const row = make('div', '', { class: 'picker-clock' });
          row.append(clockChoices('시', 24, 1, hour, value => { hour = value; }),
            clockChoices('분', 6, 10, minute, value => { minute = value; }));
          popup.append(row, apply, error);
          apply.addEventListener('click', () => {
            if ((date && !day) || !hour || !minute) {
              error.textContent = date ? '날짜와 시간을 골라 주세요.' : '시와 분을 골라 주세요.';
              return;
            }
            const value = (date ? day + 'T' : '') + hour + ':' + minute;
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
        if (current) options.scrollTop += current.getBoundingClientRect().top - options.getBoundingClientRect().top;
      }
      (popup.querySelector('[aria-pressed=true]:enabled') || popup.querySelector('button')).focus({ preventScroll: true });
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
