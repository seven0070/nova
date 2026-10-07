import {service} from '../lib/server/service';
import {automate} from '../lib/server/automation';
import {auditRecord} from '../lib/agent/approval';
import type {ToolCall} from '../lib/agent/types';
import type {PermissionLevel} from '../lib/agent/operations';
import { NovaCore, type CorePolicy } from '../lib/agent/core';
import { listRecords, saveRecord, deleteRecord, workspaceRoot } from '../lib/server/local-workspace';
import { runCommand } from '../lib/server/terminal';
import { validateRecord } from '../lib/agent/records';
import { readUrl } from '../lib/agent/http';
import { model } from './provider';
export function localCore(policy: CorePolicy = {}, approve?: (call: ToolCall, signal: AbortSignal) => Promise<boolean>) {
 const enabled=process.env.NOVA_ENABLE_TERMINAL==='1';
 return new NovaCore({automation:automate,service:(call,signal)=>service('local',call,signal),listRecords:async()=>{const data=await listRecords();return {...data,records:data.records.filter(r=>!r.id.startsWith('sys:')&&!r.id.startsWith('approval:'))};},saveRecord:record=>saveRecord(validateRecord(record)),deleteRecord,approve,audit:async entry=>{await saveRecord(await auditRecord(entry,'local-core'));},fetchUrl:readUrl,command:async(command,signal)=>runCommand(command,await workspaceRoot(),signal),model},{runtime:'local',terminalEnabled:enabled,browserEnabled:!!process.env.NOVA_BROWSER_ADAPTER,desktopEnabled:!!process.env.NOVA_DESKTOP_ADAPTER},{...policy,level:(process.env.NOVA_PERMISSION_LEVEL||'operator') as PermissionLevel},[process.env.NOVA_MODEL_KEY||'',process.env.NOVA_NOTIFY_TOKEN||'',process.env.NOVA_GATEWAY_TOKEN||'',process.env.NOVA_TELEGRAM_TOKEN||'',process.env.NOVA_AUTOMATION_TOKEN||'',process.env.NOVA_STT_KEY||'']);
}
