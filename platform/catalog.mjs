import { PLATFORM_NAME } from './clubs.mjs';
import { shuttlecockPath } from './shuttlecock.mjs';

const restingShuttlecock = shuttlecockPath();

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

// Every sentence on this page is a fact from PRODUCT.md, OPERATIONS.md or the screens themselves.
const description = '카톡 단체방·엑셀·수기 집계로 하던 배드민턴 모임 운영을 일정 공지부터 참석 투표, 당일 출석, 마무리, 반기 집계까지 한 흐름으로 이어요.';

const flow = [
  ['일정 공지', '지난 회차를 복제해 일시·장소·투표 마감을 정하고, 카톡 링크를 단체방에 올려요.'],
  ['참석 투표', '회원이 링크로 들어와 선발·후발과 점심 여부를 골라요. 응답은 운영 화면에 바로 모여요.'],
  ['당일 출석', '체육관에서 실제 출석과 게스트 도착을 체크해요.'],
  ['마무리', '콕 이월·잔여와 코트 찬조금을 적고, 마무리 글을 복사해 단체방에 붙여요.'],
  ['반기 집계', '구간별 줄서기 인정 횟수와 콕 수령을 확인해요.'],
];

// Each role shows its screen as the 가상 체험 draws it at phone width (375×582, assets/intro-*.webp, DESIGN.md 소개 홈),
// cut below the club name so the intro names no club (PLATFORM.md).
const roles = [
  ['회원', '링크 하나로 응답해요', [
    '단체방에 올라온 투표·공지 링크를 열어요.',
    '성함과 번호 6자리로 로그인해요. 처음에는 생년월일 뒤 6자리, 원하면 직접 정한 PIN으로 바꿀 수 있어요.',
    '선발·후발과 점심 여부를 고르고 저장해요. 마감 전까지 바꾸거나 취소할 수 있어요.',
    '모임 홈에서 몇 명이 오는지와 이번 반기 내 출석 인정 날짜를 봐요.',
  ], ['assets/intro-member.webp', '회원 화면 예시. 다음 운동 카드에 장소와 투표 마감, 선발 10명·후발 6명·점심 5명 응답 막대, 투표하기 버튼이 있어요.']],
  ['운영진', '홈 화면에서 한 주를 정리해요', [
    '운영 주소를 휴대전화 홈 화면에 추가해 앱처럼 열어요.',
    '같은 로그인 화면에서 운영진 성함과 운영 번호 6자리로 들어가요. 로그인은 최대 30일 유지돼요.',
    '투표 응답, 출석과 게스트, 공지, 회원, 반기 집계를 한곳에서 관리해요.',
  ], ['assets/intro-admin.webp', '운영 화면 예시. 운영 홈에 다음 모임과 회차 진행 단계(지금 참석 투표), 응답률 83% 막대가 있어요.']],
];

const promises = [
  '생년월일과 PIN은 원문 대신 확인용 값만 저장해요.',
  '카톡 미리보기에는 모임 이름과 공유 종류만 보이고, 내용은 로그인한 회원에게만 보여요.',
  '계좌 번호와 의료 증빙 원본은 받지도 저장하지도 않아요.',
  '모임마다 데이터와 운영진 로그인이 따로 있어요.',
];

const check = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';

const start = [
  '총괄 관리자가 모임마다 주소와 운영진 계정을 만들어 드려요.',
  '운영진은 받은 운영 주소를 휴대전화 홈 화면에 추가해 써요.',
  '회원은 운영진이 단체방에 올린 모임 링크로 들어와요.',
];

// The public 가상 체험 on GitHub Pages (README.md). The live home links to its intro, whose links open the demo
// screens, so no club's name or address shows here (PLATFORM.md). Change it with the Pages address.
const publicDemoHome = 'https://koungsday.github.io/cockn-cock/';

