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

### 2026-04-26 (late) — Audit + Phase A landed; Phase B queued

**Session:** ultraqa → deep-dive → autopilot Phase A
**Branch:** `local-enhancements` (HEAD `11158adc`)
**Build artifacts:** `installer/output/Element-2.2.0.16.{pkg,dmg}` (130 / 129 MB) — fully portable, ad-hoc signed.

**Commits this session (oldest first):**
1. `c6181785` chore(backend+infra): 9 new C++ nodes (Constant, Math, MIDI Channel Filter / Transpose / Velocity Amp, Pack/Unpack MIDI, Readout, Trigger), +532 lines bridge expansion in `element_webview_host.cpp`, untrack ~8.9k lines of installer/output build artifacts via .gitignore
2. `0f1772a1` feat(webview): Phase 5B + V3.0 UI parity — DashboardBuilder (673 LOC), CommandPalette (Cmd+K, 514 LOC), VirtualKeyboard (Shift+K), BusInspector, ConnectionEditor, SessionTree, SceneLauncher, BlockEmbed, Edge/Node context menus, StatusBar, full keyboard handler. 46 files, +5706/-530.
3. `5f6bf47b` fix(webview): bundle dist into Element.app/Contents/Resources/webview (POST_BUILD copy + runtime path resolution).
4. `11158adc` feat(phase-A): bundle WebView into all plugin formats + Lua sandbox tests. 7 plugin bundles (3 AU + 2 VST3 + 2 CLAP) now ship Resources/webview. New `LuaSandboxTests` (18 cases, all green). Reconciled prior "Lua RCE" finding as inaccurate — sandbox at `bindings.cpp:413-446` was already locked down.

**Audit + plan persisted at:** [`.omc/specs/unimplemented-features-audit.md`](.omc/specs/unimplemented-features-audit.md) — 5 P0s + 20 P1s + 25+ P2s with files / effort / acceptance criteria. **Treat as the source of truth for what's left to ship.**

**Phase A status (2 of 5 P0 done):**
- ✅ P0-1 Lua sandbox — verified + regression-tested
- ✅ P0-2 Plugin WebView bundling — all formats except LV2 (deferred; needs separate mechanism)
- ⏸ P0-3 Sandboxed plugin parameter forwarding (L) — `sandboxedprocessor.hpp:333` TODO; needs IPC protocol extension
- ⏸ P0-4 Remove `using namespace juce;` from `include/element/juce.hpp:24` — 23 direct includers + transitive blast radius; needs focused PR with clang-tidy auto-qualification
- ⏸ P0-5 Service-layer baseline tests — 7 files × ~5 cases each; pure scaffolding work, parallelizable

**Phase B (V3.0 contract completion — 20 P1 items, queued):**
Highest-leverage starts (per audit doc): P1-1 Dashboard layout *project-level* persistence (note: localStorage already works via persist middleware in `useDashboardStore.ts`; ValueTree round-trip is the actual gap), P1-6 Wireless bus CRUD, P1-14 Per-block comment field, P1-8 Session autosave. Bridge work concentrates in `src/ui/element_webview_host.cpp`.

**How to resume:** Re-invoke `/oh-my-claudecode:autopilot` with the audit spec path. Autopilot will skip Phase 0 (spec exists) and Phase 1 (plan is in the spec), starting at execution.

