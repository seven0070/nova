import type { ToolCall, WorkspaceRecord } from './types';
import { fingerprint } from './operations';
/** Capture only successful read-only workflows. No concrete task values or outputs are persisted. */
export async function synthesize(calls: ToolCall[], records: WorkspaceRecord[], runId: string) {
 const safe = new Set(['list_files','read_file','search_memory','fetch_url','calculate','search_documents','search_history','search_web']);
 if(calls.length < 3 || calls.length > 12 || calls.some(c=>!safe.has(c.name))) return [];
 const parameters: string[]=[];
 const steps=calls.map((c,i)=>({name:c.name,args:Object.fromEntries(Object.entries(c.args).map(([k,v])=>{if(typeof v!=='string')throw new Error('Cannot parameterize workflow');const parameter=`step${i+1}_${k}`;parameters.push(parameter);return [k,'{{'+parameter+'}}'];}))}));
 const signature=(await fingerprint(steps)).slice(0,16), name='learned-'+signature;
 const file='skills/'+name+'.json', previous=records.find(r=>r.name===file);
 let evidence=0; if(previous){try{evidence=JSON.parse(previous.content).evidenceCount||0;}catch{}}
 const skill={name,description:'Verified read-only workflow: '+calls.map(c=>c.name).join(' → '),parameters,steps,version:1,evidenceCount:evidence+1,lastRunId:runId};
 const markdown=`---\nname: ${name}\nversion: 1\nevidence_count: ${evidence+1}\n---\n# ${name}\n\n${skill.description}\n\n## Inputs\n${parameters.map(k=>'- '+k).join('\n')||'None'}\n\n## Procedure\n${steps.map((s,i)=>`${i+1}. Run ${s.name} with ${JSON.stringify(s.args)}; inspect the observation before continuing.`).join('\n')}\n\n## Boundaries\nRead-only tools. Supply fresh parameters; no task secrets or outputs are stored. Tool permissions and circuit breakers still apply. Successful completion is evidence of execution, not independent certification of the answer.\n\n## Evidence\nLatest completed run: ${runId}. Verified executions: ${evidence+1}.\n`;
 const make=(name:string,content:string):WorkspaceRecord=>({id:'file:'+name,kind:'file',name,content,updatedAt:Date.now()});
 return [make(file,JSON.stringify(skill,null,2)),make('skills/'+name+'/SKILL.md',markdown),...(!previous?[make('skills/'+name+'/versions/v1.SKILL.md',markdown)]:[])];
}
