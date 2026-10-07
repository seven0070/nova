import {tick} from '../lib/server/tasks';
import {sessionMessages,appendSession} from '../lib/server/sessions';
import {nextOccurrence} from '../lib/agent/schedule';
import { open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { localCore } from './adapters';
import { providerUrl } from './provider';
import { publicHttps } from '../lib/agent/http';
import type { AgentRun } from '../lib/agent/types';
import { stateDir } from '../lib/server/lock';
import { jobState, mutateJobs, type Job } from '../lib/server/jobs';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function runJob(job: Job, signal: AbortSignal) {
 const run: AgentRun={id:crypto.randomUUID(),goal:job.goal,status:'running',plan:[],events:[],transcript:[...(job.sessionId?await sessionMessages(job.sessionId):[]),{role:'user',content:job.goal}],answer:'',updatedAt:Date.now()};
 await mutateJobs(state=>{ const found=state.jobs.find(j=>j.id===job.id); if(found) found.runId=run.id; });
 const core=localCore({allowedTools:[...job.allowedTools,...(job.commands.length?['run_command']:[])],commands:job.commands,immutableFiles:['soul.md','user.md']});
 const result=await core.run({run,persona:process.env.NOVA_SYSTEM_PROMPT||'',maxSteps:job.maxSteps,signal,update:()=>{}});
 if(job.sessionId && result.status==='completed')await appendSession(job.sessionId,job.goal,result.answer);
 await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(!found)return;found.status=signal.aborted?'paused':result.status==='completed'?'completed':'failed';found.result=result.answer.slice(0,10000);found.updatedAt=Date.now();if(!signal.aborted&&result.status==='completed'&&(job.intervalMinutes||job.schedule)){found.status='queued';found.nextAt=job.schedule?nextOccurrence(job.schedule):Date.now()+job.intervalMinutes*60000;}else found.enabled=false;});
 if(job.reply?.channel==='telegram'&&process.env.NOVA_TELEGRAM_TOKEN&&!signal.aborted){try{const response=await fetch('https://api.telegram.org/bot'+process.env.NOVA_TELEGRAM_TOKEN+'/sendMessage',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:job.reply.target,text:result.answer.slice(0,4000)||result.status})});const delivery=await response.json();if(!response.ok||!delivery.ok)throw new Error('Telegram notification failed: HTTP '+response.status);}catch(e){await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(found)found.result=(found.result||'')+'\n'+(e as Error).message;});}}
 if(job.notify&&process.env.NOVA_NOTIFY_WEBHOOK&&!signal.aborted){ try { const url=publicHttps(process.env.NOVA_NOTIFY_WEBHOOK); const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(process.env.NOVA_NOTIFY_TOKEN?{Authorization:'Bearer '+process.env.NOVA_NOTIFY_TOKEN}:{})},body:JSON.stringify({jobId:job.id,runId:run.id,status:result.status,answer:result.answer})});if(!response.ok)await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(found)found.result=(found.result||'')+'\nNotification failed: HTTP '+response.status;}); } catch(e) { await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(found)found.result=(found.result||'')+'\nNotification failed: '+(e as Error).message;}); } }
}
async function main(){
 if(process.env.NOVA_MODEL_BASE&&process.env.NOVA_MODEL)providerUrl();
 await mutateJobs(()=>{});
 const lockPath=path.join(stateDir(),'worker.pid');let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const pid=Number(await readFile(lockPath,'utf8'));try{process.kill(pid,0);throw new Error('A Nova worker is already running.');}catch(err){if((err as NodeJS.ErrnoException).code!=='ESRCH')throw err;}await unlink(lockPath);lock=await open(lockPath,'wx',0o600);}
 await lock.writeFile(String(process.pid));
 let shutdown=false,active:AbortController|undefined; const stop=()=>{shutdown=true;active?.abort();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 await mutateJobs(state=>{state.activeJobId=undefined;state.webhookConfigured=!!process.env.NOVA_NOTIFY_WEBHOOK;for(const job of state.jobs)if(job.status==='running'){job.status='paused';job.enabled=false;job.result='Worker interrupted. Inspect saved activity before resuming.';}});
 console.log('Nova worker ready. Waiting for permitted jobs.');
 try{while(!shutdown){active=new AbortController();await tick('local',undefined,active.signal);active=undefined;if(shutdown)break;await mutateJobs(state=>{state.heartbeat=Date.now();});const job=(await jobState()).jobs.find(j=>j.enabled&&j.status==='queued'&&j.nextAt<=Date.now());if(!job){await sleep(1000);continue;}
 const claimed=await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(!found?.enabled||found.status!=='queued')return false;found.status='running';state.activeJobId=found.id;return true;});if(!claimed)continue;active=new AbortController();const abort=active;
 const monitor=setInterval(()=>{void mutateJobs(state=>{state.heartbeat=Date.now();const found=state.jobs.find(j=>j.id===job.id);if(!found?.enabled || found.status !== 'running')abort.abort();}).catch(()=>abort.abort());},1000);
 try{await runJob(job,abort.signal);}catch(e){await mutateJobs(state=>{const found=state.jobs.find(j=>j.id===job.id);if(found){found.enabled=false;found.status=abort.signal.aborted?'paused':'failed';found.result=(e as Error).message;}});}finally{clearInterval(monitor);active=undefined;await mutateJobs(state=>{state.activeJobId=undefined;});}
 }}finally{await mutateJobs(state=>{state.heartbeat=0;});await lock.close();await unlink(lockPath).catch(()=>{});}
}
void main().catch(e=>{console.error((e as Error).message);process.exitCode=1;});
