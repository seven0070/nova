# Nova 0.8: connected agent chatbot

Nova keeps chat and action execution in one core. This upgrade adds synchronized conversations, encrypted provider/integration credentials, document retrieval, native decision tool calls, checkpointed background tasks, isolated draft delegation, voice conversation, backups, and runtime health.

## Configure connections

Open **Manage connections → Saved connections**. Save an AI model with an API base, model ID, API format, and key. The current temporary connection can be saved without pasting its key again. Choose **Use** to select a saved model. Temporary model keys stay in page memory; browser settings never persist raw keys.

| Connection | Setup | What Nova can do |
| --- | --- | --- |
| AI model | OpenAI-compatible or Anthropic Messages base/key/model; optional same-provider fallback model | Chat and agent decisions; saved models also power background tasks |
| GitHub | Personal access token with narrowly scoped repositories and permissions | List repos/branches, read files, compare branches; approved writes on `nova/` branches and draft pull requests |
| MCP | Public HTTPS Streamable HTTP URL; optional bearer token | Discover tool schemas, explicitly enable selected names, validate arguments; every execution requires exact approval |
| Web search | Brave Search API key | Search, fetch source pages, cite their URLs |

MCP uses SDK 1.x negotiation with legacy-compatible Streamable HTTP servers. It does not support stdio servers, OAuth authorization flows, or servers requiring exclusively newer stateless MCP protocols. GitHub OAuth/device login is not included; provide your own token. Nova cannot use arbitrary keys from unrelated API protocols without an adapter.

The hosted app encrypts credentials using its configured `NOVA_VAULT_KEY`. In the local edition, set a base64-encoded 32-byte `NOVA_VAULT_KEY` or let Nova generate `.nova/vault.key` with restrictive file permissions. Keep this file with your local state and protect it like a credential. A local single-user server uses one account (`local`); do not expose its localhost API to the public internet. A hosted account's data and vault scope are isolated by owner.

## Conversations and documents

Chats sync with optimistic revisions. Conflicting device edits are preserved in a recovered draft instead of replacing the newer server version. Deleting a chat archives it; archived conversations remain in backup/history. Local CLI and mapped gateway sessions appear in the web app as `Session: ...` conversations. Separate hosted and local installations are not automatically federated.

Edit a user message in a new branch, regenerate an answer in a new branch, or branch from any assistant response. Markdown, tables, highlighted code, code copying and answer streaming are supported. Native OpenAI/Anthropic tool calls carry the structured `nova_decision` action; incompatible servers fall back to the JSON decision format. Network/transient failures have bounded retries and an optional fallback model.

Attach PDF, DOCX, XLSX/XLS, CSV, text, or code. Document extraction runs in your browser after you select the file; only extracted text is saved to the agent workspace. PDF passages retain page references, spreadsheets retain sheet/row references. Limits: 10 MB documents, first 100 PDF pages or 20 sheets, at most 140,000 extracted characters; truncation is recorded. Text uploads are under 180 KB. Scanned PDFs require external OCR. Retrieval is keyword-ranked, not semantic/vector search. Nova can search full saved chats and retrieve passages using `search_history` and `search_documents`.

## Background execution

Open **Background tasks**, choose a saved model, describe the goal, set a call budget, and optionally supply a schedule and timezone. Scheduling accepts expressions such as `every morning at 8 AM`, `every Monday at 18:30`, and `every 2 hours`. Each task stores a lease, model call count, token accounting, transcript, observations, and progress. Concurrent runners claim the task through compare-and-swap. Stale leases can be reclaimed after a crash. Cancellation is persisted and checked before model calls/checkpoint commits.

Task permissions default to reads. You may explicitly enable workspace file and memory writes. Sensitive commands, deletion, MCP execution, GitHub writes, and profile edits cannot run unattended. Limits are 2–40 model decisions per task occurrence and a default 40,000-token stop threshold, including delegated calls. Token usage is estimated when the provider does not report it; the final in-flight call can exceed the threshold. Provider retries can cause up to three upstream requests for one counted decision. Interactive replies cap primary plus child decisions and token usage separately.

### Local always-on runner

