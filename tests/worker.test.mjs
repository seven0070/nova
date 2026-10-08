import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const jobs=require('../.worker/lib/server/jobs.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let n=0;n<120;n++){if(await check())return;await wait(100);}throw new Error('Timed out waiting for worker');}
test('durable worker runs without a browser, enforces skill permissions, records reflection and schedules recurrence',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'nova-worker-'));process.env.NOVA_STATE_DIR=path.join(folder,'state');const workspace=path.join(folder,'workspace');let child;
 const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const data=JSON.parse(body), messages=data.messages;const observations=messages.filter(m=>m.content.startsWith('TOOL_OBSERVATION'));const goal=messages.find(m=>m.role==='user').content;let action;
 if(goal==='create output'){action=observations.length?{type:'final',answer:'Created verified output.'}:{type:'tool',name:'write_file',args:{path:'result.txt',content:'real background output'}};}
 else if(goal==='run denied skill'){action=observations.length?{type:'final',answer:observations.at(-1).content.includes('not permitted')?'Permission denial observed.':'Unexpected permission'}:{type:'tool',name:'run_skill',args:{name:'restricted'}};}
 else action={type:'final',answer:'Recurring result'};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(action)}}]}));});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
 const config={allowedTools:['write_file'],commands:[],maxSteps:6};const first=jobs.newJob({...config,goal:'create output'}), denied=jobs.newJob({...config,goal:'run denied skill',allowedTools:['run_skill']}), repeat=jobs.newJob({...config,goal:'repeat',intervalMinutes:5});const interrupted=jobs.newJob({...config,goal:'interrupted'});interrupted.status='running';
 await jobs.mutateJobs(state=>{state.jobs.push(first,denied,repeat,interrupted);});
 const local=require('../.worker/lib/server/local-workspace.js');process.env.NOVA_WORKSPACE_DIR=workspace;await local.saveRecord({id:'file:skills/restricted.json',kind:'file',name:'skills/restricted.json',content:JSON.stringify({name:'restricted',description:'test',steps:[{name:'write_file',args:{path:'must-not-exist.txt',content:'no'}}]}),updatedAt:Date.now()});
 child=spawn(process.execPath,['.worker/worker/main.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,NOVA_WORKSPACE_DIR:workspace,NOVA_MODEL_BASE:`http://127.0.0.1:${server.address().port}/v1`,NOVA_MODEL:'mock',NOVA_MODEL_KEY:'test-secret',NOVA_ENABLE_TERMINAL:'0'},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);
 await until(async()=>{const state=await jobs.jobState();return state.jobs.find(j=>j.id===repeat.id)?.result;});
 const state=await jobs.jobState();assert.equal(state.jobs.find(j=>j.id===first.id).status,'completed');assert.match(state.jobs.find(j=>j.id===denied.id).result,/Permission denial/);assert.equal(state.jobs.find(j=>j.id===repeat.id).status,'queued');assert.ok(state.jobs.find(j=>j.id===repeat.id).nextAt>Date.now());assert.equal(state.jobs.find(j=>j.id===interrupted.id).status,'paused');assert.equal(await readFile(path.join(workspace,'result.txt'),'utf8'),'real background output');await assert.rejects(readFile(path.join(workspace,'must-not-exist.txt')));assert.match(await readFile(path.join(workspace,'memory.md'),'utf8'),/Tools used: write_file/);assert.doesNotMatch(await readFile(path.join(process.env.NOVA_STATE_DIR,'state.json'),'utf8'),/test-secret/);assert.equal(stderr,'');
 }finally{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await new Promise(r=>server.close(r));await rm(folder,{recursive:true,force:true});delete process.env.NOVA_STATE_DIR;delete process.env.NOVA_WORKSPACE_DIR;}
});
test('job validation rejects invented permissions and unsafe recurrence limits',()=>{assert.throws(()=>jobs.newJob({goal:'x',allowedTools:['send_email']}));assert.throws(()=>jobs.newJob({goal:'x',allowedTools:[],intervalMinutes:1}));});
