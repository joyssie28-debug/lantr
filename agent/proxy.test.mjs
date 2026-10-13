import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/plan/route.js';

test('website authenticates the password and sends only the agent secret upstream', async t => {
  const previous = { ...process.env }; const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; for (const key of ['SITE_PASSWORD','AGENT_SECRET','AGENT_URL']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  process.env.SITE_PASSWORD = 'test-site-password';
  process.env.AGENT_SECRET = 'test-private-agent-secret';
  process.env.AGENT_URL = 'http://localhost:8080';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, 'http://localhost:8080/api/plan');
    assert.equal(options.headers.Authorization, 'Bearer test-private-agent-secret');
    assert.doesNotMatch(JSON.stringify(options), /test-site-password/);
    return Response.json({ plan: { test: true } });
  };
  const request = (password, body = '{}', origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/plan', { method: 'POST', headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json', origin }, body });
  assert.equal((await POST(request('wrong'))).status, 401);
  assert.equal((await POST(request('test-private-agent-secret'))).status, 401);
  assert.equal((await POST(request('test-site-password', '{}', 'https://example.com'))).status, 403);
  assert.equal((await POST(request('test-site-password', 'x'.repeat(16385)))).status, 413);
  assert.equal(calls, 0);
  const response = await POST(request('test-site-password'));
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.doesNotMatch(await response.text(), /test-private-agent-secret|test-site-password/);
  const localRequest = (origin, host) => new Request('http://localhost:3000/api/plan', { method: 'POST', headers: { authorization: 'Bearer test-site-password', 'content-type': 'application/json', origin, host }, body: '{}' });
  assert.equal((await POST(localRequest('http://127.0.0.1:3000', '127.0.0.1:3000'))).status, 200);
  assert.equal((await POST(localRequest('http://localhost:3000', 'localhost:3000'))).status, 200);
  assert.equal((await POST(localRequest('http://127.0.0.1:4000', '127.0.0.1:3000'))).status, 403);
  assert.equal((await POST(localRequest('https://example.com', '127.0.0.1:3000'))).status, 403);
  assert.equal((await POST(localRequest('null', '127.0.0.1:3000'))).status, 403);
  process.env.SITE_PASSWORD = '';
  assert.equal((await POST(request(''))).status, 503);
  assert.equal(calls, 3);
});
