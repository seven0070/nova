import {localRequest} from '../../../lib/server/local-workspace';
import {sameOrigin} from '../../../lib/agent/http';
import {automate} from '../../../lib/server/automation';
import {consumeApproval} from '../../../lib/server/approvals';
export const runtime='nodejs';
export async function POST(req:Request){if(!localRequest(req)||!sameOrigin(req,true))return Response.json({error:'Local origin required'},{status:403});try{if(process.env.NOVA_PERMISSION_LEVEL&&process.env.NOVA_PERMISSION_LEVEL!=='operator')throw new Error('Operator permission required');const {call,receipt}=await req.json();if(!['browser_task','desktop_task'].includes(call?.name))throw new Error('Unsupported adapter');await consumeApproval(receipt,{type:'command',target:call.name+' '+JSON.stringify(call.args)});return Response.json(await automate(call,req.signal));}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
