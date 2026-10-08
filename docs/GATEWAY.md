# Native messaging gateway

Run `npm run gateway` and `npm run worker` against the same private `.env.worker`, state directory, model configuration and workspace. The gateway accepts messages; the worker executes bounded jobs and replies. A continuously available process supervisor is required for unattended use.

## Identity and continuity

`NOVA_GATEWAY_LINKS` maps authoritative platform sender IDs to a shared session. Only explicitly linked senders enqueue work. For example:

```json
{"telegram:123456":"personal","discord:456789":"personal","slack:U123":"personal","signal:sender-uuid":"personal","whatsapp:919000000000":"personal"}
```

Do not populate mappings from incoming message text. Shared sessions retain conversational continuity across platforms. `NOVA_GATEWAY_TOOLS` sets the job tool ceiling; default jobs are read-only and have no approved commands. External actions still need a compatible approval workflow.

## Platform setup

| Platform | Configuration | Transport |
| --- | --- | --- |
| Telegram | `NOVA_TELEGRAM_TOKEN` | Existing long polling and voice transcription |
| Discord | `NOVA_DISCORD_TOKEN`, `NOVA_DISCORD_CHANNELS` comma-separated IDs | Bot REST polling; only configured channels; ignore bot authors; suppress reply mentions |
| Slack | `NOVA_SLACK_APP_TOKEN`, `NOVA_SLACK_BOT_TOKEN` | Socket Mode app connections; enable message/app_mention subscriptions and appropriate read/chat scopes |
| WhatsApp Business | `NOVA_WHATSAPP_TOKEN`, `NOVA_WHATSAPP_PHONE_ID`, `NOVA_WHATSAPP_APP_SECRET`, `NOVA_WHATSAPP_VERIFY_TOKEN`, `NOVA_META_API_VERSION` | Signed Cloud API webhooks and text replies |
| Signal | `NOVA_SIGNAL_URL`, optional `NOVA_SIGNAL_ACCOUNT` | Local signal-cli daemon HTTP SSE/RPC; separately install/link signal-cli |

Discord requires permission to read the selected channels and access message content. On its first poll, Nova records the latest offset without replaying old messages. Polling is intended for personal workloads; a high-volume Discord gateway transport remains a future improvement.

Slack acknowledges accepted events after durable enqueue, deduplicates event IDs and reconnects refreshed sockets. Signal persists SSE event IDs for reconnects, ignores group messages and replies through the local daemon. Three failures open an adapter circuit; restart after checking credentials/network/settings. Other configured transports continue independently.

For WhatsApp, expose only `/webhooks/whatsapp` through an HTTPS reverse proxy to the loopback gateway. Preserve raw request bytes and the `x-hub-signature-256` header. Keep `/messages` and gateway administration private. Configure the Cloud API callback verification token; POST signatures use the app secret. Only events for the configured phone ID and linked senders enqueue work. Reply eligibility and conversation windows follow Meta account rules.

## Verification

Tests use synthetic provider envelopes and intercepted requests. They do not send live messages or establish your bot accounts. Inspect platform permissions, then test one linked message and reply before unattended use. Tokens stay in a private environment and are not printed by normalized adapters.
