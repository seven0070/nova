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

For multiple independent token scopes, set `NOVA_BACKEND_TOKENS` in your environment. Devices that need to share context must use the same label/token scope. Different labels are isolated. To revoke a token, remove it and restart the backend.

## Persistent OS service

For Linux, adapt `deploy/nova-backend.service.example`: create the service account and state directory, use absolute Node/project paths, and set `NOVA_BACKEND_STATE_DIR=/var/lib/nova` in a protected environment file. Register and start the reviewed unit with systemd. The example is a template, not an already installed service.

For macOS, use your own launchd job with the printed Node/backend arguments and environment file, or run the backend manually while connecting it. `deploy/com.nova.worker.plist.example` is for the separate scheduled worker, not the model backend. Do not claim a heartbeat from the model backend means the worker is running.

## Link the web app

Workspace → Devices & sync accepts the HTTPS URL and issued token, stored in the encrypted web vault. Explicitly push the web profiles/notes first if the backend is empty. CLI `nova context pull` reads that context, while local project files retain priority. Test continuity by saving a harmless note in web memory, pushing it, pulling from the CLI, then asking Nova to find the note. See [the complete connection checklist](CONNECT_EVERYTHING.md).