Copy `.env.worker.example` to `.env.worker`, use the same state/workspace directories as the web app, then run:

```sh
npm run worker:build
npm run worker
```

The daemon processes the new saved-connection tasks and the existing Automation jobs. Saved-connection tasks do not require the environment model to be configured. Existing Automation jobs, CLI, and gateway jobs still use the environment model. Use a process manager/systemd for restarts; see the existing autonomy guide. The daemon never executes a host shell as a fallback.

### Hosted continuation

Cloudflare Workers do not provide an indefinite HTTP job lifetime. The hosted app runs approximately 26-second slices using `waitUntil`, so a current slice can finish after a page closes. Later slices resume when the Tasks panel polls or when an external runner calls the authenticated tick endpoint. No always-on scheduler has been provisioned automatically.

For fully unattended hosted operation, configure a random `NOVA_RUNNER_TOKEN` of at least 32 characters as a server secret, then configure your trusted scheduler to POST `/api/runner` every minute with `Authorization: Bearer <token>`. Keep the token in that scheduler's secret store, never source control or a URL. The endpoint returns 202 and runs due tasks in bounded slices. **Workspace → Backup & health** reports whether runner authentication is configured; this does not prove an external scheduler is running. Verify an actual test task completes while the page is closed before relying on it.

## Delegation, verification and learning

`delegate` accepts 1–3 child goals. Default children are read-only with six steps each. With `mode: "draft"`, workspace-authorized children can change isolated virtual file snapshots and return proposed patches. They cannot write parent state, run commands, change profiles, or delegate again. The parent inspects proposals and applies chosen changes through its own `write_file` tool. These children share one process; they are not separate container/process workers.

`verify_file` checks required text, minimum length, optional JSON validity and a content fingerprint. Ask Nova to state concrete acceptance criteria and verify them before concluding. This is criteria-based verification, not proof that arbitrary code is correct. Local testing still runs through approved sandbox commands.

Successful read-only workflows are synthesized into parameterized SKILL.md procedures and track reuse evidence. Skills can include document/history/web retrieval and verification. Written skills are versioned and pass the current permissions on every run. Learning updates files and procedures, not model weights. Earlier observations are compacted into a bounded evidence ledger rather than silently discarded; this is deterministic compaction, not semantic memory summarization.

## Voice, backups and health

**Voice chat** explicitly activates the microphone, automatically submits recognized speech, speaks completed replies using browser speech synthesis, then listens for the next turn where supported. Stop voice ends listening/playback. Availability depends on browser speech APIs, microphone permission and its speech service. Existing dictation, wake phrase, uploaded-audio transcription and image transcripts remain available; transcription uses its own configured key, image transcripts can use the selected encrypted model connection.

**Workspace → Backup & health** downloads/imports encrypted backups using a passphrase of at least 12 characters. AES-GCM authenticates the backup; PBKDF2 derives its key. Backups include files, notes and chats, excluding credentials and queued tasks. Imports are validated and require exact approval before overwriting matching IDs. A restore can partially succeed if storage fails mid-operation; take a fresh backup first and review the result. Back up the local vault key separately if you need to preserve saved credentials.

The health panel checks storage, connection counts, pending tasks and runner configuration. Agent and task audits record prompt versions, model usage when available, tool calls, failures and approvals; known secrets are redacted. Audits are execution evidence, not a tamper-proof third-party certification.

## Validation and remaining setup

Automated tests cover native tool streams/fallback, encrypted vault boundaries, concurrent chat revisions, task leases/cancellation/budgets, verified workspace writes, GitHub approval/default-branch restrictions, MCP discovery/schema validation, isolated drafts, and large encrypted backup recovery. Model/GitHub/MCP responses use fixtures. Live service calls require your credentials. Live Docker, browser/document UI, microphone behavior and unattended hosted scheduling were not verified in this build environment.

Existing bridge gateways and isolated browser/desktop adapters remain available in the local source. WhatsApp/Signal/Slack/Discord native account adapters, plugin marketplace installation, production push/deployment automation, OCR, embeddings, process-isolated subagent execution, and arbitrary self-modifying executable skills are not added by this release. The framework is extensible but does not claim complete Hermes feature parity.
