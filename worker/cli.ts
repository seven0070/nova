import {speechFile} from './speech';
import {sessionMessages,appendSession} from '../lib/server/sessions';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { localCore } from './adapters';
import { providerUrl } from './provider';
import type { AgentRun } from '../lib/agent/types';
async function main(){
 if(!process.env.NOVA_MODEL_BASE||!process.env.NOVA_MODEL)throw new Error('Configure .env.worker before using the CLI.');providerUrl();
 const input=createInterface({input:stdin,output:stdout});const args=process.argv.slice(2);let sessionId:string|undefined;const index=args.indexOf('--session');if(index>=0){sessionId=args[index+1];if(!sessionId)throw new Error('Provide a session ID');args.splice(index,2);}const voiceIndex=args.indexOf('--voice');let voicePath:string|undefined;if(voiceIndex>=0){voicePath=args[voiceIndex+1];if(!voicePath)throw new Error('Provide an audio path');args.splice(voiceIndex,2);}let goal=voicePath?await speechFile(voicePath,AbortSignal.timeout(90000)):args.join(' ');if(!goal)goal=await input.question('You: ');
 if(!goal.trim()){input.close();return;}
 const abort=new AbortController();process.on('SIGINT',()=>abort.abort());
 const core=localCore({},async(call,signal)=>{signal.throwIfAborted();if(!stdin.isTTY)throw new Error('Interactive terminal approval required');stdout.write('\nSensitive action: '+call.name+' '+JSON.stringify(call.args)+'\n');return (await input.question('Approve? [yes/no] ')).trim().toLowerCase()==='yes';});
 const run:AgentRun={id:crypto.randomUUID(),goal,status:'running',plan:[],events:[],transcript:[...(sessionId?await sessionMessages(sessionId):[]),{role:'user',content:goal}],answer:'',updatedAt:Date.now()};
 try{const result=await core.run({run,persona:process.env.NOVA_SYSTEM_PROMPT||'',maxSteps:12,signal:abort.signal,update:next=>{const last=next.events.at(-1);if(last?.type==='action')stdout.write('Tool: '+last.title+'\n');}});if(sessionId&&result.status==='completed')await appendSession(sessionId,goal,result.answer);stdout.write('\nNova: '+result.answer+'\n');if(result.status!=='completed')process.exitCode=1;}finally{input.close();}
}
void main().catch(e=>{console.error((e as Error).message);process.exitCode=1;});
