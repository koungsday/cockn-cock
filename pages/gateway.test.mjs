import assert from 'node:assert/strict';
import { test } from 'node:test';
import gateway from './site/_worker.js';

test('the Pages hostname forwards the original request and response', async () => {
  const request = new Request('https://cockcockcock.pages.dev/clubs/suncok19/api/login', {
    method: 'POST',
    headers: { Origin: 'https://cockcockcock.pages.dev', 'Content-Type': 'application/json' },
    body: '{}'
  });
  const response = new Response(null, {
    headers: { 'Set-Cookie': '__Host-suncok19-admin=test; Secure; HttpOnly; Path=/' }
  });
  const CLUB_WORKER = { fetch(forwarded) {
    assert.equal(forwarded, request);
    return response;
  } };

  assert.equal(await gateway.fetch(request, { CLUB_WORKER }), response);
});

test('Pages deployment aliases cannot reach the Worker', async () => {
  for (const hostname of ['373f31e2.user-example.pages.dev', 'development.user-example.pages.dev']) {
    const response = await gateway.fetch(new Request(`https://${hostname}/clubs/suncok19/admin/`), {});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
