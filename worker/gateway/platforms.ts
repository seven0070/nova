import { createHmac, timingSafeEqual } from "node:crypto";
export type Envelope = {
  channel: string;
  sender: string;
  requestId: string;
  goal: string;
  reply?: { channel: string; target: string; thread?: string };
};
const id = (v: unknown) => typeof v === "string" && /^\d{1,30}$/.test(v);
export function discordEnvelope(m: any, channel: string): Envelope | undefined {
  if (
    !id(channel) ||
    !id(m?.id) ||
    m.author?.bot ||
    !id(m.author?.id) ||
    typeof m.content !== "string" ||
    !m.content.trim()
  )
    return;
  return {
    channel: "discord",
    sender: m.author.id,
    requestId: m.id,
    goal: m.content,
    reply: { channel: "discord", target: channel },
  };
}
export function slackEnvelope(payload: any): Envelope | undefined {
  const e = payload?.event;
  if (
    !e ||
    !["message", "app_mention"].includes(e.type) ||
    e.bot_id ||
    e.subtype ||
    typeof e.text !== "string" ||
    !e.text.trim() ||
    !/^[-_a-zA-Z0-9]{1,80}$/.test(e.user) ||
    !/^[-_a-zA-Z0-9]{1,80}$/.test(e.channel) ||
    typeof payload.event_id !== "string"
  )
    return;
  return {
    channel: "slack",
    sender: e.user,
    requestId: payload.event_id,
    goal: e.text.replace(/<@[A-Z0-9]+>/g, "").trim(),
    reply: { channel: "slack", target: e.channel, thread: e.thread_ts || e.ts },
  };
}
export function signalEnvelope(data: any): Envelope | undefined {
  const e = data?.params?.envelope || data?.params?.result?.envelope,
    body = e?.dataMessage,
    sender = e?.sourceUuid || e?.sourceNumber || e?.source;
  if (
    !sender ||
    typeof body?.message !== "string" ||
    !body.message.trim() ||
    body.groupInfo ||
    !Number.isFinite(e.timestamp)
  )
    return;
  return {
    channel: "signal",
    sender,
    requestId: createHmac("sha256", "nova-signal-id")
      .update(sender + ":" + e.timestamp + ":" + String(e.sourceDevice || 1))
      .digest("hex"),
    goal: body.message,
    reply: { channel: "signal", target: sender },
  };
}
export function whatsappEnvelopes(data: any, phoneId: string): Envelope[] {
  const out: Envelope[] = [];
  for (const entry of data?.entry || [])
    for (const change of entry.changes || []) {
      const v = change.value;
      if (v?.metadata?.phone_number_id !== phoneId) continue;
      for (const m of v.messages || []) {
        if (
          !id(m.from) ||
          m.type !== "text" ||
          typeof m.text?.body !== "string" ||
          !m.text.body.trim() ||
          typeof m.id !== "string"
        )
          continue;
        out.push({
          channel: "whatsapp",
          sender: m.from,
          requestId: createHmac("sha256", "nova-message-id")
            .update(m.id)
            .digest("hex"),
          goal: m.text.body,
          reply: { channel: "whatsapp", target: m.from },
        });
      }
    }
  return out;
}
export function webhookAuthentic(
  body: Buffer,
  signature: unknown,
  secret: string,
) {
  if (
    !secret ||
    typeof signature !== "string" ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(body).digest(),
  );
}
export function signalURL(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("Signal daemon must use a loopback HTTP URL");
  return u.origin;
}
export async function platformJSON(
  url: string,
  token: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw Object.assign(new Error("Platform HTTP " + r.status), {
      status: r.status,
      retryAfter: Number(r.headers.get("retry-after") || 0),
    });
  const data: any = await r.json();
  if (data.ok === false || data.error)
    throw new Error("Platform rejected request");
  return data;
}
export async function deliver(
  reply: NonNullable<Envelope["reply"]>,
  text: string,
) {
  const env = process.env,
    message = text.slice(0, 3500) || "Task finished";
  if (reply.channel === "telegram") {
    if (!env.NOVA_TELEGRAM_TOKEN) throw new Error("Telegram token missing");
    await platformJSON(
      "https://api.telegram.org/bot" + env.NOVA_TELEGRAM_TOKEN + "/sendMessage",
      "",
      { chat_id: reply.target, text: message },
    );
  } else if (reply.channel === "discord") {
    if (!id(reply.target) || !env.NOVA_DISCORD_TOKEN)
      throw new Error("Discord target/token invalid");
    await platformJSON(
      "https://discord.com/api/v10/channels/" + reply.target + "/messages",
      "Bot " + env.NOVA_DISCORD_TOKEN,
      { content: message.slice(0, 1900), allowed_mentions: { parse: [] } },
    );
  } else if (reply.channel === "slack") {
    if (
      !/^[-_a-zA-Z0-9]{1,80}$/.test(reply.target) ||
      !env.NOVA_SLACK_BOT_TOKEN
    )
      throw new Error("Slack target/token invalid");
    await platformJSON(
      "https://slack.com/api/chat.postMessage",
      "Bearer " + env.NOVA_SLACK_BOT_TOKEN,
      {
        channel: reply.target,
        text: message,
        mrkdwn: false,
        ...(reply.thread ? { thread_ts: reply.thread } : {}),
      },
    );
  } else if (reply.channel === "whatsapp") {
    if (
      !id(reply.target) ||
      !id(env.NOVA_WHATSAPP_PHONE_ID) ||
      !env.NOVA_WHATSAPP_TOKEN ||
      !/^v\d+\.0$/.test(env.NOVA_META_API_VERSION || "")
    )
      throw new Error("Configure WhatsApp phone, token and Meta API version");
    await platformJSON(
      "https://graph.facebook.com/" +
        env.NOVA_META_API_VERSION +
        "/" +
        env.NOVA_WHATSAPP_PHONE_ID +
        "/messages",
      "Bearer " + env.NOVA_WHATSAPP_TOKEN,
      {
        messaging_product: "whatsapp",
        to: reply.target,
        type: "text",
        text: { body: message },
      },
    );
  } else if (reply.channel === "signal") {
    await platformJSON(
      signalURL(env.NOVA_SIGNAL_URL || "") + "/api/v1/rpc",
      "",
      {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "send",
        params: {
          recipient: [reply.target],
          message,
          ...(env.NOVA_SIGNAL_ACCOUNT
            ? { account: env.NOVA_SIGNAL_ACCOUNT }
            : {}),
        },
      },
    );
  } else throw new Error("Unsupported reply channel");
}
