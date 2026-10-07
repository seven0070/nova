export function sameOrigin(request: Request, requireOrigin = false): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return !requireOrigin;
  try {
    const url = new URL(request.url), source = new URL(origin);
    return origin === url.origin || (source.host === request.headers.get('host') && source.protocol === url.protocol && source.origin === origin);
  } catch { return false; }
}
export function publicHttps(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || url.hostname.endsWith('.')) throw new Error('Use a public HTTPS URL without credentials.');
  return url;
}
export async function readUrl(value: string, signal?: AbortSignal) {
  const url = publicHttps(value);
  const response = await fetch(url, { redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), headers: { Accept: 'text/html,application/json,text/plain;q=0.9', 'User-Agent': 'Nova-Agent/0.2' } });
  if (!response.ok) throw new Error(`Website returned ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/|json|xml/.test(type)) throw new Error('Only text, HTML, XML, or JSON responses are supported.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('No response body.');
  const decoder = new TextDecoder(); let text = '', size = 0, truncated = false;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 300000) { truncated = true; break; } text += decoder.decode(value, { stream: true }); } } finally { await reader.cancel(); }
  if (/html/.test(type)) text = text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return { url: url.toString(), contentType: type, text: text.slice(0, 30000), truncated: truncated || text.length > 30000 };
}

/** Bound uploads even when HTTP/2 or a proxy omits Content-Length. */
export async function boundedUpload(req:Request,limit:number){const length=req.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>limit))throw new Error('Upload too large');const reader=req.body?.getReader();if(!reader)throw new Error('No upload body');const chunks:Uint8Array[]=[];let size=0;try{while(true){req.signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw new Error('Upload too large');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||'application/json'}});}
