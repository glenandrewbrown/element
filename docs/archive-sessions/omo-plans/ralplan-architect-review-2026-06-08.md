# ARCHITECT REVIEW — Wave 3 "Lean & Fast UX" Plan (ralplan DELIBERATE)

**Date:** 2026-06-08
**Reviewer:** Architect (ralplan consensus loop, DELIBERATE mode)
**Plan under review:** `.omo/plans/wave-3-leanfast-ux-plan-2026-06-08.md`
**Mode:** READ-ONLY architectural soundness review. Consumed next by the Critic, then folded into a plan revision.

**Verdict up front: SOUND-WITH-AMENDMENTS.** The sequencing logic (Option A) is correct and well-argued, the diagnostic artifacts it sequences are real and accurately cited, and the risk-isolation instinct is right. But the plan's description of the Phase 4 swap mechanism is materially inaccurate in a way that *understates* the engineering work and *mis-locates* the RT risk — and the collapse-tier task (2.4) is a state-contract change that the panel-redesign lane (3.E) silently consumes, creating a hidden cross-lane dependency the plan declares "parallelisable." Those two amendments are load-bearing. The rest are tightenings.

Spot-checks performed (all confirmed unless noted): `element_webview_host.cpp:6008` listener ✓, `:6003` root-only filter ✓, `pushGraphSnapshot:6119` no-diff-gate ✓, `graphmanager.cpp:392` `createPlaceholder` exists ✓, `useAppStore.ts:225` `partialize: () => ({})` ✓, `types.ts:62` `collapsed?: boolean` ✓, `messages.cpp:209` `SpliceConnectionMessage` ✓, `pluginmanager.cpp:1080` uses the **blocking** `createPluginInstance` ✓, `createPluginInstanceAsync` used **nowhere** ✓.

---

## 1. STEELMAN ANTITHESIS — the strongest case *against* this plan's approach

I'll argue three of these for real, strongest first.

### Antithesis A (strongest): "The loading-node snapshot contract is the spine of the whole wave, and deferring it to Phase 4 inverts the build order."

The plan puts the async-load/placeholder/swap last for *risk-isolation* reasons. But consider what Phase 4 actually changes: it introduces a **transient node lifecycle state** ("loading") into the graph snapshot — a state that did not previously exist. Every consumer of the snapshot must tolerate it:

- Task 2.4 (collapse tiers) renders a Block from snapshot data — what does a *loading* Block render at? Can you collapse a loading node?
- Task 3.A (name coherence) asserts `InspectorHub.name === Block.name` for a selected node — does a loading node have a name yet, or a placeholder name? The mechanical guard test could pass against a stable node and break against a loading one.
- Task 3.E (selection-driven inspector) routes by selection type — what does the inspector show for a node whose `Processor` is a `PlaceholderProcessor` mid-swap?
- Task 2.2's multi-cable repro asserts engine connects land — but if you can draw a cable *to a loading node*, the connection targets a placeholder whose port layout (`PlaceholderProcessor::setupFor`, placeholder.hpp:43) is derived from the *saved* node, which for a brand-new async-loaded plugin **does not yet exist**.

The steelman conclusion: the loading-node contract is not a Phase-4-local concern — it is a **schema change to the object every other phase manipulates**. Building Phases 2 and 3 against the *current* (no-loading-state) contract means each will be re-verified, and possibly re-coded, once Phase 4 lands. The architecturally honest order is: **specify the loading-node snapshot shape FIRST (Phase 0 spec)**, build Phases 2/3 against the final shape, then *implement* the async machinery last. Risk-isolation of the *implementation* is preserved; contract-stability is gained.

This is a real tension and the plan under-weighs it (see §2).

### Antithesis B: "Carrying one long-lived branch across a 5-phase, RT-touching wave is the wrong call; stacked PRs off `local-enhancements` per phase is safer."

