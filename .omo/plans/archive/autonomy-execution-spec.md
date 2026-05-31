> 🗄️ **ARCHIVED — HISTORICAL. Do NOT execute.** 2026-05-07 autonomy / loop execution spec, paired with the historical `master-fix-plan.md`. Live successor: `.omo/PROJECT-STATE.md` (state + sequenced plan).
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Element — Autonomous Execution Spec

**Pairs with:** `.sisyphus/plans/master-fix-plan.md`, `.sisyphus/plans/visual-asset-pipeline.md`, `.sisyphus/reports/tool-gaps-2026-05-07.md`
**Goal:** Reduce human-in-loop touchpoints to **major milestone reviews only** while preserving evidence-grade quality.

---

## 0. Operating principles

1. **Plan = source of truth.** Each task in `master-fix-plan.md` has explicit acceptance criteria. The loop never invents work.
2. **Evidence over assertion.** Every "complete" claim is backed by ctest output, Playwright screenshot, AX assertion JSON, multimodal verdict, or commit SHA.
3. **Bounded retries.** Per-task max 3 implementation attempts and 3 visual-regen attempts before escalating.
4. **Atomic commits.** One task = one commit (or one logical sequence). `git-master` skill enforces.
5. **State persistence.** Every transition is recorded to `.omc/state/` so the loop can resume after interruption.
6. **No silent skips.** A task that cannot complete escalates with a written-up "blocker note" the human reviews.

---

## 1. The per-task autonomous loop

