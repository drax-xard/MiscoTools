(function () {
  "use strict";

  const Optimizer = window.LlamaOptimizer;
  if (!Optimizer) return;

  const GGUF_READ_LIMIT = 64 * 1024 * 1024;

  const state = {
    strategy: "balanced",
    lastPlan: null,
    lastWarnings: 0,
    copyTimer: null,
    saveTimer: null,
  };

  const STRATEGY_COPY = {
    speed: "Pushes as many layers onto the GPU as possible, then uses the remaining VRAM for context.",
    balanced: "Keeps all layers on the GPU whenever possible, then grows context to fill the remaining VRAM.",
    context: "Allows fewer GPU layers if that frees enough VRAM for a substantially longer context.",
  };

  const TITLES = {
    speed: "Speed-first plan",
    balanced: "Balanced plan",
    context: "Context-first plan",
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    form: $("config-form"),
    gpuModel: $("gpu-model"),
    vram: $("vram"),
    ram: $("ram"),
    cpuModel: $("cpu-model"),
    cpuThreads: $("cpu-threads"),
    unified: $("unified-memory"),
    ggufFile: $("gguf-file"),
    ggufStatus: $("gguf-status"),
    modelName: $("model-name"),
    params: $("params"),
    quant: $("quant"),
    nativeContext: $("native-context"),
    kvCacheK: $("kv-cache-k"),
    kvCacheV: $("kv-cache-v"),
    archProfile: $("arch-profile"),
    archSummary: $("arch-summary"),
    archNote: $("arch-note"),
    customLayersField: $("custom-layers-field"),
    customKvHeadsField: $("custom-kv-heads-field"),
    customHeadDimField: $("custom-head-dim-field"),
    customLayers: $("custom-layers"),
    customKvHeads: $("custom-kv-heads"),
    customHeadDim: $("custom-head-dim"),
    strategyCopy: $("strategy-copy"),
    segments: Array.from(document.querySelectorAll(".segment")),
    planTitle: $("plan-title"),
    fitBadge: $("fit-badge"),
    metricContext: $("metric-context"),
    metricContextFoot: $("metric-context-foot"),
    metricLayers: $("metric-layers"),
    metricLayersTotal: $("metric-layers-total"),
    metricLayersFoot: $("metric-layers-foot"),
    metricKv: $("metric-kv"),
    metricKvFoot: $("metric-kv-foot"),
    metricSpeed: $("metric-speed"),
    metricSpeedFoot: $("metric-speed-foot"),
    commandSummary: $("command-summary"),
    commandOutput: $("command-output"),
    copyButton: $("copy-button"),
    saveButton: $("save-button"),
    showWarnings: $("show-warnings"),
    memoryCaption: $("memory-caption"),
    memoryNames: Array.from(document.querySelectorAll(".memory-name")),
    vramUsed: $("vram-used"),
    vramFree: $("vram-free"),
    vramBar: $("vram-bar"),
    vramLegend: $("vram-legend"),
    ramUsed: $("ram-used"),
    ramFree: $("ram-free"),
    ramBar: $("ram-bar"),
    ramLegend: $("ram-legend"),
    assumptionText: $("assumption-text"),
    insightList: $("insight-list"),
    warningBox: $("warning-box"),
    warningList: $("warning-list"),
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
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

  function readNumber(element) {
    const raw = element.value.trim();
    return raw === "" ? NaN : Number(raw);
  }

  function readInputs() {
    return {
      gpuModel: els.gpuModel.value.trim(),
      cpuModel: els.cpuModel.value.trim(),
      vramGiB: readNumber(els.vram),
      ramGiB: readNumber(els.ram),
      cpuThreads: readNumber(els.cpuThreads),
      unified: els.unified.checked,
      modelName: els.modelName.value,
      paramsB: readNumber(els.params),
      quantKey: els.quant.value,
      nativeCtx: readNumber(els.nativeContext),
      kvTypeK: els.kvCacheK.value,
      kvTypeV: els.kvCacheV.value,
      archKey: els.archProfile.value,
      custom: {
        layers: readNumber(els.customLayers),
        kvHeads: readNumber(els.customKvHeads),
        headDim: readNumber(els.customHeadDim),
      },
      strategy: state.strategy,
    };
  }

  function setCustomFieldsVisible() {
    const visible = els.archProfile.value === "custom";
    els.customLayersField.hidden = !visible;
    els.customKvHeadsField.hidden = !visible;
    els.customHeadDimField.hidden = !visible;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
    return `${Math.round(bytes)} B`;
  }

  function updateArchitectureSummary() {
    const input = readInputs();
    setCustomFieldsVisible();

    try {
      const profile = Optimizer.resolveProfile({
        modelName: input.modelName,
        paramsB: input.paramsB,
        archKey: input.archKey,
        custom: input.custom,
      });

      els.archSummary.textContent = `${profile.familyLabel} · ${profile.layers}L`;
      const geometry =
        profile.kvHeads > 0
          ? `${profile.layers} layers × ${profile.kvHeads} KV heads × ${profile.headDim} head dim`
          : `${profile.layers} layers · compressed MLA cache`;
      const source =
        profile.source === "auto"
          ? `Auto-detected ${profile.variantLabel}`
          : profile.source === "manual"
            ? `Preset: ${profile.variantLabel}`
            : "Custom geometry";
      els.archNote.textContent = `${source} — ${geometry}. Estimated ${formatBytes(profile.kvBytesPerTokenF16)} per token at F16. Override if your GGUF metadata differs.`;
    } catch (error) {
      els.archSummary.textContent = "Custom geometry needed";
      els.archNote.textContent = error.message;
    }
  }

  function setGgufStatus(message, variant) {
    els.ggufStatus.textContent = message;
    els.ggufStatus.classList.remove("is-success", "is-error");
    if (variant) els.ggufStatus.classList.add(variant);
  }

  function hasArchOption(value) {
    return Array.from(els.archProfile.options).some((option) => option.value === value);
  }

  function applyGgufInfo(info, fileName) {
    if (info.modelName) {
      els.modelName.value = info.modelName;
    } else if (fileName) {
      els.modelName.value = fileName.replace(/\.gguf$/i, "");
    }

    if (info.paramsB > 0) {
      els.params.value = String(Number(info.paramsB.toFixed(2)));
    }

    if (info.contextLength >= 512) {
      els.nativeContext.value = String(Math.round(info.contextLength));
    }

    if (info.quantKey && Optimizer.QUANTS[info.quantKey]) {
      els.quant.value = info.quantKey;
    }

    const hasGeometry =
      Number(info.layers) > 0 && Number(info.kvHeads) > 0 && Number(info.headDim) > 0;
    if (hasGeometry && info.archProfile !== "deepseek") {
      els.archProfile.value = "custom";
      els.customLayers.value = String(Math.round(info.layers));
      els.customKvHeads.value = String(Math.round(info.kvHeads));
      els.customHeadDim.value = String(Number(info.headDim.toFixed(2)));
    } else if (info.archProfile && hasArchOption(info.archProfile)) {
      els.archProfile.value = info.archProfile;
    }

    setCustomFieldsVisible();
    recalculate();

    const details = [];
    if (info.paramsB > 0) details.push(`${Number(info.paramsB.toFixed(2))}B params`);
    if (info.contextLength >= 512) details.push(`${Math.round(info.contextLength).toLocaleString("en-US")} ctx`);
    if (info.quantKey) details.push(info.quantKey);
    if (hasGeometry) details.push(`${Math.round(info.layers)} layers`);

    const note =
      details.length > 0
        ? `Loaded ${fileName}: ${details.join(" · ")}.`
        : `Loaded ${fileName}, but no usable metadata fields were found.`;
    setGgufStatus(note, details.length > 0 ? "is-success" : "is-error");
  }

  async function loadGgufFile() {
    const file = els.ggufFile.files && els.ggufFile.files[0];
    if (!file) return;

    setGgufStatus(`Reading ${file.name}…`);
    try {
      const slice = file.slice(0, Math.min(file.size, GGUF_READ_LIMIT));
      const buffer = await slice.arrayBuffer();
      const info = Optimizer.parseGGUF(new Uint8Array(buffer));
      applyGgufInfo(info, file.name);
    } catch (error) {
      const suffix =
        file.size > GGUF_READ_LIMIT ? ` Only the first ${GGUF_READ_LIMIT / (1024 * 1024)} MiB were read.` : "";
      setGgufStatus(`${error.message}${suffix}`, "is-error");
    }
  }

  function setBadge(text, variant) {
    els.fitBadge.textContent = text;
    els.fitBadge.classList.remove("is-warn", "is-neutral", "is-danger");
    if (variant) els.fitBadge.classList.add(variant);
  }

  function setMetric(element, value) {
    element.textContent = value;
  }

  function renderCommand(plan) {
    const rows = [
      `<span class="cmd-binary">llama-server</span> <span class="cmd-dim">\\</span>`,
    ];

    plan.args.forEach((argument, index) => {
      const trailing = index < plan.args.length - 1 ? ' <span class="cmd-dim">\\</span>' : "";
      const valueClass = argument.type === "string" || argument.type === "path" ? "cmd-string" : "cmd-value";
      rows.push(
        `  <span class="cmd-flag">${escapeHtml(argument.flag)}</span> <span class="${valueClass}">${escapeHtml(argument.value)}</span>${trailing}`
      );
    });

    els.commandOutput.innerHTML = rows.join("\n");
  }

  function legendItem(color, label, value) {
    return `<span class="legend-item"><i class="legend-dot ${color}"></i>${escapeHtml(label)} <strong>${escapeHtml(value)}</strong></span>`;
  }

  function renderMemoryBar(bar, segments, total) {
    const ordered = ["weights", "kv", "runtime", "reserve"];
    let used = 0;

    ordered.forEach((key) => {
      const segment = bar.querySelector(`[data-seg="${key}"]`);
      const value = Math.max(0, Number(segments[key]) || 0);
      used += value;
      if (!segment) return;
      const width = total > 0 ? Math.min(100, (value / total) * 100) : 0;
      segment.style.width = `${width}%`;
      segment.style.display = value > 0 ? "block" : "none";
    });

    return { used, free: total - used };
  }

  function setUsedText(element, used, total) {
    if (!(total > 0)) {
      element.textContent = "No GPU";
      return;
    }
    element.textContent = `${Optimizer.formatGiB(used)} / ${Optimizer.formatGiB(total)} GiB`;
  }

  function setFreeText(element, free) {
    element.classList.toggle("is-over", free < -0.05);
    if (free < -0.05) {
      element.textContent = `${Optimizer.formatGiB(Math.abs(free))} GiB over`;
    } else {
      element.textContent = `${Optimizer.formatGiB(Math.max(0, free))} GiB free`;
    }
  }

  function memoryLabels(unified) {
    if (els.memoryNames.length < 2) return;
    els.memoryNames[0].textContent = unified ? "GPU wired" : "VRAM";
    els.memoryNames[1].textContent = unified ? "Unified RAM" : "System RAM";
    els.memoryCaption.textContent = unified
      ? "Shared physical pool · checked against both GPU and RAM limits"
      : "Estimated allocation at launch";
    els.assumptionText.textContent = unified
      ? "Unified memory checks the GPU wired-memory limit and total RAM independently. The reserve covers OS overhead, Metal/CUDA context, and compute buffers."
      : "Assumes ~1% GGUF overhead and reserves headroom for the display, CUDA/Metal context, and compute buffers.";
  }

  function renderMemory(plan) {
    memoryLabels(plan.unified);

    const vramSegments = {
      weights: plan.gpuWeightsGiB,
      kv: plan.gpuKvGiB,
      runtime: plan.gpuComputeGiB,
      reserve: plan.gpuReserveGiB,
    };

    const vramBar = renderMemoryBar(els.vramBar, vramSegments, plan.totalVramGiB);
    els.vramBar.setAttribute(
      "aria-label",
      plan.totalVramGiB > 0
        ? `VRAM: ${Optimizer.formatGiB(vramBar.used)} of ${Optimizer.formatGiB(plan.totalVramGiB)} GiB used`
        : "No GPU configured"
    );

    if (plan.totalVramGiB > 0) {
      setUsedText(els.vramUsed, vramBar.used, plan.totalVramGiB);
      setFreeText(els.vramFree, plan.totalVramGiB - vramBar.used);
      els.vramLegend.innerHTML = [
        legendItem("weights", "Weights", `${Optimizer.formatGiB(plan.gpuWeightsGiB)} GiB`),
        legendItem("kv", "KV cache", `${Optimizer.formatGiB(plan.gpuKvGiB)} GiB`),
        legendItem("runtime", "Compute", `${Optimizer.formatGiB(plan.gpuComputeGiB)} GiB`),
        legendItem("reserve", "Reserve", `${Optimizer.formatGiB(plan.gpuReserveGiB)} GiB`),
        legendItem("free", "Free", `${Optimizer.formatGiB(Math.max(0, plan.totalVramGiB - vramBar.used))} GiB`),
      ].join("");
    } else {
      els.vramUsed.textContent = "No GPU";
      els.vramFree.textContent = "CPU inference";
      els.vramFree.classList.remove("is-over");
      els.vramLegend.innerHTML = '<span class="legend-item">No GPU configured; all layers and KV cache use system RAM.</span>';
    }

    const ramSegments = {
      weights: plan.ramWeightsGiB,
      kv: plan.ramKvGiB,
      reserve: plan.ramReserveGiB + plan.hostOverheadGiB,
    };
    const ramBar = renderMemoryBar(els.ramBar, ramSegments, plan.totalRamGiB);
    setUsedText(els.ramUsed, ramBar.used, plan.totalRamGiB);
    setFreeText(els.ramFree, plan.totalRamGiB - ramBar.used);
    els.ramBar.setAttribute(
      "aria-label",
      `System RAM: ${Optimizer.formatGiB(ramBar.used)} of ${Optimizer.formatGiB(plan.totalRamGiB)} GiB used`
    );
    els.ramLegend.innerHTML = [
      legendItem("weights", plan.unified ? "Model" : "Host model", `${Optimizer.formatGiB(plan.ramWeightsGiB)} GiB`),
      legendItem("kv", plan.unified ? "Total KV" : "CPU KV", `${Optimizer.formatGiB(plan.ramKvGiB)} GiB`),
      legendItem(
        "reserve",
        "OS + overhead",
        `${Optimizer.formatGiB(plan.ramReserveGiB + plan.hostOverheadGiB)} GiB`
      ),
      legendItem("free", "Free", `${Optimizer.formatGiB(Math.max(0, plan.totalRamGiB - ramBar.used))} GiB`),
    ].join("");
  }

  function renderInsights(insights) {
    els.insightList.innerHTML = insights
      .map(
        (insight) =>
          `<li><span><strong>${escapeHtml(insight.title)}</strong> ${escapeHtml(insight.text)}</span></li>`
      )
      .join("");
  }

  function renderWarnings(warnings) {
    state.lastWarnings = warnings.length;
    els.warningBox.hidden = warnings.length === 0;
    els.warningList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
    els.showWarnings.textContent = warnings.length === 0 ? "clean fit" : `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
    els.showWarnings.classList.toggle("has-warnings", warnings.length > 0);
    els.showWarnings.title = warnings.length > 0 ? "Jump to warnings" : "No warnings for this plan";
  }

  function renderPlan(plan) {
    state.lastPlan = plan;
    els.copyButton.disabled = false;
    els.saveButton.disabled = false;

    els.planTitle.textContent = TITLES[plan.strategy];

    if (plan.fit === "full" && !plan.contextCapped) {
      setBadge("Full GPU · native ctx", "");
    } else if (plan.fit === "full") {
      setBadge("Full GPU · capped ctx", "is-warn");
    } else if (plan.fit === "partial") {
      setBadge("Partial offload", "is-warn");
    } else {
      setBadge("CPU only", "is-danger");
    }

    els.metricContext.textContent = plan.ctx.toLocaleString("en-US");
    els.metricContextFoot.textContent = plan.contextCapped
      ? `${Math.round(plan.contextPercent * 100)}% of native · ${plan.limitedBy}`
      : "Native maximum";

    els.metricLayers.textContent = String(plan.ngl);
    els.metricLayersTotal.textContent = `/ ${plan.profile.layers}`;
    els.metricLayersFoot.textContent = plan.fullOffload
      ? "Full acceleration"
      : `${plan.profile.layers - plan.ngl} layer${plan.profile.layers - plan.ngl === 1 ? "" : "s"} on CPU`;

    els.metricKv.textContent = plan.kvLabel;
    if (plan.fullOffload) {
      els.metricKvFoot.textContent = `${Optimizer.formatGiB(plan.totalKvGiB)} GiB on GPU`;
    } else if (plan.ngl <= 0) {
      els.metricKvFoot.textContent = `${Optimizer.formatGiB(plan.totalKvGiB)} GiB on CPU`;
    } else {
      els.metricKvFoot.textContent = `${Optimizer.formatGiB(plan.gpuKvGiB)} GPU · ${Optimizer.formatGiB(plan.cpuKvGiB)} CPU`;
    }

    els.metricSpeed.textContent = plan.speed.label;
    els.metricSpeedFoot.textContent = plan.speed.foot;

    els.commandSummary.textContent = `llama-server · ${plan.ngl}/${plan.profile.layers} layers · ${plan.ctx.toLocaleString("en-US")} ctx`;
    renderCommand(plan);
    renderMemory(plan);
    renderInsights(plan.insights);
    renderWarnings(plan.warnings);

    els.commandOutput.classList.remove("is-error");
  }

  function renderError(error) {
    state.lastPlan = null;
    els.copyButton.disabled = true;
    els.saveButton.disabled = true;
    els.planTitle.textContent = "Awaiting valid specs";
    setBadge("Check inputs", "is-danger");

    els.metricContext.textContent = "—";
    els.metricContextFoot.textContent = "No viable plan";
    els.metricLayers.textContent = "—";
    els.metricLayersTotal.textContent = "/ —";
    els.metricLayersFoot.textContent = "—";
    els.metricKv.textContent = "—";
    els.metricKvFoot.textContent = "—";
    els.metricSpeed.textContent = "—";
    els.metricSpeedFoot.textContent = "—";

    els.commandSummary.textContent = "No valid plan";
    els.commandOutput.innerHTML = [
      `<span class="cmd-error"># ${escapeHtml(error.message)}</span>`,
      `<span class="cmd-dim"># Adjust the inputs and the command will update automatically.</span>`,
    ].join("\n");

    els.vramUsed.textContent = "—";
    els.vramFree.textContent = "—";
    els.ramUsed.textContent = "—";
    els.ramFree.textContent = "—";
    [els.vramBar, els.ramBar].forEach((bar) => {
      Array.from(bar.children).forEach((segment) => {
        segment.style.width = "0%";
        segment.style.display = "none";
      });
    });
    els.vramLegend.innerHTML = "";
    els.ramLegend.innerHTML = "";
    els.insightList.innerHTML = "<li><span>Enter valid hardware and model values to generate a launch plan.</span></li>";

    state.lastWarnings = 1;
    els.warningBox.hidden = false;
    els.warningList.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
    els.showWarnings.textContent = "1 issue";
    els.showWarnings.classList.add("has-warnings");
  }

  function recalculate() {
    updateArchitectureSummary();
    try {
      const plan = Optimizer.calculatePlan(readInputs());
      renderPlan(plan);
    } catch (error) {
      renderError(error);
    }
  }

  let frame = null;
  function scheduleRecalculate() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = null;
      recalculate();
    });
  }

  function setStrategy(strategy) {
    if (!STRATEGY_COPY[strategy]) return;
    state.strategy = strategy;
    els.strategyCopy.textContent = STRATEGY_COPY[strategy];
    els.segments.forEach((button) => {
      const active = button.dataset.strategy === strategy;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    recalculate();
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (error) {
      success = false;
    }
    textarea.remove();
    return success;
  }

  function flashCopyButton(success) {
    const label = els.copyButton.querySelector("span");
    const original = "Copy";
    if (state.copyTimer) window.clearTimeout(state.copyTimer);
    label.textContent = success ? "Copied" : "Failed";
    els.copyButton.classList.toggle("is-copied", success);
    state.copyTimer = window.setTimeout(() => {
      label.textContent = original;
      els.copyButton.classList.remove("is-copied");
      state.copyTimer = null;
    }, 1800);
  }

  async function copyCommand() {
    if (!state.lastPlan) return;
    const text = state.lastPlan.command;
    let success = false;
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch (error) {
      success = fallbackCopy(text);
    }
    flashCopyButton(success);
  }

  function buildPresetScript(plan) {
    const modelName = String(plan.modelName).replace(/[\r\n]+/g, " ").slice(0, 200);
    return [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      `# llamatune preset — ${modelName}`,
      `# ${plan.paramsB}B · ${plan.quant.label} · ${plan.ctx} ctx · ${plan.kvLabel} KV`,
      "",
      plan.command,
      "",
    ].join("\n");
  }

  function flashSaveButton() {
    const label = els.saveButton.querySelector("span");
    if (state.saveTimer) window.clearTimeout(state.saveTimer);
    label.textContent = "Saved";
    els.saveButton.classList.add("is-copied");
    state.saveTimer = window.setTimeout(() => {
      label.textContent = "Save script";
      els.saveButton.classList.remove("is-copied");
      state.saveTimer = null;
    }, 1800);
  }

  function savePreset() {
    if (!state.lastPlan) return;
    const plan = state.lastPlan;
    const fileName = `${Optimizer.slugify(`${plan.modelName}-${plan.quant.label}`)}-llama-server.sh`;
    const blob = new Blob([buildPresetScript(plan)], { type: "text/x-shellscript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    flashSaveButton();
  }

  function jumpToWarnings() {
    if (state.lastWarnings <= 0) return;
    els.warningBox.scrollIntoView({ behavior: "smooth", block: "center" });
    els.warningBox.classList.remove("is-flashing");
    void els.warningBox.offsetWidth;
    els.warningBox.classList.add("is-flashing");
    window.setTimeout(() => els.warningBox.classList.remove("is-flashing"), 900);
  }

  function bindEvents() {
    els.form.addEventListener("input", scheduleRecalculate);
    els.form.addEventListener("change", scheduleRecalculate);
    els.form.addEventListener("submit", (event) => event.preventDefault());

    els.segments.forEach((button) => {
      button.addEventListener("click", () => setStrategy(button.dataset.strategy));
    });

    els.copyButton.addEventListener("click", copyCommand);
    els.saveButton.addEventListener("click", savePreset);
    els.ggufFile.addEventListener("change", loadGgufFile);
    els.showWarnings.addEventListener("click", jumpToWarnings);
  }

  function init() {
    bindEvents();
    els.strategyCopy.textContent = STRATEGY_COPY[state.strategy];
    updateArchitectureSummary();
    recalculate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
