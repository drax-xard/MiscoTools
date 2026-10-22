# B-BOT

A lightweight, standalone everyday AI assistant that talks to any OpenAI-compatible chat
endpoint. No build step, no dependencies, no backend, and no telemetry.

B-BOT is meant for small local models and simple daily work: planning a day, turning notes
into to-dos, drafting a message, summarizing text, explaining something plainly, or
brainstorming a few options.

## What it does

- Streams replies directly from an OpenAI-compatible `/chat/completions` endpoint.
- Discovers available models through `/models` with the **Test connection** button.
- Keeps one conversation and its settings in browser local storage.
- Supports stop, retry, copy, new chat, and Markdown export.
- Renders replies with a small, safe Markdown subset: paragraphs, headings, lists, quotes,
  code blocks, inline code, bold, italics, strikethrough, and HTTP(S) links.
- Provides six starter prompts for common everyday tasks.
- Includes an editable system prompt, temperature, and response token limit.
- Works as a responsive chat layout on desktop and mobile.

## Quick start

1. Serve the app over HTTP (recommended, so browser security rules behave predictably):

   ```sh
   cd B-BOT
   python3 -m http.server 8000
   ```

   Then open <http://localhost:8000/>.

   Alternatively, from the repository root:

   ```sh
   python3 -m http.server 8000
   ```

   Then open <http://localhost:8000/B-BOT/>.

2. Open **Settings** on mobile, or use the sidebar on desktop.
3. Enter the **API base URL** and a **Model**. Add an **API key** only if the endpoint needs one.
4. Click **Test connection** to check the endpoint and load its model list.
5. Type a message and press <kbd>Enter</kbd>. Use <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new
   line.

Settings and the current conversation are saved automatically. **Export** downloads the
conversation as a Markdown file; **New chat** clears it.

## Compatible endpoints

The base URL normally ends in `/v1`. A full `/chat/completions` URL also works.

| Server | Example base URL | Model field | Notes |
| --- | --- | --- | --- |
| llama.cpp | `http://localhost:8080/v1` | any name, or the server alias | Start with `--cors`. |
| Ollama | `http://localhost:11434/v1` | e.g. `llama3.2` | Set `OLLAMA_ORIGINS=*` before `ollama serve`. |
| LM Studio | `http://localhost:1234/v1` | the loaded model | Enable the local server. |
| OpenAI | `https://api.openai.com/v1` | e.g. `gpt-4o-mini` | Requires an API key. |
| Other | any OpenAI-compatible base URL | as documented | `/models` should be available for the test button. |

Example local llama.cpp launch:

```sh
llama-server -m model.gguf --port 8080 --cors
```

Example Ollama launch on macOS or Linux:

```sh
OLLAMA_ORIGINS=* ollama serve
```

## Privacy and storage

B-BOT has no server component. Requests go directly from the page to the endpoint you
configure. The API key, settings, and conversation history are stored in this browser's
`localStorage`; the key is not encrypted, so avoid using it on a shared browser profile.
The exported transcript includes the endpoint and model name, but never the API key.

## CORS

Because the page calls the API directly, the API server must allow cross-origin requests
from the page's origin. If you see a network error:

- llama.cpp: start `llama-server` with `--cors`.
- Ollama: set `OLLAMA_ORIGINS=*` (or the specific origin) before starting the server.
- Other servers: allow the origin shown by your browser, including `http://localhost:8000`
  when using the quick-start command above.

Opening `index.html` as a `file://` page may work with permissive servers, but serving it
over HTTP is more reliable.

## Limitations

- One active conversation at a time. Export it first if you want to keep a copy.
- The **Test connection** button depends on the endpoint implementing `/models`. Some
  proxies support chat completions but not model listing.
- Long conversations are sent in full; the app does not trim history to fit a context
  window. Start a new chat or shorten the system prompt if the endpoint reports a context
  limit.
- Text only. There is no image input, file upload, tool calling, or function calling.
- Markdown support is intentionally small and does not render tables or raw HTML.
- No response regeneration action; retry is available after failed replies.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell, settings sidebar, empty state, and composer. |
| `styles.css` | Dark responsive theme and chat layout. |
| `api.js` | OpenAI-compatible client, endpoint resolution, SSE streaming parser, and errors. |
| `app.js` | Chat state, local storage, Markdown rendering, and UI wiring. |
