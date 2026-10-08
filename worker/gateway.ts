import { nativePlatforms } from "./gateway/native";
import { webhookAuthentic, whatsappEnvelopes } from "./gateway/platforms";
import { speechBytes } from "./speech";
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateDir } from "../lib/server/lock";
import { linkedSession } from "../lib/server/sessions";
import { mutateJobs, newJob, jobState } from "../lib/server/jobs";
const token = process.env.NOVA_GATEWAY_TOKEN;
const telegram = process.env.NOVA_TELEGRAM_TOKEN;
const channels = ["telegram", "discord", "slack", "whatsapp", "signal", "cli"];
async function enqueue(input: any) {
  if (
    !channels.includes(input.channel) ||
    typeof input.sender !== "string" ||
    typeof input.requestId !== "string" ||
    !/^[-_a-zA-Z0-9]{1,120}$/.test(input.requestId)
  )
    throw new Error("Invalid normalized envelope");
  const sessionId = linkedSession(input.channel, input.sender);
  if (!sessionId) throw new Error("Sender not linked by server configuration");
  return mutateJobs((state) => {
    const id = input.channel + "-" + input.requestId;
    const existing = state.jobs.find((j) => j.requestId === id);
    if (existing) {
      if (existing.goal !== input.goal || existing.sessionId !== sessionId)
        throw new Error("Duplicate ID conflicts with existing message");
      return existing;
    }
    if (state.jobs.length >= 100) throw new Error("Job limit reached");
    const job = newJob({
      goal: input.goal,
      allowedTools: (
        process.env.NOVA_GATEWAY_TOOLS ||
        "list_files,read_file,search_memory,fetch_url,calculate,delegate"
      ).split(","),
      commands: [],
      maxSteps: 12,
    });
    job.requestId = id;
    job.sessionId = sessionId;
    if (input.reply) job.reply = input.reply;
    else if (input.channel === "telegram")
      job.reply = { channel: "telegram", target: input.sender };
    state.jobs.push(job);
    return job;
  });
}
async function tg(method: string, body: unknown) {
  const response = await fetch(
    `https://api.telegram.org/bot${telegram}/${method}`,
    {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new Error("Telegram " + method + " failed");
  return data.result;
}
async function voice(input: any) {
  if (!process.env.NOVA_STT_KEY)
    throw new Error("Speech provider not configured");
  if (input.file_size > 10000000) throw new Error("Voice memo too large");
  const file = await tg("getFile", { file_id: input.file_id });
  if (
    typeof file.file_path !== "string" ||
    !/^[-_a-zA-Z0-9/.]+$/.test(file.file_path) ||
    file.file_path.includes("..")
  )
    throw new Error("Invalid Telegram file path");
  const response = await fetch(
    "https://api.telegram.org/file/bot" + telegram + "/" + file.file_path,
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error("Voice download failed");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No voice data");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 10000000) throw new Error("Voice memo too large");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return speechBytes(
    Buffer.concat(chunks),
    "voice.ogg",
    "audio/ogg",
    AbortSignal.timeout(90000),
  );
}
async function main() {
  if (!token || token.length < 24)
    throw new Error("Set NOVA_GATEWAY_TOKEN to at least 24 characters");
  await mutateJobs(() => {});
  JSON.parse(process.env.NOVA_GATEWAY_LINKS || "{}");
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/webhooks/whatsapp") {
        if (
          !process.env.NOVA_WHATSAPP_VERIFY_TOKEN ||
          !process.env.NOVA_WHATSAPP_APP_SECRET
        )
          throw new Error("WhatsApp webhook not configured");
        if (
          req.method === "GET" &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") ===
            process.env.NOVA_WHATSAPP_VERIFY_TOKEN
        ) {
          res.setHeader("Content-Type", "text/plain");
          res.end(url.searchParams.get("hub.challenge") || "");
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(403);
          res.end("{}");
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 1000000) throw new Error("Webhook too large");
          chunks.push(c);
        }
        const body = Buffer.concat(chunks);
        if (
          !webhookAuthentic(
            body,
            req.headers["x-hub-signature-256"],
            process.env.NOVA_WHATSAPP_APP_SECRET,
          )
        ) {
          res.writeHead(401);
          res.end("{}");
          return;
        }
        for (const e of whatsappEnvelopes(
          JSON.parse(body.toString()),
          process.env.NOVA_WHATSAPP_PHONE_ID || "",
        ))
          if (linkedSession(e.channel, e.sender)) await enqueue(e);
        res.end('{"accepted":true}');
        return;
      }
      const supplied = createHash("sha256")
        .update(req.headers.authorization || "")
        .digest();
      const expected = createHash("sha256")
        .update("Bearer " + token)
        .digest();
      if (!timingSafeEqual(supplied, expected)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Authorization required" }));
        return;
      }
      if (req.method === "GET") {
        const id = new URL(req.url || "/", "http://localhost").searchParams.get(
          "jobId",
        );
        const job = (await jobState()).jobs.find((j) => j.id === id);
        res.end(
          JSON.stringify(
            job
              ? { jobId: job.id, status: job.status, result: job.result }
              : { error: "Job not found" },
          ),
        );
        return;
      }
      if (req.method !== "POST" || req.url !== "/messages")
        throw new Error("Use POST /messages");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 20000) throw new Error("Message too large");
      }
      const job = await enqueue(JSON.parse(body));
      res.end(JSON.stringify({ jobId: job.id, status: job.status }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.NOVA_GATEWAY_PORT || 4318), "127.0.0.1");
  const stopController = new AbortController();
  void nativePlatforms(enqueue, stopController.signal);
  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
    stopController.abort();
    server.close();
  });
  process.on("SIGINT", () => {
    stopped = true;
    stopController.abort();
    server.close();
  });
  console.log(
    "Nova gateway listening on loopback. Platform bridges must authenticate and normalize sender identity.",
  );
  if (!telegram) return;
  const file = path.join(stateDir(), "telegram-offset.json");
  let offset = 0;
  try {
    offset = JSON.parse(await readFile(file, "utf8"));
  } catch {}
  let failures = 0;
  while (!stopped) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        const m = update.message;
        if (
          (m?.text || m?.voice) &&
          linkedSession("telegram", String(m.chat.id))
        ) {
          try {
            const job = await enqueue({
              channel: "telegram",
              sender: String(m.chat.id),
              requestId: String(update.update_id),
              goal: m.text || (await voice(m.voice)),
            });
            await tg("sendMessage", {
              chat_id: m.chat.id,
              text: "Nova queued your task: " + job.id,
            });
          } catch (e) {
            console.error("Telegram message rejected: " + (e as Error).message);
          }
        }
        offset = update.update_id + 1;
        await writeFile(file, JSON.stringify(offset), { mode: 0o600 });
      }
      failures = 0;
    } catch (e) {
      console.error((e as Error).message);
      if (++failures >= 3) {
        console.error(
          "Telegram circuit opened. Restart after checking configuration.",
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
void main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
