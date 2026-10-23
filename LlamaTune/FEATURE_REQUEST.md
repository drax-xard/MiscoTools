# FEATURE_REQUEST.md

The following features are requested:

1) **Load parameters from GGUF file**: Allow the user to load a local .gguf file to the tool to read the actual parameters for the model from the file itself.

2) **Separate K and V quantization**: Separate the quantization options for the KV cache so K and V values can each have their own quantization level (for example, K at q8 and V at q4).

3) **Save presets**: Once the configuration is finalized, save the result as a bash script that executes the llama-server command with the selected parameters.

4) **Add ternary quantization schemes**: Add `PTQ1_0` (dense base-3 trits, ~1.75 bpw, 5.95 GB for the 27B pack) and `PQ2_0` (each trit in a 2-bit slot, ~2.13 bpw, 7.21 GB for the 27B pack) to the quantization picker, memory estimate, GGUF auto-detection, and launch command.

---

## Implementation Plan for Requested Features - 22-OCT-2026

### **Architecture Overview**
The project is a vanilla JavaScript/HTML tool that:
- Uses `optimizer.js` for core calculation logic (quantization, memory budgeting, GPU offload search)
- Uses `app.js` for UI event handling and rendering
- Uses `index.html` for the form and results display
- Currently builds `llama-server` commands via `buildArgs()` and `makeCommand()` functions


---

### **Feature 1: Load Parameters from GGUF File**

**Current State:** Parameters are manually entered (model name, parameter count in billions).

**Implementation:**
1. **Add HTML file input** in `index.html` (Model section)
2. **Create GGUF parser** in `optimizer.js`:
   - Parse `GGUF_MAGIC` (0x46554747), `GGUF_VERSION`, and `GGUF_DATA`
   - Extract `llama_model.weight_count` (parameter count)
   - Extract `llama_model.context_length` (native context)
   - Extract `llama_model.architecture` (for auto-detection)
3. **Add JavaScript file reader** in `app.js`:
   - Listen for file selection
   - Use `FileReader` to read binary data
   - Call new `GGUFParser.parse()` function
   - Auto-fill parameter fields, validate, and trigger recalculation


**Dependencies:** `@mlc-ai/binding` or a simple binary parser (~200 lines)


---

### **Feature 2: Separate K and V Quantization**

**Current State:** `--cache-type-k` and `--cache-type-v` are set to the same value (line 445-450 in `optimizer.js`).

**Implementation:**
1. **Add HTML dropdowns** in `index.html` (Model section, next to KV cache):
   - Separate dropdowns for K and V cache types
   - Default to same value as KV cache for backwards compatibility
2. **Extend `KV_FACTORS`** in `optimizer.js` to support combinations
3. **Update `buildArgs()`** to use separate values:
   ```javascript
   args.push({ flag: "--cache-type-k", value: input.kvTypeK, type: "value" });
   args.push({ flag: "--cache-type-v", value: input.kvTypeV, type: "value" });
   ```
4. **Add to input validation** to ensure valid combinations
5. **Update memory calculations** to use appropriate factor for each

**UI Change:** Add two dropdowns with same options as KV cache (Q8_0, F16, Q4_0)


---

### **Feature 3: Save Presets as Bash Script**

**Current State:** Command is displayed but not saved.

**Implementation:**
1. **Add "Save Preset" button** in `index.html` (Command card area)
2. **Create `savePreset()` function** in `app.js`:
   - Use `state.lastPlan.command` (already generated)
   - Prompt user for filename via `prompt()` or modal
   - Use `Blob` + `URL.createObjectURL()` + `<a>` download
3. **Add "Load Preset" functionality** (optional but recommended):
   - File input for `.bash` or `.sh` files
   - Parse command line arguments
   - Auto-fill form fields
4. **Add preset management** (advanced):
   - `localStorage` or `IndexedDB` for named presets
   - "Manage presets" modal with list, rename, delete

**UI Addition:** Button with download icon in command card


---

### **Recommended Implementation Order**

1. **Feature 2** (Separate K/V quantization) - Smallest change, highest impact
2. **Feature 3** (Save presets) - Purely additive, no logic changes
3. **Feature 1** (GGUF parser) - Most complex, requires binary parsing


---

### **Estimated Effort**
- Feature 1: ~300-400 lines (GGUF parser + file handling)
- Feature 2: ~80-100 lines (2 dropdowns + validation updates)
- Feature 3: ~60-80 lines (download + optional load)

**Total: ~450-600 lines of code**

---

## Implementation Plan for Ternary Quantization (PTQ1_0 / PQ2_0) - 23-OCT-2026

### **Assessment**

**Feasibility: high; low-risk, mostly metadata.** `LlamaTune` already derives weight size, validation, GGUF detection, and output filenames from the `QUANTS` table, so both schemes can be added without changing the memory or offload search logic.

