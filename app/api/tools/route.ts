import { sameOrigin, readUrl } from '../../../lib/agent/http';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  try {
    const { tool, args } = await request.json() as { tool: string; args: { url: string } };
    if (tool !== 'fetch_url') return Response.json({ error: 'Unknown server tool' }, { status: 400 });
    return Response.json(await readUrl(args.url, request.signal));
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Tool failed' }, { status: 400 }); }
}