// The intro home lists no clubs (PLATFORM.md): members and organisers arrive by their club's own link.
// demo: { member, admin, share } same-site paths for the 가상 체험 links; only the demo build passes it. The live home
// has one secondary link to the public 가상 체험 and keeps 들어가기 its one primary button.
export function renderCatalog({ basePath, mode, demo = null }) {
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (!base.startsWith('/') || base.startsWith('//') || /[\\?#]/.test(base)) {
    throw new Error('Catalog basePath must be a same-site path.');
  }

  const isDemo = mode === 'demo';
  const root = escape(base);
  const brand = escape(PLATFORM_NAME);
  const recent = `<p id="recent-club" class="recent-club" data-base="${root}" hidden><span>최근 들어간 모임</span><a class="try-link try-link-primary" href="${root}"></a></p>`;
  // 로그인 (PLATFORM.md): there is no club list, so the live home asks for the club's address and opens its own login.
  const entry = isDemo ? recent : `
    <section id="login" class="intro-section" aria-labelledby="login-title">
      <h2 id="login-title">로그인</h2>
      <div class="intro-panel entry-panel">
        ${recent}
        <form class="club-entry" action="${root}go" method="get">
          <label for="club-address">모임 주소</label>
          <div class="club-entry-row">
            <input id="club-address" name="club" type="text" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="64" placeholder="영문 주소" required>
            <button class="try-link try-link-primary" type="submit">들어가기</button>
          </div>
          <p class="intro-note">카톡으로 받은 모임 링크에서 /clubs/ 뒤의 영문이에요. 회원과 운영진 모두 여기서 들어가요.</p>
        </form>
        <p class="intro-note console-entry"><a href="${root}console/">총괄 관리자 로그인</a></p>
      </div>
    </section>`;
  const links = isDemo
    ? demo ? [[demo.member, '회원 화면 체험', ' try-link-primary'], [demo.admin, '운영 화면 체험'], [demo.share, '카톡 투표 링크 예시']] : []
    : [[publicDemoHome, '가상 체험 열기']];
  const tryLinks = links.length ? `
    <section id="try" class="intro-section" aria-labelledby="try-title">
      <h2 id="try-title">가상 데이터로 먼저 둘러보세요</h2>
      <div class="intro-panel try-panel">
        <div class="try-links">
          ${links.map(([href, label, css = '']) => `<a class="try-link${css}" href="${escape(href)}">${label}</a>`).join('\n          ')}
        </div>
        <p class="intro-note">가상 데이터예요. 바꾼 내용은 이 브라우저에만 저장돼요.</p>
      </div>
    </section>` : '';

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f2ec">
  <meta name="description" content="${escape(description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="${brand}">
  <meta property="og:title" content="${brand} · 배드민턴 모임 관리">
  <meta property="og:description" content="${escape(description)}">
  <title>${brand} · 배드민턴 모임 관리</title>
  <link rel="icon" type="image/png" sizes="96x96" href="${root}assets/shuttlecock-icon-96.png">
  <link rel="stylesheet" href="${root}platform.css">
  <script type="module" src="${root}shuttlecock.js"></script>
  <script src="${root}recent-club.js" defer></script>
  ${isDemo ? `<script src="${root}legacy-links.js" defer></script>` : ''}
</head>
<body>
  <a class="skip-link" href="#content">본문 바로가기</a>
  <header class="site-header">
    <div class="page-width header-inner">
      <a class="site-brand" href="${root}"><img class="brand-mark" width="35" height="35" src="${root}assets/shuttlecock-icon-96.png" alt="">${brand}</a>
      ${isDemo ? '<span class="demo-label">가상 데이터 체험</span>' : '<a class="header-link" href="#login">로그인</a>'}
    </div>
  </header>
  <main id="content" class="page-width">
    <section class="hero" aria-labelledby="site-title">
      <div class="hero-copy">
        <p class="hero-label">배드민턴 모임 관리</p>
        <h1 id="site-title">${brand}</h1>
        <p>카톡 단체방과 엑셀, 손으로 하던 집계를 링크 하나로 이어요.</p>
      </div>
    </section>
    ${entry}
    <section id="flow" class="intro-section" aria-labelledby="flow-title">
      <h2 id="flow-title">한 회차가 이렇게 이어져요</h2>
      <p class="intro-lead">단체방 공지부터 반기 집계까지 같은 화면에서 이어서 기록해요.</p>
      <ol class="flow-steps">
        ${flow.map(([title, text], index) => `<li><span class="flow-no" aria-hidden="true">${index + 1}</span><div><h3>${title}</h3><p>${text}</p></div></li>`).join('')}
      </ol>
    </section>
    <section id="roles" class="intro-section" aria-labelledby="roles-title">
      <h2 id="roles-title">회원은 링크로, 운영진은 홈 화면에서</h2>
      <div class="role-grid">
        ${roles.map(([who, lead, steps, [shot, alt]]) => `<div class="role-col">
          <img class="role-shot" src="${root}${shot}" width="375" height="582" alt="${escape(alt)}" loading="lazy" decoding="async">
          <article class="intro-panel role-panel">
            <p class="role-who">${who}</p>
            <h3>${lead}</h3>
            <ol class="role-steps">${steps.map(step => `<li>${step}</li>`).join('')}</ol>
          </article>
        </div>`).join('')}
      </div>
    </section>
    <section id="start" class="intro-section" aria-labelledby="start-title">
      <h2 id="start-title">모임마다 주소를 발급해요</h2>
      <ol class="intro-panel role-steps start-steps">${start.map(step => `<li>${step}</li>`).join('')}</ol>
    </section>
    <section id="privacy" class="intro-section" aria-labelledby="privacy-title">
      <h2 id="privacy-title">개인정보는 남기지 않아요</h2>
      <ul class="intro-panel promise-list">
        ${promises.map(promise => `<li>${check}<span>${promise}</span></li>`).join('')}
      </ul>
    </section>
    ${tryLinks}
  </main>
  <footer class="site-footer">
    <label class="shuttlecock">
      <input class="shuttlecock-toggle" type="checkbox" aria-label="셔틀콕 계속 회전" disabled>
      <svg class="shuttlecock-scene" viewBox="0 0 120 112" aria-hidden="true">
        <defs>
          <filter id="shuttlecock-gap-rounding" x="0" y="0" width="120" height="112" filterUnits="userSpaceOnUse">
            <feGaussianBlur in="SourceAlpha" stdDeviation=".75"/>
            <feComponentTransfer result="rounded-gaps">
              <feFuncA type="linear" slope="12" intercept="-6.18"/>
            </feComponentTransfer>
            <feFlood flood-color="currentColor"/>
            <feComposite in2="rounded-gaps" operator="in" result="fillets"/>
            <feMerge><feMergeNode in="fillets"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path fill="currentColor" filter="url(#shuttlecock-gap-rounding)" d="${restingShuttlecock}"/>
      </svg>
    </label>
  </footer>
</body>
</html>`;
}