```
┌─────────────────────────────────────────────────────────┐
│  TASK_LOOP(task_id)                                      │
├─────────────────────────────────────────────────────────┤
│  1. Load task from master-fix-plan.md                    │
│  2. Verify prerequisites (deps green, prior phase OK)    │
│  3. Pick agent + skills (see §3 agent-map)               │
│  4. Spawn executor with full context bundle              │
│  5. Implementation phase                                 │
│      a. Read referenced files                            │
│      b. Apply changes                                    │
│      c. Run cmake --build incrementally                  │
│      d. Run ctest --filter <relevant>                    │
│      e. If fail → fix-loop (max 3) → escalate            │
│  6. Static-quality phase                                 │
│      a. lsp_diagnostics → 0 errors                       │
│      b. eslint (webview) → 0 errors                      │
│      c. ai-slop-remover skill (1 pass)                   │
│  7. Behavioural-QA phase                                 │
│      a. If native UI: element_verify.py --suite <s>      │
│      b. If webview UI: Playwright scenario               │
│      c. If audio: realtime-safety harness (Phase C+)     │
│      d. If sandbox: SandboxRoundTrip + StressTest        │
│  8. Visual-QA phase (only for UI tasks)                  │
│      a. Playwright screenshot                            │
│      b. multimodal-looker grade against brief            │
│      c. If grade < 0.85 → regen-loop (max 3)             │
│  9. Commit phase                                         │
│      a. git-master skill: stage relevant files only      │
│      b. Conventional commit message linked to task ID    │
│      c. Pre-commit hook ack                              │
│ 10. State update                                         │
│      a. notepad_write_working: task_id done              │
│      b. wiki_ingest if non-obvious decision              │
│      c. mark task ✓ in plan via Edit                     │
│ 11. Continue or escalate                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Phase-level autonomy gate

```
PHASE_LOOP(phase)
├── for each task in phase.tasks:
│       TASK_LOOP(task_id)
│       on error → record blocker, continue (unless task is critical-path)
├── phase.run_review()           ← oracle reviews aggregate diff
├── phase.run_qa_battery()       ← all suites, full ctest, Playwright e2e
├── if review.OK and qa.green:
│       phase.status = AWAITING_HUMAN_OK
│       emit MILESTONE_REVIEW(phase, evidence_bundle)
│       wait_for_human()         ← only here, only between phases
│       if human.approves:
│            phase.status = COMPLETE
│            advance_to(next_phase)
│       else:
│            phase.status = REVISION
│            inject human_feedback into next pass
```

**Human touchpoints (the ONLY ones):**
- After Phase A — already complete ✅
- After Phase B (Stop the Bleeding)
- After Phase C (Real-time safety) — must include "live audio listen" — agent cannot grade tone
- After Phase D (Sandbox) — verify a real plugin loads in sandbox
- After Phase E (Lua security) — verify favorite scripts still work
- After Phase F (Updated GUI) — visual subjective review
- After Phase G (Sparkle) — only if enabled
- After Phase H (Tests) — sign off on coverage targets
- Phase I — final ship review

That's **8 human checkpoints across 6 weeks** — versus a current state of "every change reviewed".

---

## 3. Agent + skill map (per task type)

Each row tells the loop which executor to spawn and which skills to load.

| Task type | Subagent / Category | Skills to load | Example tasks |
|---|---|---|---|
| C++ one-line crash fix | `category="quick"` | `[]` | F-1, F-6, F-8, F-10 (Phase B) |
| C++ refactor (multi-file) | `subagent_type="executor"` (sonnet) | `["systematic-debugging"]` | F-12, F-13, F-15 |
| Audio-thread RT redesign | `category="ultrabrain"` | `["systematic-debugging", "audio-corpus"]` | F-11, F-14, F-17 (Phase C) |
| Sandbox IPC redesign | first `subagent_type="oracle"` (design), then `category="ultrabrain"` (impl) | `["audio-corpus"]` | D-1 .. D-9 (Phase D) |
| Lua security lockdown | `category="ultrabrain"` | `["systematic-debugging"]` | E-1 .. E-8 (Phase E) |
| React component (new) | `category="visual-engineering"` | `["frontend-ui-ux", "vercel:react-best-practices"]` | F-4, F-5, F-7, F-9 (Phase F) |
| React component (fix) | `category="visual-engineering"` | `["frontend-ui-ux"]` | F-1 (replace `window.prompt`) |
| Icon design (custom) | `category="visual-engineering"` | `["create-asset", "creative-asset-pipeline"]` | Phase F.0 brand icons |
| Animation design | `category="visual-engineering"` | `["create-asset"]` | Phase F.0 motion vocabulary |
| C++ webview-bridge work | `subagent_type="executor"` | `["systematic-debugging"]` | element_webview_host.cpp edits |
| Test authoring | `category="unspecified-high"` | `["superpowers:test-driven-development"]` | Phase H |
| Plan / spec review | `subagent_type="momus"` | `[]` | All plan revisions |
| Architecture review | `subagent_type="oracle"` | `[]` | Phase C/D/G design phase |
| Visual QA verdict | `subagent_type="multimodal-looker"` | `[]` | Phase F screenshots |
| Code cleanup pass | `category="quick"` | `["ai-slop-remover"]` | Final hygiene per phase |
| Atomic commit | `category="quick"` | `["git-master"]` | Every task |
| Final code review | `subagent_type="code-reviewer"` (or `coderabbit:code-reviewer`) | `[]` | Phase I |

---

## 4. Memory / state contract

| Surface | Use |
|---|---|
| `.omc/notepad.md` priority section | "Currently in Phase X. Last completed task: Y. Next: Z." (under 500 chars) |
| `.omc/notepad.md` working memory | Per-task running notes (auto-pruned 7 days) |
| `.omc/notepad.md` manual section | Permanent rules ("never auto-update plugins, only standalone") |
| `.omc/wiki/` | Non-obvious decisions: e.g. "sandbox IPC chose POSIX named sems over System V — see §..." |
| `shared_memory(namespace="element-fix")` | Cross-agent handoffs within a single phase: e.g. oracle's design doc → executor |
| `.sisyphus/plans/master-fix-plan.md` checkboxes | Per-task done state (auto-marked by loop) |
| `.sisyphus/evidence/<phase>/` | Screenshots, AX JSON dumps, ctest logs per task |
| `git log` | The atomic-commit trail. One commit per task, scope tag (`fix(audio):`, `feat(ui):` etc.) |

---

## 5. Failure / escalation protocol

| Failure type | Loop response |
|---|---|
| Build fails after impl | Re-spawn executor with build log → 3 attempts → escalate |
| ctest regression in unrelated suite | Hard stop — record bisect job, escalate immediately |
| Visual verdict < 0.85 | Regenerate asset (different prompt) up to 3× → if still fails, escalate with both attempts as evidence |
| AX assertion fails on previously-green suite | Hard stop — UI regression — escalate |
| Sanitizer / leak detector fires | Hard stop — escalate with stacktrace |
| Oracle disagrees with planned approach | Pause phase — emit "design challenge" note for human |
| Sub-agent timeout (>10 min) | Cancel + retry with smaller scope |
| Permission/credential gate (sign / notarize / API key) | Pause and request specific secret |

Escalation note format (what the human sees when escalation fires):
```
ESCALATION — Phase X / Task Y
Attempted: <impl summary>
Failure: <evidence snippet>
What I tried: <attempt 1 summary> | <attempt 2 summary> | <attempt 3 summary>
What I'd try next (needs your call): <option A> | <option B>
Files I touched (diff at HEAD~N..HEAD): <list>
Time spent: <minutes>
Recommendation: <ask | pivot | abandon | bisect>
```

---

## 6. Visual QA loop (Phase F detail)

For every UI task that changes pixels:

```
1. baseline = playwright_screenshot(component, before-state)
2. impl(task)
3. after = playwright_screenshot(component, after-state)
4. design_intent = task.visual_brief    # from blueprint section / asset prompt
5. verdict = multimodal_looker.compare(after, design_intent, baseline)
6. if verdict.score < 0.85:
       diff_findings = verdict.deltas
       if diff_findings.implementation_issue:
            re-spawn executor with diff_findings → goto 2  (max 3)
       elif diff_findings.asset_issue:
            regen_asset(prompt + corrections) → goto 2     (max 3)
       else:
            escalate
   else:
       evidence/<phase>/<task>/before.png
       evidence/<phase>/<task>/after.png
       evidence/<phase>/<task>/verdict.json
       commit
