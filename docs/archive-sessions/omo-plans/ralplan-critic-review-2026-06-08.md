# RALPLAN CRITIC REVIEW — Wave 3 "Lean & Fast UX" Plan (DELIBERATE mode)

**VERDICT: ITERATE** — approvable once the architect's 7 amendments PLUS the 4 critic must-fixes below are folded. The strategy (Option A) is sound and B/C are genuinely dominated; the plan is materially accurate in its diagnostics; but the Phase 4 swap is mis-specified in a way that, left as written, would detach the user's just-added Block (UUID-identity bug) and could lead an executor into an RT hazard. These are contract corrections, not strategy changes. Do NOT send to the owner until folded.

**Date:** 2026-06-08
**Reviewer:** Critic (ralplan consensus loop, DELIBERATE — reliable fallback for the wedged Codex critic)
**Mode used:** Started THOROUGH, escalated to ADVERSARIAL after confirming one CRITICAL (UUID-identity) + the architect's MAJOR Phase-4 mis-statement (systemic pattern: both docs conflate the engine's two identity systems). Expanded scope into `EngineService::replace`, `addNode` UUID minting, and the webview identity model, none originally in scope.
**Plan format:** Markdown plan (valid). Not YAML. Accepted.

---

## SPOT-CHECK LEDGER (independently verified, not trusting either doc)

