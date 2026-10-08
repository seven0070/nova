import { readFile, readdir, lstat, unlink } from "node:fs/promises";
import path from "node:path";
import { cliHome } from "./config";
import { atomicJson } from "./store";
import { callMCP } from "../../lib/agent/mcp-client";
import type { ToolCall } from "../../lib/agent/types";
export type Plugin = {
  id: string;
  name: string;
  base: string;
  tokenEnv?: string;
  tools: string[];
};
export function validatePlugin(v: any): Plugin {
  if (
    !v ||
    !/^[-a-z0-9]{1,60}$/.test(v.id) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 100 ||
    !Array.isArray(v.tools) ||
    v.tools.length > 80 ||
    v.tools.some(
      (t: any) => typeof t !== "string" || !/^[-_.a-zA-Z0-9]{1,100}$/.test(t),
    ) ||
    (v.tokenEnv !== undefined && !/^NOVA_MCP_[A-Z0-9_]{1,80}$/.test(v.tokenEnv))
  )
    throw new Error("Invalid MCP plugin manifest");
  const u = new URL(v.base),
    local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (
    (u.protocol !== "https:" && !(local && u.protocol === "http:")) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search
  )
    throw new Error("MCP requires HTTPS or loopback HTTP without URL secrets");
  return {
    id: v.id,
    name: v.name,
    base: u.href,
    tokenEnv: v.tokenEnv,
    tools: [...new Set<string>(v.tools)],
  };
}
export class DevicePlugins {
  get folder() {
    return path.join(cliHome(), "plugins");
  }
  async inspect(file: string) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 30000)
      throw new Error("Select a regular plugin JSON file under 30 KB");
    return validatePlugin(JSON.parse(await readFile(file, "utf8")));
  }
  async install(plugin: Plugin) {
    const value = validatePlugin(plugin);
    await atomicJson(path.join(this.folder, value.id + ".json"), value);
    return value;
  }
  async list() {
    let files: string[] = [];
    try {
      files = await readdir(this.folder);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return Promise.all(
      files
        .filter((n) => /^[-a-z0-9]+\.json$/.test(n))
        .map(async (n) =>
          validatePlugin(
            JSON.parse(await readFile(path.join(this.folder, n), "utf8")),
          ),
        ),
    );
  }
  async remove(id: string) {
    if (!/^[-a-z0-9]{1,60}$/.test(id)) throw new Error("Invalid plugin ID");
    await unlink(path.join(this.folder, id + ".json"));
  }
  async execute(call: ToolCall, signal: AbortSignal) {
    const plugins = await this.list();
    if (call.name === "list_connections")
      return {
        connections: plugins.map((p) => ({
          id: p.id,
          name: p.name,
          kind: "mcp",
          tools: p.tools,
        })),
      };
    const plugin = plugins.find((p) => p.id === call.args.connectionId);
    if (!plugin) throw new Error("Unknown installed plugin");
    const key = plugin.tokenEnv ? process.env[plugin.tokenEnv] : undefined;
    if (plugin.tokenEnv && !key)
      throw new Error("Configure the plugin token environment variable");
    return callMCP(
      { ...plugin, key },
      call.name === "mcp_list" ? undefined : String(call.args.tool),
      call.args.arguments || {},
      signal,
    );
  }
}
