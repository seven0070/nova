const $ = (id) => document.getElementById(id);
let state,
  recording,
  recorder,
  chunks = [],
  speech;
const busy =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      $("activity").textContent = e.message;
      $("activity").className = "error";
    }
  };
function button(text, fn) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = busy(fn);
  return b;
}
function modal(title) {
  $("modal-title").textContent = title;
  $("modal-body").replaceChildren();
  $("modal").showModal();
  return $("modal-body");
}
function input(body, placeholder, type = "text") {
  const i = document.createElement("input");
  i.placeholder = placeholder;
  i.type = type;
  body.append(i);
  return i;
}
function message(role, text) {
  const row = document.createElement("div");
  row.className = "message " + role;
  const name = document.createElement("b");
  name.textContent = role === "user" ? "You" : "Nova";
  row.append(name, document.createTextNode(text));
  $("messages").append(row);
  $("messages").scrollTop = $("messages").scrollHeight;
}
async function render(next) {
  state = next;
  $("status").textContent =
    (next.connected ? "Backend connected" : "Backend not connected") +
    (next.running ? " · Running" : "");
  $("project-name").textContent = next.project || "";
  $("title").textContent = next.session?.title || "Nova workspace";
  $("sessions").replaceChildren();
  for (const s of next.sessions)
    $("sessions").append(
      button(s.title, async () => {
        await render(await nova.session(s.id));
      }),
    );
  $("messages").replaceChildren();
  for (const m of next.session?.messages || []) message(m.role, m.content);
  if (next.session?.run && next.session.run.status !== "completed")
    message(
      "assistant",
      next.session.run.answer || "Task " + next.session.run.status,
    );
  $("send").disabled = next.running;
  $("new").disabled = next.running;
}
$("project").onclick = busy(async () => render(await nova.project()));
$("new").onclick = busy(async () => render(await nova.session()));
$("stop").onclick = busy(() => nova.stop());
$("composer").onsubmit = busy(async (e) => {
  e.preventDefault();
  const goal = $("goal").value.trim();
  if (!goal) return;
  $("goal").value = "";
  message("user", goal);
  $("send").disabled = true;
  const result = await nova.run(goal, $("mode").value);
  $("activity").textContent =
    result.result.status +
    " · " +
    result.modelCalls +
    " model calls" +
    (result.syncError ? " · " + result.syncError : "");
  if ($("voice-reply").checked && result.result.answer)
    await speak(result.result.answer);
});
$("connection").onclick = () => {
  const body = modal("Connect your model backend"),
    url = input(body, "https://your-backend.example"),
    token = input(body, "Backend token", "password");
  body.append(
    button("Connect", async () => {
      const result = await nova.connect({
        backend: url.value,
        token: token.value,
      });
      token.value = "";
      body.textContent = result.persistence;
      await render(await nova.state());
    }),
  );
};
$("cli").onclick = busy(async () => {
  const result = await nova.connect({ useCLI: true });
  $("activity").textContent = result.persistence;
  await render(await nova.state());
});
$("voice-key").onclick = () => {
  const body = modal("Irish Spark voice"),
    key = input(body, "OpenAI speech API key", "password");
  const note = document.createElement("p");
  note.textContent =
    "Recorded speech uses Whisper. Replies use Coral with a crisp Irish accent instruction. Speech is sent to OpenAI and may incur charges. Record again while Nova speaks to interrupt playback.";
  body.append(
    note,
    button("Save connection", async () => {
      const result = await nova.voiceKey(key.value);
      key.value = "";
      body.textContent = result.persistence;
      await render(await nova.state());
    }),
  );
};
async function speak(text) {
  speech?.pause();
  const bytes = await nova.speak(text.slice(0, 4000)),
    url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  speech = new Audio(url);
  speech.onended = () => URL.revokeObjectURL(url);
  await speech.play();
}
$("mic").onclick = busy(async () => {
  speech?.pause();
  if (recording) {
    recorder.stop();
    return;
  }
  if (!state.voiceReady) throw new Error("Add a speech connection first");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream);
  recording = true;
  $("mic").textContent = "■ Finish";
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = busy(async () => {
    clearTimeout(recording);
    recording = false;
    stream.getTracks().forEach((t) => t.stop());
    $("mic").textContent = "● Record";
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    $("goal").value = await nova.transcribe(bytes);
    $("goal").focus();
  });
  recorder.start();
  recording = setTimeout(() => recorder.stop(), 60000);
});
$("browse").onclick = busy(async () => {
  const list = await nova.files();
  $("file-list").replaceChildren();
  for (const name of list.names)
    $("file-list").append(
      button(name, async () => {
        $("preview").textContent = await nova.read(name);
      }),
    );
});
for (const action of ["status", "diff"])
  $("git-" + action).onclick = busy(async () => {
    $("preview").textContent = JSON.stringify(await nova.git(action), null, 2);
  });
