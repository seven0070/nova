# Capability matrix

Reference: Hermes Agent repository and official desktop documentation, inspected 8 October 2026. This matrix describes Nova's implementation, not a benchmark claim of equal maturity.

| Capability | Nova implementation | Verification / remaining difference |
| --- | --- | --- |
| Unified agent | Shared NovaCore for web, worker, CLI and desktop | Automated core/adapter tests |
| Models and local routing | OpenAI-compatible, Anthropic, Ollama/LM Studio compatible endpoints; measured routing | Protocol/route tests; each account/model needs a live check |
| Persona and memory | Editable profiles, confirmed goals/preferences, shared context, recovery and FTS recall | Persistence, conflicts and project isolation tested; no Honcho dialectic service |
| Skills and learning | Skill synthesis, versioned SKILL.md, execution history and quarantine | Permission and regression tests; no independent proof of better reasoning |
| Plugins | Declarative bundles and reviewed MCP HTTP plugins in every main interface | Schema/tool/approval tests; no Hermes-specific desktop plugin API compatibility |
| Desktop coding | File browse/edit review, commands, Git status/diff/stage/commit, undo and worktrees | Git integration tests and three-OS installer builds; device UI testing required |
| Voice | Recorded turns and continuous WebRTC, interruption and task delegation | Relay/configuration tests; live audio and Irish accent need audition; no offline wake-word DSP |
| Messaging | Native Telegram, Discord polling, Slack Socket Mode, WhatsApp signed webhooks, Signal SSE/RPC | Envelope/auth/delivery tests; real credentials and platform setup required |
| Scheduling | Natural-language schedules with timezone and bounded unattended jobs | Schedule/worker tests; requires an installed persistent runner |
| Parallel agents | Isolated read/draft child agents, bounded parallel reads | Isolation and budget tests; no unrestricted child host shells |
| Execution | Local native and constrained Docker commands; MCP/HTTP automation adapters | Approval and sandbox tests; no native SSH/Singularity/Modal/Daytona/Vercel terminal implementations |
| Operations | Scoped device pairing, SQLite WAL, queue bounds, budgets, circuits, logs and backups | Recovery, scope and concurrency tests |
| Distribution | CLI archive and Linux/Windows/macOS desktop artifacts | CI build verification; unsigned, no unattended binary auto-update |

Complete Hermes parity remains open where this matrix names a difference. Feature availability alone does not establish equal model quality, ecosystem breadth or operational maturity.
