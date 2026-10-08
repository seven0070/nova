import { consumeApproval } from '../../../lib/server/approvals';
import {checkPermission, type PermissionLevel} from '../../../lib/agent/operations';
import { listRecords, saveRecord, deleteRecord, localRequest } from '../../../lib/server/local-workspace';
import { validateRecord } from '../../../lib/agent/records';
import { sameOrigin } from '../../../lib/agent/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!localRequest(request)) return Response.json({ error: 'Local workspace requires a localhost connection.' }, { status: 403 });
  try { const data = await listRecords(); return Response.json({ ...data,records:data.records.filter(r=>!r.id.startsWith('sys:')), capabilities: { runtime: 'local', browserEnabled:!!process.env.NOVA_BROWSER_ADAPTER,desktopEnabled:!!process.env.NOVA_DESKTOP_ADAPTER, permissionLevel: process.env.NOVA_PERMISSION_LEVEL||'operator', terminalEnabled: process.env.NOVA_ENABLE_TERMINAL === '1' } }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
export async function POST(request: Request) {
  if (!localRequest(request) || !sameOrigin(request, true)) return Response.json({ error: 'Local same-origin request required.' }, { status: 403 });
  try { const input=await request.json();const record=validateRecord(input);const level=(process.env.NOVA_PERMISSION_LEVEL||'operator') as PermissionLevel;if(record.kind!=='run')checkPermission({name:'write_file',args:{}},level);if(record.kind==='file'&&['soul.md','user.md'].includes(record.name)&&(await listRecords()).records.some(r=>r.kind==='file'&&r.name===record.name))await consumeApproval(input.receipt,{type:'profile',target:JSON.stringify({path:record.name,content:record.content})});return Response.json({record:await saveRecord(record)}); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  if (!localRequest(request) || !sameOrigin(request, true)) return Response.json({ error: 'Local same-origin request required.' }, { status: 403 });
  try { const { id,receipt } = await request.json() as { id: string;receipt?:string }; if (typeof id !== 'string' || !id || id.startsWith('sys:') || id.startsWith('approval:')) throw new Error('Missing record ID'); checkPermission({name:'delete_file',args:{}},(process.env.NOVA_PERMISSION_LEVEL||'operator') as PermissionLevel);await consumeApproval(receipt,{type:'delete',target:id});await deleteRecord(id); return Response.json({ deleted: true }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
