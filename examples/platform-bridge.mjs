// Trusted platform bridge relay: authenticate/verify the platform before calling this helper.
// Reads one normalized envelope from stdin; outputs structured results for your bridge to deliver.
import process from 'node:process';
const token=process.env.NOVA_GATEWAY_TOKEN;if(!token)throw new Error('NOVA_GATEWAY_TOKEN is required');
const base='http://127.0.0.1:'+Number(process.env.NOVA_GATEWAY_PORT||4318);let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>20000)throw new Error('Envelope too large');}
const response=await fetch(base+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(JSON.parse(text)),signal:AbortSignal.timeout(15000)});const job=await response.json();if(!response.ok)throw new Error(job.error);console.log(JSON.stringify(job));
for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,1000));const response=await fetch(base+'/?jobId='+encodeURIComponent(job.jobId),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(result.error);if(['completed','failed','paused'].includes(result.status)){console.log(JSON.stringify(result));break;}}