**Important distinction from `TQ1_0` / `TQ2_0`:** these are PrismML group-128 ternary types used by Ternary Bonsai 2, not the upstream llama.cpp ternary types:
- `PTQ1_0` is GGML tensor type **143**: fp16 scale + dense base-3 trits, 28 bytes per 128 weights = **1.75 bpw**.
- `PQ2_0` is GGML tensor type **142**: fp16 scale + one trit per 2-bit slot, 34 bytes per 128 weights = **2.125 bpw** (report as **2.13 bpw**).
- Both store the same ternary weights. Quality is identical; the difference is file size, unpack cost, and backend/kernel support.
- Do **not** alias them to `TQ1_0`/`TQ2_0`: the group size and tensor type IDs differ, and alias detection would misreport parameters and memory.

**Runtime caveat:** stock llama.cpp may refuse these GGUFs as unknown tensor types. They currently require the PrismML llama.cpp fork (or a build containing the relevant upstream PR). The UI should surface this in the warnings list rather than silently producing a command that cannot load the model.

**Memory check:** the request's 5.95 GB / 7.21 GB figures are decimal GB for the 27B pack. `LlamaTune` displays GiB, so expect about **5.54 GiB** and **6.71 GiB** of weights respectively (plus the existing 1% GGUF overhead and runtime reserve). These are consistent, not a calculation error.

### **Implementation**

1. **Add entries to `QUANTS` in `optimizer.js`**
   ```javascript
   PTQ1_0: { bpw: 1.75, label: "PTQ1_0", ternary: true, packing: "dense base-3", runtime: "prismml" },
   PQ2_0: { bpw: 2.125, label: "PQ2_0", ternary: true, packing: "2-bit slots", runtime: "prismml" },
   ```
   The existing `estimateWeightsGiB()`, `validateInputs()`, `buildArgs()`, and filename generation then work automatically. Store the exact 2.125 bpw for calculation and display it as the requested **2.13 bpw** in the UI.

2. **Add UI options in `index.html`**
   - Add an optgroup above the existing low-bit group:
     ```html
     <optgroup label="Ternary · PrismML">
       <option value="PTQ1_0">PTQ1_0 · 1.75 bpw · dense trits</option>
       <option value="PQ2_0">PQ2_0 · 2.13 bpw · 2-bit slots</option>
     </optgroup>
     ```
   - Keep `Q4_K_M` selected by default; do not make a fork-only format the default.

3. **Teach the GGUF parser to recognize the types (`optimizer.js`)**
   - Add to `GGML_TYPE_QUANTS`:
     ```javascript
     142: "PQ2_0",
     143: "PTQ1_0",
     ```
   - Add the matching `general.file_type` values to `GGUF_FILE_TYPE_QUANTS` after verifying them against the published packs (reports indicate file types 141/143; tensor type 142/143 is the authoritative signal). The existing dominant-tensor-type fallback already handles files whose metadata does not map cleanly.

4. **Add a runtime warning (`buildWarnings()` in `optimizer.js`)**
   ```javascript
   const quant = QUANTS[input.quantKey];
   if (quant && quant.runtime === "prismml") {
     warnings.push(
       `${quant.label} uses PrismML ternary tensor types. Run the GGUF with a PrismML llama.cpp build (or an upstream build with PTQ1_0/PQ2_0 support); stock llama.cpp may reject it as an unsupported type.`
     );
   }
   ```
   Optionally add an insight explaining that `PQ2_0` usually has faster prompt processing while `PTQ1_0` is smaller and can decode faster when memory-bandwidth-bound.

5. **No changes needed in `app.js`** for the core path: quantization reads from the select, the GGUF loader already applies any valid `QUANTS` key, and presets use `plan.quant.label`. Only add copy if the extra note is shown outside the warnings list.

6. **Architecture note (follow-up):** Ternary Bonsai 2 uses hybrid attention and may not match the existing generic/Qwen KV profiles. If its real GGUF geometry differs, users should still override layers / KV heads / head dim in *Architecture estimate*. Adding a dedicated `bonsai` profile is a separate enhancement, not part of this quantization request.

### **Verification**
- `node --check LlamaTune/optimizer.js && node --check LlamaTune/app.js`
- Node smoke test with `paramsB: 27`: confirm `PTQ1_0` estimates about 5.54 GiB / 5.95 GB of weights and `PQ2_0` about 6.71 GiB / 7.21 GB, and that the generated `--model` filename uses the selected label.
- Load a real `Ternary-Bonsai-2-27B-*.gguf` and confirm the picker auto-selects `PTQ1_0` or `PQ2_0` from tensor type 143/142.
- In the browser, select each scheme and confirm the command, preset comment, and PrismML runtime warning update correctly.

### **Estimated Effort**
- `optimizer.js` table + parser + warning: ~20-30 lines
- `index.html` options: ~5 lines
- Verification and copy: ~15 lines

**Total: ~40-50 lines, one file pair, no new dependencies.**

