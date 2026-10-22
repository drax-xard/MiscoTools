(function () {
  "use strict";

  const Api = window.BBotApi;
  const SETTINGS_KEY = "bbot.settings.v1";
  const CHAT_KEY = "bbot.chat.v1";
  const MAX_MESSAGES = 200;

  const DEFAULT_SYSTEM_PROMPT =
    "You are B-BOT Lite, a small, practical assistant for everyday tasks. Be concise and direct. Use short paragraphs, steps, or lists when they help. Ask one brief clarifying question only when the task cannot be done without it. Never invent facts or links.";

  const DEFAULT_SETTINGS = {
    baseUrl: "http://localhost:8080/v1",
    apiKey: "",
    model: "",
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };

  const STARTERS = {
    plan:
      "Help me plan my day. Here's what's on my plate:\n- \n- \n\nTime available:\nWhat matters most:",
    draft:
      "Draft a short, friendly message for me.\n\nWho it's for:\nWhat I want to say:\nTone:",
    summarize:
      "Summarize the following text in a few clear bullets. Keep the key facts and skip the fluff.\n\n",
    todos:
      "Turn these notes into a prioritized to-do list with clear next actions:\n\n",
    explain:
      "Explain this in plain language, like I'm new to the topic:\n\n",
    brainstorm:
      "Give me five practical ideas for:\n\n",
  };

  const BOT_ICON =
    '<svg viewBox="0 0 32 32" fill="none">' +
    '<path d="M16 8V4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    '<circle cx="16" cy="3.2" r="1.3" fill="currentColor"/>' +
    '<rect x="5" y="8" width="22" height="17" rx="5.5" stroke="currentColor" stroke-width="1.7"/>' +
    '<circle cx="11.8" cy="15.4" r="1.6" fill="currentColor"/>' +
    '<circle cx="20.2" cy="15.4" r="1.6" fill="currentColor"/>' +
    '<path d="M11.5 20.3h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    '<path d="M2.7 13.5v6M29.3 13.5v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    "</svg>";

  const COPY_ICON =
    '<svg class="icon-copy" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<rect x="5.5" y="5.5" width="8" height="8" rx="1.4" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.3"/>' +
    "</svg>";

  const CHECK_ICON =
    '<svg class="icon-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="m3.5 8.3 3 3 6-6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  const WARN_ICON =
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 2.5 14 13H2L8 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
    '<path d="M8 6v3.2M8 11.2v.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    "</svg>";

  const TYPING_HTML =
    '<div class="typing" aria-label="B-BOT Lite is typing"><span></span><span></span><span></span></div>';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });
  }

  function makeId() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function readStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSettings() {
    const stored = readStorage(SETTINGS_KEY);
    const source = stored && typeof stored === "object" ? stored : {};
    const settings = Object.assign({}, DEFAULT_SETTINGS);
    const temperature = Number(source.temperature);
    const maxTokens = Number(source.maxTokens);

    if (typeof source.baseUrl === "string") settings.baseUrl = source.baseUrl;
    if (typeof source.apiKey === "string") settings.apiKey = source.apiKey;
    if (typeof source.model === "string") settings.model = source.model;
    if (typeof source.systemPrompt === "string") {
      settings.systemPrompt = source.systemPrompt;
    }
    if (Number.isFinite(temperature)) settings.temperature = clamp(temperature, 0, 1.5);
    if (Number.isFinite(maxTokens)) settings.maxTokens = clamp(Math.round(maxTokens), 64, 32768);

    return settings;
  }

  function loadMessages() {
    const stored = readStorage(CHAT_KEY);
    const raw = stored && Array.isArray(stored.messages) ? stored.messages : [];
    const messages = [];

    raw.forEach(function (entry) {
      if (!entry || typeof entry !== "object") return;
      if (entry.role !== "user" && entry.role !== "assistant") return;
      if (typeof entry.content !== "string") return;

      messages.push({
        id: typeof entry.id === "string" && entry.id ? entry.id : makeId(),
        role: entry.role,
        content: entry.content,
        at: Number(entry.at) || Date.now(),
        error: Boolean(entry.error),
        failure: typeof entry.failure === "string" ? entry.failure : "",
        hint: typeof entry.hint === "string" ? entry.hint : "",
        stopped: Boolean(entry.stopped),
        elapsed: Number(entry.elapsed) || 0,
        tokens: Number(entry.tokens) || 0,
      });
    });

    return messages.slice(-MAX_MESSAGES);
  }

  function saveChat() {
    writeStorage(CHAT_KEY, {
      version: 1,
      updatedAt: Date.now(),
      messages: state.messages.map(function (message) {
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          at: message.at,
          error: Boolean(message.error),
          failure: message.failure || "",
          hint: message.hint || "",
          stopped: Boolean(message.stopped),
          elapsed: message.elapsed || 0,
          tokens: message.tokens || 0,
        };
      }),
    });
  }

  function persistSettings() {
    writeStorage(SETTINGS_KEY, state.settings);
  }

  function formatTime(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatSeconds(milliseconds) {
    if (!milliseconds || milliseconds < 100) return "";
    return (milliseconds / 1000).toFixed(1) + "s";
  }

  function renderInline(source) {
    const codes = [];
    let text = escapeHtml(source);

    text = text.replace(/`([^`]+)`/g, function (match, code) {
      codes.push(code);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });

    text = text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    text = text.replace(/\u0000(\d+)\u0000/g, function (match, index) {
      return "<code>" + codes[Number(index)] + "</code>";
    });

    return text;
  }

  function isBlockStart(line) {
    return (
      /^\s*```/.test(line) ||
      /^(#{1,4})\s+/.test(line) ||
      /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
      /^>\s?/.test(line) ||
      /^\s*[-*+]\s+/.test(line) ||
      /^\s*\d+[.)]\s+/.test(line)
    );
  }

  function codeBlock(content, language) {
    const className = language ? ' class="language-' + escapeHtml(language) + '"' : "";
    return "<pre><code" + className + ">" + escapeHtml(content) + "</code></pre>";
  }

  function renderMarkdown(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let index = 0;
    let inCode = false;
    let codeLanguage = "";
    let codeLines = [];
    let listType = null;

    function closeList() {
      if (listType) {
        html.push("</" + listType + ">");
        listType = null;
      }
    }

    function openList(type) {
      if (listType !== type) {
        closeList();
        html.push("<" + type + ">");
        listType = type;
      }
    }

    while (index < lines.length) {
      const line = lines[index];
      const fence = line.match(/^\s*```([^\s`]*)\s*$/);

      if (inCode) {
        if (fence) {
          html.push(codeBlock(codeLines.join("\n"), codeLanguage));
          inCode = false;
          codeLanguage = "";
          codeLines = [];
        } else {
          codeLines.push(line);
        }
        index += 1;
        continue;
      }

      if (fence) {
        closeList();
        inCode = true;
        codeLanguage = fence[1] || "";
        index += 1;
        continue;
      }

      if (!line.trim()) {
        closeList();
        index += 1;
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
        index += 1;
        continue;
      }

      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        closeList();
        html.push("<hr>");
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        closeList();
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quote.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }
        html.push("<blockquote>" + quote.map(renderInline).join("<br>") + "</blockquote>");
        continue;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
      if (unordered) {
        openList("ul");
        html.push("<li>" + renderInline(unordered[1]) + "</li>");
        index += 1;
        continue;
      }

      const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ordered) {
        openList("ol");
        html.push("<li>" + renderInline(ordered[1]) + "</li>");
        index += 1;
        continue;
      }

      closeList();
      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }
      html.push("<p>" + paragraph.map(renderInline).join(" ") + "</p>");
    }

    if (inCode) {
      html.push(codeBlock(codeLines.join("\n"), codeLanguage));
    }
    closeList();

    return html.join("");
  }

  function errorBox(title, message, hint, canRetry, compact) {
    return (
      '<div class="error-box' + (compact ? " is-compact" : "") + '">' +
      '<div class="error-title">' + WARN_ICON + "<span>" + escapeHtml(title) + "</span></div>" +
      "<p>" + escapeHtml(message) + "</p>" +
      (hint ? '<p class="error-hint">' + escapeHtml(hint) + "</p>" : "") +
      (canRetry ? '<button type="button" class="retry-button" data-retry>Try again</button>' : "") +
      "</div>"
    );
  }

  const state = {
    settings: loadSettings(),
    messages: loadMessages(),
    streaming: false,
    activeId: null,
    controller: null,
    testController: null,
    paintFrame: null,
    settingsTimer: null,
  };

  const messageElements = new Map();
  const copyTimers = new WeakMap();

  const $ = function (id) {
    return document.getElementById(id);
  };

  const els = {
    backdrop: $("backdrop"),
    connectionPill: $("connection-pill"),
    connectionLabel: $("connection-label"),
    exportChat: $("export-chat"),
    newChat: $("new-chat"),
    toggleSidebar: $("toggle-sidebar"),
    closeSidebar: $("close-sidebar"),
    settingsForm: $("settings-form"),
    baseUrl: $("base-url"),
    apiKey: $("api-key"),
    toggleKey: $("toggle-key"),
    model: $("model"),
    modelList: $("model-list"),
    testConnection: $("test-connection"),
    testStatus: $("test-status"),
    temperature: $("temperature"),
    temperatureValue: $("temperature-value"),
    maxTokens: $("max-tokens"),
    systemPrompt: $("system-prompt"),
    transcript: $("transcript"),
    emptyState: $("empty-state"),
    emptySetup: $("empty-setup"),
    emptySettings: $("empty-settings"),
    messages: $("messages"),
    composerForm: $("composer"),
    prompt: $("prompt"),
    send: $("send"),
    stop: $("stop"),
    srStatus: $("sr-status"),
  };

  function hasConfig() {
    return Boolean(state.settings.baseUrl.trim() && state.settings.model.trim());
  }

  function syncSettingsFromForm() {
    state.settings.baseUrl = els.baseUrl.value.trim();
    state.settings.apiKey = els.apiKey.value.trim();
    state.settings.model = els.model.value.trim();
    state.settings.temperature = clamp(Number(els.temperature.value) || 0, 0, 1.5);

    const tokens = Number(els.maxTokens.value);
    if (Number.isFinite(tokens) && tokens > 0) {
      state.settings.maxTokens = clamp(Math.round(tokens), 64, 32768);
    }

    state.settings.systemPrompt = els.systemPrompt.value;
  }

  function saveSettingsSoon() {
    if (state.settingsTimer) window.clearTimeout(state.settingsTimer);
    state.settingsTimer = window.setTimeout(function () {
      state.settingsTimer = null;
      persistSettings();
    }, 250);
  }

  function updateConnectionUI() {
    const ready = hasConfig();
    const pill = els.connectionPill;

    pill.classList.remove("is-ready", "is-warn", "is-live");

    if (state.streaming) {
      els.connectionLabel.textContent = "Streaming…";
      pill.classList.add("is-live");
      pill.title = "B-BOT Lite is replying";
    } else if (!state.settings.baseUrl.trim()) {
      els.connectionLabel.textContent = "Add endpoint";
      pill.classList.add("is-warn");
      pill.title = "Open settings to add an API base URL";
    } else if (!state.settings.model.trim()) {
      els.connectionLabel.textContent = "Add model";
      pill.classList.add("is-warn");
      pill.title = "Open settings to choose a model";
    } else {
      els.connectionLabel.textContent = state.settings.model;
      pill.classList.add("is-ready");
      pill.title = state.settings.model + " at " + state.settings.baseUrl;
    }

    els.emptySetup.hidden = ready;
  }

  function updateMessageActions() {
    const hasMessages = state.messages.length > 0;
    els.exportChat.disabled = !hasMessages || state.streaming;
    els.newChat.disabled = !hasMessages && !state.streaming;
  }

  function updateEmptyState() {
    els.emptyState.hidden = state.messages.length > 0;
  }

  function applyStreamingState(active) {
    els.send.hidden = active;
    els.stop.hidden = !active;
    els.stop.disabled = !active;
    els.composerForm.classList.toggle("is-streaming", active);
    updateConnectionUI();
    updateMessageActions();
  }

  function setSrStatus(text) {
    els.srStatus.textContent = text;
  }

  function buildMessageElement(message) {
    const article = document.createElement("article");
    article.className = "message message-" + message.role;
    article.dataset.id = message.id;

    if (message.role === "assistant") {
      const avatar = document.createElement("div");
      avatar.className = "message-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = BOT_ICON;
      article.appendChild(avatar);
    }

    const main = document.createElement("div");
    main.className = "message-main";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const author = document.createElement("span");
    author.className = "message-author";
    author.textContent = message.role === "assistant" ? "B-BOT Lite" : "You";

    const time = document.createElement("span");
    time.className = "message-time";

    const stats = document.createElement("span");
    stats.className = "message-stats";

    meta.appendChild(author);
    meta.appendChild(time);
    meta.appendChild(stats);

    if (!message.error) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "message-copy";
      copy.dataset.copy = message.id;
      copy.title = "Copy message";
      copy.setAttribute("aria-label", "Copy message");
      copy.innerHTML = COPY_ICON + CHECK_ICON;
      meta.appendChild(copy);
    }

    const content = document.createElement("div");
    content.className = "message-content";

    main.appendChild(meta);
    main.appendChild(content);
    article.appendChild(main);

    return article;
  }

  function paintMessage(message) {
    const element = messageElements.get(message.id);
    if (!element) return;

    const streaming = state.streaming && state.activeId === message.id;
    const isLast = state.messages[state.messages.length - 1] === message;
    const canRetry = isLast && !streaming;
    const content = element.querySelector(".message-content");
    const time = element.querySelector(".message-time");
    const stats = element.querySelector(".message-stats");
    const copy = element.querySelector(".message-copy");

    element.classList.toggle("is-streaming", streaming);
    element.classList.toggle("has-error", Boolean(message.error));
    element.classList.toggle("has-failure", Boolean(message.failure));

    time.textContent = formatTime(message.at);

    let statsText = "";
    if (streaming) {
      statsText = "writing";
    } else if (message.stopped) {
      statsText = "stopped";
      const stoppedFor = formatSeconds(message.elapsed);
      if (stoppedFor) statsText += " · " + stoppedFor;
    } else {
      const seconds = formatSeconds(message.elapsed);
      if (seconds) statsText = seconds;
      if (message.tokens > 0) {
        statsText += (statsText ? " · " : "") + message.tokens + " tok";
      }
    }
    stats.textContent = statsText;
    stats.classList.toggle("is-live", streaming);

    if (copy) copy.hidden = Boolean(message.error);

    if (message.error) {
      content.innerHTML = errorBox("Could not complete that", message.content, message.hint, canRetry);
    } else if (streaming && !message.content.trim()) {
      content.innerHTML = TYPING_HTML;
    } else if (message.role === "user") {
      content.textContent = message.content;
    } else {
      content.innerHTML = renderMarkdown(message.content);
      if (message.failure) {
        content.insertAdjacentHTML(
          "beforeend",
          errorBox("Reply interrupted", message.failure, message.hint, canRetry, true)
        );
      }
    }
  }

  function appendMessageElement(message) {
    const element = buildMessageElement(message);
    els.messages.appendChild(element);
    messageElements.set(message.id, element);
    paintMessage(message);
    return element;
  }

  function renderAllMessages() {
    els.messages.replaceChildren();
    messageElements.clear();
    state.messages.forEach(function (message) {
      appendMessageElement(message);
    });
    updateEmptyState();
    updateMessageActions();
  }

  function removeMessage(id) {
    const index = state.messages.findIndex(function (message) {
      return message.id === id;
    });
    if (index !== -1) state.messages.splice(index, 1);

    const element = messageElements.get(id);
    if (element) {
      element.remove();
      messageElements.delete(id);
    }

    updateEmptyState();
    updateMessageActions();
  }

  function isNearBottom() {
    const distance =
      els.transcript.scrollHeight - els.transcript.scrollTop - els.transcript.clientHeight;
    return distance < 120;
  }

  function scrollToBottom(force) {
    if (force || isNearBottom()) {
      els.transcript.scrollTop = els.transcript.scrollHeight;
    }
  }

  function schedulePaint(message) {
    if (state.paintFrame) return;
    const wasNearBottom = isNearBottom();

    state.paintFrame = window.requestAnimationFrame(function () {
      state.paintFrame = null;
      paintMessage(message);
      if (wasNearBottom || isNearBottom()) scrollToBottom(true);
    });
  }

  function buildRequestMessages() {
    const messages = [];
    const system = state.settings.systemPrompt.trim();

    if (system) messages.push({ role: "system", content: system });

    state.messages.forEach(function (message) {
      if (message.error || message.failure) return;
      if (!message.content.trim()) return;
      messages.push({ role: message.role, content: message.content });
    });

    return messages;
  }

  function describeError(error) {
    if (!error) {
      return { message: "Something went wrong.", hint: "" };
    }

    if (error.name === "AbortError") {
      return { message: "The request was stopped.", hint: "" };
    }

    if (Api && error instanceof Api.ApiError) {
      let hint = "";

      if (error.kind === "network") {
        hint =
          "Make sure the server is running and that CORS allows this page. For llama.cpp add --cors; for Ollama set OLLAMA_ORIGINS=*.";
      } else if (error.kind === "config") {
        hint = "Open the connection settings and check the endpoint URL.";
      } else if (error.status === 401 || error.status === 403) {
        hint = "Check the API key and its permissions.";
      } else if (error.status === 404) {
        hint = "Check the base URL and the model name. One of them may not exist.";
      } else if (error.status === 429) {
        hint = "The endpoint is rate limiting requests. Wait a moment and try again.";
      } else if (error.status >= 500) {
        hint = "The endpoint hit an internal error. Check its logs and try again.";
      } else if (error.status === 400 || error.status === 422) {
        hint = "The endpoint rejected the request. Check the model name and generation settings.";
      }

      return { message: error.message, hint: hint };
    }

    if (error instanceof TypeError) {
      return {
        message: "Could not reach the endpoint.",
        hint:
          "Check the URL, make sure the server is running, and that CORS allows this page. For llama.cpp add --cors; for Ollama set OLLAMA_ORIGINS=*.",
      };
    }

    return { message: error.message || "Something went wrong.", hint: "" };
  }

  function finishAssistant(message, usage, startedAt) {
    message.elapsed = performance.now() - startedAt;
    message.tokens = usage && Number(usage.completion_tokens) ? Number(usage.completion_tokens) : 0;

    if (!message.content.trim()) {
      message.error = true;
      message.content = "The model returned an empty response.";
      message.hint = "Try again, or check that the selected model supports chat completions.";
    }

    paintMessage(message);
    saveChat();
    setSrStatus(message.error ? "B-BOT Lite returned an error." : "B-BOT Lite replied.");
  }

  function stopAssistant(message, startedAt) {
    message.elapsed = performance.now() - startedAt;

    if (!message.content.trim()) {
      removeMessage(message.id);
      setSrStatus("Reply stopped.");
      return;
    }

    message.stopped = true;
    paintMessage(message);
    saveChat();
    setSrStatus("Reply stopped. Partial reply kept.");
  }

  function failAssistant(message, error, startedAt) {
    const info = describeError(error);
    message.elapsed = performance.now() - startedAt;

    if (message.content.trim()) {
      message.failure = info.message;
      message.hint = info.hint;
    } else {
      message.error = true;
      message.content = info.message;
      message.hint = info.hint;
    }

    paintMessage(message);
    saveChat();
    setSrStatus("Error: " + info.message);
  }

  function clearRetryButtons() {
    document.querySelectorAll(".retry-button").forEach(function (button) {
      button.remove();
    });
  }

  async function sendMessage(text, appendUser) {
    if (state.streaming) return;

    syncSettingsFromForm();

    if (!hasConfig()) {
      focusConfig();
      setSrStatus("Add an endpoint and model in settings first.");
      return;
    }

    if (appendUser) {
      const userMessage = {
        id: makeId(),
        role: "user",
        content: text,
        at: Date.now(),
        error: false,
        failure: "",
        hint: "",
        stopped: false,
        elapsed: 0,
        tokens: 0,
      };

      state.messages.push(userMessage);
      clearRetryButtons();
      appendMessageElement(userMessage);
      updateEmptyState();
      updateMessageActions();
      saveChat();
      scrollToBottom(true);
    }

    const assistant = {
      id: makeId(),
      role: "assistant",
      content: "",
      at: Date.now(),
      error: false,
      failure: "",
      hint: "",
      stopped: false,
      elapsed: 0,
      tokens: 0,
    };

    const controller = new AbortController();
    const startedAt = performance.now();

    state.messages.push(assistant);
    state.streaming = true;
    state.activeId = assistant.id;
    state.controller = controller;

    appendMessageElement(assistant);
    applyStreamingState(true);
    updateEmptyState();
    scrollToBottom(true);
    setSrStatus("B-BOT Lite is replying.");

    const requestMessages = buildRequestMessages();

    try {
      const result = await Api.streamCompletion({
        baseUrl: state.settings.baseUrl,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        messages: requestMessages,
        temperature: state.settings.temperature,
        maxTokens: state.settings.maxTokens,
        signal: controller.signal,
        onDelta: function (delta) {
          assistant.content += delta;
          schedulePaint(assistant);
        },
      });

      finishAssistant(assistant, result && result.usage, startedAt);
    } catch (error) {
      if (error && error.name === "AbortError") {
        stopAssistant(assistant, startedAt);
      } else {
        failAssistant(assistant, error, startedAt);
      }
    } finally {
      state.streaming = false;
      state.activeId = null;
      state.controller = null;
      applyStreamingState(false);
      paintMessage(assistant);
      updateMessageActions();
      saveChat();
      els.prompt.focus({ preventScroll: true });
    }
  }

  function retryLast() {
    if (state.streaming) return;
    const last = state.messages[state.messages.length - 1];

    if (!last || last.role !== "assistant" || (!last.error && !last.failure)) {
      return;
    }

    removeMessage(last.id);
    const previous = state.messages[state.messages.length - 1];

    if (!previous || previous.role !== "user") {
      renderAllMessages();
      saveChat();
      return;
    }

    saveChat();
    sendMessage("", false);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (fallbackError) {
        copied = false;
      }

      textarea.remove();
      return copied;
    }
  }

  async function handleCopy(button, message) {
    const copied = await copyText(message.content);
    if (copyTimers.has(button)) window.clearTimeout(copyTimers.get(button));

    button.classList.toggle("is-copied", copied);
    button.classList.toggle("is-copy-failed", !copied);
    button.title = copied ? "Copied" : "Copy failed";

    copyTimers.set(
      button,
      window.setTimeout(function () {
        button.classList.remove("is-copied", "is-copy-failed");
        button.title = "Copy message";
      }, 1600)
    );
  }

  function newChat() {
    if (!state.messages.length && !state.streaming) return;
    if (!window.confirm("Start a new chat? This clears the current conversation.")) return;

    if (state.controller) state.controller.abort();

    state.messages = [];
    renderAllMessages();
    updateConnectionUI();
    saveChat();
    closeSidebar();
    els.prompt.focus({ preventScroll: true });
    setSrStatus("New chat started.");
  }

  function exportChat() {
    if (!state.messages.length) return;

    const stamp = new Date();
    const pad = function (value) {
      return String(value).padStart(2, "0");
    };
    const filename =
      "b-bot-chat-" +
      stamp.getFullYear() +
      "-" +
      pad(stamp.getMonth() + 1) +
      "-" +
      pad(stamp.getDate()) +
      "-" +
      pad(stamp.getHours()) +
      pad(stamp.getMinutes()) +
      ".md";

    const lines = [
      "# B-BOT Lite conversation",
      "",
      "- Model: `" + (state.settings.model || "unknown") + "`",
      "- Endpoint: `" + (state.settings.baseUrl || "unknown") + "`",
      "- Exported: " + stamp.toLocaleString(),
      "",
    ];

    state.messages.forEach(function (message) {
      lines.push(message.role === "user" ? "## You" : "## B-BOT Lite", "");

      if (message.error) {
        lines.push("> Error: " + message.content);
      } else {
        lines.push(message.content.trim());
        if (message.failure) lines.push("", "> Interrupted: " + message.failure);
      }

      lines.push("", "---", "");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    setSrStatus("Conversation exported.");
  }

  function openSidebar() {
    document.body.classList.add("sidebar-open");
    els.toggleSidebar.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    els.toggleSidebar.setAttribute("aria-expanded", "false");
  }

  function focusConfig() {
    syncSettingsFromForm();
    openSidebar();

    const target = !els.baseUrl.value.trim() ? els.baseUrl : els.model;

    window.setTimeout(function () {
      target.focus();
      target.select();
      target.classList.add("needs-attention");
      window.setTimeout(function () {
        target.classList.remove("needs-attention");
      }, 1600);
    }, 80);
  }

  function setTestStatus(text, variant, title) {
    els.testStatus.textContent = text;
    els.testStatus.className = "test-status" + (variant ? " " + variant : "");
    els.testStatus.title = title || text || "";
  }

  function populateModelList(models) {
    els.modelList.replaceChildren();

    models.forEach(function (name) {
      const option = document.createElement("option");
      option.value = name;
      els.modelList.appendChild(option);
    });
  }

  async function testConnection() {
    syncSettingsFromForm();
    persistSettings();

    if (!state.settings.baseUrl.trim()) {
      setTestStatus("Add a base URL first.", "is-error");
      els.baseUrl.focus();
      return;
    }

    if (state.testController) state.testController.abort();

    const controller = new AbortController();
    let timedOut = false;

    state.testController = controller;
    els.testConnection.disabled = true;
    setTestStatus("Checking…", "is-pending");

    const timer = window.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, 12000);

    try {
      const models = await Api.listModels({
        baseUrl: state.settings.baseUrl,
        apiKey: state.settings.apiKey,
        signal: controller.signal,
      });

      populateModelList(models);

      if (!els.model.value.trim() && models.length) {
        els.model.value = models[0];
        syncSettingsFromForm();
        persistSettings();
      }

      if (models.length) {
        setTestStatus(
          "Connected · " + models.length + " model" + (models.length === 1 ? "" : "s"),
          "is-ok"
        );
      } else if (!els.model.value.trim()) {
        setTestStatus("Connected · add a model", "is-ok");
      } else {
        setTestStatus("Connected", "is-ok");
      }

      updateConnectionUI();
    } catch (error) {
      if (error && error.name === "AbortError") {
        setTestStatus(timedOut ? "Timed out after 12s." : "Check cancelled.", "is-error");
      } else {
        const info = describeError(error);
        setTestStatus(info.message, "is-error", info.hint);
      }
    } finally {
      window.clearTimeout(timer);
      if (state.testController === controller) state.testController = null;
      els.testConnection.disabled = false;
    }
  }

  function updateTemperatureLabel() {
    els.temperatureValue.textContent = Number(els.temperature.value).toFixed(1);
  }

  function autoGrow() {
    const textarea = els.prompt;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }

  function placeCaretAtEnd(textarea) {
    const length = textarea.value.length;
    textarea.setSelectionRange(length, length);
  }

  function bindEvents() {
    els.settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    els.settingsForm.addEventListener("input", function () {
      syncSettingsFromForm();
      updateTemperatureLabel();
      saveSettingsSoon();
      updateConnectionUI();

      if (!state.testController && els.testStatus.textContent) {
        setTestStatus("", "");
      }
    });

    els.maxTokens.addEventListener("blur", function () {
      els.maxTokens.value = String(state.settings.maxTokens);
    });

    els.toggleKey.addEventListener("click", function () {
      const showing = els.apiKey.type === "text";
      els.apiKey.type = showing ? "password" : "text";
      els.toggleKey.textContent = showing ? "Show" : "Hide";
      els.toggleKey.setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
    });

    els.testConnection.addEventListener("click", testConnection);

    els.composerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (state.streaming) return;

      const text = els.prompt.value.trim();
      if (!text) {
        els.prompt.focus();
        return;
      }

      syncSettingsFromForm();
      if (!hasConfig()) {
        focusConfig();
        setSrStatus("Add an endpoint and model in settings first.");
        return;
      }

      els.prompt.value = "";
      autoGrow();
      sendMessage(text, true);
    });

    els.prompt.addEventListener("input", autoGrow);

    els.prompt.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!state.streaming) els.composerForm.requestSubmit();
      }
    });

    els.stop.addEventListener("click", function () {
      if (!state.controller) return;
      els.stop.disabled = true;
      state.controller.abort();
    });

    els.exportChat.addEventListener("click", exportChat);
    els.newChat.addEventListener("click", newChat);
    els.toggleSidebar.addEventListener("click", function () {
      if (document.body.classList.contains("sidebar-open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
    els.closeSidebar.addEventListener("click", closeSidebar);
    els.backdrop.addEventListener("click", closeSidebar);
    els.emptySettings.addEventListener("click", focusConfig);

    els.emptyState.addEventListener("click", function (event) {
      const starter = event.target.closest("[data-starter]");
      if (!starter) return;

      const template = STARTERS[starter.dataset.starter];
      if (!template) return;

      els.prompt.value = template;
      autoGrow();
      els.prompt.focus();
      placeCaretAtEnd(els.prompt);
      scrollToBottom(true);
    });

    els.messages.addEventListener("click", function (event) {
      const copyButton = event.target.closest("[data-copy]");
      if (copyButton) {
        const message = state.messages.find(function (entry) {
          return entry.id === copyButton.dataset.copy;
        });
        if (message) handleCopy(copyButton, message);
        return;
      }

      const retryButton = event.target.closest("[data-retry]");
      if (retryButton) retryLast();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeSidebar();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) closeSidebar();
    });
  }

  function init() {
    els.baseUrl.value = state.settings.baseUrl;
    els.apiKey.value = state.settings.apiKey;
    els.model.value = state.settings.model;
    els.temperature.value = String(state.settings.temperature);
    els.maxTokens.value = String(state.settings.maxTokens);
    els.systemPrompt.value = state.settings.systemPrompt;

    updateTemperatureLabel();
    autoGrow();
    renderAllMessages();
    updateConnectionUI();
    updateMessageActions();
    bindEvents();

    if (state.messages.length) scrollToBottom(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