The plan keeps `wave-3-leanfast-ux` long-lived, citing that re-cutting would orphan `9e0d4f62` (splice) and the W2 base. That's a *git-mechanics* argument, not an architecture one — and it's weak, because cherry-picking `9e0d4f62` onto a fresh branch is trivial. The real cost of the long-lived branch is: Phase 4 (MED-HIGH, RT-sensitive, the one slice that can regress audio) sits on the **same branch** as a dozen webview-only changes. If Phase 4 has to be reverted or held, it's entangled with Phases 1–3 history. The whole *point* of Driver 2 (risk isolation) argues for Phase 4 living on its own branch that merges last, precisely so it can be held without blocking the felt wins. The plan acknowledges "stacked PRs … acceptable" but defaults to the long-lived branch — the antithesis says the default is backwards given the plan's own risk-isolation driver.

### Antithesis C: "Webview-only quick fixes in Phase 1 accrue debt the Phase 4 redesign must then unwind."

Task 1.5 ships a tightened editor-open backoff `[0,80,160,320,640]` and async `callAsync` editor construct. Task 4.2 then *replaces* the backoff entirely with a host ready-push. So Phase 1 deliberately writes code (a tuned polling array + its vitest) that Phase 4 deletes. Same shape on Task 4.3's Option-1 "drag the React header" fix: it's a webview patch to a problem whose *root* (window-diag Bug 1) is "the editor is a chrome-less in-process overlay." The antithesis: these are band-aids that make the headline complaint *feel* addressed early, reducing the pressure to do the real fix, while adding throwaway code + tests to maintain in the interim. A purist would say: do the ready-push once, in Phase 4, and don't ship the interim backoff at all.

---

## 2. REAL TRADEOFF TENSIONS the plan under-weighs

**Tension 1 — Felt-impact-first vs contract-stability-first (the big one).** This is Antithesis A as a tension rather than a verdict. The plan optimizes hard for "owner feels it in the first increment" (Driver 1) and treats the snapshot contract as an implementation detail local to Phase 4. But the loading-node state is a *cross-cutting schema addition*. You cannot have both "ship felt wins first against the current contract" AND "no rework when the contract changes" unless you **design the final contract up front and build the felt wins against it**. The plan picks felt-impact and silently eats the rework risk. That's a defensible call for a solo-owner iterative product — but it should be *named* and the rework budgeted, not hidden behind "Phase 4 is isolated."

**Tension 2 — The dedupe's "build still runs" cost vs a real input-hash (Task 1.2).** The plan (correctly, conservatively) chooses string-equality on the *output* of `buildActiveGraphJson` and explicitly defers "hash the inputs to skip the build too" to a later step. But re-read the diagnosis: perf-diag #2 says the cost is "build + dtoa + O(n²) string escape," and #3 says the *build itself* does an O(N·types) plugin-list scan per push. The output-dedupe skips the IPC + WKWebView parse but **still pays the full build + the #3 linear scan every window-drag frame**. So for the window-drag case (the motivating symptom), Task 1.2's dedupe alone does *not* remove the dominant native cost — it's the *listener-narrowing* half (dropping `windowX/Y` from the under-root branch) that actually fixes the window-drag lag, by preventing the push from being *scheduled* at all. The plan bundles these as one task with one risk rating, but they have **different mechanisms and different efficacy**: the narrowing is the real window-drag fix; the output-dedupe is a general-churn mitigation that leaves the build cost on the table. Task 1.3 (the O(1) lookup memo) is what makes the build itself cheap. The tension: the plan's "build still runs" conservatism means Task 1.2-dedupe + Task 1.3 must *both* land to actually cheapen a push that does fire — they're more coupled than the "independently shippable" framing admits.

**Tension 3 — Migration safety vs the locked "nothing-fake / persisted-state" contract (Task 2.4).** The collapse field is persisted in the **Node ValueTree** as `"collapsed"` (confirmed: types.ts:57 comment, bridge `elementNodeSetCollapsed` at host `:2891`, snapshot read at `:6447`). Widening `boolean → enum` is a *persisted-state schema migration* that crosses the C++/JS boundary: the host writes/reads a ValueTree property, the snapshot serializes it, the JS store mirrors it, and existing `.els` files on disk carry the old boolean. The plan's migration is JS-side only ("map legacy `collapsed:true→'title'`"). But the **host** also reads `collapsed` (`:6447`) and the bridge call is named `elementNodeSetCollapsed` taking a bool. A three-state tier requires the *host* serializer + the *bridge signature* to change too, and old `.els` files must round-trip. The tension the plan under-weighs: this is not a webview enum widening — it's a **dual-sided persisted-contract change** with on-disk back-compat, which puts it in the same risk class as the Phase 4 snapshot change, yet it's rated MED and placed *before* the panel redesign that consumes it.

