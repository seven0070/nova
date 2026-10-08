// Render only the answer field from a final decision, never tool arguments.
export function partialAnswer(raw: string): string | null {
  if (!/"type"\s*:\s*"final"/.test(raw)) return null;
  const match = /"answer"\s*:\s*"/.exec(raw); if (!match) return null;
  let encoded = ''; const start = match.index + match[0].length;
  for (let index = start; index < raw.length; index++) {
    const char = raw[index]; if (char === '"' || char.charCodeAt(0) < 32) break;
    if (char === '\\') {
      const next = raw[index + 1]; if (!next) break;
      if (next === 'u') { const digits = raw.slice(index + 2, index + 6); if (!/^[0-9a-f]{4}$/i.test(digits)) break; encoded += raw.slice(index, index + 6); index += 5; }
      else { if (!'"\\/bfnrt'.includes(next)) break; encoded += char + next; index++; }
    } else encoded += char;
  }
  try { return JSON.parse('"' + encoded + '"') as string; } catch { return null; }
}
export async function readModelStream(response: Response, signal: AbortSignal, preview: (text: string) => void, usage?: (value: Record<string,number>) => void): Promise<string> {
  if (!response.body) throw new Error('No model response body.');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', output = '';
  function line(value: string) {
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim(); if (!data || data === '[DONE]') return;
    let parsed; try { parsed = JSON.parse(data); } catch { return; }
    const counts=parsed.usage||parsed.message?.usage;if(counts&&typeof counts==='object')usage?.(Object.fromEntries(Object.entries(counts).filter(([,v])=>typeof v==='number')) as Record<string,number>);
    if (parsed.error) throw new Error(parsed.error.message || 'Provider streaming error');
    output += parsed.choices?.[0]?.delta?.content || parsed.delta?.text || parsed.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments || parsed.delta?.partial_json || '';
    const text = partialAnswer(output); if (text !== null) preview(text);
  }
  try {
    while (true) {
      signal.throwIfAborted(); const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const item of lines) line(item.trimEnd());
      if (done) { if (buffer) line(buffer); break; }
    }
  } finally { await reader.cancel(); }
  if (!output) throw new Error('The selected model returned no text.'); return output;
}