| Claim | Source verified | Verdict |
|---|---|---|
| `createPlaceholder` exists; one caller `:698`, terminal offline state | `graphmanager.cpp:392`, `:698` | ✓ architect correct |
| `PlaceholderProcessor` = permanent stub, `hasEditor()==false`, `createEditor()→nullptr`; `setupFor` derives ports from SAVED node | `placeholder.hpp:43,98,99` | ✓ |
| `pluginmanager` uses BLOCKING `createPluginInstance`; `createPluginInstanceAsync` used nowhere | `pluginmanager.cpp:1078`; grep | ✓ perf-diag #1 accurate |
| Task 1.2 — `shouldIgnoreSessionRootProperty` filters ROOT only (`!=tempo && !=name`); under-root branch (`vtIsUnderSessionRoot`) pushes on ANY prop | `element_webview_host.cpp:6003`, `:6022` | ✓ |
| `pushGraphSnapshot` has NO output-diff gate | `:6119` | ✓ perf-diag #2 accurate |
| Task 2.4 collapse is DUAL-SIDED: bridge `elementNodeSetCollapsed` writes bool `:2904`; host reads `collapsed` into snapshot `:6450` | `:2891`, `:2904`, `:6450` | ✓ architect correct, MAJOR |
| D1 diff present & uncommitted | `GraphCanvas.tsx:1296,1302,1303,1304` | ✓ |
| Task 2.2 `onConnect` clean (just `nativeGraphConnect`, no replace/dedupe); `onConnectEnd` early-returns on `isValid===true` | `GraphCanvas.tsx:903,960` | ✓ |
| `findNodeByUuidInGraph` exists; webview keys nodes by **UUID** (`getUuidString`), snapshot emits `nodeId = node.getUuidString()` | `:279`, `:506` | ✓ — and see CRITICAL-1 |
| `AddPluginAction` wraps `addPlugin` synchronously = the single undo unit | `messages.cpp:15,27,54` | ✓ |
| Webview add rides `AddPluginMessage` (sync path) | host `:1987`, `:2072` | ✓ |
| Painter + terminology guards exist | `__tests__/Cable.painter.test.tsx`, `__tests__/Block.gaps.test.tsx`, `__tests__/terminologyGuard.test.ts`, `util/check_terminology.py` | ✓ (note: under `__tests__/` subdir; plan's paths drop the subdir) |
| Task 1.1 `POLL_INTERVAL_MS = 33`; Task 1.5 `[0,150,400,800,1500]` | `useNodeSpectrum.ts:11`; `nativePluginEditor.ts:13` | ✓ |
| Splice `9e0d4f62` is ancestor of HEAD; on `wave-3-leanfast-ux` | `git merge-base --is-ancestor` = YES | ✓ branch claim accurate |
| **`EngineService::replace(node,desc)` EXISTS** — add-new+rewire-connections+remove-old, SYNCHRONOUS, mints a NEW uuid | `engineservice.cpp:1490`, `services.cpp:358` | ✗ **architect's "there is no node-replace/swap path" is WRONG** — see CRITICAL-1 |

---

## MUST-FIX FINDINGS (numbered)

### CRITICAL-1 — The swap must preserve the node **UUID**, not the engine `nodeId`. Both the plan AND the architect name the wrong identifier, and an existing `replace` path proves a naive implementation detaches the Block. (Task 4.1; corrects architect amendment #1)

**What's wrong.** The webview resolves every Block by its persistent ValueTree **UUID** (`findNodeByUuidInGraph`, `element_webview_host.cpp:279`; the snapshot literally emits `nodeId: node.getUuidString()` at `:506`). The engine's integer `nodeId` is a *separate*, transient identifier. The plan repeatedly says "preserve the assigned `nodeId` so the webview UUID resolves" (Task 4.1 key files; pre-mortem Failure-1); the architect escalates this to "the single highest-uncertainty engineering decision … reusing requires a real `replaceNode(nodeId, newProc)` primitive." **Both are aiming at the wrong identifier.** The thing that must survive the placeholder→real swap is the **UUID**, because that is what the React Block is keyed on. Engine `nodeId` can change freely as long as the UUID is stable.

This matters enormously because there is already a node-replacement path that demonstrates the trap concretely:
- `EngineService::replace(node, desc)` (`engineservice.cpp:1490`) does exactly an add-new → rewire-connections → remove-old dance. It calls `ctl->addNode(&desc, x, y)` (the desc overload, `graphmanager.cpp:438`), which builds a fresh `ValueTree(types::Node)` that does **not** carry the old node's `tags::uuid`; the new node gets a freshly-minted UUID via `node.cpp:278`/`:489` (`Uuid().toString()`). So `replace` changes the UUID. If Task 4.1 reuses `replace` (or copies its shape) as the swap, **the webview Block the user just dropped will detach the instant the real plugin loads** — i.e. exactly the "just-added plugin vanishes" symptom the pre-mortem Failure-1 warns about, but caused by UUID churn, not nodeId churn.

**Why it matters.** This is the headline feature of the whole wave (async load + placeholder + swap). If the identity contract is specified against the wrong key, the executor builds a swap that passes a nodeId-preservation test and still makes Blocks disappear in the live app. It also silently invalidates the Task 3.A name-coherence guard and any selection state pinned to that UUID.

**Concrete change.**
1. Re-author Task 4.1 and pre-mortem Failure-1 to say **"preserve the node UUID across the swap"** (not nodeId). The integer nodeId is free to change.
2. Make the placeholder node carry the FINAL uuid from creation (so the snapshot Block is stable from the first frame), and require the real-processor swap to write into that same ValueTree (keep the uuid, swap `tags::object`/`tags::type`/ports), NOT add-a-new-node-and-remove-old. The existing `replace` is the **anti-pattern** to avoid here, not the path to reuse — call that out explicitly so nobody wires Task 4.1 through `ReplaceNodeMessage`.
3. Keep the architect's correct RT mechanism (the swap is a topology change that rides the whole-graph op republish in `graphnode.cpp:427/491/633`; never write `activeRenderingOps` directly), but note that an *in-place processor swap on a stable ValueTree* still has to trigger that republish (today `addNode`/`removeNode` → `changed()` does; an in-place `tags::object` swap may not — verify/extend the trigger).
4. The plan's existing test "the swap preserves nodeId" must become "the swap preserves the **UUID** and the webview Block does not detach."

**Confidence: HIGH.** Direct source: `:506` (snapshot emits uuid), `:279` (resolve by uuid), `engineservice.cpp:1490` + `graphmanager.cpp:438` + `node.cpp:278` (replace mints new uuid).

---

### CRITICAL-2 — A freshly async-loaded plugin has NO saved port layout, so the placeholder cannot present real ports until load completes — the plan's "draw a cable to a loading node" and "honest loading face" are under-specified and risk a nothing-fake violation. (Task 4.1 + Phase 0 contract; sharpens architect Antithesis A)

**What's wrong.** `PlaceholderProcessor::setupFor(node, …)` (`placeholder.hpp:43`) derives its port layout from the **saved** node data. That works for the existing caller (`:698`, a session-load offline plugin whose ports were persisted in the `.els`). But Task 4.1's case is a **brand-new** plugin being added live: there is no saved port count/layout until the async `createPluginInstance` returns and `enableAllBuses()` runs. So during the loading window the Block either (a) shows zero/guessed ports, or (b) shows ports it cannot yet honour. The plan says "add a transient honest 'loading' face" and Task 2.2/onConnect lets a user draw a cable to any node — but a cable drawn to a loading node targets a placeholder whose real ports don't exist yet. There is no `loadState`/`loading` concept anywhere in `types.ts` or the host snapshot today (grep confirms zero hits) — this is a net-new schema field, validating the architect's Phase-0 amendment.

**Why it matters.** Three concrete failure modes the plan doesn't resolve: (1) a cable connected to the loading node's guessed port may dangle or mis-map when real ports arrive (the engine `Arc` would reference a port index that changes); (2) "nothing-fake" (Principle 3) is at risk if the loading face shows port stubs that aren't real engine ports; (3) the collapse-tier (2.4) and inspector (3.E) must render *something* for a node with a `PlaceholderProcessor` and no params.

**Concrete change.** The Phase-0 contract spec (architect amendment #2) MUST explicitly answer, and Task 4.1 MUST implement: (a) is a loading node **cable-targetable at all** before ready? Recommend NO — disable its handles until ready, which also sidesteps the port-remap problem; (b) what does its face show (recommend: name + a real "loading…" indicator, zero meters, zero fake ports); (c) on ready, how are ports/params populated and does that re-trigger the op-republish. Add an engine-truth test: a loading node exposes no connectable ports until `loadState==='ready'`.

**Confidence: HIGH.** Source: `placeholder.hpp:43` (port layout from saved node), grep (no `loadState` exists), `onConnect`/handle wiring `GraphCanvas.tsx:903`.

---

### CRITICAL-3 — Phase 3 is NOT parallelisable with Phase 4 as claimed; the hidden 2.4→3.E dependency AND the shared loading-node contract couple the lanes. (Concur with architect HIGH amendment #3, strengthen it)

**What's wrong.** The plan asserts in three places that Phase 3 (panel redesign) "can run concurrently with Phase 4" by a separate actor (Option A pros; Phase 3 header; ADR consequences). Two real couplings break this:
1. **2.4→3.E (architect found this):** Task 3.E's pin-to-face surfaces pinned params "on the Block Macro tier **from Task 2.4**." The Macro tier does not exist until 2.4 widens the enum. So 3.E sits on Phase 2's substrate — confirmed by reading 3.E's own key-files note. Phase 3 is not free-standing.
2. **Loading-node contract (critic adds):** Task 3.A's name-coherence guard (`InspectorHub.name === Block.name`) and 3.E's selection-routing both consume the snapshot for the selected node. Once Phase 4 introduces the `loadState` field, both must tolerate a node that is `loading` (no name yet? placeholder name? no params?). If Phase 3 is built and "done" before Phase 4's contract lands, 3.A's guard and 3.E's routing get re-verified and possibly re-coded — the exact rework the architect's Phase-0 spec exists to prevent. So Phase 3 is coupled to Phase 4 through the *contract*, even though their *files* are disjoint.

**Why it matters.** "Parallelisable" is load-bearing in the ADR's calendar-time argument and in the concurrent-agent staffing plan. If two actors run Phase 3 ‖ Phase 4 against an unspecified loading-node shape, you get either rework or a flaky name-guard — and you raise the concurrent-agent contention risk the pre-mortem Failure-3 already flags.

**Concrete change.** Adopt architect amendment #3 (extract "Task 2.0 — collapse-tier state contract" landing before BOTH 2.4 and 3.E) AND amendment #2 (Phase-0 loading-node spec). Then explicitly downgrade the claim to: **"Phase 3 is file-parallel with Phase 4's *implementation*, but both build against the Phase-0 contract; 3.E additionally depends on Task 2.0/2.4."** Sequence 2.0 before 3.E in the staffing plan.

**Confidence: HIGH.** Source: plan 3.E key-files ("from Task 2.4"); grep (no loadState); architect §3 S3.

### MAJOR-4 — Connection retention across the swap is unspecified, and the existing `replace` proves it is lossy for multi-fan-out / mismatched port layouts. (Task 4.1)

**What's wrong.** When the placeholder swaps to the real processor, the cables already drawn to the placeholder must re-bind to the real plugin's ports. `EngineService::replace` (`engineservice.cpp:1509–1534`) shows the existing retention logic: it loops connections and re-maps each via `getPortForChannel(portType, channelPort, isInput)`. This works only when the new processor's channel layout matches the old one's by `(type, channel, direction)`. For an async-loaded *new* plugin (CRITICAL-2: ports unknown until ready), the placeholder's guessed ports won't map cleanly, and the retention loop will silently drop cables whose ports don't resolve (`getPortForChannel` returns an invalid port → `addConnection` no-ops). The plan's Task 4.1 says nothing about connection retention across the swap; it only mentions undo and nodeId.

**Why it matters.** A user who drags a cable onto a loading Block, then watches the plugin finish loading, could find the cable silently gone — a nothing-fake-adjacent surprise and a data-integrity bug in the headline feature.

**Concrete change.** Either (recommended, ties to CRITICAL-2) forbid connecting to a loading node until ready — then there are no cables to retain and the problem disappears; or specify the retention rule explicitly in the Phase-0 contract and test it (draw cable to loading node → after ready, cable targets the correct real port; if the real port doesn't exist, surface it honestly, don't silently drop). Add an engine-connection assertion (not just a React-edge assertion).

**Confidence: HIGH.** Source: `engineservice.cpp:1509–1534` (lossy remap), `placeholder.hpp:43`.

---

### MAJOR-5 — Task 1.2 efficacy + the under-root/root filter-conflation risk (concur with architect amendment #4, with one addition)

**What's wrong.** Concur fully with the architect: (a) the output-dedupe does NOT fix the window-drag symptom because the build (incl. the Task 1.3 O(N·types) scan) still runs every frame — only the **listener-narrowing** prevents the push being *scheduled*; (b) Task 1.3 must co-land to cheapen pushes that do fire; (c) the host test must assert the new ignore-filter applies ONLY on the `vtIsUnderSessionRoot` branch (`:6022`) and does NOT touch `shouldIgnoreSessionRootProperty` (`:6003`), which currently filters everything-except-tempo/name on the ROOT tree — conflating them would drop legitimate root pushes. All verified against source.

**Critic addition:** the under-root narrowing must filter on the **property identifier**, but `valueTreePropertyChanged` at `:6022` currently does NOT inspect `prop` at all on the under-root branch — it pushes unconditionally. So the change is to add a `prop`-based ignore set there. The risk the plan under-states: window-chrome props (`windowX/windowY/windowVisible/windowOnTop`) and block-position props (`tags::x`/`tags::y`) may live on the **same** child tree (the node), so the filter must be by *identifier*, and the test must prove `tags::x` still pushes while `windowX` does not on that same node tree. The plan says this in prose but the acceptance test must pin it on a single node tree, not two different trees.

**Why it matters.** This is the actual fix for owner pain #4 (window-drag lag, "sluggish even when nothing changes"). Getting the filter wrong either fails to fix it (filters nothing) or breaks block-move sync (filters too much).

**Concrete change.** Adopt architect amendment #4 verbatim; add: acceptance test writes `windowX` AND `tags::x` on the **same** node ValueTree and asserts exactly one (the block-x) schedules a push.

**Confidence: HIGH.**

---

### MAJOR-6 — Concurrent-agent contention surface is LIVE right now, and the plan's own staffing (Phase 3 ‖ Phase 4) maximises it on the hottest files. (Pre-mortem Failure-3 — real, present)

**What's wrong.** Two `.claude/worktrees/agent-*` dirs exist in the tree right now (`agent-a1c2f24…`, `agent-ab4748a5…`), and the D1 diff is sitting uncommitted in the working tree (verified `GraphCanvas.tsx:1302`). The plan's pre-mortem Failure-3 correctly identifies this trap (it bit the W2 A-worker repeatedly per project memory) and its mitigations (commit D1 first, atomic stage+commit in one bash call, lane file-isolation, re-verify before commit) are good. But the plan ALSO recommends running Phase 3 ‖ Phase 4 with separate actors — and while their files are *mostly* disjoint, **`element_webview_host.cpp` is touched by Task 1.2 (dedupe), Task 1.3 (memo), Task 3.A (name-emit), Task 4.1 (snapshot loading face), AND Task 4.2 (ready-push)** — five tasks across three phases on ONE 6000+-line file. That is the single highest-contention file in the wave and the plan's "disjoint files" framing hides it.

**Why it matters.** A rogue `git reset` between tool calls or a concurrent worker clobbering `element_webview_host.cpp` mid-edit is the documented W2 failure, and this wave concentrates edits there.

**Concrete change.** Strengthen the pre-mortem mitigation: explicitly **serialize all `element_webview_host.cpp` edits to a single actor** (the plan hints at this for "where both need" the file, but doesn't enumerate that it's FIVE tasks). Commit D1 as the very first action (already Task 2.1 — good). Consider landing the host-side tasks (1.2/1.3/3.A) as one serialized sub-lane before forking Phase 3 ‖ Phase 4.

**Confidence: HIGH** (worktrees + uncommitted diff verified live).

---

## ARCHITECT AGREEMENT / GAPS

**Architect's 2 BLOCKING amendments:**

- **#1 (re-author Task 4.1 swap mechanism): CONCUR, with a material correction.** The architect is RIGHT that the plan's "use the existing atomic node-replace path" is dangerous wording and that the RT-safe mechanism is a topology-change riding `triggerAsyncUpdate → buildRenderingSequence → exchange(acq_rel)` (verified `graphnode.cpp:427/491/633`; never write `activeRenderingOps`). **But the architect is WRONG that "there is no node-replace/swap path" and overstates "net-new engineering."** `EngineService::replace` (`engineservice.cpp:1490`) IS a working node-replacement path (add-new+rewire+remove-old), already wired from the webview via `ReplaceNodeMessage` (`element_webview_host.cpp:2404`). It is the wrong tool for Task 4.1 (synchronous; mints a new UUID → CRITICAL-1; lossy connection remap → MAJOR-4), but it is prior art the executor will find, so the amendment must explicitly say "do NOT reuse `EngineService::replace`/`ReplaceNodeMessage` for the swap; it changes the UUID." Also the architect's "reuse nodeId" framing inherits the wrong-identifier error (CRITICAL-1): the contract is **UUID**, not engine nodeId.

- **#2 (Phase 0 loading-node contract spec): CONCUR, strengthen.** Verified there is zero `loadState`/`loading` concept today, and `PlaceholderProcessor` derives ports from saved data it won't have for a new plugin (CRITICAL-2). The spec is justified and must additionally answer cable-targetability + connection-retention (MAJOR-4) and port-population-on-ready, not just "name while loading."

**Architect's HIGH amendments:**
- **#3 (split Task 2.0 collapse-tier contract; demote 'fully parallel'): CONCUR, strengthen.** Verified dual-sided (`:2904` write, `:6450` read, bridge bool). Add: Phase 3 is also coupled to Phase 4 via the loading-node contract, not only via 2.4 (CRITICAL-3).
- **#4 (re-scope Task 1.2): CONCUR.** Verified the root/under-root filter split exactly. See MAJOR-5 for the one addition (test on a single node tree).

**Architect MED/LOW (#5 own branch, #6 engine-truth assertions, #7 tag interim): CONCUR.** #6's engine-connection assertion for the collapsed-socket rule (2.4) and the 3.A single-emit-point verification are correct and necessary. On #5 (Phase 4 own branch): concur it honours Driver 2 better; note the plan's git-orphan counter-argument is weak (cherry-pick is trivial) — verified `9e0d4f62` is a normal ancestor, easily cherry-picked.

**What BOTH the architect and the plan MISSED (critic-original):**
1. **The UUID-vs-nodeId identity error (CRITICAL-1)** — the single most important correction; both docs name the wrong identifier and an existing path proves it detaches Blocks.
2. **Connection retention across the swap is lossy and unspecified (MAJOR-4)** — the existing `replace` retention loop silently drops cables on port mismatch.
3. **Loading-node port availability (CRITICAL-2)** — `setupFor` needs a saved layout a new plugin lacks; cable-targetability of a loading node is unaddressed.
4. **`element_webview_host.cpp` is the 5-task contention hotspot (MAJOR-6)** — the plan's "disjoint files" framing hides it; worktrees are live now.

**Where the plan is genuinely solid (acknowledge, move on):** Option A sequencing is correct and the B/C rejections are sound (verified the reasoning, not rubber-stamped). The diagnostic citations are accurate to the line. Tasks 1.1, 1.5, 2.1, 2.2, 2.3, 3.B–3.F are well-targeted and correctly verified against source. The pre-mortem and expanded test plan are real and deliberate (DELIBERATE-mode requirement MET — not weak, not missing). The painter/terminology guard discipline is correctly carried.

---

## RALPLAN GATE CHECKS

- **Principle↔option consistency:** PASS-WITH-FIX. The five principles are upheld by the strategy, but Principle 4 (RT-safety) is *endangered by wording* (CRITICAL-1/architect P1) and Principle 3 (nothing-fake) is under-specified for loading nodes (CRITICAL-2, MAJOR-4). Fix the wording and the loading-node contract and this is clean.
- **Fair alternatives:** PASS. Options A/B/C are weighed honestly; B (risk) and C (rework + felt-impact) are genuinely dominated, not strawmanned. Branch-strategy alternatives also enumerated. Recommendation not rigged.
- **Risk-mitigation clarity:** PASS-WITH-FIX. The MED-HIGH async-load risk is concretely mitigated in the pre-mortem, BUT the mitigation aims at the wrong identifier (nodeId not UUID) and omits connection-retention + port-availability. Fold CRITICAL-1/2 + MAJOR-4.
- **Testable acceptance criteria:** PASS. Every task has a checkable acceptance. Two need sharpening: 4.1 ("preserves nodeId" → "preserves UUID, Block doesn't detach, cables re-bind or are blocked"); 1.2 (test on a single node tree).
- **Concrete verification steps:** PASS. Build + force-bundle-8 + reinstall, vitest, story-tests, ctest, guards, painter vitests — all real and present in-tree (verified the guard files exist).
- **DELIBERATE pre-mortem (3 scenarios):** PASS. Three concrete, plausible scenarios with real mitigations. Failure-1's mitigation list is good (separate verifier pass, model=opus, atomic-ops rule) — only the identifier is wrong.
- **DELIBERATE expanded test plan (unit/integration/e2e/observability):** PASS. All four layers present for the risky items, incl. the `GraphNodeLockFree`-extension integration test and ASan note. Add the UUID-stability + connection-retention + loading-node-port assertions.

---

## REALIST CHECK (severity pressure-test)

- **CRITICAL-1 (UUID):** Realistic worst case = the headline feature ships and Blocks vanish on load in the live app; detection is immediate in a feel-test but only AFTER build+install (expensive cycle on this project). No mitigating gate catches it pre-build because a nodeId-keyed test would pass. **Stays CRITICAL** — it breaks the wave's flagship feature and there's no upstream net.
- **CRITICAL-2 / MAJOR-4 (loading ports / retention):** Worst case = silent cable loss / fake ports = a nothing-fake breach on the headline feature. Mitigated *if* the contract forbids connecting-to-loading (cheap). **CRITICAL-2 stays CRITICAL** (blocks correct Phase-4 build without the spec decision); MAJOR-4 stays MAJOR (lossy but recoverable, and the forbid-connection fix is trivial).
- **CRITICAL-3 (parallelism):** Worst case = rework of 3.A/3.E + flaky guard, not data loss. Mitigated by the Phase-0/2.0 specs. This is really a planning-integrity CRITICAL (the ADR's calendar math depends on it) — kept CRITICAL for the *plan* even though its runtime blast radius is "rework," because it invalidates a stated parallelism guarantee the owner will staff against.
- **MAJOR-6 (contention):** Real and live (worktrees present), but the documented mitigations work when followed. **Stays MAJOR.**

No downgrades applied. No finding involves a severity I'm inflating from hunting momentum — each is anchored to a specific verified line.

---

## SELF-AUDIT

All four CRITICAL/MAJOR-with-evidence findings are HIGH confidence and source-anchored; none is a stylistic preference; none is refutable with context I'm missing (I read the actual `replace`, `addNode`, `setupFor`, and snapshot-emit code). CRITICAL-1's claim that `replace` mints a new UUID rests on `addNode(desc-overload)` building a fresh `ValueTree(types::Node)` without copying `tags::uuid` — I confirmed the desc-overload (`:438`) and the uuid-minting (`node.cpp:278/489`); the only residual is whether some later `stabilize` copies the source uuid, which I judge unlikely given `replace` explicitly carries over position/window props by hand but NOT uuid. Flagged in Open Questions for the executor to confirm empirically. Nothing moved to Open Questions for low confidence.

---

## OPEN QUESTIONS (unscored)

1. Confirm empirically (live or unit) that `EngineService::replace` changes a node's UUID (CRITICAL-1's mechanism). High-confidence from code; cheap to prove with a one-node replace + uuid-before/after assert.
2. Does an in-place `tags::object` swap (keeping the same ValueTree) trigger the GraphManager `changed()`/op-republish, or only `addNode`/`removeNode` do? (Determines whether the UUID-preserving swap needs a new explicit republish trigger — CRITICAL-1 step 3.)
3. Architect P5 note: verify the node **name** is emitted from exactly one serializer function before Task 3.A claims "single-emit-point" (`findKnownPluginByIdentifier` is called at host `:1981/:2050/:6407`). Not re-verified by critic; defer to the 3.A implementer.
4. Owner forks (already correctly surfaced by the plan, NOT critic blockers): Task 4.3 docked-drag vs floating window; brief §7 (empty-inspector rail vs Health; chips vs stacked; `Cmd+.` collision; per-app vs per-project persistence).

---

## APPROVABILITY

**Not yet — ITERATE.** Folding the architect's 7 amendments is necessary but NOT sufficient: the architect's amendment #1 itself must be corrected (UUID not nodeId; `replace` exists and is the anti-pattern), and three further contract gaps (CRITICAL-2 loading-node ports, MAJOR-4 connection retention, MAJOR-6 host-file contention) must be folded into the Phase-0 spec and pre-mortem. Once architect #1–#7 (with the CRITICAL-1 correction) + critic CRITICAL-2, CRITICAL-3, MAJOR-4, MAJOR-5-addition, MAJOR-6 are in, the plan is APPROVABLE for the owner — the strategy is sound, the rest is contract-hardening on the two cross-cutting surfaces (node-lifecycle + collapse-tier) that both the plan and the architect treated as local but are actually schema-wide. No re-plan required; one more revision pass.

---
*Ralplan summary row:*
- **Principle/Option Consistency:** Pass-with-fix — Principle 4 endangered by Task 4.1 wording (CRITICAL-1); Principle 3 under-specified for loading nodes (CRITICAL-2).
- **Alternatives Depth:** Pass — A/B/C honestly weighed; B/C genuinely dominated; branch alternatives enumerated.
- **Risk/Verification Rigor:** Pass-with-fix — concrete + mitigated, but the headline risk aims at the wrong identifier and omits retention/port-availability.
- **Deliberate Additions:** Pass — pre-mortem (3 real scenarios) and expanded test plan (unit/integration/e2e/observability) both present and credible; augment with UUID-stability + connection-retention + loading-port assertions.
