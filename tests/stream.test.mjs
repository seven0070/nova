import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { partialAnswer, readModelStream } = await loadTs('../lib/agent/stream.ts');

test('answer preview handles partial JSON, escapes, and unicode safely', () => {
  assert.equal(partialAnswer('{"type":"final","answer":"Hello'), 'Hello');
  assert.equal(partialAnswer('{"type":"final","answer":"line\\nnext\\"quote'), 'line\nnext"quote');
  assert.equal(partialAnswer('{"type":"final","answer":"A\\u263'), 'A');
  assert.equal(partialAnswer('{"type":"final","answer":"A\\u263a'), 'A☺');
  assert.equal(partialAnswer('{"type":"final","answer":"A\\'), 'A');
  assert.equal(partialAnswer('{"type":"tool","name":"write_file","args":{"content":"secret"}}'), null);
  assert.equal(partialAnswer('{"type":"plan","steps":["a"]}'), null);
});

test('OpenAI-compatible decision streams produce previews and a complete final JSON object', async () => {
  const fragments = ['{"type":"final","answer":"Hello', ' from Nova\\n', 'Done."}'];
  const events = fragments.map(content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
  const previews = [];
  const output = await readModelStream(new Response(events), new AbortController().signal, text => previews.push(text));
  assert.equal(JSON.parse(output).answer, 'Hello from Nova\nDone.'); assert.equal(previews[0], 'Hello'); assert.equal(previews.at(-1), 'Hello from Nova\nDone.');
});

test('Anthropic decisions stream through split chunks without exposing tool payloads', async () => {
  const events = 'data: ' + JSON.stringify({ delta: { text: '{"type":"tool","name":"write_file","args":{"path":"a.md","content":"hello"}}' } }) + '\n\n';
  const bytes = new TextEncoder().encode(events);
  const body = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 15)); controller.enqueue(bytes.slice(15)); controller.close(); } });
  let previews = 0;
  const output = await readModelStream(new Response(body), new AbortController().signal, () => previews++);
  assert.equal(JSON.parse(output).name, 'write_file'); assert.equal(previews, 0);
});

test('stream errors and cancellation are reported', async () => {
  await assert.rejects(() => readModelStream(new Response('data: {"error":{"message":"Provider failed"}}\n\n'), new AbortController().signal, () => {}), /Provider failed/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(() => readModelStream(new Response('data: [DONE]\n\n'), abort.signal, () => {}));
});

test('native OpenAI and Anthropic function streams expose only final answer previews',async()=>{for(const protocol of ['openai','anthropic']){const raw='{"type":"final","answer":"Native decision"}',chunks=[raw.slice(0,20),raw.slice(20)],events=chunks.map(fragment=>'data: '+JSON.stringify(protocol==='openai'?{choices:[{delta:{tool_calls:[{function:{arguments:fragment}}]}}]}:{delta:{partial_json:fragment}})+'\n\n').join('');const previews=[];assert.equal(await readModelStream(new Response(events),new AbortController().signal,text=>previews.push(text)),raw);assert.equal(previews.at(-1),'Native decision');}});
