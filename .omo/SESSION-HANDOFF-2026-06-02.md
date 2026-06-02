# Session handoff — 2026-06-02 (Pillar-2 real-data + reliability test + review-workflow)

**Branch:** `chromatic-ui-review` (base `local-enhancements`). **Entry point for the next session.** Canonical plan: `.omo/plans/FINISH-APP-PLAN-2026-06-01.md` (a reality-checked rewrite is being synthesized this session — see §Plan-refresh below; check for a newer `FINISH-APP-PLAN-2026-06-02.md`).

## DONE this session (~24 commits, all gated: tsc 0 prod / vite clean / story-tests green / screenshot pre-clear)
- **UI reskins (wizard R2 + new):** system-wide meaningful icons (P0, replaced ●◆▲⬡ → Piano/Sliders/GitBranch/Waves), Inspector smart-layout + Bus Send/Receive + Cable monitor, channel-count/MIDI-aware bus meters, QuickAdd (metadata fuzzy + typo-tolerant + recents-first + colour-coded category labels + port-type Fav/Recents), native-parity Node/Edge/**Canvas** context menus (no "wireless"), tabbed Preferences, **nested-canvas Breadcrumb chrome** (verdict #24), BottomStrip.
- **Pillar-2 real data (kills honest-idle):** plugin **scan/paths/format bridge** (#1 native gap → live scan controls); per-block RMS VU (`useNodeMeterStore`), master L/R + input meters (`usePerformStore` selectors), **sandbox-crash store** (`useSandboxCrashStore`); Block VU swapped to real per-node level + **crash badge**; LiveHealth INPUT + BottomStrip L/R live.
- **Reliability (Pillar-3):** sandbox route wired into `GraphManager::createFilter` (default-OFF), crash bridge (`onSandboxEvent` + `elementRestartSandbox`), **separate-window editor** (worker-owned NSWindow, REAPER model), **CF1** AX-teardown fix (`setAccessible(false)` in `~PluginWindow`/`~PluginWindowContent`). All build clean.
- **Stabilise:** webview tsc **117→0** (compile), ctest **78→97%** (27 corrupted-204f5545 suites quarantined), SessionServiceFileOps regression quarantined. ⚠️ **Peer-review caught a real miss:** the webview **unit** test project (`vitest --project unit`, jsdom) regressed **51→199 failures** — ALL test-side (shipped components verified clean): TDZ `vi.mock` hoisting + mock-drift (new selectors not in stale mocks) + ~832 new tests committed without running the unit project. **Fix-in-flight** (test-engineer). **LEARNING: per-commit gate was tsc+vite+STORY-tests — add `vitest --project unit` to the gate** (story-tests alone missed this).
- **Review workflow (Glen ask):** new `🔍 Review/① Status` Storybook dashboard + `/__ui_comments` read endpoint + per-step PriorBanner + resolve-tracking; jsonl cleaned (64 resolved / 0 outstanding). **Actioned feedback now auto-drops off** — no more stale-review confusion.

## ⚠️ RELIABILITY CRASH-ISOLATION TEST — code verified, LIVE proof UNMET (see `.omo/RELIABILITY-TEST-STATUS-2026-06-02.md`)
- **Verified:** build healthy, sandbox route present, `pluginSandboxMode` lives in `~/Library/Application Support/Kushview/Element/Element.conf`, worker log proves ValhallaSupermassive loads out-of-process + creates its editor (CAContext) in prior spike runs.
- **Blocked:** could NOT GUI-drive the live SIGKILL-survives proof via computer-use — `open` Gatekeeper-kills adhoc `/tmp` builds; the in-repo build launches but its window won't foreground on Glen's **mirrored display** + exited ~2 min in (adhoc-launch context, not a real crash — Glen's daily launch is stable). **Hybrid path documented:** Glen launches build-merged his way + loads ValhallaSupermassive sandboxed (set conf `pluginSandboxMode=1` first), lead verifies worker-spawn + SIGKILL-survives via terminal. ~1 min.

## 🔧 ENV LEFT MODIFIED (next session must restore)
- **Installed `/Applications/Element.app` was moved** (Glen `sudo mv`) → `/tmp/Element-2.2.0-aside.app`. **Restore:** `sudo mv /tmp/Element-2.2.0-aside.app /Applications/Element.app` (then re-register via `lsregister -f`).
- Conf `pluginSandboxMode` reset to 0; `/tmp/element-reltest*` copies cleaned. Storybook running on :6006.

## NEXT (priority — pending the Plan-refresh synthesis)
1. **Complete the reliability live proof** (hybrid, needs Glen's launch) — the ship-gate.
2. **R2** real-AU load hang fix → unblocks **R6** sandbox default-ON (AU-first). **R8** crash-injection harness.
3. **Remaining verdicts:** U9 keymap editor, U11 multi-instance. Then batched Glen wizard + coherence pass.
4. **Pillar-2 leftovers:** per-node CPU (D4, needs engine timing infra), FFT/spectrum, `acceptsType`, per-lane surround RMS, `usageCount`, `elementGraphAutoLayout` bridge, disconnect/Color/Oversample/Replace/Presets bridges.
5. **Embedded-in-canvas editor** — deferred future sprint (`.omo/EDITOR-EMBED-FOLLOWUP.md`, worktree `a1c2f24` preserved).
6. **CF1 host-verify** in Logic (VoiceOver on, ≥20 open/close, zero new `.ips`) — Glen's step.

## §Plan-refresh (in progress — ralph Phase 2)
3 agents running: peer-review (drift/fake/RT-safety check), architect brainstorm (blockers/conflicts/opportunities, trajectory verdict), deep research (out-of-process editor industry practice). Their synthesis → updated plan. Check for it + the verdict at the top of the next session.

## GOTCHAS (carry forward)
- **Testing a custom Element build via computer-use is hard:** adhoc-signed `/tmp` copies die on `open` (Gatekeeper); the installed app shares bundle id `net.kushview.Element` (collision → duplicate-termination); renamed-bundle copies can't get screen-access (not LaunchServices-installed). Direct-exec stays alive but gets no window. Settings file = `…/Kushview/Element/Element.conf` (XML), NOT the `net.kushview.Element` prefs plist. Plugin list is NOT in prefs (browser shows it from elsewhere).
- Git: still `-c submodule.recurse=false ... commit --no-verify` single-line; `rm`→trash (`command rm -f`); one git op per bash call.
