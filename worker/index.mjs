import { renderCatalog } from '../platform/catalog.mjs';
import { CLUBS, PLATFORM_NAME } from '../platform/clubs.mjs';
import { handleApi } from './api.mjs';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const bindingPattern = /^[A-Z][A-Z0-9_]*$/;
const clubPath = /^\/clubs\/([a-z0-9][a-z0-9-]{0,63})(\/.*)?$/;
const sharePath = /^\/(vote|notice)\/([a-zA-Z0-9_-]{1,100})\/?$/;

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function meta(attr, key, value) {
  return `<meta ${attr}="${key}" content="${escape(value)}">`;
}

function shareTags(url, club, kind, record) {
  const isVote = kind === 'vote';
  const type = isVote ? '참석 투표' : '공지';
  const title = `${record.title} · ${type} | ${club.name} · ${PLATFORM_NAME}`;
  const description = isVote
    ? `${record.date} ${record.time}–${record.endTime} · ${record.place}`
    : `${club.name} 공지 내용을 확인하세요.`;
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
    for (const key of [club.databaseBinding, club.adminPasswordBinding, club.authPepperBinding]) {
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
  const adminPassword = env[club.adminPasswordBinding];
  const authPepper = env[club.authPepperBinding];
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function' ||
      typeof adminPassword !== 'string' || adminPassword.length < 16 ||
      typeof authPepper !== 'string' || authPepper.length < 32 || adminPassword === authPepper) return null;

  for (const other of clubs) {
    if (other.slug === club.slug) continue;
    const otherSecrets = [env[other.adminPasswordBinding], env[other.authPepperBinding]];
    if (env[other.databaseBinding] === db || otherSecrets.includes(adminPassword) || otherSecrets.includes(authPepper)) {
      return null;
    }
  }
  return {
    DB: db,
    CLUB_ADMIN_PASSWORD: adminPassword,
    CLUB_AUTH_PEPPER: authPepper,
    CLUB_SCOPE: club.slug
  };
}

async function clubPage(request, env, scoped, url, club, share) {
  let tags = '';
  if (share) {
    const [, kind, id] = share;
    const route = new URL(`/api/public/${kind}/${id}`, url.origin);
    const result = await handleApi(new Request(route), scoped);
    if (result.status === 404) return errorPage(request, 404, '공유 내용을 찾을 수 없어요');
    if (!result.ok) return errorPage(request, 503, '공유 내용을 잠시 불러올 수 없어요');
    const payload = await result.json();
    const record = kind === 'vote' ? payload.event : payload.notice;
    if (!record) return errorPage(request, 404, '공유 내용을 찾을 수 없어요');
    tags = shareTags(url, club, kind, record);
  }
  const index = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
  if (!index.ok) return errorPage(request, 503, '화면을 불러올 수 없어요');
  const html = (await index.text())
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(club.name)} · ${escape(PLATFORM_NAME)}</title>`)
    .replace('<!-- club-context -->', () => clubContext(club))
    .replace('<!-- share-meta -->', () => tags);
  return htmlResponse(request, html, { headers: index.headers });
}

export function createWorker(clubs = CLUBS, { legacyClub = 'suncok19' } = {}) {
  const bySlug = registryIndex(clubs);
  const catalogClubs = clubs.map(({ slug, name, subtitle, schedule }) => ({ slug, name, subtitle, schedule }));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const { pathname: path } = url;
      if (path === '/') {
        return canView(request)
          ? htmlResponse(request, renderCatalog({ clubs: catalogClubs, basePath: '/', mode: 'live' }), {
            cacheControl: 'public, max-age=60, s-maxage=60'
          })
          : methodNotAllowed();
      }
      if (path === '/index.html') return Response.redirect(new URL('/', url.origin), 308);
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
      const share = sharePath.exec(remainder);
      if (!share && !['', '/', '/admin', '/admin/'].includes(remainder)) return errorPage(request, 404, '공유 내용을 찾을 수 없어요');
      if (!canView(request)) return methodNotAllowed();
      if (!remainder || remainder === '/admin') {
        url.pathname += '/';
        return Response.redirect(url, 308);
      }
      return clubPage(request, env, scoped, url, club, share);
    }
  };
}

export default createWorker();
