# Element — Recovery Plan (ralplan consensus) — 2026-05-31

**Status:** consensus APPROVED → **R0 IN PROGRESS** (Glen authorised "start R0 myself, now", 2026-05-31). R1+ still `pending approval`.

---

## R0 RESULTS (executed 2026-05-31) — ground truth

| Check | Result | Evidence |
|---|---|---|
| C++ incremental build (`build-merged`, `cmake --build . -j8`) | ✅ **exit 0** | bg task `bagpgv5bf` |
| webview build (`npm run build` = `tsc -b && vite build`) | ✅ **exit 0** | bg task `bltbmcj4l` |
| webview typecheck `tsc -b` | ✅ **0 errors** (was ~30+ at session start; **Toolbar.tsx source error fixed**) | verified twice post-fix |
| **Toolbar.tsx source fix** | ✅ done (2 lines: breadcrumb consumer accessed `.boardId`/`.label` on `string`) | executor; only `Toolbar.tsx` touched |
| Functional path: **session save/load** | ✅ **WIRED** end-to-end | `nativeSession.ts`; `element_webview_host.cpp:1863-1947`; `SessionService`; Toolbar New/Open/Save/As |
| Functional path: **add-block → audio** | ✅ **WIRED** | `elementGraphAddPlugin` → `messages.cpp` → `EngineService::addPlugin`; QuickAddPopup/ToolPalette |
| Functional path: **transport play/stop** | ✅ **WIRED** (control + state) | `elementTransportTogglePlay/Stop/Rewind` → `AudioEngine`; Toolbar:313-341 |
| `ctest` (C++) | ⏳ **131 tests discovered** (`ctest -N`); clean full run pending (earlier "47/47" was CORRUPTED OUTPUT — retracted) | clean run in progress |
| `vitest` (webview unit+storybook) | ⚠️ **1161 pass / 22 fail** (2 files: `CommentFrame.test` ×3 color hex-vs-rgb format; `Toolbar.gaps.test` ×19 BPM/transport/panic/session-name — the latter test file has PRE-EXISTING uncommitted edits expecting `liveHealth.bpm` + `120.00` formatting, a Toolbar↔perform-store drift) → triage in M0; not engine breakage |

**Breadcrumb correction (primary-source overrides Architect hypothesis):** the Architect *hypothesised* a "store-behind-source half-migration" (migrate `breadcrumbStack` to `{boardId,label}[]`). The executor's hands-on fix **disproved** it: `useGraphStore.breadcrumbStack` is canonically `string[]` (initial `["Main Project"]`, nav via `navigateToBreadcrumb(index)`); the bug was `Toolbar.tsx` wrongly treating crumbs as objects. Fixed Toolbar to the real `string[]` contract. **Richer board-id breadcrumb navigation = deferred to the M1 Breadcrumb (#24) component, not an R0 store migration.**

**Reskin-not-greenfield confirmed empirically:** all 6 MVP-slice components exist + are store-wired; the **only genuinely new file** in the slice is a **`BottomStrip.tsx` transport surface** (none exists yet) — everything else is repair+reskin. Save/load + transport already ride in via Toolbar; they are *confirm-don't-regress*, not new build. (Architect: re-examine the roadmap's "HARD SERIAL Cable→Board→Breadcrumb" — for a *reskin* Cable/Board touch largely disjoint files; only the breadcrumb change is true shared-state serialization. CSS token #8 (purple) must precede Block's `catToKnob`.)

**Headline:** the app **builds and its core instrument loop is wired** (save/load, add-block→audio, transport). C++ test suite = 131 tests (clean run pending; the earlier "47/47" was corrupted output, retracted). The "broken" state is **UI-visual (Block) + stale planning docs**, not a broken engine. This materially de-risks the recovery.

