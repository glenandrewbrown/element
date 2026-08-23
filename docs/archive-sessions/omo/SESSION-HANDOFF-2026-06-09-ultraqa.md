# SESSION HANDOFF — 2026-06-09 UltraQA wave (Glen's Wave-3 feel-test bugs)

**Branch:** `wave-3-leanfast-ux` (NOT committed — working tree has the fixes). **Installed:** `~/Applications/Element.app` marker **`index-DiqEInGz.js`** (app only; plugins NOT re-installed yet). Build-tree app running pid 85271.

## What Glen reported (after testing the 2026-06-08 install) → status

| # | Bug | Status | Verified |
|---|-----|--------|----------|
| 1 | Kontakt load ~20s (want <2s) | **NOT FIXABLE in-process — ARCHITECTURAL** | confirmed in vendored JUCE source |
| 2a | Modules spawn on top of each other | **FIXED** | LIVE (CU) |
| 2b | Some modules unnamed / "(unnamed)" / "n" | **FIXED** | LIVE (CU) |
| 2c | Kontakt editor = giant "1000 buttons" squished | **FIXED (code)** | RT-verify + test; needs Glen Kontakt feel-test |
| 2d | Default name "node" → should be plugin name | **FIXED** | LIVE (CU): "Supercharger"/"eVerb" on add |
| 3a | Multi-select right-click → no group option | **FIXED (code)** | vitest; rich menu confirmed LIVE for single node; needs marquee-select feel-test |
| 3b | Auto-connect on Tab conflicts w/ Tab=cycle | **FIXED (code)** — auto-connect moved Tab→**Enter** | vitest |
| 4a | Left (browser) panel "not redesigned" | **DESIGN REQUEST (not a bug)** — needs Glen direction | — |
| 4b | Right (Inspector) panel won't expand | **FIXED** | LIVE (CU): expands, real data |
| 4c | Snippets do nothing / Cmd-drag broken | **FIXED (code)** — `window.prompt()` returns null in JUCE WKWebView → swapped to in-app NeuPromptModal + added drop handler | vitest |
| 5 | Old native JUCE transport (top) + footer (bottom) | **FIXED** | LIVE (CU): both gone, webview fills window |
| 6 | Plugin-editor drag-header says "Node", gap, wrong width | **FIXED (code)** — same as 2c (handle = real editor width, flush, real name) | RT-verify + test; needs Kontakt feel-test |

**Score: 10 of 12 fixed.** #1 = architectural decision; #4a = design direction.

## Why #1 (perf) is architectural, not a quick fix (PROVEN)
- JUCE's `AudioPluginFormat::createInstanceFromDescription` (vendored `juce_audio_processors_headless/format/juce_AudioPluginFormat.cpp:71-76`) routes the heavy `createPluginInstance` to the **message thread** (postMessage + `finishedSignal.wait()`), even when called from a background thread. The heavy method is format-private (friend-only). So **Route A (background-thread instantiation) is impossible** without patching vendored JUCE (regenerated on configure → not viable/safe).
- Kontakt 8 is AUv2/VST3 → instantiation runs inline on the message thread = the ~20s freeze. The 20s is Kontakt's own sample-load (intrinsic); the bug is it runs on the UI thread → whole app frozen, loading face can't animate.
- **Route B (out-of-process sandbox)** is the only mechanism that frees the host thread, BUT (inv-sandbox-editor): the out-of-process editor is a **detached floating window** (CALayerHost embed abandoned — "The WALL"), **not wired to the UI** (zero React callers), helper **unsigned**, Phase-4 async gate makes `shouldSandboxPlugin` **unreachable for live UI adds**, and the **AU load-hang (R2)** is unresolved (Kontakt = AU). Effort: audio-only default-ON = **M**; sandbox WITH a real embedded editor = **L–XL** (multi-session).
- Reports: `.omc/state/qa-wave-reports/ultraqa-INV-perf.md`, `ultraqa-FIX-engine.md`, `ultraqa-INV-sandbox-editor.md`.