$("undo").onclick = busy(async () => {
  $("preview").textContent = JSON.stringify(await nova.undo());
});
$("terminal").onsubmit = busy(async (e) => {
  e.preventDefault();
  $("preview").textContent = JSON.stringify(
    await nova.terminal($("command").value),
    null,
    2,
  );
});
$("live").onclick = busy(async () => {
  const body = modal("Shared live sessions"),
    refresh = async () => {
      const result = await nova.live();
      body.replaceChildren(button("Refresh", refresh));
      for (const item of result.sessions) {
        const p = document.createElement("p");
        p.textContent =
          (item.session?.title || item.sessionId) +
          " · " +
          (item.active ? "running" : item.status);
        body.append(p);
        if (item.active) {
          const steering = input(body, "Steer this task");
          body.append(
            button("Send instruction", () =>
              nova.control(item.sessionId, "steer", steering.value),
            ),
            button("Stop task", () => nova.control(item.sessionId, "stop")),
          );
        }
        const pre = document.createElement("pre");
        pre.textContent = (item.session?.run?.events || [])
          .slice(-8)
          .map((e) => e.title)
          .join("\n");
        body.append(pre);
      }
    };
  await refresh();
});
$("extensions").onclick = busy(async () => {
  const body = modal("Reviewed skill extensions"),
    refresh = async () => {
      body.replaceChildren(
        button("Install a local bundle", async () => {
          await nova.install();
          await refresh();
        }),
      );
      for (const item of await nova.extensions()) {
        const p = document.createElement("p");
        p.textContent =
          item.summary.id +
          " " +
          item.summary.version +
          " · " +
          item.summary.tools.join(", ");
        body.append(
          p,
          button("Remove " + item.summary.id, async () => {
            await nova.removeExtension(item.summary.id);
            await refresh();
          }),
        );
      }
    };
  await refresh();
});
$("updates").onclick = busy(async () => {
  const body = modal("Nova updates"),
    result = await nova.updates();
  body.textContent = JSON.stringify(result, null, 2);
  if (result.url)
    body.append(
      button("View official release", () => nova.openRelease(result.url)),
    );
});
$("modal-close").onclick = () => $("modal").close();
nova.onEvent((event) => {
  if (event.type === "state") void render(event.data);
  if (event.type === "focus") $("goal").focus();
  if (event.type === "run")
    $("activity").textContent = event.data.events
      .slice(-8)
      .map((e) => e.title)
      .join("\n");
  if (event.type === "preview")
    $("activity").textContent = event.data.slice(-1600);
});
void busy(async () => render(await nova.state()))();

let rtc,
  rtcStream,
  rtcAudio,
  rtcTimer,
  rtcClosed = true;
