import {parseSchedule,nextOccurrence,type Schedule} from '../agent/schedule';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { stateDir, withLock } from './lock';
export const jobTools = ['delegate','list_files','read_file','write_file','search_memory','save_memory','fetch_url','calculate','save_skill','run_skill'];
export type Job = { id: string; requestId?: string; sessionId?: string; reply?: {channel:string;target:string}; schedule?: Schedule; goal: string; enabled: boolean; status: 'queued'|'running'|'completed'|'failed'|'paused'; intervalMinutes: number; nextAt: number; maxSteps: number; allowedTools: string[]; commands: string[]; notify: boolean; runId?: string; result?: string; updatedAt: number };
export type JobState = { jobs: Job[]; heartbeat: number; activeJobId?: string; webhookConfigured?: boolean };
async function load(): Promise<JobState> { try { return JSON.parse(await readFile(path.join(stateDir(), 'jobs.json'), 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { jobs: [], heartbeat: 0 }; throw e; } }
export async function jobState() { return load(); }
export async function mutateJobs<T>(fn: (state: JobState) => T): Promise<T> { return withLock('jobs', async () => { const state = await load(); const result = fn(state); const tmp = path.join(stateDir(), 'jobs.' + crypto.randomUUID() + '.tmp'); await writeFile(tmp, JSON.stringify(state), { mode: 0o600 }); await rename(tmp, path.join(stateDir(), 'jobs.json')); return result; }); }
export function newJob(input: any): Job {
  if (typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 10000) throw new Error('Enter a goal under 10,000 characters.');
  const interval = Number(input.intervalMinutes || 0), maxSteps = Number(input.maxSteps || 12);
  if (!Number.isInteger(interval) || (interval !== 0 && (interval < 5 || interval > 525600)) || !Number.isInteger(maxSteps) || maxSteps < 2 || maxSteps > 40) throw new Error('Invalid interval or step budget.');
  const allowedTools = input.allowedTools;
  if (!Array.isArray(allowedTools) || allowedTools.some(t => !jobTools.includes(t))) throw new Error('Invalid tool permissions.');
  const commands = input.commands || [];
  if (!Array.isArray(commands) || commands.length > 10 || commands.some(c => typeof c !== 'string' || !c.trim() || c.length > 8000)) throw new Error('Commands must be exact strings (maximum 10).');
  const schedule=input.scheduleText?parseSchedule(String(input.scheduleText),String(input.timezone||'UTC')):undefined;
  return { schedule, id: crypto.randomUUID(), goal: input.goal.trim(), enabled: true, status: 'queued', intervalMinutes: interval, nextAt: schedule?nextOccurrence(schedule):Date.now(), maxSteps, allowedTools, commands, notify: input.notify === true, updatedAt: Date.now() };
}
