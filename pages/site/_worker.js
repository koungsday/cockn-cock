const projectHost = /^[a-z0-9-]+\.pages\.dev$/;
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];

export default {
  fetch(request, env) {
    const { hostname, protocol } = new URL(request.url);
    const isLocal = loopbackHosts.includes(hostname);
    if (!isLocal && (protocol !== 'https:' || !projectHost.test(hostname))) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.CLUB_WORKER.fetch(request);
  }
};
