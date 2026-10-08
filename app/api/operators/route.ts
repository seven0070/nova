import {localRequest} from '../../../lib/server/local-workspace';
export async function GET(req:Request){if(!localRequest(req))return Response.json({error:'Local request required'},{status:403});return Response.json({runtime:'local',telegram:!!process.env.NOVA_TELEGRAM_TOKEN,browser:!!process.env.NOVA_BROWSER_ADAPTER,desktop:!!process.env.NOVA_DESKTOP_ADAPTER});}
