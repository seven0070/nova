import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadTs} from './load-ts.mjs';
const {POST,GET}=await loadTs('../app/api/jobs/route.ts');
const {mutateJobs}=await loadTs('../lib/server/jobs.ts');
function req(body,origin='http://localhost:3000'){return new Request('http://localhost:3000/api/jobs',{method:'POST',headers:{host:'localhost:3000',...(origin?{origin}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});}
test('job gateway validates local origin, stores explicit permissions and prevents restart of an active stopped run',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'nova-jobs-'));process.env.NOVA_STATE_DIR=folder;
 try{
 assert.equal((await POST(req({action:'create'},'http://other.test'))).status,403);assert.equal((await POST(req({action:'create'},''))).status,403);
 const response=await POST(req({action:'create',goal:'Read a file',allowedTools:['read_file'],commands:[],notify:false}));assert.equal(response.status,200);const {job}=await response.json();assert.deepEqual(job.allowedTools,['read_file']);
 await mutateJobs(state=>{state.activeJobId=job.id;state.heartbeat=Date.now();state.jobs[0].status='running';});
 assert.equal((await POST(req({action:'stop',id:job.id}))).status,200);assert.equal((await POST(req({action:'resume',id:job.id}))).status,400);assert.equal((await POST(req({action:'delete',id:job.id}))).status,400);
 await mutateJobs(state=>{state.activeJobId=undefined;});assert.equal((await POST(req({action:'resume',id:job.id}))).status,200);
 const data=await (await GET(new Request('http://localhost:3000/api/jobs',{headers:{host:'localhost:3000'}}))).json();assert.equal(data.available,true);assert.equal(data.jobs[0].status,'queued');
 }finally{delete process.env.NOVA_STATE_DIR;await rm(folder,{recursive:true,force:true});}
});
