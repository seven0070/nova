# Nova 0.14 desktop workspace

Nova Desktop is a native Electron application that runs the same `NovaCore`, project files, permission checks and persistent session store as `nova chat`. It is separate from the hosted web app; hosting the web app does not install a desktop program.

## Build and start

Use Node 24, npm, and Git. From the repository:

```sh
npm ci
npm run desktop:stage
npm ci --prefix apps/desktop
npm --prefix apps/desktop start
```

Build an installer on your operating system with `npm run desktop:package`. The **Nova desktop installers** GitHub Actions workflow builds Linux AppImage, Windows NSIS and macOS dmg/zip artifacts. These builds are unsigned; signing and macOS notarization require maintainer certificates. The update panel checks published GitHub releases and opens their official download page; it does not install unverified code automatically.

## Daily use

1. Open a project folder. Desktop and CLI use the same real path hash and `~/.nova-cli/projects` storage. A project lock prevents conflicting local execution.
2. Connect an authenticated Nova backend, or import your existing CLI connection. The backend provides model routing and shared memory; execution stays on your device. OS key storage encrypts desktop tokens when available. Linux `basic_text` storage is refused, leaving credentials in memory for this app session only.
3. Choose read-only planning, reviewed file edits, Docker commands, or explicitly approved native commands. Docker needs a working local Docker installation. Diffs and commands appear in native permission dialogs. Git status/diff, a reviewed command panel and exact-change undo are available alongside chat.
4. Use **Live sessions** or the web app’s device hub to observe, steer and stop the original task. Controls are delivered on its next checkpoint, normally every four seconds. File and command approvals stay on the executing device. Cloud session leases expire after 45 seconds without a checkpoint; concurrent cloud edits are refused.
5. Use Ctrl/Cmd+Shift+Space for quick access. Completion notifications use the operating system. Closing the window during a task hides it; use Stop to cancel the task before exiting.

## Voice

Add an OpenAI speech key in **Speech connection**. Record a turn to transcribe into the composer; enable voice replies for Irish Spark speech. **Live voice** uses WebRTC, provider voice activity detection and interruption, delegates task requests to the normal reviewed core, and stops a pending task when you interrupt with speech. Continuous audio is transmitted to OpenAI while connected. Sessions end after ten minutes and twenty delegated tasks. There is no offline wake-word listener. The Irish accent is a delivery instruction on the provider voice, and must be auditioned on your device.

## Portable skill extensions

A local bundle contains `nova-extension.json` with an ID, semantic version, description and declarative skills. Installation displays the complete bundle, tools and SHA-256 digest for review. Editing reviewed content invalidates installation. Installed content is checked before loading. Skills enter the same permission and circuit-breaker flow as ordinary agent tool calls; this is a declarative skill format, not an arbitrary JavaScript plugin SDK.

```json
{"id":"project-audit","version":"1.0.0","description":"Inspect project files","skills":[{"name":"inspect-project","description":"List project files","steps":[{"name":"list_files","args":{}}]}]}
```

```sh
nova extensions install ./project-audit
nova extensions list
nova extensions remove project-audit
nova live
nova steer SESSION_ID "Run the relevant checks before finishing"
nova stop SESSION_ID
```

## Verification boundaries

Automated tests cover leases, concurrent checkpoint revisions, control delivery, extension integrity, traversal rejection and the desktop bridge’s origin and release restrictions. Actual operating-system installation, microphone audio, accent quality and real model-account behavior require device testing. Existing Telegram and HTTP messaging bridges remain available; this release does not claim native parity for every Hermes messaging platform, remote execution backend, plugin SDK or long-term learning evaluation.

## Nova 0.14 additions

The workspace includes reviewed staging/unstaging, staged-diff commits and isolated worktrees. Hooks and commit signing are disabled for these explicit native operations; changed staged content invalidates review. The Tool plugins panel manages the shared CLI MCP registry, and Search conversations queries the project FTS index. See EXTENSIONS.md for token variables and enabled-tool boundaries.

Use **Connect a model directly** to configure OpenAI-compatible or Anthropic inference without a backend, including loopback Ollama/LM Studio endpoints. The backend remains optional for shared-device memory and live controls. The Tool plugins panel accepts plugin tokens into OS-encrypted storage when available; it never places them in the plugin manifest.
