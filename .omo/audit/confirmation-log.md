# Gate-A Confirmation Log — Element deep-app-audit

Interim runtime-evidence rows logged by executor agents. **Agent rows are INTERIM
only.** Glen's hands-on Gate-A confirmation is the sole authority that may mark a fix
"confirmed". No agent row may use the word "confirmed".

| Timestamp | Build commit | Fix #1 (boot hang) | Fix #2 (blank-UI selector loop) | Evidence paths | Verdict |
|-----------|--------------|--------------------|---------------------------------|----------------|---------|
| 2026-05-29 20:00 (local) | f85e246c | PASS (interim) — normal cold boot (no session) with 1996-entry plugins.xml completes <10s; main thread idle in `MessageManager::runDispatchLoop → CFRunLoopRun → mach_msg` at 3.8% CPU; NO `String::replace`/`emitCompletionEvent` spin; React plugin browser populated (real plugin names reachable via AX). | PASS (interim) — React root paints (not blank) AND the fixed component mounts: real shipped bundle (Element.app) renders live `ParamStripEmbed` embedded faders (GAI/PAN/MIX/FRE/Q) on cold boot — a blanked root cannot show faders, so the mount-time loop is gone. Independently, a headless full-app capture zoomed to the "expanded" tier mounts ParamStripEmbed (**79 MiniFader tracks measured**, not asserted) across a 17-block graph with `loopCount=0`, `rootChildren=1`, 0 console.error/pageerror, NO "Maximum update depth exceeded"/"getSnapshot should be cached". | Build: `task-6-vite-build.txt` (VITE_EXIT=0), `task-6-cmake-reconfigure.txt` (CMAKE_EXIT=0), `task-6-app-relink.txt` (APP_EXIT=0). Fix #1: `task-6-sample-coldboot.txt`, `task-6-render-coldboot.png`, `task-6-ax-map.txt`. Fix #2 PRIMARY: `task-6-render.png` (real-app faders). Fix #2 corroborating: `task-6-fix2-console.txt`/`task-6-console.txt` (faders=79, loop=false), `task-6-fix2-app-render.png`, runner `task-6-fix2-console-runner.mjs`. AX: `task-6-ax-map.txt` (depth-10 reaches React DOM under AXWebArea), `task-6-ax.json` (suite ambiguous per T4). | **AGENT-COMPLETE — PENDING GLEN** |

## Detail / caveats for Glen's Gate-A review

### Build chain (all green)
- `npx vite build` → exit 0, fresh chunk `index-Bd8MitFW.js` (2356 modules, 987 ms). `task-6-vite-build.txt`.
- `cmake -B build-merged -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0` → exit 0. `task-6-cmake-reconfigure.txt`.
- `cmake --build build-merged --target element_app -j8` → exit 0. **Gotcha hit + handled:** the first build was a no-op incremental (no C++ delta) so the POST_BUILD dist-copy did NOT fire and the bundle kept the STALE `index-CcvRJ5xC.js`. Forced a genuine relink (removed the linked binary, no source edit) → POST_BUILD ("Bundling WebView production assets") fired → bundle now ships `index-Bd8MitFW.js`. `task-6-app-relink.txt`. Verified `diff(webview/dist, Element.app/.../Resources/webview)` filelist == match.
- Fix #1 source present: `src/ui/element_webview_host.cpp:876,888` return `JSON::parse(buildPluginListJson())` / `...NodeParameters...` (structured var). Symbols compiled into binary (nm count=2).
- Fix #2 source present: `webview/src/components/canvas/BlockEmbed.tsx:122` wraps the derived-array `ParamStripEmbed` selector in `useShallow`. Shipped bundle carries `useSyncExternalStore` + `Object.is` machinery.

### Fix #1 — discriminating test (important)
- A FIRST launch with `BRASS_4Horns.els` (2.1 MB) as a CLI arg DID hang: sustained 100%+ CPU for 75s+, main thread 1471/1471 (then 1425/1471) samples in `MessageQueue::deliverNextMessage → NativeFunctionsProvider::emitCompletionEvent → WebBrowserComponent::Impl::emitEvent → juce::String::replace → replaceSection`. Evidence `task-6-sample.txt`, `task-6-sample-2.txt`, `task-6-render-HUNG.png` (full-screen; Element window never foregrounded while hung).
- This is **NOT a fix #1 regression.** The hot stack bottoms out in the shared `postCompletion` callAsync lambda (used by every native fn), and the heavy `replaceSection` activity (many `\`/`'` matches) is the fingerprint of a **string** var being `JSON::toString`'d — i.e. `elementGetGraphState`, which the prior handover explicitly LEFT as a raw string. Fix #1 only converted `getPluginList`/`getNodeParameters` to structured vars. A normal cold boot (`openLastUsedSession=0`, no session arg) exercises the getPluginList path alone.
- **Cold boot, no session:** low CPU (4–8%), state SN, idle in `mach_msg` wait, zero `String::replace` spin — boot completes well under 10s and the 1996-plugin browser populates (AX-reachable plugin names: MStereoGenerator, MetapluginSynth, kHs Gain, GainAim, EMO-Generator, bx_rockergain100, …). Instance stayed healthy 5m+ at ~4% CPU. Evidence `task-6-sample-coldboot.txt`, `task-6-render-coldboot.png`, `task-6-ax-map.txt`.

