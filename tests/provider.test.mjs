import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

import { loadTs } from './load-ts.mjs';
const { POST } = await loadTs('../app/api/provider/route.ts');
const appOrigin = 'http://localhost:3000';
const defaults = {
  base: 'https://api.provider.dev/v1', key: 'test-key', model: 'test-model',
  protocol: 'openai', action: 'chat', system: 'Be helpful.',
  messages: [{ role: 'user', content: 'Hello' }],
};
function request(data = defaults, origin = appOrigin) {
  return new Request(appOrigin + '/api/provider', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin,host:new URL(appOrigin).host },
    body: JSON.stringify(data),
  });
}
async function mockedFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('rejects cross-origin requests before contacting a provider', async () => {
  await mockedFetch(() => { throw new Error('Must not fetch'); }, async () => {
    assert.equal((await POST(request(defaults, 'https://other.test'))).status, 403);
  });
});

test('accepts the public Host when Next.js uses an internal request URL', async () => {
  const req = new Request('http://localhost:3000/api/provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify({ ...defaults, key: '' }),
  });
  const response = await POST(req);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /API key/);
});

test('rejects a scheme mismatch even when the Host matches', async () => {
  const req = new Request('https://nova.test/api/provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'nova.test', origin: 'http://nova.test' },
    body: JSON.stringify(defaults),
  });
  assert.equal((await POST(req)).status, 403);
});

test('rejects local and insecure endpoints', async () => {
  for (const base of ['http://api.provider.dev/v1', 'https://service.internal/v1', 'https://10.0.0.1/v1',
    'https://name:password@api.provider.test/v1']) {
    assert.equal((await POST(request({ ...defaults, base }))).status, 400, base);
  }
});

test('requires an API key', async () => {
  const response = await POST(request({ ...defaults, key: '' }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /API key/);
});

test('passes OpenAI-compatible messages and streaming bytes through', async () => {
  await mockedFetch(async (url, options) => {
    assert.equal(url, 'https://api.provider.dev/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true);
    assert.deepEqual(body.messages[0], { role: 'system', content: 'Be helpful.' });
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
  }, async () => {
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
    assert.match(await response.text(), /Hello/);
  });
});

test('uses Anthropic Messages headers and payload', async () => {
  await mockedFetch(async (url, options) => {
    assert.equal(url, 'https://api.provider.dev/v1/messages');
    assert.equal(options.headers['x-api-key'], 'test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.system, 'Be helpful.');
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.messages, defaults.messages);
    return new Response('data: {"delta":{"text":"Hello"}}\n\n');
  }, async () => {
    assert.equal((await POST(request({ ...defaults, protocol: 'anthropic' }))).status, 200);
  });
});

test('fetches available models with GET', async () => {
  await mockedFetch(async (url, options) => {
    assert.equal(url, 'https://api.provider.dev/v1/models');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return Response.json({ data: [{ id: 'model-one' }] });
  }, async () => {
    const response = await POST(request({ ...defaults, action: 'models' }));
    assert.deepEqual(await response.json(), { data: [{ id: 'model-one' }] });
  });
});

test('reports provider authentication errors', async () => {
  await mockedFetch(async () => Response.json({ error: { message: 'Invalid API key' } }, { status: 401 }), async () => {
    const response = await POST(request());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid API key' });
  });
});

test('agent mode requests a non-streaming model decision', async () => {
  await mockedFetch(async (_url, options) => {
    assert.equal(JSON.parse(options.body).stream, false);
    return Response.json({ choices: [{ message: { content: '{"type":"final","answer":"Done"}' } }] });
  }, async () => {
    const response = await POST(request({ ...defaults, action: 'agent' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: '{"type":"final","answer":"Done"}', model:'test-model' });
  });
});

test('agent mode extracts Anthropic text blocks', async () => {
  await mockedFetch(async (_url, options) => {
    assert.equal(JSON.parse(options.body).stream, false);
    return Response.json({ content: [{ type: 'text', text: '{"type":"final","answer":"Done"}' }] });
  }, async () => {
    const response = await POST(request({ ...defaults, action: 'agent', protocol: 'anthropic' }));
    assert.deepEqual(await response.json(), { text: '{"type":"final","answer":"Done"}', model:'test-model' });
  });
});

test('portable relay permits keyless loopback models only for a local same-origin browser',async()=>{await mockedFetch(async()=>Response.json({choices:[{message:{content:'{"type":"final","answer":"local"}'}}]}),async()=>{const data={...defaults,base:'http://localhost:11434/v1',key:'',action:'agent'};const req=new Request('http://localhost:3000/api/provider',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000'},body:JSON.stringify(data)});assert.equal((await POST(req)).status,200);const remote=new Request('https://nova.test/api/provider',{method:'POST',headers:{host:'nova.test',origin:'https://nova.test'},body:JSON.stringify(data)});assert.equal((await POST(remote)).status,400);});});
