# Nova 0.7 — autonomous operator capabilities

The hosted UI and local repository use the same NovaCore. No account is connected by default. The hosted page supplies skill synthesis, parallel read-only child agents, voice dictation, audio/image transcription, profiles, memory and audit records while open. Unattended work, native gateways and container automation run in the local edition.

## Skill synthesis and evolution

A completed run with 3–12 successful read-only calls automatically produces:

- `skills/learned-<signature>.json` — executable, validated tool templates.
- `skills/learned-<signature>/SKILL.md` — portable procedure, inputs, evidence and limits.
- `skills/learned-<signature>/versions/v1.SKILL.md` — initial immutable-by-convention snapshot.

The signature groups the same tool sequence and argument keys. Task values are replaced with named parameters, never copied into generated procedures. Repeat executions update the evidence count and latest run reference. Use `run_skill` with `parameters`; all parameters must be supplied afresh. Skills don't infer that success proves factual correctness. Automated capture excludes writes, deletes, commands, delegation and automation. Failed/interrupted runs are never synthesized. Read-only ingresses and jobs without `save_skill` permission do not auto-save a skill.

The `save_skill` tool also emits SKILL.md and a version snapshot. Changing steps or the description increments the version. New automatic method shapes receive a new signature rather than silently replacing existing procedures. Editing files through the manual editor doesn't itself create version snapshots; ask Nova to revise through `save_skill`. Every reused step still passes through NovaCore permission checks. There is no model-weight training or uncontrolled executable code generation.

## Shared gateway and sessions

Configure the same state/workspace paths and model in `.env.worker` and `.env.local`, then:

```sh
npm run worker:build
npm run worker
# In a second terminal:
npm run gateway
```

`NOVA_GATEWAY_TOKEN` must be at least 24 characters. Listener defaults to loopback port 4318. Keep it behind an authenticated service boundary; never bind it directly to the Internet. Set trusted mappings in the environment:

```dotenv
NOVA_GATEWAY_LINKS={"telegram:123456":"personal","discord:approved-user":"personal","slack:approved-user":"personal"}
```

Only the server can bind an identity to a session. Treat platform bridges as trusted: they MUST authenticate platform webhook signatures/users themselves before forwarding normalized identities. Never forward a client-provided sender without verification. Session IDs share the last 20 messages plus common persistent profiles/memory. CLI continuity uses `npm run cli -- --session personal "continue the investigation"`. Ordinary web chats retain their current browser conversation; cross-platform linking is local gateway/CLI only in this version.

Native Telegram polling uses `NOVA_TELEGRAM_TOKEN`. Link a trusted **private chat ID**; do not link group chat IDs if a single-user identity is intended. Disable Telegram webhooks before polling. Text and voice messages queue bounded read-only jobs by default. Completion replies go to that configured chat. Delivery errors are recorded; tasks aren't repeated just to retry a message. Telegram replies are capped to 4,000 characters. Telegram polling opens a circuit after three failed requests. The HTTP daemon remains available for other bridges.

Discord, Slack, WhatsApp and Signal have a common authenticated bridge interface, **not native platform SDKs**. Platform-specific token/webhook registration and signature verification must be supplied by your bridge. `examples/platform-bridge.mjs` is a reusable relay client, not a verified external account connection. Send:

```json
{"channel":"discord","sender":"approved-user","requestId":"stable-platform-message-id","goal":"summarize the saved investigation"}
```

POST to `http://127.0.0.1:4318/messages` with `Authorization: Bearer <token>`. Request IDs deduplicate retries within each channel and reject goal/session conflicts. Poll `GET /?jobId=<returned-id>` for structured status/result; a bridge delivers this to its authenticated origin. The daemon handles bridge traffic alongside Telegram. The scheduler worker executes jobs sequentially to avoid shared-session races; child tasks can overlap inside a job. Exactly-once external message delivery isn't guaranteed across crashes.

The web `/api/gateway` route retains its existing compatibility contract; pass channel/sender only for configured trusted links. Existing jobs have a 100-record limit; archive/delete old jobs deliberately.

## Natural-language schedules

In Automation, enter a goal, one supported timing phrase and an explicit IANA timezone. The preview shows the next occurrence before you queue it. Supported examples:

- `every morning at 8 AM`
- `daily at 18:30`
- `every Monday at 9 AM`
- `weekly on Friday at 17:00`
- `every 2 hours` (minimum five minutes)

