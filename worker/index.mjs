import { renderCatalog } from '../platform/catalog.mjs';
import { CLUBS, PLATFORM_NAME } from '../platform/clubs.mjs';
import { handleApi } from './api.mjs';
import { isAdminId, isSixDigitPin } from './auth.mjs';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const bindingPattern = /^[A-Z][A-Z0-9_]*$/;
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

function shareTags(url, club, kind) {
  const type = kind === 'vote' ? '참석 투표' : '공지';
  const title = `${club.name} ${type} · ${PLATFORM_NAME}`;
  const description = '회원 로그인 후 확인할 수 있어요.';
  const canonical = url.origin + url.pathname.replace(/\/$/, '');
  const tags = [
    ['og:type', 'website'],
    ['og:locale', 'ko_KR'],
    ['og:site_name', PLATFORM_NAME],
    ['og:title', title],
    ['og:description', description],
    ['og:url', canonical]
  ];
  if (club.slug === 'suncok19') {
    const image = new URL(`/assets/kakao-${kind}.png`, url.origin);
    tags.push(
      ['og:image', image.href],
      ['og:image:width', 1200],
      ['og:image:height', 630],
      ['og:image:alt', `${club.name} ${type}`]
    );
  }
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

function errorPage(request, status, title) {
  return htmlResponse(request, `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · ${escape(PLATFORM_NAME)}</title><body><main><h1>${escape(title)}</h1><p><a href="/">등록 모임 보기</a></p></main></body></html>`, { status });
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

function registryIndex(clubs) {
  const bySlug = new Map();
  const bindings = new Set();
  for (const club of clubs) {
    if (typeof club.slug !== 'string' || club.slug.length > 64 || !slugPattern.test(club.slug) || bySlug.has(club.slug)) {
      throw new Error('Each registered club must have a unique slug.');
    }
    const keys = [club.databaseBinding, club.adminIdBinding, club.adminPinBinding, club.authPepperBinding];
    for (const key of keys) {
      if (typeof key !== 'string' || !bindingPattern.test(key) || bindings.has(key)) {
        throw new Error('Each registered club must use distinct database and secret bindings.');
      }
      bindings.add(key);
    }
    bySlug.set(club.slug, club);
  }
  return bySlug;
}

function scopeEnv(club, clubs, env) {
  const db = env[club.databaseBinding];
  const adminId = env[club.adminIdBinding];
  const adminPin = env[club.adminPinBinding];
  const authPepper = env[club.authPepperBinding];
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function' ||
      !isAdminId(adminId) || !isSixDigitPin(adminPin) ||
      typeof authPepper !== 'string' || authPepper.length < 32) return null;

  for (const other of clubs) {
    if (other.slug === club.slug) continue;
    if (env[other.databaseBinding] === db || env[other.adminPinBinding] === adminPin ||
        env[other.authPepperBinding] === authPepper) {
      return null;
    }
  }
  return {
    DB: db,
    CLUB_ADMIN_ID: adminId,
    CLUB_ADMIN_PIN: adminPin,
    CLUB_AUTH_PEPPER: authPepper,
    CLUB_SCOPE: club.slug
  };
}

function adminManifest(request, club) {
  const start = `/clubs/${club.slug}/admin/`;
  const manifest = {
    id: start, start_url: start, scope: start, display: 'standalone', lang: 'ko',
    name: `${club.name} 운영진 · ${PLATFORM_NAME}`, short_name: `${club.name} 운영진`,
    background_color: '#f3f2ec', theme_color: '#f3f2ec',
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

async function clubPage(request, env, url, club, share, admin) {
  const tags = share ? shareTags(url, club, share[1]) : '';
  const path = admin ? '/admin-shell.html' : '/index.html';
  const index = await env.ASSETS.fetch(new Request(new URL(path, url.origin)));
  if (!index.ok) return errorPage(request, 503, '화면을 불러올 수 없어요');
  const html = (await index.text())
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(club.name)} · ${escape(PLATFORM_NAME)}</title>`)
    .replace('<!-- club-context -->', () => clubContext(club))
    .replace('<!-- share-meta -->', () => tags)
    .replace('<!-- admin-app -->', () => admin
      ? `<link rel="manifest" href="/clubs/${club.slug}/admin/manifest.webmanifest">
    <link rel="apple-touch-icon" href="/assets/shuttlecock-icon-192.png">`
      : '');
  return htmlResponse(request, html, { headers: index.headers });
}

export function createWorker(clubs = CLUBS, { legacyClub = 'suncok19' } = {}) {
  const bySlug = registryIndex(clubs);
  const catalogClubs = clubs.map(({ slug, name, subtitle, schedule }) => ({ slug, name, subtitle, schedule }));
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
      if (path === '/') {
        if (!canView(request)) return methodNotAllowed();
        // The root is the 콕콕콕! intro home; members and organisers enter a club from its directory.
        return htmlResponse(request, renderCatalog({ clubs: catalogClubs, basePath: '/', mode: 'live' }), {
          cacheControl: 'public, max-age=60, s-maxage=60'
        });
      }
      if (path === '/index.html' || path === '/admin-shell.html') return Response.redirect(new URL('/', url.origin), 308);
      if (path === '/api' || path.startsWith('/api/')) return apiError(request, 404, 'API 주소를 찾을 수 없어요.');

      const legacy = sharePath.exec(path);
      if (legacy && bySlug.has(legacyClub)) {
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
      const club = bySlug.get(slug);
      const isApi = remainder === '/api' || remainder.startsWith('/api/');
      if (!club) {
        return isApi ? apiError(request, 404, '모임을 찾을 수 없어요.') : errorPage(request, 404, '모임을 찾을 수 없어요');
      }
      const scoped = scopeEnv(club, clubs, env);
      if (!scoped) {
        return isApi ? apiError(request, 503, '모임 운영 설정을 확인해 주세요.') : errorPage(request, 503, '모임을 준비 중이에요');
      }

      if (isApi) {
        url.pathname = remainder;
        return handleApi(new Request(url, request), scoped);
      }
      if (remainder === '/admin/manifest.webmanifest') {
        return canView(request) ? adminManifest(request, club) : methodNotAllowed();
      }
      const share = sharePath.exec(remainder);
      if (!share && !['', '/', '/admin', '/admin/'].includes(remainder)) return errorPage(request, 404, '공유 내용을 찾을 수 없어요');
      if (!canView(request)) return methodNotAllowed();
      if (!remainder || remainder === '/admin') {
        url.pathname += '/';
        return Response.redirect(url, 308);
      }
      return clubPage(request, env, url, club, share, remainder === '/admin/');
    }
  };
}

export default createWorker();
