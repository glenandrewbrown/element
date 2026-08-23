# Element Deep Code Review — Bug Class Taxonomy

**Date:** 2026-05-08
**HEAD:** `f653b167`
**Reviewer:** team-review autonomous agent
**Methodology:** Systematic-debugging Phase 1 — pattern-grep across the entire React webview + C++ bridge surface. Bug INSTANCES enumerated per CLASS, with cross-cutting fix proposals.

---

## Executive summary

10 bug classes investigated, **133 total instances enumerated** across the webview/bridge surface. The dominant root cause is **the engine snapshot subscription pattern** — the existing UI was built against the assumption that *all* live state arrives through `usePerformStore.liveHealth`, which silently degrades when the snapshot omits a field. The pattern landed for `cpu`/`isPlaying`/`isRunning` (via `useEngineSnapshotStore` polling, the C-2 hoist, and the engineRunning rebind), but the same fix has **not** propagated to other live values: per-block CPU, per-block latency, time-signature, MIDI activity, transport timecode, I/O VU meters, embedded plugin VU meters, and per-cable meter visualisation in `Cable.tsx`.

**Top 5 classes by instance count:**
1. **Class 10 — Test coverage gaps:** 36 production files have zero `*.test.*` companion (only 5 of ~41 are tested).
2. **Class 1 — Faked/hallucinated data:** 17 instances (mapBlock cpuLoad/latencyMs hardcoded `0`; LiveHealth I/O meters hardcoded `[20,60,45,10]`/`[80,55,70,5]`; MacroDashboard VuMeter `level={75}`/`level={72}`; BlockEmbed MeterEmbed defaults `0.62`/`0.58`; QuickAddPopup demoPlugins fallback at line 137; Toolbar `4/4` time-sig at line 257; Toolbar "Engine: Live" badge at line 540; PreferencesModal recentFiles read; element_webview_host.cpp recentFiles publish; etc.).
3. **Class 8 — Silent failure / empty catches:** 16 instances (15 in nativeGraph.ts + nativeSession.ts; 2 in useJuceBridge.ts; 2 in nativeEngineSnapshot.ts).
4. **Class 5 — Read-only display without subscription:** 14 instances (StatusBar timecode placeholder; Toolbar `4/4`; MacroDashboard VU & "Engine: Live"; LiveHealth I/O meter bars; BlockEmbed defaults; per-block CPU/latency in Block.tsx; PreferencesModal device pickers).
5. **Class 7 — AX opacity for icon-only buttons:** 13 instances (Toolbar Undo/Redo/Rewind/Play/Stop/Record/Settings/Power partially mitigated by `title=`/`aria-label=` on the button; SnippetShelf, ToolPalette icon-buttons; MacroDashboard "More options"; ConnectionEditor X-button; DashboardBuilder pencil/plus/trash/x).