**R0 residual cleanup (carry into M0, all low-risk):** (1) 51 stale webview `__tests__` tsc fixtures (`BlockData`/`CableData`/`CommentBoxData` gained required fields; breadcrumb) — deferred behind R1 per plan; (2) 22 brittle vitest failures (color hex-vs-rgb format) — refresh assertions; (3) env note: the harness `.output` tmpfs corrupted several test captures this session (`project_task_tmpfs_full`) — re-run a clean `ctest`/`vitest` in a fresh session to confirm, though the summary lines above were captured clean. **R0 EXIT met:** builds green, source tsc clean, ctest green, core loop wired, docs reconciled.

---

**Goal (Glen):** get the project state back on track + solid, then an optimised path from here → working app, released.
**Authored by:** Planner draft (this doc) → Architect review → Critic review (consensus loop below).

---

## A. Empirical ground truth (verified THIS session, not from docs)

| Fact | Evidence | Implication |
|---|---|---|
| Branch `chromatic-ui-review` @ `204f5545`, **14 commits ahead of origin, unpushed** | `git rev-parse`, `git log` | all work is local + unshipped; safe to reset, but 14 commits of real work ride on it |
| **webview `tsc -b` FAILS** | bg typecheck: `Toolbar.tsx:243/259` (breadcrumb `string` vs `{boardId,label}`) + ~28 stale `__tests__` errors (`BlockData`/`CableData`/`CommentBoxData` gained required fields) | **UI cannot be gated/shipped until it compiles**; refactors left source+tests inconsistent |
| **Block (pilot) is broken** | checkpoint `204f5545` msg "Block port broken"; `SESSION-STOCKTAKE-2026-05-31`; memory | the GATE-0 pilot that blocks all UI fan-out is red |
| **CF1 host crash** fix applied, **NOT verified** | `SESSION-STOCKTAKE`; HORIZON m0.1 | hard SHIP gate still open |
| **Doc drift** | HORIZON log says "Block 97%, awaiting round 2"; stocktake says "broken, worst yet, revert" — the 97% entry predates the breakage | docs contradict; **stop trusting docs, trust fresh build+screenshot** |
| Net product UI LOC shipped this whole objective = **0** | PROJECT-STATE §4, HORIZON | 8 UI rejections; the binding constraint is NOT throughput |
| Session-drift perf regression | `.omo/plans/session-drift-perf-fix-plan.md` (this session) | folds into M0 stabilise |
| C++ build + `ctest` / `test:all` | **NOT run this session** (slow) | must be re-verified on a fresh tree before any "solid" claim |

**Root cause of the project's stall (from PROJECT-STATE §4 + `feedback_ui_failure_root_causes`):** not a code problem — a **verification + method** problem. Agents (and the lead) repeatedly called broken UI "a leap" (blind verification); named design tools were dropped; TW-v3+shadcn↔TW-v4 stack mismatch leaked transparent-bg bugs. **The binding constraint is the inability to SEE UI quality, not the speed of producing UI.**

---

## B. RALPLAN-DR deliberation summary

### Principles
1. **Ground truth over docs.** Every "done" claim must be backed by a fresh build + screenshot/test output, never a planning doc. (Directly addresses the drift.)
2. **Fix the ability to SEE before producing more to look at.** Verification capability is prerequisite to any build method (8 denials prove it).
3. **Pilot-then-scale, never fan-out-then-discover.** One component fully verified + signed off before any wave. (PROJECT-STATE §4 lesson.)
4. **Ship the smallest slice that is a *usable instrument*.** "Released app" must be reachable; 37 perfect components is a horizon, not a release bar. (Minimal = usable-instrument-complete, not fewest-possible-components — see the MVP must-haves in M1.)
5. **Parallel disjoint lanes** (C++ `src/*.cpp` ‖ webview `*.tsx`); CF1 is a ship gate, not a start gate (HORIZON).

### Decision drivers (top 3)
1. **Trust collapse / doc-drift** — must re-establish empirical state before committing effort.
2. **Repeated UI denials (8×)** — verification is the constraint; throughput is not.
3. **Scope risk** — the 37-component full redesign is the same "boil the ocean" that already produced one full revert.