## Gates
- C++ build **0 errors** (BUILD_OK); webview build OK (marker `index-DiqEInGz.js`).
- **vitest 3096 passed** (1 fail = `fuzzyScore.perf` ratio guard, flaky under concurrent CPU → **passes isolated**, memory-documented).
- ctest: AsyncPluginLoad **5/5 + 2 new naming tests**, GraphNodeRenderSafety, GroupNodes, PortDefaults, InternalNodeNaming, CVFlow + regressions pass. **2 "failures" both NON-regressions:** `SandboxOrderedShutdown` **passes isolated** (848s; `-j4` parallelism flake), `SessionAutosaveRecovery` = **pre-existing** crash in a 3rd-party **pizmidi AU** (`midiForceToRange.component`) parsing its own state during `openDefaultSession` from Glen's machine-local `Default.els` — NOT Element code, NOT this wave (`sessionservice.cpp` untouched), env-only, LOW. See `ultraqa-INV-autosave-crash.md`.
- **Independent opus RT-verifier: APPROVE-FOR-SHIP, 7/7** (`ultraqa-RT-VERDICT.md`) — editor ComponentListener lifecycle (detach before every reset incl. dtor), re-entrancy guard, CF1 teardown order, naming-swap message-thread-only/uuid-preserved, chrome no-null-deref.
- **LIVE (computer-use, which WORKS again this session):** #5 chrome gone, #2b/#2d naming, #2a no-overlap, #4b panel expands w/ real data, loading→ready transition works (Supercharger went ready w/ real ports after slow NI init), real editors/params everywhere, **0 crashes** through add/delete/add/editor.

## Files changed (working tree, NOT committed)
`src/engine/graphmanager.cpp` (naming swap + stamp guards), `src/ui/element_webview_host.cpp` + `include/element/ui/element_webview_host.hpp` (getDisplayName snapshot, editor real-size reporting `onEmbeddedEditorReady(uuid,w,h)`+`onEmbeddedEditorResize`, empty-rename guard, molecule currentBoard), `src/ui/pluginwindow.cpp/.hpp` (docked mode → real editor size), `src/ui/web_content.cpp` (hide native toolbar+statusbar), `src/pluginmanager.cpp` (comment only), `test/engine/AsyncPluginLoadTest.cpp` (+2 naming tests), webview: `GraphCanvas.tsx`, `EditorDragHandle.tsx`, `NodeContextMenu.tsx`, `GhostEdge.tsx`, `useAppStore.ts`, `useJuceBridge.ts`, `bridge/nativeGraph.ts`, `SnippetShelf.tsx`, `CommandPalette.tsx`, `CanvasContextMenu.tsx` + 3 test files. (Ignore the unrelated graphify-out/.swarm/*.db churn — tooling artifacts, do NOT commit.)

## Open observations for Glen
- **Editors auto-open (floating native window) when a plugin is added/selected.** Floating windows show the correct name + real params. Glen's reported "Node header + gap" was the **docked** overlay (EditorDragHandle) — fixed in code but I couldn't trigger docked mode cleanly live (a "Typeless" app's invisible window covered the screen's left ~430px + auto-editors cluttered state). **Needs his feel-test with Kontakt.** Also worth deciding: should adding a plugin auto-open its editor at all?
- **2 decisions owed:** (#1) how to approach Kontakt load (accept-architectural / invest out-of-process / lighter mitigation); (#4a) left-panel redesign direction.
- **NOT committed** — awaiting Glen's go (+ his feel-test).

## Reproduce/verify
`cd agent-harness && .venv/bin/cli-anything-element --json app launch --fresh` (launches build-tree app == installed) → drive via computer-use (works again; AX unblocked via `pip install pyobjc-framework-Cocoa pyobjc-framework-ApplicationServices` into the harness venv).
