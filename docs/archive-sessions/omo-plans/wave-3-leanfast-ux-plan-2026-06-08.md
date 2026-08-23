# Wave 3 — Lean & Fast UX Plan (v2)

**STATUS: pending approval**
**Date:** 2026-06-08
**Revision:** v2 — folds architect SOUND-WITH-AMENDMENTS (×7) + critic ITERATE (CRITICAL-1/2/3, MAJOR-4/5/6). See "## Revision log (v2)" at end. The critic's **CRITICAL-1 corrects the architect's amendment #1**: the swap must preserve the node **UUID**, not the engine `nodeId`.
**Branch (recommended):** Phases 0–3 on `wave-3-leanfast-ux` (already cut, off `wave-2-block-faces` @ `06c61158`); **Phase 4 on its OWN branch off the tip, merged last** (risk-isolation — see ADR S4).
**PR baseline:** `local-enhancements` (NOT `main`)
**Author:** Planner (ralplan DELIBERATE mode)
**Mode:** PLANNING ONLY — no source edits, no commits, no execution.

> Sequences ALREADY-DIAGNOSED fixes. Do **not** re-diagnose. Root-cause artifacts folded in:
> - `.omc/state/qa-wave-reports/perf-diag-2026-06-08.md` (perf, ranked #1–#8)
> - `.omc/state/qa-wave-reports/plugin-window-diag-2026-06-08.md` (editor won't-move + slow-open)
> - `.omo/research/nodegraph-ux-research-2026-06-08.md` (TOP-10 dense/nested/matrix UX)
> - `.omo/bakeoff/briefs/left-panel-redesign-2026-06-08.md` (left/right panel redesign, phased A–F)

---

## 0. RALPLAN-DR SUMMARY

### Principles (the frame every task respects)
1. **Speed is the supreme metric.** If appearance ever trades against speed, speed wins. Every task either *adds* speed or is speed-neutral; none may regress idle/drag CPU (we have the perf-wave baselines: idle ~14%, drag ~29%).
2. **Density IS the beauty; curate, never dump.** Leanness comes from *governed* density (collapse tiers, value-on-knob, pin-to-face) — not from hiding depth behind beginner walls. The expert controls density explicitly.
3. **Nothing fake.** Every surfaced datum is real engine data. Placeholder/loading states are honest (a real "loading" node that becomes the real processor), never mock meters.
4. **RT-safety is non-negotiable.** No audio-thread locks/allocs. The async plugin swap is a **topology change** that rides the existing whole-graph op-array republish (`GraphNode::buildRenderingSequence()` → `exchange(acq_rel)`, `graphnode.cpp:427/491/633`, driven by `triggerAsyncUpdate`) — it must **NEVER** write `activeRenderingOps` directly. Message-thread is where load/build cost is allowed to live. **Identity invariant:** the webview keys every Block by the persistent ValueTree **UUID** (`getUuidString`); the swap must preserve the **UUID** (the integer engine `nodeId` may change freely).
5. **Locked design system + terminology + guards stay green.** Neumorphism only (no glass/blur/transparency); locked tokens; Block/Board/Container/Module/Cable/Snippet; the 2 guards (vitest `webview/src/__tests__/terminologyGuard.test.ts` + ctest `util/check_terminology.py`) and the painter vitests (`webview/src/components/canvas/__tests__/Cable.painter.test.tsx`, `webview/src/components/canvas/__tests__/Block.gaps.test.tsx`) gate every PR.
6. **Contract-first for the two cross-cutting schema surfaces.** The **loading-node** snapshot shape (Phase 4) and the **collapse-tier** ValueTree shape (Phase 2) are NOT phase-local — every snapshot consumer touches them. Specify both as a no-code **Phase 0 contract** FIRST so Phases 2/3 build against the final shape (tolerating `loading`) and don't get re-coded when Phase 4 lands. (Critic CRITICAL-2/3, architect S1/S3.)

### Decision Drivers (top 3)
1. **Felt impact for an expert user, fastest.** The owner's loudest pains are *felt every session*: pan-vs-select cursor (every click-drag), slow plugin open (every add), sluggishness (constant), panels not collapsible (every "I need canvas" moment). Front-load the changes the owner *feels* within seconds of launching.
2. **Risk isolation.** Exactly one item is MED-HIGH (async plugin load + RT-safe node swap). Everything else is LOW–MED. The sequencing must quarantine the risky slice so a regression there can't block the dozen safe wins.
3. **Dependency truth.** Some items unlock others: the async-load completion signal (#1) is the *correct* fix for the editor backoff (#1c) and is shared by the slow-editor-open bug. The left-panel name-match is a host-side single-emit-point fix that the inspector redesign depends on. Sequence by these real edges, not by feature grouping.

### Viable Options for OVERALL sequencing strategy

**Option A — "Contract-first, then Lean & Fast, redesign, async-load last" (RECOMMENDED).**
`Phase 0 (no-code CONTRACT spec: loading-node + collapse-tier) → Phase 1 (LOW-risk lean+fast wins) → Phase 2 (canvas UX: cursor/no-overlap/multi-cable/collapse-tier; incl. Task 2.0 collapse-tier state contract) → Phase 3 (left+right panel redesign lane) → Phase 4 (MED-HIGH async plugin load + editor, OWN branch, merged last) → Phase 5 (matrix/nested polish)`.
- **Pros:** Owner feels improvement within the first shippable increment (Phase 1 is mostly one-liners + dedupe gates). The one risky slice (Phase 4) is last + on its own branch, so it can be held/reverted without entangling the felt wins. Phase 0's written contract lets Phases 2/3 build against the *final* snapshot shape (no rework when Phase 4 lands). Matches the perf-diag's own "suggested order" and the left-panel brief's own A–F phasing.
- **Cons:** The headline complaint ("opening a plugin is very slow") lands late. Mitigated by shipping the *cheap* editor wins early (tighten backoff `[0,150,400,800,1500]→[0,80,160,320,640]`, async editor-construct via `callAsync`) in Phase 1, so perceived open-speed improves well before the full async-load slice.
- **Parallelism (corrected — critic CRITICAL-3):** Phase 3 is **file-parallel with Phase 4's *implementation*** (disjoint files), but BOTH build against the Phase 0 contract, AND **Task 3.E depends on Task 2.0/2.4** (the inspector pin-to-face surfaces params on the Macro tier that only exists once 2.0/2.4 land). So Phase 3 is *not* free-standing — it is contract-coupled to Phase 4 and substrate-coupled to Phase 2. Concurrency is real for the file edits, not for the contract.

**Option B — "Headline-first: async plugin load up front."**
Do Phase 4 (async load) immediately after the splice/D1 carry-over, then the rest.
- **Pros:** Kills the single loudest complaint first.
- **Cons:** Front-loads the highest-risk, highest-effort, RT-sensitive change before any momentum or fast feedback loop; a regression there stalls the whole wave on day one. The node-swap touches the snapshot contract + undo + nodeId resolution — exactly the surface that, if broken, makes *every* other task hard to verify (you can't trust the canvas). Violates Driver 2 (risk isolation).

**Option C — "Redesign-first: panels + block density before any perf/bug work."**
- **Pros:** Biggest *visible* change; aligns with the "not fit for purpose" framing.
- **Cons:** The redesign sits *on top of* the name-match host fix and the collapse-tier substrate; doing it first means rework. It also leaves the daily-felt cursor/perf/multi-cable bugs unfixed longest, and those are cheaper and more universally felt. Violates Driver 1.

**Recommendation: Option A.** It satisfies all three drivers: fastest felt impact (Phase 1–2), strict risk isolation (Phase 4 last + on its own branch), and respects the real dependency edges (Phase 0 contract before its consumers; name-match before inspector; async-completion-signal before editor backoff removal). B and C are *not invalid* but are dominated: B fails risk-isolation, C fails felt-impact-first and incurs rework. Phase 3's *file edits* are concurrent with Phase 4's implementation, but the lanes are contract-coupled (Phase 0) and Task 3.E is substrate-coupled to Task 2.0/2.4 — staff accordingly (see the HOST-FILE SERIALISATION RULE in Phase 1 + pre-mortem §2 Failure-3).

### Branch strategy recommendation
**Carry Phases 0–3 on `wave-3-leanfast-ux`; put Phase 4 (the RT-sensitive async-load slice) on its OWN branch off the tip, merged last** (architect S4 / amendment #5). Rationale:
- `wave-3-leanfast-ux` is already cut off `wave-2-block-faces @ 06c61158` (the shipped W2 base), and `9e0d4f62` (atomic cable-splice) is already committed onto this lineage — keep the webview lineage here.
- **Phase 4 on its own branch** honours Driver 2 (risk isolation) better than one long-lived branch: the one slice that can regress audio can be held/reverted without entangling the dozen webview-only felt wins. The git-orphan counter-argument is weak — `9e0d4f62` is a normal ancestor (verified `git merge-base --is-ancestor` = YES) and trivially cherry-picked if a re-cut is ever wanted.
- **Action item — FIRST action of the wave:** commit the **uncommitted D1 change** (`GraphCanvas.tsx`: `panOnDrag={isEdit ? [1, 2] : true}` + `panActivationKeyCode="Space"`, 7-line diff, verified present at `GraphCanvas.tsx:1296,1302,1303,1304`) as Task 2.1 so it's captured + TDD-gated rather than floating. It is exposed to the live concurrent-agent contention (two `.claude/worktrees/agent-*` dirs present now — see MAJOR-6).
- PRs target **`local-enhancements`** (the true baseline; "+N vs main" counts are misleading per project memory). Stacked PRs *per phase* keep review tractable.

---

## 1. PHASED PLAN

Legend: **Risk** = LOW/MED/HIGH. Each task is independently shippable unless a dependency is named.
Verification baseline for ALL tasks: `npx tsc -b` clean · relevant vitest green · Storybook `run-story-tests` green for touched components · ctest unaffected (or green) · build + **force-bundle all 8 products + reinstall** before any "done" claim · the 2 guards + painter vitests stay green.

### CARRY-OVER (already on branch, finalize)
- **Splice undo** — `9e0d4f62` committed (`SpliceConnectionMessage`, `src/messages.cpp:209`, host emit `src/ui/element_webview_host.cpp:2473–2493`, JS `webview/src/lib/cableSplice.ts`). Done; no action beyond regression-guarding it stays green.
- **D1 cursor select-primary** — UNCOMMITTED in `GraphCanvas.tsx`. → becomes **Task 2.1** (the FIRST committed action of the wave).

### HOST-FILE SERIALISATION RULE (applies across all phases — critic MAJOR-6)
`src/ui/element_webview_host.cpp` (6000+ lines) is touched by **FIVE** tasks across three phases: **1.2** (push dedupe + listener narrowing), **1.3** (plugin-list memo), **3.A** (name single-emit), **4.1** (loading-face snapshot), **4.2** (editor ready-push). This is the single highest-contention file in the wave; the "disjoint files" framing for Phase 3 ‖ Phase 4 hides it. **Rule:** ALL `element_webview_host.cpp` edits are serialized to **ONE actor**. Land the host-side Phase-1/3.A edits (1.2 / 1.3 / 3.A) as one serialized sub-lane **before** forking Phase 3 ‖ Phase 4. Two `.claude/worktrees/agent-*` dirs are live right now + the D1 diff is uncommitted — the contention trap (Pre-mortem Failure-3) is present, not hypothetical.

---

### PHASE 0 — Contract spec (NO CODE; lands before Phase 1) — critic CRITICAL-2/3, architect S1/S3
*One short written spec doc, no implementation. Stabilises the two cross-cutting schema surfaces so Phases 2/3 build against the FINAL shape and don't get re-coded when Phase 4 lands. Cheap insurance, not code.*

#### Task 0.1 — Loading-node snapshot contract
- **What+why:** Phase 4 introduces a transient node lifecycle state ("loading") that does not exist today (grep: zero `loadState`/`loading` hits in `types.ts` or the host snapshot). Every snapshot consumer (Block render 2.4, name guard 3.A, inspector routing 3.E, multi-cable 2.2) must tolerate it. A brand-new async-loaded plugin has **NO saved port layout** — `PlaceholderProcessor::setupFor` derives ports from *saved* node data (`src/nodes/placeholder.hpp:43`), which a live-added plugin lacks until `createPluginInstance` returns + `enableAllBuses()` runs.
- **The spec MUST answer (decisions, not code):**
  - (a) **Cable-targetable while loading?** RECOMMEND **NO — disable the loading node's handles until `loadState==='ready'`.** This sidesteps the port-remap problem (CRITICAL-2) AND the lossy connection-retention problem (MAJOR-4) entirely — if you can't connect to a loading node, there are no cables to re-bind on ready.
  - (b) **Loading face:** name + an honest "loading…" indicator, **ZERO meters, ZERO fake ports** (Principle 3 nothing-fake). No port stubs that aren't real engine ports.
  - (c) **On-ready population:** how real ports/params populate into the existing ValueTree, and that this re-triggers the op-republish (see Task 4.1 step 3).
  - (d) **Name while loading** (ties to 3.A): what `block.name` a loading node carries (recommend: the catalog `PluginDescription.name` from the add request, so the name guard holds even mid-load).
  - (e) **Collapsibility while loading** (ties to 2.4): a loading node renders at a sensible tier (recommend: Title-only, name + loading indicator).
- **New snapshot field:** `loadState?: 'loading' | 'ready'` (net-new; none exists today). Default/absent ⇒ `'ready'` for back-compat with all existing nodes.
- **Acceptance (spec):** the doc unambiguously states the cable-targetability rule, the face contents, the on-ready population path, the loading name, and the loading tier. Engine-truth test named for Task 4.1: a loading node exposes **no connectable ports** until `loadState==='ready'`.

#### Task 0.2 — Collapse-tier ValueTree contract (the dual-sided migration spec)
- **What+why:** Widening `collapsed: boolean → collapseTier` is a **dual-sided persisted-state schema change**, NOT a JS enum widening (architect P4 / critic ✓): the host READS `collapsed` into the snapshot (`element_webview_host.cpp:6450`), the bridge `elementNodeSetCollapsed` WRITES a bool (`element_webview_host.cpp:2904`; JS `nativeGraph.ts`), and existing `.els` files on disk carry the old boolean.
- **The spec MUST answer:** the `collapseTier` enum + its ValueTree key; the **dual-sided** migration (host read path + JS read path BOTH coerce legacy `collapsed=true→'title'`, `false→'expanded'`/chosen default); the bridge-signature change (`setCollapsed(bool)` → tier-aware); and the **on-disk `.els` back-compat** decision — does a new `tier` serialize to something an OLD build can still open, or is this a forward-incompatible bump (a decision to surface, NOT silently assume)?
- **Acceptance (spec):** the migration is specified on BOTH read paths + the bridge + on-disk round-trip; reviewed ONCE here. Implemented as **Task 2.0** (state contract) landing before BOTH Task 2.4 (render) and Task 3.E (pin-to-face).

---

### PHASE 1 — Lean & Fast NOW (LOW-risk wins, no UX behaviour change)
*Felt-impact + cheap. These are the perf-diag's low-risk ranked items + the cheap editor wins. Ship as one or two small PRs. Owner feels "snappier" immediately. Driver 1.*

#### Task 1.1 — Spectrum poll 30→15 Hz
- **What+why:** Owner feedback #4 (sluggish). Spectrum strip still polls at 33 ms; the documented 15 Hz cut was never applied (perf-diag #4). Halves the spectrum bridge+serialise+decode cost whenever an audiofx Block with a spectrum strip is visible.
- **Key files:** `webview/src/hooks/useNodeSpectrum.ts:11` (`POLL_INTERVAL_MS = 33` → `66`). v2 base64 payload + decode already in place (`nativeNodeSpectrum.ts:100–104`).
- **Approach:** one-line constant change; update `useNodeSpectrum.test` if it asserts cadence.
- **Risk:** VERY LOW. (15 Hz reads fine for a spectrum strip — architect ruling.)
- **Test/verify:** vitest `useNodeSpectrum.test` (assert new cadence); NOTHING-fake intact (still real FFT). No visible regression in the Block spectrum story.
- **Acceptance:** poll interval is 66 ms; spectrum still renders real bins; test green.

#### Task 1.2 — Listener-narrowing (the window-drag fix) + graph-push dedupe (general churn)
- **What+why:** Owner feedback #4 (sluggish "even when nothing changes") + Bug 3 (window-drag lag). Two DISTINCT mechanisms, NOT one (architect/critic MAJOR-5):
  - **Listener-narrowing = the actual window-drag fix.** Window drags write `windowX/windowY` every `moved()` frame; today the under-root branch (`vtIsUnderSessionRoot`, `element_webview_host.cpp:6022`) pushes on ANY prop — it does NOT inspect `prop` at all. Adding a `prop`-based ignore set there is what prevents the push being *scheduled*, killing the lag at source.
  - **Output-dedupe = general-churn mitigation only.** It skips the IPC + WKWebView parse for byte-identical payloads, but the **build still runs** (incl. the Task 1.3 O(N·types) scan). So output-dedupe alone does NOT fix the window-drag case — **Task 1.3 must co-land** to cheapen any push that *does* fire.
- **Key files:**
  - Listener-narrowing: `src/ui/element_webview_host.cpp:6022` (the `vtIsUnderSessionRoot` branch of `valueTreePropertyChanged`). Add a `prop`-based ignore set for `tags::windowX/windowY/windowVisible/windowOnTop`. **Apply ONLY on the under-root branch** — do **NOT** touch `shouldIgnoreSessionRootProperty` (`:6003`/`:6005`), which filters the ROOT tree (everything except `tempo`/`name`); conflating the two filters would drop legitimate root pushes. MUST keep `tags::x`/`tags::y` (block position) pushing — window-chrome and block-position props can live on the **same** node child tree, so the filter is by *identifier*.
  - Dedupe: `src/ui/element_webview_host.cpp:6119–6135` (`pushGraphSnapshot` → cache last `buildActiveGraphJson()` string per host; skip `evalInBrowser` if byte-identical). Mirror the proven `sentinelcache`/`meterlanegate::changed` pattern.
- **Approach:** (a) add the under-root identifier ignore set; (b) string-cache + equality short-circuit in `pushGraphSnapshot`; co-land Task 1.3.
- **Risk:** LOW-MED. Dedupe is safe (same value ⇒ same UI). The narrowing must NOT drop block-position props (filter by identifier).
- **Test/verify:** **C++ host test** that writes `windowX` AND `tags::x` on the **SAME node ValueTree** and asserts **exactly one** (the block-`x`) schedules a push (critic MAJOR-5 — pin it on one node tree, not two different trees). Plus: two identical builds → one `evalInBrowser`; the ignore-filter does not extend to `shouldIgnoreSessionRootProperty`. Live-confirm (separate actor) window drag no longer lags.
- **Acceptance:** window drag does not schedule graph pushes; identical-payload pushes are skipped; block move on the same tree still pushes; root-tree pushes unaffected.

#### Task 1.3 — Plugin-list lookup memoisation (O(N·types) → O(1))
- **What+why:** Owner feedback #4. `buildActiveGraphJson` calls `findKnownPluginByIdentifier` per-node-per-push, each doing a full KnownPluginList scan with a `String` alloc per comparison (perf-diag #3). Scales with installed-plugin count × board size — i.e. Element's exact target user (big library).
- **Key files:** `src/ui/element_webview_host.cpp:6407–6414` (per-node category lookup), helper `:160–167`.
- **Approach:** build `std::unordered_map<String, const PluginDescription*>` once, cached, invalidated on the KnownPluginList change broadcaster. O(1) lookup in the node loop. (Alt: cache resolved `category` on the node ValueTree at add-time.)
- **Risk:** LOW (pure memoisation; invalidate on list change).
- **Test/verify:** host test — lookup returns the same category as the linear scan for a fixture list; cache invalidates on list-changed. Micro-bench optional.
- **Acceptance:** no per-push linear scan; category strings unchanged vs baseline.

#### Task 1.4 — `usePeakHold` rAF idle-stop
- **What+why:** Owner feedback #4. The Cable-inspector peak-hold rAF loop runs 60 Hz for the life of every open Cable inspector even at silence (perf-diag #5). One idle 60 Hz loop + setState churn per open tab.
- **Key files:** `webview/src/components/layout/InspectorHub.tsx:1071–1089` (used `:1458`).
- **Approach:** early-out in `tick`: if `live === 0 && peakRef.current === 0`, do NOT re-queue; re-arm via a store subscription edge on first non-zero level. Mirror `useBlockNodeLevelBallistic.ts`'s `stopIfIdle`.
- **Risk:** MED — must re-arm correctly or the peak meter stalls on next signal.
- **Test/verify:** extend the InspectorHub peakhold test — "idle stops the rAF; a non-zero push re-arms it." (This is the pre-mortem's correctness gate — see §2.)
- **Acceptance:** rAF stops at decayed silence; a new signal re-arms and the meter tracks it.

#### Task 1.5 — Cheap editor-open latency win (interim, before async-load)
- **What+why:** Bug 3 (slow open) — perceived-snappiness down-payment that does NOT depend on the Phase 4 async-load. Tighten the editor-open backoff and make editor construction async on the message loop.
- **Key files:**
  - `webview/src/bridge/nativePluginEditor.ts:13` — `PLUGIN_EDITOR_OPEN_DELAYS_MS = [0,150,400,800,1500]` → `[0,80,160,320,640]` (halves worst-case perceived lag; no protocol change). **TAG the array + its vitest `// INTERIM: removed by Task 4.2 ready-push`** (architect #7) so the Phase-4 deletion is unambiguous and nobody "optimizes" the interim further.
  - `src/ui/element_webview_host.cpp:5670` (`pluginEmbedEditor = createPluginEditorPanel(...)`) — wrap the heavy `createEditorIfNeeded()` build in `MessageManager::callAsync` so the click handler returns instantly and the chrome shows first; re-resolve the node by **UUID** in the deferred lambda (the path already re-resolves via `findNodeByUuidInGraph`, `:279`). Preserve CF1 teardown ordering (`setAccessible(false)` first).
- **Approach:** two independent sub-edits; both message-thread-only UI.
- **Risk:** LOW (backoff) / MED (async construct — guard node-deleted-between-gesture-and-build with a WeakReference/uuid re-lookup).
- **Test/verify:** vitest for the new delay array; live-confirm (separate actor) the editor chrome appears instantly and the heavy editor fills in. Instrument `createEditorIfNeeded()` timing (`Time::getMillisecondCounter()`) to log the dominant cost.
- **Acceptance:** editor chrome is visible within one frame of the gesture; worst-case backoff ~1.28 s (was 2.9 s); no UI freeze during construct.
- **Dependency note:** the *full* fix (replace blind backoff with a host ready-push) lands in Phase 4 (Task 4.2) once async-load gives a real completion signal.

---

### PHASE 2 — Canvas interaction & integrity (LOW–MED, daily-felt)
*The cursor model, no-overlap, multi-cable, and the collapse-tier substrate. Highest felt-impact-per-effort (research TOP-10 #1, #2, #4). Driver 1. Sequence: 2.1 (commit D1) → 2.2 → 2.3 in any order; **2.0 → 2.4** ordered (2.0 is the state-contract pre-req for 2.4 AND for 3.E).*

#### Task 2.0 — Collapse-tier STATE CONTRACT (dual-sided migration) — pre-req for BOTH 2.4 and 3.E
- **What+why:** Implements the Phase-0 Task 0.2 spec. This is the **dual-sided persisted-state schema change** extracted from 2.4 (architect S3 / critic CRITICAL-3) so the migration is reviewed ONCE and lands before both the render (2.4) and the inspector pin-to-face (3.E) consume it. `collapsed: boolean → collapseTier` crosses the C++/JS boundary AND existing `.els` files.
- **Key files:** `webview/src/data/types.ts:62` (`collapsed?: boolean` → `collapseTier?: 'title'|'macro'|'expanded'`); `webview/src/stores/useGraphStore.ts:256,600` (`setCollapsed(bool)` → `setCollapseTier`); the bridge `elementNodeSetCollapsed` (host write `element_webview_host.cpp:2904`, JS `nativeGraph.ts`) → tier-aware signature; **the HOST read path** `element_webview_host.cpp:6450` (reads `collapsed` into the snapshot) → reads/emits the tier. **Dual-sided migration:** BOTH the host read (`:6450`) AND the JS read coerce legacy `collapsed=true→'title'`, `false→'expanded'`/chosen default; on-disk `.els` back-compat per the 0.2 decision.
- **Approach:** widen the enum + bridge signature + BOTH read paths + the store action; no Block render change here (that's 2.4). Host edit → the single host-file actor (MAJOR-6).
- **Risk:** MED (dual-sided persisted contract; same risk class as the Phase-4 snapshot change — hence reviewed once, up front). Migration must not corrupt existing `.els`.
- **Test/verify:** vitest the JS-side migration (legacy boolean → tier); **C++ host test** the host read-path migration (a `.els`/ValueTree with legacy `collapsed=true` → snapshot emits `tier='title'`); round-trip test (old `.els` opens; new tier serialises per the 0.2 back-compat decision).
- **Acceptance:** the tier enum + ValueTree key + bridge + BOTH read paths + on-disk round-trip are settled and green; 2.4 and 3.E build against this.

#### Task 2.1 — Commit + TDD-gate the D1 select-primary cursor (carry-over)
- **What+why:** Owner feedback #6(4) — default cursor must be SELECT; grab only on a held modifier. Already applied (uncommitted): `panOnDrag={isEdit ? [1,2] : true}` (left=select via existing `selectionOnDrag`, middle/right=pan), `panActivationKeyCode="Space"`. `selectionMode={SelectionMode.Partial}` already present.
- **Key files:** `webview/src/components/canvas/GraphCanvas.tsx:1294` region (the diff is in the working tree).
- **Approach:** commit as the first Phase-2 task; add the regression guards the research demands (xyflow #5563 gotcha): an interaction/vitest test that **right-click→QuickAdd still fires** and **double-click-empty-canvas→navigate-up still fires** under `selectionOnDrag` + `panOnDrag={[1,2]}`; and that **Shift+click / Shift+marquee are additive** (not replace) — owner's prior QA flagged shift+click wasn't additive.
- **Risk:** LOW (native RF props) — but the gotcha is real, hence the guard tests.
- **Test/verify:** GraphCanvas interaction test(s) for: marquee on left-drag; pan on Space+drag and middle/right-drag; RC QuickAdd fires; dbl-click-canvas up-navigates; Shift additive. Live feel-test (owner) is the final sign-off.
- **Acceptance:** left-drag marquees, doesn't pan; pan works on Space/middle/right; the 3 guarded gestures still fire; multi-select is additive.

#### Task 2.2 — Multi-cable fan-out: LIVE REPRO then targeted fix
- **What+why:** Owner feedback #2 (BUG: cannot draw multiple cables out of one output port). 6 causes already ruled out (handle caps, edge-id collision, snapshot dedup, onConnect-replace, reconnect config, engine guard — fan-out IS allowed). The `onConnect` handler (`GraphCanvas.tsx:903`) is confirmed clean (no replace/dedup; just `nativeGraphConnect`); `onConnectEnd` returns early on `isValid===true`. Remaining suspect = a React Flow **live-drag nuance**.
- **Key files:** `webview/src/components/canvas/GraphCanvas.tsx:903` (`onConnect`), `:930` (`onConnectStart`), `:960` (`onConnectEnd`), `:1289–1291` (handlers wiring), `:1294` (interaction props).
- **Approach (repro-first, NOT blind):**
  1. **60-second live repro** (separate actor, serialized app use): start a cable from an already-connected output port; observe whether RF (a) refuses the second drag, (b) starts it but drops it, or (c) connects but the snapshot replaces. Capture console + the connection-state.
  2. **Specific hypothesis to test first:** the new `panOnDrag={[1,2]}` (D1) changes mouse-button handling — confirm a *left*-button drag from a port still initiates a connection (not a pan) when the port already has a cable. Also test `connectionMode` (Strict vs Loose) and whether `selectionOnDrag` swallows the second connect-start (xyflow #5563 class). 
  3. Fix the pinned cause only (likely a RF prop combination or a connect-start guard), then add a regression test.
- **Risk:** MED until repro pins it; LOW fix once pinned. Do NOT ship a blind fix.
- **Test/verify:** an interaction test that drags a 2nd and 3rd cable from one output to two targets and asserts 3 edges + 3 engine connects (`nativeGraphConnect` called thrice). Live-confirm the gesture.
- **Acceptance:** one output port visibly fans out to ≥2 inputs; engine receives every connect; regression test green.

#### Task 2.3 — Blocks must NEVER overlap (collision-resolve on drag-stop + auto-place)
- **What+why:** Owner feedback #1 (blocks overlap by default) + the spawn-position defect. Research §G / TOP-10 #4.
- **Key files:** `webview/src/components/canvas/GraphCanvas.tsx` (`onNodeDragStop`; spawn/add path), plus the existing "Tidy"/ELK layout hook (Tidy is ON-default per W2). Add a `resolveCollisions` util + a rectangular collide helper (RF's `collision.js` pattern — Blocks are rectangles at multiple collapse-tier heights, so do NOT use raw circular `forceCollide`).
- **Approach:** (a) run `resolveCollisions(nodes, {margin:15, overlapThreshold:0.5})` on **`onNodeDragStop` (one-shot)**, NOT `onNodeDrag` (per-tick) — a per-tick resolve is both a perf regression (Principle 1) and would fight ELK; (b) optional live red micro-glow during drag via `getIntersectingNodes(node, true)` (reuse the existing 4px glow primitive — painter-safe **class toggle keyed on the intersection-SET *change***, NOT a per-frame recompute or per-tick inline shadow); (c) auto-place new Blocks at cursor/output-of-selection then one resolve pass (fixes spawn-position). Keep ELK "Tidy" as the global guarantee.
- **Risk:** LOW-MED. Must not fight ELK Tidy (resolve is the per-drag layer; ELK is the structural layer). Glow must be a class toggle, not inline blur (painter guard).
- **Test/verify:** vitest for `resolveCollisions` (two overlapping rects → separated by ≥margin); interaction test (drop a node on another → it relocates). **Assert `resolveCollisions` runs on drag-STOP (one-shot), not per-tick drag** (architect P3). `Block.gaps.test`/`Cable.painter.test` stay green (no per-tick shadow; glow is intersection-change-keyed). Live-confirm no overlap on add and on drop.
- **Acceptance:** dropping a Block on another never leaves them overlapping (≥15px gutter); new Blocks spawn non-overlapping; painter guards green.

#### Task 2.4 — Render three collapse tiers per Block (consumes Task 2.0)
- **What+why:** Owner feedback #6(4) "blocks have wasted space — optimise" + research TOP-10 #2. Render the 3-state tier from Task 2.0: **Title-only / Macro-row (lean default) / Expanded** (Bitwig/Vital/Serum model). Double-click title cycles.
- **Depends on:** Task 2.0 (the state contract) — sequence 2.0 → 2.4.
- **Key files:** `webview/src/components/canvas/Block.tsx` (render 3 tiers + collapsed-socket rule). **Adopt Blender's collapsed-socket rule** (research §B): when collapsed to Title-only, do NOT drop cables — route them into the node edge / a port stub so topology survives collapse. A **loading** node (Phase 0 Task 0.1) renders at Title-only (name + loading indicator).
- **Approach:** Block render + double-click-title cycle; default tier = Macro-row. Coordinate with the param-substrate spike (W3 "next" = built-in faces / mechanism (ii) lock-free atomic bridge) for *what* the Macro row shows — the tier render ships independently of live param control.
- **Risk:** MED (Block render + the collapsed-socket cable routing).
- **Test/verify:** store action test; Block stories at all 3 tiers + a loading-node story; **collapsed-socket test that asserts the ENGINE connection survives** (architect P4-socket — not just the React edge: a visual stub hiding a severed `Arc` would be a Principle-3 nothing-fake violation). a11y on the tier toggle.
- **Acceptance:** Blocks render at 3 tiers; double-click-title cycles; tier persists across reload (via 2.0); collapsing never orphans cables AND the engine connection is intact.

---

### PHASE 3 — Left + Right panel redesign (own lane; LOW–MED; FILE-parallel with Phase 4's implementation, contract-coupled)
*Folds in the left-panel brief's phases A–F verbatim. Owner feedback #5 (left panel not fit for purpose), #6(1) (name mismatch), #8 (BOTH panels collapsible). Webview-only except the one host name-emit fix (3.A — serialised to the host-file actor per the MAJOR-6 rule).*
> **Parallelism (corrected — critic CRITICAL-3):** Phase 3's *file edits* are concurrent with Phase 4's *implementation*, but (1) both build against the **Phase 0 contract** (3.A's name guard + 3.E's selection-routing must tolerate a `loading` node), and (2) **Task 3.E depends on Task 2.0/2.4** (pin-to-face surfaces params on the Macro tier). Sequence 2.0 → 2.4 → 3.E; do NOT "finish" 3.A/3.E before the Phase-0 contract is written, or the name guard goes flaky and 3.E gets re-coded when Phase 4 lands.

> Source of truth for this lane: `.omo/bakeoff/briefs/left-panel-redesign-2026-06-08.md` §6 (phases A–F). Component props MUST be verified via Storybook MCP `get-documentation` before wiring (do not invent props).

#### Task 3.A — Name coherence (host single-emit-point) [brief Phase A]
- **What+why:** Owner feedback #6(1) — inspector/canvas plugin names don't match. It's a **data-pipeline bug**: browser reads catalog `BrowserPlugin.name`; canvas/inspector read placed `block.name`. They can diverge at insertion if the host emits the node `name` from a different field than the browser.
- **Key files:** the **host C++ graph-snapshot serialiser** `name` emit point (the function feeding `mapBlock` in `webview/src/hooks/useJuceBridge.ts:249`, `name: b.name`); apply the name-not-description (N1) rule there — prefer `PluginDescription.name`, NEVER `descriptiveName`. **First VERIFY the name is emitted from exactly ONE serializer function** before claiming "single-emit-point" (architect P5 / open question #3): `findKnownPluginByIdentifier` is called at host `:1981`, `:2050`, `:6407` — confirm the *name* (not just category) flows through one function, else the fix leaks. Serialise this edit to the host-file actor (MAJOR-6). Webview side: audit inspector/canvas/tab-strip read `block.name` only (`InspectorHub.tsx:398–401` already does); add a muted "Renamed from: …" line when `block.name` ≠ catalog name.
- **Loading-node name (Phase 0 Task 0.1d):** a loading node carries the catalog `PluginDescription.name` from the add request, so the guard holds mid-load.
- **Risk:** LOW-MED (host serialiser change; must match the existing browser rule exactly; verify single-emit first).
- **Test/verify:** **the mechanical guard** (research §E item 4 / brief): a Storybook interaction test asserting `InspectorHub` header text === canvas `Block` title text for the same selected node id, **for a `ready` node** (and separately define/assert the loading-node name per 0.1d, so the guard doesn't flake once Phase 4 lands — architect P5 note). Story: a renamed node + a catalog-named node.
- **Acceptance:** insertion-time name matches across browser/canvas/inspector; the name emit point is verified singular; rename surfaces "Renamed from:"; guard test green and loading-node-name-aware.

#### Task 3.B — Persist + unify collapse rails [brief Phase B]
- **What+why:** Owner feedback #8 (collapsible). Today: `partialize: () => ({})` (`useAppStore.ts:225`) persists nothing; TWO inconsistent collapsed rails (`AppShell.CollapsedRail` blank 36px pill at `AppShell.tsx:95` vs `ToolPalette`'s 40px icon rail). 
- **Key files:** `webview/src/stores/useAppStore.ts:225` (`partialize` → persist `{leftPanelOpen, rightPanelOpen, bottomPanelOpen, leftWidth, rightWidth, inspectorUserCollapsed}`; keep the legacy `mode` merge); new `webview/src/components/layout/PanelRail.tsx` (the unified 40px icon rail used by BOTH panels); delete `AppShell.CollapsedRail` blank pill; `AppShell.tsx:31–34` widths → state.
- **Risk:** LOW.
- **Test/verify:** story toggling each panel; reload-persistence test (set collapsed → re-mount store → assert collapsed); a11y rail buttons have `aria-label`.
- **Acceptance:** collapse hides content but leaves a one-click icon rail (VS Code Activity Bar pattern); panel state survives reload.

#### Task 3.C — Keyboard (independent toggles + hide-all) + search focus [brief Phase C]
- **What+why:** Owner feedback #8. Add `Cmd+\` (left), `Cmd+Opt+\` (right), `Cmd+.` (hide ALL → full-bleed canvas, restore on repeat). Keep existing Cmd+1/2/3. Replace the brittle `Cmd+F` DOM-query search focus (`useKeyboard.ts:249`) with a store nonce.
- **Key files:** `webview/src/hooks/useKeyboard.ts` (add bindings; verify `Cmd+.` doesn't collide with a JUCE host binding — §7 decision), `webview/src/stores/useAppStore.ts` (`focusBrowserSearch` nonce, `hideAllPanels()`/`restorePanels()`).
- **Risk:** LOW (verify `Cmd+.` no collision).
- **Test/verify:** `useKeyboard` interaction test — `Cmd+.` hides all + restores prior state; `Cmd+1`/`Cmd+L` opens browser AND focuses search (assert `document.activeElement` is the search input).
- **Acceptance:** independent per-panel toggles + a hide-all escape hatch; search focus is store-driven, testable.

#### Task 3.D — Browser IA re-rank (search-first) [brief Phase D]
- **What+why:** Owner feedback #5. Re-rank IA: search FIRST (full-width, auto-focused), Favourites/Recents → **filter chips** (not stacked above-the-fold sections), single scroll region (kill the nested `overflow-y-auto`), Snippets/Boards → footer disclosure. Avoid Bitwig-5 over-faceting. Confirms the standing notes: VST3-primary dedupe **already exists** (`usePaletteFilters`/`usePluginBrowserStore`) — do NOT rebuild; make hidden AU a "(also AU)" reveal. QuickAdd over-truncation + slow search were W1 (rebuilt two-pane, 12.8→2.7 ms) — keep.
- **Key files:** `webview/src/components/layout/ToolPalette.tsx` + `…/palette/{PluginList,PluginCard,CategoryChips,PaletteSearch,usePaletteFilters,FavouritesSection,RecentsSection,MoleculesSection,BoardsSection}.tsx`; new `palette/FacetChips` (or fold into `CategoryChips`).
- **Risk:** LOW-MED (don't regress group-favourites; don't break virtualization).
- **Test/verify:** `ToolPalette` story (Synthetic1000 plugins) — search input is first focusable in the body; virtualized list is the dominant region; `usePaletteFilters` unit test — star an AU → family stays favourited (group-favourites not regressed); virtualization mounts only visible rows (`data-testid="plugin-list-virtual"`).
- **Acceptance:** search-first IA; one scroll region; facets are chips; dedupe + favourites + virtualization unregressed.

#### Task 3.E — Selection-driven inspector + per-param pin-to-face [brief Phase E]
- **What+why:** Owner feedback #5. Replace the top `Block|Bus|Cable|Health` **tab bar** with **selection-routing** (selection TYPE drives the panel; keep within-block `Params/I/O/Notes` sub-nav). Add the `📌` per-param "pin to Block face" toggle wired to the existing-but-unused `BlockData.userHiddenParams` substrate (inverted: pinned = surfaced on the Macro tier). Selection-driven auto-collapse-to-rail when nothing selected (Figma model; track `inspectorUserCollapsed` so it never fights an explicit user collapse).
- **Depends on:** Task 2.0 (collapse-tier state contract) + Task 2.4 (the Macro tier render) — the pin-to-face has nowhere to surface a param until the Macro tier exists. Sequence 2.0 → 2.4 → 3.E (critic CRITICAL-3). Also must tolerate a **loading** node (Phase 0): selection-routing renders a sensible state for a node whose processor is still a placeholder (no params yet).
- **Key files:** `webview/src/components/layout/InspectorHub.tsx` (+ `BusInspector.tsx`, `LiveHealth.tsx`); new `inspector/PinToFaceToggle.tsx` (thin wrapper over `NeuToggle` + `userHiddenParams` write); `webview/src/data/types.ts:49` (`userHiddenParams` already present). Pinned params surface on the Block Macro tier from Task 2.4.
- **Risk:** MED (re-wires the inspector's top-level navigation + couples to the collapse-tier Macro row + the loading-node state).
- **Test/verify:** interaction test — select Block → block view; select Cable → signal monitor; select loading node → loading state (no fake params); deselect → rail. Pin a param → it appears in the Block's pinned set + on the Block-face story. a11y on the toggle.
- **Acceptance:** inspector follows selection (no tab-click cost); pinned params appear on the Block Macro face; loading node shows an honest state; empty selection collapses to rail (unless user-pinned to Health, §7 decision).

#### Task 3.F — Drag-to-resize + snap-collapse (polish) [brief Phase F]
- **What+why:** Owner feedback #8. Drag panel edges to resize; dragging narrower than ~120px snaps to the icon rail (tldraw/Figma). Widths become persisted state (Task 3.B).
- **Key files:** `AppShell.tsx` (resize handle; update width on `pointermove` via CSS var / direct style write — NO React state per move; commit to store on `pointerup`).
- **Risk:** LOW (painter/perf rule: no render-per-pointermove).
- **Test/verify:** story with resize handle; width commits on `pointerup`; **assert no React render per `pointermove`** (perf guard). 
- **Acceptance:** panels resize fluidly; snap-collapse under threshold; no render storm during drag.

> **§7 open decisions from the brief to surface to owner:** (1) empty inspector = max-canvas rail OR always-visible engine Health (recommend: rail by default + a pin to keep Health); (2) Favourites/Recents chips vs stacked (recommend chips); (3) confirm `Cmd+.` no host collision; (4) per-app vs per-project panel persistence (recommend per-app now). These are NOT blockers for Phase 1–2.

---

### PHASE 4 — Async plugin load + real editor surface (MED-HIGH, OWN BRANCH, merged last)
*The headline "opening a plugin is very slow" + "window cannot be moved." Highest risk + RT-sensitive — quarantined on its OWN branch (merged last) so it can be held/reverted without entangling the felt wins. Driver 2. Builds against the Phase 0 contract.*

#### Task 4.1 — Async plugin instantiation + placeholder node + UUID-preserving in-place swap
- **What+why:** Owner feedback #3 (slow open) + #4 (sluggish). Plugin instantiation is fully synchronous on the message thread (`pluginmanager.cpp:1078` `createAudioPlugin` → JUCE **blocking** overload; `createPluginInstanceAsync` used nowhere), freezing the whole UI for hundreds of ms–seconds on heavy plugins (perf-diag #1).
- **⚠️ IDENTITY CONTRACT (critic CRITICAL-1 — corrects the prior plan AND the architect):** the webview keys every Block by the persistent ValueTree **UUID** (`element_webview_host.cpp:506` emits `nodeId: node.getUuidString()`; resolves via `findNodeByUuidInGraph`, `:279`). The engine integer `nodeId` is a **separate, transient** id. The thing that MUST survive the placeholder→real swap is the **UUID** — engine `nodeId` may change freely. The prior plan's "preserve the assigned `nodeId`" and the architect's "reuse nodeId" both name the WRONG identifier.
- **⚠️ DO NOT reuse `EngineService::replace` / `ReplaceNodeMessage`** (`engineservice.cpp:1490`, wired from webview at `element_webview_host.cpp:2404`). It is prior art an executor WILL find, and it is the **anti-pattern** here: it does add-new → rewire → remove-old, and the desc-overload `ctl->addNode(&desc,…)` (`graphmanager.cpp:438`) builds a fresh `ValueTree(types::Node)` that does NOT carry `tags::uuid` → a **new** UUID is minted (`node.cpp:278`). Wiring the swap through `replace` would **detach the just-added Block the instant the real plugin loads** — the exact "plugin vanishes" symptom. Call this out so nobody reaches for it.
- **The swap mechanism (correct):** the placeholder node **carries the FINAL uuid from creation** (so the snapshot Block is stable from the first frame), and the real-processor swap **writes INTO THAT SAME ValueTree** — swap `tags::object` / `tags::type` / ports, **keep the uuid** — NOT add-new-and-remove-old.
- **RT mechanism (architect-correct, keep):** the swap is a **topology change** that rides the existing whole-graph op-array republish — `GraphNode::buildRenderingSequence()` (`graphnode.cpp:427`) → `exchange(acq_rel)` (`:491`), audio thread reads `load(acquire)` (`:633`), driven by `triggerAsyncUpdate`. **NEVER write `activeRenderingOps` directly.** ⚠️ **Caveat (open question #2):** today only `addNode`/`removeNode` → `changed()` trigger that republish; an **in-place `tags::object` swap on a stable ValueTree may NOT** — so **verify/extend the trigger** to fire the rebuild on the in-place swap. This is the single highest-uncertainty engineering point.
- **Key files:**
  - `src/pluginmanager.cpp:1078–1091` (`createAudioPlugin` → route external-plugin creation through `AudioPluginFormatManager::createPluginInstanceAsync`, callback on the message thread; re-examine `enableAllBuses()` at `:1091` — perf-diag #8, fold in).
  - `src/engine/graphmanager.cpp:392–397` (`createPlaceholder`) — NOTE its only caller today is `:698`, a *terminal* offline/missing-plugin state; Task 4.1 makes it transient-then-swapped, which is **net-new** (it is not a pre-existing swap path). `PlaceholderProcessor::setupFor` derives ports from saved data (`placeholder.hpp:43`) a new plugin lacks → per Phase 0 Task 0.1(a), the loading node exposes **no connectable ports** until ready.
  - `src/services/engineservice.cpp:988–1037` (`addPlugin` — return immediately with the placeholder carrying the final uuid).
  - Snapshot: add the honest "loading" face + `loadState` per Phase 0 Task 0.1; on-ready, populate real ports/params into the SAME ValueTree and re-trigger the republish.
  - Undo: `AddPluginAction` (`messages.cpp:15`) wraps `addPlugin` synchronously today = the single undo unit; keep the add single-step across the async load.
- **Approach:** placeholder-now (final uuid, no connectable ports, honest loading face) + async-load → in-place processor swap on the same ValueTree (uuid preserved) → trigger the op-republish. Keep `verified=true` webview adds on the fast path (perf-diag #1b; the double-construct+disk-write branch is NOT the webview hot path — keep it that way + move `saveUserPlugins` off the sync add path as a guardrail).
- **Connection retention (MAJOR-4):** resolved by the Phase-0 "no cables to a loading node until ready" rule — there is then **nothing to re-bind** on ready, side-stepping `replace`'s lossy `getPortForChannel` remap (`engineservice.cpp:1509–1534`, which silently drops cables on port mismatch). If the owner later wants connect-while-loading, the retention rule must be specified + tested with an **engine-connection** assertion (not just a React edge), but the default is forbid-until-ready.
- **Risk:** **MED-HIGH** (engine node lifecycle + snapshot contract + undo + the in-place-swap republish trigger + the one place RT care is mandatory). See §2 pre-mortem Failure-1.
- **Test/verify:** see §3 expanded test plan. Headline: **the swap preserves the UUID and the webview Block does NOT detach** (NOT "preserves nodeId"); the in-place swap triggers the op-republish; integration `GraphNodeLockFree`-style test that the republish doesn't tear the audio ops under concurrent `load(acquire)`; loading node exposes no connectable ports until ready; add a heavy VST3 → Block appears instantly, UI never freezes, fills in glitch-free. RT-safety + lifecycle reviewed by a SEPARATE `verifier`/`code-reviewer` pass (`model=opus`, never self-approve).
- **Acceptance:** adding any plugin shows a Block instantly (honest loading face, no fake ports); the real processor swaps into the SAME ValueTree with the UUID preserved (Block does not detach) and no audio glitch / no message-thread freeze; undo is single-step; RT-safety sign-off collected.

#### Task 4.2 — Editor ready-push (replaces the blind backoff)
- **What+why:** Bug 3 (slow open) — the *correct* fix for the editor-open backoff, now that 4.1 gives a real completion signal. Replaces the `[0,80,160,320,640]` interim backoff (Task 1.5) with a host push when the editor becomes available.
- **Key files:** `src/ui/element_webview_host.cpp:5644–5681` (`elementPluginEditorOpen`); add `onEmbeddedEditorReady(nodeId)` mirroring the existing `onEmbeddedEditorClosed`; `webview/src/bridge/nativePluginEditor.ts` (consume the push, drop the polling backoff).
- **Dependency:** Task 4.1 (needs the completion callback).
- **Risk:** MED (new push channel; must fire exactly once per ready).
- **Test/verify:** vitest the bridge consumes the ready push and opens immediately; live-confirm editor opens on-ready with no backoff stepping. Keep the keep-alive consideration (don't destroy+rebuild the heavy editor on reopen — perf-diag/window-diag Bug2 fix #2).
- **Acceptance:** editor opens the instant it's ready (no fixed-step latency); reopen reuses the editor where possible.

#### Task 4.3 — PRODUCT FORK: draggable docked editor vs floating window
> **GENUINE PRODUCT FORK — owner decision required before building.** The default editor is a **borderless in-process webview overlay with no titlebar/dragger** (window-diag Bug 1, Hypothesis A) — that is WHY it "cannot be moved." Two real options:
- **Option (1) — Make the React header draggable (LOW risk, webview-only).** Give `PluginEditorControls`' header a drag handler that calls the EXISTING `elementPluginEditorSetBounds(x,y,w,h)` bridge (`element_webview_host.cpp:5683`) live as the user drags. No C++ structural change; position is already a JS-owned property (`pluginEmbedBounds`). Keeps the docked-overlay model.
- **Option (3) — Default to a real floating `DocumentWindow` (P-float, `presentPluginWindow`, `guiservice.cpp:570`).** A genuinely movable OS window with a native title bar. This is a **UX behaviour change** (re-introduces the floating model the embed replaced) and must be coordinated with product direction.
- **Recommendation:** ship **Option (1)** as the default fix (lowest blast radius, matches the existing design, satisfies "can be moved" immediately), and optionally keep "pop out to floating window" (`pluginEditorFloat()`, `:5689`) as the explicit opt-in. Do NOT touch the sandbox worker's Accessory activation policy to "fix" dragging (window-diag Bug 1 Hyp B) — that lever prevents the duplicate-instance SIGKILL; sandbox is default-off anyway, so the real bug is the in-process overlay.
- **Key files:** Option 1: `webview` `PluginEditorControls` header + `elementPluginEditorSetBounds` (exists). Option 3: `guiservice.cpp:556–599`, `windowmanager.cpp:66–91`, `pluginwindow.cpp`.
- **Risk:** Option 1 LOW (TS-only, no native rebuild) / Option 3 MED (behaviour change).
- **Test/verify:** Option 1 — interaction test the header drag updates bounds; live-confirm the overlay repositions. 
- **Acceptance:** the editor can be moved by dragging its header (Option 1) — or a real movable window appears (Option 3) — per owner's fork choice.

---

### PHASE 5 — Matrix / nested routing polish (LOW–MED, after the core lands)
*Research §B/§C TOP-10 #8, #8.5, #9. Optional/iterative; informs the "research cutting-edge UI/UX for nested complex matrix routings" ask. Lowest urgency.*

#### Task 5.1 — `RerouteNode` as a first-class cable gesture (knot)
- **What+why:** Owner feedback #6(4) (matrix routing research) + research §B. Manual antidote to matrix spaghetti before investing in auto-routing.
- **Key files:** `webview/src/components/canvas/` (cable gesture: drag off a port → "Add Reroute"; double-click a cable → drop a reroute at cursor); engine `RerouteNode` already exists (`src/nodes/reroutenode.hpp`).
- **Risk:** LOW-MED. **Test/verify:** interaction test for the reroute gesture; engine connect for the knot. **Acceptance:** a reroute knot can be dropped on a cable and bends it cleanly.

#### Task 5.2 — Group-into-Container: accept `Cmd/Ctrl+G` alias
- **What+why:** Owner feedback #6(3) (grouping/nesting — should be Cmd+Shift+D). Cmd+Shift+D group-into-Container already shipped (W2/earlier `GroupNodesTests`). Add the industry-standard `Cmd/Ctrl+G` alias (Blender/DCC muscle memory) + keep the discoverable marquee→right-click→"Group into Container" path. Confirm the existing Cmd+Shift+D actually works (owner says "grouping not happening" — may be a live bug to repro, NOT just a keybinding).
- **Key files:** `webview/src/hooks/useKeyboard.ts`; the existing group-into-Container handler.
- **Risk:** LOW (alias) — but **first repro** whether Cmd+Shift+D is broken live (owner reported it not happening). **Test/verify:** interaction test both keybindings group a selection into a Container; live-confirm. **Acceptance:** marquee-select + Cmd+Shift+D (and Cmd+G) groups into a nested Container that's dive-navigable.

#### Task 5.3 — Always-visible clickable breadcrumb + collapsed-Container I/O signature
- **What+why:** Research §C TOP-10 #9. Houdini path bar + Esc=up; collapsed Containers show "2▸1, 3 blocks" + topology glyph + boundary ports.
- **Risk:** LOW-MED. **Test/verify:** stories for breadcrumb + collapsed-Container face; navigate-level test. **Acceptance:** breadcrumb always visible + clickable; collapsed Container is self-describing.

#### Task 5.4 — Cable line-style axis + matrix bus mode (stretch)
- **What+why:** Research §H + §B. Add a line-style axis (Audio solid / MIDI dashed / Value-CV dotted) for colour-blind + low-zoom legibility; optional ELK orthogonal "bus" routing mode per-Container when edge density is high (keep bezier for sparse). Reserve cable animation for hover/selected/probe ONLY (speed-first).
- **Risk:** MED (ELK orthogonal mode is heavier). **Test/verify:** Cable stories per style; painter guard stays green (no per-tick animation). **Acceptance:** cable type survives at low zoom; animation is probe-only.

---

## 2. DELIBERATE — PRE-MORTEM (3 concrete failure scenarios + mitigations)

### Failure 1 — The swap detaches the Block (UUID churn) and/or tears the audio graph (Task 4.1)
**Scenario (the real one — critic CRITICAL-1):** the executor finds `EngineService::replace` (`engineservice.cpp:1490`) and wires the placeholder→real swap through it (or copies its add-new+remove-old shape). `replace`'s desc-overload `addNode` mints a **new UUID** (`graphmanager.cpp:438`→`node.cpp:278`), so the moment the real plugin loads, the webview Block — keyed on the OLD uuid (`:506`/`:279`) — **detaches and the just-added plugin vanishes**. A nodeId-keyed test would pass while the live app breaks; the bug is only caught after a build+install feel-test (expensive on this project). **Secondary scenario:** the swap mutates the running ops array (or takes a lock) while the audio thread is mid-render → glitch/race/crash. **Tertiary:** the in-place `tags::object` swap does NOT trigger the op-republish, so the new processor is never wired into the audio graph.
**Why plausible:** `replace` is attractive prior art; the identity systems (UUID vs engine nodeId) are easy to conflate (both the prior plan and the architect did); and the in-place-swap republish trigger is unproven (open question #2).
**Mitigations:**
- **Identity HARD RULE:** preserve the node **UUID** across the swap (NOT the engine nodeId). The placeholder carries the FINAL uuid from creation; the real-processor swap writes INTO THAT SAME ValueTree (keep uuid; swap `tags::object`/type/ports). **Do NOT reuse `EngineService::replace`/`ReplaceNodeMessage`** — it mints a new uuid and is the anti-pattern. The headline test is "swap preserves the UUID + the Block does not detach," not "preserves nodeId."
- **RT HARD RULE:** the swap rides the existing topology-change op-array republish (`buildRenderingSequence` → `exchange(acq_rel)`, `graphnode.cpp:427/491/633`, via `triggerAsyncUpdate`). **NEVER** write `activeRenderingOps`; no `lock()` / `new` / `delete` on the audio thread.
- **Trigger verification:** confirm (open question #2) whether an in-place `tags::object` swap fires `changed()`/the republish; if not, extend the trigger explicitly and test it.
- **Connection retention:** forbid connecting to a loading node until ready (Phase 0 Task 0.1a) → nothing to re-bind → `replace`'s lossy `getPortForChannel` remap (`engineservice.cpp:1509–1534`) is never exercised.
- Gate with a `GraphNodeLockFree`-style ctest (exists in `test/engine/`) extended to a live swap under simulated audio-thread `load(acquire)` reads (ASan if available).
- RT-safety + lifecycle review is a SEPARATE `code-reviewer`/`verifier` pass with `model=opus` (never self-approve — operating principle).
- Ship Phase 4 on its OWN branch, merged last, so a failure here can't block Phases 0–3.
- **Pre-build cheap proof (open question #1):** a one-node `replace` + uuid-before/after assert confirms `replace` changes the UUID, before any executor leans on it.

### Failure 2 — Graph-push dedupe drops a real update (Task 1.2) / snapshot-equality is wrong
**Scenario:** the byte-identical short-circuit caches a stale string and a genuine change produces an "equal" payload (e.g. a field serialised non-deterministically, or a change that doesn't alter the JSON string but should re-render), so the canvas silently stops updating. OR the window-chrome ignore-filter accidentally also drops `tags::x`/`tags::y` → block moves stop syncing.
**Why plausible:** dedupe correctness depends on the JSON being a faithful, deterministic function of state; `DynamicObject` field ordering or float formatting could differ between builds.
**Mitigations:**
- Mirror the PROVEN `sentinelcache`/`meterlanegate::changed` pattern (already shipped + trusted) rather than inventing a new equality.
- The dedupe compares the *full output string* — if two states produce identical strings, they ARE identical UIs (the structural reconcile on the React side is a no-op for identical input — confirmed `useGraphStore.ts` structural reconcile = zero re-renders). So a false "equal" can only happen if state genuinely didn't change the serialised form.
- Explicit host test: (a) a `windowX` write does NOT push; (b) a block-`x` write DOES push; (c) two identical builds → one `evalInBrowser`. The narrowing test pins that block position is never in the ignore set.
- Keep the build running (only skip the IPC) initially; the further "hash inputs to skip the build too" optimisation is a SEPARATE later step, not bundled.

### Failure 3 — Concurrent-agent file contention reverts/clobbers in-flight edits
**Scenario:** (documented project trap) a worker's tracked edits to `Block.tsx`/`GraphCanvas.tsx`/`InspectorHub.tsx` get reverted by a CONCURRENT agent or a rogue `git reset` hook between tool calls — exactly what bit the W2 A-worker repeatedly. The uncommitted D1 diff is especially exposed (it's sitting in the working tree right now).
**Why plausible — and LIVE right now (critic MAJOR-6):** two `.claude/worktrees/agent-*` dirs exist in the tree this moment (`agent-a1c2f24…`, `agent-ab4748a5…`) and the D1 diff is uncommitted (`GraphCanvas.tsx:1302`). **`src/ui/element_webview_host.cpp` (6000+ lines) is the single highest-contention file: FIVE tasks touch it — 1.2 (dedupe+narrowing), 1.3 (memo), 3.A (name-emit), 4.1 (loading face), 4.2 (ready-push) — across three phases.** The "disjoint files" framing for Phase 3 ‖ Phase 4 HIDES this overlap.
**Mitigations:**
- **Commit D1 FIRST** (Task 2.1) — the very first action of the wave; don't let it float.
- **SERIALIZE all `element_webview_host.cpp` edits to ONE actor** (the host-file actor). Land the host-side tasks **1.2 / 1.3 / 3.A as one serialized sub-lane BEFORE forking Phase 3 ‖ Phase 4** (see the HOST-FILE SERIALISATION RULE above). Phase 4's host edits (4.1/4.2) are on the Phase-4 branch and also go through the same single actor.
- **Serialize commits**: stage+commit in ONE bash call (project trap: a hook runs a no-op `git reset` that unstages between calls; `git add … && git commit …` atomically). Never batch git with other tool calls; rm a stale `.git/index.lock` if a cancelled parallel call left one.
- **Lane file-isolation for the REST**: Phase 3 webview-UI (`ToolPalette`, `InspectorHub`, `AppShell`, `useAppStore`, `useKeyboard`) vs Phase 4 engine (`pluginmanager.cpp`, `graphmanager.cpp`) touch disjoint files — different actors OK, EXCEPT the shared host file (above).
- **Re-verify before commit** (project trap: a hook once reverted a worker's tracked edits mid-task): `git diff` immediately before each commit to confirm the intended hunks are present; stage-after-edit and commit in tight bursts.
- Workers write reports INCREMENTALLY (stop-hook can kill mid-stream); resume via SendMessage.

---

## 3. DELIBERATE — EXPANDED TEST PLAN (risky items)

### Task 4.1 (async plugin load + UUID-preserving in-place swap) — the highest-risk item
- **Unit (vitest/JS):** the bridge handles the new `loadState:'loading'` node face (snapshot maps a placeholder Block; **the UUID is stable from the first frame**); a loading node exposes NO connectable handles; `AddPluginAction` undo is single-step.
- **Unit (C++/ctest):** `createPluginInstanceAsync` callback path resolves to a real `Processor`; the placeholder node is created **with the FINAL uuid**; the in-place swap **preserves the UUID** (assert uuid-before === uuid-after) and writes into the SAME ValueTree (not add-new+remove-old). **Anti-regression:** a separate assert that `EngineService::replace` CHANGES the uuid (proving why it must not be used — open question #1).
- **Engine-truth (C++/ctest):** a loading node exposes **no connectable ports** until `loadState==='ready'`; on ready, real ports/params populate into the same ValueTree.
- **Integration (C++/ctest):** extend `GraphNodeLockFree` (existing `test/engine/`) — confirm the in-place swap **triggers** `buildRenderingSequence`/the op-republish (open question #2), and that publishing via `exchange(acq_rel)` while a simulated audio-thread `load(acquire)` reads concurrently has no torn read / no use-after-free (ASan if available).
- **e2e / LIVE (separate actor, serialized app):** add a heavy real VST3 → the Block appears within one frame in a loading state with a STABLE uuid (does NOT detach when load completes), the UI never freezes, the real processor fills in, audio is glitch-free across the swap. `cli-anything-element` OSC harness for deterministic launch + `verify assert --alive --no-crash`.
- **Observability:** log instantiate timing (`Time::getMillisecondCounter()`); emit a "swap published" trace tied to the **uuid**; capture before/after CPU during a heavy add.
- **Approval:** RT-safety + lifecycle reviewed by a SEPARATE `verifier`/`code-reviewer` pass (`model=opus`).

### Task 1.2 (listener narrowing + graph-push dedupe)
- **Unit (C++):** write `windowX` AND `tags::x` on the **SAME node ValueTree** → assert **exactly one** (block-`x`) schedules a push (critic MAJOR-5); identical builds → one `evalInBrowser` (mock/spy the eval); assert the ignore-filter is on the under-root branch (`:6022`) ONLY and does NOT touch `shouldIgnoreSessionRootProperty` (`:6003`).
- **Integration:** drive a window drag (or simulate repeated `windowX` writes) → assert zero graph pushes; drive a block move → assert pushes resume; co-land Task 1.3 (else a fired push still pays the O(N·types) scan).
- **LIVE:** window drag is smooth (separate actor).

### Task 1.4 (usePeakHold idle-stop) + Task 2.0/2.4 (collapse-tier migration + collapsed-socket)
- **Unit (vitest):** peakhold — at `live===0 && peak===0` the rAF does not re-queue; a non-zero push re-arms and the meter tracks. Collapse-tier — legacy `collapsed:boolean` migrates to the tier enum on BOTH read paths (JS + host); collapsing a connected Block keeps its cables.
- **Engine-truth (collapsed-socket — architect P4):** assert the **ENGINE connection (`Arc`) survives** the collapse, not merely the React edge (a visual stub hiding a severed `Arc` is a Principle-3 nothing-fake violation).
- **Interaction/a11y:** the tier toggle + the pin-to-face toggle have correct roles/labels.

### Task 2.1 / 2.2 (cursor preset + multi-cable) — the xyflow #5563 regression class
- **Interaction (vitest):** under `selectionOnDrag` + `panOnDrag={[1,2]}`: right-click→QuickAdd fires; double-click-empty-canvas→navigate-up fires; Shift+click/marquee additive; left-drag from an already-connected port initiates a connection (NOT a pan); a 2nd+3rd cable from one output reach two targets (3× `nativeGraphConnect`).
- **LIVE repro (Task 2.2):** the mandated 60-second live repro to PIN the multi-cable cause before any fix.

### Cross-cutting gates (every PR)
- `npx tsc -b` clean · touched-component vitest green · Storybook `run-story-tests` (interaction + a11y) green · ctest green/unaffected · the 2 guards green (`webview/src/__tests__/terminologyGuard.test.ts` + `util/check_terminology.py`) · painter vitests (`webview/src/components/canvas/__tests__/Cable.painter.test.tsx`, `webview/src/components/canvas/__tests__/Block.gaps.test.tsx`) green (no per-tick blur/shadow/animation/strokeWidth, no backdropFilter) · build + force-bundle ALL 8 products + reinstall before "done."

---

## 4. ADR — Wave 3 sequencing & branch strategy

**Decision.** Execute the owner's Wave-3 feedback as **Option A (contract-first)**: a no-code **Phase 0 contract** (loading-node + collapse-tier schema), a LOW-risk "lean & fast now" Phase 1, a daily-felt canvas-UX Phase 2 (cursor/no-overlap/multi-cable/collapse-tier, incl. Task 2.0 state contract), a left+right panel redesign Phase 3 (file-parallel with Phase 4, contract-coupled), an isolated MED-HIGH async-plugin-load Phase 4 **on its own branch merged last**, and an iterative matrix/nested polish Phase 5. Carry Phases 0–3 on **`wave-3-leanfast-ux`** (off `wave-2-block-faces @ 06c61158`); PRs target **`local-enhancements`**. Commit the floating D1 cursor change FIRST. **The placeholder→real swap preserves the node UUID (not the engine nodeId) and must NOT reuse `EngineService::replace`.**

**Drivers.** (1) Fastest felt impact for an expert user; (2) Risk isolation of the one RT-sensitive slice; (3) Respect real dependency edges (Phase-0 contract → its consumers; name-match host fix → inspector; collapse-tier 2.0 → 2.4/3.E; async completion signal → editor backoff removal).

**Alternatives considered.**
- *Option B (async-load first):* rejected — front-loads the highest-risk RT-sensitive change before any momentum; a regression stalls the wave and poisons verification of everything else (can't trust the canvas).
- *Option C (redesign first):* rejected — sits on top of the name-match + collapse-tier substrate (rework), and defers the cheap universally-felt bugs longest.
- *No Phase-0 contract / contract local to Phase 4:* rejected (architect S1 / critic CRITICAL-3) — the loading-node + collapse-tier states are cross-cutting schema; building Phases 2/3 against the current (no-loading-state) shape forces re-verification/re-code when Phase 4 lands. A one-page written spec is cheap insurance.
- *Phase 4 on the same long-lived branch:* rejected (architect S4) — the one slice that can regress audio would entangle a dozen webview-only wins; own-branch-merged-last honours Driver 2. The git-orphan counter-argument is weak (`9e0d4f62` is a normal ancestor, trivially cherry-picked).
- *Big-bang single PR:* rejected — the wave is large and touches RT code; stacked per-phase PRs keep review tractable.

**Why chosen.** Option A (contract-first) is the only sequencing that satisfies all three drivers simultaneously; B and C are dominated. The Phase-0 spec + Task-2.0 split + own-branch Phase 4 harden the two cross-cutting schema surfaces (node-lifecycle + collapse-tier) that the v1 plan and the architect treated as phase-local but are actually schema-wide — without changing the strategy.

**Consequences.**
- Positive: owner feels improvement in the first increment; the risky slice is contained on its own branch; Phase 3's file edits run concurrently with Phase 4's implementation; every step is independently shippable + TDD-gated against a stable contract; locked constraints (neu, terminology, painter, RT) enforced mechanically each PR.
- Negative / accepted: the loudest single complaint (slow open) is fully resolved late — mitigated by the cheap interim editor wins in Phase 1 (tightened backoff + async editor construct, tagged for Phase-4 removal). `element_webview_host.cpp` is a 5-task contention hotspot → all host edits serialized to ONE actor (host-side 1.2/1.3/3.A land before forking Phase 3 ‖ Phase 4); the concurrent-agent trap is LIVE (worktrees present) → commit-D1-first + atomic stage+commit.

**Follow-ups / open items (carried forward — critic + architect open questions).**
1. **Owner decisions before building:** (a) Task 4.3 editor fork — draggable docked overlay (recommended) vs default-floating window; (b) brief §7 — empty-inspector rail vs always-on Health; Favourites chips vs stacked; confirm `Cmd+.` no host collision; per-app vs per-project panel persistence.
2. **Confirm (cheap, before executor leans on it):** that `EngineService::replace` changes a node's UUID (open question #1 — one-node replace + uuid-before/after assert). HIGH-confidence from code; proves why `replace` is the anti-pattern for Task 4.1.
3. **Confirm:** does an in-place `tags::object` swap (same ValueTree) trigger the GraphManager `changed()`/op-republish, or only `addNode`/`removeNode`? (open question #2 — determines whether the UUID-preserving swap needs a new explicit republish trigger; Task 4.1 step "trigger verification").
4. **Verify 3.A single-emit:** the node **name** is emitted from exactly ONE serializer before claiming "single-emit-point" (`findKnownPluginByIdentifier` at `:1981/:2050/:6407`) — open question #3.
5. **Live repro required (not blind):** Task 2.2 multi-cable (60-second repro to pin the RF live-drag nuance, incl. whether D1's `panOnDrag={[1,2]}` interferes with port drags) and Task 5.2 (confirm whether Cmd+Shift+D group-into-Container is actually broken live, vs just missing the Cmd+G alias).
6. **Param substrate:** the collapse-tier Macro row (Task 2.4) renders curated params; *live* param control depends on the W3-decided mechanism (ii) lock-free atomic bridge / built-in faces spike — the tier render ships independently, param-live-control follows.
7. **Do NOT** touch the sandbox worker Accessory activation policy to fix dragging (prevents the duplicate-instance SIGKILL; sandbox is default-off).
8. RT-safety + lifecycle of Task 4.1 reviewed in a SEPARATE verifier pass (`model=opus`) before merge.

---

## Revision log (v2)

Folded from `ralplan-architect-review-2026-06-08.md` (SOUND-WITH-AMENDMENTS, 7) + `ralplan-critic-review-2026-06-08.md` (ITERATE; found CRITICAL-1 both prior docs missed). The critic CORRECTS the architect on #1 — the critic's version is used.

1. **[CRITICAL-1 — corrects architect #1] Task 4.1 swap identity = UUID, not nodeId.** Re-authored Task 4.1 + Pre-mortem Failure-1 + the §3 test plan to "preserve the node **UUID**" (`element_webview_host.cpp:506` emits `getUuidString`; resolves `:279`). Placeholder carries the FINAL uuid; the real-processor swap writes INTO THE SAME ValueTree (swap `tags::object`/type/ports, keep uuid) — NOT add-new+remove-old. **Explicitly forbids reusing `EngineService::replace`/`ReplaceNodeMessage`** (`engineservice.cpp:1490`) — it mints a NEW uuid (`graphmanager.cpp:438`→`node.cpp:278`) and would DETACH the Block. Kept the architect's correct RT mechanism (topology change rides `triggerAsyncUpdate→buildRenderingSequence→exchange(acq_rel)`, `graphnode.cpp:427/491/633`; never `activeRenderingOps`) + added the caveat that an in-place `tags::object` swap may not trigger the republish → verify/extend. Headline test now "preserves UUID + Block does not detach."
2. **[CRITICAL-2 + architect #2] Added Phase 0 Task 0.1 — loading-node contract (no code).** `PlaceholderProcessor::setupFor` derives ports from saved data (`placeholder.hpp:43`) a new plugin lacks → spec mandates: (a) loading node **NOT cable-targetable** until `loadState==='ready'` (disable handles); (b) face = name + honest "loading…", ZERO meters, ZERO fake ports; (c) on-ready port/param population + re-trigger republish. Added `loadState?:'loading'|'ready'` snapshot field (net-new). Engine-truth test named.
3. **[CRITICAL-3 + architect #3] Demoted "fully parallel" everywhere** (Option A pros, recommendation, Phase 3 header, ADR) to "file-parallel with Phase 4's *implementation*, contract-coupled; 3.E depends on 2.0/2.4." **Extracted Task 2.0 — collapse-tier state contract** (dual-sided migration: host read `:6450`, bridge bool `:2904`, on-disk `.els` back-compat) landing before BOTH 2.4-render and 3.E-pin. Added Phase 0 Task 0.2 to spec it.
4. **[MAJOR-4] Connection retention across the swap** resolved via the CRITICAL-2 "forbid connecting to a loading node until ready" rule (nothing to retain); flagged `replace`'s lossy `getPortForChannel` remap (`engineservice.cpp:1509–1534`); engine-connection assertion (not just React-edge) required if connect-while-loading is ever wanted.
5. **[MAJOR-5 + architect #4] Re-scoped Task 1.2** — named the **listener-narrowing** as the window-drag fix (output-dedupe = general churn; Task 1.3 must co-land). Host test writes `windowX` AND `tags::x` on the **SAME node ValueTree** → exactly one (block-x) pushes. Ignore-filter on the `vtIsUnderSessionRoot` branch (`:6022`) ONLY; must NOT touch `shouldIgnoreSessionRootProperty` (`:6003`).
6. **[MAJOR-6] `element_webview_host.cpp` = 5-task contention hotspot** (1.2/1.3/3.A/4.1/4.2). Added a HOST-FILE SERIALISATION RULE (one actor; land host-side 1.2/1.3/3.A before forking Phase 3 ‖ Phase 4) + strengthened Pre-mortem Failure-3 (worktrees + uncommitted D1 are LIVE; commit D1 first).
7. **[architect #5] Phase 4 on its own branch, merged last** — updated header, branch-strategy, ADR (git-orphan counter-arg noted weak).
8. **[architect #6] Engine-truth assertions** — 2.3 `resolveCollisions` on `onNodeDragStop` (one-shot) NOT per-tick + red glow is a class toggle keyed on intersection-set CHANGE; 2.4 collapsed-socket asserts the **engine `Arc`** survives; 3.A verifies the name is emitted from exactly ONE serializer + handles the loading-node name.
9. **[architect #7] Tagged interim code** — Task 1.5 backoff array + test marked `// INTERIM: removed by Task 4.2`.
10. **Guard paths corrected** to the real `__tests__/` subdir (`webview/src/__tests__/terminologyGuard.test.ts`, `webview/src/components/canvas/__tests__/Cable.painter.test.tsx`, `…/Block.gaps.test.tsx`) in Principle 5 + cross-cutting gates.
11. **Open questions carried forward** in the ADR (confirm `replace` mints new uuid #1; in-place `tags::object` swap republish trigger #2; 3.A single-emit #3; owner forks 4.3 + brief §7).
