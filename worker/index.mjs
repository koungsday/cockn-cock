import { renderCatalog } from '../platform/catalog.mjs';
import { CLUBS, PLATFORM_NAME } from '../platform/clubs.mjs';
import { handleApi, shareSummary } from './api.mjs';
import { consolePage } from './console.mjs';
import { findClub, legacyIndex, scopeEnv, slugPattern } from './scope.mjs';

const clubPath = /^\/clubs\/([a-z0-9][a-z0-9-]{0,63})(\/.*)?$/;
const sharePath = /^\/(vote|notice)\/([a-zA-Z0-9_-]{1,100})\/?$/;
const apiPath = /^\/(?:clubs\/[^/]+\/)?api(?:\/|$)/;
const pagesOrigin = /^https:\/\/[a-z0-9-]+\.pages\.dev$/;

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function meta(attr, key, value) {
  return `<meta ${attr}="${key}" content="${escape(value)}">`;
}

// summary: what anyone with the link may see (worker/api.mjs shareSummary, 사용자 결정 2026-11-26): the event's date and
// deadline or the start of the notice. A draft or a missing record keeps the club name and type only.
function shareTags(url, club, kind, summary) {
  const type = kind === 'vote' ? '참석 투표' : '공지';
  const title = summary ? `${summary.title} · ${club.name}` : `${club.name} ${type} · ${PLATFORM_NAME}`;
  const description = summary?.description || '회원 로그인 후 확인할 수 있어요.';
  const canonical = url.origin + url.pathname.replace(/\/$/, '');
  const tags = [
    ['og:type', 'website'],
    ['og:locale', 'ko_KR'],
    ['og:site_name', PLATFORM_NAME],
    ['og:title', title],
    ['og:description', description],
    ['og:url', canonical]
  ];
  // 썬콕19 keeps its card with its name; every other club gets the same card with 콕콕콕! in that place, so no link
  // reaches the chat without an image. The 운영 화면 shows this preview from these tags (worker/public/app.mjs).
  const image = new URL(`/assets/kakao-${kind}${club.slug === 'suncok19' ? '' : '-common'}.png`, url.origin);
  tags.push(
    ['og:image', image.href],
    ['og:image:width', 1200],
    ['og:image:height', 630],
    ['og:image:alt', `${club.name} ${type}`]
  );
  return `<link rel="canonical" href="${escape(canonical)}">\n${tags.map(
    ([key, value]) => meta('property', key, value)
  ).join('\n')}`;
}

function clubContext(club) {
  const fields = [
    ['club-base', '/clubs/' + club.slug],
    ['club-name', club.name],
    ['club-subtitle', club.subtitle]
  ];
  if (club.defaultPlace) fields.push(['club-default-place', club.defaultPlace]);
  return fields.map(([key, value]) => meta('name', key, value)).join('\n');
}

function pageHeaders(originHeaders, cacheControl) {
  const headers = new Headers(originHeaders);
  headers.delete('content-length');
  headers.delete('etag');
  headers.delete('cf-cache-status');
  headers.set('Cache-Control', cacheControl);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function htmlResponse(request, html, {
  status = 200, headers = { 'Content-Type': 'text/html; charset=utf-8' }, cacheControl = 'no-store'
} = {}) {
  return new Response(request.method === 'HEAD' ? null : html, { status, headers: pageHeaders(headers, cacheControl) });
}

function errorPage(request, status, title, detail = '') {
  return htmlResponse(request, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · ${escape(PLATFORM_NAME)}</title><body><main><h1>${escape(title)}</h1>${detail ? `<p>${escape(detail)}</p>` : ''}<p><a href="/#login">${escape(PLATFORM_NAME)} 홈으로</a></p></main></body></html>`, { status });
}

function apiError(request, status, error) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  return request.method === 'HEAD' ? new Response(null, { status, headers }) : Response.json({ error }, { status, headers });
}

function canView(request) {
  return request.method === 'GET' || request.method === 'HEAD';
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
}

// The home-screen app (ROLES.md 2단계): one address for everyone, members and organisers alike.
function clubManifest(request, club) {
  const start = `/clubs/${club.slug}/`;
  const manifest = {
    id: start, start_url: start, scope: start, display: 'standalone', lang: 'ko',
    name: `${club.name} · ${PLATFORM_NAME}`, short_name: club.name,
    background_color: '#ffffff', theme_color: '#ffffff',
    icons: [192, 512].map(size => ({
      src: `/assets/shuttlecock-icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png'
    }))
  };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// The intro home's '최근 들어간 모임' reads this (platform/recent-club.js). Only the club's public name and slug, no account data.