### Viable options
- **Option A — Disciplined stabilise-and-verify-first, then pilot→scale.** Ground truth → fix verification capability → repair/redo Block pilot → sign-off → fan out roadmap waves. *Pro:* highest confidence, kills the denial loop. *Con:* slow visible progress at first.
- **Option B — Re-scope ship to an MVP Edit-mode vertical slice; defer the full 37-component redesign post-MVP.** *Pro:* "released working app" becomes reachable in weeks not months; matches `project_ui_mvp_method` (MVP = Edit-mode loop). *Con:* the shipped MVP is not the full V3 vision; needs Glen to accept a narrower v1.
- **Option C — Resume the execution-roadmap waves as-is** (assume Block is salvageable, keep current verification). *Pro:* fastest IF the foundation were sound. *Con:* builds on a broken pilot + unfixed verification → repeats the failure. **Invalidation: partial-reject** — C's *wave/dependency sequencing is salvaged and reused* in M1 step 3; only its premise ("start fan-out now on a broken+unverified foundation") is rejected. It contradicts drivers 1 & 2; it is the path that already failed.

### Recommendation — **A spine + B scope** (synthesis)
Run Option A's discipline (ground truth → verification → pilot) **and** adopt Option B's scope narrowing: redefine the **release bar as an MVP Edit-mode vertical slice that is stable + looks-right**, with the full 37-component V3 as the post-MVP horizon. Reject C.

> **Honest framing (per `feedback_reactive_pattern_avoidance`, Architect-flagged):** the MVP re-scope is a **release-cadence decision (ship usable value sooner), NOT a risk-mitigation / not fleeing the denied pattern.** The full-V3 was denied *once, for execution reasons* (dropped design tools, blind verify, stack mismatch) — **R2 fixes exactly those root causes**, so the full 37 remains a safe post-MVP target. We narrow v1 to ship value sooner, not because full-V3 is wrong. R2 (fix execution) and B (narrow scope) are **independent** justifications — don't conflate them.

> **Reskin-not-greenfield (Architect finding, materially lowers risk):** all six MVP-slice components **already exist as files and are store-wired** — `Block`, `Cable`, `GraphCanvas`(=Board), `Breadcrumb`, `ToolPalette`(=Browser), `InspectorHub`(=Inspector); transport state lives in `useEngineSnapshotStore`. **M1 is restyle existing wired components to the signed-off Block vocabulary, not a new build.** The per-component gate is therefore "visual match + **no regression of existing wiring**", and R0's tsc/test health directly protects functionality we must not break.

---

## C. The recovery plan (phased, gated)

### Phase R0 — Re-establish ground truth (1 short session, BLOCKS everything)
*Read-only + housekeeping only; no feature work.*
1. **Fresh full build:** C++ (`cmake --build build-merged`) + webview (`npm run build`). Record pass/fail.
2. **Run all tests:** `ctest --output-on-failure` (target 47/47 per recent logs) + `npm run test` + **static** `verify-stories`. Record real counts.
3. **Fix ONLY the source tsc error** (`Toolbar.tsx:243/259` breadcrumb type) to unblock builds. **DEFER the ~28 stale `__tests__` fixture repairs until after R1** — ⚠️ *Architect hazard:* R1 may revert Block to `7c1aa509`, which predates the taxonomy/breadcrumb refactor that introduced the `{boardId,label}` type + new `BlockData`/`CableData` required fields; fixing those tests forward now risks redoing/discarding them. The R0 source-fix cost is small; the test-fixture cost depends on the R1 decision, so couple them.
   - **Mechanically-checkable criterion (Critic F6):** `tsc -b` is all-or-nothing, so "source green / tests red" can't come from one invocation. Run a filtered check: `npx tsc --noEmit 2>&1 | grep -v '__tests__' | grep -c 'error TS'` must equal **0** (zero non-test diagnostics). That is the R0 build-green gate.
