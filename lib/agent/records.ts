import type { WorkspaceRecord } from './types';
export function validateRecord(value: unknown): WorkspaceRecord {
  const r = value as WorkspaceRecord;
  if (!r || typeof r.id !== 'string' || r.id.length > 220 || !r.id || r.id.startsWith('approval:') || r.id.startsWith('audit:') || r.id.startsWith('sys:') || /[\x00-\x1f]/.test(r.id) || !['file','memory','run'].includes(r.kind) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200 || typeof r.content !== 'string') throw new Error('Invalid workspace record.');
  const limit = r.kind === 'file' ? 200000 : r.kind === 'memory' ? 25000 : 900000;
  if (r.content.length > limit) throw new Error(`Record exceeds the ${limit}-character limit.`);
  if (r.kind === 'file') safePath(r.name);
  return { id: r.id, kind: r.kind, name: r.name, content: r.content, updatedAt: Date.now() };
}
export function safePath(path: string): string {
  if (!path || path.length > 200 || path.startsWith('/') || /[\\:\x00-\x1f]/.test(path) || path.split('/').some(x => x === '..' || x === '.' || !x)) throw new Error('Use a relative workspace path without parent traversal.');
  return path;
}
