(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LlamaOptimizer = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GIB = 1024 ** 3;
  const HOST_OVERHEAD_GIB = 0.5;
  const BATCH_SIZE = 2048;
  const UBATCH_SIZE = 512;

  const QUANTS = {
    IQ1_S: { bpw: 1.56, label: "IQ1_S" },
    IQ1_M: { bpw: 1.75, label: "IQ1_M" },
    IQ2_XXS: { bpw: 2.06, label: "IQ2_XXS" },
    IQ2_XS: { bpw: 2.31, label: "IQ2_XS" },
    IQ2_S: { bpw: 2.57, label: "IQ2_S" },
    IQ2_M: { bpw: 2.7, label: "IQ2_M" },
    Q2_K: { bpw: 2.63, label: "Q2_K" },
    IQ3_XXS: { bpw: 3.06, label: "IQ3_XXS" },
    IQ3_XS: { bpw: 3.33, label: "IQ3_XS" },
    Q3_K_S: { bpw: 3.44, label: "Q3_K_S" },
    IQ3_M: { bpw: 3.78, label: "IQ3_M" },
    Q3_K_M: { bpw: 3.91, label: "Q3_K_M" },
    Q3_K_L: { bpw: 4.27, label: "Q3_K_L" },
    Q4_0: { bpw: 4.55, label: "Q4_0" },
    Q4_K_S: { bpw: 4.58, label: "Q4_K_S" },
    Q4_K_M: { bpw: 4.85, label: "Q4_K_M" },
    Q4_1: { bpw: 5.0, label: "Q4_1" },
    Q5_K_S: { bpw: 5.52, label: "Q5_K_S" },
    Q5_0: { bpw: 5.54, label: "Q5_0" },
    Q5_K_M: { bpw: 5.68, label: "Q5_K_M" },
    Q5_1: { bpw: 6.0, label: "Q5_1" },
    Q6_K: { bpw: 6.59, label: "Q6_K" },
    Q8_0: { bpw: 8.5, label: "Q8_0" },
    F16: { bpw: 16.0, label: "F16" },
    BF16: { bpw: 16.0, label: "BF16" },
  };

  const KV_FACTORS = {
    f16: 1,
    q8_0: 1.0625 / 2,
    q4_0: 0.5625 / 2,
  };

  const KV_LABELS = {
    f16: "F16",
    q8_0: "Q8_0",
    q4_0: "Q4_0",
  };

  const PROFILE_DEFS = {
    llama3: {
      label: "Llama 3.x",
      variants: [
        { maxParams: 2, layers: 16, kvHeads: 8, headDim: 64, label: "Llama 3.2 1B–2B" },
        { maxParams: 4, layers: 28, kvHeads: 8, headDim: 128, label: "Llama 3.2 3B" },
        { maxParams: 9, layers: 32, kvHeads: 8, headDim: 128, label: "Llama 3.x 8B" },
        { maxParams: 35, layers: 48, kvHeads: 8, headDim: 128, label: "Llama-like 13B–34B" },
        { maxParams: 80, layers: 80, kvHeads: 8, headDim: 128, label: "Llama 3.x 70B" },
        { maxParams: Infinity, layers: 126, kvHeads: 8, headDim: 128, label: "Llama 3.1 405B" },
      ],
    },
    qwen2: {
      label: "Qwen 2 / 2.5",
      variants: [
        { maxParams: 2, layers: 28, kvHeads: 2, headDim: 128, label: "Qwen 2.5 0.5B–1.5B" },
        { maxParams: 4, layers: 36, kvHeads: 2, headDim: 128, label: "Qwen 2.5 3B" },
        { maxParams: 9, layers: 28, kvHeads: 4, headDim: 128, label: "Qwen 2.5 7B" },
        { maxParams: 16, layers: 48, kvHeads: 8, headDim: 128, label: "Qwen 2.5 14B" },
        { maxParams: 40, layers: 64, kvHeads: 8, headDim: 128, label: "Qwen 2.5 32B" },
        { maxParams: Infinity, layers: 80, kvHeads: 8, headDim: 128, label: "Qwen 2.5 72B" },
      ],
    },
    qwen3: {
      label: "Qwen 3",
      variants: [
        { maxParams: 2, layers: 28, kvHeads: 8, headDim: 128, label: "Qwen 3 0.6B–1.7B" },
        { maxParams: 4, layers: 36, kvHeads: 8, headDim: 128, label: "Qwen 3 4B" },
        { maxParams: 9, layers: 36, kvHeads: 8, headDim: 128, label: "Qwen 3 8B" },
        { maxParams: 16, layers: 40, kvHeads: 8, headDim: 128, label: "Qwen 3 14B" },
        { maxParams: 40, layers: 64, kvHeads: 8, headDim: 128, label: "Qwen 3 32B" },
        { maxParams: Infinity, layers: 64, kvHeads: 8, headDim: 128, label: "Qwen 3 30B-A3B / larger" },
      ],
    },
    mistral: {
      label: "Mistral / Mixtral",
      variants: [
        { maxParams: 8, layers: 32, kvHeads: 8, headDim: 128, label: "Mistral 7B" },
        { maxParams: 15, layers: 40, kvHeads: 8, headDim: 128, label: "Mistral Nemo 12B" },
        { maxParams: 25, layers: 40, kvHeads: 8, headDim: 128, label: "Mistral Small 24B" },
        { maxParams: 130, layers: 88, kvHeads: 8, headDim: 128, label: "Mistral Large 123B" },
        { maxParams: Infinity, layers: 88, kvHeads: 8, headDim: 128, label: "Mistral / Mixtral large" },
      ],
    },
    gemma2: {
      label: "Gemma 2",
      variants: [
        { maxParams: 3, layers: 26, kvHeads: 4, headDim: 256, label: "Gemma 2 2B" },
        { maxParams: 10, layers: 42, kvHeads: 8, headDim: 256, label: "Gemma 2 9B" },
        { maxParams: 28, layers: 46, kvHeads: 16, headDim: 128, label: "Gemma 2 27B" },
        { maxParams: Infinity, layers: 46, kvHeads: 16, headDim: 128, label: "Gemma 2 large" },
      ],
    },
    gemma3: {
      label: "Gemma 3",
      variants: [
        { maxParams: 2, layers: 26, kvHeads: 8, headDim: 128, label: "Gemma 3 1B" },
        { maxParams: 5, layers: 34, kvHeads: 8, headDim: 128, label: "Gemma 3 4B" },
        { maxParams: 14, layers: 48, kvHeads: 8, headDim: 128, label: "Gemma 3 12B" },
        { maxParams: 30, layers: 62, kvHeads: 8, headDim: 128, label: "Gemma 3 27B" },
        { maxParams: Infinity, layers: 62, kvHeads: 8, headDim: 128, label: "Gemma 3 large" },
      ],
    },
    phi: {
      label: "Phi-3 / Phi-4",
      variants: [
        { maxParams: 5, layers: 32, kvHeads: 32, headDim: 96, label: "Phi-3 Mini 3.8B" },
        { maxParams: 8, layers: 32, kvHeads: 32, headDim: 96, label: "Phi-3 Small 7B" },
        { maxParams: 15, layers: 40, kvHeads: 10, headDim: 128, label: "Phi-3 Medium / Phi-4 14B" },
        { maxParams: Infinity, layers: 40, kvHeads: 10, headDim: 128, label: "Phi-3 / Phi-4 large" },
      ],
    },
    deepseek: {
      label: "DeepSeek V2 / V3 / R1",
      variants: [
        {
          maxParams: 30,
          layers: 27,
          kvHeads: 0,
          headDim: 0,
          kvBytesPerTokenF16: 27 * (512 + 64) * 2,
          label: "DeepSeek V2 Lite (MLA)",
        },
        {
          maxParams: Infinity,
          layers: 61,
          kvHeads: 0,
          headDim: 0,
          kvBytesPerTokenF16: 61 * (512 + 64) * 2,
          label: "DeepSeek V2 / V3 / R1 (MLA)",
        },
      ],
    },
    command: {
      label: "Command R",
      variants: [
        { maxParams: 40, layers: 40, kvHeads: 8, headDim: 128, label: "Command R 35B" },
        { maxParams: Infinity, layers: 64, kvHeads: 8, headDim: 128, label: "Command R+ 104B" },
      ],
    },
    yi: {
      label: "Yi",
      variants: [
        { maxParams: 10, layers: 32, kvHeads: 8, headDim: 128, label: "Yi 6B / 9B" },
        { maxParams: 40, layers: 48, kvHeads: 8, headDim: 128, label: "Yi 34B" },
        { maxParams: Infinity, layers: 80, kvHeads: 8, headDim: 128, label: "Yi-Large" },
      ],
    },
    generic: {
      label: "Generic GQA",
      variants: [
        { maxParams: 2, layers: 16, kvHeads: 8, headDim: 128, label: "Generic ~1B–2B" },
        { maxParams: 4, layers: 28, kvHeads: 8, headDim: 128, label: "Generic ~3B" },
        { maxParams: 9, layers: 32, kvHeads: 8, headDim: 128, label: "Generic ~7B–8B" },
        { maxParams: 16, layers: 40, kvHeads: 8, headDim: 128, label: "Generic ~13B–14B" },
        { maxParams: 40, layers: 64, kvHeads: 8, headDim: 128, label: "Generic ~30B–34B" },
        { maxParams: 80, layers: 80, kvHeads: 8, headDim: 128, label: "Generic ~70B" },
        { maxParams: Infinity, layers: 126, kvHeads: 8, headDim: 128, label: "Generic 100B+" },
      ],
    },
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function detectFamily(modelName) {
    const name = String(modelName || "").toLowerCase();
    if (!name.trim()) return "generic";
    if (/deepseek/.test(name) && /(v2|v3|r1)/.test(name) && !/distill/.test(name)) return "deepseek";
    if (/qwen\s*[-_]?\s*3/.test(name)) return "qwen3";
    if (/qwen/.test(name)) return "qwen2";
    if (/gemma\s*[-_]?\s*3/.test(name)) return "gemma3";
    if (/gemma/.test(name)) return "gemma2";
    if (/llama/.test(name)) return "llama3";
    if (/mistral|mixtral|codestral|magistral|pixtral/.test(name)) return "mistral";
    if (/phi/.test(name)) return "phi";
    if (/command[-_ ]?r/.test(name)) return "command";
    if (/(^|[^a-z])yi([^a-z]|$)/.test(name)) return "yi";
    return "generic";
  }

  function pickVariant(familyKey, paramsB) {
    const family = PROFILE_DEFS[familyKey] || PROFILE_DEFS.generic;
    const variant =
      family.variants.find((candidate) => paramsB <= candidate.maxParams) ||
      family.variants[family.variants.length - 1];
    return { family, variant };
  }

  function kvBytesForVariant(variant) {
    if (Number.isFinite(variant.kvBytesPerTokenF16)) {
      return variant.kvBytesPerTokenF16;
    }
    return variant.layers * variant.kvHeads * variant.headDim * 2 * 2;
  }

  function resolveProfile(options) {
    const paramsB = Number(options.paramsB);
    const archKey = options.archKey || "auto";

    if (archKey === "custom") {
      const layers = Math.round(Number(options.custom && options.custom.layers));
      const kvHeads = Math.round(Number(options.custom && options.custom.kvHeads));
      const headDim = Math.round(Number(options.custom && options.custom.headDim));
      if (!(layers > 0) || !(kvHeads > 0) || !(headDim > 0)) {
        throw new Error("Custom architecture needs a positive layer count, KV head count, and head dimension.");
      }
      return {
        source: "custom",
        familyKey: "custom",
        familyLabel: "Custom geometry",
        variantLabel: "Manual KV geometry",
        layers,
        kvHeads,
        headDim,
        kvBytesPerTokenF16: layers * kvHeads * headDim * 2 * 2,
      };
    }

    const resolvedKey = archKey === "auto" ? detectFamily(options.modelName) : archKey;
    const safeKey = PROFILE_DEFS[resolvedKey] ? resolvedKey : "generic";
    const { family, variant } = pickVariant(safeKey, paramsB);
    return {
      source: archKey === "auto" ? "auto" : "manual",
      familyKey: safeKey,
      familyLabel: family.label,
      variantLabel: variant.label,
      layers: variant.layers,
      kvHeads: variant.kvHeads,
      headDim: variant.headDim,
      kvBytesPerTokenF16: kvBytesForVariant(variant),
    };
  }

  function estimateWeightsGiB(paramsB, quantKey) {
    const quant = QUANTS[quantKey] || QUANTS.Q4_K_M;
    return ((paramsB * 1e9 * (quant.bpw / 8)) / GIB) * 1.01;
  }

  function estimateRuntimeGiB(weightsGiB) {
    return clamp(0.6 + weightsGiB * 0.01 + 0.22, 0.9, 2.4);
  }

  function reservesFor(vramGiB, ramGiB, unified) {
    const reserveVram =
      vramGiB > 0
        ? unified
          ? clamp(vramGiB * 0.12, 1.5, 4)
          : clamp(vramGiB * 0.07, 0.8, 2.5)
        : 0;
    const reserveRam = ramGiB > 0 ? clamp(ramGiB * 0.15, 1.5, 10) : 0;
    const vramSafety = vramGiB > 0 ? clamp(vramGiB * 0.025, 0.25, 1) : 0;
    return { reserveVram, reserveRam, vramSafety };
  }

  function roundContextDown(value) {
    if (!Number.isFinite(value)) return Infinity;
    if (value >= 32768) return Math.floor(value / 1024) * 1024;
    if (value >= 4096) return Math.floor(value / 512) * 512;
    return Math.floor(value / 256) * 256;
  }

  function formatGiB(value) {
    if (!Number.isFinite(value)) return "∞";
    return value.toFixed(value >= 10 ? 1 : 2);
  }

  function validateInputs(input) {
    const vram = Number(input.vramGiB);
    const ram = Number(input.ramGiB);
    const params = Number(input.paramsB);
    const nativeCtx = Number(input.nativeCtx);
    const threads = Number(input.cpuThreads);

    if (!Number.isFinite(vram) || vram < 0) throw new Error("GPU VRAM must be zero or a positive number.");
    if (!Number.isFinite(ram) || ram <= 0) throw new Error("System RAM must be a positive number.");
    if (!Number.isFinite(params) || params <= 0) throw new Error("Parameter count must be greater than zero.");
    if (!Number.isFinite(nativeCtx) || nativeCtx < 512) throw new Error("Native context must be at least 512 tokens.");
    if (!Number.isFinite(threads) || threads < 1) throw new Error("CPU threads must be at least 1.");
    if (!QUANTS[input.quantKey]) throw new Error("Choose a supported quantization.");
    if (!KV_FACTORS[input.kvType]) throw new Error("Choose a supported KV cache type.");
  }

  function buildCandidate(options, ngl) {
    const {
      layers,
      weightsGiB,
      kvBytesPerToken,
      nativeCtx,
      vramGiB,
      ramGiB,
      unified,
      runtimeGiB,
      reserveVram,
      reserveRam,
      vramSafety,
    } = options;

    const ratio = layers > 0 ? ngl / layers : 0;
    if (vramGiB <= 0 && ngl > 0) return null;

    const gpuComputeGiB = ratio > 0 ? runtimeGiB * (0.45 + 0.55 * ratio) : 0;
    const gpuWeightsGiB = weightsGiB * ratio;
    const gpuKvPerTokenGiB = (kvBytesPerToken * ratio) / GIB;

    let maxByVram = Infinity;
    if (vramGiB > 0 && ratio > 0) {
      const available = vramGiB - reserveVram - vramSafety - gpuComputeGiB - gpuWeightsGiB;
      maxByVram = available > 0 ? available / gpuKvPerTokenGiB : -1;
    }

    let maxByRam = Infinity;
    if (unified) {
      const sharedAvailable = ramGiB - reserveRam - weightsGiB - runtimeGiB - HOST_OVERHEAD_GIB;
      maxByRam = sharedAvailable > 0 ? sharedAvailable / (kvBytesPerToken / GIB) : -1;
    } else {
      const hostAvailable = ramGiB - reserveRam - weightsGiB - HOST_OVERHEAD_GIB;
      if (ratio < 1) {
        const cpuKvPerTokenGiB = (kvBytesPerToken * (1 - ratio)) / GIB;
        maxByRam = hostAvailable > 0 ? hostAvailable / cpuKvPerTokenGiB : -1;
      }
    }

    const maxCtx = Math.min(nativeCtx, maxByVram, maxByRam);
    if (!Number.isFinite(maxCtx) || maxCtx <= 0) return null;

    const ctx = maxCtx >= nativeCtx ? nativeCtx : roundContextDown(maxCtx);
    if (ctx < 256) return null;

    let limitedBy = "native maximum";
    if (ctx < nativeCtx) {
      limitedBy = maxByVram <= maxByRam ? "VRAM limit" : "RAM limit";
    }

    return {
      ngl,
      ratio,
      ctx,
      limitedBy,
      maxByVram,
      maxByRam,
    };
  }

  function chooseCandidate(candidates, strategy, nativeCtx, layers) {
    if (!candidates.length) {
      throw new Error("Not enough memory for even a 256-token context. Reduce quantization or free memory.");
    }

    const byNgl = new Map(candidates.map((candidate) => [candidate.ngl, candidate]));
    const sortedBySpeed = [...candidates].sort((a, b) => b.ngl - a.ngl || b.ctx - a.ctx);
    const full = byNgl.get(layers);

    if (strategy === "context") {
      return [...candidates].sort((a, b) => b.ctx - a.ctx || b.ngl - a.ngl)[0];
    }

    if (strategy === "speed") {
      const minimum = Math.min(nativeCtx, 2048);
      const viable = sortedBySpeed.filter((candidate) => candidate.ctx >= minimum);
      return viable[0] || sortedBySpeed[0];
    }

    const balancedMinimum = Math.min(nativeCtx, 8192);
    if (full && full.ctx >= balancedMinimum) return full;

    const viable = sortedBySpeed.find((candidate) => candidate.ctx >= balancedMinimum);
    if (viable) return viable;
    return full || sortedBySpeed[0];
  }

  function speedClass(plan, layers) {
    if (plan.ngl <= 0) {
      return { label: "CPU-only", foot: "GPU offload unavailable" };
    }
    if (plan.ngl >= layers) {
      return { label: "GPU-bound", foot: "All layers offloaded" };
    }
    if (plan.ratio >= 0.75) {
      return { label: "Fast", foot: `${layers - plan.ngl} layer(s) on CPU` };
    }
    if (plan.ratio >= 0.5) {
      return { label: "Mixed", foot: `${layers - plan.ngl} layer(s) on CPU` };
    }
    return { label: "CPU-heavy", foot: `${layers - plan.ngl} layer(s) on CPU` };
  }

  function slugify(value) {
    return String(value || "model")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.gguf$/i, "")
      .replace(/[^a-zA-Z0-9.]+/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.-]+|[.-]+$/g, "")
      .toLowerCase()
      .slice(0, 72)
      .replace(/[.-]+$/g, "") || "model";
  }

  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function buildArgs(input, profile, plan) {
    const quant = QUANTS[input.quantKey];
    const fileName = `${slugify(input.modelName)}-${quant.label}.gguf`;
    const fullOffload = plan.ngl >= profile.layers;
    const gpuLayers = fullOffload ? profile.layers + 1 : plan.ngl;
    const alias = (String(input.modelName || "").trim() || "Local model").replace(/\s+/g, " ");

    const args = [
      { flag: "--model", value: `/models/${fileName}`, type: "path" },
      { flag: "--alias", value: shellQuote(alias), type: "string" },
      { flag: "--n-gpu-layers", value: String(gpuLayers), type: "number" },
      { flag: "--ctx-size", value: String(plan.ctx), type: "number" },
      { flag: "--parallel", value: "1", type: "number" },
      { flag: "--threads", value: String(Math.round(input.cpuThreads)), type: "number" },
      { flag: "--threads-batch", value: String(Math.round(input.cpuThreads)), type: "number" },
      { flag: "--batch-size", value: String(BATCH_SIZE), type: "number" },
      { flag: "--ubatch-size", value: String(UBATCH_SIZE), type: "number" },
      { flag: "--flash-attn", value: "on", type: "value" },
    ];

    if (input.kvType !== "f16") {
      args.push(
        { flag: "--cache-type-k", value: input.kvType, type: "value" },
        { flag: "--cache-type-v", value: input.kvType, type: "value" }
      );
    }

    return args;
  }

  function makeCommand(args) {
    const lines = ["llama-server \\"];
    args.forEach((arg, index) => {
      lines.push(`  ${arg.flag} ${arg.value}${index < args.length - 1 ? " \\" : ""}`);
    });
    return lines.join("\n");
  }

  function buildInsights(input, profile, plan, context) {
    const insights = [];
    const totalKvGiB = context.totalKvGiB;
    const fullOffload = plan.ngl >= profile.layers;

    if (plan.ngl <= 0) {
      insights.push({
        title: "CPU inference selected.",
        text: `No transformer layers are assigned to the GPU. The command is still valid, but generation will be limited by system memory bandwidth.`,
      });
    } else if (fullOffload) {
      insights.push({
        title: "All layers fit on the GPU.",
        text: `${profile.layers} layers are offloaded. Estimated VRAM headroom after weights, KV cache, runtime buffers, and reserve is ${formatGiB(context.vramFreeGiB)} GiB.`,
      });
    } else {
      insights.push({
        title: "Partial GPU offload is required.",
        text: `${plan.ngl} of ${profile.layers} layers fit in VRAM. The remaining ${profile.layers - plan.ngl} run on the CPU and will bottleneck token generation.`,
      });
    }

    insights.push({
      title: `${plan.ctx.toLocaleString("en-US")} tokens of usable context.`,
      text:
        plan.ctx >= input.nativeCtx
          ? `That is the model's full native context. ${formatGiB(totalKvGiB)} GiB of KV cache is allocated with ${KV_LABELS[input.kvType]}.`
          : `The ${context.limitedBy} caps context below the ${input.nativeCtx.toLocaleString("en-US")} native maximum. ${formatGiB(totalKvGiB)} GiB of KV cache is allocated with ${KV_LABELS[input.kvType]}.`,
    });

    if (input.kvType !== "f16") {
      const saved = (1 - KV_FACTORS[input.kvType]) * 100;
      insights.push({
        title: `${KV_LABELS[input.kvType]} KV cache is paired with flash attention.`,
        text: `It cuts KV memory by about ${Math.round(saved)}% versus F16. Keep both cache-type flags and --flash-attn on together; quantized V cache depends on flash attention.`,
      });
    } else {
      insights.push({
        title: "F16 KV cache preserves maximum cache quality.",
        text: "F16 uses more VRAM than Q8_0. If context is capped, switch the KV cache precision to Q8_0 and rerun.",
      });
    }

    if (input.strategy === "context") {
      insights.push({
        title: "Context-first allocation.",
        text: plan.ngl < profile.layers
          ? `GPU offload was reduced to free VRAM for a longer KV cache. One parallel slot gives the entire context to a single request.`
          : `All layers still fit, so context was maximized without giving up GPU speed. One parallel slot keeps the whole context available to a single request.`,
      });
    } else if (input.strategy === "speed") {
      insights.push({
        title: "Speed-first allocation.",
        text: `The highest viable GPU offload wins, then context grows into whatever VRAM remains. Prompt batches are capped at ${BATCH_SIZE}/${UBATCH_SIZE} to avoid memory spikes.`,
      });
    } else {
      insights.push({
        title: "Balanced allocation.",
        text: `All layers stay on the GPU when at least ${Math.min(input.nativeCtx, 8192).toLocaleString("en-US")} tokens fit. Otherwise a small amount of offload is traded for a workable context.`,
      });
    }

    if (input.unified) {
      insights.push({
        title: "Unified memory accounting is enabled.",
        text: "VRAM and system RAM share the same physical pool. The plan checks the GPU wired-memory limit and total RAM independently. On Apple Silicon, raise the GPU wired limit if Metal reports an out-of-memory error.",
      });
    }

    return insights;
  }

  function buildWarnings(input, profile, plan, context) {
    const warnings = [];
    const fullOffload = plan.ngl >= profile.layers;
    const nativeCtx = Number(input.nativeCtx);

    if (plan.ctx < nativeCtx) {
      const percent = Math.max(1, Math.round((plan.ctx / nativeCtx) * 100));
      let text = `Context is capped at ${plan.ctx.toLocaleString("en-US")} tokens (${percent}% of native) by the ${context.limitedBy}.`;
      if (input.strategy === "balanced") {
        text += " Switch to Context mode to trade GPU layers for more context.";
      }
      warnings.push(text);
    }

    if (plan.ngl <= 0) {
      warnings.push("CPU-only inference will be dramatically slower than GPU offload. Reduce quantization or free VRAM if possible.");
    } else if (!fullOffload) {
      warnings.push(`${profile.layers - plan.ngl} of ${profile.layers} layers stay on the CPU. Expect slower token generation than a full-offload plan.`);
    }

    if (input.vramGiB > 0 && context.weightsGiB > input.vramGiB) {
      warnings.push("The quantized model weights alone exceed VRAM, so a full GPU offload is impossible.");
    }

    if (plan.ctx < 4096) {
      warnings.push("Less than 4K context remains. Use a smaller quantization, free memory, or choose a lower-footprint model.");
    }

    if (context.ramFreeGiB < 0) {
      warnings.push("System RAM is estimated to be over budget. llama.cpp may page the GGUF from disk and slow down sharply.");
    }

    if (input.kvType === "q4_0") {
      warnings.push("Q4_0 KV cache can noticeably reduce long-context quality. Prefer Q8_0 unless you need the last few thousand tokens of context.");
    }

    if (input.unified) {
      warnings.push("Unified memory is shared with the OS. Close other GPU-heavy apps and leave extra headroom on Apple Silicon.");
    }

    if (input.ramGiB < 16 && !fullOffload) {
      warnings.push("With less than 16 GiB RAM, partial offload may leave too little room for CPU-resident layers and the OS.");
    }

    return warnings;
  }

  function calculatePlan(input) {
    validateInputs(input);

    const paramsB = Number(input.paramsB);
    const vramGiB = Number(input.vramGiB);
    const ramGiB = Number(input.ramGiB);
    const nativeCtx = Math.floor(Number(input.nativeCtx));
    const cpuThreads = Math.max(1, Math.round(Number(input.cpuThreads)));
    const strategy = ["speed", "balanced", "context"].includes(input.strategy) ? input.strategy : "balanced";
    const unified = Boolean(input.unified);

    const profile = resolveProfile({
      modelName: input.modelName,
      paramsB,
      archKey: input.archKey,
      custom: input.custom,
    });

    const quant = QUANTS[input.quantKey];
    const weightsGiB = estimateWeightsGiB(paramsB, input.quantKey);
    const runtimeGiB = estimateRuntimeGiB(weightsGiB);
    const kvFactor = KV_FACTORS[input.kvType];
    const kvBytesPerToken = profile.kvBytesPerTokenF16 * kvFactor;
    const { reserveVram, reserveRam, vramSafety } = reservesFor(vramGiB, ramGiB, unified);

    if (!Number.isFinite(kvBytesPerToken) || kvBytesPerToken <= 0) {
      throw new Error("Could not estimate KV cache size. Check the architecture geometry.");
    }

    const candidateOptions = {
      layers: profile.layers,
      weightsGiB,
      kvBytesPerToken,
      nativeCtx,
      vramGiB,
      ramGiB,
      unified,
      runtimeGiB,
      reserveVram,
      reserveRam,
      vramSafety,
    };

    const candidates = [];
    for (let ngl = 0; ngl <= profile.layers; ngl += 1) {
      const candidate = buildCandidate(candidateOptions, ngl);
      if (candidate) candidates.push(candidate);
    }

    if (!candidates.length) {
      throw new Error("Not enough memory for even a 256-token context. Reduce quantization or free memory.");
    }

    const chosen = chooseCandidate(candidates, strategy, nativeCtx, profile.layers);
    const ratio = chosen.ratio;
    const totalKvGiB = (kvBytesPerToken * chosen.ctx) / GIB;
    const gpuKvGiB = totalKvGiB * ratio;
    const cpuKvGiB = totalKvGiB * (1 - ratio);
    const gpuWeightsGiB = weightsGiB * ratio;
    const gpuComputeGiB = ratio > 0 ? runtimeGiB * (0.45 + 0.55 * ratio) : 0;
    const gpuReserveGiB = ratio > 0 ? reserveVram : 0;
    const gpuUsedGiB = gpuWeightsGiB + gpuKvGiB + gpuComputeGiB + gpuReserveGiB;
    const vramFreeGiB = vramGiB - gpuUsedGiB;

    const ramWeightsGiB = weightsGiB;
    const ramKvGiB = unified ? totalKvGiB : cpuKvGiB;
    const ramReserveGiB = reserveRam;
    const ramUsedGiB = ramWeightsGiB + ramKvGiB + ramReserveGiB + HOST_OVERHEAD_GIB;
    const ramFreeGiB = ramGiB - ramUsedGiB;

    const plan = {
      ...chosen,
      strategy,
      profile,
      weightsGiB,
      quant,
      kvType: input.kvType,
      kvLabel: KV_LABELS[input.kvType],
      kvFactor,
      runtimeGiB,
      totalKvGiB,
      gpuKvGiB,
      cpuKvGiB,
      gpuWeightsGiB,
      gpuComputeGiB,
      gpuReserveGiB,
      gpuUsedGiB,
      vramFreeGiB,
      ramWeightsGiB,
      ramKvGiB,
      ramReserveGiB,
      ramUsedGiB,
      ramFreeGiB,
      totalVramGiB: vramGiB,
      totalRamGiB: ramGiB,
      unified,
      reserveVram,
      reserveRam,
      hostOverheadGiB: HOST_OVERHEAD_GIB,
      cpuThreads,
      batchSize: BATCH_SIZE,
      ubatchSize: UBATCH_SIZE,
      nativeCtx,
      paramsB,
      modelName: String(input.modelName || "").trim() || "Local model",
      quantKey: input.quantKey,
    };

    plan.fullOffload = plan.ngl >= profile.layers;
    plan.contextCapped = plan.ctx < nativeCtx;
    plan.contextPercent = Math.min(1, plan.ctx / nativeCtx);
    plan.speed = speedClass(plan, profile.layers);
    plan.args = buildArgs(input, profile, plan);
    plan.command = makeCommand(plan.args);
    plan.insights = buildInsights(input, profile, plan, plan);
    plan.warnings = buildWarnings(input, profile, plan, plan);
    plan.fileName = `${slugify(input.modelName)}-${quant.label}.gguf`;
    plan.gpuLayersArg = plan.fullOffload ? profile.layers + 1 : plan.ngl;
    plan.fit = plan.fullOffload ? "full" : plan.ngl > 0 ? "partial" : "cpu";

    return plan;
  }

  return {
    QUANTS,
    KV_FACTORS,
    KV_LABELS,
    PROFILE_DEFS,
    calculatePlan,
    detectFamily,
    resolveProfile,
    estimateWeightsGiB,
    estimateRuntimeGiB,
    slugify,
    formatGiB,
  };
});
