# Two formats, one assistant core

| Format | Runtime | Persistent storage | Execution |
| --- | --- | --- | --- |
| Hosted web app | Private ChatGPT Site, Vinext/Cloudflare | D1 records scoped to authenticated user ID | Public text fetching, cloud files, memory, arithmetic |
| Repository | Standard Next.js / Node.js 22+ | Local files and `.nova/state.json` | Same tools plus optional approved shell commands |

Both formats share `lib/agent/*`, `components/agent/*`, the main page and styling, and provider/tool request routes. Workspace storage adapters differ; the hosted app uses authenticated D1 records while the local version operates on a configured folder. The hosted app has no terminal route.

Updates are not automatically synchronized with GitHub. Shared code changes must be validated in both builds. A repository push does not redeploy the private Site automatically.

Chats remain browser-local. Files, notes, and run logs are server-persistent. The agent runs while the browser tab is open, with pause/resume from saved state after an interruption. The portable edition includes a durable background worker, recurring jobs, local model endpoints, and an optional explicitly configured webhook gateway. See AUTONOMY.md. The hosted edition does not run unattended jobs or shell commands.

The source archive contains no saved notes, conversations, working files, model credentials, private Site IDs, or deployment tokens. `.nova/` and local environment files are ignored by Git and Docker build contexts.

There is one conversational interface in each format. Every user message goes through the same model loop; normal questions can produce a direct answer, while action requests can plan and use tools. The workspace panel manages resources and is not a separate chat or agent mode.
