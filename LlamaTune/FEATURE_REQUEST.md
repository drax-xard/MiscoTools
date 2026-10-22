# FEATURE_REQUEST.md

The following features are requested:

1) **Load parameters from GGUF file**: Allow the user to load a local .gguf file to the tool to read the actual parameters for the model from the file itself.

2) **Separate K and V quantization**: Separate the quantization options for the KV cache so K and V values can each have their own quantization level (for example, K at q8 and V at q4).

3) **Save presets**: Once the configuration is finalized, save the result as a bash script that executes the llama-server command with the selected parameters.

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
