# Settings and backend operations — Nova 0.12

Settings → Setup & health gathers model status, voice configuration, shared memory, runner setup, task counts and daily model usage. The web/local workspace has its own model-call limit; the standalone backend has a separate `NOVA_BACKEND_DAILY_CALLS` setting.

Saving a model connection automatically attempts bounded model discovery using the encrypted credential on the server. A listing proves reachability, not generation. Use **Test model · uses API** to make a real agent-format request; it can incur provider charges and does not execute tools. States are configured, verified or unavailable. Editing a saved connection invalidates its check; timestamps show when verification happened. A check does not continuously monitor provider uptime. Providers without model-list endpoints can still be configured manually and tested.

Voice retains the Irish preset, preview, pace and live conversation controls. A configured key does not verify speech entitlement or the exact accent. Preview with your account and microphone before relying on it.

Devices & memory exposes hub trust preferences and explicit pull/push. Unsaved web changes are protected against automatic replacement. **Recover previous web memory** restores the profiles/notes saved before the last pull, retains the replaced copy and disables auto-pull for review. Export a personal backup before recovery; the download contains workspace files, notes and chats but excludes encrypted connections and system secrets. Multi-record hub replacement uses checkpoints rather than a single cross-record transaction; interrupted recovery can be retried from its saved copy.

Backend administrators can list paired devices, issue a five-minute one-use code, revoke scoped tokens and inspect queue/usage/audit health. Connect a paired token for normal daily use; use administrator access on trusted devices for management. Detailed setup, SQLite migration and backup/restore instructions are in [BACKEND.md](BACKEND.md).

Background task checkpoints that repeatedly abort enter a bounded recovery cycle with increasing delay, stopping after three recoveries. Existing model/tool budgets still apply. The setup dashboard shows expired leases eligible for recovery; a configured runner token does not prove the external service is running.
