const state = {
  token: localStorage.getItem("bbot-advanced-token") || "",
  conversationId: null,
  controller: null,
  streaming: false,
};

const el = {
  token: document.getElementById("token"),
  saveToken: document.getElementById("save-token"),
  statusDot: document.getElementById("status-dot"),
  conversations: document.getElementById("conversations"),
  newChat: document.getElementById("new-chat"),
  messages: document.getElementById("messages"),
  composer: document.getElementById("composer"),
  input: document.getElementById("input"),
  send: document.getElementById("send"),
  stop: document.getElementById("stop"),
  export: document.getElementById("export"),
  error: document.getElementById("error"),
};

el.token.value = state.token;

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = !message;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch (_) { /* keep default */ }
    throw new Error(detail);
  }
  return response;
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    el.statusDot.className = `dot ${response.ok ? "online" : "offline"}`;
  } catch (_) {
    el.statusDot.className = "dot offline";
  }
}

function setStreaming(active) {
  state.streaming = active;
  el.send.hidden = active;
  el.stop.hidden = !active;
  el.input.disabled = active;
}

function renderMessages(messages) {
  el.messages.textContent = "";
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Start a conversation. Replies are streamed from the remote model.";
    el.messages.appendChild(empty);
    return;
  }
  messages.forEach((message) => appendMessage(message.role, message.content));
}

function appendMessage(role, content) {
  const empty = el.messages.querySelector(".empty");
  if (empty) empty.remove();
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "role";
  label.textContent = role === "user" ? "You" : "B-BOT";
  const text = document.createElement("div");
  text.className = "content";
  text.textContent = content;
  article.append(label, text);
  el.messages.appendChild(article);
  el.messages.scrollTop = el.messages.scrollHeight;
  return text;
}

function renderConversations(conversations) {
  el.conversations.textContent = "";
  conversations.forEach((conversation) => {
    const item = document.createElement("li");
    if (conversation.id === state.conversationId) item.classList.add("active");

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = conversation.title;
    open.addEventListener("click", () => selectConversation(conversation.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.textContent = "×";
    remove.title = "Delete conversation";
    remove.addEventListener("click", () => deleteConversation(conversation.id));

    item.append(open, remove);
    el.conversations.appendChild(item);
  });
}

async function loadConversations() {
  try {
    const response = await api("/api/chat/conversations");
    renderConversations(await response.json());
  } catch (error) {
    showError(error.message);
  }
}

async function selectConversation(id) {
  try {
    const response = await api(`/api/chat/conversations/${id}`);
    const conversation = await response.json();
    state.conversationId = id;
    renderMessages(conversation.messages);
    el.export.hidden = false;
    await loadConversations();
    showError("");
  } catch (error) {
    showError(error.message);
  }
}

async function newConversation() {
  try {
    const response = await api("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const conversation = await response.json();
    state.conversationId = conversation.id;
    renderMessages([]);
    el.export.hidden = false;
    await loadConversations();
    el.input.focus();
    showError("");
  } catch (error) {
    showError(error.message);
  }
}

async function deleteConversation(id) {
  if (!confirm("Delete this conversation?")) return;
  try {
    await api(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (state.conversationId === id) {
      state.conversationId = null;
      renderMessages([]);
      el.export.hidden = true;
    }
    await loadConversations();
  } catch (error) {
    showError(error.message);
  }
}

function handleEvent(payload, assistantText) {
  if (payload.type === "delta") {
    assistantText.textContent += payload.content;
    el.messages.scrollTop = el.messages.scrollHeight;
  } else if (payload.type === "error") {
    showError(payload.error || "The reply failed.");
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const content = el.input.value.trim();
  if (!content || state.streaming) return;

  if (!state.conversationId) await newConversation();
  if (!state.conversationId) return;

  showError("");
  el.input.value = "";
  appendMessage("user", content);
  const assistantText = appendMessage("assistant", "");
  setStreaming(true);

  state.controller = new AbortController();
  try {
    const response = await api(
      `/api/chat/conversations/${state.conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
        signal: state.controller.signal,
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = raw.split("\n").find((entry) => entry.startsWith("data:"));
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line.slice(5).trim()), assistantText);
        } catch (_) { /* ignore malformed event */ }
      }
    }
    await loadConversations();
  } catch (error) {
    if (error.name !== "AbortError") showError(error.message);
  } finally {
    setStreaming(false);
    state.controller = null;
    el.input.focus();
  }
}

function stopStreaming() {
  if (state.controller) state.controller.abort();
}

async function exportConversation(event) {
  event.preventDefault();
  if (!state.conversationId) return;
  try {
    const response = await api(`/api/chat/conversations/${state.conversationId}/export`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `b-bot-conversation-${state.conversationId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError(error.message);
  }
}

el.saveToken.addEventListener("click", async () => {
  state.token = el.token.value.trim();
  localStorage.setItem("bbot-advanced-token", state.token);
  await loadConversations();
  showError("");
});

el.newChat.addEventListener("click", newConversation);
el.composer.addEventListener("submit", sendMessage);
el.stop.addEventListener("click", stopStreaming);
el.export.addEventListener("click", exportConversation);
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    el.composer.requestSubmit();
  }
});

checkHealth();
loadConversations();
