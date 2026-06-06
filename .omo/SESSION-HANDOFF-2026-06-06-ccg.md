# Session Handoff — 2026-06-06 (CCG tri-model review → all-waves implementation)

> **Fresh session: read this first**, then `.omc/artifacts/ccg-synthesis-2026-06-06.md` (the findings
> ledger) and `.omc/plans/ccg-fix-team-brief-2026-06-06.md` (what was built, per-worker, with rules).
> Purpose of this doc: receive Glen's QA feedback on the installed build, plan against it, act.

## What this session shipped (chronological)

1. **Round-2 QA fixes verified LIVE** (drove the app via computer-use): zoom re-raster crisp,
   colour swatch recolours block header, MIDI device naming deduped. Commit `0327943f` (prior session).
2. **deepinit**: 50 hierarchical AGENTS.md across the repo — commit `3a686775`.
3. **CCG tri-model review** (live-drive evidence + Codex architecture + Gemini UX):
   - Evidence: `.omc/artifacts/ccg-evidence-2026-06-06.md` (findings F1–F6 + verified-fixed)
   - Codex: `.omc/artifacts/ask/codex-read-omc-artifacts…02-01-24-855Z.md` (final block at line ~17733; C1/C2 engine-safety findings)
   - Gemini: `.omc/artifacts/ask/gemini-…01-50-51-935Z.md` (grounded rerun; F1–F6 verdicts + 3 paradigm violations)
   - **Synthesis (the ledger): `.omc/artifacts/ccg-synthesis-2026-06-06.md`** — A1–A7 agreed, C1–C5 codex, G1–G6 gemini, P0–P5 wave plan
4. **All waves implemented** — 5-worker omc-teams run, then lead-verified and committed serially:

| Commit | Wave |
|---|---|
| `d849ab19` | P0 fix(engine): render-op swap **use-after-free** (verified REAL) → deferred reclamation via renderGeneration; 4096 pool cap → negotiated size + render clamp; NEW GraphNodeRenderSafetyTests |
| `6975a6c5` | P2/P3 feat(engine+host): CV abs-peak latch end-to-end (fast bipolar CV no longer reads idle); meter-lane idle gating (measured 2.2ms/tick idle → 0.0009ms, >2000×) |
| `9837e3fc` | P1/P2 feat(webview): right-click=QuickAdd (Shift+RC=board menu), zoom 0.1–3.0×, type-ahead buffer, **Inspector real param names (F1 `??`→name-first + empty-label regression test)**, sticky filter + compact rows + prefix groups, NEW NeuSlider, neu borders/toggles, signed CV chips/-∞ dB/dot-MIDI/tabular-nums, pill hit-target, signal-chain Tab |
| `2dabb814` | P4 feat(sandbox+installer): helper discovery (env→bundle-dladdr→adjacent→honest-fail, no host re-exec), wire-v2 param metadata (+v1 back-compat), honest bus layouts, CV-transport DESIGN (`.omo/plans/sandbox-cv-transport-design-2026-06-06.md`) + DISABLED gate test, helper packaged into Contents/Helpers (build_pkg.sh hard-error + CMake POST_BUILD), SandboxedProcessorNodeTests un-quarantined |
| `53de3a64` | test(webview): June-2 leftover coverage tests landed |

## Gates (lead-verified, not worker claims)

- Engine ctest: **112/112** (excl. documented env-flaky SandboxStress/SandboxOrderedShutdown)
- Webview: tsc clean · vitest **2613 passed / 0 failed** · verify-stories **324/325**
  (sole fail `layout-bottomstrip--edit-tempo` = pre-existing; `canvas-quickaddpopup--docs` previously failing is now FIXED)
- Opus diff review: **COMMIT-SAFE** (caveat below)
- Installed-build smoke: zero crash reports, clean boot, pid stable

## Installed state (what Glen is testing)

- `~/Applications/Element.app` + VST3 ×2 + AU ×3 reinstalled 05:38 2026-06-06.
  Freshness markers: webview `index-f1AMjHEI.js`; binary contains `EL_SANDBOX_HELPER` literal;
  `Element.app/Contents/Helpers/Element Sandbox Host.app` present.
- Glen's QA checklist = the 6-item "YOUR MOVE" list: right-click QuickAdd, 3× zoom crisp,
  Inspector real names + filter, neu sliders/toggles, signed CV chips, first-keystroke type-ahead.

## OPEN ITEMS (what feedback will likely target + known gaps)

1. **Sandbox default-ON still not flipped** (R6) — this wave built the prerequisites only.
   Chain: R2 AU load-hang → R6 default-on → R8 crash harness. CV-through-sandbox = design+disabled
   test, NOT implemented (`SandboxCVTransportTests` is the gate).
2. **Drag-param-to-canvas → exposed CV port** (Gemini G5 killer feature) — deferred by design.
3. Opus reviewer's detailed findings list LOST to output compression (twice). Verdict COMMIT-SAFE
   stands; full list extractable from its transcript JSONL:
   `/private/tmp/claude-501/…/tasks/a4c390c09a1672b28.output` (grep assistant text blocks).
4. `test/PluginManagerEdgeCaseTests.cpp` — untracked orphan, NOT registered in test/CMakeLists,
   left uncommitted deliberately. Decide: register+verify or delete.
5. `layout-bottomstrip--edit-tempo` story — pre-existing Suspense/act failure, unowned.
6. `installer/AGENTS.md` had a stale "helper not yet wired" TODO — fixed in this session's doc commit.
7. Comparator/Logic op dropdown UI (engine modes persisted+tested, default `>`/AND) — still queued papercut.
8. Depth-first backlog after sign-off: #2 block-library breadth → #3 multi-level/cross-board nav.

## Hard rules for the fresh session (unchanged)

- **Serialize commits** (stage+commit ONE bash call; repo hook runs no-op git reset; never batch git with other calls).
- **Serialize live-app driving** (ONE actor; concurrent driving once produced a false crash signal).
- **NOTHING-fake** — no placeholder data in shipped paths; honest-degraded over mock.
- **Build+install before claiming done**: webview `npm run build` → force-copy dist into ALL 8 product
  bundles → `codesign --force --deep --sign -` → reinstall standalone+VST3+AU (see this session's
  transcript or `.claude/skills/element-build-and-package`).
- Baseline = `local-enhancements`, NOT main. Branch: `chromatic-ui-review`.
- D3 shelved features stay shelved (Dashboard/Macro/Scene/Preset/Perform UI).
- 🔴 YOUR MOVE banner for anything Glen must do; plain-language options.
- Verify artifacts not pipelines (`echo EXIT=$?` per command, `strings` markers; pipe exits lie).

## Tooling notes (new this session)

- **Gemini CLI is EOL June 18 + quota-dead** → `omc ask gemini` routes through Antigravity:
  `PATH="$HOME/.ccg-shims:$PATH" AGY_MODEL="Gemini 3.1 Pro (High)" omc ask gemini "…"`
  (shim `~/.ccg-shims/gemini` → `~/.local/bin/agy`; Claude/GPT-OSS models also available).
- **omc ask codex**: long prompts hang forever (stdin-pipe bug, 0 TCP) — use a SHORT one-line prompt
  pointing at a brief FILE.
- **omc-teams declared unreliable by Glen** — tmux Enter races (prompts sit unsubmitted; send Enter
  per pane), task-store self-wipe (`orphan-cleanup` deletes records), 15-min lease expiry during long
  builds. Use native subagents (Agent tool) / this lead-pipeline pattern instead.
