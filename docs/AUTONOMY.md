# Nova persistent agent framework

One chatbot owns conversations, tool activity, identity, memory, skills, and jobs. Hosted chat and the local worker share the same agent orchestrator. No separate agent mode exists.

## Profiles and evolution

`soul.md` defines persona and behavior, `user.md` stores confirmed user preferences, and `memory.md` holds long-term context and verified activity digests. Documents appear in the workspace and are loaded on each run. Locally they are real markdown files under `.nova/workspace`; the hosted edition stores per-user virtual files. Edit them in **Profile & skills** or ask Nova to make a specific change. The background file-writing tool cannot change soul.md or user.md. An explicitly permitted shell command can modify mounted workspace files, so keep command allowlists narrow.

Reflection digests use observed run metadata, never guessed conclusions or raw outputs. The model is instructed to save specific verified learnings after complex tasks when useful. Successful routines can become `skills/<slug>.json`, a validated description and sequence of tool calls. Each step runs through the same executor, observes actual output, and stops on failure. Skills cannot invoke other skills recursively. Code skills can be written as normal scripts and executed through an approved exact shell command. Skills do not bypass job permissions or chat command approvals. This improves persistent context and routines, not model weights; quality still depends on the selected model.

## Run with the browser closed

```sh
npm ci
cp .env.worker.example .env.worker
# Edit .env.worker with your own model endpoint and model ID.
npm run worker:build
npm run worker
```

Keep the worker running in a second terminal. Start the web app with `npm run dev` or `npm run build && npm start`, then open **Workspace → Automation**. Queue a goal, choose its allowed tools, and select once/hourly/daily/weekly. Jobs use server time for relative intervals (next occurrence is measured after successful completion), not a calendar timezone. The worker processes one job at a time and displays its heartbeat. An offline worker leaves jobs queued.

The worker uses `.env.worker` keys, not browser keys. For cloud models set NOVA_MODEL_BASE, NOVA_MODEL, and NOVA_MODEL_KEY. Use NOVA_MODEL_PROTOCOL=anthropic for Anthropic Messages; otherwise use an OpenAI-compatible API. Local models such as Ollama can use http://localhost:11434/v1 without a key. Select a model capable of the structured JSON decision protocol. Keep actual .env.worker private; Git ignores it. Never copy keys into profile or skill files.

Both processes must use the same NOVA_STATE_DIR and NOVA_WORKSPACE_DIR when overriding defaults. A shared JSON state queue uses cross-process locks and atomic writes. Only one worker may run for a state directory. Job state persists in jobs.json and observations in state.json. Queued jobs survive restart; a run interrupted by a worker crash is paused to avoid silently repeating side effects. Inspect **Activity** before resuming it. “Run again” starts a new run, rather than blindly replaying an interrupted transcript. Completed recurring jobs queue their next occurrence; failed/limited jobs pause and require manual review. Stop requests are observed within approximately one second; in-flight file writes may already have completed. Shutdown cancels the active model/command request and saves its state.

A run is bounded to 2–40 model steps. Model calls time out after 90 seconds. Shell calls time out after 30 seconds and cap output. Background shell commands are disabled unless NOVA_ENABLE_TERMINAL=1 and the job stores the exact permitted command. Commands always run in the Docker sandbox described in EXECUTION.md. Only the workspace is mounted; network is off, the root is read-only, execution is non-root, and resources are capped. Docker must be installed/running with the image pre-pulled. Unavailable Docker stops execution instead of using the host shell. Generated routines inherit these same restrictions.

## Persistent services

For unattended operation across machine reboots, run the worker under your existing process manager. Example Linux systemd unit (replace paths and user):

```ini
[Unit]
Description=Nova background worker
After=network-online.target
[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/absolute/path/to/nova
ExecStart=/absolute/path/to/node --env-file=.env.worker .worker/worker/main.js
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
```

The Docker build also includes `.worker`. Run a second container from the same image with the same /data volume and explicit model environment, overriding its command with `node .worker/worker/main.js`. The web container still serves the UI. Container localhost denotes that container; configure a reachable provider endpoint for your environment. No service or external schedule is installed automatically.

## Messaging and automation gateways

The localhost `/api/jobs` endpoint accepts same-origin POST operations: create, stop, resume, and delete. Jobs never include model credentials. It provides a durable scheduler gateway for the web UI; do not expose it to the internet without authentication and a deliberate multi-user adapter.

Optional outbound notifications use NOVA_NOTIFY_WEBHOOK (public HTTPS) and NOVA_NOTIFY_TOKEN (Bearer authentication). Configure a destination you control, then explicitly enable notification on each job. Nova sends JSON `{jobId, runId, status, answer}` after execution. Notification failure is reported in the job result and does not undo or repeat completed work. It does not automatically message Slack, email, or any recipient; your webhook gateway handles the authorized integration. Tool calls cannot change webhook credentials or choose their own notification target.

## Hosted edition

The published app supports profiles, persistent memory, reflection, skill creation/execution, and unified conversational tools. Hosted jobs do not execute in the background in this release. The Automation tab explains how to run the independent local worker; it does not pretend browser timers provide unattended execution. Hosted shell execution and loopback models remain unavailable. The hosted and local stores are separate.

## Validation

`npm test` builds the worker and tests a real separate worker process against a mock model HTTP server: durable queues, actual file output, skill permission denial, recurrence, interrupted-run recovery, and reflection. Other tests cover the unified core, parallel tools, CLI continuity, gateways, providers, streaming, Docker runner lifecycle, and file persistence. Docker lifecycle tests use a fake Docker CLI; the live isolation test is skipped if Docker/image are unavailable. Live cloud/local model quality, Docker builds, systemd installation, and external webhook delivery require your configured environment.
