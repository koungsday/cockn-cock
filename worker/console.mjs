// 총괄 콘솔 (PLATFORM.md): the one platform operator signs in at /console/ and sees each club as numbers only.
// The server draws every page with the live stylesheet; there is no script, and the forms post back here.
import { ApiError, currentSeconds, equalDigest, isAdminId, randomHex, releaseAttempt, reserveAttempt, sql } from './auth.mjs';

const encoder = new TextEncoder();
const sessionAge = 12 * 60 * 60;
// The same PBKDF2 budget as member PINs (Workers Free CPU limit); this password has 12 characters or more.
const iterations = 24000;
// Colons rather than '$' keep the value as written in worker/.dev.vars.
const secretPattern = /^pbkdf2-sha256:(\d{4,6}):([0-9a-f]{32}):([0-9a-f]{64})$/;
const bodyLimit = 4096;
const invalidLogin = '아이디나 비밀번호를 확인해 주세요.';

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

async function derive(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: rounds }, key, 256
  ));
}

// PLATFORM_ADMIN_PASSWORD_HASH. scripts/console-password.mjs makes it; the password itself is stored nowhere.
export async function consoleSecret(password, salt = randomHex(16)) {
  return `pbkdf2-sha256:${iterations}:${salt}:${await derive(password, salt, iterations)}`;
}

function settings(env) {
  const parsed = typeof env.PLATFORM_ADMIN_PASSWORD_HASH === 'string' ? secretPattern.exec(env.PLATFORM_ADMIN_PASSWORD_HASH) : null;
  if (!isAdminId(env.PLATFORM_ADMIN_ID) || !parsed || !env.DB) return null;
  return {
    id: env.PLATFORM_ADMIN_ID, secret: env.PLATFORM_ADMIN_PASSWORD_HASH,
    rounds: Number(parsed[1]), salt: parsed[2], hash: parsed[3]
  };
}

const cookieName = url => url.protocol === 'https:' ? '__Host-console' : 'console-dev';

