# Out-of-Process Plugin Hosting — Phased Plan (2026-06-09)

**Goal:** Eliminate the ~20s full-UI freeze when loading heavy plugins (Glen bug #1: Kontakt 8 AU). This is ALSO Element's **CF1 crash-isolation ship-gate**.
**Branch:** `wave-3-leanfast-ux` · **Mode of this doc:** PLAN ONLY (no code edited).
**Owning agent on execute:** route to `executor` (model=opus for the engine/collision phases).

---

## The one architectural fact everything rests on

JUCE instantiates plugins on the **message thread** and there is **no in-process off-thread path**. Proven, not assumed:
- `PluginManager::createGraphNodeAsync` (`src/pluginmanager.cpp:1130`) calls JUCE `createPluginInstanceAsync`, whose body (`build-merged/_deps/juce-src/.../format/juce_AudioPluginFormat.cpp:93-105`) is just `postMessage` → `handleMessage` → the **synchronous** `createPluginInstance` **on the message thread**.
- For Kontakt (AUv2 and VST3) the heavy load runs **inline** on that thread (`juce_AudioUnitPluginFormatImpl.h:498-499,2576`; `juce_VST3PluginFormatImpl.h:3624-3652`). Both report `requiresUnblockedMessageThreadDuringCreation()==false` but the work is still inline.
- The format-private `createPluginInstance` is `private`/`friend AudioPluginFormatManager` only (`juce_AudioPluginFormat.h:164-174`; `juce_VST3PluginFormatHeadless.h:79-82`) — `PluginManager` **cannot** call it on a worker thread. The EXEC-ENGINE lane tried "Route A" (ThreadPool + `callAsync`) and reverted: no public API, and the JUCE source is FetchContent (regenerated on configure, untracked — patching it is fragile).

⇒ The **out-of-process sandbox child process** (`SandboxWorker` calls `createInstanceFromDescription` in a separate process, `src/engine/sandboxworker.hpp:498`) is the **ONLY** mechanism that keeps the host message thread free during a plugin's load. Phase 4.1's "async" only deferred the freeze by one message-loop tick; it did not move the load off-thread. This plan is therefore the real fix for #1.

---

## What is ALREADY BUILT vs NEW (be honest)

| Capability | Status | Evidence |
|---|---|---|
| Out-of-process audio path (lock-free shm + POSIX sem + JUCE pipes) | **BUILT, RT-proven for VST3** | `sandboxhost.hpp:523-610` processBlock; `sandboxworker.hpp:801-843` RT loop; D-9 stress 696/1000 recover, 0 host crashes |
| Crash isolation / restart (host survives worker SIGKILL) | **BUILT, proven** | `sandboxhost.hpp:690-733,1192-1274` (restart on msg-thread timer, never self-joins IPC thread) |
| Sandbox node non-blocking ctor (launch + async loadPlugin) | **BUILT** | `sandboxedprocessor.hpp:190-206`; `sandboxhost.hpp:933-991` |
| Honest port/channel/MIDI metadata from worker | **BUILT** | `sandboxedprocessor.hpp:358-417` (setupPorts from `PluginInfo`) |
| `shouldSandboxPlugin` tri-state policy | **BUILT, default 0/Disabled** | `settings.cpp:579-643` |
| Floating sandboxed-editor backend (real plugin GUI in worker's own window) | **BUILT** | `sandboxeditorwindow.cpp:42-99`; worker open `sandboxworker.hpp:948-989`; macOS policy `sandboxeditorwindow_mac.mm:29-57` |
| JS-bridge `elementOpenSandboxedEditor`/Close/Restart | **BUILT (C++)** | `element_webview_host.cpp:1516-1591` |
| Helper bundled into Element.app | **BUILT (install nest)** | `installer/build_pkg.sh:67-100`; discovery `sandboxhost.hpp:856-919` |
| --- NEW WORK BELOW THIS LINE --- | | |
| Sandbox reachable for live UI adds (collision fix) | **NEW** | collision at `graphmanager.cpp:524` vs `:359` |
| Helper code-signing (hardened-runtime safe) | **NEW** | `sign-all-macos.sh` has zero Helpers step |
| React caller for `elementOpenSandboxedEditor` (open/close/focus lifecycle) | **NEW** | zero callers in `webview/src` (grep) |
| Activation policy decision + UI | **NEW (DECISION)** | see P4 |
| AU load-hang (R2) resolution | **NEW (sibling agent) — GATE** | `settings.cpp:581-589` |
| CV-through-sandbox | **KNOWN GAP, deferred** | `processBlock` is audio+midi only (`sandboxhost.hpp:152`) |

---

## CRITICAL PATH

```
P0 (AU hang fix, sibling agent) ── GATE ──┐
                                          ▼
P2 (sign+bundle helper) ──► P1 (collision fix, reachable+placeholder) ──► P3 (floating editor wiring) ──► P5 (verification / CF1 ship-gate)
                                          ▲
P4 (activation policy DECISION by Glen) ──┘  (decision needed before P1 default flips; P1 can land behind mode=2 without it)
```

- **P0 blocks P5's "Kontakt" assertion absolutely** (Kontakt is AU; without the hang fix, sandboxing Kontakt hangs the worker and — per the 2026-05-08 evidence — possibly the host). P1/P2/P3 can be BUILT and verified against a **VST3** plugin (e.g. Serum/Vital) while P0 is in flight, then re-verified against Kontakt-AU once P0 lands.
- **P2 is a hard prerequisite for ANY shipped build** — an unsigned helper will not launch under hardened runtime / on another Mac. P2 can proceed in parallel with P1 (disjoint files).
- **P4 (policy) is a Glen decision.** P1 can land the mechanism behind the existing `mode=2` (AU-only, opt-in) without P4; flipping a default ON requires P4.

---

## P0 (GATE) — Resolve the AU load-hang (R2)

**Owner:** sibling agent (assumed in flight). This plan treats it as a dependency.
**Files (likely):** `src/engine/sandboxworker.hpp` (the worker's `createInstanceFromDescription` at `:498` and its message-thread init), possibly `src/engine/sandboxeditorwindow_mac.mm` (activation policy), `src/settings.cpp:581-589` (the doc note + default once proven).
**Approach (for context only — not this plan's work):** Re-reproduce the 2026-05-08 BRASS_4Horns / Kontakt-AU hang against the **dedicated-helper** build (the hang predates the distinct `net.kushview.Element.sandbox` helper binary). Determine whether the hang is (a) the worker's own message thread blocking during AU `initialise()` — acceptable, it's a child process, host stays free — or (b) something that propagates back to the HOST message thread (the reported symptom). If (b), find the synchronous host-side wait. Candidate: a `waitForResponse` somewhere on the load path that the worker can't satisfy while its own message thread is blocked in AU init. NB: the node ctor is already non-blocking (`sandboxedprocessor.hpp:196-205` launches + fires async `loadPlugin`, no `waitForResponse`), so the host-side block, if any, is elsewhere (prepare/state/port-sync round-trips).
**RT/stability risk:** This is the riskiest phase — an AU that hangs the worker's message thread can stall editor-open and port-sync IPC; ensure all host→worker round-trips on the load path have bounded `sem_timedwait`/timeouts and degrade to "loading…" not a host freeze.
**Verify:** `cli-anything-element --json app launch --fresh`; drive an add of a real heavy AU (Kontakt 8) with `mode=2`; assert via timer-tick logging that host `timerCallback` (`element_webview_host.cpp:5892`) keeps firing at ~60Hz throughout the load; `verify assert --alive --no-crash`.
**Effort:** **M–L** (diagnosis-dependent; could be a small bounded-timeout fix or a deeper IPC reorder).
**⛔ Everything below is BLOCKED on P0 for the Kontakt/AU case. VST3 verification can proceed without it.**

---

## P1 — Make the sandbox reachable for live UI adds (resolve the Phase-4 collision)

**THE core fix.** Today a live-added external plugin can NEVER be sandboxed even with `mode=1/2`, because `GraphManager::addNode(desc,...)` short-circuits to `addExternalPluginAsync` (in-process) at `graphmanager.cpp:524` **before** `createFilter` (where `shouldSandboxPlugin` lives at `:359`) is ever reached.

**Files to touch:**
- `src/engine/graphmanager.cpp` — the gate at `:524`, `addExternalPluginAsync` (`:605-692`), `swapInLoadedProcessor` (`:694+`), and `createFilter` (`:340-402`).
- `src/pluginmanager.cpp` — `createGraphNodeAsync` (`:1130`) and `createSandboxedGraphNode` (the sandbox node factory the gate at `:362` calls).
- (read-only deps) `src/nodes/sandboxedprocessor.hpp`, `src/settings.cpp:601-643`.

**Approach (preserve the Phase-4 placeholder/loading-face/uuid-preserving swap exactly):**
1. At the top of `addNode(desc,...)` (`graphmanager.cpp:504`), compute `const bool sandbox = Settings().shouldSandboxPlugin(*desc);` **before** the format gate at `:524`.
2. Keep the placeholder/loading path (`addExternalPluginAsync`) as the single entry for ALL external plugins (sandboxed or not) — it already stamps the FINAL uuid + `tags::loading` + 0 ports + grid position synchronously (instant, message thread). Do NOT route sandbox through `createFilter` (that path is synchronous-construct + no loading placeholder = wrong UX, and `createFilter` is for session-LOAD which has its own flow).
3. Inside `addExternalPluginAsync`, branch the **instantiation kick** (step 2 of that function, `:672-689`): if `sandbox`, call a NEW async wrapper around `createSandboxedGraphNode` instead of `createGraphNodeAsync`. Critically — `SandboxedProcessorNode`'s ctor is ALREADY non-blocking (`sandboxedprocessor.hpp:196`): it launches the worker + fires async `loadPlugin` and returns immediately. So the "instantiation" of a sandboxed node is already off-thread by construction. The wrapper can construct the node synchronously (cheap — just a process launch, no plugin load) and either (a) swap it in immediately as the real processor with ports filling in when `PluginInfo` arrives via the existing `onSandboxEvent`/`refreshPorts` path, or (b) keep the placeholder until the worker reports loaded, then swap. **Recommend (b)** to preserve the identical loading→ready visual: register a one-shot listener for the sandbox "loaded"/PluginInfo event, then call the EXISTING `swapInLoadedProcessor(finalUuid, nodeId, sandboxNode, descCopy)` — reusing the proven lock-free op-republish + uuid-preserving model update verbatim (`graphmanager.cpp:725-768`).
4. Fallback: if `createSandboxedGraphNode` fails (worker won't launch — e.g. P2 not done / unsigned), fall back to the in-process `createGraphNodeAsync` AND emit the existing `SandboxEvent::FellBackInProcess` honesty badge (the mechanism already exists at `graphmanager.cpp:396-399` / `createFilter`; replicate it on the async path so the user learns they are unprotected).
5. Leave the synchronous `createFilter` sandbox gate (`:357-372`) UNTOUCHED — it correctly still fires sandbox on **session LOAD** (`graphmanager.cpp:424,916`).

**RT / stability risks:**
- **Op-republish must stay on the message thread.** The swap (`removeNode`→`addNode`→`buildRenderingSequence`→`activeRenderingOps.exchange(acq_rel)`) is RT-correct ONLY on the message thread. The sandbox "loaded" event arrives on the IPC/message-thread timer — marshal the swap via `MessageManager::callAsync` exactly like the in-process callback (`graphmanager.cpp:678`). Reuse the `WeakReference<GraphManager>` + uuid re-lookup guard verbatim — handles delete/undo-while-loading and session-reload (`graphmanager.cpp:676,686,700-702`).
- **Port-count change after swap.** A sandboxed node's ports fill in from `PluginInfo` asynchronously (`setupPorts` `sandboxedprocessor.hpp:371`). The placeholder has 0 ports; the real node may briefly have 0 until `PluginInfo` lands, then `refreshPorts`. Ensure `swapInLoadedProcessor`'s `resetPorts()`/`applyAddedNodeProcessorSetup` is re-run (or a second `changed()` fires) when `PluginInfo` arrives so cables become attachable. This is the one genuinely new sequencing wrinkle — the in-process swap had final ports immediately, the sandbox swap does not.
- **Double-launch / leak:** ensure exactly one worker per node; the `ProcessorPtr` adopt-immediately pattern (`graphmanager.cpp:684`) covers GraphManager-gone; verify the `SandboxedProcessorNode` dtor (`sandboxedprocessor.hpp:181-188`) `shutdown()`s the worker if the node is dropped before the swap completes.
- **No audio-thread alloc/lock added** — all model/engine mutation stays on the message thread; the audio thread only ever `load(acquire)`s the op array.

**How to verify:**
- New ctest in `test/engine/AsyncPluginLoadTest.cpp`: with a stub `shouldSandboxPlugin==true` and the in-tree `TestEchoPluginFormat` (sandbox test format, `EL_SANDBOX_INCLUDE_TEST_FORMATS`), assert a live add (a) produces a loading placeholder with the final uuid + 0 ports, (b) swaps to a `SandboxedProcessorNode` preserving the uuid (no Block re-key), (c) falls back in-process + emits `FellBackInProcess` when the worker launch is forced to fail.
- Existing `AsyncPluginLoadTests` (5) + `GraphNodeRenderSafety` must stay green.
- Live: `mode=2` + add a VST3 (no P0 dependency); confirm loading face → ready, uuid stable, cables attach after ready.

**Effort:** **M** (mechanism is built; this is rewiring the gate + one new async branch + the PluginInfo-port-refresh sequencing, all reusing proven code).

---

## P2 — Sign + bundle the `element_sandbox_host` helper (hardened-runtime safe)

The helper is bundled but **`codesign -dv` → "not signed at all"**. An unsigned nested helper will be killed by Gatekeeper / hardened runtime on any Mac but Glen's dev box, and refuses to launch under a notarized parent. `sign-all-macos.sh` has **zero** Helpers step.

**Files to touch:**
- `scripts/sign-all-macos.sh` — add a step to sign the nested helper.
- `scripts/codesign-macos.sh` — currently uses `--deep` (Apple-deprecated; signs inside-out incorrectly for nested bundles). The helper must be signed **before** the outer Element.app, and the app re-signed after, with the helper signed as its own bundle.
- `cmake/entitlements.plist` — verify the child needs the same entitlements (JIT + disable-library-validation are already present and ARE needed: the worker JITs and loads arbitrary third-party plugin dylibs). Consider a SEPARATE entitlements file for the helper if it should NOT carry `device.audio-input` (it processes via shm, not the mic — least-privilege).
- `installer/build_pkg.sh:67-100` — already nests the helper; add a sign+verify of the nested helper after the copy (belt-and-suspenders) OR rely on `sign-all-macos.sh` running first against the build tree.

**Approach:**
1. Sign **innermost-first**: sign the helper bundle (`Element Sandbox Host.app`) with hardened runtime + entitlements as a standalone bundle, THEN sign Element.app (which now contains the signed helper). Avoid `--deep` — sign each nested bundle explicitly (Apple's guidance; `--deep` is unreliable and deprecated). Add the helper find+sign to `sign-all-macos.sh` (mirror the existing `find … -name "Element.app"` block but for `Contents/Helpers/Element Sandbox Host.app`, signed BEFORE the parent app).
2. Re-order `sign-all-macos.sh` so the helper is signed first, the app last (so the app's seal covers the already-signed helper).
3. Notarization: the helper is inside the app, so it notarizes with the app (`installer/notarize-macos.sh`); no separate submission needed, but the app's notarization REQUIRES every nested executable be signed with hardened runtime first.
4. Verify `spctl --assess` + `codesign --verify --deep --strict` on the final app pass with the helper inside.

**RT/stability risk:** None to the audio/RT path. Risk is purely "won't launch on a clean machine" — which is exactly the current state and the reason this is a hard ship prerequisite.

**How to verify:** `codesign -dv "…/Element.app/Contents/Helpers/Element Sandbox Host.app"` shows a valid signature + hardened runtime; `codesign --verify --deep --strict --verbose=2 Element.app` passes; on a clean/second Mac (or after `xattr -dr com.apple.quarantine`), launch Element, add a sandboxed plugin, confirm the worker launches (check `~/Library/Element/log/` or `EL_SANDBOX_PROBE=1`).

**Effort:** **S–M** (script work + sign-order correctness; the deprecated `--deep` is the one real trap).

---

## P3 — Wire the floating sandboxed-editor (v1)

The editor backend is REAL (the worker shows the plugin's actual `AudioProcessorEditor` in its own `DocumentWindow`) and the C++ bridge fns exist, but **no React code calls `elementOpenSandboxedEditor`**. Today double-clicking a sandboxed Block routes to `nativePluginEditorOpen`→`elementPluginEditorOpen` (in-process) which a sandboxed node does not implement → no editor. v1 accepts a **floating OS window** (embedded/CALayerHost was abandoned — "The WALL", `sandboxeditorwindow.hpp:11-21`).

**Files to touch (React/TS):**
- `webview/src/bridge/nativePluginEditor.ts` — add `nativeSandboxedEditorOpen/Close` thin wrappers over `invokeElementNative("elementOpenSandboxedEditor", [uuid, x, y])` / Close, mirroring the existing `elementRestartSandbox` wrapper in `useSandboxCrashStore.ts:105`.
- `webview/src/components/canvas/GraphCanvas.tsx` (`onNodeDoubleClick`, the toggle decision the editor-open test mirrors at `nativePluginEditor.test.ts:172`) AND `webview/src/components/layout/InspectorHub.tsx:1841` (the Inspector "open editor" button) — branch on whether the block is sandboxed: if sandboxed, call the sandboxed-editor open; else the existing in-process `nativePluginEditorOpen`.
- A way for React to KNOW a block is sandboxed: add an `isSandboxed` (or `editorKind: "docked"|"floating"`) field to the block snapshot. Source it in the host snapshot builder (`element_webview_host.cpp`, the `buildActiveGraphJson`/loadState area near `:6628`) by checking `dynamic_cast<SandboxedProcessorNode*>`. (NEW snapshot field — small.)
- `webview/src/stores/useSandboxCrashStore.ts` already consumes `onSandboxEvent`; reuse it for editor-open failure feedback.

**Files (C++) — mostly already done:** `elementOpenSandboxedEditor` (`element_webview_host.cpp:1544-1566`) and `SandboxedProcessorNode::openEditor` (`sandboxedprocessor.hpp:254-258`) are complete. The only C++ addition is the `isSandboxed` snapshot field.

**Approach:** Snapshot exposes `isSandboxed`. React's double-click + Inspector-open branch on it. For a sandboxed block, call `elementOpenSandboxedEditor(uuid, screenX, screenY)`; the worker promotes its activation policy to Accessory and shows the real GUI in a floating window. Close on second double-click / Block close button via `elementCloseSandboxedEditor`. Accept that this window is NOT docked/embedded in the canvas (regression vs the Phase-4 docked draggable editor — call it out to Glen; it's the v1 tradeoff, embedding is a separate L–XL).

**RT / stability risks:**
- **macOS activation-policy SIGKILL** (the worst historical failure): the worker MUST stay `Prohibited` and only promote to `Accessory` (never `Regular`) on editor open — already handled (`sandboxeditorwindow_mac.mm:29-57`) via the distinct bundle id. Do NOT regress this; verify the helper is the dedicated binary, not a host re-exec (`sandboxhost.hpp:956-967` already refuses host re-exec in production).
- **Editor open while loading:** guard the React open so it's a no-op while `loadState==="loading"` (the in-process path already guards this, `GraphCanvas.tsx` around the double-click; mirror it).
- **Worker crash with editor open:** the existing crash → restart path (`sandboxhost.hpp:690-733`) must close/reopen the floating window cleanly; verify no dangling window after a worker SIGKILL with the editor open (this is a P5 CF1 assertion).
- No audio-thread involvement.

**How to verify:** vitest for the new bridge wrappers + the double-click branch decision (extend `nativePluginEditor.test.ts`). Live: add a sandboxed VST3 with a GUI, double-click → real plugin editor appears in a floating window; close; SIGKILL the worker with the editor open → host survives, badge appears, window closes. Storybook: a sandboxed Block variant showing the "open editor" affordance.

**Effort:** **M** (backend done; this is the React wiring + one snapshot field + lifecycle/guards).

---

## P4 — Activation policy (DECISION FOR GLEN)

**When does a plugin go out-of-process?** The mechanism (`shouldSandboxPlugin`, `settings.cpp:601-643`) supports: `0` Disabled (default today), `1` All external, `2` AU-only. Trade-offs:

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A. Default-ON for all 3rd-party (mode=1)** | Every heavy plugin loads without freeze; uniform crash isolation; simplest mental model | IPC adds ~1 buffer latency to EVERY plugin (`sandboxedprocessor.hpp:307`); floating-editor UX regression for ALL plugins (no docked editor); CV gap hits everyone (see below); higher process count | Too aggressive for v1 |
| **B. Default-ON for AU-only (mode=2)** | AU is the documented worst offender (crashes + the Kontakt hang class); Kontakt is AU so this fixes #1; VST3/CLAP keep the nice docked in-process editor + zero IPC latency | Heavy VST3 instruments (e.g. Omnisphere VST3) still freeze; "why is this one floating and that one docked?" inconsistency | **RECOMMENDED v1 default** — but ONLY after P0 (the AU hang) lands, since mode=2 routes AU through the sandbox |
| **C. Per-plugin user toggle** (right-click Block → "Run in sandbox") | User control; opt-in for known-flaky plugins; no global UX regression | Requires UI + per-node persisted flag (new ValueTree prop + a per-plugin override in `shouldSandboxPlugin`); discoverability | **RECOMMENDED as the long-term primary**, layered on top of B |
| **D. Auto by format/size/type** (e.g. sandbox instruments, or plugins whose binary > N MB, or a curated heavy-list) | "Just works" without user thought | Heuristic is guess-y; "instrument vs effect" isn't always known pre-load; size is a poor proxy | A nice-to-have on top of B/C, not v1 |

**Recommended path:** Ship **B (AU-only default-ON)** as the v1 default once P0 lands, PLUS **C (per-plugin toggle)** so a user can sandbox a specific flaky/heavy VST3 or un-sandbox an AU they trust. Keep `0/Disabled` available as a global escape hatch. This fixes Kontakt (AU) immediately, preserves the loved docked editor for the common VST3 case, and gives power-users control.

**Glen must decide:**
1. **Default mode** — Disabled / AU-only / All? (recommend AU-only)
2. **Per-plugin toggle** — build it now (C) or later?
3. **Editor UX** — is a **floating** window acceptable for sandboxed plugins as v1, knowing it's a regression from the docked draggable editor? (embedding = separate L–XL "The WALL" R&D)
4. **CV** — accept that sandboxed plugins do NOT pass CV/Value signals in v1 (see gap below)? Most instruments/effects don't need CV; modulators do.
5. **Latency** — accept the +1 buffer IPC latency on sandboxed plugins (`sandboxedprocessor.hpp:307`)?

**Effort:** Decision only. Implementing C (per-plugin toggle) if chosen = **S–M** (new persisted node prop + read it in `shouldSandboxPlugin` + a right-click menu item).

---

## P5 — Verification (the CF1 ship-gate)

**Blocked on P0–P3.** This is both the bug-#1 acceptance and the CF1 crash-isolation ship-gate.

**Acceptance assertions (Kontakt, after P0):**
1. **No UI freeze:** add Kontakt 8 (AU) live → host `timerCallback` (`element_webview_host.cpp:5892`) keeps firing at ~60Hz throughout the ~20s load (instrument temporary timestamp logging: a >1s gap with no tick = FAIL). Canvas remains draggable; other Blocks animate.
2. **Loading face animates** for the full load (the placeholder renders instantly because the message thread is free).
3. **Block goes ready** with HONEST ports from `PluginInfo` (instrument = 0 audio in; cables attach after ready). uuid unchanged (no Block re-key).
4. **Floating editor shows** the real Kontakt GUI (double-click; P3).
5. **CF1 — host survives a worker crash:** SIGKILL the worker mid-session (`kill -9` the helper pid) → host stays alive, crash badge appears, `elementRestartSandbox` recovers, state restored (`sandboxhost.hpp:1192-1274`). Run the D-9-style stress (`reliability-real-plugin-crash` evidence pattern).

**Tooling:**
- `cli-anything-element --json app launch --fresh`; drive adds; `verify assert --alive --no-crash` (2/2 after several heavy adds).
- ctest: `AsyncPluginLoad` (must stay green + new sandbox-route cases from P1), `GraphNodeRenderSafety`, `SandboxIPC`, the crash-isolation harness.
- **Glen feel-test is mandatory** (autonomous visual QA has been tooling-blocked all of Wave-3): add Kontakt, watch for continuous repaint, draggable canvas during load, floating editor, kill-worker recovery.

**Known gap to note in verification (NOT fixed here): CV-through-sandbox.**
`SandboxHost::processBlock` is `(AudioSampleBuffer&, MidiBuffer&)` only (`sandboxhost.hpp:152`); `SandboxedProcessorNode::render` passes only `context.audio` + `context.midi` to it (`sandboxedprocessor.hpp:316-328`) — **`context.cv` is never marshalled across the process boundary** (grep: zero CV references in the entire sandbox stack). A sandboxed plugin therefore cannot send/receive Value/CV signals. Impact: most instruments/audio-effects are unaffected (they don't use CV ports), but a sandboxed plugin in a modulation chain (LFO→param via CV) silently drops CV. **Document as a known limitation;** if Glen needs CV-through-sandbox, it's a follow-up: extend `SharedAudioBuffer`/`processBlock` + the IPC header to carry CV channels (M–L, mirrors the audio path). Add a disabled-by-default gate test asserting the gap so it's tracked.

**Effort:** **M** (verification + harness; gated on P0–P3).

---

## Consolidated decisions Glen must make
1. **Activation default** — Disabled / **AU-only (recommended)** / All. (P4)
2. **Per-plugin sandbox toggle** — build now or later? (P4 option C)
3. **Floating editor acceptable for v1?** (embedded = separate L–XL "The WALL"). (P3/P4)
4. **CV-through-sandbox** — accept as a known gap for v1? (P5)
5. **+1 buffer IPC latency** on sandboxed plugins acceptable? (P4)

## Effort summary
- P0 AU-hang: **M–L** (GATE, sibling agent)
- P1 collision fix: **M**
- P2 sign+bundle helper: **S–M**
- P3 floating editor wiring: **M**
- P4 policy: decision (impl of toggle **S–M** if chosen)
- P5 verification: **M**

---

## DECISIONS LOCKED (Glen, 2026-06-09)
- **Activation policy (P4): ALL third-party plugins out-of-process by default.** Not AU-only — Glen chose the most robust / fully crash-proof option (matches the full-Bitwig-reliability scope). Set `shouldSandboxPlugin` default to sandbox every external VST/AU/CLAP; internal/IO nodes stay in-process. (A per-plugin opt-out toggle is a nice-to-have, not required for v1.)
- **v1 trade-offs ACCEPTED:** (a) sandboxed plugin GUI shows in its **own floating window** (the built `sandboxeditorwindow`), NOT docked-in-canvas — embedded/CALReplaying "The WALL" is a separate L–XL effort; (b) **CV/Value signals are NOT marshalled** to sandboxed plugins yet (`processBlock` is audio+MIDI only — `sandboxhost.hpp:152`); (c) **+1 buffer IPC latency** on sandboxed plugins.

## P0 STATUS — DONE (code), verified, NOT yet committed (2026-06-09)
- **Implemented:** worker plugin LOAD + TEARDOWN now run on the worker's MESSAGE thread (`handleLoadPlugin` → `createPluginInstanceAsync`; `releasePluginOnMessageThread()` helper via `callSync` at the 4 teardown sites). Root cause + fix: `.omc/state/qa-wave-reports/ultraqa-INV-au-hang.md` + `ultraqa-FIX-au-hang.md`. Files: `src/engine/sandboxworker.hpp` (+ `test/engine/SandboxRealProcessTest.cpp` new `RealProcessLoadFailureReports`).
- **Verified:** C++ build 0-err; **independent opus RT-verifier APPROVE-FOR-SHIP** (`ultraqa-RT-VERDICT-p0.md`) — callSync can't deadlock (inline on MT; off-MT callers hold no MessageManagerLock, `callbacksOnMessageThread=false`), teardown order preserved, IPC thread freed (heartbeats flow), host/wire/SIGKILL-survival untouched, audio-thread clean. Sandbox regression suite (`SandboxRealProcess|IPC|Protocol|OrderedShutdown`, serial) running at write time.
- **Non-blocking follow-up (P0.1):** AUv3-only UAF window — the `LoadOutOfProcess` completion block chains to a raw-`this` lambda with no in-flight guard. Add `std::atomic<bool> loadInFlight` + shutdown guard. Not a regression (AUv3 hard-deadlocked before); untestable in CI (AUv3 hangs headless).

## NEXT (fresh focused run — recommend /ralph or /team with this plan as input)
Critical path: **P0 (done) → P1 ∥ P2 → P3 → P5**.
1. **P1** make sandbox reachable for live UI adds — `graphmanager.cpp:524` async gate short-circuits BEFORE `shouldSandboxPlugin` (`:359`); route external adds through the sandbox while preserving the Phase-4 placeholder/loading-face/uuid swap. (M, the core rewire — highest risk, verify live.)
2. **P2** sign + bundle `element_sandbox_host` (no Helpers step in `sign-all-macos.sh`; `--deep` is a trap → sign innermost-first).
3. **P3** add the React caller for `elementOpenSandboxedEditor` + an `isSandboxed` snapshot field → branch the editor-open to the floating sandbox window.
4. **P4** flip `shouldSandboxPlugin` default to ALL third-party.
5. **P5** verify: add Kontakt live → loads out-of-process, UI never freezes (60Hz repaint continues, loading face animates), block goes ready, floating editor shows, host survives a worker crash (CF1). Live = Glen feel-test (AU can't be CI-tested headlessly).
**Verification needs GUI** — computer-use works again this session; route around the "Typeless" overlay (left ~430px) via canvas/QuickAdd.


---

## STATUS 2026-06-10 — MODE=1 FUNCTIONAL LIVE; DEFAULT FLIPPED TO 1

The two "NEXT" blockers were **misdiagnoses**. Live debugging (real crash reports re-enabled) found and fixed four real defects:

1. **"Helper doesn't launch" — FALSE.** The helper launches from `Contents/Helpers` and loads AUs out-of-process fine (signing irrelevant on the x86_64 dev box; unsigned runs). The live-add "fallback" had two *actual* causes:
   - `SandboxedProcessorNode::wantsContext()` returned **false** → `ProcessBufferOp::perform` deref'd its cached **null** `getAudioPluginInstance()` on the **audio thread** → SIGSEGV on first render of any sandboxed node. Fixed: `wantsContext()==true` (node renders via `render(RenderContext&)`). Regression test: `AsyncPluginLoadTests/sandboxed_node_must_render_via_context_api`.
   - That crash was INVISIBLE (no .ips) because `PluginScannerWorker`'s **ctor** installed the empty `pluginScannerCrashHandler` and the HOST constructs that class on every boot to probe scanner mode (`Application::maybeLaunchScannerWorker`) — JUCE's handler then does `kill(getpid(), SIGKILL)` → every host crash for months looked like a silent vanish. Fixed: handler+logger install moved to `handleConnectionMade()` (confirmed-scanner only).
2. **"Session-load hang" — actually the same silent crash**, plus once fixed, a **permanent xrun storm**: the host's private `expectedWorkerSequence` raced ahead during the worker's load/attach window and the absolute `>=` done-check never healed → every block timed out (silence) + `Logger::writeToLog` per block ON THE AUDIO THREAD. Fixed: per-block expectation derived from the shm header's `workerSequence + 1` (self-healing, one extra RT-safe acquire load) + xrun log only on `==` threshold crossing.
3. **Restart loop**: `attemptRestart()`'s own `killWorkerProcess()` fired JUCE `connectionLost` → re-flagged `restartRequested` → the next tick killed the **healthy replacement** worker, forever (~1 Hz; leaked a shm/sem generation per cycle). Fixed: `tearingDownWorker` guard around deliberate teardown.
4. **Recovery shm re-create race**: the `PluginLoaded` recovery branch published `pluginLoaded/Active` BEFORE `prepareToPlay()` re-created the shm → audio thread resumed `readOutputAudio` into a dying mapping → EXC_BAD_ACCESS (real .ips captured). Fixed: state-restore + prepare now run BEFORE the flags flip.

**Verified live (build-merged, Intel mac, Fireface 802 running):** empty-board Cmd+K add of a pizmidi AU → worker spawns, block ready, NO "unprotected" badge; `Default.els` (2 pizmidi AUs) session-load → both load out-of-process, app responsive, **0 xrun lines settled**; `kill -9` worker (both fresh-add and session-loaded w/ state restore) → exactly ONE "restart 1/3", recovered worker stable, host alive; second kill → same. ctest **13/13** (Sandbox*, AsyncPluginLoad incl. new regression case, GraphNodeRenderSafety, InternalNodeNaming, GroupNodes, PortDefaults, CVFlow, helpers). `AsyncPluginLoadTest` fixture now pins the sandbox policy per-test (conf-independent).

**P4 DONE:** `Settings::defaultPluginSandboxMode = 1` (all third-party out-of-process — Glen's locked decision). Glen's `Element.conf` explicit `pluginSandboxMode` key REMOVED so the new default governs (Preferences → Plugins → Sandbox Mode remains the escape hatch).

**Still open (follow-ups, not gates):** P3 floating-editor React wiring (double-click a sandboxed block currently opens an empty host-side window; the worker's real-GUI window path is built but unwired); worker idle poll duty ~9%/worker CPU (50 µs `sem_trywait` loop — consider blocking wait); P0.2 worker quit NSException ('Periodic events are already being generated') — cosmetic; Kontakt-scale feel-test owed (pizmidi only proves the mechanism; Kontakt is the #1 acceptance, needs Glen/GUI); CV-through-sandbox still a known gap; helper signing still required for SHIPPING (any non-dev Mac / notarization) — scripts updated (P2) but re-run + verify at install/packaging time.

## STATUS 2026-06-10 PM — GLEN FEEL-TEST FAILED → P0 ASYNC-LAUNCH WAVE (Option A) IMPLEMENTED

Glen's feel-test of mode=1: Kontakt live-add FROZE the UI (the #1 acceptance failed), all
adds "very very slow", "Node" naming back, blocks overlap, sandboxed editor blank/wrong-size.
Ralplan consensus (Planner→Architect→Critic, 2 iterations, both APPROVE) produced the wave plan
at ~/.claude/plans/you-are-continuing-from-dreamy-volcano-agent-aa84fd0eb224e7bc4.md.

Root cause of the freeze (Architect-verified): the ONE blocking primitive is the
`connectToPipe` handshake inside `SandboxHost::launch()` (juce_ConnectedChildProcess.cpp:228
via sandboxhost.hpp:1028) running on the message thread inside the SandboxedProcessorNode
ctor at `kickSandboxedInstantiation`. `loadPlugin` was ALREADY a non-blocking pipe send.

P0 shipped in working tree (commit pending):
- T1: deferred-launch ctor + handshake on a GraphManager-scoped 1-thread ThreadPool;
  watcher observes atomic LaunchPhase; fast-fallback moved into watcher; `forceSlowWorkerLaunch`
  seam + SandboxAsyncInstantiationTest (<50ms return-to-loop assertion). RT-VERIFIER: APPROVE
  (.omc/state/qa-wave-reports/p0-async-sandbox-RT-VERDICT-2026-06-10.md).
- T2: session-load path routes sandboxed nodes through installSessionLoadingPlaceholder →
  same machinery (boot never blocks; saved port topology preserved so cables survive).
- T3: webview-host loading-name emission never shows "Node" (cleaned tags::name short-circuit).
- T4: webview swap-aware de-overlap keyed on loadState loading→ready (count-gated passes were
  blind to in-place placeholder→real swaps).
- T5: worker editor window ComponentListener async resize (AU late-resize), 400×300 dropped.
- T6: presentPluginWindow routes sandboxed nodes to the worker editor (no empty host window);
  snapshot isSandboxed self-corrects via the dirty-gated graph push on swap.
- Bonus: DeviceService::add no longer pops a modal under the test runner (pre-existing
  headless ctest hang); stale WantsContextReturnsFalse test fixed to assert the true contract.

Gates: build 0-err · vitest 3126/0 · tsc clean · full ctest green except 4 classified
(2 pre-existing: DeviceService modal hang [now fixed], stale wantsContext test [fixed];
terminology-guard allowlisted sentinel-detection; SandboxStressTests timeout under
classification — isolated rerun in flight). New suites green: SandboxAsyncInstantiation,
migrated AsyncPluginLoad.

P1-P3 lanes launched in parallel (ultrawork): T9 idle-CPU hot/cold semaphore (done, pending
central build), T16 container-add undo via GroupNodesAction (done), T21 block presets C++,
W1 canvas lane (T10/T12/T13/T14/T15), W2 cables/snippets (T11/T20/T21W), D1 design variations
(T17/T18). T7 warm pool held until T9 verified + RT pass.

EXPECTATION (tell Glen at feel-test): P0 = NO FREEZE while heavy plugins load.
NOT instant adds — that's P1-T7. Kontakt still takes its ~20s; the app stays usable.
