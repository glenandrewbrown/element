# RALPLAN CRITIC RE-REVIEW (v2) — Wave 3 "Lean & Fast UX" Plan (DELIBERATE mode)

**VERDICT: APPROVE** — every CRITICAL/MAJOR finding from the v1 ITERATE review and all 7 architect amendments are folded faithfully and accurately to the source. One MINOR editorial dangling reference (`§6 staffing` — no §6 exists) does not block; fix in passing. The plan is APPROVABLE for the owner.

**Date:** 2026-06-08
**Reviewer:** Critic (ralplan consensus loop, DELIBERATE — also absorbing the architect re-pass, since v2 used the critic's CRITICAL-1 to correct architect amendment #1).
**Plan:** `.omo/plans/wave-3-leanfast-ux-plan-2026-06-08.md` (v2, 428 lines).
**Method:** Verified each prior finding traced into v2 by section; re-grepped the new line citations that v2 introduced for the two highest-risk corrections (did not re-verify the full ledger — that was done in v1 and the source is unchanged); hunted for new contradictions the v2 edits could have created.

**New-citation re-verification (the corrections that carry the most weight):**
- `element_webview_host.cpp:506` → `row->setProperty ("nodeId", objs.node.getUuidString())` ✓ (the JS "nodeId" IS the UUID — CRITICAL-1's foundation confirmed in v2's exact citation).
- `:279` `findNodeByUuidInGraph` ✓. `node.cpp:278` mints `Uuid().toString()` ✓; graphmanager `addNode` sets no `tags::uuid` (grep empty) ✓ → confirms the `replace` desc-overload mints a NEW uuid, validating the "do NOT reuse `EngineService::replace`" rule.
- Collapse dual-sided: bridge writes `collapsed` bool (`:2904`), host reads `collapsed` into snapshot (`:6450`) ✓.

---

## PER-FINDING FOLD-CHECK

### CRITICAL-1 — swap preserves UUID not nodeId — **FOLDED ✓ (faithful + complete)**
All six sub-requirements present and source-accurate:
1. **UUID not nodeId:** Task 4.1 ⚠️ IDENTITY CONTRACT (`:257`), Principle 4 identity invariant (`:25`), pre-mortem F1 (`:322`), ADR (`:385`). Names `:506`/`:279` correctly.
2. **Placeholder carries the FINAL uuid:** `:259`, `:263-264`, `:267`, test `:357`.
3. **In-place ValueTree swap (write into the SAME tree, swap `tags::object`/type/ports):** `:259`, `:267`, `:322`.
4. **Explicit "do NOT reuse `EngineService::replace`/`ReplaceNodeMessage`":** `:258` (with the `engineservice.cpp:1490` + `graphmanager.cpp:438`→`node.cpp:278` mechanism), `:322`, ADR `:385`, revlog #1. This is exactly the anti-pattern callout I asked for — an executor who greps for prior art and finds `replace` is now explicitly warned off.
5. **In-place `tags::object` swap must trigger the op-republish (the open-question caveat):** `:260` ("an in-place `tags::object` swap on a stable ValueTree may NOT [trigger the republish] — verify/extend"), F1 `:324`, test `:359`, ADR open-question #2 (`:405`). The plan correctly elevated this to "the single highest-uncertainty engineering point."
6. **Headline test = "preserves UUID + Block doesn't detach":** `:270`, `:322`, §3 `:356-357` (incl. the anti-regression assert that `replace` CHANGES the uuid).

No gap. This is the finding that mattered most and it is fully and correctly folded.

### CRITICAL-2 — loading-node contract (Phase 0) — **FOLDED ✓**
Phase 0 Task 0.1 (`:79-88`) answers all required decisions: (a) NOT cable-targetable until `loadState==='ready'` (disable handles) — `:82`; (b) honest face, ZERO meters, ZERO fake ports — `:83`; (c) on-ready port/param population + re-trigger republish — `:84`, `:265`; (d) loading name from catalog `PluginDescription.name` — `:85`, `:207`; (e) loading tier = Title-only — `:86`, `:190`. New `loadState?:'loading'|'ready'` field with absent⇒'ready' back-compat (`:87`). Engine-truth test named (`:88`, `:358`). The root cause I cited (`PlaceholderProcessor::setupFor` derives ports from saved data the new plugin lacks, `placeholder.hpp:43`) is carried at `:80`, `:263`.

### CRITICAL-3 — Phase 3 parallelism demoted + Task 2.0 split — **FOLDED ✓**
"Fully parallel" demoted to "file-parallel with Phase 4's *implementation*, contract-coupled; 3.E depends on 2.0/2.4" in all four places it appeared: Option A pros (`:40`), recommendation (`:51`), Phase 3 header (`:198-200`), ADR consequences (`:399`). Task 2.0 extracted as a standalone state-contract pre-req (`:152-158`) sequenced 2.0→2.4 (`:150`, `:189`) and 2.0→2.4→3.E (`:235`). Phase 0 Task 0.2 specs the dual-sided migration (`:90-93`). The 2.0→2.4→3.E ordering is stated consistently in every relevant location (verified by grep — no contradiction).

### MAJOR-4 — connection retention — **FOLDED ✓**
Resolved exactly as recommended: forbid connecting to a loading node until ready ⇒ nothing to re-bind (`:268`, `:325`, revlog #4). The lossy `getPortForChannel` remap is correctly cited (`engineservice.cpp:1509–1534`, `:268`). Engine-connection assertion (not React-edge) required if connect-while-loading is ever wanted (`:268`).

### MAJOR-5 — Task 1.2 re-scope — **FOLDED ✓**
Listener-narrowing named as THE window-drag fix; output-dedupe demoted to general-churn; Task 1.3 must co-land (`:108-118`). Host test writes `windowX` AND `tags::x` on the SAME node ValueTree → exactly one pushes (`:117`, `:365`). Ignore-filter on the `vtIsUnderSessionRoot` branch (`:6022`) ONLY, must not touch `shouldIgnoreSessionRootProperty` (`:6003`) — `:113`, `:365`. The filter-by-identifier subtlety (window-chrome and block-position can share a node tree) is carried at `:113`.

### MAJOR-6 — host-file serialisation — **FOLDED ✓ (strengthened beyond what I asked)**
Dedicated HOST-FILE SERIALISATION RULE block (`:71-72`) enumerating all FIVE tasks (1.2/1.3/3.A/4.1/4.2); one-actor rule; host-side 1.2/1.3/3.A as a serialized sub-lane BEFORE forking Phase 3 ‖ Phase 4. Pre-mortem F3 strengthened with the live worktrees + uncommitted-D1 evidence (`:342-347`). Commit-D1-first is the wave's first action (`:57`, `:69`, `:344`).

### Architect's 7 amendments — **ALL FOLDED ✓**
1. (=critic CRITICAL-1, corrected) — folded as above.
2. (=Phase 0 spec) — folded as CRITICAL-2.
3. (=Task 2.0 split + demote parallel) — folded as CRITICAL-3.
4. (=Task 1.2 re-scope) — folded as MAJOR-5.
5. **Phase 4 own branch, merged last:** header (`:6`), branch-strategy (`:54-56`), Phase 4 header (`:252`), ADR (`:385`, `:393`). Git-orphan counter-arg noted weak with the verified-ancestor fact.
6. **Engine-truth assertions:** 2.3 `resolveCollisions` on `onNodeDragStop` one-shot NOT per-tick + glow class-toggle keyed on intersection-set CHANGE (`:182`, `:184`); 2.4 collapsed-socket asserts the engine `Arc` survives (`:193`, `:371`); 3.A verifies single-emit + handles loading-node name (`:206`, `:209`). All present.
7. **Tag interim code:** Task 1.5 backoff array + test marked `// INTERIM: removed by Task 4.2 ready-push` (`:139`).
- **Guard `__tests__/` paths corrected** (my ledger note): Principle 5 (`:26`) + cross-cutting gates (`:379`) now use the real `webview/src/__tests__/terminologyGuard.test.ts` and `…/canvas/__tests__/Cable.painter.test.tsx`/`Block.gaps.test.tsx`.

### Open questions carried forward — **FOLDED ✓**
All four of my v1 Open Questions are carried into the ADR follow-ups (`:402-410`): confirm `replace` mints new uuid (#1, with a cheap pre-build proof at `:329`), in-place `tags::object` republish trigger (#2), 3.A single-emit verification (#3), owner forks 4.3 + brief §7 (#1/owner). The pre-mortem even adds the one-node `replace`+uuid-assert as a pre-build cheap proof (`:329`) — a nice hardening I didn't explicitly request.

---

## NEW ISSUES INTRODUCED BY v2

**N-1 (MINOR, editorial) — dangling internal reference "§6 staffing" (`:51`).** The recommendation says "staff accordingly (see **§6 staffing** + the MAJOR-6 host-file serialisation rule)." There is no §6 — the plan's sections are 0, 1, 2, 3, 4 (ADR), Revision log. The staffing substance actually lives in the HOST-FILE SERIALISATION RULE (`:71`) and pre-mortem F3 (`:342`), both of which the same sentence also names. So the pointer is wrong but the content it points to exists and is co-cited. **Why it's only MINOR:** no contract, sequencing, or correctness impact — a reader is routed to the right material by the adjacent "MAJOR-6 host-file serialisation rule" clause. **Fix:** change "see §6 staffing" → "see the HOST-FILE SERIALISATION RULE (§1) + pre-mortem Failure-3 (§2)", or drop "§6 staffing". Not a blocker.

**Checked and CLEAR (no new defect):**
- Residual `nodeId` language: the only non-corrective mention is Option B's "nodeId resolution" (`:45`), which is generic and correct ("the surface that, if broken, makes every other task hard to verify"). All other `nodeId` mentions are the deliberate UUID-corrective callouts. No stale "preserve nodeId" instruction survives.
- `§7` references (`:221`, `:239`, `:248`, `:403`, `:428`) all resolve to the external brief's §7 (`left-panel-redesign-2026-06-08.md §7`), surfaced as owner decisions — valid, not dangling.
- `§2`/`§3` internal references (e.g. `:133`, `:269`, `:270`) resolve to the pre-mortem (§2) and expanded test plan (§3) — valid.
- 2.0/2.4/3.E sequencing is internally consistent across all 7 locations it appears (grep-confirmed) — no contradiction between the Phase-2 header, Task 2.0/2.4/3.E "Depends on" lines, and the ADR drivers.
- Phase 0 introduces `loadState` and Phase 2 introduces `collapseTier`; both are described identically in the Phase 0 spec, their implementing tasks (4.1 / 2.0), and the test plan — no shape drift between spec and task.
- Interim-vs-replace split (1.5 → 4.2) is coherent and the throwaway is tagged.

---

## RALPLAN GATE (v2)

- **Principle↔option consistency:** PASS. Principle 4 (RT) is now upheld by *correct* wording (the dangerous "publish through the atomic-ops path" reading is gone; the topology-change-rides-republish mechanism + "never write `activeRenderingOps`" + the in-place-swap trigger caveat are explicit). Principle 3 (nothing-fake) is upheld by the loading-node contract (no fake ports/meters) and the collapsed-socket engine-`Arc` assertion. Principle 6 (contract-first) was added and is genuinely load-bearing.
- **Fair alternatives:** PASS. A/B/C plus the two new rejections (no-Phase-0-contract; Phase-4-on-shared-branch) are honestly weighed and dominated, not strawmanned.
- **Risk-mitigation clarity:** PASS. The MED-HIGH async-load now has the correct identifier, the connection-retention escape hatch, the republish-trigger verification, own-branch isolation, and a separate model=opus RT review. Concrete and complete.
- **Testable acceptance:** PASS. The two that were soft in v1 are fixed: 4.1 = "preserves UUID + Block doesn't detach"; 1.2 = same-node-tree test.
- **Concrete verification:** PASS. Build+force-bundle-8+reinstall, vitest, story-tests, ctest, guards (correct paths), painter vitests — all real, in-tree.
- **DELIBERATE pre-mortem (3 scenarios):** PASS. F1 is rewritten around the real (UUID-churn) failure with a layered mitigation list incl. a cheap pre-build proof. F2/F3 retained and F3 strengthened with live evidence.
- **DELIBERATE expanded test plan (unit/integration/e2e/observability):** PASS. All four layers present for 4.1, plus the UUID-stability, no-connectable-ports-while-loading, republish-trigger, and `replace`-changes-uuid anti-regression asserts I asked for.

---

## SELF-AUDIT

The single APPROVE-gating judgement is whether the v2 folds are faithful AND source-accurate. I re-grepped the three highest-leverage new citations (`:506`, `node.cpp:278`+graphmanager, `:2904`/`:6450`) and they hold; the rest of the ledger is unchanged source from v1. N-1 is HIGH-confidence (I enumerated every `##` header — there is no §6) and correctly rated MINOR (content co-cited, no correctness impact). No finding is being kept alive out of hunting momentum: I actively looked for new contradictions (residual nodeId, sequence drift, shape drift, dangling refs) and found only the one editorial pointer.

---

## APPROVABILITY

**Yes — APPROVE for the owner.** v2 folds all of v1's CRITICAL-1/2/3 + MAJOR-4/5/6 and all 7 architect amendments faithfully, with the new line citations verified against source; it correctly uses the critic's CRITICAL-1 to override the architect's mis-identified amendment #1. The strategy was already sound; the two cross-cutting contract surfaces (node-lifecycle UUID identity + collapse-tier dual-sided migration) are now hardened with written specs, correct identifiers, and engine-truth tests. The only residual is one MINOR dangling "§6 staffing" pointer (N-1) whose content is co-cited in the same sentence — fix in passing, do not gate on it. Ship to the owner; the listed owner-decision forks (4.3 editor model; brief §7) and the three cheap pre-build confirmations (open questions #1–#3) are correctly surfaced as execution-time gates, not plan defects.

---
*Ralplan summary row (v2):*
- **Principle/Option Consistency:** Pass — Principle 4 now upheld by correct RT wording; Principle 6 (contract-first) added and load-bearing.
- **Alternatives Depth:** Pass — A/B/C + 2 new rejections honestly dominated.
- **Risk/Verification Rigor:** Pass — headline risk now targets the right identifier (UUID), with retention escape-hatch, republish-trigger verification, own-branch isolation, separate opus RT review.
- **Deliberate Additions:** Pass — pre-mortem F1 rewritten around the real failure; expanded test plan adds UUID-stability + no-ports-while-loading + republish-trigger + replace-anti-regression asserts.
