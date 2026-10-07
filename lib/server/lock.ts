import { mkdir, open, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
export const stateDir = () => path.resolve(process.env.NOVA_STATE_DIR || '.nova');
export async function withLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  await mkdir(stateDir(), { recursive: true }); const location = path.join(stateDir(), name + '.lock');
  let handle;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { handle = await open(location, 'wx', 0o600); break; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; try { if (Date.now() - (await stat(location)).mtimeMs > 120000) await unlink(location); } catch {} await new Promise(r => setTimeout(r, 25)); }
  }
  if (!handle) throw new Error('State is busy. Try again.');
  try { return await work(); } finally { await handle.close(); await unlink(location).catch(() => {}); }
}
