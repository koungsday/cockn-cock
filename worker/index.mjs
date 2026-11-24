import { handleApi } from './api.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function meta(property, content) {
  return `<meta property="${property}" content="${escape(content)}">`;
}

function shareTags(url, kind, record) {
  const siteName = '썬콕19';
  const isVote = kind === 'vote';
  const type = isVote ? '참석 투표' : '공지';
  const title = `${record.title} · ${type} | ${siteName}`;
  const description = isVote
    ? `${record.date} ${record.time}–${record.endTime} · ${record.place}`
    : '썬콕19 공지 내용을 확인하세요.';
  const image = new URL(`/assets/kakao-${kind}.png`, url.origin);
  return `
<link rel="canonical" href="${escape(url.origin + url.pathname)}">
${meta('og:type', 'website')}
${meta('og:locale', 'ko_KR')}
${meta('og:site_name', siteName)}
${meta('og:title', title)}
${meta('og:description', description)}
${meta('og:url', url.origin + url.pathname)}
${meta('og:image', image.href)}
${meta('og:image:width', 1200)}
${meta('og:image:height', 630)}
${meta('og:image:alt', `${siteName} ${type}`)}`;
}

function pageHeaders(originHeaders) {
  const headers = new Headers(originHeaders);
  headers.delete('content-length');
  headers.delete('etag');
  headers.delete('cf-cache-status');
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function errorPage(status, title) {
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · 썬콕19</title><body><main><h1>${escape(title)}</h1><p>운영진에게 공유 링크를 확인해 주세요.</p></main></body></html>`, {
    status, headers: pageHeaders({'Content-Type': 'text/html; charset=utf-8'})
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname === '/index.html') return Response.redirect(new URL('/', url.origin), 308);

    const share = /^\/(vote|notice)\/([a-zA-Z0-9_-]{1,100})\/?$/.exec(url.pathname);
    if (!share && url.pathname !== '/') return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    const index = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
    if (!index.ok) return errorPage(503, '화면을 불러올 수 없어요');
    let html = await index.text();
    if (share) {
      const [, kind, id] = share;
      const route = new URL(`/api/public/${kind}/${id}`, url.origin);
      const result = await handleApi(new Request(route), env);
      if (result.status === 404) return errorPage(404, '공유 내용을 찾을 수 없어요');
      if (!result.ok) return errorPage(503, '공유 내용을 잠시 불러올 수 없어요');
      const payload = await result.json();
      const record = kind === 'vote' ? payload.event : payload.notice;
      if (!record) return errorPage(404, '공유 내용을 찾을 수 없어요');
      html = html.replace('<!-- share-meta -->', () => shareTags(url, kind, record));
    }
    return new Response(request.method === 'HEAD' ? null : html, { headers: pageHeaders(index.headers) });
  }
};
