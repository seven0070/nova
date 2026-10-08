# Nova

**One personal AI agent across chat, desktop, CLI and messaging.** Nova pairs a conversational interface with a model gateway, persistent memory, reusable skills and reviewed tool execution.

Nova is an independent implementation. Hermes Agent is the capability reference, not a claim that every integration, benchmark or deployment is identical. The [capability matrix](docs/CAPABILITIES.md) records implemented behavior and remaining differences.

## Start here

| Interface | Setup |
| --- | --- |
| Web app | Open your deployed Nova instance, then add model connections in Settings |
| Desktop | [Installer builds](https://github.com/seven0070/nova/actions/workflows/desktop.yml) · [Desktop guide](docs/DESKTOP.md) |
| Coding CLI | `npm install -g ./releases/nova-device-cli-0.14.0.tgz`, then `nova setup connect` or `nova setup local` |
| Model backend | [Deployment, device pairing and recovery](docs/BACKEND.md) |
| Messaging and automation | [Native gateway guide](docs/GATEWAY.md) |

Use Node 24 for development. The CLI requires Node 22.13 or later. Desktop installers are currently unsigned.

## What Nova does

- Chat and act through one `NovaCore`: planning, bounded tool execution, observations, recovery and completion.
- Route among OpenAI-compatible, Anthropic and local model endpoints with fallback, measured latency, declared prices and context limits.
- Read project files, review diffs, execute approved commands, inspect Git, undo exact changes, stage/commit and create isolated worktrees.
- Keep a human-readable soul, user profile, goals and memory; search past project sessions through SQLite FTS5.
- Learn declarative skills from successful workflows, track skill outcomes, and quarantine a procedure after three consecutive failed executions.
- Install reviewed skill bundles and MCP plugins. MCP calls retain human approval and explicit tool allowlists across web, worker, CLI and desktop.
- Delegate isolated read/draft subagents, run scheduled background jobs and observe/steer/stop live device tasks.
- Receive Telegram, Discord, Slack, WhatsApp and Signal messages through one gateway. Trusted identity mappings share conversations across platforms.
- Converse through recorded speech or continuous WebRTC with interruption and an Irish voice delivery preset.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `lib/agent/` | Portable core, tool protocol, permissions, model routing, retrieval, skills and evaluation |
| `lib/server/` | Web/worker storage, encrypted connections, jobs, service adapters and Docker terminal |
| `worker/coding/` | Device sessions, project files, Git, FTS recall, plugins and authenticated backend |
| `worker/gateway/` | Native messaging transports and normalized envelopes |
| `app/` and `components/` | Web API routes and chat/settings/workspace UI |
| `apps/desktop/` | Sandboxed Electron UI and reviewed native bridge |
| `automation/` | Separately configured browser/virtual desktop service |
| `deploy/` | Backend and runner deployment examples |
| `examples/` | Reviewed integration and configuration manifests |
| `tests/` | Core, integration, gateway, persistence and permission tests |
| `releases/` | Versioned CLI distribution |
| `docs/` | [Documentation index](docs/README.md) |

## Develop

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run cli:package
npm run desktop:stage
npm ci --prefix apps/desktop
npm --prefix apps/desktop start
```

Run web development with `npm run dev`. Copy `.env.worker.example` to a private `.env.worker` for the worker/gateway; never commit provider keys. Backend provider keys stay on the backend; local tools send relevant observations to the chosen inference service.

## Boundaries

Review before executing device commands or external tool calls. Message senders must be explicitly linked in gateway configuration; shared history is context, never permission. Hosted web code cannot directly control your laptop. Browser and desktop automation need a separately configured isolated adapter.

Live platform authentication, microphone behavior, accent quality, OS installation and production workload results require device/account verification. See [capabilities and verification](docs/CAPABILITIES.md), [architecture](docs/ARCHITECTURE.md), and [contribution guide](CONTRIBUTING.md).