Calendar schedules use local wall time rather than fixed 24-hour intervals. Nonexistent DST times skip that date; repeated clock hours fire once per local date. Next recurrence is computed after successful completion; missed occurrences do not replay in a burst. Failures pause the job. Results can go to the configured approved webhook using the job's notification checkbox. Arbitrary prose/holiday calendars are not parsed. This ships scheduler software; no personal recurring task is created for you by this update.

## Child delegation

`delegate` accepts one to three specific goals. Each child gets an independent read-only snapshot and fresh transcript, up to six model steps, shared parent cancellation, and a unique run ID. Children can't write, command, automate, or delegate recursively. Parent tool allowlists restrict child tools too. Result envelopes contain parent ID, child ID, status and findings; audit entries retain lineage and child model/tool events. Calls run concurrently; this is internal asynchronous RPC in one process, not independent OS processes. Budget for up to 18 additional child model steps per delegated call. Heavy shell work remains explicit sequential approved Docker commands in this version.

## Background browser and virtual desktop

`automation/` includes a reference Python Playwright/Xvfb service and Dockerfile. Build with `docker build -t nova-automation:local automation`. Obtain/review the Chromium seccomp profile linked from [Playwright's Docker documentation](https://playwright.dev/python/docs/docker); set `NOVA_SECCOMP_PROFILE` to its path. Set a long `NOVA_AUTOMATION_TOKEN` and exact `NOVA_BROWSER_DOMAINS`, then run `sh automation/run.sh`.

Set adapter URLs to `http://127.0.0.1:4320` in `.env.worker` and `.env.local`. Operator setup reports configuration only, not a connectivity certification. Browser tools are hidden until configured. Every request needs explicit approval and a single-use receipt in the web edition. Background jobs can't invoke these tools. Never mount host folders, host X sockets, browser profiles, Docker sockets or secrets into this container. No host cursor/display is shared. Root filesystem is read-only; ephemeral directories, resources and privileges are constrained. Chromium sandbox is required; do not disable it if launch fails. Desktop mode requires `NOVA_VIRTUAL_DESKTOP=1`; it controls the container's own Xvfb display and xterm, not arbitrary host applications.

Browser actions: navigate approved HTTPS URL; extract, screenshot, click CSS selector, fill text, scroll. No arbitrary JavaScript evaluation, downloads, service workers or WebSockets; reference adapter blocks non-GET/HEAD requests. A click can still cause a side effect through GET, so review every approved action. Each browser request gets a fresh profile; browser login/session persistence isn't implemented. Desktop actions: screenshot, click coordinates, type, key. Images are returned as base64 observations; model-native screenshot interpretation isn't automatic.

**Deployment boundary:** DNS public-address checks and domain allowlists are defense in depth, not a complete network firewall. For untrusted pages, deploy behind an egress firewall/proxy that denies private/metadata destinations and protects against DNS rebinding. Container networking remains enabled for browser access; desktop actions can start programs inside the container. This reference service requires a security-reviewed deployment; it isn't a production hardened remote-desktop platform. Browser/desktop live execution was not tested here because Docker isn't available. Contract, approval and validation tests use an adapter fixture.

## Voice and multimodal transcripts

Mic starts browser SpeechRecognition explicitly. Optional “Hey Nova” gating listens until the phrase is heard, then appends subsequent dictated text. It works only while the page is open/listening and doesn't restart after browser end/errors. There is a visible microphone indicator and stop control. Browser support varies and its speech service may process audio remotely. Dictation never automatically sends a message or approves a tool.

Voice opens an in-memory speech provider configuration and accepts audio memos (10 MB), or PNG/JPEG/WebP images (5 MB). Audio uses an OpenAI-compatible `/audio/transcriptions` endpoint. Images use the currently selected vision-capable OpenAI-compatible or Anthropic model to extract text/describe content. Review generated transcripts in the composer before sending; provider errors remain visible. Speech keys aren't reused blindly across incompatible providers and aren't saved by this panel. Transcription and image descriptions require public HTTPS endpoints in this version.

CLI: `npm run cli -- --session personal --voice ./memo.ogg` with `NOVA_STT_BASE`, `NOVA_STT_MODEL`, `NOVA_STT_KEY`. Telegram voice memos use the same speech adapter; audio download is bounded. Live terminal microphone capture, global OS wake-word listening, video frame transcription and native mobile apps aren't implemented. This is speech/image-to-text continuity; the agent's durable transcript remains text.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`. Automated tests cover schedules/DST, parameterized skills, version evolution, child isolation/concurrency/cancellation, gateway authentication/dedupe/session persistence, model payloads, automation approval receipts and domain restrictions. External credentials and Docker/browser hardware must be tested in your deployment. Never describe an unconfigured platform as connected.
