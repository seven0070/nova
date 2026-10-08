import {owner} from '../../../lib/server/state';import {speechConnection} from '../../../lib/server/voice';
import {localRequest} from '../../../lib/server/local-workspace';
import {sameOrigin,boundedUpload} from '../../../lib/agent/http';
import {transcribeForm} from '../../../lib/agent/transcribe';
export const runtime='nodejs';
export async function POST(req:Request){if(!localRequest(req)||!sameOrigin(req,true))return Response.json({error:'Local origin required'},{status:403});try{const upload=await boundedUpload(req,11000000);const form=await upload.formData();if(form.get('connectionId')){const c=await speechConnection(await owner(req),String(form.get('connectionId')));if(c.protocol==='elevenlabs')throw new Error('Recorded turns need an OpenAI-compatible transcription connection; use browser recognition for ElevenLabs output');form.set('base',c.base);form.set('key',c.key);}return Response.json(await transcribeForm(form,req.signal));}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
