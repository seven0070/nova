import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fakeDocker } from './fake-docker.mjs';
import { loadTs } from './load-ts.mjs';
const workspace = await loadTs('../lib/server/local-workspace.ts');
const { runCommand } = await loadTs('../lib/server/terminal.ts');

test('files, durable memory, and task records persist independently', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'nova-test-'));
  process.env.NOVA_STATE_DIR = path.join(folder, 'state'); process.env.NOVA_WORKSPACE_DIR = path.join(folder, 'workspace');
  try {
    await workspace.saveRecord({ id: 'memory:test', kind: 'memory', name: 'Preference', content: 'Concise answers', updatedAt: 1 });
    await workspace.saveRecord({ id: 'file:reports/a.md', kind: 'file', name: 'reports/a.md', content: 'A real file', updatedAt: 2 });
    await workspace.saveRecord({ id: 'run:task', kind: 'run', name: 'Task', content: '{"status":"paused"}', updatedAt: 3 });
    const { records } = await workspace.listRecords(); assert.equal(records.length, 3);
    assert.equal(await readFile(path.join(folder, 'workspace/reports/a.md'), 'utf8'), 'A real file');
    assert.match(await readFile(path.join(folder, 'state/state.json'), 'utf8'), /Concise answers/);
    await workspace.deleteRecord('memory:test'); assert.equal((await workspace.listRecords()).records.length, 2);
    await workspace.deleteRecord('file:reports/a.md'); assert.equal((await workspace.listRecords()).records.length, 1);
    await mkdir(path.join(folder, 'workspace'), { recursive: true }); await symlink(folder, path.join(folder, 'workspace/escape'));
    await assert.rejects(() => workspace.filePath('escape/outside.txt', true), /Symlink/);
    await assert.rejects(() => workspace.filePath('.env'), /reserved/);
  } finally { delete process.env.NOVA_STATE_DIR; delete process.env.NOVA_WORKSPACE_DIR; await rm(folder, { recursive: true, force: true }); }
});

test('Docker runner lifecycle handles output, failures, timeouts and abort with a fake Docker CLI', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'nova-terminal-'));
  const originalPath=process.env.PATH;process.env.PATH=(await fakeDocker(folder))+path.delimiter+originalPath;
  try {
    const result = await runCommand('printf nova-test', folder, new AbortController().signal);
    assert.equal(result.stdout, 'nova-test'); assert.equal(result.exitCode, 0);
    const failed = await runCommand('exit 7', folder, new AbortController().signal); assert.equal(failed.exitCode, 7);
    const timeout = await runCommand('sleep 5', folder, new AbortController().signal, 50); assert.equal(timeout.timedOut, true);
    const controller = new AbortController(); controller.abort(); await assert.rejects(() => runCommand('echo no', folder, controller.signal));
  } finally { process.env.PATH=originalPath;await rm(folder, { recursive: true, force: true }); }
});
