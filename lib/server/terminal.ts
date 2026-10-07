import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export function sandboxArgs(command: string, workspace: string, name: string) {
 const image=process.env.NOVA_SANDBOX_IMAGE||'node:22-bookworm-slim';
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,220}$/.test(image))throw new Error('Invalid sandbox image.');
 if(!command.trim()||command.length>8000)throw new Error('Command must contain 1–8000 characters.');
 if(!path.isAbsolute(workspace)||/[\r\n,]/.test(workspace)||workspace===path.parse(workspace).root||workspace===os.homedir())throw new Error('Select a dedicated workspace directory, not a system root or home directory.');
 const uid=process.getuid?.()||1000,gid=process.getgid?.()||1000;
 return ['run','--rm','--pull','never','--name',name,'--init','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges=true','--pids-limit','64','--memory','512m','--memory-swap','512m','--cpus','1','--user',`${uid}:${gid}`,'--tmpfs','/tmp:rw,noexec,nosuid,size=64m,mode=1777','--mount',`type=bind,src=${workspace},dst=/workspace`,'--workdir','/workspace','--env','HOME=/tmp',image,'/bin/sh','-c',command];
}
/** Fail closed: there is no host-shell execution path. The command is an argv value to Docker. */
export async function runCommand(command: string, cwd: string, signal: AbortSignal, timeoutMs=30000) {
 signal.throwIfAborted();const workspace=await realpath(cwd),name='nova-'+crypto.randomUUID();const args=sandboxArgs(command,workspace,name);
 return new Promise<{stdout:string;stderr:string;exitCode:number|null;timedOut:boolean;truncated:boolean;sandbox:string}>((resolve,reject)=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:'production'};for(const key of ['PATH','HOME','SystemRoot','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG'])if(process.env[key])env[key]=process.env[key];
  const child=spawn('docker',args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false,truncated=false,stopping=false;
  const append=(target:'stdout'|'stderr',value:Buffer)=>{const prior=target==='stdout'?stdout:stderr;const next=(prior+value.toString()).slice(0,32000);if(prior.length+value.length>32000)truncated=true;if(target==='stdout')stdout=next;else stderr=next;};
  child.stdout.on('data',data=>append('stdout',data));child.stderr.on('data',data=>append('stderr',data));
  let cleanupTask:Promise<void>|undefined;
  const stop=()=>{if(stopping)return;stopping=true;cleanupTask=new Promise(done=>{const cleanup=spawn('docker',['rm','--force',name],{env,stdio:'ignore'});const bound=setTimeout(()=>{cleanup.kill('SIGKILL');child.kill('SIGKILL');done();},5000);const finish=()=>{clearTimeout(bound);child.kill('SIGKILL');done();};cleanup.once('error',finish);cleanup.once('close',finish);});};
  const abort=()=>stop();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>{timedOut=true;stop();},Math.min(30000,Math.max(1,timeoutMs)));
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  child.once('error',error=>{cleanup();reject(new Error('Docker sandbox unavailable. Install/start Docker and pre-pull the sandbox image. Host execution is disabled. '+(error as NodeJS.ErrnoException).code));});
  child.once('close',async code=>{cleanup();if(cleanupTask)await cleanupTask;if(signal.aborted)reject(new DOMException('Sandbox command cancelled','AbortError'));else resolve({stdout,stderr,exitCode:code,timedOut,truncated,sandbox:'docker'});});
  if(signal.aborted)stop();
 });
}
