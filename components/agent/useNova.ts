'use client';
import { useEffect, useRef, useState } from 'react';
import type { AgentMessage, AgentRun, Capabilities, ProviderConfig, WorkspaceRecord } from '../../lib/agent/types';
import type { ToolCall } from '../../lib/agent/types';
import { NovaCore } from '../../lib/agent/core';
import { readModelStream } from '../../lib/agent/stream';
export async function workspaceApi(path: string, options?: RequestInit) {
  const response = await fetch(path, options); const data = await response.json() as any;
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { status: response.status });
  return data;
}
export function workspacePost(path: string, body: unknown, signal?: AbortSignal) {
  return workspaceApi(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
}
export type TurnOptions = { goal: string; context: AgentMessage[]; chatId: string; messageId: string; resume?: AgentRun; onUpdate: (run: AgentRun) => void; onPreview: (answer: string) => void };
export default function useNova(config: ProviderConfig) {
  const [records, setRecords] = useState<WorkspaceRecord[]>([]), [capabilities, setCapabilities] = useState<Capabilities>({ runtime: 'web', terminalEnabled: false });
  const [loaded, setLoaded] = useState(false), [storageError, setStorageError] = useState(''), [running, setRunning] = useState(false), [steps, setSteps] = useState(12), [latest, setLatest] = useState<AgentRun | null>(null);
  const [approval, setApproval] = useState<{ command: string; resolve: (allowed: boolean) => void } | null>(null);
  const controller = useRef<AbortController | null>(null), queue = useRef<Promise<void>>(Promise.resolve());
  async function refresh(signal?: AbortSignal) {
    try { let warning='';try{await workspacePost('/api/device-hub',{action:'pull'},signal);}catch(e){warning='Device sync: '+(e as Error).message;}const data = await workspaceApi('/api/workspace', { signal }); setRecords(data.records); setCapabilities(data.capabilities); setLoaded(true); setStorageError(warning); return data as { records: WorkspaceRecord[]; capabilities: Capabilities; truncated?: boolean }; }
    catch (e) { if (!signal?.aborted) { setStorageError((e as Error).message); setLoaded(false); } throw e; }
  }
  useEffect(() => { void refresh().catch(() => {}); return () => controller.current?.abort(); }, []);
  async function saveRecord(record: WorkspaceRecord, signal?: AbortSignal) {
    let receipt: string|undefined;if(record.kind==='file'&&['soul.md','user.md'].includes(record.name)) receipt=(await workspacePost('/api/approvals',{action:{type:'profile',target:JSON.stringify({path:record.name,content:record.content})},confirmed:true},signal)).receipt;
    const data = await workspacePost('/api/workspace', {...record,receipt}, signal); setRecords(current => [...current.filter(r => r.id !== data.record.id), data.record]); return data.record as WorkspaceRecord;
  }
  async function remove(record: WorkspaceRecord) {
    const {receipt}=await workspacePost('/api/approvals',{action:{type:'delete',target:record.id},confirmed:true});
    await workspaceApi('/api/workspace', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id,receipt }) }); setRecords(r => r.filter(x => x.id !== record.id));
  }
  function findRun(id?: string): AgentRun | undefined {
    if (!id) return; if (latest?.id === id) return latest;
    const entry = records.find(r => r.id === 'run:' + id); if (!entry) return;
    try { const run = JSON.parse(entry.content) as AgentRun; return run.status === 'running' ? { ...run, status: 'paused', answer: 'This response was interrupted. Resume to continue from saved observations.' } : run; } catch { return; }
  }
  async function approve(call:ToolCall, signal: AbortSignal) {
      const command=call.name==='run_command'?String(call.args.command):call.name+' '+JSON.stringify(call.args,null,2);
      const allowed = await new Promise<boolean>((resolve, reject) => { const abort = () => { setApproval(null); reject(new DOMException('Paused', 'AbortError')); }; signal.addEventListener('abort', abort, { once: true }); setApproval({ command, resolve: allowed => { signal.removeEventListener('abort', abort); setApproval(null); resolve(allowed); } }); });
      return allowed;
  }
  async function command(command:string,signal:AbortSignal){
      const {receipt}=await workspacePost('/api/approvals',{action:{type:'command',target:command},confirmed:true},signal);
      return workspacePost('/api/terminal', { command, approved: true,receipt }, signal);
  }
  async function respond(options: TurnOptions): Promise<AgentRun> {
    if (controller.current) throw new Error('A response is already running.');
    const abort = new AbortController(); controller.current = abort; setRunning(true); setApproval(null);
    const selected = { ...config };let modelCalls=0,tokens=0;
    let state: AgentRun = options.resume ? { ...options.resume, chatId: options.chatId, messageId: options.messageId, status: 'running', answer: '' } : { id: crypto.randomUUID(), chatId: options.chatId, messageId: options.messageId, goal: options.goal, status: 'running', plan: [], events: [], transcript: [{ role: 'user', content: `USER MESSAGE: ${options.goal}\n\nConversation so far:\n${options.context.slice(-10).map(m => m.role + ': ' + m.content.slice(0, 5000)).join('\n')}` }], answer: '', updatedAt: Date.now() };
    if (options.resume) state.transcript = [...state.transcript, { role: 'user', content: 'The user asked to continue this response. Preserve observed results. If the last action lacks an observation, inspect its current state before repeating it.' }];
    let storageReady = loaded;
    const update = (next: AgentRun) => {
      state = next; setLatest({ ...next }); options.onUpdate(next);
      if (!storageReady) return;
      const record: WorkspaceRecord = { id: 'run:' + next.id, kind: 'run', name: next.goal.slice(0, 120), content: JSON.stringify(next), updatedAt: Date.now() };
      queue.current = queue.current.then(async () => { await saveRecord(record); }).catch(e => setStorageError('Could not save progress: ' + (e as Error).message));
    };
    try {
      let data: { records: WorkspaceRecord[]; capabilities: Capabilities } = { records, capabilities };
      try { data = await refresh(abort.signal); storageReady = true; } catch { abort.signal.throwIfAborted(); storageReady = false; }
      const core = new NovaCore({
        service:async(call,signal)=>{let receipt:string|undefined;if(['mcp_call','schedule_task'].includes(call.name)||(call.name==='github'&&!['repos','branches','read','diff'].includes(String(call.args.action))))receipt=(await workspacePost('/api/approvals',{action:{type:'command',target:call.name+' '+JSON.stringify(call.args)},confirmed:true},signal)).receipt;return workspacePost('/api/services',{call,receipt},signal);},
        automation:async(call,signal)=>{const action={type:'command',target:call.name+' '+JSON.stringify(call.args)};const issued=await workspacePost('/api/approvals',{action,confirmed:true},signal);return workspacePost('/api/automation',{call,receipt:issued.receipt},signal);},
        listRecords: signal => storageReady ? workspaceApi('/api/workspace', {signal}) : Promise.resolve({records: []}),
        saveRecord,approve,audit:async entry=>{await workspacePost('/api/audit',entry);},deleteRecord:async id=>{const record=(await workspaceApi('/api/workspace')).records.find((r:WorkspaceRecord)=>r.id===id);if(!record)throw new Error('File not found');await remove(record);}, fetchUrl: (url,signal) => workspacePost('/api/tools',{tool:'fetch_url',args:{url}},signal), command,
        model: async (system, messages, signal) => {if(++modelCalls>Math.min(40,steps*2)||tokens>=100000)throw new Error('Response model budget reached, including delegated calls.');
          const response = await fetch('/api/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selected, system, messages, action: 'agent_stream' }), signal });
          if (!response.ok) { const result = await response.json() as { error?: string }; throw Object.assign(new Error(result.error || 'Model request failed'), { status: response.status }); }
          let usage:Record<string,number>|undefined;const text=await readModelStream(response,signal,options.onPreview,value=>{usage={...usage,...value};});tokens+=Number(usage?.total_tokens||Number(usage?.input_tokens||0)+Number(usage?.output_tokens||0)||Math.ceil((system.length+messages.reduce((n,m)=>n+m.content.length,0)+text.length)/4));return {text,usage,model:response.headers.get('x-nova-model')||selected.model};
        },
      }, data.capabilities,{level:data.capabilities.permissionLevel||'operator'},[selected.key]);
      const final = await core.run({run:state,persona:selected.system,maxSteps:steps,signal:abort.signal,persist:storageReady,
        update: next => {state=next;setLatest({...next});options.onUpdate(next);},
        storageError: error => setStorageError('Could not save progress: '+error.message)});
      if (storageReady) await refresh().catch(() => {}); return final;
    } catch (e) { state = { ...state, status: abort.signal.aborted ? 'paused' : 'failed', answer: abort.signal.aborted ? 'Paused. Resume to continue.' : (e as Error).message, updatedAt: Date.now() }; update(state); await queue.current; return state; }
    finally { controller.current = null; setRunning(false); setApproval(null); }
  }
  return { records, capabilities, loaded, storageError, running, steps, setSteps, latest, approval, refresh, saveRecord, remove, findRun, respond, pause: () => controller.current?.abort() };
}
export type NovaRuntime = ReturnType<typeof useNova>;
