> **Connection setup:** use `nova setup backend`, `nova setup local`, `nova setup connect`, then `nova verify`. Read [Connect everything](docs/CONNECT_EVERYTHING.md).

> **Nova 0.10:** cloud/local model gateway, goals and emotional check-ins, an editable goal-focused soul, and Irish voice conversation settings. Read [the model, soul, and voice guide](docs/GATEWAY_SOUL_VOICE.md).

> **Nova 0.9:** installable device CLI and authenticated, deployable model backend. Read [CLI setup](docs/CLI.md) for local coding, diff approvals, commands, and cross-device session resume. The hosted web app remains on its existing deployment.

> **Nova 0.8:** synchronized chats, encrypted connections, GitHub/MCP/search integrations, document retrieval, durable tasks, voice chat, isolated drafts and encrypted recovery. Read [the 0.8 setup and limitations](docs/UPGRADE_0_8.md) before enabling integrations or unattended work.

# Nova — one AI agent chatbot

Nova is a ChatGPT-style assistant with a real observe–plan–act loop. Bring an API key from a supported provider, choose a model, and talk to one assistant that answers questions and uses tools when needed.

**Hosted app:** https://nova-ai-chat.sanathpatil8861.chatgpt.site

The hosted app and portable repository share the agent engine, interface, and provider protocol. The repository runs on standard Next.js and Node.js; it does not require ChatGPT Sites to run locally.

## Start

Install Node.js 22.13 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. In **Manage connections**, select your provider, enter its API key, and fetch or manually enter a chat model ID. API keys belong in the app's settings, never in committed files.

Send a question or task in the normal message box. Nova chooses whether to answer directly or use tools, with no mode switch. For example:

> Read https://www.example.org, summarize the page, and write reports/summary.md.

Choose a URL that serves text directly and does not require browser JavaScript or login. Redirecting URLs must be replaced with their final URL.

## What the agent actually does

1. Sends your goal, persona, relevant conversation context, saved notes, and tool descriptions to the selected model.
2. Validates a structured planning, tool, or completion decision.
3. Executes the requested available tool.
4. Adds the real output or error to the next model request.
5. Repeats until completion, pause, failure, or the step limit.

Tool activity appears inside the same conversation. Open **Workspace & memory** to manage files, notes, saved activity, and the maximum steps per response. Final answers stream into chat; tool payloads stay in the activity details. It does not expose hidden model reasoning. A model that cannot follow the structured action format will stop with an explanation rather than run fabricated actions.

## Persistent agent framework

Open **Workspace → Profile & skills** to edit `soul.md`, `user.md`, and `memory.md`. These human-readable documents initialize every task. Nova can save successful tool routines with `save_skill` and execute them with `run_skill`. Each routine step retains the normal permissions. Verified activity produces a compact reflection entry in memory.md; the model can save specific lessons based on observations. This evolves context and routines, not model weights.

Open **Workspace → Automation** in the local edition to queue one-time or recurring jobs. Configure `.env.worker` from `.env.worker.example`, run `npm run worker:build`, then `npm run worker` in a separate process. See [the autonomy guide](docs/AUTONOMY.md) for setup, gateways, and service operation. Local OpenAI-compatible models can use `http://localhost:11434/v1` without an API key.

## One execution pipeline

`NovaCore` loads the same profiles, memory, and skill registry for web chat, the CLI, background jobs, and the authenticated messaging gateway. Adapters supply provider, persistence, and environment I/O; the core owns tool semantics, permission checks, observe–plan–act execution, activity saving, and reflection. Hosted and local stores remain separate.

Independent reads/fetches can use `parallel` actions with 2–8 calls and at most four concurrent workers. Each call consumes the step budget. Results are linked to the original calls; failures become observations. Writes, shell commands, skill workflows, and dependent actions stay ordered to avoid races.

After configuring `.env.worker` and running `npm run worker:build`, use:

```sh
npm run cli:legacy -- "Read report.md and summarize it"
```

