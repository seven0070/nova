# Unified execution and isolation

## Shared core

Every entry point creates `NovaCore` with environment adapters. The core performs initialization from soul.md, user.md, memory.md and recent notes, model prompting, tool validation and permissions, skill execution, observation/error handling, run persistence, and reflection. UI approval, CLI approval, and background allowlists are transport-specific authorization gates around the same command executor. No ingress has a separate copy of tool logic.

| Entry point | Transport | Execution |
| --- | --- | --- |
| Web/mobile browser | Shared chat UI + streaming provider relay | NovaCore |
| CLI | npm run cli -- "goal" | NovaCore + same local adapters |
| Scheduled jobs | Durable jobs queue + worker | NovaCore + same local adapters |
| Messaging bridge | Authenticated localhost gateway → durable queue | Worker → NovaCore |

This includes a mobile-friendly web app and generic bridge endpoints, not a native mobile/desktop app or a preinstalled Slack/Telegram connector. Bridge credentials belong to your configured integration. Hosted and portable apps have independent stores; entry points on the same local installation share the same paths. The CLI is a single-goal invocation with persistent memory, not a separate state store.

## Parallel tool execution

A model may emit:

```json
{"type":"parallel","tools":[{"name":"fetch_url","args":{"url":"https://site-a.com"}},{"name":"read_file","args":{"path":"report.md"}}]}
```

Only independent list_files, read_file, search_memory, fetch_url and calculate calls may be batched. A batch contains 2–8 calls and a bounded asynchronous pool runs at most four at once. Each call consumes one step; batches exceeding the remaining budget are rejected before any execution. Each result/error is mapped to its original name and arguments, and the model receives all observations before its next decision. Cancellation stops scheduling new calls and waits for in-flight workers to settle. There is no speculative retry of writes. Mutation tools, commands and skills remain sequential. This is concurrent I/O, not multiple independent agents or CPU-heavy worker threads.

## Docker command sandbox

Install/start Docker and pre-pull the trusted image:

```sh
docker pull node:22-bookworm-slim
```

Set NOVA_ENABLE_TERMINAL=1 in `.env.local` for interactive web commands and `.env.worker` for CLI/background commands. NOVA_SANDBOX_IMAGE can select another prebuilt Linux image with `/bin/sh` and the required development tools; use an image you trust, preferably pinned by digest. Images are never chosen by the model and are not automatically pulled during execution.

Each command uses a fresh, automatically removed container with:

- only the configured workspace mounted at /workspace;
- a read-only container root and writable 64 MB temporary directory;
- network none, no published ports or Docker socket;
- non-root numeric user, all capabilities dropped, no-new-privileges;
- Docker's default seccomp policy;
- 512 MB memory/swap total, one CPU, and 64-process limit;
- 30-second maximum execution time and bounded output.

Arguments are passed directly to the Docker executable. The model command is an argument to the container's shell, never to a host shell. No model keys or host environment values are passed into the container. Timeout/pause forces container removal and ends the Docker client. If Docker or the image is unavailable, Nova reports an error and never falls back to host execution.

The workspace is intentionally writable. Use a dedicated folder without secrets, hard links to outside files, or unrelated personal data. A container boundary depends on Docker and the host kernel; it is not a guarantee against every runtime vulnerability. Run the Nova server/worker on the host with rootless Docker or Docker Desktop when possible. Docker daemon credentials remain trusted infrastructure. The packaged web-container image does not include a Docker socket or privileged runner; it can serve chat/files/jobs, but shell execution requires a separately configured trusted runtime. Do not expose the local app's Docker access to untrusted remote users.

Offline code/testing works when dependencies are already in the image or workspace. Network-dependent cloning and package installation are intentionally unavailable inside commands. fetch_url performs bounded public HTTPS text retrieval through its separate adapter; downloaded text never runs automatically.

## Messaging gateway

Configure a long random NOVA_GATEWAY_TOKEN in the web server's `.env.local`. Optional NOVA_GATEWAY_TOOLS sets a comma-separated allowlist; default is read-only retrieval/calculation. A bridge on the same host can submit:

```http
POST /api/gateway
Authorization: Bearer YOUR_GATEWAY_TOKEN
Content-Type: application/json

{"requestId":"stable-message-id","goal":"Summarize report.md"}
```

Response: `{jobId,status}`. Poll `GET /api/gateway?jobId=...` with the same Bearer token for `{jobId,status,result,runId}`. A stable requestId makes repeated delivery idempotent; reusing it for a different goal fails. The gateway cannot enable shell commands, choose provider keys, or expand its configured tool permissions. Inbound jobs do not send notifications by default. Configure and authorize an external messaging bridge yourself; no messages or credentials are sent automatically.

The gateway accepts localhost connections, requires the token, and rejects conflicting browser origins. The ordinary jobs UI retains its same-origin guard. Both persist into the same queue and run through the same worker. Hosted messaging-gateway and CLI execution are not provided by the Cloudflare edition.

## Verification

`npm test` covers core continuity, nested skill permissions, bounded parallel overlap, mutation/budget rejection, cancellation, durable worker execution and the gateway. Fake Docker tests verify invocation, timeouts, output and unavailable-runtime behavior. The live Docker test checks that a host-only sentinel is inaccessible and container system files cannot be written, and is automatically skipped when Docker/image are absent. Container execution was not available in the authoring environment; run the live test on your configured installation.

Docker flag references: https://docs.docker.com/reference/cli/docker/container/run/ and https://docs.docker.com/engine/network/drivers/none/.
