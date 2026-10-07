# Nova 0.11: continuity and operational readiness

## Shared web and device context
Deploy the authenticated backend using `docs/BACKEND.md`. Upgrade both backend and CLI to 0.11. Add its HTTPS URL and an issued scoped token under Workspace → Devices & sync. Keys are encrypted in the web vault. Explicitly push or pull goals, `soul.md`, `user.md`, `memory.md`, `companion.json` and memory notes. Review replacements before pulling. Auto-pull is an explicit trust choice. Conflicting revisions reject writes; unsent web edits block automatic replacement. Web replacements retain one pre-pull context backup in `sys:hub-context-backup`.

Connect the device with `nova connect URL` and the matching token in `NOVA_BACKEND_TOKEN`. `nova context pull` loads context outside the project; actual project profiles take precedence. `nova context push` requires interactive review. CLI turns read shared context and publish changed memory notes using revision checks. Source files, credentials and local command permissions are not transferred.

In web chat, Share with CLI exports a copy and displays its session ID. Run `nova context-session ID` in a local project to import a new local conversation, then resume the printed ID. Devices & sync can import a backend conversation into a new web chat. Imported histories do not replay past tool calls or approvals.

## Measured routing
The gateway supports task priority, local/cloud boundaries, observed response-header latency, declared price estimates, reviewed quality ratings and declared context capacity. Enter input/output price per million tokens. Unknown prices rank last in cost mode. Quality is an explicit human rating, not a claim of automatic model evaluation. Latency samples represent successful opening of a provider response, not full response time. No token billing hard limit is implied. Context capacity is checked using a conservative text estimate and output reserve, not the provider’s tokenizer. Local models need an installed inference server and weights; `nova doctor --direct` probes configured localhost routes and checks Node, Git and Docker without installing anything.

## Continuous voice
Save an official OpenAI speech connection and choose a Realtime model your account can access. Live voice streams microphone audio over WebRTC to OpenAI, supports speech interruption and delegates actions through Nova’s normal agent and approvals. Provider keys remain server-side. The Irish spark instruction preset affects delivery; audition the actual model/voice before assuming its accent, gender or energy matches exactly. A chat key may not include speech access. The existing turn-based voice remains available. Sessions stop after ten minutes and cap delegated tasks at twenty; stopping audio does not cancel an already running task. Use the normal Pause button for the task.

Live playback, barge-in, browser permission behavior and perceived accent need an actual microphone and provider account. Automated tests cover protocol/configuration boundaries, not an audio audition.

## Learning review
Workspace → Learning review shows file checks, successful commands and failures from saved observations. A completed answer without checks remains unverified. Review feedback and explicitly accept your own corrected lesson into memory. Reflection digests now include evidence classification. This does not fine-tune weights or automatically rewrite the persona.

## Unattended deployment
`deploy/compose.backend.yml` provides a persistent backend with restart handling; place it behind the included HTTPS reverse proxy. `deploy/nova-backend.service.example` is a Linux service template: create the unprivileged account, set absolute paths, `NOVA_BACKEND_STATE_DIR=/var/lib/nova`, and a protected environment file before installing it.

For local scheduled jobs, build the full repository and adapt `deploy/com.nova.worker.plist.example` on macOS, or run `.worker/worker/main.js` through your service manager. The worker reads `.env.worker`, persists jobs, maintains heartbeat and pauses interrupted actions. It is not installed automatically.

For hosted tasks, build and run `node --env-file=deploy/runner.env .worker/worker/hosted-runner.js`, or adapt `deploy/nova-runner.service.example`. Set the same `NOVA_RUNNER_TOKEN` on the site and dispatcher. An owner-only Site still needs authorized platform access; a runner token alone cannot bypass private-site authentication. The dispatcher sends minute ticks, caps failure retries and stops on invalid/expired access. It does not create jobs or approve new actions. Configure job permissions in Nova first. No hosted task dispatcher is running until these credentials and a host are configured.