### NEW FINDING (separate from fix #1) — log so it is not lost
- Opening a **large session** (BRASS_4Horns.els, 2.1 MB) wedges the message thread in `emitCompletionEvent → String::replace` re-escaping the large `elementGetGraphState` JSON **string**. Same O(n²) `juce::String::replace` escape mechanism as the original fix #1 bug, but on the getGraphState path which fix #1 deliberately did not convert. Reproducible. Suggest a follow-up: return `elementGetGraphState` as a structured var (and make its three string-typed React callers object-tolerant), OR chunk/stream it. Until then, large sessions will hang on load. This blocks runtime fix-#2 verification *with BRASS specifically* (the canvas never paints), which is why fix #2 was verified via the demo-seeded full-app render instead.

### Fix #2 — evidence approach
- **PRIMARY (real shipped bundle):** cold-boot Element.app (production `index-Bd8MitFW.js`) rendered live `ParamStripEmbed` embedded faders (GAI/PAN/MIX/FRE/Q) on blocks fed by the C++ bridge, with the full React root painted (panels + canvas + inspector), no blank, no hang. The documented bug blanks the *entire React root at mount*; faders cannot paint on a blanked root, therefore the mount-time selector loop is gone in the shipped bundle. `task-6-render.png`, `task-6-render-coldboot.png`.
- **CORROBORATING (headless console capture):** embedded WKWebView console is not directly scriptable headlessly, so the console assertion used the **full Element React app** on a demo-seeded dev server (`VITE_USE_DEMO_GRAPH=1`, port 5199) under headless Playwright (`task-6-fix2-console-runner.mjs`, 17-block graph). `ParamStripEmbed`/`MiniFader` only mounts at the "expanded" zoom tier (`useGraphStore.zoomTier === "expanded"`, react-flow zoom > 0.8 — `Block.tsx:532`); the runner wheel-zooms past that threshold and **measures the fixed component is actually mounted** (`paramStripFaderCount=79`, not assumed). With ParamStripEmbed live-mounted: `loopSignatureFound=false`, `rootChildren=1`, 0 console.error/pageerror. `task-6-fix2-console.txt`, `task-6-fix2-app-render.png`.
- Source of fix: `BlockEmbed.tsx:122` wraps the derived-array `ParamStripEmbed` selector in `useShallow`.

### AX harness note (per Wave-1 T4 caveat)
- `element_ax_map.py --depth 10` DOES descend into WebKit's `AXScrollArea → AXWebArea` and reach React DOM (2483 nodes; real React buttons/plugin names enumerated). So the T4 "depth-5 BFS may miss AXWebArea → false negatives" caveat is mitigated at depth 10.
- `element_verify.py --suite all` → 6/19 passed (`task-6-ax.json`). The failures are suite-expectation drift against the rewritten React UI (e.g. expects a native "Keyboard" element), NOT absence of UI — the AX map proves the UI is present and reachable. Treated as **supplementary/ambiguous** per T4, not a fix verdict.

