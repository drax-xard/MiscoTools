# LlamaTune

A single-page, offline estimator that turns your hardware specs and a GGUF model into an
optimized [`llama-server`](https://github.com/ggml-org/llama.cpp) launch command.

It answers one question: **given this GPU, this much RAM, and this model, how should I start
`llama-server` so it actually fits and runs fast?**

## What it does

The optimizer budgets the three things that compete for memory — model weights, KV cache, and
runtime/compute overhead — then searches every possible GPU offload level (`--n-gpu-layers`
from 0 to the full layer count) to find the best combination of offload and context length.

Outputs:

- **Launch command** with `--model`, `--alias`, `--n-gpu-layers`, `--ctx-size`, `--parallel`,
  `--threads`, `--threads-batch`, `--batch-size`, `--ubatch-size`, `--flash-attn`, and
  independent `--cache-type-k` / `--cache-type-v` flags when either KV cache is quantized.
- **Saved preset**: downloads the launch command as an executable bash script with a shebang.
- **Metrics**: usable context, GPU layers vs. total, KV cache types and size, speed class
  (GPU-bound / Fast / Mixed / CPU-heavy / CPU-only).
- **Memory envelope**: stacked bars for VRAM and system RAM showing weights, KV cache,
  compute buffers, reserve, and what is left free.
- **"Why this config"**: plain-language reasoning for each decision, plus a warnings list
  for capped context, partial offload, RAM over-budget, and other caveats.

## How to use

1. Open `index.html` in a browser. There is no build step, no server, no dependencies, and
   no network traffic — everything runs locally in the page.
2. Fill in **Your hardware**: GPU VRAM (GiB), system RAM (GiB), CPU threads, and enable
   *Unified memory* for Apple Silicon / APUs.
3. Fill in **Your model**, or load a local `.gguf` file. The loader reads the real parameter
   count, native context, quantization, and KV geometry directly from the file in the browser;
   the model never leaves your machine.
4. Set the K and V KV cache precisions independently (Q8_0 for both by default).
5. Optionally open **Architecture estimate** to override the auto-detected KV geometry
   (layers, KV heads, head dim) if your GGUF differs from the preset.
6. Pick an **Optimization target**:
   - **Speed** — maximize GPU offload; context only needs 2K to qualify.
   - **Balanced** — keep all layers on the GPU when at least 8K context fits (default).
   - **Context** — trade GPU layers away for a longer KV cache.
7. Click **Copy**, replace `/models/...` with your real GGUF path, and run the command. Or
   click **Save script** to download a ready-to-run `.sh` preset.

The plan recomputes live on every input change. `optimizer.js` is also usable directly from
Node (`require("./optimizer.js").calculatePlan({...})`) if you want to script the estimates.

## How the estimate works

- **Weights** — `params × bpw × 1.01` (1% GGUF metadata overhead), using the bit-width of
  the selected quantization.
- **KV cache** — `layers × KV heads × head dim × 2 (K and V) × 2 bytes` at F16, with the K
  and V halves scaled independently by their cache type factor (Q8_0 ≈ 0.53×, Q4_0 ≈ 0.28×).
- **Runtime** — roughly `0.8 + 1% of weights`, split between GPU compute buffers and host
  overhead.
- **Reserves** — headroom for the display, CUDA/Metal context, and OS (7% of VRAM, capped;
  12% for unified memory).
- Context is rounded down to a sane step (1024 above 32K, 512 above 4K, else 256) and is
  capped by the smaller of the native context, the VRAM budget, and the RAM budget.

Architecture presets cover Llama 3.x, Qwen 2/3, Mistral/Mixtral, Gemma 2/3, Phi, DeepSeek
V2/V3/R1 (MLA), Command R, Yi, and a generic GQA fallback. The family is detected from the
model name and the size variant from the parameter count.

## Caveats

These are estimates, not benchmarks. Real usage varies with the llama.cpp build, backend,
attention implementation, graph allocation, and the exact GGUF file. Leave headroom, and if
you hit an out-of-memory error, lower `--ctx-size` first before changing anything else.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup for the config form and the results panel. |
| `styles.css` | Dark theme and layout. |
| `optimizer.js` | Pure calculation logic (UMD-style: browser global `LlamaOptimizer` or CommonJS). |
| `app.js` | DOM wiring: reads inputs, renders the plan, memory bars, insights, and warnings. |