---

## 3. SYNTHESIS — recommended resolution (keep Option A, with amendments)

Keep Option A's sequencing — it is correct and B/C are genuinely dominated. But apply these concrete amendments:

**S1 (resolves Antithesis A + Tension 1) — Add a Phase 0 "contract spec" (no code).** Before Phase 1, write the **loading-node snapshot contract** and the **collapse-tier ValueTree contract** as a one-page spec: the JSON shape of a loading Block (`loadState?: 'loading'|'ready'`, name policy while loading, port-availability rule, can-it-be-targeted-by-a-cable rule, can-it-be-collapsed rule), and the `collapseTier` enum + its ValueTree key + the legacy-boolean migration on *both* sides. Phases 2 and 3 then build Block render / inspector routing / name-guard against the *final* shape (tolerating `loading`), even though the machinery that *produces* `loading` ships in Phase 4. This preserves implementation risk-isolation while killing the rework. Cheap insurance; it's a spec, not code.

**S2 (resolves the Phase 4 mechanism inaccuracy — see §4 P1) — Re-author Task 4.1 to name the real swap path.** The plan says "swap in the real `Processor` via the existing atomic node-replace path (`GraphNode std::atomic<Array<void*>*>`)." That is wrong on two counts and must be corrected before an executor builds it:
   - **There is no node-replace/swap path.** `createPlaceholder` has exactly one caller (graphmanager.cpp:698) and it is a *terminal* offline/missing-plugin state at session load, not a transient-then-swapped one. `PlaceholderProcessor` (placeholder.hpp) is a permanent bypass stub with `hasEditor()==false`; nothing ever swaps it out for a real processor today. The "swap" is **net-new engineering**, not "use the existing path."
   - **The cited `std::atomic<Array<void*>*>` is the wrong abstraction level.** That atomic (graphnode.cpp:369/491/633) holds the *rendering-op sequence* for the **whole graph** — it is rebuilt wholesale by `GraphNode::buildRenderingSequence()` (`:427`) and published via `exchange(acq_rel)` (`:491`), driven by `triggerAsyncUpdate()` whenever `addNode`/`removeNode` mutate topology (graphnode.cpp:109/238). It is **not** a per-node identity swap. The actually-RT-safe way to do the swap is: load async on the message thread → `removeNode(placeholder)` + `addNode(real)` (or reuse the nodeId) → the existing `triggerAsyncUpdate → buildRenderingSequence → exchange(acq_rel)` republishes the entire op array atomically. The audio thread reads the new ops via `load(acquire)` at `:633`. So the RT primitive the plan wants *does* exist and *is* safe — but it's a **whole-graph op-array republish on topology change**, and the executor must drive the swap through `triggerAsyncUpdate`, NOT by mutating the running ops array (which is what the plan's wording "publish through the atomic-ops path" dangerously implies). Rewrite the task to: "drive the swap as a topology change (remove placeholder / add real, preserving nodeId) so the existing async op-rebuild republishes atomically; never touch `activeRenderingOps` directly." Also note the swap pays a `prepareToPlay` on the new processor (graphmanager.cpp:525/877) — that's message-thread, fine, but it's where the cost moves to, not vanishes.
   - **Decision required:** does the swap *reuse* the placeholder's nodeId (so the webview UUID is stable, satisfying the plan's own constraint) or assign a new one and re-map? Reusing requires either a real `replaceNode(nodeId, newProc)` primitive (which must be written and must itself trigger the rebuild) or an add-then-rewrite-id dance. This is the single highest-uncertainty engineering decision in the wave and the plan currently hand-waves it as "preserve the assigned nodeId."

