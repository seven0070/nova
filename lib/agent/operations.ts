import type { ToolCall } from './types';
export type PermissionLevel='read'|'workspace'|'operator';
export const ranks:Record<PermissionLevel,number>={read:0,workspace:1,operator:2};
export function requiredLevel(call:ToolCall):PermissionLevel{return call.name==='github'&&!['repos','branches','read','diff'].includes(String(call.args.action))?'workspace':['run_command','browser_task','desktop_task'].includes(call.name)?'operator':['apply_patch','write_file','delete_file','save_memory','save_skill','mcp_call','schedule_task'].includes(call.name)?'workspace':'read';}
export function checkPermission(call:ToolCall,level:PermissionLevel){if(!Object.hasOwn(ranks,level)||ranks[level]<ranks[requiredLevel(call)])throw new Error('Permission level '+level+' does not allow '+call.name);}
export function sensitive(call:ToolCall){return ['browser_task','desktop_task','mcp_call','schedule_task'].includes(call.name)||(call.name==='github'&&!['repos','branches','read','diff'].includes(String(call.args.action)))||call.name==='delete_file'||call.name==='run_command'||(call.name==='write_file'&&['soul.md','user.md'].includes(String(call.args.path)));}
export function redact(value:unknown,secrets:string[]=[]):unknown{
 if(typeof value==='string'){let text=value;for(const secret of secrets.filter(Boolean))text=text.split(secret).join('[REDACTED]');return text.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9]{12,})\b/g,'[REDACTED]').replace(/((?:api[_ -]?key|password|secret|token)\s*[:=]\s*)[^\s,;"']+/gi,'$1[REDACTED]');}
 if(Array.isArray(value))return value.map(item=>redact(item,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/^(authorization|api[_-]?key|key|password|secret|token|credential)$/i.test(k)?'[REDACTED]':redact(v,secrets)]));
 return value;
}
export async function fingerprint(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export const PROMPT_VERSION='nova.core/0.8.0';
export type AuditEntry={id:string;runId:string;segmentId?:string;seq:number;time:number;type:string;promptVersion:string;previousHash:string;hash:string;data:unknown};
export type ModelReply={text:string;usage?:Record<string,number>;model?:string};
export function toolFailed(value:unknown):boolean{return !!value&&typeof value==='object'&&('error' in value||('isError' in value&&(value as any).isError===true)||('denied' in value&&(value as any).denied)||('exitCode' in value&&(value as any).exitCode!==0)||('timedOut' in value&&(value as any).timedOut)||('stopped' in value&&(value as any).stopped));}
export class CircuitOpen extends Error{constructor(public key:string){super('Circuit breaker opened after three failures of '+key+'. Inspect the audit, change the approach or provider, then explicitly resume.');this.name='CircuitOpen';}}
export class CircuitBreaker{
 private counts=new Map<string,number>();
 check(key:string){if((this.counts.get(key)||0)>=3)throw new CircuitOpen(key);}
 fail(key:string){const count=(this.counts.get(key)||0)+1;this.counts.set(key,count);if(count>=3)throw new CircuitOpen(key);}
 success(key:string){this.counts.delete(key);}
}
