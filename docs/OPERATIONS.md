# Operational safety and audit infrastructure

All entry points use the shared core's code-enforced permissions, approval checks, circuits, and audit hooks. Prompt instructions cannot grant tools, raise a permission level, or approve a sensitive action.

## Permission hierarchy

| Level | Allowed effects |
| --- | --- |
| read | Read files, list files, search memory, fetch public text, calculate; skill steps inherit the same restrictions |
| workspace | Read effects plus workspace files, notes and reusable skill definitions |
| operator | Workspace effects plus enabled, approved Docker commands |

Set NOVA_PERMISSION_LEVEL=read, workspace, or operator in the local web server and worker environments. The web API enforces its server ceiling, and the core checks every invocation including skill steps. Core bookkeeping (run/audit persistence and initialization of default profiles) is separate from model tool permissions. Read-only runs do not seed profiles. Hosted Nova has workspace permissions and no shell.

Deletions, soul.md/user.md edits, and interactive commands require explicit sign-off. The UI/CLI shows the exact action before execution. Web APIs additionally require a two-minute, single-use receipt whose SHA-256 binding includes the exact command, deletion ID, or profile path/content. Receipts are scoped to the signed-in user in hosted Nova and to the local state directory locally; a changed payload, expired receipt, or replay fails. Model-provided `approved:true` values do not grant core permission. Manual file deletion and profile-editor Save clicks are explicit human intents and obtain matching receipts. Receipt issuance is a same-origin user-interface endpoint, not a model tool.

Background jobs cannot prompt for fresh live approval: they stop sensitive file actions, and shell commands require the user's stored exact allowlist plus the operator level and Docker enablement. That allowlist approves the whole script and its effects on the mounted workspace, so approve only specific scripts you intend to run. Unsupported financial-transaction and production-publishing tools are rejected by the registry. There are no payment or deployment integrations in this release. The command sandbox has no network, so it cannot perform remote transactions or push production code.

## Failure recovery

Three consecutive failures of the same tool open its circuit and halt the run; a successful result resets that tool's count. Failed exit codes, denials, timeout flags, stopped skills and explicit error observations count as failures. Three model-endpoint failures likewise halt calls to a failing API. Nonretryable provider 4xx errors stop immediately; malformed model decisions stop after three format-correction attempts. Existing step budgets and request/command timeouts remain active.

Parallel batches wait for already-started calls to settle before closing a failed run. Up to four read-only calls may already be in flight when a breaker opens; no new batch calls are scheduled after the batch detects a circuit failure. Background failed runs are disabled. Inspect activity/audit, change the task or provider as needed, then explicitly resume. Resume starts a fresh breaker budget and a new audit segment while preserving observed run state. There is no automatic provider switching or blind replay of side effects.

## Audit trail

Open **Workspace → Audit & safety** and export JSONL. Each audit event includes run/segment IDs, sequence, timestamp, prompt version, previous-event hash, current SHA-256 hash and structured data. Events cover run start/end, exact prompts/context supplied to the model, model responses, tool arguments/results, approvals/denials, timing, errors and circuit openings. Prompt hashes identify the actual system prompt variant. Known configured secrets and common credential patterns are redacted; activity persistence also removes known configured secrets.

Provider-reported token usage is captured from streaming usage frames or non-streaming usage fields. If a provider omits counts, the event explicitly labels them unavailable. Nova does not fabricate exact counts, tokenizer IDs, billing figures, or hidden reasoning traces. Raw model text contains the observable answer/action output, not private chain-of-thought.

Logs distinguish browser-reported events from locally generated core events. Hash links support integrity checking within a segment; they do not independently certify that a client reported truthful data, and they are not a signed, immutable external audit service. The owner can explicitly delete audit events, so export/archive traces before cleanup if you need retention. A deployment requiring regulatory/WORM retention should supply an authenticated append-only external audit sink and retention policy. Audit transport failure stops the pipeline instead of silently executing unaudited tools.

Logs can still contain confidential project content despite credential redaction. Access follows the existing private user/local workspace boundary. Audit entries are separate from model-readable workspace files and cannot be overwritten through write_file. Ordinary workspace POST cannot forge an audit record or receipt ID. Each entry is limited to 600 KB; inputs that exceed the bound are rejected rather than silently truncating a supposedly complete log. There is no automatic log deletion in this release; manage/export records in the Audit tab.

## Validation

Tests exercise permission denial before effects, approval requirements, payload-bound single-use receipts, server permission ceilings, three-failure circuits, hash-linked audit records, secret redaction and provider usage capture. Existing worker, CLI, streaming, concurrency and Docker runner tests still apply. Live model integrations and live Docker isolation need your runtime; the Docker test is skipped when the runtime/image are absent.