**S3 (resolves Tension 3 + the hidden 2.4↔3.E dependency) — Split the collapse-tier *state contract* out of Task 2.4 as a Phase-0/early pre-req, and make the 2.4↔3.E edge explicit.** The plan declares Phase 3 "parallelisable with Phase 4" but **Task 3.E explicitly depends on Task 2.4**: 3.E's pin-to-face surfaces pinned params "on the Block Macro tier from Task 2.4," and the Macro tier only exists once 2.4 widens the enum. So Phase 3 is **not** fully parallel — its inspector-pin payload sits on Phase 2's collapse substrate. Resolution: extract "Task 2.0 — collapse-tier state contract" (the enum + ValueTree key + dual-sided migration + bridge signature) as a small standalone pre-req that lands before *both* 2.4-render and 3.E-pin. Then 2.4 (render 3 tiers) and 3.E (pin-to-face) can each build against the settled contract. This also fixes Tension 3 by treating the migration as the contract change it is, reviewed once.

**S4 (resolves Antithesis B, partially) — Put Phase 4 on its own branch merged last.** Keep `wave-3-leanfast-ux` for Phases 1–3 (the git-orphan argument holds for the *webview* lineage), but branch Phase 4 off the tip and merge it independently, so the RT slice can be held/reverted without entangling the felt wins. This honours Driver 2 better than the plan's "one long-lived branch" default.

**S5 (resolves Antithesis C, accept-with-eyes-open) — Keep the Phase 1/4 interim/replace split, but tag the throwaway.** The interim backoff (1.5) genuinely buys perceived speed weeks before 4.2 and is ~2 lines + 1 test — acceptable debt. Just mark the tuned array + its test `// INTERIM: removed by Task 4.2 ready-push` so the deletion in Phase 4 is unambiguous and nobody "optimizes" the interim further. Do **not** also ship the 4.3 Option-1 header-drag as a Phase-1 sneak; keep it gated behind the owner's editor fork decision (the plan does this correctly).

---

## 4. PRINCIPLE-VIOLATION FLAGS (DELIBERATE mode)

Scrutinizing the five tasks called out, against the plan's own five principles.

**P1 — Task 4.1 RT-safe swap → FLAG: MAJOR (factual mis-statement of the RT mechanism, not a principle breach per se, but it endangers Principle 4).** As detailed in S2: the plan invokes Principle 4 ("publish through the existing lock-free atomic-ops path") but **misidentifies that path** and asserts a swap mechanism that does not exist. The principle itself is upheld *if* the executor drives the swap via `triggerAsyncUpdate`/`buildRenderingSequence` (which is real and safe). The danger is the plan's wording ("publish through the atomic-ops path") reads as "go write to `activeRenderingOps`," which would be a Principle-4 violation (mutating the array the audio thread loads). Severity MAJOR because an executor following the plan's literal text could introduce exactly the RT hazard the pre-mortem's Failure-1 warns about. **Must be re-worded before execution.** Pre-mortem Failure-1's mitigation list is otherwise good and the "separate verifier pass, model=opus" gate is correct.

**P2 — Task 1.2 dedupe correctness → FLAG: MINOR (Principle 1 efficacy gap, already half-mitigated).** The pre-mortem Failure-2 correctly identifies the non-determinism risk (DynamicObject field ordering, float dtoa) and correctly leans on the proven `sentinelcache`/`meterlanegate` pattern. No correctness violation. The gap (Tension 2): the *output*-dedupe does not by itself satisfy Principle 1 ("never regress … CPU") for the window-drag case, because the build still runs the #3 linear scan. Mitigation: state explicitly that the **listener-narrowing** (not the output-dedupe) is the window-drag fix, and that Task 1.3 must land to cheapen pushes that *do* fire. One subtle correctness note the plan should add to its host test: verify the ignore-filter is applied **only on the under-root branch** (`vtIsUnderSessionRoot`, host `:6022`) and does not accidentally extend `shouldIgnoreSessionRootProperty` (`:6005`), which currently filters everything except `tempo`/`name` on the root tree — conflating the two filters could drop legitimate root pushes.

