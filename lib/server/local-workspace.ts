import { mkdir, readFile, writeFile, rename, readdir, lstat, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { withLock } from './lock';
import type { WorkspaceRecord } from '../agent/types';
import { safePath } from '../agent/records';
const stateFolder = () => path.resolve(process.env.NOVA_STATE_DIR || '.nova');
export async function workspaceRoot() { const dir = path.resolve(process.env.NOVA_WORKSPACE_DIR || '.nova/workspace'); await mkdir(dir, { recursive: true }); return realpath(dir); }
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> { const locked = () => withLock('workspace', fn); const next = pending.then(locked, locked); pending = next.catch(() => {}); return next; }
export async function filePath(name: string, createParents = false) {
  safePath(name);
  const root = await workspaceRoot();
  let current = root;
  const parts = name.split('/');
  if (parts.some(p => ['.git','node_modules','.nova'].includes(p)) || /(^|\/)\.env(?:\.|$)/.test(name) || /\.(pem|key)$/.test(name)) throw new Error('This path is reserved or may contain secrets.');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try { const info = await lstat(current); if (info.isSymbolicLink()) throw new Error('Symlink paths are not supported.'); if (i < parts.length - 1 && !info.isDirectory()) throw new Error('Parent path is not a directory.'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; if (i < parts.length - 1) { if (!createParents) throw e; await mkdir(current); } }
  }
  return current;
}
async function stateRecords(): Promise<WorkspaceRecord[]> {
  try { return JSON.parse(await readFile(path.join(stateFolder(), 'state.json'), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('Local state could not be read; inspect .nova/state.json before changing it.'); }
}
async function writeState(records: WorkspaceRecord[]) {
  const folder = stateFolder(); await mkdir(folder, { recursive: true });
  const tmp = path.join(folder, `state.${crypto.randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(records), { mode: 0o600 }); await rename(tmp, path.join(folder, 'state.json'));
}
export async function listRecords() {
  await pending;
  const records = await stateRecords(); const root = await workspaceRoot(); let budget = 3000000, count = 0, truncated = false;
  async function scan(dir: string, prefix = '', depth = 0) {
    if (depth > 8) { truncated = true; return; }
    const entries = await readdir(dir, { withFileTypes: true });
    for (const item of entries) {
      if (count >= 200 || budget <= 0) { truncated = true; break; }
      if (item.isSymbolicLink() || ['.git','node_modules','.nova','.next'].includes(item.name) || item.name.startsWith('.env') || /\.(pem|key)$/.test(item.name)) continue;
      const name = prefix + item.name, location = path.join(dir, item.name);
      if (item.isDirectory()) { await scan(location, name + '/', depth + 1); continue; }
      if (!item.isFile()) continue;
      const stat = await lstat(location); if (stat.size > 200000 || stat.size > budget) { truncated = true; continue; }
      const bytes = await readFile(location); if (bytes.includes(0)) continue;
      const content = bytes.toString('utf8'); records.push({ id: 'file:' + name, kind: 'file', name, content, updatedAt: stat.mtimeMs }); budget -= bytes.length; count++;
    }
  }
  await scan(root);
  return { records, truncated };
}
export async function saveRecord(record: WorkspaceRecord): Promise<WorkspaceRecord> {
  return serial(async () => {
    if (record.kind === 'file') {
      const location = await filePath(record.name, true); await writeFile(location, record.content, 'utf8');
      return { ...record, id: 'file:' + record.name };
    }
    const records = await stateRecords(); await writeState([...records.filter(r => r.id !== record.id), record]); return record;
  });
}
export async function deleteRecord(id: string) {
  return serial(async () => {
    if (id.startsWith('file:')) { await unlink(await filePath(id.slice(5))); return; }
    await writeState((await stateRecords()).filter(r => r.id !== id));
  });
}
export function localRequest(request: Request) {
  try { const host = new URL('http://' + request.headers.get('host')).hostname; return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'; } catch { return false; }
}
