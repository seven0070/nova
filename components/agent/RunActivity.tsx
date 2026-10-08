'use client';
import { Play, ListChecks, Terminal, Check } from 'lucide-react';
import type { AgentRun } from '../../lib/agent/types';
import type { NovaRuntime } from './useNova';
export default function RunActivity({ run, runtime, onResume, onFiles }: { run?: AgentRun; runtime: NovaRuntime; onResume: () => void; onFiles: () => void }) {
  if (!run) return null;
  const active = runtime.running && runtime.latest?.id === run.id;
  const events = run.events.filter(e => !['thinking','completion'].includes(e.type));
  const tools = events.filter(e => e.type === 'action').length;
  const resumable = !active && ['paused','failed','limited','running'].includes(run.status);
  const hasFiles = events.some(e => e.type === 'action' && e.title === 'write_file');
  return <div className="inlineactivity">
    {events.length > 0 && <details open={active}><summary><ListChecks size={14} /> {active ? 'Working on your request' : tools ? `Used ${tools} ${tools === 1 ? 'tool' : 'tools'}` : 'Response activity'}<span>{active ? 'In progress' : run.status === 'running' ? 'paused' : run.status}</span></summary><div>{run.plan.length > 0 && <ol className="inlineplan">{run.plan.map((step,i) => <li key={i}>{step}</li>)}</ol>}<div className="agenttimeline">{events.map(event => <details key={event.id} className={'agentevent ' + event.type}><summary><span className="eventdot" /><span>{event.title.replaceAll('_',' ')}</span><time>{new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></summary><pre>{event.detail}</pre></details>)}</div></div></details>}
    {active && runtime.approval && <div className="approval" role="alert"><strong><Terminal size={18} /> Approve sensitive action</strong><p>Review the exact action below. Deletion and profile changes require your sign-off. Commands run in the isolated Docker workspace.</p><pre>{runtime.approval.command}</pre><div><button onClick={() => runtime.approval?.resolve(false)}>Reject</button><button className="approvebutton" onClick={() => runtime.approval?.resolve(true)}><Check size={15} /> Approve action</button></div></div>}
    <div className="responseactions">{resumable && <button disabled={runtime.running} onClick={onResume}><Play size={13} /> {run.status === 'paused' || run.status === 'running' ? 'Resume' : 'Continue'}</button>}{hasFiles && <button onClick={onFiles}>Open workspace files</button>}</div>
  </div>;
}
