# Architecture

Nova uses one agent loop. Interfaces supply adapters; they do not implement a second reasoning engine.

## Ownership

| Layer | Entry points | Owns |
| --- | --- | --- |
| Core | `lib/agent/core.ts`, `engine.ts` | Tool dispatch, permission ceiling, approvals, bounded parallel reads, subagents, circuits, persistence and reflection |
| Intelligence | `lib/agent/model-client.ts`, `gateway.ts` | Provider protocols, route eligibility, fallback, streaming and measured selection |
| Device | `worker/coding/runner.ts` | Project guidance, local edits, session checkpoints, plugin calls and inference connection |
| Memory | `worker/coding/store.ts`, `recall.ts`; shared-context | JSON session truth, derived per-project FTS index, profile/goal synchronization |
| Integrations | `worker/gateway/`; server service/MCP/automation | Identity normalization and concrete environment I/O |
| Web | `app/api/`, `components/agent/` | Authenticated UI, virtual workspace, connection/settings management |
| Desktop | `apps/desktop/main.cjs`, `preload.cjs`, `ui/` | Origin-checked native IPC, OS secrets, native review dialogs and presentation |
| Operations | worker main, backend database/queue | Durable scheduling, device scopes, leases, bounded jobs, audit and recovery |

## State and concurrency

The CLI and desktop share `~/.nova-cli/projects/<project-hash>`. A process lock serializes local execution in one project. Worktrees create separate working folders and sessions. Session JSON is authoritative; SQLite FTS is derived and can be rebuilt by searching. Hosted web storage uses its deployment adapter and never imports device SQLite into the browser.

Backend SQLite transactions own revisions and live leases. Only the lease holder checkpoints a running session. A second interface observes it or queues steering/stop controls; it cannot overwrite that session. Profiles and memory use optimistic revisions and preserve recovery copies.

## Extension boundaries

Declarative skills use normal core tools. MCP plugins discover external schemas but can call only installed allowlisted tool names, after normal core approval. Native messaging adapters never trust identity strings from model output: only provider envelopes and explicit configuration mappings enqueue jobs. Background jobs use explicit tool/command ceilings.

Generated desktop runtime files and dependency directories are ignored. `desktop:stage` copies the compiled shared dependency graph and checks approved runtime dependencies. Tests should cover permission decisions, recovery and observable behavior rather than duplicate implementation details.
