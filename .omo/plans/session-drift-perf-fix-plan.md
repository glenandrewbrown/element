# Session-Drift Performance Regression — Diagnosis & Fix Plan

**Date:** 2026-05-31
**Author:** deep-research skill (web fan-out) + codebase Explore (file:line evidence) + synthesis
**Scope:** Element webview (`webview/`) — React/Tailwind in JUCE `WebBrowserComponent`, `@xyflow/react` v12, Zustand v5 stores, ~60Hz C++→JS bridge.
**Symptom (as stated):** "Session drift" — UI gets slower the **longer a project stays open** (frame-rate decays, input lag grows over time). Glen (2026-05-31): **NEW regression — it got worse recently.**

---

## REGRESSION WINDOW (2026-05-31) — real `git log`, NOT yet bisect-confirmed

Glen confirmed it's a recent regression. `git log` of the suspect files (verified against HEAD ancestry) shows:

**Recent, on-point commits (real hashes + verified dates):**

| Commit | Date | Touches | Relevance |
|---|---|---|---|
| `ff023feb` | **05-29** | `juceBackend.ts` | *"resolve boot-hang, blank-UI, and **large-session hang**"* — most on-point recent commit; reworked the bridge/leak area |
| `dadc2c67` | **05-30** | `useJuceBridge.ts` | Wave 2 taxonomy — last touch on the bridge hook (could have shifted the onCableLevels/onGraphState chain) |
| `e7130f6f` | 05-08 | engine snapshot | replaces fake CPU with **real engine-snapshot subscription** → live 4Hz pushes begin |
| `9ba350bc` | 05-08 | snapshot schema | adds per-block **cpuLoad + latencyMs** → heavier 4Hz payload |
| `3e189415` | 05-08 | metering wiring | wires VU meters to real `onMetering` (high-freq stream on) |
| `590e7d1a` | 05-08 | `useEngineSnapshotStore` | store + bridge wrapper first created |

**Honest correction:** an earlier draft cited 7 commit hashes that **do not exist in this repo** (verified — `git show` returns nothing). Removed. The table above is verified by `git show`.

**Timeline reading:** the "turn on real live data" wave (4Hz snapshot + VU metering) actually landed **05-08**, not last-day-recent. The genuinely *recent* changes (05-29/05-30) are `ff023feb` (bridge rework, explicitly fixing a *"large-session hang"*) and `dadc2c67` (taxonomy wave touching the bridge hook), plus the 05-30 UI redesign waves. So "regressed recently" most plausibly = **`ff023feb` and/or the 05-30 UI waves**, layered on top of the always-expensive 05-08 live-data path.

**What is NOT the regression:** `useCableMeterStore.ts` is **old** (`14a633a0`, 2026-04-11, unchanged since); Rank 1 is real steady-state cost but **not new**. Same for `Block.portBusMap` (Rank 4).

→ **Not yet confirmed by bisect/profiling.** To *prove* it cheaply: `git diff ff023feb^ ff023feb -- webview/` and read the bridge changes; and/or checkout `8408f6c5` (last 05-30 release tag area, pre-redesign) vs HEAD and profile. Then fixes start at **Phase 2 (engine-snapshot diff-before-set + drop `Date.now()`)** — but **confirm the window first** since the prime recent suspect (`ff023feb`) is a *bridge* change, which could point more at Rank 2 (leak) than Rank 3.

> ⚠️ Method note (per project memory `feedback_ui_failure_root_causes`, `feedback_build_install_before_claiming`):
> **Measure before and after every change.** A perf regression that is not reproduced + quantified cannot be
> confirmed fixed. Do NOT claim "done" on this without before/after frame-time + heap numbers from a running build.

---

## 0. What "drift" actually means here — two distinct mechanisms

The evidence splits the symptom into two independent growth curves. They need different fixes and different proof.

| Mechanism | What grows | Feels like |
|---|---|---|
| **A. Per-frame waste scaling with graph size** | constant high-frequency work × (cables + blocks) | baseline jank that worsens as the project gets bigger; *steady-state*, not strictly time-based |
| **B. True monotonic leak over time** | listeners / Map entries / compositor layers accumulate while the app runs | the *same* graph gets slower the longer it's left open — the literal "session drift" |