function stopLive() {
  rtcClosed = true;
  clearTimeout(rtcTimer);
  rtc?.close();
  rtc = undefined;
  rtcStream?.getTracks().forEach((t) => t.stop());
  rtcStream = undefined;
  if (rtcAudio) {
    rtcAudio.pause();
    rtcAudio.srcObject = null;
  }
  $("realtime").textContent = "Live voice";
}
$("realtime").onclick = busy(async () => {
  if (rtc) {
    stopLive();
    return;
  }
  if (!state.voiceReady || !state.project)
    throw new Error("Open a project and add a speech connection first");
  if (
    !window.confirm(
      "Start continuous microphone streaming to OpenAI? Speech interruption will also stop an active task. Provider charges apply.",
    )
  )
    return;
  $("realtime").disabled = true;
  try {
    rtcClosed = false;
    rtcStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    rtc = new RTCPeerConnection();
    rtcAudio = new Audio();
    rtcAudio.autoplay = true;
    rtc.ontrack = (e) => {
      rtcAudio.srcObject = e.streams[0];
      void rtcAudio.play();
    };
    for (const track of rtcStream.getTracks()) rtc.addTrack(track, rtcStream);
    const dc = rtc.createDataChannel("oai-events"),
      seen = new Set();
    let tasks = 0,
      pending = false;
    dc.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "input_audio_buffer.speech_started") {
        speech?.pause();
        if (pending) void nova.stop();
      }
      if (data.type === "conversation.item.input_audio_transcription.completed")
        message("user", data.transcript || "");
      if (data.type === "response.output_audio_transcript.done")
        message("assistant", data.transcript || "");
      if (data.type === "error")
        $("activity").textContent = data.error?.message || "Voice error";
      if (
        data.type === "response.function_call_arguments.done" &&
        data.name === "nova_task" &&
        !seen.has(data.call_id)
      ) {
        seen.add(data.call_id);
        const reply = (result) => {
          if (dc.readyState !== "open") return;
          dc.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: data.call_id,
                output: JSON.stringify(result),
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        };
        let goal;
        try {
          const args = JSON.parse(data.arguments);
          goal = args.goal;
          if (
            typeof goal !== "string" ||
            !goal.trim() ||
            goal.length > 12000 ||
            Object.keys(args).some((k) => k !== "goal")
          )
            throw new Error("Invalid task");
        } catch {
          reply({ status: "failed", answer: "Invalid task" });
          return;
        }
        if (pending || ++tasks > 20) {
          reply({
            status: "limited",
            answer: "Task in progress or voice task cap reached",
          });
          return;
        }
        pending = true;
        void nova
          .run(goal, $("mode").value)
          .then((value) =>
            reply({ status: value.result.status, answer: value.result.answer }),
          )
          .catch((e) => reply({ status: "failed", answer: e.message }))
          .finally(() => (pending = false));
      }
    };
    rtc.onconnectionstatechange = () => {
      if (rtc && ["failed", "disconnected"].includes(rtc.connectionState))
        stopLive();
    };
    const offer = await rtc.createOffer();
    await rtc.setLocalDescription(offer);
    const sdp = await nova.realtime(offer.sdp);
    if (rtcClosed) return;
    await rtc.setRemoteDescription({ type: "answer", sdp });
    $("realtime").textContent = "End live voice";
    rtcTimer = setTimeout(stopLive, 600000);
  } catch (e) {
    stopLive();
    throw e;
  } finally {
    $("realtime").disabled = false;
  }
});
window.addEventListener("beforeunload", () => {
  stopLive();
  speech?.pause();
});

$("recall").onclick = () => {
  const body = modal("Search past conversations"),
    query = input(body, "Keywords");
  body.append(
    button("Search", async () => {
      const results = await nova.recall(query.value);
      let old = body.querySelector("pre");
      if (old) old.remove();
      const pre = document.createElement("pre");
      pre.textContent =
        results
          .map((r) => r.sessionId + " · " + r.role + "\n" + r.excerpt)
          .join("\n\n") || "No matching messages";
      body.append(pre);
    }),
  );
};
$("plugins").onclick = busy(async () => {
  const body = modal("MCP tool plugins"),
    refresh = async () => {
      body.replaceChildren(
        button("Install reviewed manifest", async () => {
          await nova.installPlugin();
          await refresh();
        }),
      );
      for (const p of await nova.plugins()) {
        const text = document.createElement("p");
        text.textContent =
          p.name + " · " + p.base + " · enabled: " + p.tools.join(", ");
        body.append(
          text,
          button("Remove " + p.id, async () => {
            await nova.removePlugin(p.id);
            await refresh();
          }),
        );
      }
    };
  await refresh();
});
$("git-manage").onclick = () => {
  const body = modal("Review Git changes"),
    paths = input(body, "Relative paths, one per line"),
    message = input(body, "Commit message");
  const selected = () =>
    paths.value
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter(Boolean);
  body.append(
    button("Stage paths", async () => {
      $("preview").textContent = await nova.gitChange("stage", selected());
    }),
    button("Unstage paths", async () => {
      $("preview").textContent = await nova.gitChange("unstage", selected());
    }),
    button("Review and commit", async () => {
      $("preview").textContent = await nova.gitChange("commit", message.value);
    }),
  );
};
$("worktree").onclick = () => {
  const body = modal("Isolated worktree"),
    branch = input(body, "New branch name, e.g. nova/feature");
  body.append(
    button("Create worktree", async () => {
      const result = await nova.gitChange("worktree", branch.value);
      body.textContent =
        "Created " +
        result.branch +
        " at " +
        result.path +
        ". Open this folder to work in its isolated session.";
    }),
  );
};
