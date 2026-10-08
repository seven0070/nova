# Nova Code CLI 0.10

Nova Code connects a local project to a hosted Nova backend. The model runs through the backend; file tools and reviewed commands run on your device. It uses NovaCore for planning, observations, bounded retries, permissions, memory, skills, and child-agent delegation. This is a coding-agent foundation, not complete Claude Code feature parity.

## Install on your device

Requires Node.js 22.13 or newer. The repository archive includes a precompiled, smaller CLI package:

```sh
npm install -g ./nova-device-cli-0.11.1.tgz
nova --help
```

Alternatively, from the source repository:

```sh
npm ci
npm run worker:build
npm link
```

On an Apple Silicon Mac, use the native ARM64 Node distribution. Docker Desktop is optional if you explicitly choose native commands; Docker is required for the default sandboxed commands. The package was tested on Linux with Node 24; macOS and Windows installation were not exercised here.

## Run a backend

Use a Node host, VPS, or container host that supports persistent processes, streaming HTTP responses, and persistent disk. This backend is provided as deployable source; no production host has been selected or deployed by this update.

```sh
cp .env.backend.example .env.backend
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the generated token in `NOVA_BACKEND_TOKEN`, then configure `NOVA_MODEL_BASE`, `NOVA_MODEL_KEY`, `NOVA_MODEL`, and `NOVA_MODEL_PROTOCOL` in `.env.backend`. Use `openai` for OpenAI-compatible chat-completions providers or `anthropic` for Anthropic Messages. Local loopback providers may omit a provider key; cloud endpoints require HTTPS and a key. Provider support depends on the API protocol and model's ability to follow Nova's structured actions.

```sh
npm ci
npm run worker:build
npm run backend
```

For the included container deployment:

```sh
docker compose -f deploy/compose.backend.yml up -d --build
```

Both examples bind the host port to loopback. Put an HTTPS reverse proxy in front of port 4319 for remote devices; `deploy/Caddyfile.example` is a starting configuration. Configure your domain, DNS, TLS, service restart, disk backups, and provider account before using it remotely. Do not expose an unauthenticated proxy or log bearer tokens. The Docker recipe is supplied but a live Docker deployment was not tested in this environment.

## Connect a project

Your device needs the issued backend token, not the provider key. Enter it without putting the token in command history, for example in Bash:

```sh
read -rs -p 'Backend token: ' NOVA_BACKEND_TOKEN
export NOVA_BACKEND_TOKEN
nova connect https://your-nova-backend.example
unset NOVA_BACKEND_TOKEN
cd /path/to/your/project
nova doctor
nova
```

The token is saved in an owner-only configuration file under `~/.nova-cli`. `NOVA_CLI_HOME` changes that directory. `--backend URL` requires a token for that endpoint; a saved token never silently transfers to another URL. HTTPS is required except for loopback development.

The existing private Nova web app URL is not this machine API. Its access boundary remains in place. You need an accessible deployment of the supplied `/v1` backend. ChatGPT Sites web conversations and device CLI sessions are separate stores in this release.

## Coding workflow

Ask a task such as “Inspect this project, fix the failing parser, and run its tests.” Nova can list, read, and search files, inspect Git status and tracked diffs, propose a targeted patch, write files, verify text, and run an approved command. Every file change displays a diff and asks for approval; commands ask for the exact command. `NOVA.md` and root `AGENTS.md` supply project guidance. Nested `AGENTS.md` resolution is not implemented.

Useful commands:

| Command | Behavior |
| --- | --- |
| `/plan`, `/code` | Switch between read-only planning and reviewed coding |
| `/diff`, `/status` | Inspect tracked Git changes and status |
| `/undo` | Review and undo the latest unchanged Nova edit, including across restarts |
| `/model ID` | Select a backend-allowed model |
| `/new`, `/sessions` | Start a session or list local project sessions |
| `/retry` | Continue an interrupted task with prior observations |
| `nova --continue` | Reopen the latest local project conversation |
| `nova resume SESSION_ID` | Load a local or backend-saved conversation |
| `nova -p "Review this code" --plan --json` | One-shot structured result |

Ctrl-C pauses the active task. Resuming does not automatically replay previous tools. New prompts retain conversation context; use `/retry` for the interrupted goal. Noninteractive and piped runs are always read-only, so no unattended approval bypass exists.

Docker is the default command environment: only the project is mounted, network access is disabled, and resource limits apply. Missing Docker never falls back to the host shell. Pre-pull the configured image and use an image containing your testing tools. To intentionally run commands with your device permissions:

```sh
nova --execution native
```

Native mode still asks for each command; it is not a sandbox and an approved shell command can access paths outside the project. File tools reject traversal, symlinks, credentials, dependency/build folders, and Git internals. They scan bounded text files rather than every file in a large project. Undo covers Nova file-tool edits, not effects of shell commands. Git push/commit, browser control, IDE extensions, automatic test hooks, and remote device control are not specialized CLI features in this release.

## Sessions, keys, and data

Local checkpoints, edit journals, notes, and audits live outside the project under `~/.nova-cli/projects/`. Final sessions also sync to the backend. Failed cloud sync retains the local checkpoint. Optimistic revisions prevent silent overwrites; concurrent session conflicts require choosing the desired session rather than automatic merging.

For the same repository on another device, use a shared logical project name:

```sh
nova --project-id my-repository sessions
nova --project-id my-repository resume SESSION_ID
```

Use the same backend token label to share its sessions. Distinct labels in `NOVA_BACKEND_TOKENS` isolate session storage, even if projects use the same name. Rotate a label's token and restart the backend to revoke its old token while preserving that label's sessions. Source files are not synced: both devices must have the appropriate project checkout. The backend never receives a remote-execution endpoint.

Your prompts, selected local code, and tool observations are sent to the backend and model provider for inference. Synced transcripts and audits may contain project content; persistence uses ordinary protected files, not encrypted-at-rest storage. Known configured tokens are redacted; this is not a guarantee that arbitrary secrets in source or command output are detected. Choose a trusted backend and control its disk retention.

The backend authenticates every endpoint, isolates token labels, caps concurrent requests and session counts, validates payload sizes and model selections, and supports decision streaming. It is a single-process service with local persistent storage; horizontally shared storage and enterprise identity are not included. A different existing backend must implement the Nova `nova-cli/1` protocol, or use `--direct` with local `NOVA_MODEL_*` provider settings.

## Validation

The automated suite exercises real HTTP backend authentication, streamed model decisions using a fixture provider, session isolation and revision conflicts, local approved patches and command execution, undo, read-only mode, denied paths, stale-diff rejection, credential-safe command environments, and actual CLI subprocess connect/resume. It does not make live provider calls, deploy a production backend, or substitute for testing your host's proxy and Docker setup.

For cloud/local model routing and the updated persona, see [Nova 0.10](GATEWAY_SOUL_VOICE.md).

## Shared context and conversation import

See [CONTINUITY.md](CONTINUITY.md). `nova context pull|push` synchronizes approved profile files and notes. `nova context-session ID` copies a backend conversation into the current project without replaying tool operations. `nova doctor --direct` checks configured local model endpoints, Git and Docker.

## Guided setup

`nova setup backend` creates a private single-provider backend configuration. `nova setup local` discovers models from your running loopback inference server. `nova setup connect` saves a backend token after checking the protocol. `nova verify` tests one real structured model decision without executing tools. See [CONNECT_EVERYTHING.md](CONNECT_EVERYTHING.md).