function sessionCookie(url, token = '') {
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? sessionAge : 0}${
    url.protocol === 'https:' ? '; Secure' : ''}`;
}

function cookieToken(request, url) {
  const prefix = cookieName(url) + '=';
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix) && /^[0-9a-f]{64}$/.test(value.slice(prefix.length))) return value.slice(prefix.length);
  }
  return null;
}

const tokenHash = token => sha256('console-session\0' + token);
const credentialVersion = config => sha256('console-version\0' + config.id + '\0' + config.secret);

async function signedIn(request, env, url, config) {
  const token = cookieToken(request, url);
  if (!token) return false;
  const row = await sql(env.DB, 'SELECT credential_version FROM console_sessions WHERE token_hash = ? AND expires_at > ?',
    await tokenHash(token), currentSeconds()).first();
  return Boolean(row) && equalDigest(row.credential_version, await credentialVersion(config));
}

async function readForm(request, url) {
  if (request.headers.get('origin') !== url.origin) throw new ApiError(403, '이 화면에서 다시 시도해 주세요.');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    throw new ApiError(415, '요청 형식을 확인해 주세요.');
  }
  if (Number(request.headers.get('content-length')) > bodyLimit) throw new ApiError(413, '요청이 너무 커요.');
  let text = '';
  if (request.body) {
    const reader = request.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
      if (text.length > bodyLimit) {
        await reader.cancel();
        throw new ApiError(413, '요청이 너무 커요.');
      }
    }
  }
  return new URLSearchParams(text);
}

async function login(request, env, url, config) {
  const form = await readForm(request, url);
  const id = (form.get('id') ?? '').trim().slice(0, 64);
  const password = (form.get('password') ?? '').slice(0, 256);
  // One source may try 10 times and everyone together 20 times in 15 minutes, as with the club administrator PIN.
  const source = request.headers.get('CF-Connecting-IP') || 'local';
  const limits = [];
  for (const [kind, limit, value] of [['source', 10, source], ['all', 20, '']]) {
    const key = await sha256(`console-login-${kind}\0${config.secret}\0${value}`);
    limits.push({ key, expiresAt: await reserveAttempt(env, key, limit) });
  }
  const matches = equalDigest(await derive(password, config.salt, config.rounds), config.hash) && id === config.id;
  if (!matches) return { status: 401, id, error: invalidLogin };

  const token = randomHex(32);
  const now = currentSeconds();
  const previous = cookieToken(request, url);
  await env.DB.batch([
    sql(env.DB, 'INSERT INTO console_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)',
      await tokenHash(token), await credentialVersion(config), now + sessionAge),
    sql(env.DB, 'DELETE FROM console_sessions WHERE expires_at <= ?', now),
    ...(previous ? [sql(env.DB, 'DELETE FROM console_sessions WHERE token_hash = ?', await tokenHash(previous))] : []),
    ...limits.flatMap(({ key, expiresAt }) => releaseAttempt(env, key, expiresAt))
  ]);
  return { status: 303, location: new URL('/console/', url.origin).href, cookie: sessionCookie(url, token) };
}

async function logout(request, env, url) {
  await readForm(request, url);
  const token = cookieToken(request, url);
  if (token) await sql(env.DB, 'DELETE FROM console_sessions WHERE token_hash = ?', await tokenHash(token)).run();
  return { status: 303, location: new URL('/console/', url.origin).href, cookie: sessionCookie(url) };
}

async function clubNumbers(env, clubs) {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const results = await env.DB.batch(clubs.map(club => sql(env.DB, `
    SELECT EXISTS (SELECT 1 FROM clubs WHERE id = ?) AS registered,
      (SELECT COUNT(*) FROM members WHERE club_id = ? AND active = 1) AS members,
      (SELECT MAX(date) FROM events WHERE club_id = ? AND date <= ?) AS last_date,
      (SELECT MIN(date) FROM events WHERE club_id = ? AND date > ?) AS next_date
  `, club.slug, club.slug, club.slug, today, club.slug, today)));
  return { today, clubs: clubs.map((club, index) => ({ ...club, ...results[index].results[0] })) };
}

function shortDate(value, today) {
  if (!value) return '없음';
  const [year, month, day] = value.split('-').map(Number);
  return `${year === Number(today.slice(0, 4)) ? '' : year + '년 '}${month}월 ${day}일`;
}

function clubPanel(club, today) {
  const registered = Boolean(club.registered);
  const problem = !registered ? 'D1 clubs 표에 이 모임이 없어서 저장할 수 없어요.'
    : !club.ready ? '운영진 계정이나 인증 비밀값이 비어 있거나 다른 모임과 겹쳐요.' : '';
  const heading = 'club-' + escape(club.slug);
  const items = [
    ['활동 회원', `${Number(club.members)}명`],
    ['운영진 계정', `${club.ready ? 1 : 0}개`],
    ['최근 회차', shortDate(club.last_date, today)],
    ['다음 회차', shortDate(club.next_date, today)]
  ];
  return `<section class="panel" aria-labelledby="${heading}">
      <div class="panel-head"><div><h2 id="${heading}">${escape(club.name)}</h2>
        <p><a href="/clubs/${escape(club.slug)}/">/clubs/${escape(club.slug)}/</a></p></div>
        <span class="pill ${problem ? 'pill-warm' : 'pill-green'}">${problem ? '설정 확인 필요' : '운영 중'}</span></div>
      <div class="panel-body">${problem ? `<p class="form-note">${problem}</p>` : ''}
        <dl class="summary-grid">${items.map(([label, value]) =>
          `<div class="summary-item"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      </div>
    </section>`;
}

function clubList({ today, clubs }) {
  return `<main id="main-content" class="console-page" tabindex="-1">
    <div class="page-head"><div><h1>모임</h1><p>모임마다 숫자만 보여요. 회원 명단과 응답은 열지 않아요.</p></div></div>
    ${clubs.map(club => clubPanel(club, today)).join('\n    ')}
  </main>`;
}

function loginForm(id = '', error = '') {
  const invalid = error ? ' aria-invalid="true" aria-describedby="console-error"' : '';
  return `<main id="main-content" class="login-page" tabindex="-1"><div class="login-stack">
    <div class="hero"><p class="tagline">console</p><h1>콕콕콕! 총괄</h1><div class="hero-meta"><span>모임 발급과 운영 현황</span></div></div>
    <form class="form login-form login-card console-login" method="post" action="/console/login" aria-label="총괄 로그인">
      <div class="login-field"><div class="login-label-row"><label for="console-id">아이디</label></div>
        <input id="console-id" name="id" type="text" value="${escape(id)}" autocomplete="username" autocapitalize="off"
          spellcheck="false" maxlength="64" required${id ? '' : ' autofocus'}></div>
      <div class="login-field"><div class="login-label-row"><label for="console-password">비밀번호</label></div>
        <input id="console-password" name="password" type="password" autocomplete="current-password" maxlength="256"
          required${id ? ' autofocus' : ''}${invalid}>
        ${error ? `<p id="console-error" class="inline-error" role="alert">${escape(error)}</p>` : ''}</div>
      <button type="submit" class="btn btn-primary login-submit">로그인</button>
    </form>
  </div></main>`;
}

function notice(title, body) {
  return `<main id="main-content" class="public-share-page" tabindex="-1"><div class="public-share-card"><h1>${escape(title)}</h1>
    <p class="public-share-body">${escape(body)}</p></div></main>`;
}

function page(style, main, signedInNow = false) {
  const account = signedInNow ? `<form method="post" action="/console/logout"><button type="submit" class="btn btn-text btn-small">로그아웃</button></form>` : '';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f3f2ec">
  <meta name="robots" content="noindex, nofollow">
  <title>총괄 · 콕콕콕!</title>
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/shuttlecock-icon-96.png">
  <link rel="stylesheet" href="${escape(style)}">
</head>
<body>
  <a class="skip-link" href="#main-content">본문 바로가기</a>
  <header class="site-header">
    <div class="header-inner">
      <nav class="club-navigation" aria-label="서비스">
        <a href="/" class="brand" aria-label="콕콕콕! 소개 홈">
          <img class="brand-mark" src="/assets/shuttlecock-icon-96.png" width="42" height="42" alt="">
        </a>
        <a class="current-club" href="/console/"><strong>총괄</strong><small>콕콕콕!</small></a>
      </nav>
      <div id="account">${account}</div>
    </div>
  </header>
  <div id="main" class="main">${main}</div>
</body>
</html>`;
}

// The versioned live stylesheet of this release, as the club shells reference it.
async function stylesheet(env, url) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/admin-shell.html', url.origin)));
  if (!shell.ok) return null;
  return (await shell.text()).match(/href="(\/club-ui\/[a-f0-9]{20}\/live\.css)"/)?.[1] ?? null;
}

// Returns { status, html, allow? } or a redirect { status, location, cookie? }; worker/index.mjs adds the headers.
export async function consolePage(request, env, url, clubs) {
  if (url.pathname === '/console') return { status: 308, location: new URL('/console/', url.origin).href };
  const route = { '/console/': 'home', '/console/login': 'login', '/console/logout': 'logout' }[url.pathname];
  const style = await stylesheet(env, url);
  if (!style) {
    return { status: 503, html: '<!doctype html><html lang="ko"><meta charset="utf-8"><title>총괄 · 콕콕콕!</title><p>화면을 불러올 수 없어요.</p></html>' };
  }
  if (!route) return { status: 404, html: page(style, notice('페이지를 찾을 수 없어요', '주소를 확인해 주세요.')) };
  const reading = request.method === 'GET' || request.method === 'HEAD';
  if (route === 'home' ? !reading : request.method !== 'POST') {
    return { status: 405, allow: route === 'home' ? 'GET, HEAD' : 'POST', html: page(style, notice('지원하지 않는 요청이에요', '총괄 화면에서 다시 시도해 주세요.')) };
  }
  const config = settings(env);
  if (!config) return { status: 503, html: page(style, notice('총괄 로그인을 준비 중이에요', '설정이 끝나면 이 주소에서 로그인할 수 있어요.')) };
  try {
    if (route === 'home') {
      return await signedIn(request, env, url, config)
        ? { status: 200, html: page(style, clubList(await clubNumbers(env, clubs)), true) }
        : { status: 200, html: page(style, loginForm()) };
    }
    if (route === 'logout') return await logout(request, env, url);
    const result = await login(request, env, url, config);
    return result.location ? result : { status: result.status, html: page(style, loginForm(result.id, result.error)) };
  } catch (error) {
    // Never print request bodies or credentials; ApiError messages are written for the operator.
    const known = error instanceof ApiError;
    return {
      status: known ? error.status : 500,
      html: page(style, route === 'login' ? loginForm('', known ? error.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.')
        : notice('처리하지 못했어요', known ? error.message : '잠시 뒤에 다시 시도해 주세요.'))
    };
  }
}
