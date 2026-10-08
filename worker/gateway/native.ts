import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stateDir } from "../../lib/server/lock";
import { linkedSession } from "../../lib/server/sessions";
import {
  discordEnvelope,
  slackEnvelope,
  slackChannelAllowed,
  signalEnvelope,
  signalURL,
  platformJSON,
  type Envelope,
} from "./platforms";
export type Accept = (envelope: Envelope) => Promise<unknown>;
async function state(name: string, value?: unknown) {
  const file = path.join(stateDir(), name + ".json");
  if (value === undefined) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw e;
    }
  }
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
  await rename(tmp, file);
}
async function supervised(
  name: string,
  signal: AbortSignal,
  run: () => Promise<void>,
) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      await run();
      if (!signal.aborted) await delay(1000, undefined, { signal });
    } catch (e) {
      if (signal.aborted) return;
      if (++failures >= 3) {
        console.error(
          name +
            " circuit opened after three failures; restart after fixing configuration.",
        );
        return;
      }
      console.error(name + " disconnected; reconnecting (" + failures + "/3).");
      await delay(Math.min(30000, 1000 * 2 ** failures), undefined, {
        signal,
      }).catch(() => {});
    }
  }
}
export async function discord(accept: Accept, signal: AbortSignal) {
  const channels = (process.env.NOVA_DISCORD_CHANNELS || "")
    .split(",")
    .filter(Boolean);
  if (
    !channels.length ||
    channels.length > 20 ||
    channels.some((id) => !/^\d{1,30}$/.test(id))
  )
    throw new Error("Choose 1–20 Discord channel IDs");
  const offsets = await state("discord-offsets");
  await supervised("Discord", signal, async () => {
    for (const channel of channels) {
      const list = await platformJSON(
        "https://discord.com/api/v10/channels/" +
          channel +
          "/messages?limit=50" +
          (offsets[channel] ? "&after=" + offsets[channel] : ""),
        "Bot " + process.env.NOVA_DISCORD_TOKEN,
        undefined,
        signal,
      );
      if (!Array.isArray(list)) throw new Error("Invalid Discord messages");
      if (!offsets[channel]) {
        offsets[channel] =
          list
            .map((m) => m.id)
            .filter((id: any) => /^\d+$/.test(id))
            .sort((a: string, b: string) =>
              BigInt(a) < BigInt(b) ? 1 : -1,
            )[0] || "0";
        await state("discord-offsets", offsets);
        continue;
      }
      for (const m of list.sort((a, b) =>
        BigInt(a.id) < BigInt(b.id) ? -1 : 1,
      )) {
        const e = discordEnvelope(m, channel);
        if (e && linkedSession(e.channel, e.sender)) await accept(e);
        offsets[channel] = m.id;
        await state("discord-offsets", offsets);
      }
    }
    await delay(3000, undefined, { signal });
  });
}
export async function slack(accept: Accept, signal: AbortSignal) {
  await supervised("Slack", signal, async () => {
    const data = await platformJSON(
        "https://slack.com/api/apps.connections.open",
        "Bearer " + process.env.NOVA_SLACK_APP_TOKEN,
        {},
        signal,
      ),
      url = new URL(data.url);
    if (
      url.protocol !== "wss:" ||
      !(url.hostname === "wss.slack.com" || url.hostname.endsWith(".slack.com"))
    )
      throw new Error("Invalid Slack socket URL");
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      const stop = () => {
        socket.close();
        resolve();
      };
      signal.addEventListener("abort", stop, { once: true });
      let pending = Promise.resolve();
      socket.onmessage = (event) => {
        let data: any;
        try {
          if (String(event.data).length > 1000000) throw new Error();
          data = JSON.parse(String(event.data));
        } catch {
          socket.close();
          reject(new Error("Invalid Slack frame"));
          return;
        }
        if (data.type === "disconnect") {
          socket.close();
          return;
        }
        if (!data.envelope_id) return;
        const e = slackEnvelope(data.payload);
        if (
          !e ||
          !slackChannelAllowed(e.reply!.target) ||
          !linkedSession(e.channel, e.sender)
        ) {
          socket.send(JSON.stringify({ envelope_id: data.envelope_id }));
          return;
        }
        pending = pending
          .then(async () => {
            await accept(e);
            if (socket.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ envelope_id: data.envelope_id }));
          })
          .catch(() => {
            socket.close();
            reject(new Error("Slack persistence failed"));
          });
      };
      socket.onerror = () => {
        socket.close();
        reject(new Error("Slack socket unavailable"));
      };
      socket.onclose = () => {
        signal.removeEventListener("abort", stop);
        void pending.then(resolve, reject);
      };
      if (signal.aborted) stop();
    });
  });
}
export async function signal(accept: Accept, abort: AbortSignal) {
  const base = signalURL(process.env.NOVA_SIGNAL_URL || "");
  let last = (await state("signal-offset")).id;
  await supervised("Signal", abort, async () => {
    const response = await fetch(base + "/api/v1/events", {
      headers: last ? { "Last-Event-ID": last } : {},
      signal: abort,
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new Error("Signal daemon unavailable");
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!abort.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder
          .decode(chunk.value, { stream: true })
          .replace(/\r\n/g, "\n");
        if (buffer.length > 1000000)
          throw new Error("Signal event exceeds limit");
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const lines = frame.split("\n"),
            id = lines
              .find((l) => l.startsWith("id:"))
              ?.slice(3)
              .trim(),
            raw = lines
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
          if (raw) {
            const e = signalEnvelope(JSON.parse(raw));
            if (e && linkedSession(e.channel, e.sender)) await accept(e);
          }
          if (id) {
            last = id;
            await state("signal-offset", { id });
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  });
}
export async function nativePlatforms(accept: Accept, abort: AbortSignal) {
  const tasks: Promise<void>[] = [];
  if (process.env.NOVA_DISCORD_TOKEN) tasks.push(discord(accept, abort));
  if (process.env.NOVA_SLACK_APP_TOKEN && process.env.NOVA_SLACK_BOT_TOKEN)
    tasks.push(slack(accept, abort));
  if (process.env.NOVA_SIGNAL_URL) tasks.push(signal(accept, abort));
  await Promise.allSettled(tasks).then((results) => {
    for (const r of results)
      if (r.status === "rejected" && !abort.aborted)
        console.error(
          "Native platform failed configuration; check gateway settings.",
        );
  });
}