4. **Verify the load-bearing functional paths exist + work** (Architect — a pretty canvas that can't save/play/pass-audio is a demo, not an app): (a) **session/project save+load** (session service + bridge intact); (b) **add-block → audio flows through** (instantiate + audio passes); (c) **transport play/stop control** surface. Record each as works / broken.
5. **Reconcile the doc-drift:** update PROJECT-STATE + HORIZON to the verified Block status; archive/flag the contradictory "97%" entry. Single source of truth re-asserted.
6. **Exit R0:** one short STATUS table — what builds, what's tested-green, the 3 functional paths' status, Block's real status — committed. *Decisions below depend on these numbers.*

### Phase R1 — Decide the Block pilot fate (Glen gate)
- Block is the GATE-0 pilot. Options to put to Glen, informed by R0 screenshots:
  - **Revert to last-good** (`7c1aa509` pre-port baseline) and redo the port with the now-understood root causes (bring the mockup's token/shadcn layer OR regenerate-native with design tools; verification-first).
  - **Repair forward** if R0 shows the breakage is shallow (e.g. the `contain` CSS regressed again).
- **Recommendation:** revert + redo — `feedback_ui_failure_root_causes` says the failures were *execution* (no token context, blind verify), and a clean baseline + fixed verification is lower-risk than debugging denied work.
- ⚠️ **SAFETY — surgical revert only (Critic F1, HIGH).** The branch is **14 commits ahead, unpushed**; `7c1aa509` predates the taxonomy/breadcrumb/perf/CF1 work we must KEEP. **Never `git reset`/branch-reset to `7c1aa509`** — that nukes 13 commits of wanted work. Procedure:
  1. **Before any R1 mutation:** `git tag pre-recovery-204f5545` (+ optional `git branch backup/pre-recovery-204f5545`) so the full current state is recoverable.
  2. **Restore only Block + its direct deps from the old blob:** `git checkout 7c1aa509 -- webview/src/components/canvas/Block.tsx <any-Block-only-deps>` — file-scoped, leaves all other commits intact.
  3. Re-resolve the type drift this introduces (old Block vs new `BlockData`/breadcrumb types) as part of the redo, not by reverting the type system.

### Phase R2 — Build the verification capability (highest-leverage; **GATE-0 PREDECESSOR**, runs alongside R1)
*This is what breaks the 8-denial loop. Do it regardless of build method.* ⚠️ **Architect: R2 is load-bearing on the critical path — Block sign-off cannot be trusted until R2 exists. It is NOT a parallel nicety; GATE-0 depends on it.**
⚠️ **Scope cap (rathole guard — the project already lost 4 passes to a verify-stories Vite hole):** R2 is the **lightest possible gate** — screenshot + review-wizard side-by-side + design-tool-in-prompt. **FORBID an automated pixel-diff CI rig in this phase.**
1. **Lightweight visual check:** screenshot the live component (existing `shot.mjs`) beside the mockup (`:6008` / lovable preview) — eyeball-level "matches the design", not an automated pixel-diff pipeline.
2. **Human gate = the review wizard** (already works, `feedback_review_wizard_method`) — side-by-side live‖mockup, one component at a time → `ui-comments.jsonl`. Never send Glen tab-hunting.
3. **Mandatory design tools** baked into every UI worker prompt (Stitch / 21st-magic / neumorphism-gen / ui-ux-pro-max) — `feedback_explicit_design_tools_mandatory`.
4. **Exit R2:** a repeatable, *cheap* "is this component right?" check that produces evidence before Glen ever looks.

### Phase M0 — Stabilise (C++ lane ‖, the SHIP gate)
**Ordered (Critic F2) — not a flat set:**
1. **(a) CF1 repro spike — FIRST, TIMEBOXED.** Reproduce (VoiceOver + Element-AU in Logic), confirm the applied 12-line `plugineditor.cpp` fix, verify host no longer crashes. HIGH + highest-variance. **Timebox the *repro* to ~1 working day (≤ ~6h):** if it won't reproduce in the box, **escalate to Glen** (decide: ship MVP standalone-only with plugin-mode flagged experimental, or invest more) rather than open-ended hunting. An unbounded "#1 risk" with no timebox is not mitigated.
2. **(b) Session-drift perf regression** — execute `.omo/plans/session-drift-perf-fix-plan.md` (confirm window via `ff023feb` diff → Phase 2 fixes → before/after numbers). Independent files → can run alongside (c).
3. **(c) 28-bug reconciliation + findings** — close/triage open P0/P1 (`audit/28-bug-reconciliation.md`, `findings.md`). Parallel with (b) (independent).
4. **(d) Numeric perf re-verify — LAST** vs `audit/perf-baselines.md` on the fresh build (needs a–c stable to be meaningful).
5. **Exit M0:** crash-free standalone + plugin (or Glen-ratified standalone-only fallback); tests green; perf in budget; session-drift closed.

### Phase M1 — UI build to the MVP release bar (frontend lane ‖)
> ⚠️ **R2-evidence-BEFORE-Glen at every gate (Critic F3).** The 8 denials happened because **Glen was the only verification instrument**. Fix: at R1, GATE-0, and every M1 per-component gate, **R2's objective check (screenshot-vs-mockup + review-wizard evidence in `ui-comments.jsonl`) MUST pass first; Glen only ever sees candidates that already cleared the objective check.** If work reaches Glen before R2 evidence exists, R2 is theatre and we've recreated the failure mode.
1. **GATE 0 — Block signed off** (R2 evidence → then Glen + Chromatic). No wave fans out until green.
2. **MVP scope = the Edit-mode vertical slice that makes a usable instrument:** Foundation/tokens (#8, #23) → Block (#1) → Cable (#2) → Board (#3) → Breadcrumb/nested-nav (#24, Glen's top priority) → **plugin scan/browser** (#5 — the #1 native gap, "no app without it") → Inspector (#6). **All exist + are wired → this is restyle, not build.**
   - ⚠️ **Load-bearing must-haves IN the MVP (Architect — a working *instrument*, not a pretty canvas):** **session/project save+load** must work; **add-block → audio passes through**; **minimal transport play/stop control** (roadmap parks this in #22 Bottom strip, which is NOT in the visual slice above — **pull a minimal transport control into the MVP** or justify its absence). These are existing C++/service behaviours — confirm-and-don't-regress, not new build.
3. **Then** fan out the remaining components per `.omo/plans/v3-ui-execution-roadmap.md` waves 2/4/5/6/7 — **post-MVP**, same per-component gate (= **visual match + no regression of existing wiring**).
4. **Orphan parity decisions** (10 features) — tee to Glen as the roadmap §3 proposals (recommend: B1/B2 backlog; A8/A9/S6 → Prefs MIDI tab; M1/M2/M3 monitoring = one scheduling decision).

### SHIP
- **MVP release:** M0 green + the M1 Edit-mode slice live, gated, stable → Glen decides push/installer (`element-build-and-package`, build+install per `feedback_build_install_before_claiming`).
- **Full V3:** remaining roadmap waves land post-MVP behind per-component gates.

---

## D. Critical path & parallelism
```
R0 (ground truth) ──┬─> R1 Block fate (Glen) ───┐
                    └─> R2 verification cap ─────┴─> GATE0 Block redo+signoff ─> M1 MVP slice ─┐
                          (R2 is a GATE-0 PREDECESSOR, not parallel — signoff needs it)        ├─> SHIP(MVP)
M0 stabilise (CF1 + perf + bugs)  ───────── PARALLEL (disjoint C++ files) ── ship gate ─────────┘
                  ▲ CF1 = #1 SCHEDULE RISK (unbounded repro). MVP ship = max(M1 slice, CF1 verified).
```
- R0 blocks everything (can't plan on unknown state). Small.
- R1 + R2 run alongside each other after R0, but **R2 must complete before GATE-0** (it makes sign-off trustworthy).
- M0 (C++) runs parallel to all UI work; gates the ship, not the start. **CF1 is the highest-variance task in the plan and the single most likely schedule-buster — MVP ship date = `max(M1 slice done, CF1 verified)`.**

## E. ADR
- **Decision:** Recover via *ground-truth-first + build-the-verification-capability + pilot-then-scale*, and **re-scope the release bar to an MVP Edit-mode vertical slice**, with the full 37-component V3 as a post-MVP horizon.
- **Drivers:** trust collapse/doc-drift; 8 UI denials (verification is the constraint); scope/boil-the-ocean risk.
- **Alternatives considered:** (C) resume roadmap as-is — rejected, builds on broken+unverified foundation; (pure-A) full V3 as the release bar — kept as horizon but rejected as the *release* bar (unreachable soon, repeats over-scope).
- **Why chosen:** attacks the actual root cause (can't see quality) and makes "released working app" reachable without abandoning the V3 vision.
- **Consequences:** visible UI progress is slow until R2 lands; MVP v1 is narrower than full V3; requires Glen to accept a narrower first release. CF1 repro time is unbounded and is the top schedule risk.
- **Follow-ups:** Glen to (1) approve the MVP scope narrowing, (2) decide Block revert-vs-repair after R0, (3) ratify the 10 orphan parity decisions, (4) set a target date (still TBD).

## F. Acceptance criteria (testable)
- R0: committed STATUS table with real build/test numbers; webview `tsc -b` **source** exits 0 (test fixtures may stay red pending R1); the 3 functional paths (save/load, add-block→audio, transport) recorded works/broken; PROJECT-STATE/HORIZON reflect verified Block status.
- R2: a documented, repeatable **lightweight** (screenshot + review-wizard) check that emits evidence per component — **no automated pixel-diff rig**.
- M0: standalone + AU-in-Logic open/close with VoiceOver = no crash; `ctest` green; perf within `perf-baselines.md`; session-drift regression closed with before/after numbers.
- M1 MVP: Block→Cable→Board→Breadcrumb→Browser→Inspector restyled + **no regression of existing wiring** + each passed Glen+Chromatic; **session save/load + add-block→audio + transport play/stop all work**; fresh build **installed** and launched.

---

## G. Consensus log (ralplan, non-interactive)

- **Planner** (lead, full session context + empirical ground-truth sweep) — drafted §A–§F.
- **Architect** (opus, independent, read canonical docs) — **VERDICT: NEEDS-REVISION (minor) → SOUND.** Key finding: all 6 MVP-slice components already exist + are store-wired (**reskin, not greenfield**) → lower risk. 6 required changes: decouple R0 test-fix from R1 revert hazard; reframe MVP as release-cadence not risk (anti reactive-pattern-avoidance); R2 = GATE-0 predecessor + scope-cap; add save/load + audio-flows + transport to MVP; state reskin-not-greenfield; CF1 = #1 schedule risk. **All 6 applied.**
- **Critic** (opus, independent) iter 1 — **VERDICT: ITERATE.** F1 surgical-revert safety (14 commits, HIGH); F2 M0 ordering + CF1 timebox (HIGH); F3 R2-evidence-before-Glen (MED); F4 Principle-4 wording (MED); F5 C-sequencing-salvaged (opt); F6 checkable tsc criterion (LOW). **All applied.**
- **Critic** iter 2 — **VERDICT: APPROVE.** All F1–F6 verified adequate (not present-but-weak). Residual non-blocking notes: CF1 timebox unit loose (immaterial — Glen is release-decider); R2 scope-cap is an execution-discipline carry. No further iteration.
- **Consensus:** reached in 2 Critic iterations. Plan status: **`pending approval`** — awaiting Glen's execution decision (no mutation/delegation performed).

### Execution decision options (for Glen — not yet invoked)
1. **Approve → /team** (parallel coordinated agents; recommended once R0/R2 land — the waves fan out).
2. **Approve → /ralph** (sequential, one task at a time; safer for the R0/R1/CF1 high-care steps).
3. **Start manually at R0 myself** (R0 is small + read-only-ish; good first concrete step).
4. **Request changes / Reject.**

*End of consensus log.*