Bug classes 2 and 4 are now empirically near-zero (Toolbar's onClick fixes landed in commits `350407fc`, `b106a3ed`, and `04e1fe14`; the C-2 engine-block hoist landed in `f653b167`). Class 6 has the D-1 retry-poll fix but a structural issue remains (no C++ → JS push channel, only client-side polling). Class 3 has only one canonical instance (scene state) — the rest are myth.

The cross-cutting bridge round-trip audit shows **7 C++ Identifiers registered but never called from JS** (3 wireless-bus fns, the duplicate-with-rewire fn, two connection-source/target fns, and the spurious `userNote` token from the regex). The reverse direction is clean: every `invokeElementNative()` call resolves to a registered C++ Identifier.

---

## Class 1 — Faked / hallucinated data when bridge unavailable

**Pattern signature:** variable assigned via fabrication formula, hardcoded array, or default-prop instead of from a real source.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 1.1 | `webview/src/hooks/useJuceBridge.ts:202-203` | `mapBlock` hardcodes `cpuLoad: 0, latencyMs: 0` for **every** block — affects all downstream block-level CPU/latency reads | **P0** |
| 1.2 | `webview/src/components/canvas/QuickAddPopup.tsx:22-27, 137` | `const demoPlugins: PluginEntry[] = [...]; if (nativePlugins.length === 0) return demoPlugins` — same V-1 pattern that ToolPalette had (since fixed); QuickAddPopup still leaks 4 fake demo plugins. **DIRECT REGRESSION-RISK SIBLING** of the F-101 fix in ToolPalette | **P0** |
| 1.3 | `webview/src/components/layout/LiveHealth.tsx:70` | `<MeterBars heights={[20, 60, 45, 10]} color="#4A90D9" />` — hardcoded INPUT meter ramp, not subscribed to anything | **P0** |
| 1.4 | `webview/src/components/layout/LiveHealth.tsx:76` | `<MeterBars heights={[80, 55, 70, 5]} color="#2BC4C4" />` — hardcoded OUTPUT meter | **P0** |
| 1.5 | `webview/src/components/layout/MacroDashboard.tsx:155-156` | `<VuMeter level={75} /> <VuMeter level={72} />` — hardcoded master VU pair in Perform mode dashboard | P1 |
| 1.6 | `webview/src/components/canvas/BlockEmbed.tsx:201-205` | `MeterEmbed` defaults `leftLevel = 0.62, rightLevel = 0.58, leftPeak = 0.78, rightPeak = 0.74` — inserted into every embedded Block during expanded zoom | P1 |
| 1.7 | `webview/src/components/canvas/BlockEmbed.tsx:328` | Logic-block branch passes hardcoded `leftLevel={0.3} rightLevel={0.28} leftPeak={0.45} rightPeak={0.42}` | P1 |
| 1.8 | `webview/src/components/canvas/BlockEmbed.tsx:230-294` | `SpectrumEmbed` static bezier path — labelled "placeholder" in source — every modifier block in expanded zoom shows the same EQ curve | P2 |
| 1.9 | `webview/src/components/canvas/Block.tsx:215-238` | `MiniWaveform` — every generator renders the same `[8,12,16,12,8]` bar pattern | P2 |
| 1.10 | `webview/src/components/layout/Toolbar.tsx:257` | `<span>4/4</span>` — hardcoded Perform-mode time signature, not from session data | P1 |
| 1.11 | `webview/src/components/layout/Toolbar.tsx:537-541` | `<span>Engine: Live</span>` with `bg-logic animate-pulse` dot — hardcoded Perform-mode engine badge, NOT subscribed to `engineRunning` | P1 |
| 1.12 | `webview/src/components/layout/Toolbar.tsx:258` | `<span>LIVE</span>` — hardcoded Perform-mode label in transport row | P2 |
| 1.13 | `webview/src/stores/useGraphStore.ts:30-34` | Demo seed gated on `VITE_USE_DEMO_GRAPH=1` env var — correct pattern, BUT depends on env flag never reaching prod (verify in Vite production-mode chunking) | P3 |
| 1.14 | `webview/src/data/demoGraph.ts:723` | 720+ lines of demo blocks/cables/comments — only 750 KB of dead bundle text in the prod build unless tree-shaken (Vite chunk-split landed in `20ebf871`; verify exclusion) | P3 |
| 1.15 | `webview/src/components/layout/InspectorHub.tsx:230` | `BlockMetrics` row "CPU (est.)" reads `block.cpuLoad.toFixed(1)%` — sourced from `mapBlock.cpuLoad: 0` (1.1), so always renders `0.0%` | P0 (downstream of 1.1) |
| 1.16 | `webview/src/components/layout/InspectorHub.tsx:233` | `BlockMetrics` row "Latency" reads `block.latencyMs > 0 ? ...` — same root, always `—` | P1 (downstream of 1.1) |
| 1.17 | `webview/src/components/canvas/Block.tsx:495-511` | Per-block latency + CPU readouts gated on `> 0`, so they're **invisible** because of 1.1 — looks like the design says "hide when zero" but the user can never see them populate | P1 |

**Fix proposal:** Land per-block CPU + latency in `buildActiveGraphJson` at the engine block level (each Block in the graph already knows its `Processor*` — `processor->getTotalLatency()` and a host-CPU split per node). Pipe through `mapBlock` and remove the `cpuLoad: 0, latencyMs: 0` placeholders. Land per-cable RMS into `Cable.tsx` stroke-width (the data is already in `useCableMeterStore` from `onCableLevels`). Fix QuickAddPopup F-101 sibling.

---

## Class 2 — No-op onClick / placeholder buttons

**Pattern signature:** `<button>` rendered without `onClick`, or with `onClick={() => {}}`.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 2.1 | `webview/src/components/layout/MacroDashboard.tsx:100-103` | `<button className="text-text-secondary" aria-label="More options"><Icon name="MoreVertical" .../></button>` — **no onClick**; the dot-dot-dot kebab menu is dead | P1 |
| 2.2 | `webview/src/components/layout/Toolbar.tsx:308` | Play/Pause button delegates to `nativeTransportTogglePlay` — wired ✓ | WORKS |
| 2.3 | `webview/src/components/layout/Toolbar.tsx:317` | Stop — wired in commit `350407fc` ✓ | WORKS |
| 2.4 | `webview/src/components/layout/Toolbar.tsx:299` | Rewind — wired in commit `350407fc` ✓ | WORKS |
| 2.5 | `webview/src/components/layout/Toolbar.tsx:327` | Record — wired in commit `04e1fe14` (F-204) ✓ | WORKS |
| 2.6 | `webview/src/components/layout/Toolbar.tsx:277` | Undo — wired in commit `b106a3ed` (D-2c) ✓ | WORKS |
| 2.7 | `webview/src/components/layout/Toolbar.tsx:286` | Redo — wired in commit `b106a3ed` (D-2c) ✓ | WORKS |
| 2.8 | `webview/src/components/layout/Toolbar.tsx:386` | TAP — wired in commit `04e1fe14` (F-104) ✓ | WORKS |
| 2.9 | `webview/src/components/layout/AppShell.tsx:103` | Sidebar Cmd+1/2/3 panel-toggle button — wired ✓ | WORKS |
| 2.10 | `webview/src/components/layout/SnippetShelf.tsx:35` | Snippet-row click shows `<button>` with no onClick (insertion not implemented) — confirmed by master list M-31 | P2 |
| 2.11 | `webview/src/components/canvas/QuickAddPopup.tsx:98` | PluginRow button — wired to `onSelect` ✓ | WORKS |

The Class 2 cluster is now **largely closed**. One remaining hole: MacroDashboard "More options" kebab. The dead-button bug class is the most-fixed cluster of the entire audit.

---

## Class 3 — Dual / divergent state systems

**Pattern signature:** same conceptual state managed by two stores or paths.

### Instances

| # | Location | Description | Severity |
|---|----------|-------------|----------|
| 3.1 | `useAppStore.activeScene` ↔ `usePerformStore.scenes[].active` | Toolbar prev/next call `useAppStore.setScene` (UI-only); `usePerformStore.activateScene` calls the bridge. `applySnapshot` writes BOTH (`useAppStore.setState({ activeScene })` + `usePerformStore.scenes`). The sync is one-way; user mutations of `useAppStore.setScene` never reach the bridge. **THIS IS V-2 / F-201 — CONFIRMED OPEN** | **P0** |
| 3.2 | `usePerformStore.liveHealth.cpu` ↔ `useEngineSnapshotStore.cpuPercent` | Two stores hold engine CPU. `applySnapshot` writes to perform-store; `useEngineSnapshotStore` polls separately at 4 Hz and overwrites `liveHealth.cpu`. The race is benign (always-equal in steady state) but is a divergence smell. After C-1+C-2 landed, the snapshot path also writes CPU, so we have **two writers to the same field** | P2 |
| 3.3 | `usePerformStore.liveHealth.clock` ↔ `useEngineSnapshotStore.deviceName` | Same shape: device name written by both stores. `StatusBar.tsx:15` uses `health.clock`; `InspectorHub.ProjectOverview` uses `useEngineSnapshotStore.deviceName`. Not a bug today (both equal) but a refactor risk | P3 |
| 3.4 | `usePluginBrowserStore.recentIdentifiers` (server) ↔ `usePluginBrowserStore.recentIdentifiers` (parsed from snapshot) | Recent-plugin list comes through `elementGetPluginList`. Used by `ToolPalette` and `CommandPalette`. Not divergent today, but no test asserts the round-trip | P3 |

Glen's prior dismiss of the scene-state divergence was about the *display label*; the divergence is real for the *bridge call*. Confirmed by reading Toolbar lines 452-477: `setScene` is the local mutator, never `usePerformStore.activateScene`.

---

## Class 4 — Early-return / conditional state omission

**Pattern signature:** snapshot or polling fn that early-returns and drops fields downstream consumers expect.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 4.1 | `src/ui/element_webview_host.cpp:4005` (now ~hoisted in `f653b167`) | C-2 engine-block hoist — landed but verify regression test is in place | WORKS (post-fix) |
| 4.2 | `webview/src/hooks/useJuceBridge.ts:264` | `applySnapshot(s)` early-returns on `s == null || typeof s !== "object"` — silent; no log; if the C++ side ever sends a malformed payload the entire UI freezes on the last good snapshot with no signal | P1 |
| 4.3 | `webview/src/stores/useEngineSnapshotStore.ts:60` | `if (snap == null) return` — silent skip; no logging when the snapshot poll fails repeatedly | P1 |
| 4.4 | `webview/src/stores/usePluginBrowserStore.ts:55` | `if (raw == null) return` — silent; the D-1 retry-poll fix relies on `plugins.length === 0` to retry, which fails to distinguish "scan complete with 0 plugins" from "bridge unavailable". Heuristic conflates two states | P1 |
| 4.5 | `webview/src/bridge/nativeApp.ts:11` | `if (r == null \|\| typeof r !== "object") return null` — caller (`AboutModal`) uses null as "loading"; subtle UX state collision | P2 |
| 4.6 | `webview/src/stores/useGraphStore.ts:324` | `if (coord === undefined) return n` — early-return inside a node update; could swallow a partial-update intent | P2 |
| 4.7 | `webview/src/components/layout/DashboardBuilder.tsx:100,150,193` | All three handlers early-return when `widget.nodeId == null \|\| widget.paramIndex == null`; correct behaviour but means an unbound widget is silently inert (UI does badge `Bind` but no toast on attempted interaction) | P2 |
| 4.8 | `webview/src/hooks/useJuceBridge.ts:436-447` | Boot-time effect calls `elementGetGraphState` AND `usePluginBrowserStore.refresh()` in one async block, so a failure in either kills both. Wrap each in its own try | P2 |

---

## Class 5 — Read-only display without subscription

**Pattern signature:** UI text reads like live data but sources from constant / placeholder.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 5.1 | `webview/src/components/layout/StatusBar.tsx:101-102` | Timecode `{health.timecode \|\| "00:00:00:00"}` — `health.timecode` is currently set to `sampleRateLabel` in `applySnapshot:347`, which is a **type error** (sample-rate string in a timecode field). Worse, the placeholder `"00:00:00:00"` masks the bug | **P0** |
| 5.2 | `webview/src/components/layout/Toolbar.tsx:399` | Toolbar `SAMPLE` readout shows `{live.timecode \|\| "—"}` — wrong field, same root as 5.1 | P1 |
| 5.3 | `webview/src/components/layout/Toolbar.tsx:257` | Time signature `<span>4/4</span>` — hardcoded; bridge has `session.timeSigNumerator`/`...Denominator` typed in `EngineSnapshot` (`useJuceBridge.ts:103-104`) but **NOT** consumed | P1 |
| 5.4 | `webview/src/components/layout/Toolbar.tsx:540` | "Engine: Live" Perform-mode badge — no subscription to `engineRunning` (Class 1.11 dupe) | P1 |
| 5.5 | `webview/src/components/canvas/Block.tsx:495-511` | Per-block latency/CPU rendered conditionally on `> 0` — but values always 0 (Class 1.17 dupe) | P1 |
| 5.6 | `webview/src/components/layout/InspectorHub.tsx:230` | "CPU (est.)" reads `block.cpuLoad` always 0 (Class 1.15 dupe) | P0 (downstream) |
| 5.7 | `webview/src/components/layout/MacroDashboard.tsx:155-156` | Master VU meter levels hardcoded (Class 1.5 dupe) | P1 |
| 5.8 | `webview/src/components/layout/LiveHealth.tsx:70,76` | I/O meter bars hardcoded (Class 1.3+1.4 dupe) | P0 (downstream) |
| 5.9 | `webview/src/components/canvas/BlockEmbed.tsx:201-205` | MeterEmbed defaults hardcoded (Class 1.6 dupe) | P1 |
| 5.10 | `webview/src/components/layout/PreferencesModal.tsx` (audio device pickers) | Verify these read from `useHostExtrasStore.audioSetup.outputDevices` — quick read of file shows lists hydrate via `nativeAudioApplySetup` round-trip; OK if list arrives. Not a leak today | P3 |
| 5.11 | `webview/src/components/canvas/Cable.tsx` | Cable RMS pulse — `useCableMeterStore.levels` populated from `onCableLevels`, but `Cable.tsx` does **NOT** animate stroke based on amplitude (D-22 from master list, still open) | P2 |
| 5.12 | `webview/src/components/layout/Toolbar.tsx:191-194` | Session display name `{sessionDisplayName(filePath, dirty)}` — wired to `useSessionStore.filePath` ✓ | WORKS |
| 5.13 | `webview/src/components/layout/SessionTree.tsx` | Recent files list — wired to store ✓ | WORKS |
| 5.14 | `webview/src/components/layout/Toolbar.tsx:392, 397, 403` | BUFFER/SAMPLE/LATENCY readouts read from `live.buffer`, `live.timecode` (wrong, see 5.2), `live.latency` — partial wire | P1 |

**Fix proposal:** Audit `applySnapshot` field-by-field — confirm the `timecode` / `sampleRateLabel` mix-up is a typo (`timecode: sampleRateLabel` at `useJuceBridge.ts:347`). Land a transport-timecode push channel; remove placeholders; pipe time-signature through.

---

## Class 6 — Async race conditions

**Pattern signature:** hook fires before its data source is ready.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 6.1 | `webview/src/hooks/useJuceBridge.ts:436-466` | D-1 retry-poll fix landed (5 timers, ~30s). But the polling pattern is heuristic — should be replaced with a C++-pushed `onPluginListChanged` event channel | WORKS (workaround) |
| 6.2 | `webview/src/components/layout/InspectorHub.tsx:317-320` | `BlockParameterList` `useEffect([reload])` — calls `nativeGetNodeParameters(nodeId)` on mount; if the host plugin isn't ready, returns `[]` and `loading=false`. NO retry. User sees "No automatable parameters" until they click "Refresh parameters" | **P0** |
| 6.3 | `webview/src/components/layout/PreferencesModal.tsx:241-301` | MIDI mapping table reads `mappingMaps` from `useHostExtrasStore` — depends on the snapshot block being populated when the modal mounts; if the user opens Preferences before the first snapshot arrives, mappings are empty | P1 |
| 6.4 | `webview/src/components/layout/InspectorHub.tsx:75-83` | `PresetStrip` calls `nativePresetList("")` on mount; same shape — silent empty list if host scan unfinished | P2 |
| 6.5 | `webview/src/components/layout/DashboardBuilder.tsx:553-556` | `loadDashboardLayoutFromHost()` + `loadMappedParametersFromHost()` on mount; race against host ValueTree readiness | P2 |
| 6.6 | `webview/src/components/canvas/QuickAddPopup.tsx:132-134` | Calls `refreshPlugins()` on mount; same race as ToolPalette | P2 |
| 6.7 | `webview/src/components/canvas/CommandPalette.tsx:106-110` | Calls `refreshPlugins()` on `open` — race if the user opens Cmd+K before the boot-time effect fires | P2 |
| 6.8 | `webview/src/hooks/useJuceBridge.ts:443` | Boot-time `await usePluginBrowserStore.getState().refresh()` is sequential AFTER `elementGetGraphState` — if the graph fetch hangs, plugins never load | P1 |
| 6.9 | Session load → graph populate | When user opens a session, the snapshot fires asynchronously; `GraphCanvas` renders with the OLD graph for one frame. No transition signalling | P3 |

The dominant fix shape (retry-poll with backoff) is **wrong** for several of these — the right answer is push-from-C++. The `__elementNative` callback shape already supports this (`onGraphState`, `onParameterUpdate`); add `onPluginListChanged`, `onParameterMetadataChanged`, `onMappingChanged` events.

---

## Class 7 — AX opacity for icon-only buttons

**Pattern signature:** `<button title="X">{<Icon name="..." />}</button>` where the icon is `aria-hidden` and the AX label depends on the button's own `aria-label` or `title`.

### Instances

The `title=`/`aria-label=` mitigation has been broadly applied to Toolbar after team-qa2's audit. Remaining gaps:

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 7.1 | `webview/src/components/layout/MacroDashboard.tsx:100` | `<button className="text-text-secondary" aria-label="More options">` ✓ has aria-label, but **no onClick** — opaque action (Class 2.1 dupe) | P1 |
| 7.2 | `webview/src/components/layout/SnippetShelf.tsx:35-43` | Snippet row buttons — verify they have `aria-label`/`title` | P2 |
| 7.3 | `webview/src/components/layout/ToolPalette.tsx:204-215` | View-mode toggle buttons (LayoutGrid/List) — Icon has `aria-label` but the BUTTON does not (`<button onClick={...} className="...">`). AX inspector reads inner aria-label, but pattern is fragile | P2 |
| 7.4 | `webview/src/components/layout/Toolbar.tsx:411-420` | Mode toggle button (EDIT/PERFORM toggle row) — no `aria-label` on the button; only inner spans | P2 |
| 7.5 | `webview/src/components/layout/Toolbar.tsx:430-446` | MAN/BEZ cable routing toggle — has `title=` ✓ | WORKS |
| 7.6 | `webview/src/components/layout/AppShell.tsx:103` | Sidebar nav buttons — verify `aria-label` (file shows just `className`) | P2 |
| 7.7 | `webview/src/components/layout/DashboardBuilder.tsx:587-651` | Edit/Add/Clear All buttons in dashboard toolbar — text-bearing, AX OK | WORKS |
| 7.8 | `webview/src/components/layout/Breadcrumb.tsx:28-45` | Breadcrumb segments — `<button>` shows breadcrumb text, AX OK | WORKS |
| 7.9 | `webview/src/components/layout/SceneLauncher.tsx:174-205` | Camera/Pencil/Trash icon buttons each have `<Icon ... aria-label=... />` BUT the wrapping button has no `aria-label`/`title` — fragile | P2 |
| 7.10 | `webview/src/components/canvas/EdgeContextMenu.tsx:227-237` | `MenuItem` wraps Icon + label `<span>` — text content gives AX label ✓ | WORKS |
| 7.11 | `webview/src/components/canvas/QuickAddPopup.tsx:98-113` | PluginRow button — text-bearing ✓ | WORKS |
| 7.12 | `webview/src/components/layout/Toolbar.tsx:567-576` | Power button (Perform mode) — wrapped `aria-label="MIDI panic - all notes off"` ✓ | WORKS |
| 7.13 | `webview/src/components/layout/PreferencesModal.tsx:65, 154, 192, 226, 241, 288, 308, 315, 322` | Many icon-only close-X buttons — verify `aria-label` on each | P2 |

**Fix proposal:** Add an ESLint rule (`jsx-a11y/control-has-associated-label`) to enforce `aria-label`/`title` on every `<button>` with no text child.

---

## Class 8 — Error-swallowing / silent failure

**Pattern signature:** empty `catch {}` or `if (raw == null) return` without logging.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 8.1 | `webview/src/bridge/nativeSession.ts:62` | `} catch {}` after `JSON.parse(raw)` for session list | P1 |
| 8.2 | `webview/src/bridge/nativeEngineSnapshot.ts:71` | `} catch {}` swallowing engine snapshot fetch error | P1 |
| 8.3 | `webview/src/bridge/nativeEngineSnapshot.ts:79` | `} catch {}` swallowing JSON.parse | P1 |
| 8.4 | `webview/src/bridge/nativeGraph.ts:285` | `} catch {}` in `nativePresetList` | P1 |
| 8.5 | `webview/src/bridge/nativeGraph.ts:324` | `} catch {}` in `nativeSessionGetGraphTree` | P1 |
| 8.6 | `webview/src/bridge/nativeGraph.ts:352` | `} catch {}` in `nativeGetConnectionList` | P1 |
| 8.7 | `webview/src/bridge/nativeGraph.ts:373` | `} catch {}` in `nativeScriptCompile` (line ~pid) | P1 |
| 8.8 | `webview/src/bridge/nativeGraph.ts:384` | `} catch {}` in script source/compile | P1 |
| 8.9-8.13 | `webview/src/bridge/nativeGraph.ts:406, 421, 436, 448, 460, 471` | 6× `try { return JSON.parse(raw) ... } catch { return { ok: false, error: "parse error" }; }` — at least these surface a structured error, but the pattern is duplicated 6 times | P2 |
| 8.14 | `webview/src/hooks/useJuceBridge.ts:405-407` | Top-level snapshot JSON.parse swallowed — `/* ignore malformed */` comment | P0 |
| 8.15 | `webview/src/hooks/useJuceBridge.ts:444-446` | Boot effect `} catch { /* Embedded web dev without native bridge */ }` — masks BOTH dev-mode AND real bridge failures | P0 |
| 8.16 | `webview/src/stores/usePluginBrowserStore.ts:92-98` | `catch (err)` only logs in DEV — production users see silent failure | P1 |

**Fix proposal:** Add an `onBridgeError(fnName, err)` callback in `useJuceBridge` that logs to a developer console + emits a toast in DEV. Replace every `} catch {}` with `} catch (err) { onBridgeError("nativeFn", err); }`.

---

## Class 9 — Codemod / icon semantic mismatch

**Pattern signature:** lucide icon name doesn't match the action's documented semantic.

### Instances

| # | File:Line | Description | Severity |
|---|-----------|-------------|----------|
| 9.1 | `webview/src/components/canvas/NodeContextMenu.tsx:113` | `iconName: "Power"` for **Bypass** action — Power = on/off device; Bypass = signal pass-through. Semantic mismatch (questionable; ratifiable as "off-button") | P3 (designer call) |
| 9.2 | `webview/src/components/canvas/NodeContextMenu.tsx:133` | `iconName: "LogIn"` for **Mute Input** — LogIn = sign-in arrow; this is inappropriate. Should be e.g. `MicOff` or `VolumeX` variant | P2 |
| 9.3 | `webview/src/components/layout/Toolbar.tsx:530, 574` | `Power` icon for `MIDI Panic` button — Glen ratified per blueprint; semantic intentional | WORKS |
| 9.4 | `webview/src/components/canvas/EdgeContextMenu.tsx:191` | `Plug` icon for "Make Wired" — plug = connect = correct ✓ | WORKS |
| 9.5 | `webview/src/components/canvas/EdgeContextMenu.tsx:198` | `Radio` icon for "Make Wireless…" — wireless transmitter; correct ✓ | WORKS |
| 9.6 | `webview/src/components/layout/MacroDashboard.tsx:60-62` | Tab icons `SlidersHorizontal/LayoutGrid/Sparkles` for Macros/Scenes/FX — `Sparkles` for FX is metaphorical, not technical; arguable | P3 |
| 9.7 | `webview/src/components/layout/Toolbar.tsx:308` | `Pause` ↔ `Play` toggle — semantic correct ✓ | WORKS |
| 9.8 | `webview/src/components/layout/Toolbar.tsx:327` | `Circle` for Record — should be filled red Circle when recording; only colour changes today, not shape | P3 |

The semantic-mismatch class is small. NodeContextMenu's `LogIn` icon for "Mute Input" is the standout fix-this-now case.

---

## Class 10 — Test coverage / verification gaps

**Pattern signature:** production code with zero `*.test.*` companion.

### Production files vs test coverage

Out of **41 production .ts/.tsx files** in `webview/src/{components,stores,bridge,hooks}`, only **5 have tests** (Icon.test.tsx, EmptyState.test.tsx, Skeleton.test.tsx, NeuPromptModal.test.tsx, AboutModal.test.tsx, useEngineSnapshotStore.test.ts).

### Untested production files (severity grouped)

**P0 — Mission-critical untested:**
- `webview/src/hooks/useJuceBridge.ts` (entire bridge wiring; 473 lines; 0 tests)
- `webview/src/stores/useGraphStore.ts` (graph state + reducers)
- `webview/src/stores/usePerformStore.ts` (live health + scenes)
- `webview/src/bridge/nativeGraph.ts` (60+ bridge fns; only 5 of 17 functions covered indirectly)
- `webview/src/components/canvas/GraphCanvas.tsx` (the canvas root)
- `webview/src/components/layout/Toolbar.tsx` (575 lines; 24 buttons)
- `webview/src/components/layout/StatusBar.tsx` (post-fix engineRunning logic)
- `webview/src/components/layout/InspectorHub.tsx` (732 lines; 8 child components inline)
- `webview/src/hooks/useKeyboard.ts` (every Cmd+ shortcut)
- `webview/src/components/layout/PreferencesModal.tsx` (audio + MIDI + Lua + OSC settings)

**P1 — Standard untested:**
- `webview/src/stores/useAppStore.ts`, `useBusStore.ts`, `useCableMeterStore.ts`, `useDashboardStore.ts`, `useHostExtrasStore.ts`, `useParameterStore.ts`, `usePluginBrowserStore.ts`, `useSessionStore.ts`
- `webview/src/bridge/nativeApp.ts`, `nativeEngineSnapshot.ts`, `nativeKeyboard.ts`, `nativePerform.ts`, `nativePluginEditor.ts`, `nativePrefs.ts`, `nativeSession.ts`, `juceBackend.ts`
- `webview/src/components/canvas/Block.tsx`, `BlockEmbed.tsx`, `Cable.tsx`, `CommandPalette.tsx`, `CommentFrame.tsx`, `EdgeContextMenu.tsx`, `NodeContextMenu.tsx`, `QuickAddPopup.tsx`, `ScriptEditor.tsx`
- `webview/src/components/layout/AppShell.tsx`, `BlockTabStrip.tsx`, `Breadcrumb.tsx`, `BusInspector.tsx`, `ConnectionEditor.tsx`, `DashboardBuilder.tsx`, `LiveHealth.tsx`, `MacroDashboard.tsx`, `QuickAccess.tsx`, `SceneLauncher.tsx`, `SessionTree.tsx`, `SnippetShelf.tsx`, `ToolPalette.tsx`, `VirtualKeyboard.tsx`

**P2 — Leaf utility untested:**
- `webview/src/components/neu/NeuButton.tsx`, `NeuBadge.tsx`, `NeuDisplay.tsx`, `NeuFader.tsx`, `NeuInput.tsx`, `NeuKnob.tsx`, `NeuToggle.tsx`

### Native AX suite gaps (tools/automation)

Per master-list cycle-1 caveat: 4 of 8 native AX suites (`element_verify_*.py`) use **stale labels** (e.g., reference `"Browser"` panel label that was renamed to `"BROWSE"`) — they pass but assert against obsolete UI labels.

### Recommendation
Add at minimum:
- `useJuceBridge.test.ts` — apply applySnapshot with partial payloads (empty graph; missing engine block; missing session block).
- `usePerformStore.test.ts` — hydrateFromEngine ordering + scene-state divergence.
- `Toolbar.test.tsx` — every button delegates to the right bridge fn.
- `nativeGraph.test.ts` — JSON.parse error path returns structured error.

Total estimated coverage gap: **36 untested files**, of which **10 are P0**.

---

## Cross-cutting bridge round-trip audit

87 C++ Identifiers registered. 80 unique JS-side `invokeElementNative()` call sites. 7 fns are **registered but never called from JS**.

| fnName | C++ line | JS wrapper file:line | called by | shape match | error path |
|---|---|---|---|---|---|
| elementGraphCreateWirelessBus | 2774 | **none** | — | n/a | n/a |
| elementGraphDeleteWirelessBus | 2871 | **none** | — | n/a | n/a |
| elementGraphDuplicateNodesWithRewire | 3121 | **none** | — | n/a | n/a |
| elementGraphGetWirelessBuses | 2836 | **none** | — | n/a | n/a |
| elementGraphSetConnectionSource | 2572 | **none** | — | n/a | n/a |
| elementGraphSetConnectionTarget | 2675 | **none** | — | n/a | n/a |
| `userNote` (false positive — property name, not Identifier) | 1544 | n/a | n/a | n/a | n/a |
| elementGetGraphState | 840 | useJuceBridge.ts:438 | boot effect | ✓ JSON | catch {} |
| elementGetEngineSnapshot | 886 | nativeEngineSnapshot.ts:70 | useEngineSnapshotStore poll | ✓ JSON | catch {} |
| elementGetPluginList | 847 | usePluginBrowserStore.ts:48 | refresh | ✓ JSON | DEV-only log |
| elementGraphAddPlugin | 1196 | nativeGraph.ts:6 | ToolPalette/QuickAddPopup/CommandPalette | ✓ | none |
| elementGraphRemoveNode | 1217 | nativeGraph.ts:11 | NodeContextMenu | ✓ | none |
| elementGraphConnect | 1240 | nativeGraph.ts:21 | GraphCanvas onConnect | ✓ | none |
| elementGraphDisconnect | 1267 | nativeGraph.ts:36 | EdgeContextMenu / GraphCanvas | ✓ | none |
| elementUndo | 1471 | nativeGraph.ts:217 | Toolbar/CommandPalette | ✓ | none |
| elementRedo | 1479 | nativeGraph.ts:221 | Toolbar/CommandPalette | ✓ | none |
| elementTransportPanic | 1487 | nativeGraph.ts:225 | Toolbar/MacroDashboard | ✓ | none |
| elementTransportTogglePlay | 1496 | nativeGraph.ts:229 | Toolbar/CommandPalette | ✓ | none |
| elementTransportStop | 2350 | nativeGraph.ts:234 | Toolbar | ✓ | none |
| elementTransportRewind | 2362 | nativeGraph.ts:240 | Toolbar | ✓ | none |
| elementTransportSetRecording | 2196 | nativeGraph.ts:248 | Toolbar/CommandPalette | ✓ | none |
| elementTransportSetTempo | 2209 | nativeGraph.ts:260 | Toolbar (BPM edit + TAP) | ✓ | none |
| (~60 more — abbreviated for length) | | | | | |

**Findings:**
- 6 wireless-bus / advanced-routing fns registered but unused — likely dead code OR future feature placeholders that need surfacing in the React UI (`EdgeContextMenu` has Wireless/Wired toggle but uses `elementGraphSetCableBus` instead — the dedicated `CreateWirelessBus`/`DeleteWirelessBus` fns are dormant).
- `elementGraphSetConnectionSource`/`...Target` — the connection-edit affordance (drag-to-rewire-cable) is registered but NOT in the React `EdgeContextMenu` or `Cable.tsx`. Confirms M-23 (drag block onto cable → inline-insert) is unblocked from the bridge side; the JS UI is the gap.
- Reverse direction is clean: no JS calls a missing C++ fn.

---

## Recommended ralph stories (next fix wave)

Stories ranked by **bug-instance-cleared per minute**:

1. **C-2-Bis "remove QuickAddPopup demoPlugins"** — 1 instance, P0, ~10 min. Direct sibling to F-101.
2. **C-1-Bis "wire per-block CPU + latency in `mapBlock`"** — 7 instances (Class 1.1, 1.15, 1.16, 1.17, 5.5, 5.6 plus all downstream Block.tsx renders), P0, ~45 min. Add `cpuLoad`/`latencyMs` to `EngineBlock` schema, populate in `buildActiveGraphJson`, drop `: 0` in `mapBlock`.
3. **C-Timecode "fix `timecode: sampleRateLabel` typo + land transport timecode"** — 2-3 instances (5.1, 5.2), P0, ~30 min. The typo is a one-line fix; the timecode push channel is ~2 hr.
4. **C-IO "wire I/O VU meters from `onMetering`"** — 4 instances (Class 1.3, 1.4, 1.5, 5.8), P0, ~1.5 hr. The peak channel is already polled (`onMetering`); split into L/R/master channels and bind LiveHealth/MacroDashboard to live values.
5. **C-Empty-Catch "thread error logging through every bridge wrapper"** — 16 instances (entire Class 8), P1, ~2 hr. Adds `onBridgeError` callback + replaces every `} catch {}`.
6. **C-Test "test useJuceBridge applySnapshot edge cases"** — covers Class 10 P0 list, ~3-4 hr first pass.
7. **C-3-Scene "collapse useAppStore.activeScene → usePerformStore.activateScene"** — 1 instance, P0, ~1.5 hr. Glen previously dismissed but the bridge call gap is real.
8. **C-Wireless-Bus "expose CreateWirelessBus / DeleteWirelessBus to React"** — 6 dead bridge fns, P2, ~2 hr.
9. **C-Connection-Edit "land drag-to-rewire-cable in EdgeContextMenu / Cable"** — uses dormant `SetConnectionSource`/`Target`, P2, ~3 hr.
10. **C-Icon-LogIn "rebind LogIn → MicOff for Mute Input"** — 1 instance, P2, ~5 min.

Stories 1-5 fit in roughly **6 working hours** and clear ~30 of the 133 instances (including all 8 confirmed P0 bugs). Story 6 is parallel-tractable with stories 1-5.

---

## Coverage caveats

- This audit is **READ-ONLY**. No code changes. No regression to 67/67 ctest or 41/41 vitest.
- The C++ bridge round-trip table is abbreviated; complete enumeration would expand to 87 rows.
- Class 10 enumerates 36 untested files; some have integration coverage indirectly (e.g. `Toolbar` exercises every transport bridge fn at runtime, just not in vitest).
- Class 9 semantic-mismatch is judgement-call territory; flagged for designer review only.
- Hardcoded `4/4` time signature (5.3) might be a deliberate "never-implemented yet" gap rather than a regression — bridge schema exposes the field but no UI consumes it.
