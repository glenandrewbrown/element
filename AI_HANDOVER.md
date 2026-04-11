# AI Handover — Element (project status log)

**This file is a dated status log for multi-agent / session context parity. It is not design authority.** If anything here disagrees with [docs/ELEMENT_UNIFIED_BLUEPRINT.md](docs/ELEMENT_UNIFIED_BLUEPRINT.md), [docs/ELEMENT_FEATURE_INVENTORY.md](docs/ELEMENT_FEATURE_INVENTORY.md), or [docs/ELEMENT_LLM_AGENT_BRIEFING.md](docs/ELEMENT_LLM_AGENT_BRIEFING.md), **the docs win**.

---

## Canonical agent preamble (onboarding)

You are working on the Element audio plugin host UI/UX overhaul.

**CRITICAL CONTEXT:** Load and read `docs/ELEMENT_UNIFIED_BLUEPRINT.md` before doing anything. This is the single source of truth. V3.0 — the Instrument Paradigm.

**KEY FACTS:**

- Element is a modular audio plugin host (VST3/AU/LV2/CLAP) built with JUCE 8 / C++20
- UI: React/Tailwind frontend hosted in JUCE's `WebBrowserComponent`
- Graph engine: `@xyflow/react` (React Flow v12) with aggressive memoisation
- Bridge: `window.__JUCE__` API for C++ ↔ JS communication
- State: `juce::ValueTree` single source of truth, synced to React via ~60Hz timer
- Three signal types: Audio (blue), MIDI (teal), Value/CV (orange)

**DESIGN PARADIGM — THE INSTRUMENT:**  
Element is a precision creative instrument for expert users in flow state. NOT for beginners. Technical depth surfaced beautifully. Speed of iteration is the supreme metric. Information density IS the beauty. One unified dark palette. No mode-switching colour gimmicks.

**VISUAL LANGUAGE — NEUMORPHISM (NOT glass):**  
No glassmorphism. No backdrop-blur. No transparency. The entire UI is one continuous dark chassis with controls extruded from or pressed into the surface via paired soft shadows. Narrow tonal range between surfaces (critical for the “same material” illusion):

- Canvas: `#1E1E22`, Panel: `#222226`, Surface: `#252529`, Elevated: `#2A2A2E`, Pressed: `#1A1A1E`
- Raised: light shadow top-left `rgba(255,255,255,0.05)` + dark bottom-right `rgba(0,0,0,0.4)`, 8px blur min
- Pressed: inner shadows inverted. Buttons press INTO the surface on click.
- Micro-glow: 4px outer glow of semantic hue at 25% opacity on active elements

**SEMANTIC COLOURS (colour-blind safe, each with shape indicator):**

- Generators: `#4A90D9` Blue + Circle
- Modifiers: `#E8A838` Orange + Diamond
- Logic: `#2BC4C4` Teal + Triangle
- Text: `#E5E5EA` primary, `#8E8E93` secondary

**SPEED-FIRST NAVIGATION:**

- Double-click Block = dive into nested Board (150ms)
- Double-click empty canvas = navigate UP one level (150ms)
- Cmd+K = command palette (search everything)
- Right-click canvas = QuickAdd at cursor
- Ctrl+0–9 / Shift+0–9 = spatial bookmarks
- Tab = jump to next block in signal chain
- Escape = deselect / close / back out one level

**KEY FEATURES:**  
Edit Mode (workshop) / Perform Mode (stage) — structural change, NOT palette change. Dashboard Builder in Perform Mode. Scene/Preset system. Panic button (red, always visible). Value Events as third signal type.

**TERMINOLOGY (mandatory):** Project, Board, Block, Cable, Snippet, Container, Portal, Scene.

---

## Log (newest first)

### 2026-04-01 (later) — plan closure pass

- **`docs/stitch-reference/`** added (`DESIGN.md`, `edit-mode.html`, `perform-mode.html`) for blueprint-aligned static layout QA.
- **Copy/paste:** `elementGraphCopyNodes` / `elementGraphPasteNodes` + host `graphCopyPasteboard`; Web **Cmd+C** / **Cmd+V**; duplicates via `DuplicateNodeMessage` (undo path matches legacy duplicate).
- **`WebContent::presentView`** documented as v1 no-op (floating plugin windows); inventory + LLM briefing updated (session file = File menu).
- **Docs:** `WEBVIEW_QA.md` blueprint audit table; `AGENTS.md` / `element-project.mdc` stitch-reference wording.

### 2026-04-01 — macOS DAW release plan implementation (agent session)

- **Docs:** `AI_HANDOVER` reframed as status log; `AGENTS.md` and `.cursor/rules/element-project.mdc` point at blueprint-first + this log. `docs/WEBVIEW_QA.md` extended (Logic AU ×3, Nuendo VST3, UI completion, signing notes).
- **WebView host:** `ELEMENT_WEBVIEW_DEV_URL` honored **only in debug builds**; release builds always use embedded `webview/dist`. Native bridge: `elementGraphRenameNode`, `elementGraphCommentAdd` / `elementGraphCommentUpsert` / `elementGraphCommentDelete`, `elementGraphDuplicateNodes`; comment boxes carry stable `id` in ValueTree; graph JSON includes `perform` stub for scenes; audio parameters JSON includes `index` for `elementSetNodeParameter`.
- **Web:** `nativeGraph*` wrappers; perform store hydrates from engine/session (no demo data when native feeds state); inspector shows real plugin parameters when available; comment frames on canvas with native sync; `ProjectOverview` uses live block/edge counts and engine hints.
- **Stability (spot check):** `PluginEditor` teardown path still clears `GuiService` content before hierarchy removal (VST3 safety). Broader engine/services audit remains ongoing; treat crash reports with repro as P0.
- **Follow-up (same day):** Web `InspectorHub` uses native parameter JSON + bypass; `QuickAccess` drops `demoPerform` for live graph + perform snapshot; `useKeyboard` wires comment add/delete, rename, and duplicate batch; `usePerformStore` adds `sessionName` / `sampleRateLabel`; `buildNodeParametersJson` brace cleanup in `element_webview_host.cpp`. `npx tsc -b` + `npm run build` under `webview/` verified green.

### 2026-03-30 (historical)

- Stability batch (30 fixes) and UX items landed in legacy JUCE graph paths; see git history for file list. Web parity work continued in `element_webview_host.cpp` / `webview/`.

---

## Operational notes

- **Build dirs:** Prefer `build-merged` (VS Code tasks). If not writable, use `build-bugfix` or another tree and sync `compile_commands.json`.
- **Hooks:** Cursor does not run Claude Code PostToolUse hooks — after `test/**` edits run `ctest --output-on-failure` from the build directory manually.
