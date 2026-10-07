import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fakeDocker } from './fake-docker.mjs';
import { loadTs } from './load-ts.mjs';
const { runAgent } = await loadTs('../lib/agent/engine.ts');
const { POST: provider } = await loadTs('../app/api/provider/route.ts');
const { readModelStream } = await loadTs('../lib/agent/stream.ts');
const workspace = await loadTs('../lib/server/local-workspace.ts');
const {issueApproval}=await loadTs('../lib/server/approvals.ts');
const { POST: terminal } = await loadTs('../app/api/terminal/route.ts');

test('model relay drives tools, corrects a failed read, persists notes, and finishes a real file', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'nova-integration-'));
  process.env.NOVA_STATE_DIR = path.join(folder, 'state'); process.env.NOVA_WORKSPACE_DIR = path.join(folder, 'workspace');
  const original = globalThis.fetch;
  const actions = [
    { type: 'plan', steps: ['Inspect file', 'Create report', 'Save learning'] },
    { type: 'tool', name: 'read_file', args: { path: 'report.md' } },
    { type: 'tool', name: 'write_file', args: { path: 'report.md', content: '# Report\nCreated by an actual tool.' } },
    { type: 'tool', name: 'save_memory', args: { title: 'Report preference', content: 'Use markdown reports' } },
    { type: 'final', answer: 'Created report.md and remembered the markdown preference.' },
  ];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (actions.length === 2) assert.match(body.messages.at(-1).content, /written/);
    const content = JSON.stringify(actions.shift());
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n');
  };
  let final;
  try {
    final = await runAgent({
      run: { id: 'run-test', goal: 'Create a report', status: 'running', plan: [], events: [], transcript: [{ role: 'user', content: 'Create a report' }], answer: '', updatedAt: Date.now() },
      capabilities: { runtime: 'local', terminalEnabled: false }, maxSteps: 12, signal: new AbortController().signal, system: 'Agent test', update: () => {},
      model: async (system, messages) => {
        const response = await provider(new Request('http://localhost:3000/api/provider', { method: 'POST', headers: { host:'localhost:3000',origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify({ base: 'https://api.provider.dev/v1', key: 'integration-key', model: 'model', protocol: 'openai', action: 'agent_stream', system, messages }) }));
        assert.equal(response.status, 200); return readModelStream(response, new AbortController().signal, () => {});
      },
      execute: async call => {
        if (call.name === 'read_file') { const file = (await workspace.listRecords()).records.find(r => r.name === call.args.path); if (!file) throw new Error('File not found'); return { content: file.content }; }
        if (call.name === 'write_file') { await workspace.saveRecord({ id: 'file:' + call.args.path, kind: 'file', name: call.args.path, content: call.args.content, updatedAt: Date.now() }); return { written: call.args.path }; }
        if (call.name === 'save_memory') { await workspace.saveRecord({ id: 'memory:preference', kind: 'memory', name: call.args.title, content: call.args.content, updatedAt: Date.now() }); return { saved: call.args.title }; }
      },
    });
    assert.equal(final.status, 'completed'); assert.match(final.events.find(e => e.type === 'observation').detail, /File not found/);
    assert.match(await readFile(path.join(folder, 'workspace/report.md'), 'utf8'), /actual tool/);
    const state = await readFile(path.join(folder, 'state/state.json'), 'utf8'); assert.match(state, /Use markdown/); assert.doesNotMatch(state, /integration-key/);
  } finally { globalThis.fetch = original; delete process.env.NOVA_STATE_DIR; delete process.env.NOVA_WORKSPACE_DIR; await rm(folder, { recursive: true, force: true }); }
});

test('terminal route requires enablement, local origin, and explicit approval', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'nova-terminal-route-'));
  process.env.NOVA_STATE_DIR=path.join(folder,'state');process.env.NOVA_WORKSPACE_DIR = path.join(folder,'workspace');const originalPath=process.env.PATH;process.env.PATH=(await fakeDocker(folder))+path.delimiter+originalPath;
  let receipt;const request = (approved, origin = 'http://127.0.0.1:3000', host = '127.0.0.1:3000') => new Request('http://127.0.0.1:3000/api/terminal', { method: 'POST', headers: { host, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'printf approved-test', approved,receipt }) });
  try {
    delete process.env.NOVA_ENABLE_TERMINAL; assert.equal((await terminal(request(true))).status, 403);
    process.env.NOVA_ENABLE_TERMINAL = '1'; assert.equal((await terminal(request(false))).status, 403); assert.equal((await terminal(request(true, 'https://other.test'))).status, 403); assert.equal((await terminal(request(true, 'http://other.test', 'other.test'))).status, 403);
    receipt=await issueApproval({type:'command',target:'printf approved-test'});
    const response = await terminal(request(true)); assert.equal(response.status, 200); assert.equal((await response.json()).stdout, 'approved-test');
  } finally { process.env.PATH=originalPath;delete process.env.NOVA_ENABLE_TERMINAL; delete process.env.NOVA_STATE_DIR;delete process.env.NOVA_WORKSPACE_DIR; await rm(folder, { recursive: true, force: true }); }
});