**P3 — Task 2.3 collision-resolve / painter-safe glow → PASS (no violation; well-specified).** The plan correctly (a) uses rectangular collision not circular `forceCollide` (Blocks are rect at varying tier heights — consistent with 2.4), (b) keeps the red glow a *class toggle* not per-tick inline shadow (honours the painter guard / Principle 5), and (c) layers `resolveCollisions` as the per-drag nudge *under* ELK Tidy as the structural layer. The only tightening: assert in the test that `resolveCollisions` runs on `onNodeDragStop` (one-shot), **not** on `onNodeDrag` (per-tick) — a per-tick resolve would be both a perf regression (Principle 1) and would fight ELK. The plan's "optional live red micro-glow during drag via `getIntersectingNodes`" must be a class toggle keyed on intersection-set *change*, not a per-frame recompute, or it quietly violates Principle 1. Flag this as a test assertion, not a redesign.

**P4 — Task 2.4 collapse-tier `.els` migration → FLAG: MAJOR (Principle 5 — persisted-state/contract safety + Principle 3 nothing-fake under-specified).** Two sub-flags:
   - *Migration is dual-sided, plan treats it as JS-only.* Confirmed the host reads `collapsed` (`:6447`) and the bridge is `elementNodeSetCollapsed(bool)` (host `:2891`, JS `nativeGraph.ts:475`). The enum widening must change the host serializer + the bridge signature + carry old-boolean `.els` files. The plan's migration covers only the JS store. Severity MAJOR because a one-sided migration silently corrupts the round-trip: an old `.els` with `collapsed=true` must deterministically become `tier='title'` on *both* read paths, and a new `tier` must serialize to something an *old* build can still open (or you accept a forward-incompatible bump — a decision to surface). This is S3's split-out contract task.
   - *Collapsed-socket "nothing-fake" rule needs an engine-truth check.* The plan adopts Blender's "don't drop cables when collapsed to title" rule — good UX, but the cables must remain **real engine connections**, not a visual stub that hides a severed `Arc`. The test must assert the engine connection survives (not just the React edge), or it risks a Principle-3 (nothing-fake) violation where the UI shows a cable that the engine no longer routes. The plan's test ("cables still present/rerouted, not orphaned") is webview-framed; add the engine-connection assertion.

**P5 — Task 3.A name single-emit-point → PASS-WITH-NOTE (no violation; correctly diagnosed).** The plan and brief correctly locate this as a host-side single-emit-point fix (the serializer feeding `mapBlock`, `useJuceBridge.ts:249`) applying the N1 "prefer `PluginDescription.name`, never `descriptiveName`" rule, mirroring the already-correct browser side. The mechanical guard (`InspectorHub.name === Block.name`) is the right gate. **Note (ties to Antithesis A):** the guard must be specified to handle the *loading* node state from Phase 4 — assert it for a *ready* node, and separately define what name a loading node carries, or the guard becomes flaky once Phase 4 lands. Also confirm the single emit point genuinely is single: the diagnosis names the `mapBlock`-feeding serializer, but `findKnownPluginByIdentifier` is called in multiple places (host `:1981`, `:2050`, `:6407`) — verify the *name* (not category) is emitted from one function before claiming "single-emit-point," else the fix leaks.

---

## 5. SOUNDNESS VERDICT

**SOUND-WITH-AMENDMENTS.**

The plan's sequencing thesis (Option A) is correct, its diagnostics are real and accurately cited, its pre-mortem is genuinely deliberate, and its risk-isolation instinct is right. It is *not* unsound — but it ships with one factual inaccuracy that endangers its top principle and one hidden cross-lane dependency, both of which would cause rework or an RT regression if executed as written.

**Enumerated amendments for the Planner to fold in (priority order):**

1. **[BLOCKING] Re-author Task 4.1's swap mechanism (S2/P1).** Remove "use the existing atomic node-replace path." State the truth: there is no existing swap; `createPlaceholder` is a terminal offline state today; the RT-safe swap is a **topology change** (remove placeholder / add real, nodeId-preserving) that rides the existing `triggerAsyncUpdate → buildRenderingSequence → exchange(acq_rel)` whole-graph op republish (graphnode.cpp:427/491/633) — **never** a direct write to `activeRenderingOps`. Add the explicit nodeId-reuse decision (write a real `replaceNode` primitive, or add-then-remap) as a named sub-task with the verifier gate.

