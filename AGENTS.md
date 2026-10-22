# AGENTS.md - Local LLM General Policies and Efficiency Directives


## 1. Output Economy & Anti-Verbosity
- **BE CONCISE:** Respond directly without conversational filler, intros, or summaries of what you are about to do.
- **NO ECHOING:** Do NOT repeat back user code, system prompts, or tool outputs unless specifically requested.
- **DRY CODE:** When modifying files, output *only* the specific lines or functions being changed. Avoid returning full files when targeted diffs or edits suffice.


## 2. Loop Prevention & Reasoning Caps
- **NO RECURSIVE REASONING:** If a tool call fails or returns an error, do NOT re-explain the error back and forth. Fix the call or ask for clarification in 1 sentence.
- **ONE-STEP TOOL CALLS:** Perform tool actions immediately rather than planning multiple hypothetical turns ahead in text.
- **THINKING CAP:** Keep internal reasoning/scratchpad thoughts under 150 words. Transition immediately to tool usage or final answer.


## 3. Context Conservation
- **DO NOT AUTOLOAD LARGE DIRECTORIES:** Request targeted files rather than reading entire folders into context.
- **SUMMARY-FIRST READING:** When inspecting external documentation or logs, summarize findings in bullet points instead of ingesting full logs into response blocks.