**Important reconciliations from this session (don't trust stale claims):**
- Dashboard Builder is **shipped**, not "not implemented" (gap matrix was stale)
- Portal node is **shipped** (gap matrix self-contradicted)
- Snap-to-grid is **implemented in Preferences**, exposure-only gap
- Lua sandbox is **already locked down** (Lane 2 audit was inaccurate; verified at `bindings.cpp:413-446`)
- Bridge function count: **68 C++ / 66 JS** (was 57/56), 1:1 match for wrapped, 2 intentionally unwrapped

### 2026-04-26 — Phase 5B: Wireless Patching (Named Buses)

- **Blueprint anchors**: §5/§7.2.8 (wireless badges replace drawn cables for named transmitter/receiver buses), §13 Phase 5 checklist item ✓.
- **New front-end store**: `webview/src/stores/useBusStore.ts` — `cableId → busName` map plus `deriveBuses()` helper. Visual source of truth; survives engine snapshot rebuilds because cable ids are stable across `hydrateFromEngine`.
- **New components**: `webview/src/components/canvas/EdgeContextMenu.tsx` (right-click cable → Make Wireless… / Rename Bus / Make Wired / Delete Cable, with autocomplete from existing buses), `webview/src/components/layout/BusInspector.tsx` (lists active buses with cable count + endpoint summary; mounted in Inspector empty state alongside ProjectOverview).
- **Edits**: `Cable.tsx` suppresses curve when wireless (faint dotted ghost only when selected — Unreal Blueprints reroute pin pattern); `Block.tsx` renders inline `BusBadge` next to ports with wireless connections (signal-type colour, 9px pill, antenna glyph); `GraphCanvas.tsx` wires `onEdgeContextMenu`; `useKeyboard.ts` adds `W` to toggle wireless on the selected cable (auto-names "Bus 1", "Bus 2", …).
- **Bridge**: New `nativeGraphSetCableBus(cableId, busName)` JS bridge + matching `elementGraphSetCableBus` C++ handler in `element_webview_host.cpp`. Persists to the matching Arc as a `busName` ValueTree property; snapshot builder surfaces it back so wireless state round-trips through session save/reload. Bus name is metadata only — engine routing is unchanged.
- **Type model**: `CableData.busName?: string` added to `webview/src/data/types.ts`. `useGraphStore.hydrateFromEngine` now reseeds `useBusStore` from snapshot busName fields atomically (prevents stale leakage).
- **Build**: TypeScript 0 errors, Vite production build clean (633 modules, 678 kB JS / 74 kB CSS, 433ms). C++ side compiled with the existing build tree on next reconfigure.
- **Gap matrix**: §7.2.8 ✗ → ✓ in `.omc/autopilot/gap-matrix.md`. §7.2.9 (cable delete via right-click) also flipped ~ → ✓ as a side effect.
- **Phase 5 progress**: 1/10 items closed (Wireless Patching). Remaining: Session Browser refresh, Manhattan routing, Reroute Pins, canvas virtualisation, cross-platform testing, startup-flash mitigation, ResourceProvider packaging, Quick-swap, Keyboard map.

### 2026-04-15 — Phase 1 + Phase 2A-alpha: WebView UI/UX Overhaul (multi-agent session)

- **Agent fleet**: 20+ invocations across Claude Opus 4.6, Claude Sonnet, Claude Haiku, OpenAI Codex (GPT-4.1), Gemini 2.5 Pro. 3 tmux CLI workers for parallel visual polish.
- **C++ bridge**: 7 new `withNativeFunction` handlers in `element_webview_host.cpp`: `elementTransportSetRecording`, `elementTransportSetTempo`, `elementHideAllPluginWindows`, `elementPerformDeleteScene`, `elementPerformRenameScene`, `elementVirtualKeyboardNoteOn`, `elementVirtualKeyboardNoteOff`. Scene delete edge case fixed (empty scene list sync). Total: 59 JS↔C++ bridge functions, 1:1 match, 0 dead calls.
- **New components**: `NodeContextMenu` (right-click block menu), `StatusBar` (device/engine/CPU/latency), `VirtualKeyboard` (2-octave piano, Shift+K), `SceneLauncher` (scene grid with delete/rename), `BlockEmbed` (embedded parameter strips, meters, spectrum), `events.ts` (shared DOM event constants), `nativeKeyboard.ts` (virtual keyboard bridge).
- **Major rewrites**: `CommandPalette` (5-category search), `QuickAddPopup` (category icons, format badges, favorites), `SnippetShelf` (wired to molecule data), `MacroDashboard` (Performance FX tab with bypass toggles, PanicButton wired).
- **Interactive controls**: `NeuKnob` and `NeuFader` now have drag interaction (were display-only). Spatial bookmarks (Ctrl+0-9 save, Shift+0-9 restore). Tab navigation follows signal chain order.
- **Semantic zoom**: Compact mode (<0.5x), standard (0.5-0.8x), expanded (>0.8x with BlockEmbed).
- **Port shapes**: SVG circles (audio), diamonds (MIDI), squares (CV) replacing border-radius hacks.
- **Design fixes**: Semantic tokens (bg-surface/bg-pressed/bg-elevated), text-[9px]→10px minimum, font-mono→tabular, div→button accessibility, neumorphic shadow pairs on context menu.
- **Build**: TypeScript 0 errors, Vite dist built, CMake 100% (app + VST3/AU/LV2/CLAP), 38/38 CTest passed.
- **Plans**: Phase 2 depth-first plan approved via 3-agent ralplan consensus (Planner→Architect→Critic) at `.omc/plans/phase2-depth-first-plan.md`.
- **Remaining**: Phase 2A-beta (parameter streaming channel), 2B (connection editor), 2C (inline scripting), 2D (perform mode completion). Dashboard Builder deferred to Phase 3.
- **App launch**: Scan-on-startup disabled in Element.conf (was blocking main thread). Window visibility enabled. App launches and shows WebView UI.

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
