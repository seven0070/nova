const { ProjectGit } = require("./runtime/worker/coding/git");
const { DevicePlugins } = require("./runtime/worker/coding/plugins");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  safeStorage,
  globalShortcut,
  Notification,
  session: electronSession,
  shell,
} = require("electron");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const policy = require("./policy.cjs");
const {
  realtimeSession,
  relayRealtime,
} = require("./runtime/lib/agent/realtime");
const { defaultVoice } = require("./runtime/lib/agent/voice");
const { frameworkContext } = require("./runtime/lib/agent/framework");
const { DeviceStore } = require("./runtime/worker/coding/store");
const {
  ProjectFiles,
  projectRoot,
  nativeCommand,
} = require("./runtime/worker/coding/files");
const { BackendClient } = require("./runtime/worker/coding/remote");
const { backendUrl, loadConfig } = require("./runtime/worker/coding/config");
const { runCodingTurn } = require("./runtime/worker/coding/runner");
const { SkillExtensions } = require("./runtime/worker/coding/extensions");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "nova",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let win,
  root,
  store,
  files,
  current,
  active,
  client,
  speechKey = "",
  directSettings,
  pluginTokens = {};
const registry = new SkillExtensions();
const emit = (type, data) => {
  if (win && !win.isDestroyed())
    win.webContents.send("nova:event", { type, data });
};
async function confirm(description, signal = new AbortController().signal) {
  if (signal.aborted) return false;
  const result = await dialog.showMessageBox(win, {
    type: "question",
    title: "Nova permission",
    message: "Review this action",
    detail: String(description).slice(0, 45000),
    buttons: ["Deny", "Approve"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return !signal.aborted && result.response === 1;
}
const needProject = () => {
  if (!root) throw new Error("Open a project first");
};
const idle = () => {
  if (active) throw new Error("Stop the current task first");
};
async function state() {
  return {
    version: app.getVersion(),
    project: root || null,
    session: current || null,
    sessions: store ? await store.list() : [],
    connected: !!client,
    backend: client?.config.backend,
    voiceReady: !!speechKey,
    modelReady: !!client || !!process.env.NOVA_MODEL_BASE,
    running: !!active,
  };
}
async function secretSave() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error(
      "Secure OS key storage is unavailable. Connection works for this app session only.",
    );
  await fs.writeFile(
    path.join(app.getPath("userData"), "connections.enc"),
    safeStorage.encryptString(
      JSON.stringify({
        remote: client?.config,
        speechKey,
        directSettings,
        pluginTokens,
      }),
    ),
    { mode: 0o600 },
  );
}
async function voiceRequest(route, body) {
  if (!speechKey) throw new Error("Add a speech API key first");
  const response = await fetch("https://api.openai.com/v1/" + route, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + speechKey,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Speech provider HTTP " + response.status);
  return response;
}
function handler(name, fn) {
  ipcMain.handle("nova:" + name, async (event, ...args) => {
    if (
      event.sender !== win?.webContents ||
      !policy.senderAllowed(event.senderFrame?.url)
    )
      throw new Error("Untrusted app frame");
    try {
      return await fn(...args);
    } catch (e) {
      throw new Error(e.message || "Operation failed");
    }
  });
}
handler("state", state);
handler("project", async () => {
  idle();
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return state();
  root = await projectRoot(result.filePaths[0]);
  store = new DeviceStore(
    crypto.createHash("sha256").update(root).digest("hex").slice(0, 32),
  );
  files = new ProjectFiles(root, store, confirm);
  current = (await store.list())[0];
  return state();
});
handler("session", async (id) => {
  needProject();
  idle();
  if (id) {
    current = await store.load(policy.checkText(id, 80));
    if (client) {
      try {
        const remote = (await client.load(id)).session;
        if (remote.projectId !== store.projectId)
          throw new Error("Session belongs to another project");
        if (!current || (remote.revision || 0) > (current.revision || 0)) {
          current = remote;
          await store.save(current);
        }
      } catch (e) {
        if (!current) throw e;
      }
    }
    if (!current) throw new Error("Unknown session");
  } else {
    current = {
      id: crypto.randomUUID(),
      projectId: store.projectId,
      title: "New conversation",
      messages: [],
      updatedAt: Date.now(),
    };
    await store.save(current);
  }
  return state();
});
handler("run", async (goal, mode = "plan") => {
  needProject();
  idle();
  policy.checkText(goal, 30000);
  if (!["plan", "native", "docker", "none"].includes(mode))
    throw new Error("Unknown execution mode");
  if (!client && !process.env.NOVA_MODEL_BASE)
    throw new Error(
      "Connect a backend or configure NOVA_MODEL_URL/NOVA_MODEL_KEY before starting",
    );
  if (!current)
    current = {
      id: crypto.randomUUID(),
      projectId: store.projectId,
      title: goal.slice(0, 80),
      messages: [],
      updatedAt: Date.now(),
    };
  if (current.title === "New conversation") current.title = goal.slice(0, 80);
  const release = await store.lock();
  active = new AbortController();
  emit("state", await state());
  try {
    const result = await runCodingTurn({
      goal,
      session: current,
      files,
      store,
      backend: client,
      execution: mode === "plan" ? "none" : mode,
      plan: mode === "plan",
      maxSteps: 20,
      signal: active.signal,
      confirm,
      update: (run) => emit("run", run),
      preview: (text) => emit("preview", text),
    });
    if (Notification.isSupported())
      new Notification({
        title: "Nova task " + result.result.status,
        body: current.title,
      }).show();
    return result;
  } finally {
    active = undefined;
    await release();
    emit("state", await state());
  }
});
handler("recall", async (query) => {
  needProject();
  return store.search(policy.checkText(query, 500));
});
handler("directModel", async (input) => {
  idle();
  const base = backendUrl(policy.checkText(input?.base, 2000)),
    model = policy.checkText(input?.model, 200),
    key = typeof input?.key === "string" ? input.key : "";
  if (key.length > 5000 || !["openai", "anthropic"].includes(input?.protocol))
    throw new Error("Invalid provider settings");
  directSettings = { base, model, key, protocol: input.protocol };
  process.env.NOVA_MODEL_BASE = base;
  process.env.NOVA_MODEL = model;
  process.env.NOVA_MODEL_KEY = key;
  process.env.NOVA_MODEL_PROTOCOL = input.protocol;
  client = undefined;
  let persistence;
  try {
    await secretSave();
    persistence = "OS-encrypted";
  } catch (e) {
    persistence = e.message;
  }
  return { ready: true, persistence };
});
handler("pluginKey", async (id, key) => {
  idle();
  const plugin = (await new DevicePlugins().list()).find((p) => p.id === id);
  if (!plugin?.tokenEnv)
    throw new Error("This plugin has no configured token variable");
  pluginTokens[plugin.tokenEnv] = policy.checkText(key, 5000);
  process.env[plugin.tokenEnv] = pluginTokens[plugin.tokenEnv];
  let persistence;
  try {
    await secretSave();
    persistence = "OS-encrypted";
  } catch (e) {
    persistence = e.message;
  }
  return { ready: true, persistence };
});
handler("plugins", () => new DevicePlugins().list());
handler("installPlugin", async () => {
  idle();
  const picked = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "MCP plugin", extensions: ["json"] }],
  });
  if (picked.canceled) return;
  const registry = new DevicePlugins(),
    manifest = await registry.inspect(picked.filePaths[0]);
  if (
    !(await confirm(
      "Trust this MCP endpoint and its enabled tools?\n" +
        JSON.stringify(manifest, null, 2),
    ))
  )
    throw new Error("Plugin installation denied");
  return registry.install(manifest);
});
handler("removePlugin", (id) => {
  idle();
  return new DevicePlugins().remove(policy.checkText(id, 60));
});
handler("gitChange", async (action, value) => {
  needProject();
  idle();
  const release = await store.lock();
  try {
    const git = new ProjectGit(files, confirm),
      signal = new AbortController().signal;
    if (action === "stage" || action === "unstage")
      return git.stage(value, signal, action === "unstage");
    if (action === "commit") return git.commit(value, signal);
    if (action === "worktree") return git.worktree(value, signal);
    throw new Error("Unknown Git mutation");
  } finally {
    await release();
  }
});
handler("stop", () => {
  active?.abort(new Error("Stopped by user"));
  return { stopped: true };
});
handler("files", async () => {
  needProject();
  return files.list();
});
handler("read", async (name) => {
  needProject();
  return files.read(policy.checkText(name, 1000));
});
handler("git", async (action) => {
  needProject();
  if (!["status", "diff"].includes(action))
    throw new Error("Unknown Git operation");
  return files.git(action);
});
handler("undo", async () => {
  needProject();
  idle();
  const release = await store.lock();
  try {
    return await files.undo(new AbortController().signal);
  } finally {
    await release();
  }
});
handler("terminal", async (command) => {
  needProject();
  idle();
  policy.checkText(command);
  const abort = new AbortController();
  if (
    !(await confirm(
      "Execute a command on your device in " + root + "\n\n" + command,
      abort.signal,
    ))
  )
    throw new Error("Command denied");
  const release = await store.lock();
  active = abort;
  try {
    return await nativeCommand(command, root, abort.signal);
  } finally {
    active = undefined;
    await release();
    emit("state", await state());
  }
});
handler("connect", async (input) => {
  idle();
  let config;
  if (input?.useCLI) config = await loadConfig();
  else
    config = {
      backend: backendUrl(policy.checkText(input?.backend, 2000)),
      token: policy.checkText(input?.token, 5000),
    };
  if (!config.token || config.token.length < 32)
    throw new Error("A backend token of at least 32 characters is required");
  const next = new BackendClient({
    backend: backendUrl(config.backend),
    token: config.token,
  });
  const info = await next.info();
  client = next;
  let persistence;
  try {
    await secretSave();
    persistence = "OS-encrypted";
  } catch (e) {
    persistence = e.message;
  }
  return { connected: true, info, persistence };
});
handler("live", async () => {
  if (!client) throw new Error("Connect a backend first");
  return client.live();
});
handler("control", async (id, type, text) => {
  if (!client) throw new Error("Connect a backend first");
  if (!["stop", "steer"].includes(type)) throw new Error("Invalid control");
  return client.control(
    policy.checkText(id, 80),
    type,
    text === undefined ? undefined : policy.checkText(text, 4000),
  );
});
handler("extensions", () => registry.list());
handler("install", async () => {
  idle();
  const picked = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (picked.canceled) return;
  const bundle = await registry.inspect(picked.filePaths[0]);
  if (
    !(await confirm(
      "Install declarative skill templates? They retain normal tool permissions.\n" +
        JSON.stringify(bundle, null, 2),
    ))
  )
    throw new Error("Installation denied");
  return registry.install(bundle);
});
handler("removeExtension", async (id) => {
  idle();
  return registry.remove(policy.checkText(id, 60));
});
handler("updates", async () => {
  const response = await fetch(
    "https://api.github.com/repos/seven0070/nova/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (response.status === 404)
    return {
      current: app.getVersion(),
      message:
        "No published release yet. Installers are built by GitHub Actions.",
    };
  if (!response.ok) throw new Error("Release lookup HTTP " + response.status);
  const release = await response.json();
  return {
    current: app.getVersion(),
    tag: release.tag_name,
    url: policy.releaseURL(release.html_url) ? release.html_url : undefined,
    prerelease: release.prerelease,
  };
});
handler("openRelease", async (url) => {
  if (!policy.releaseURL(url)) throw new Error("Invalid release URL");
  await shell.openExternal(url);
});
handler("realtime", async (sdp) => {
  needProject();
  if (!speechKey) throw new Error("Add a speech key first");
  const records = (await files.records()).records;
  return relayRealtime(
    sdp,
    speechKey,
    realtimeSession(
      { ...defaultVoice, realtimeVoice: "coral" },
      frameworkContext(records),
    ),
    new AbortController().signal,
    crypto.createHash("sha256").update(store.projectId).digest("hex"),
  );
});
handler("voiceKey", async (key) => {
  speechKey = policy.checkText(key, 5000);
  let persistence;
  try {
    await secretSave();
    persistence = "OS-encrypted";
  } catch (e) {
    persistence = e.message;
  }
  return { ready: true, persistence };
});
handler("transcribe", async (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length > 10000000)
    throw new Error("Voice recording must be under 10 MB");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/webm" }), "nova.webm");
  form.append("model", "whisper-1");
  form.append("language", "en");
  return (await (await voiceRequest("audio/transcriptions", form)).json()).text;
});
handler("speak", async (text) => {
  policy.checkText(text, 4000);
  const response = await voiceRequest("audio/speech", {
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: text,
    response_format: "mp3",
    instructions:
      "Speak in a crisp, modern Irish accent with a feminine voice. Sharp, energetic and slightly urgent, with clear diction. Be warm and steady when the listener is distressed.",
  });
  return new Uint8Array(await response.arrayBuffer());
});
app.whenReady().then(async () => {
  protocol.handle("nova", (request) => {
    try {
      return net.fetch(
        pathToFileURL(policy.assetPath(request.url, path.join(__dirname, "ui")))
          .href,
      );
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  electronSession.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(
        contents === win?.webContents &&
          policy.senderAllowed(contents.getURL()) &&
          permission === "media",
      ),
  );
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#080d15",
    title: "Nova",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!policy.senderAllowed(url)) e.preventDefault();
  });
  try {
    const bytes = await fs.readFile(
      path.join(app.getPath("userData"), "connections.enc"),
    );
    if (
      safeStorage.isEncryptionAvailable() &&
      !(
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text"
      )
    ) {
      const saved = JSON.parse(safeStorage.decryptString(bytes));
      if (saved.remote) client = new BackendClient(saved.remote);
      speechKey = saved.speechKey || "";
      directSettings = saved.directSettings;
      pluginTokens = saved.pluginTokens || {};
      for (const [name, key] of Object.entries(pluginTokens))
        if (/^NOVA_MCP_[A-Z0-9_]{1,80}$/.test(name) && typeof key === "string")
          process.env[name] = key;
      if (directSettings) {
        process.env.NOVA_MODEL_BASE = backendUrl(directSettings.base);
        process.env.NOVA_MODEL = directSettings.model;
        process.env.NOVA_MODEL_KEY = directSettings.key;
        process.env.NOVA_MODEL_PROTOCOL = directSettings.protocol;
      }
    }
  } catch {}
  await win.loadURL("nova://app/index.html");
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (win.isVisible() && win.isFocused()) win.hide();
    else {
      win.show();
      win.focus();
      emit("focus", {});
    }
  });
  win.on("close", (e) => {
    if (active) {
      e.preventDefault();
      win.hide();
    }
  });
});
app.on("will-quit", () => {
  active?.abort();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => app.quit());