function recentCookie(url, club) {
  const value = encodeURIComponent(new URLSearchParams({ s: club.slug, n: club.name, v: 'member' }).toString());
  return `cockcockcock-recent=${value}; Path=/; Max-Age=15552000; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`;
}

// One page for everyone (ROLES.md 2단계): the screen shows each person's menus from their sign-in.
async function clubPage(request, env, url, club, share, summary = null) {
  const tags = share ? shareTags(url, club, share[1], summary) : '';
  const index = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
  if (!index.ok) return errorPage(request, 503, '화면을 불러올 수 없어요');
  const html = (await index.text())
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(club.name)} · ${escape(PLATFORM_NAME)}</title>`)
    .replace('<!-- club-context -->', () => clubContext(club))
    .replace('<!-- share-meta -->', () => tags)
    .replace('<!-- admin-app -->', () => `<link rel="manifest" href="/clubs/${club.slug}/manifest.webmanifest">
    <link rel="apple-touch-icon" href="/assets/shuttlecock-icon-192.png">`);
  const response = htmlResponse(request, html, { headers: index.headers });
  response.headers.append('Set-Cookie', recentCookie(url, club));
  return response;
}

// legacyClubs: clubs from before the console and the secret names they keep using (platform/clubs.mjs).
export function createWorker(legacyClubs = CLUBS, { legacyClub = 'suncok19' } = {}) {
  const oldClubs = legacyIndex(legacyClubs);
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const { pathname: path } = url;
      if (canView(request) && url.origin === env.CLUB_LEGACY_ORIGIN
        && pagesOrigin.test(env.CLUB_PUBLIC_ORIGIN) && !apiPath.test(path)) {
        const target = new URL(env.CLUB_PUBLIC_ORIGIN);
        target.pathname = path;
        target.search = url.search;
        return new Response(null, { status: 308, headers: { Location: target.href, 'Cache-Control': 'no-store' } });
      }
      // The UI files of a release (worker/prepare.mjs club-ui/<hash>/). While a deploy spreads, a page from one Worker
      // version can ask another for a release it does not have; _headers would mark that 404 immutable and the browser
      // would keep it for a year, so a missing one is never cached (2026-11-27, measured on the live address).
      if (path.startsWith('/club-ui/')) {
        const asset = await env.ASSETS.fetch(request);
        return asset.status === 404 ? new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }) : asset;
      }
      if (path === '/console' || path.startsWith('/console/')) {
        // 총괄 콘솔 (PLATFORM.md). Not linked from any public page; noindex and never cached.
        const result = await consolePage(request, env, url, oldClubs);
        const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
        if (result.location) {
          return new Response(null, { status: result.status, headers: {
            ...headers, Location: result.location, ...(result.cookie && { 'Set-Cookie': result.cookie })
          } });
        }
        const response = htmlResponse(request, result.html, { status: result.status });
        response.headers.set('X-Robots-Tag', headers['X-Robots-Tag']);
        // Its forms post back here, and browsers send Origin: null on a form post from a no-referrer page.
        // same-origin still sends nothing to other sites; console.mjs requires the exact Origin.
        response.headers.set('Referrer-Policy', 'same-origin');
        if (result.allow) response.headers.set('Allow', result.allow);
        if (result.cookie) response.headers.append('Set-Cookie', result.cookie);
        return response;
      }
      // The intro home's 로그인 form, and the lasting club entry: /go?club=<주소> or /go/<주소> opens that club.
      if (path === '/go' || path.startsWith('/go/')) {
        if (!canView(request)) return methodNotAllowed();
        let typed = url.searchParams.get('club') ?? '';
        if (path !== '/go') {
          try { typed = decodeURIComponent(path.slice(4)); } catch { typed = ''; }
        }
        // A whole pasted link (https://…/clubs/<주소>/vote/…) is fine too: only the club part is used.
        const link = typed.match(/(?:^|\/)clubs\/([^/?#\s]+)/i);
        const slug = (link ? link[1] : typed).trim().replace(/^\/+|\/+$/g, '').toLowerCase();
        const club = slug.length <= 64 && slugPattern.test(slug) ? await findClub(env, slug) : null;
        if (club?.status === 'active') return Response.redirect(new URL(`/clubs/${slug}/`, url.origin), 303);
        if (club) return errorPage(request, 403, '이 모임은 지금 쉬고 있어요', '총괄 관리자에게 문의해 주세요.');
        return errorPage(request, 404, '모임 주소를 찾을 수 없어요', '카톡으로 받은 링크를 그대로 붙여 넣거나, /clubs/ 뒤의 영문 주소를 넣어 주세요.');
      }
      if (path === '/') {
        if (!canView(request)) return methodNotAllowed();
        // The root is the 콕콕콕! intro home with no club list (PLATFORM.md); members and organisers use their club's link.
        return htmlResponse(request, renderCatalog({ basePath: '/', mode: 'live' }), {
          cacheControl: 'public, max-age=60, s-maxage=60'
        });
      }
      if (path === '/index.html') return Response.redirect(new URL('/', url.origin), 308);
      if (path === '/api' || path.startsWith('/api/')) return apiError(request, 404, 'API 주소를 찾을 수 없어요.');

      const legacy = sharePath.exec(path);
      if (legacy && oldClubs.has(legacyClub)) {
        if (!canView(request)) return methodNotAllowed();
        url.pathname = `/clubs/${legacyClub}/${legacy[1]}/${legacy[2]}`;
        return Response.redirect(url, 308);
      }

      const matched = clubPath.exec(path);
      if (!matched) {
        if (path === '/clubs' || path.startsWith('/clubs/')) return errorPage(request, 404, '모임을 찾을 수 없어요');
        return env.ASSETS.fetch(request);
      }

      const [, slug, remainder = ''] = matched;
      const isApi = remainder === '/api' || remainder.startsWith('/api/');
      const club = slugPattern.test(slug) ? await findClub(env, slug) : null;
      if (club === undefined) {
        return isApi ? apiError(request, 503, '모임 운영 설정을 확인해 주세요.') : errorPage(request, 503, '모임을 준비 중이에요');
      }
      if (!club) {
        return isApi ? apiError(request, 404, '모임을 찾을 수 없어요.') : errorPage(request, 404, '모임을 찾을 수 없어요');
      }
      // A club the 총괄 paused keeps its records; its pages and API only say so (PLATFORM.md 모임 발급).
      if (club.status !== 'active') {
        return isApi ? apiError(request, 403, '이 모임은 지금 쉬고 있어요. 총괄 관리자에게 문의해 주세요.')
          : errorPage(request, 403, '이 모임은 지금 쉬고 있어요', '총괄 관리자에게 문의해 주세요.');
      }
      const scoped = await scopeEnv(club, oldClubs, env);
      if (!scoped) {
        return isApi ? apiError(request, 503, '모임 운영 설정을 확인해 주세요.') : errorPage(request, 503, '모임을 준비 중이에요');
      }

      if (isApi) {
        url.pathname = remainder;
        return handleApi(new Request(url, request), scoped);
      }
      // The old organisers' app address keeps working: its manifest and page lead to the one club address.
      if (remainder === '/manifest.webmanifest' || remainder === '/admin/manifest.webmanifest') {
        return canView(request) ? clubManifest(request, club) : methodNotAllowed();
      }
      const share = sharePath.exec(remainder);
      if (!share && !['', '/', '/admin', '/admin/'].includes(remainder)) return errorPage(request, 404, '공유 내용을 찾을 수 없어요');
      if (!canView(request)) return methodNotAllowed();
      if (remainder !== '/' && !share) {
        // '/admin/' was the 운영 화면 until ROLES.md 2단계; a bookmark or home-screen app there opens the one club page
        // (a browser keeps the #section of the address across this redirect).
        url.pathname = `/clubs/${club.slug}/`;
        return Response.redirect(url, 308);
      }
      const summary = share ? await shareSummary(scoped.DB, scoped.CLUB_SCOPE, share[1], share[2]) : null;
      return clubPage(request, env, url, club, share, summary);
    }
  };
}

export default createWorker();
