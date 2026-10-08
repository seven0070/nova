# Connect Nova for daily use

Use the code in `seven0070/nova`, branch `nova-0.11`. Use your deployed web instance. Its address is kept outside the public repository.

## Local inference on a MacBook Air M3

Install [Ollama from its official download](https://ollama.com/download), open it, and install a model that fits your available memory. Follow [Ollama's current quickstart](https://docs.ollama.com/quickstart). Nova's local setup accepts an existing OpenAI-compatible inference server; it doesn't download a guessed model or install software remotely.

With the inference server running:

```sh
npm ci
npm run worker:build
npm run cli -- setup local
```

The wizard defaults to `http://localhost:11434/v1` and lists the models returned by your server. For LM Studio, start its local server and enter its base URL, commonly `http://localhost:1234/v1`. Select an actual installed/loaded model. A private backend environment file is generated. Run the printed command to start that backend, then `npm run cli -- setup connect` and `npm run cli -- verify`.

The [Ollama compatibility documentation](https://docs.ollama.com/api/openai-compatibility) describes supported API behavior. Nova requires a model that can produce structured agent decisions; installation alone does not prove this works. An endpoint on your laptop's localhost is unavailable to the hosted web server. For sharing with the hosted web app, deploy an authenticated backend behind HTTPS as described in [BACKEND.md](BACKEND.md), or use Nova's local web edition alongside the device backend.

## Cloud models and routing

Run `nova setup backend` for a single provider, or configure the existing router file and `NOVA_ROUTER_FILE` for multiple providers. Enter your actual model IDs and provider credentials. The web Gateway settings support observed latency, declared input/output token prices, reviewed quality ratings and declared context capacity. Local-only mode doesn't authorize cloud failover. Latency measures response opening, not full response time. Prices are estimates; billing comes from your provider.

## Shared context and conversations

Link the same backend scope in the web app and CLI. Web Workspace → Devices & sync can push/pull soul, goals, preferences and memory notes. Automatic pulling is an explicit trust choice. Revision conflicts protect concurrent writes. Project source files and credentials are not automatically copied.

Try a harmless continuity check: save `Nova setup test: prefer short checklists` as a web memory note, push it, run `nova context pull` in your project, then ask the CLI to find that exact note. Share with CLI exports a conversation copy and prints the command to import it. Context imports don't replay tool approvals.

## Irish speech and interruption

In web Settings → Voice, save a speech key, select it and save preferences. Preview Nova's Irish spark voice and judge its accent/timbre yourself. For continuous Live voice, use an official OpenAI connection with Realtime access and an available model. Speak while Nova is replying to test interruption; read the transcript and ask it to complete a small workspace task to test delegation through ordinary approvals. Microphone audio goes to the speech provider while connected. A chat-model key doesn't necessarily enable speech or Realtime.

Automated tests cover configuration and relay boundaries. They cannot certify how the voice sounds on your phone, or prove microphone permissions without an actual browser session. Stopping live audio does not cancel an already running agent task; use Pause for that task.

## Unattended tasks

Configure jobs and their allowed actions first. For local operation, run the full repository worker and adapt the supplied launchd/systemd worker template. For hosted tasks, configure the matching runner token and run the separate dispatcher with valid private-site access. Review logs and confirm task progress while the browser is closed. These are separate processes from the model backend. A token in configuration does not prove a service is running.

## Learning quality

Review saved task evidence in Workspace → Learning review. A completed response with no observed checks remains unverified. Rate usefulness, correct the lesson in your own words, and accept it into memory only when appropriate. Route quality ratings are human-reviewed scores. These are evidence and feedback checks, not proof of model training or automatic improvement of every future result.

## What still needs your environment

API keys, provider account access, a DNS/hosting target, local inference software/weights, microphone access, and operating-system service registration must be supplied where Nova will run. No provider key belongs in GitHub or chat messages. Configuration wizards, verification commands and service templates support these steps; they do not impersonate access to your local device or provision an unspecified cloud host.