Both are present in the code. **B is the one that matches the user's words most precisely** and should be proven first, but **A is the larger steady-state cost** and is cheaper to fix.

---

## 1. Evidence — ranked culprits (all file:line verified)

### 🔴 Rank 1 — Cable meter store: unconditional `set()` at ~60Hz (mechanism A, worst steady-state)
- `webview/src/hooks/useJuceBridge.ts:447-450` → `onCableLevels` forwards every frame.
- `webview/src/stores/useCableMeterStore.ts:11-16` → `setCableLevels` rebuilds a new `Record<string,number>` and calls `set({levels})` **unconditionally**, no diff.
- Every `Cable` subscribes `useCableMeterStore((s) => s.levels[id])`. 20 cables → ~1200 subscriber callbacks/sec, forever.
- **Web confirms:** never `setState` per message from a high-frequency stream; buffer in a ref and flush once per `requestAnimationFrame`. ([sitepoint](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/), [wellally](https://www.wellally.tech/blog/optimizing-react-state-wearable-data-streams))

### 🔴 Rank 2 — `pendingPromises` Map never pruned (mechanism B, the true leak)
- `webview/src/bridge/juceBackend.ts:38-55` → `nextPromiseId` monotonic, `pendingPromises` Map entry added per bridge call, removed only on matching `__juce__complete`.
- Dropped/timed-out replies (host not ready, graph reload mid-call, host crash) leak entries **forever**. Engine poll (250ms) + plugin retries + graph fetches feed it for the whole session.
- **This is the cleanest "gets slower the longer it's open" candidate.** No web citation needed — unbounded Map is self-evidently a leak.

### 🟠 Rank 3 — Engine snapshot store writes `lastUpdated: Date.now()` every tick (mechanism A, idle waste)
- `webview/src/stores/useEngineSnapshotStore.ts:58-93` + `:109` (250ms `setInterval`).
- `Date.now()` is always new → `set()` always notifies → StatusBar/Toolbar/LiveHealth/InspectorHub/ToolPalette/QuickAccess re-render 4×/sec even when idle.
- **Web confirms:** stable selectors + diff-before-set; returning a new reference when data didn't change forces re-renders. ([zustand #3228](https://github.com/pmndrs/zustand/discussions/3228), [dev.to/eraywebdev](https://dev.to/eraywebdev/optimizing-zustand-how-to-prevent-unnecessary-re-renders-in-your-react-app-59do))

### 🟠 Rank 4 — `Block.portBusMap` memo busted on every graph push (mechanism A, scales O(N×M))
- `webview/src/components/canvas/Block.tsx:673-684` — `useMemo([edges, cableBus, d.id])`.
- `selectEdges` returns `s.edges` by reference; `hydrateFromEngine` (`useGraphStore.ts:268-291`) replaces the array on every push → every mounted Block rebuilds a `Map` over all edges. N blocks × M edges per push.
- `hydrateFromEngine` also nulls `selectedNodeId/selectedEdgeId` unconditionally → re-renders all `GraphCanvas` subscribers.
- **Web confirms:** directly accessing `nodes`/`edges` in components is the #1 React Flow pitfall — they change constantly. ([reactflow perf](https://reactflow.dev/learn/advanced-use/performance), [dev.to optimization](https://dev.to/usman_abdur_rehman/react-flowxyflow-optimization-45ik))

### 🟡 Rank 5 — Continuous CSS animations + filters, never paused offscreen (mechanism A→B, GPU)
- `Cable.tsx:188` → `signalPulse 1s linear infinite` on every cable with `amp>0.05`; `:164-175` adds a `blur()` glow `<BaseEdge>` per active cable.
- `Block.tsx:871,999` → `led-pulse 1.6s infinite` per active block; `:353-356` → `backdrop-filter: grayscale(...)` per bypassed block.
- React Flow v12 does **not** unmount offscreen edges — animations keep running on the compositor regardless of viewport.
- **Web confirms:** `backdrop-filter` makes a new compositing layer + repaints the backdrop every frame — use on static/rare elements, never lists. ([shadcn #327](https://github.com/shadcn-ui/ui/issues/327), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter), [f22labs](https://www.f22labs.com/blogs/how-css-properties-affect-website-performance/))

### 🟡 Listener-chain re-install on HMR/StrictMode (mechanism B, dev + possibly prod double-mount)
- `webview/src/stores/usePerformStore.ts:214-235` — `installMeteringChain()` runs at **module load**, prepends a link to `onMetering` each evaluation; old link never removed → each metering callback does 2×, 3×… work.
- `webview/src/bridge/juceBackend.ts:43-57` — `__juce__complete` listener wired once per module instance, `removeEventListener` never called.

---

## 2. Fix plan — phased, measure-gated

### Phase 0 — Reproduce & instrument (DO FIRST, no fixes yet)
Goal: turn "feels slower" into numbers, and prove A vs B.
0. **git log done (see REGRESSION WINDOW above) — bisect NOT yet run.** Real recent suspects = the 05-29 "turn on real live data" wave (`e7130f6f`, `9ba350bc`, `3e189415`, `ff023feb`). To *confirm*: checkout/stash before `e7130f6f`/`590e7d1a` and profile vs HEAD. *(This plan is hypothesis-ranked from static reading — the regression has NOT yet been reproduced or profiled; this Phase 0 gets the numbers.)*
1. Add a dev-only FPS + heap probe (already partly present — check `useEngineSnapshotStore`). Log `performance.now()` frame delta + `performance.memory.usedJSHeapSize` once/sec to console or an overlay.
2. **Repro protocol:** open a project with ~15–20 connected blocks + active signal (so cables pulse). Record frame-time + heap at t=0, t=5min, t=20min, idle vs interacting.
3. Instrument the leak suspects directly: log `pendingPromises.size` and the `onMetering`/`onCableLevels` chain length every 30s.
4. **Exit criterion:** a chart/table showing which curve(s) actually rise. This decides ordering. *If neither rises, the regression is elsewhere — stop and re-scope.*

### Phase 1 — Stop the bleeding (mechanism B leaks — highest confidence, lowest risk)
1. **Cap/prune `pendingPromises`** (`juceBackend.ts`): add a timeout per pending entry (reject + delete after N seconds) and/or a hard size cap with oldest-eviction. Wire `removeEventListener` for `__juce__complete` on teardown.
2. **Make `installMeteringChain` idempotent** (`usePerformStore.ts:214-235`): guard the module-load side effect (flag like `juceBackend`'s `listenerWired`), or move it into a React effect with cleanup. Same for any chain that prepends without removing.
3. Verify with the Phase-0 leak probes: `pendingPromises.size` and chain length must now plateau.

### Phase 2 — Decouple high-frequency streams from React (mechanism A, biggest steady-state win)
1. **Cable meters** (`useCableMeterStore` + `useJuceBridge.ts:447`): buffer incoming levels in a `useRef`/module ref; flush to the store once per `requestAnimationFrame`. In `setCableLevels`, **diff before `set()`** (skip if no value changed beyond an epsilon). Consider per-cable atom or a transient (non-react) channel so only changed cables notify. ([raf-throttle](https://github.com/wuct/raf-throttle))
2. **Engine snapshot** (`useEngineSnapshotStore.ts:58-93`): drop `lastUpdated: Date.now()` from the hot path (or move it out of the subscribed slice); diff `snap` before `set()` so idle ticks notify nobody.

### Phase 3 — React Flow render hygiene (mechanism A, O(N×M) → O(changed))
1. **`Block.portBusMap`** (`Block.tsx:673`): stop depending on the whole `edges` array. Either derive the per-block port→bus map in the store once per push, or select only this block's edges via a stable selector. Avoid passing `s.edges` into every Block.
2. **`hydrateFromEngine`** (`useGraphStore.ts:268-291`): don't null selection unconditionally — preserve selection if still valid; only write changed slices.
3. **`GraphCanvas.translateExtent`** (`GraphCanvas.tsx:367`): `useMemo` it on `graphBounds` so React Flow's prop identity check can short-circuit.
4. Audit `onlyRenderVisibleElements` — note v12 has known offscreen-edge bugs when nodes have fixed size; test before enabling. ([xyflow #4516](https://github.com/xyflow/xyflow/issues/4516))

### Phase 4 — GPU / compositor cost (mechanism A→B)
1. **Pause offscreen animations:** gate `signalPulse`/`led-pulse` on viewport visibility (React Flow `useViewport` or an intersection check), and/or stop pulsing when `amp` is steady. Don't run N infinite keyframe timelines unconditionally.
2. **`backdrop-filter` on bypassed blocks** (`Block.tsx:353`): replace with a plain `filter`/overlay or a precomputed dimmed style — `backdrop-filter` is the wrong tool for a per-block, possibly-many-instances state (web-confirmed). This also aligns with `feedback_adaptive_contextual_layout` (muted/bypassed styling).
3. Reconsider the per-cable `blur()` glow layer — expensive ×N; consider a cheaper static glow or drop under load.

### Phase 5 — Verify & lock
1. Re-run the **exact** Phase-0 repro on a fresh **build + install** (per `feedback_build_install_before_claiming`). Compare frame-time + heap curves.
2. **Exit criterion:** heap plateaus over 20min; frame-time at t=20min ≈ t=0; no leak-probe growth.
3. Add a regression guard if feasible (a Storybook/interaction perf smoke or a unit test asserting `setCableLevels` no-ops on unchanged input, `pendingPromises` prunes).

---

## 3. Sequencing rationale
- **Phase 1 before 2/3** — leaks are the literal "drift", cheapest, lowest-risk, independently shippable.
- **Phase 2 is the biggest single steady-state win** (Rank 1) and is well-isolated (one store + one bridge hook).
- **Phase 3/4 touch Block.tsx / GraphCanvas.tsx** — currently a fragile area (Block port rendering is broken per `SESSION-STOCKTAKE-2026-05-31`). Do these **after** the Block revert/repair lands, or on a clean baseline, to avoid tangling perf work with the UI rebuild.

## 4. Risks / unknowns
- Block.tsx is mid-rework/broken — Phase 3 may conflict with the V3 UI build. Coordinate.
- `performance.memory` is Chromium-only; confirm it exists in the JUCE WebView (CEF vs WKWebView) or use an alternate heap probe.
- The regression may predate the webview entirely (C++ side could be pushing more/larger snapshots over time). Phase 0 must rule the C++ push rate in or out.
- "Regression" implies it got *worse* at some point — `git log` the suspect files / bridge to find when, if Phase 0 confirms a true time-curve.

## 5. Sources (web verification)
- Zustand high-freq / useShallow / diff-before-set: [#3228](https://github.com/pmndrs/zustand/discussions/3228), [#2642](https://github.com/pmndrs/zustand/discussions/2642), [migrating-to-v5](https://github.com/pmndrs/zustand/blob/main/docs/migrations/migrating-to-v5.md), [mordonez](https://www.mordonez.me/posts/why-zustand-has-useshallow-and-how-it-prevents-unnecessary-renders/)
- High-frequency stream → ref+rAF buffer: [sitepoint](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/), [wellally](https://www.wellally.tech/blog/optimizing-react-state-wearable-data-streams), [raf-throttle](https://github.com/wuct/raf-throttle)
- React Flow perf / don't read nodes&edges directly / onlyRenderVisibleElements caveats: [perf docs](https://reactflow.dev/learn/advanced-use/performance), [optimization](https://dev.to/usman_abdur_rehman/react-flowxyflow-optimization-45ik), [#4516](https://github.com/xyflow/xyflow/issues/4516)
- backdrop-filter cost: [shadcn #327](https://github.com/shadcn-ui/ui/issues/327), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter), [f22labs](https://www.f22labs.com/blogs/how-css-properties-affect-website-performance/)
