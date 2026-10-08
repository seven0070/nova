import {consumeApproval} from '../../../lib/server/approvals';
import {checkPermission,type PermissionLevel} from '../../../lib/agent/operations';
import { sameOrigin } from '../../../lib/agent/http';
import { localRequest, workspaceRoot } from '../../../lib/server/local-workspace';
import { runCommand } from '../../../lib/server/terminal';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!localRequest(request) || !sameOrigin(request, true)) return Response.json({ error: 'Terminal requires a local same-origin connection.' }, { status: 403 });
  if (process.env.NOVA_ENABLE_TERMINAL !== '1') return Response.json({ error: 'Terminal is disabled. Set NOVA_ENABLE_TERMINAL=1 locally to enable it.' }, { status: 403 });
  try {
    const { command, approved,receipt } = await request.json() as { command: string; approved: boolean;receipt?:string };
    if (approved !== true || typeof command !== 'string') return Response.json({ error: 'Approve this exact command in the UI before execution.' }, { status: 403 });
    checkPermission({name:'run_command',args:{}},(process.env.NOVA_PERMISSION_LEVEL||'operator') as PermissionLevel);await consumeApproval(receipt,{type:'command',target:command});
    return Response.json(await runCommand(command, await workspaceRoot(), request.signal));
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