CLI commands need interactive approval; background commands need the job's exact allowlist. Both use the same Docker runner. For messaging bridges, see [docs/EXECUTION.md](docs/EXECUTION.md).

## Operational controls

Nova now enforces read/workspace/operator permission levels, exact-action user sign-off for deletion/profile changes/commands, single-use API approval receipts, and three-failure circuit breakers. **Workspace → Audit & safety** displays redacted prompts, model output, tool effects, errors, prompt hashes and provider-reported token counts, with JSONL export. Counts are labeled unavailable when the provider omits them. See [docs/OPERATIONS.md](docs/OPERATIONS.md) for permissions, recovery, provenance, retention and audit limits.

## Tools

| Tool | Hosted web app | Local repository |
| --- | --- | --- |
| List/read/write workspace files | Durable cloud text files | Real files under the configured workspace folder |
| Search/save long-term memory | Per-user cloud records | Persistent local JSON records |
| Fetch a URL or JSON API | Public HTTPS GET | Public HTTPS GET |
| Calculate arithmetic | Deterministic parser | Same parser |
| Execute shell commands | Unavailable | Optional, with approval for every command |

Text/code uploads and files are limited to 200 KB/characters. Local scanning skips symlinks, binary files, secret-looking files, dependency folders, and Git metadata; it scans up to 200 files, 3 MB in total, and eight directory levels. Agent traces report when listings are truncated.

## Memory and resume

- **Short-term:** the goal, recent conversation, and recent tool observations form bounded model context.
- **Long-term:** notes and preferences remain in storage and can be searched or edited in **Memory**. Retrieval is keyword-based, not a vector database.
- **Runs:** task plans, observations, and results are persisted under **Workspace → Activity**, linked to the original conversation when it still exists in the browser. Opening activity interrupted by a reload treats it as paused. Resume preserves prior observations and gives it a fresh step budget.

Interactive agent replies run while the browser tab stays open. New background tasks run in checkpointed slices; see the upgrade guide for hosted continuation. For unattended execution, use the persistent local worker described in [docs/AUTONOMY.md](docs/AUTONOMY.md). It runs independently of the browser and restarts with durable queued jobs. In-flight writes may finish as a pause occurs; resumed runs are instructed to verify interrupted actions.

## Local workspace and terminal

Default paths:

- `.nova/workspace/`: actual working files.
- `.nova/state.json`: durable notes and task records.

To change these, copy `.env.example` to `.env.local` and configure `NOVA_WORKSPACE_DIR` and `NOVA_STATE_DIR`. Both folders persist across server restarts and are excluded from Git.

To enable shell tools, set:

```dotenv
NOVA_ENABLE_TERMINAL=1
```

Restart Nova. The model can now propose `run_command`, and the UI shows the exact command for approval. Commands always run in a constrained Docker container with only `NOVA_WORKSPACE_DIR` mounted. The container has no network, a read-only root, a non-root user, dropped capabilities, and CPU/memory/process limits. There is no host-shell fallback. Install Docker and pre-pull `node:22-bookworm-slim` before enabling commands. Commands time out after 30 seconds, have bounded output, and are cancelled when the run is paused. Code can be tested using tools already installed in your configured sandbox image; network-dependent installs and Git cloning inside the command sandbox are unavailable. Public text retrieval uses Nova’s separate fetch_url tool.

Terminal and local workspace endpoints require a localhost connection. Default start commands bind to `127.0.0.1`. For deployment to external users, use the cloud format or implement authenticated multi-user storage and remote execution separately.

## Providers and credentials

Supports OpenAI-compatible chat endpoints and Anthropic Messages. Presets include OpenAI, Anthropic, Gemini, OpenRouter, Groq, and DeepSeek. Keys must be valid for the selected provider. Agent quality depends on the selected model's ability to follow instructions and output valid JSON.

