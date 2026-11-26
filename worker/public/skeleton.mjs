// Loading skeletons (DESIGN.md 6): the still shape of the screen that is coming, with one moving shuttlecock in the
// middle of the screen. prepare.mjs puts these into the HTML shells; app.mjs redraws them for the route it is loading.
// No imports, so prepare.mjs can run this module in Node.

const bar = css => `<span class="sk ${css}"></span>`;
const bars = (count, css) => Array.from({ length: count }, () => bar(css)).join('');
const panel = body => `<section class="panel sk-panel">${body}</section>`;
const rows = count => `<div class="sk-rows">${Array.from({ length: count },
  () => `<div class="sk-row">${bar('sk-dot')}${bar('sk-line')}${bar('sk-chip')}</div>`).join('')}</div>`;
const head = `<div class="page-head sk-head"><div>${bar('sk-h1')}${bar('sk-text')}</div>${bar('sk-button')}</div>`;

const adminBodies = {
  home: `<div class="dashboard">
    <div class="dashboard-heading sk-head"><div>${bar('sk-h1')}${bar('sk-text')}</div>${bar('sk-button')}</div>
    <div class="dashboard-grid"><div class="sk-featured"></div>${panel(bar('sk-h2') + bar('sk-number') + bar('sk-meter') + bars(2, 'sk-line'))}</div>
    <div class="dashboard-grid dashboard-bottom">${panel(bar('sk-h2') + rows(2))}${panel(bar('sk-h2') + bars(3, 'sk-line'))}</div>
  </div>`,
  event: `<div class="secondary-page">${head}
    ${panel(bar('sk-field') + bar('sk-h2') + bar('sk-text'))}
    <div class="sk-tabs">${bars(3, 'sk-tab')}</div>
    ${panel(bar('sk-h2') + rows(5))}</div>`,
  list: `<div class="secondary-page">${head}${panel(bar('sk-h2') + rows(6))}</div>`,
};

// section: home, event, or any list section (notices, members, progress).
export function adminSkeleton(section = 'home') {
  const body = adminBodies[section] ?? adminBodies.list;
  return `<div class="admin-app admin-skeleton" aria-hidden="true">
    <aside class="sidebar"><div class="brand"><img class="brand-mark" width="43" height="43" src="/assets/shuttlecock-icon-96.png" alt="">${bar('sk-brand')}</div>
      <div class="sk-nav">${bars(5, 'sk-nav-item')}</div></aside>
    <div class="main-shell">
      <div class="topbar">${bar('sk-crumb')}${bar('sk-icon')}</div>
      <div class="main-content admin-content">${body}</div>
      <div class="tab-bar">${Array.from({ length: 4 }, () => `<span class="tab-bar-link">${bar('sk-icon')}</span>`).join('')}</div>
    </div>
  </div>`;
}

// The one moving thing while a screen loads: the shuttlecock in the middle of the viewport, with its sentence.
export function loadingCenter(shuttle, text = '모임을 불러오는 중이에요.') {
  return `<main id="main-content" class="loading-center" tabindex="-1"><div class="shuttle-loader" role="status">${shuttle}<span>${text}</span></div></main>`;
}
