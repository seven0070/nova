import { localRequest } from '../../../lib/server/local-workspace';
import { sameOrigin } from '../../../lib/agent/http';
import { jobState, mutateJobs, newJob } from '../../../lib/server/jobs';
export const runtime = 'nodejs';
export async function GET(req: Request) {
 if (!localRequest(req)) return Response.json({error:'Localhost required'}, {status:403});
 try { const state = await jobState(); return Response.json({ ...state, available: true, workerOnline: Date.now() - state.heartbeat < 15000, configured: !!process.env.NOVA_MODEL_BASE && !!process.env.NOVA_MODEL, webhookConfigured: !!state.webhookConfigured }); } catch (e) { return Response.json({ error: (e as Error).message }, {status:500}); }
}
export async function POST(req: Request) {
 if (!localRequest(req) || !sameOrigin(req, true)) return Response.json({error:'Local same-origin request required'}, {status:403});
 try { const input = await req.json();
 const job = await mutateJobs(state => { if (input.action === 'create') { if (state.jobs.length >= 100) throw new Error('Delete old jobs before adding more.'); const created = newJob(input); state.jobs.push(created); return created; }
 const found = state.jobs.find(j => j.id === input.id); if (!found) throw new Error('Job not found');
 if (input.action === 'stop') { found.enabled = false; found.status = 'paused'; }
 else if (input.action === 'resume') { if (found.status === 'running' || (state.activeJobId === found.id && Date.now() - state.heartbeat < 15000)) throw new Error('Job already running'); found.enabled = true; found.status = 'queued'; found.nextAt = Date.now(); }
 else if (input.action === 'delete') { if (found.status === 'running' || (state.activeJobId === found.id && Date.now() - state.heartbeat < 15000)) throw new Error('Wait for the worker to stop this job first'); state.jobs = state.jobs.filter(j => j.id !== found.id); }
 else throw new Error('Unknown action'); found.updatedAt = Date.now(); return found; });
 return Response.json({ job }); } catch (e) { return Response.json({error:(e as Error).message},{status:400}); }
}
