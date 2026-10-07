# Nova 0.10 — models, direction, and voice

This release adds a multi-provider router, persistent ambitions and check-ins, and the **Nova · Irish spark** synthetic voice preset to the web app. The device CLI/backend also uses the shared router and soul context. Conversational voice is a web feature; the CLI remains text-based.

## Model gateway

Open **Manage connections**. Save a model connection for each provider and a model ID available to your account; use **Fetch provider models** to discover IDs. OpenAI-compatible APIs cover services such as OpenAI, Gemini's compatibility API, OpenRouter, Groq, and DeepSeek. Anthropic uses its Messages protocol. API access and structured decision support are still required; an arbitrary API key cannot work with an unrelated provider protocol.

In **Model gateway**, add these saved connections and assign general, coding, reasoning, or fast roles and priorities. Choose task-aware balanced routing, local-first, local-only, or cloud-only, then **Save & use gateway**. Matching is deterministic keyword/length classification, not a second paid model call or measured quality/cost optimization. Model choice and usage are recorded in the normal run audits. A request retains its selected model once streaming begins.

Failover is off by default. Enabling it permits up to three configured routes to receive the same context after connection failures, rate limits, or server failures. Each route has its own key; keys never transfer across providers. Authentication and malformed-request failures stop rather than changing providers. **Local-only blocks cloud providers even during failover.** Background tasks can select “Model gateway” and use the currently saved policy at each decision.

The hosted web app cannot reach Ollama or LM Studio on your laptop. Run the repository's local web edition or a CLI backend on the same device for loopback models. Ollama defaults to `http://localhost:11434/v1`, LM Studio to `http://localhost:1234/v1`, and llama.cpp commonly to `http://localhost:8080/v1`; configure the actual server and installed model ID. The app does not install model weights or start those servers.

### Device routing

Copy `deploy/model-router.example.json`, replace placeholder model IDs, and enable only the routes you intend to use. `keyEnv` references an environment variable such as `NOVA_OPENROUTER_KEY`; do not put provider keys in the JSON file. Start the CLI backend with `NOVA_ROUTER_FILE` pointing to that file, or set it before `nova --direct`. Environment variables must be exported in the launching shell, or loaded using the existing backend/worker env-file scripts. `nova --direct` does not automatically load `.env.worker`.

```sh
export NOVA_ROUTER_FILE=/absolute/path/to/model-router.json
nova --direct models
nova --direct --model auto
```

`--model route:ID` pins a configured route while retaining the policy's local/cloud boundary. A hosted backend's loopback models are local to that backend host, not to your device. For Docker, loopback means the container; use a host-running backend for the supplied local defaults. Public HTTPS model servers are classified as cloud routes even if you operate them yourself. A remote connection to the standalone backend uses the backend-issued token as before.

## Soul and goals

Open **Workspace & memory → Goals & growth**. Apply the new Nova soul when replacing an existing profile is desired. Existing custom `soul.md` content is preserved until you choose to replace it. The default profile for fresh workspaces already includes the new purpose and tone.

Add goals, why they matter, next steps, and milestones. Mark milestones complete when you have evidence and change goals to active, paused, or completed. **Work on this with Nova** puts a goal-focused prompt into the composer for you to send. Choose a support style: balanced, listen first, practical action, or gentle challenge.

Optional check-ins record feelings you explicitly enter. Nova reads the most recent five check-ins and active goals as context; this is not automatic emotion detection, a diagnosis, or a guarantee of success. Remove check-ins or goals at any time. Edit the human-readable persona under **Profile & skills** and confirmed preferences in `user.md` or Memory. Learning means better saved context and procedures; model weights do not change.

The structured context is stored in `companion.json`. For the device CLI, place a compatible copy in the project to use its goals across sessions; the web store is not automatically shared with CLI project files. A sample shape is:

```json
{"version":1,"support":"balanced","goals":[{"id":"my-project","title":"Finish my project","why":"It matters to me","nextStep":"Draft the plan","status":"active","milestones":[]}],"checkins":[]}
```

## Voice conversation

Open **Voice settings** in the composer or **Settings → Voice**. Save an encrypted speech connection and select it. The default uses OpenAI's `gpt-4o-mini-tts`, built-in `coral` voice, and instructions for a feminine, crisp modern Irish accent with sharp, alert, brisk delivery. It moderates urgency for distress. **Preview Nova voice** generates an audition using your speech account; provider billing may apply.

For ElevenLabs, choose a feminine Irish voice available in your account, enter its voice ID and supported model, and save preferences. An Irish-trained voice is important because the ElevenLabs dispatch uses voice settings rather than the OpenAI accent-instruction field. The app does not clone an actor, create a custom voice in your account, or guarantee an exact accent. Device speech is an explicit alternative and requires an installed `en-IE` voice; its gender and expressiveness depend on your OS.

Choose input:

- **Live browser recognition:** start Voice chat; Nova listens for a turn, sends the recognized text, answers through the same agent core, speaks the final response, and listens again. Browser support varies; silence eventually pauses listening. The browser may send audio to its recognition service.
- **Record a turn:** works through MediaRecorder and an OpenAI-compatible speech transcription endpoint. Start Voice chat, choose Record a turn, then Send recorded turn. Recording ends automatically after 30 seconds. It needs a selected speech connection with transcription support; For ElevenLabs conversation output, use browser recognition instead. Separate audio memos can still be transcribed through the existing upload panel.

Read aloud uses the same saved output voice. **Interrupt Nova** stops playback so you can speak again; it does not cancel a running model/tool task. Stop voice ends the microphone and playback. A normal task pause remains available in the chat composer. Audio is turn-based, not full-duplex Realtime API or an always-on background wake-word service. Browser autoplay policies may require using Read aloud to start playback. Long answers are spoken up to 6,000 characters; the full answer stays in chat.

Voice speech credentials are separate from chat credentials and remain encrypted in the saved connection vault. Recorded microphone input and synthesized text go to the configured speech provider. Voice requires your provider access and browser microphone permissions; no real user speech key was available for an end-to-end accent audition during development.

## Validation and deployment limits

Tests cover role selection, local-only boundaries, explicit failover, credential isolation, persisted goal context, malformed settings, speech request fields, ElevenLabs endpoint restrictions, environment-based device routing, and a real HTTP local-model/backend exchange with a fixture provider. Type checking and builds cover the web UI. Live voice sound, microphone/OS compatibility, live provider accounts, and a real Docker environment were not tested. Hosted publication retains the existing private audience.
