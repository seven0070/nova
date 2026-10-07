import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { runAgent, parseAction, contextWindow, agentSystem } = await loadTs('../lib/agent/engine.ts');
const { calculate } = await loadTs('../lib/agent/arithmetic.ts');
const { safePath, validateRecord } = await loadTs('../lib/agent/records.ts');
const { publicHttps } = await loadTs('../lib/agent/http.ts');
const capabilities = { runtime: 'web', terminalEnabled: false };
const initial = () => ({ id: 'test-run', goal: 'Write a report', status: 'running', plan: [], events: [], answer: '', updatedAt: Date.now(), transcript: [{ role: 'user', content: 'Write a report' }] });
function options(overrides = {}) { return { run: initial(), system: 'test', capabilities, maxSteps: 6, signal: new AbortController().signal, update: () => {}, execute: async () => ({ success: true }), ...overrides }; }

test('agent plans, executes tools, observes results, and finishes', async () => {
  const actions = [{ type: 'plan', steps: ['Calculate', 'Write report'] }, { type: 'tool', name: 'calculate', args: { expression: '2+3' } }, { type: 'tool', name: 'write_file', args: { path: 'report.md', content: 'Result: 5' } }, { type: 'final', answer: 'Saved report.md with result 5.' }];
  const called = []; const states = [];
  const result = await runAgent(options({ model: async (_system, transcript) => { if (actions.length === 2) assert.match(transcript.at(-1).content, /"result":5/); return JSON.stringify(actions.shift()); }, execute: async call => { called.push(call.name); return call.name === 'calculate' ? { result: calculate(call.args.expression) } : { written: call.args.path }; }, update: state => states.push(state) }));
  assert.equal(result.status, 'completed'); assert.deepEqual(called, ['calculate','write_file']); assert.equal(result.plan.length, 2); assert.equal(result.events.filter(e => e.type === 'observation').length, 2); assert.ok(states.length >= 8);
});

test('tool errors are observations the model can correct', async () => {
  let index = 0;
  const result = await runAgent(options({ model: async (_system, messages) => { if (index++ === 0) return JSON.stringify({ type: 'tool', name: 'read_file', args: { path: 'missing.txt' } }); assert.match(messages.at(-1).content, /File missing/); return JSON.stringify({ type: 'final', answer: 'The requested file does not exist.' }); }, execute: async () => { throw new Error('File missing'); } }));
  assert.equal(result.status, 'completed'); assert.match(result.events.find(e => e.type === 'observation').detail, /File missing/);
});

test('agent stops at a step limit rather than looping forever', async () => {
  const result = await runAgent(options({ maxSteps: 2, model: async () => JSON.stringify({ type: 'plan', steps: ['Keep planning'] }) }));
  assert.equal(result.status, 'limited');
});

test('abort preserves progress and produces a resumable run', async () => {
  const controller = new AbortController();
  const result = await runAgent(options({ signal: controller.signal, model: async () => { controller.abort(); return JSON.stringify({ type: 'final', answer: 'Must not finish' }); } }));
  assert.equal(result.status, 'paused'); assert.match(result.transcript.at(-1).content, /verify/);
});

test('unavailable terminal calls do not execute in web mode', async () => {
  let calls = 0, turns = 0;
  const result = await runAgent(options({ model: async () => JSON.stringify(turns++ === 0 ? { type: 'tool', name: 'run_command', args: { command: 'echo forbidden' } } : { type: 'final', answer: 'Terminal unavailable' }), execute: async () => { calls++; } }));
  assert.equal(calls, 0); assert.equal(result.status, 'completed'); assert.match(result.events.find(e => e.type === 'observation').detail, /not available/);
});

test('invalid model formats stop after correction attempts', async () => {
  const result = await runAgent(options({ model: async () => 'I would use a tool' }));
  assert.equal(result.status, 'failed'); assert.match(result.answer, /three attempts/);
});

test('resuming retains prior observations without replaying tools', async () => {
  const run = initial(); run.status = 'paused'; run.transcript.push({ role: 'user', content: 'TOOL_OBSERVATION write_file: {"written":"report.md"}' });
  let calls = 0;
  const result = await runAgent(options({ run, model: async (_system, messages) => { assert.match(messages.at(-1).content, /written/); return JSON.stringify({ type: 'final', answer: 'Prior report preserved' }); }, execute: async () => { calls++; } }));
  assert.equal(result.status, 'completed'); assert.equal(calls, 0);
});

test('context remains bounded and retains the goal', () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: i === 0 ? 'Original goal' : 'x'.repeat(20000) }));
  const result = contextWindow(messages); assert.equal(result.length, 17); assert.equal(result[0].content, 'Original goal'); assert.ok(result[1].content.length <= 14000);
});

test('calculator evaluates precedence and rejects code and invalid results', () => {
  assert.equal(calculate('(12+3)*4/2'), 30); assert.equal(calculate('2^3^2'), 512); assert.equal(calculate('-2^2'), -4); assert.equal(calculate('2^-2'), .25);
  for (const input of ['process.exit()', '1/0', '1+','()','2;fetch()']) assert.throws(() => calculate(input));
});

test('workspace names reject traversal and record size is bounded', () => {
  assert.equal(safePath('reports/summary.md'), 'reports/summary.md');
  for (const input of ['../outside','/absolute','a/../b','C:\\windows','a//b']) assert.throws(() => safePath(input));
  assert.throws(() => validateRecord({ id: 'file:x', kind: 'file', name: 'x', content: 'a'.repeat(200001) }));
});

test('public fetching rejects private-looking URLs and credentials', () => {
  for (const url of ['http://example.org','https://127.0.0.1','https://a.internal','https://name:pass@example.org','https://[::1]','https://example.org:444']) assert.throws(() => publicHttps(url));
  assert.equal(publicHttps('https://example.org/api').hostname, 'example.org');
});

test('agent prompt advertises only tools available to this runtime', () => {
  assert.doesNotMatch(agentSystem('persona', capabilities, ''), /run_command:/);
  assert.match(agentSystem('persona', { runtime: 'local', terminalEnabled: true }, 'likes concise reports'), /run_command:/);
  assert.throws(() => parseAction('{"type":"tool","name":"calculate","args":[]}'));
});

test('the same Nova runtime can answer directly without planning or using tools', async () => {
  let toolCalls = 0;
  const prompt = agentSystem('Be friendly', capabilities, 'The user likes concise answers');
  assert.match(prompt, /one conversational assistant/i);
  assert.match(prompt, /return a final answer directly/);
  const result = await runAgent(options({ system: prompt, run: { ...initial(), goal: 'Hello', chatId: 'chat-one', messageId: 'reply-one' }, model: async () => JSON.stringify({ type: 'final', answer: 'Hello! How can I help?' }), execute: async () => { toolCalls++; } }));
  assert.equal(result.status, 'completed'); assert.equal(result.answer, 'Hello! How can I help?'); assert.equal(result.plan.length, 0); assert.equal(toolCalls, 0); assert.equal(result.chatId, 'chat-one'); assert.equal(result.messageId, 'reply-one');
});