2. **[BLOCKING] Add Phase 0 contract spec (S1).** One page: the loading-node snapshot shape (loadState, name-while-loading, port-availability, cable-targetability, collapsibility) so Phases 2/3 build against the final contract. No code.

3. **[HIGH] Split out "Task 2.0 — collapse-tier state contract" (S3/P4).** The dual-sided ValueTree migration + bridge-signature change + on-disk `.els` back-compat, reviewed once, landing before both 2.4-render and 3.E-pin. Make the 2.4→3.E dependency explicit; demote Phase 3's "fully parallel with Phase 4" claim to "parallel *except* 3.E depends on 2.0/2.4."

4. **[HIGH] Re-scope Task 1.2 (Tension 2/P2).** Name the listener-narrowing as the window-drag fix and the output-dedupe as general-churn mitigation; note Task 1.3 must co-land to cheapen pushes that fire; add the host test that the ignore-filter applies only on the under-root branch and does not touch `shouldIgnoreSessionRootProperty`.

5. **[MED] Move Phase 4 to its own branch merged last (S4).** Honours Driver 2 better than the long-lived-branch default.

6. **[MED] Add engine-truth assertions (P3, P4-socket, P5):** 2.3 resolve runs on drag-*stop* not per-tick + glow is intersection-change-keyed; 2.4 collapsed-socket asserts the *engine* connection survives; 3.A guard handles the loading-node name and verifies the emit point is genuinely singular.

7. **[LOW] Tag interim code (S5):** mark the Task 1.5 backoff array + test as removed-by-4.2.

None of these change the *strategy* — they harden the two contract surfaces (node-lifecycle and collapse-tier) the plan treats as local but are actually cross-cutting, and they correct the one statement that could lead an executor into an RT hazard.

---

## Key file:line references (spot-checked, for the Planner/Critic)

- `src/engine/graphmanager.cpp:392-397` — `createPlaceholder`; **only caller is `:698`** (terminal offline/missing state in `setNodeModel`), NOT a transient swap.
- `src/nodes/placeholder.hpp:11-99` — `PlaceholderProcessor` is a permanent bypass stub, `hasEditor()==false`, `createEditor()→nullptr`; nothing swaps it out today.
- `src/engine/graphnode.cpp:427,491,633` — the real RT primitive: `buildRenderingSequence()` rebuilds the whole-graph op array, publishes via `exchange(acq_rel)` at `:491`, audio thread reads `load(acquire)` at `:633`; driven by `triggerAsyncUpdate()` on `addNode`/`removeNode` (`:109`, `:238`). This is what "RT-safe swap" must mean.
- `src/pluginmanager.cpp:1080` — confirmed **blocking** `createPluginInstance`; `createPluginInstanceAsync` used nowhere (perf-diag #1 accurate).
- `src/messages.cpp:18-61` — `AddPluginAction::perform()` is fully synchronous; this is the undo unit Task 4.1 must keep single-step across an async load.
- `src/ui/element_webview_host.cpp:6003-6024` — `shouldIgnoreSessionRootProperty` filters the **root** tree only (`:6005`, everything except tempo/name); the under-root branch (`:6022`) pushes on any prop — Task 1.2's narrowing target, confirmed.
- `src/ui/element_webview_host.cpp:6119-6134` — `pushGraphSnapshot`: no output-diff gate, confirmed (perf-diag #2 accurate).
- `src/ui/element_webview_host.cpp:2891` (`elementNodeSetCollapsed` bridge) + `:6447` (host reads `collapsed` into snapshot) — proves Task 2.4 migration is dual-sided, not JS-only.
- `webview/src/data/types.ts:62` — `collapsed?: boolean` confirmed; persisted in Node ValueTree per `:57` comment.
- `webview/src/stores/useGraphStore.ts:600-627` — `setCollapsed(nodeId, boolean)` with optimistic-set + bridge-reject rollback; the shape Task 2.4 must widen to a tier.
- `webview/src/stores/useAppStore.ts:225` — `partialize: () => ({})` confirmed (Task 3.B / brief §4.4 accurate).
- `src/messages.cpp:209-218` — `SpliceConnectionMessage::createActions` confirmed as the 3-action single-undo splice (carry-over `9e0d4f62`).
