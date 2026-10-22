(function (global) {
  "use strict";

  class ApiError extends Error {
    constructor(message, options) {
      super(message);
      this.name = "ApiError";
      const settings = options || {};
      this.status = settings.status || 0;
      this.detail = settings.detail || "";
      this.kind = settings.kind || "http";
    }
  }

  function endpoints(rawBase) {
    let base = String(rawBase || "").trim().replace(/\/+$/, "");

    if (!base) {
      throw new ApiError("No API base URL configured.", { kind: "config" });
    }

    if (!/^https?:\/\//i.test(base)) {
      throw new ApiError("Use a full http:// or https:// URL.", { kind: "config" });
    }

    if (/\/chat\/completions$/i.test(base)) {
      return {
        chat: base,
        models: base.replace(/\/chat\/completions$/i, "/models"),
      };
    }

    let parsed;
    try {
      parsed = new URL(base);
    } catch (error) {
      throw new ApiError("That API base URL does not look valid.", { kind: "config" });
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      base += "/v1";
    }

    return {
      chat: base + "/chat/completions",
      models: base + "/models",
    };
  }

  function authHeaders(apiKey, extra) {
    const headers = Object.assign({}, extra || {});
    const key = String(apiKey || "").trim();
    if (key) headers.Authorization = "Bearer " + key;
    return headers;
  }

  function extractText(value) {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }

  async function errorFromResponse(response) {
    let detail = "";

    try {
      const raw = await response.text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const candidate =
            (parsed && parsed.error && (parsed.error.message || parsed.error)) ||
            (parsed && parsed.message) ||
            raw;
          detail = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
        } catch (error) {
          detail = raw;
        }
      }
    } catch (error) {
      detail = "";
    }

    detail = String(detail).replace(/\s+/g, " ").trim().slice(0, 400);
    const label = "Request failed (" + response.status + (response.statusText ? " " + response.statusText : "") + ")";

    return new ApiError(detail ? label + ": " + detail : label, {
      status: response.status,
      detail,
    });
  }

  async function listModels(options) {
    const settings = options || {};
    const urls = endpoints(settings.baseUrl);
    let response;

    try {
      response = await fetch(urls.models, {
        method: "GET",
        headers: authHeaders(settings.apiKey, { Accept: "application/json" }),
        signal: settings.signal,
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      throw new ApiError(
        "Could not reach the endpoint. Check the URL, make sure the server is running, and allow this page in its CORS settings.",
        { kind: "network" }
      );
    }

    if (!response.ok) throw await errorFromResponse(response);

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError("The endpoint responded, but not with JSON.", { kind: "format" });
    }

    const raw = Array.isArray(payload && payload.data)
      ? payload.data
      : Array.isArray(payload && payload.models)
        ? payload.models
        : [];

    return raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item) return "";
        return item.id || item.name || "";
      })
      .filter(Boolean);
  }

  async function streamCompletion(options) {
    const settings = options || {};
    const urls = endpoints(settings.baseUrl);
    const onDelta = typeof settings.onDelta === "function" ? settings.onDelta : function () {};
    const body = {
      model: settings.model,
      messages: settings.messages || [],
      stream: true,
    };

    if (Number.isFinite(Number(settings.temperature))) {
      body.temperature = Number(settings.temperature);
    }

    const maxTokens = Number(settings.maxTokens);
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      body.max_tokens = Math.round(maxTokens);
    }

    let response;
    try {
      response = await fetch(urls.chat, {
        method: "POST",
        headers: authHeaders(settings.apiKey, {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        }),
        body: JSON.stringify(body),
        signal: settings.signal,
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      throw new ApiError(
        "Could not reach the endpoint. Check the URL, make sure the server is running, and allow this page in its CORS settings.",
        { kind: "network" }
      );
    }

    if (!response.ok) throw await errorFromResponse(response);

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json") && !contentType.includes("event-stream");

    if (!response.body || isJson) {
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new ApiError("The endpoint returned an unreadable response.", { kind: "format" });
      }

      if (payload && payload.error) {
        const detail =
          typeof payload.error === "string"
            ? payload.error
            : payload.error.message || JSON.stringify(payload.error);
        throw new ApiError(detail, { detail });
      }

      const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
      const text =
        extractText(choice && choice.message && choice.message.content) ||
        extractText(choice && choice.delta && choice.delta.content) ||
        (choice && typeof choice.text === "string" ? choice.text : "");

      if (text) onDelta(text);
      return { usage: (payload && payload.usage) || null };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage = null;
    let finished = false;

    function handlePayload(payload) {
      const trimmed = payload.trim();
      if (!trimmed) return;
      if (trimmed === "[DONE]") {
        finished = true;
        return;
      }

      let data;
      try {
        data = JSON.parse(trimmed);
      } catch (error) {
        return;
      }

      if (data && data.error) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : data.error.message || JSON.stringify(data.error);
        throw new ApiError(detail, { detail });
      }

      if (data && data.usage) usage = data.usage;

      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
      if (!choice) return;

      const delta = choice.delta || choice.message || null;
      let text = extractText(delta && delta.content);
      if (!text && typeof choice.text === "string") text = choice.text;
      if (text) onDelta(text);
    }

    function handleEvent(block) {
      const lines = block.split(/\r?\n/);
      const dataLines = [];
      for (const line of lines) {
        if (line.indexOf("data:") === 0) {
          dataLines.push(line.slice(5).replace(/^\s/, ""));
        }
      }
      if (dataLines.length) handlePayload(dataLines.join("\n"));
    }

    function drain(flush) {
      while (!finished) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        handleEvent(block);
      }

      if (flush && !finished && buffer.trim()) {
        handleEvent(buffer);
        buffer = "";
      }
    }

    let failed = false;

    try {
      while (!finished) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        drain(false);
      }
      buffer += decoder.decode();
      drain(true);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (failed || finished) {
        try {
          reader.cancel();
        } catch (error) {}
      }
    }

    return { usage };
  }

  global.BBotApi = {
    ApiError,
    endpoints,
    listModels,
    streamCompletion,
  };
})(window);
