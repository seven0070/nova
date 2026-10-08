const { contextBridge, ipcRenderer } = require("electron");
const methods = [
  "state",
  "project",
  "session",
  "run",
  "stop",
  "files",
  "read",
  "git",
  "terminal",
  "undo",
  "connect",
  "live",
  "control",
  "extensions",
  "install",
  "removeExtension",
  "updates",
  "openRelease",
  "recall",
  "gitChange",
  "plugins",
  "installPlugin",
  "removePlugin",
  "voiceKey",
  "realtime",
  "transcribe",
  "speak",
];
const api = {};
for (const name of methods)
  api[name] = (...args) => ipcRenderer.invoke("nova:" + name, ...args);
api.onEvent = (fn) => {
  const listener = (_, event) => fn(event);
  ipcRenderer.on("nova:event", listener);
  return () => ipcRenderer.removeListener("nova:event", listener);
};
contextBridge.exposeInMainWorld("nova", Object.freeze(api));
