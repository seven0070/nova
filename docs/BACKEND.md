# Deploy the Nova CLI backend

The standalone backend runs on a device, VM or container host with Node.js 22.13+. It supplies authenticated model inference, saved conversation copies and shared context. The web deployment does not install this service on your computer.

## Configure and test on your host

After cloning the `nova-0.11` branch:

```sh
npm ci
npm run worker:build
npm run cli -- setup backend
```

The wizard takes the model endpoint, protocol, model ID and a hidden API key. It creates `.nova-setup/backend.env` with owner-only permissions and a randomly generated device token; it refuses to overwrite an existing configuration. Run the start command printed by the wizard. In another terminal:

```sh
npm run cli -- setup connect
npm run cli -- verify
```

Use `http://127.0.0.1:4319` for same-device testing and the generated token from your private environment file. `verify` performs one provider call and checks that the model produces Nova's decision format. It does not execute tools. A successful `/v1/info` response alone does not prove provider/model access.

## Docker host with HTTPS

Copy `.env.backend.example` to `.env.backend` and edit it on the host. Use a unique random backend token and the model credentials. Then:

```sh
docker compose -f deploy/compose.backend.yml up --build -d
```

The container binds its published port to host loopback, persists state in a Docker volume, runs as a non-root user, and restarts after failures. Configure the included `deploy/Caddyfile.example` with your real DNS name and HTTPS certificate setup, using `127.0.0.1:4319` as upstream. Client setup uses that HTTPS URL. A public port without the reverse proxy is not the supplied deployment configuration.

For multiple independent token scopes, set `NOVA_BACKEND_TOKENS` in your environment. Administrator labels remain isolated. Pair devices under the same administrator to share context without sharing the administrator token. Removing an administrator token and restarting also disables its paired devices.

## Persistent OS service

For Linux, adapt `deploy/nova-backend.service.example`: create the service account and state directory, use absolute Node/project paths, and set `NOVA_BACKEND_STATE_DIR=/var/lib/nova` in a protected environment file. Register and start the reviewed unit with systemd. The example is a template, not an already installed service.

For macOS, use your own launchd job with the printed Node/backend arguments and environment file, or run the backend manually while connecting it. `deploy/com.nova.worker.plist.example` is for the separate scheduled worker, not the model backend. Do not claim a heartbeat from the model backend means the worker is running.

## Link the web app

Workspace → Devices & sync accepts the HTTPS URL and issued token, stored in the encrypted web vault. Explicitly push the web profiles/notes first if the backend is empty. CLI `nova context pull` reads that context, while local project files retain priority. Test continuity by saving a harmless note in web memory, pushing it, pulling from the CLI, then asking Nova to find the note. See [the complete connection checklist](CONNECT_EVERYTHING.md).

## Pair and revoke a device

Use your administrator connection on a trusted terminal:

```sh
nova devices pair Laptop --scopes decisions,context:read,context:write,sessions:read,sessions:write
```

This prints a random one-use code valid for five minutes, not a provider key. On the new device, run `nova pair https://YOUR_BACKEND` and enter the code at the hidden prompt. For noninteractive setup, supply `NOVA_PAIR_CODE` as a protected environment variable, never a command argument. The resulting token is stored in the local CLI configuration with owner-only permissions. The backend stores only its hash. Pairing inherits the administrator's context namespace; scopes are enforced on every request. Paired devices cannot issue codes, inspect administrative audits, make snapshots or revoke others.

`nova devices list` shows issued devices and scopes. `nova devices revoke DEVICE_ID` persists revocation across restarts. New requests are rejected immediately; an already running request may finish. The same controls are available under web Settings → Devices & memory when the linked hub uses an administrator token.

## Storage, recovery and health

Nova 0.12 stores backend sessions, context, routing metrics, daily request counters, device credentials and a bounded operational audit in `NOVA_BACKEND_STATE_DIR/nova.sqlite`. Node 22.13+ includes the required SQLite API. WAL and synchronous commits protect transaction consistency. Schema version 1 is created on first start; newer unknown schemas fail closed. Existing recognized JSON session/context/metrics files are validated and imported in one transaction once, preserving revisions. Original JSON files are retained. Back up the old state directory before an upgrade; the one-time importer will not repeatedly re-import changed old files.

`nova backend-health` reports schema version, daily logical requests/failures, bounded inference queue counts and the last 30 administrative events for your namespace. Audits contain event metadata, not raw prompts, keys or pairing codes; the database retains up to 2,000 events globally. This is an operational audit, not a billing ledger or complete token trace.

`nova backend-backup` creates a consistent SQLite snapshot in the host state's `backups/` directory, with owner-only file permissions. It returns the filename; it does not download the database to the device. At most ten snapshots can be created before the host operator must archive old snapshots. These backups contain private conversation data and hashed device credentials. To restore: stop the service, preserve the current state directory, replace `nova.sqlite` with the chosen snapshot, remove the old `nova.sqlite-wal`/`nova.sqlite-shm` sidecars, and restart. Restoring an older snapshot can restore previously revoked device records, so revoke those again before exposing the service.

Set `NOVA_BACKEND_DAILY_CALLS` to cap logical model calls per administrator namespace per UTC day (`0` disables the cap). All paired devices share this budget. Failed calls count; provider retries may create multiple billable requests. Inference uses a bounded queue: four active decisions and sixteen waiting globally, at most eight outstanding per namespace, and sixty incoming decisions per minute per namespace. Disconnects remove waiting requests; a 120-second deadline aborts stalled work. This queue is for inference only; the separate task runner executes scheduled goals with leases, checkpointing and cancellation.