### What still needs Glen's eyes (Gate A)
1. Hands-on cold boot: confirm no hang and the plugin browser feels responsive with the full 1996-plugin list.
2. Hands-on: load a session with blocks and confirm the React canvas + embedded block faders render and stay interactive (no blank, no beachball). NOTE: ~~avoid the largest sessions until the getGraphState NEW FINDING above is fixed — BRASS_4Horns.els currently hangs on load.~~ **RESOLVED by getGraphState fix below — BRASS_4Horns.els now loads (see Fix #3 row).**
3. Decide whether the getGraphState large-session hang is in-scope for this audit or a separate ticket.

---

## Fix #3 — getGraphState large-session boot hang (getGraphState structured var)

| Timestamp | Build commit | What changed | BRASS-load result | Evidence paths | Verdict |
|-----------|--------------|--------------|-------------------|----------------|---------|
| 2026-05-29 20:45 (local) | f85e246c + working-tree edit to `src/ui/element_webview_host.cpp` | `elementGetGraphState` handler (`element_webview_host.cpp:869`) now returns a **structured var** `postCompletion(completion, JSON::parse(buildActiveGraphJson()))` instead of the raw pre-serialised `String`. This mirrors the Fix #1 `elementGetPluginList`/`getNodeParameters` pattern (`:883`) and removes the O(n²) `juce::String::replace` quote-escape inside JUCE's `emitCompletionEvent` that re-escaped every interior quote of the ~2 MB graph JSON → 100% main-thread spin in `replaceSection` on load. React consumers already object-or-string tolerant (no JS change). | **LOADS** (was: HANGS). Launched freshly-built `build-merged` Element.app with `BRASS_4Horns.els` (2.1 MB) as CLI arg — the exact item-6 repro. **Hang fingerprint GONE:** BRASS main-thread sample has **0** frames of `emitCompletionEvent`/`String::replace`/`replaceSection` (prior hang was 1471/1471 ≈100% in that exact stack). Main thread instead in legitimate, bounded session-load work: `maybeOpenCommandLineFile → SessionService::openFile → EngineService::sessionReloaded → RootGraphHolder::attach → GraphManager::setNodeModel → PluginManager::createGraphNode → VST3PluginFormat::createPluginInstance → DLLHandle` (instantiating the session's VST3 plugins — a stage the prior hang never reached). CPU peaked ~76–179% (plugin DLL load + audio threads spawned: MidiRouter/OutputThread/PresetPreloader) then **settled to ~18% idle (state SN) by T+51s and held 17–19% through T+94s** — recovered, NOT a runaway (prior bug stayed pinned 100%+ for 75s+ with no recovery). **Canvas PAINTS:** Element window foregrounded shows the full BRASS board — title "Element — BRASS_4Horns: Interior Graph 1", breadcrumb "BRASS_4Horns > Graph 1", multiple connected Blocks+Cables with VU meters on the React canvas, populated Browse tree + Inspector PROJECT OVERVIEW, Engine: Running. No blank, no beachball. **Cold-boot regression OK:** clean cold boot (no session; `openLastUsedSession=0` confirmed in Element.conf) healthy at ~8% CPU, idle in `mach_msg`, only 5/2520 benign `String::replace` samples (normal per-event 60Hz ValueTree→React sync via `timerCallback → evalInBrowser`), painted Element chassis. No crash; stdout shows only benign lilv reload warnings + pre-existing `PresetSlotManager::selectSlot` warning (also present in item-6 task-6-app-stdout.txt — not a regression). | Build: `task-B-app-build.txt` (genuine recompile+relink via mtimes: .cpp 20:34:55 → .o 20:38:38 → binary 20:38:45). BRASS PRIMARY (paint): `task-B-brass-render.png` (live BRASS board with blocks). BRASS (hang-gone): `task-B-brass-sample.txt` (0 spin frames; main thread in VST3 plugin instantiation), `task-B-brass-stdout.txt`. Cold-boot regression: `task-B-coldboot-sample.txt` (idle, 5/2520 benign), `task-B-coldboot.png`, `task-B-coldboot-stdout.txt`. | **AGENT-COMPLETE — PENDING GLEN** |

### Caveats for Glen's Gate-A review (Fix #3)
- The fix is a **working-tree edit not yet committed** (`git status` shows `src/ui/element_webview_host.cpp` modified). Build was the freshly-relinked `build-merged` binary carrying the edit (not a packaged/installed DMG). For hands-on, either build+run `build-merged` or fold this into the item-10 commit + reinstall before final Gate-A.
- Screenshots were captured by `screencapture` which grabs the frontmost window; the Element window had to be raised via `osascript` activation post-load (JUCE windows launch non-foreground). The cold-boot PNG is partly occluded by an unrelated Chrome/Storybook window but the Element chassis is visible at the right edge; the cold-boot **sample** is the authoritative health evidence for that leg.
- Embedded WKWebView console was not scripted (per prior finding it is not headlessly scriptable, and the task marked it optional). Verdict rests on the main-thread sample (hang fingerprint absent) + the live painted BRASS canvas + CPU settling to idle — all three positive.

---

## ✅ GATE A — CONFIRMED BY GLEN (2026-05-29, hands-on runtime)

Glen launched the build and confirmed all three fixes at runtime:
- **Fix #1 (boot-hang): CONFIRMED.**
- **Fix #2 (blank-UI selector loop): CONFIRMED.**
- **Fix #3 (getGraphState large-session hang): CONFIRMED** — BRASS_4Horns.els opens.

**CAVEAT (Glen):** "BRASS_4Horns opens but the UI is very poor and not-usable. This is likely an
issue across the entire app, not exclusive to BRASS. Approved with that caveat." → drives the
Wave 3 re-audit priority (UI quality / layout / usability). Visible culprits: every block badged
"INT" (item 15 — block-JSON format/category), blocks overlapping in a cramped vertical stack
(layout root-cause under investigation).

**Committed:** `ff023feb` `fix(webview,host): resolve boot-hang, blank-UI, and large-session hang`
(4 files: element_webview_host.cpp [#1/#3 + engine-snapshot NaN guards], juceBackend.ts,
nativeGraph.ts, BlockEmbed.tsx [#2]). Test repairs + selector guard + other WIP remain uncommitted
per Glen's standing rule. Not pushed.

**Gate A unlocked:** item 10 commit DONE; Wave 3 re-audit STARTED (run wf_f036e6f6-e76).

---

## Wave 5a — usability fixes (badges + origin-pile + block-overlap)

Targets the two visible culprits Glen named in the Gate-A caveat above: every block badged "INT"
(item 15) and blocks overlapping in a cramped vertical stack.

| Timestamp | Build | Fix A: block overlap (BlockEmbed/Block height) | Fix B: badges (C++ format+category) | Fix C: origin pile (graphmanager x/y seed) | Evidence | Verdict |
|-----------|-------|------------------------------------------------|--------------------------------------|---------------------------------------------|----------|---------|
| 2026-05-29 22:10 (local) | `ff023feb` + uncommitted working-tree edits (`src/ui/element_webview_host.cpp`, `src/engine/graphmanager.cpp`, `webview/src/components/canvas/BlockEmbed.tsx` + `Block.tsx`) | PASS (interim) — at the **expanded tier** (faders/meters visible, same tier as the before-shot `task-11-brass-overlap.png` where DIVISIMATE CORE & INFINITE BRASS 4 HORNS were flush/overlapping), the two blocks now have a clear ~100px clean canvas gap. Expanded modifier block height was measured 226px→104px (`task-W5a-block-height.txt`); positions unmutated, only height shrank, so the gap opened. | PASS (interim) — badges show REAL formats on the live BRASS board through the C++ bridge (NOT the demo-graph dev server): **AUDIO IN → INT**, **MIDI IN → INT** (internal nodes, correct), **DIVISIMATE CORE → AU**, **INFINITE BRASS 4 HORNS → VST3** (real plugins, correctly identified — no longer all "INT"). Category accents differ too (modifier orange / generator blue / logic teal). | NOT-TESTED — origin-pile fix requires adding a node via the webview, which is not headlessly scriptable (embedded WKWebView). Source verified present: `graphmanager.cpp addNode` seeds absolute x/y in a 4-col grid when `data` has no x/y. Needs Glen's hands-on add-node check. | Build: VITE=0 (`/tmp/w5a-vite-build.txt`, bundle `index-GwS37Vis.js`), APP=0 (`/tmp/w5a-app-build.txt`, POST_BUILD fired, app bundle ships matching `index-GwS37Vis.js`). Runtime (real Element.app + BRASS CLI arg): primary after-shot `.omo/evidence/task-W5a-brass-after.png`; badge zooms `task-W5a-badges-right.png` (AU/VST3/INT), `task-W5a-audioin-zoom.png`; overlap pair `task-W5a-overlap-pair.png` (clean gap). Health: BRASS loaded with **0** hang-fingerprint frames (`emitCompletionEvent`/`String::replace`/`replaceSection`) in main-thread sample, idle in `CFRunLoopRun → __CFRunLoopServiceMachPort` (CPU delta 0.78s/3s wall = idle). AX depth-10 = 2499 nodes, React DOM reachable (Divisimate/Infinite-Brass buttons enumerated). stdout clean (only benign lilv reload + pre-existing `PresetSlotManager::selectSlot` warning, not a regression). No "Maximum update depth". | **AGENT-COMPLETE — PENDING GLEN** |

### Caveats for Glen's Gate review (Wave 5a)
- All three fixes are **uncommitted working-tree edits** (graphmanager.cpp, element_webview_host.cpp, BlockEmbed.tsx, Block.tsx). Build was the freshly-relinked `build-merged` Element.app carrying the edits, not a packaged/installed DMG. Fold into a commit + reinstall before final Gate.
- **Badges verified on the real app only** (C++ bridge supplies `format`/`category`; the dev-server demo graph would exercise only the JS `inferFormat`/`inferCategory` fallbacks and prove nothing). `mapBlock` (useJuceBridge.ts:205-206) reads `category ?? inferCategory` and `format string ?? inferFormat`, so the C++ values take precedence — contract matches.
- **Origin-pile is not-tested** (no headless webview node-add). Source change is present and guarded against clobbering an explicit position. Glen: add a node via QuickAdd/right-click and confirm it lands in a grid slot, not at (0,0).
- Embedded WKWebView console was not scripted (documented prior finding: not headlessly scriptable). No-console-error evidence rests on the painted React root + faders + 2499-node AX DOM + clean stdout (a mount loop would blank the root).