```

Multimodal-looker prompt template:
```
Goal: verify <component> matches V3.0 Element Instrument Paradigm.
Brief: <task.visual_brief>
Reference: <neumorphism + semantic colours + motion vocabulary>
Score 0-1 across: structure | colour fidelity | spacing | motion presence | iconography
Identify any deltas with file:line precision if visible.
Return JSON.
```

---

## 7. Native UI QA loop (Phase F + B native portions)

For native chrome (StandardContent fallback, plugin window, native menus):

```
1. element_verify.py --suite <relevant>
2. parse JSON output
3. if any check FAIL:
       capture AX tree snapshot via element_ax_map.py
       compare to last green snapshot
       if regression confirmed → escalate
       else → re-spawn executor with AX-context bundle
4. record evidence/<phase>/<task>/ax_<suite>.json
```

Existing suites: `plugin-browser`, `session-browser`, `navigation`, `toolbar`, `dashboard-builder`, `command-palette`, `bus-inspector`, `virtual-keyboard`. New suites should be added by Phase H tasks where coverage gaps are identified.

---

## 8. Crash QA loop (Phase B + C)

For each crash fix:

```
1. confirm crash repro (if test exists, run it; if not, write minimal repro test FIRST)
2. impl fix
3. ctest --rerun-failed → green
4. ctest full → no new regressions
5. sanitizer build (-DCMAKE_BUILD_TYPE=Debug -fsanitize=address,undefined) → run repro
6. plugin host probe: AU validation (auval -v aumu/aufx Klv1 ...) → green
```

---

## 9. Lua security QA loop (Phase E)

For each banned-API task:

```
1. write SandboxIsolationTest case asserting <banned API> throws or returns nil
2. impl lockdown
3. test must pass
4. counter-test: write a script using <allowed API> — must succeed
5. fuzz: generate 50 small Lua scripts mixing allowed/banned — none escape sandbox
```

---

## 10. Sandbox IPC QA loop (Phase D)

```
1. SandboxParameterRoundTripTest must pass for AUSampler
2. SandboxStressTest: 1000 cycles of (load → set 100 random params → verify all received → kill -9 worker → host recovers within 1s)
3. memory leak detector: 1-hour soak → no growth
4. real Logic Pro session test (manual checkpoint, human-in-loop)
```

---

## 11. How to launch the loop

Once the human approves the plan, this single command starts autonomous execution:

```
/ulw-loop "Execute master-fix-plan.md Phase B. Use autonomy-execution-spec.md. Stop and emit milestone review at phase end." --completion-promise "PHASE_B_COMPLETE"
```

Or for the entire run (will pause at every milestone gate):

```
/ralph-loop "Execute master-fix-plan.md sequentially. Pause at each phase boundary for human review per autonomy-execution-spec.md §2." --completion-promise "PROJECT_COMPLETE"
```

---

## 12. What the human will see at each milestone

Each milestone review includes a single message containing:

1. **Phase summary** (one sentence what was done)
2. **Evidence links**: `evidence/<phase>/`, ctest summary, key screenshots
3. **Diff stats**: `git diff phase-N-start..HEAD --stat`
4. **Risks discovered**: anything that came up that wasn't in the original plan
5. **Recommendation**: `proceed | revise | abort`
6. **Time spent**: actual vs. estimated

The human's response is just `OK / revise X / stop` — three words.

---

**End of autonomous execution spec.** Ratify alongside `master-fix-plan.md`.