Keys stay in browser memory by default. **Remember key on this device** saves one in local storage, which is not an encrypted secrets vault. The relay does not intentionally persist keys or chat content; model providers and hosting services may have their own policies. Keys are excluded from agent instructions and saved run configuration.

Ordinary chats remain browser-local. Agent files, notes, and runs persist on the server. Hosted and local apps have separate storage; no automatic cross-format synchronization exists.

## Build and test

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests cover the shared core, parallel concurrency/budgets/abort, real file writes, durable notes, failed-tool recovery, providers, permission checks, and Docker runner invocation/lifecycle using a fake Docker CLI. A live container isolation test runs only when Docker and the image are available. Model responses in tests are mocked; live provider execution requires your key.

## Docker

```sh
docker build -t nova-ai-chat .
docker run --rm -p 127.0.0.1:3000:3000 -v nova-data:/data nova-ai-chat
```

Use a persistent `nova-data` volume to retain memory and files. Terminal is disabled by default. Docker packaging is included but has not been built in the authoring environment.

## GitHub

Create an empty repository, then from this folder:

```sh
git init -b main
git add .
git commit -m "Add Nova chat and task agent"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Included GitHub Actions check tests, types, and the production build. GitHub Pages alone cannot run the API relay or agent storage.

## Code map

- `lib/agent/core.ts`: unified execution pipeline for every ingress.
- `lib/agent/engine.ts`: bounded task orchestrator and JSON decision protocol.
- `components/agent/useNova.ts`: one shared conversational/tool runtime.
- `components/agent/RunActivity.tsx`: inline tool activity and command approval.
- `components/agent/WorkspacePanel.tsx`: files, memory, and saved response management.
- `lib/agent/stream.ts`: streaming model decisions and user-visible answer previews.
- `lib/agent/arithmetic.ts`: safe arithmetic parser.
- `lib/server/local-workspace.ts`: file and memory persistence adapter.
- `lib/server/terminal.ts`: constrained Docker command runner with no host fallback.
- `app/api/provider/route.ts`: streaming chat and non-streaming agent model requests.
- `app/api/workspace/route.ts`: local file, note, and run APIs.
- `app/api/tools/route.ts`: public URL fetching.
- `app/api/terminal/route.ts`: optional approved local shell requests.

No open-source license has been selected for Nova's original code. Dependencies retain their licenses.

## Operator extensions (0.7)

See [docs/OPERATORS.md](docs/OPERATORS.md) for automatic portable skills, shared gateway sessions, calendar scheduling, read-only child agents, container browser/desktop adapters, voice and image transcripts. Configuration and deployment limits are explicit there. No external messaging account is connected automatically.

## Nova 0.11

Shared web–CLI context and conversation copies, continuous voice with interruption, measured route selection, reviewed learning and service setup are documented in [CONTINUITY.md](docs/CONTINUITY.md). Configure and test your own provider accounts and deployment before running unattended.

## Nova 0.12 — settings and backend operations

Settings now starts with a setup/health dashboard for models, voice, devices, memory, background work and daily usage. Model connections attempt discovery when saved; inference checks and timestamps distinguish configured accounts from verified model responses. A server-enforced daily call ceiling covers chat and background work. Devices & memory includes hub trust controls, personal backup export and explicit recovery of the copy saved before a hub pull.

The standalone backend now uses SQLite with versioned schema initialization and one-time import of existing JSON state. Device pairing issues five-minute single-use codes and hashed scoped tokens, with persistent revocation and per-device access enforcement. A bounded inference queue handles concurrency, cancellation and deadlines. Administrative CLI commands expose health, audits and protected database snapshots. Repeated task interruptions back off and stop after three recoveries.

Installable CLI: [nova-device-cli-0.12.0.tgz](nova-device-cli-0.12.0.tgz). Read [Settings](docs/SETTINGS.md) and [Backend deployment, pairing and recovery](docs/BACKEND.md). These workflows require your real provider accounts and an installed backend; no external service or device installation is implied by the web deployment.
