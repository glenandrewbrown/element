# ULTRAGOAL status — 2026-06-02 (autonomous, zero-gate run)

Branch `chromatic-ui-review`. Live ledger for the autonomous crash-isolation + Pillar-2 + UI run.
**TRUST GIT + fresh verification over any doc claim.**

## ▶ HEADLINE (revised critical path)
The live crash-isolation retry (signed build + computer-use — Glen's ask) **succeeded as a test and FOUND A REAL BUG**:
- ✅ Signed dev build **launches, windows, and is fully drivable via computer-use** (Cmd+K palette inserts plugins). Glen's "can't drive it / no window" blocker is **DISPROVEN**.
- ✅ Crash **detection + surfacing works** end-to-end (`[SandboxedProcessor] Sandbox crashed: ValhallaPlate` → bridge → badge).
- ✗ Crash **ISOLATION fails on a real plugin**: loading ValhallaPlate (VST3) sandboxed → worker dies on load → restart-loop → **HOST SIGKILLed (exit 137)**, no `.ips`, no logged kill source.
- Contrast: headless `test_element` worker (different bundle id) stays alive; prior rspike (signed) loaded ValhallaSupermassive out-of-process fine.

⇒ **New #1 gate: fix host-survival under real sandboxed-plugin load BEFORE the proof can pass or R6 default-ON.**

## MASTER TO-DO (status vs plan)
| # | Task | Status |
|---|------|--------|
| 1 | **Crash-isolation host-survival bug** (host SIGKILLed on real sandboxed plugin load) | 🔴 IN PROGRESS — team: H1 bundle-id collision, H2 self-kill trace, A1 headless real-plugin repro |
| 2 | Terminal/live crash-isolation PROOF (host survives worker SIGKILL, real plugin) | ⛔ blocked on #1 |
| 3 | R6 AU-first sandbox default-ON | ⛔ blocked on #1 + R2 |
| 4 | R2 AU load-hang fix | ⏳ pending |
| 5 | Pillar-2 D4 per-plugin CPU (engine timing → bridge → webview) | ⏳ scoping |
| 6 | Pillar-2 D5 real spectrum / else hide fake (BlockEmbed) | ⏳ scoping |
| 7 | U9 keymap editor (native KeymapEditorView → bridge → Prefs Shortcuts) | ⏳ scoped S–M; after Pillar-2 bridge edits |
| 8 | U11 multi-instance (InstanceSwitcher + MirrorPanel) | ⚠️ scoped L + AMBIGUOUS ("instance"=tabs vs windows vs procs) — needs Glen call; deprioritised |
| 9 | U8 native prefs dialog still wired in `mainmenu.cpp` alongside webview `PreferencesModal` | ⏳ cleanup pending |
| 10 | Housekeeping: 3 untracked webview tests | ✅ triaged, all KEEP (fixed mock-drift), 773 pass/0 fail, staged |
| 11 | **BUG FOUND:** left Plugins-panel search → chip but **no results/insert** (Cmd+K palette works) | 🟡 log + fix |
| 12 | Drivability proof (signed app + computer-use) | ✅ done + screenshot-documented |

## EVIDENCE (this run)
- Signed: `codesign` adhoc+runtime + `disable-library-validation` entitlement embedded, valid on disk.
- Host SIGKILL: launch wrapper `exit=137`; `main.log` restart-loop then host gone; no `Element*.ips` in DiagnosticReports.
- Worker probe: workers `initialise role=WORKER` + `pipe-connected` then gone (no plugin-load-success this run).
- conf during test: `pluginSandboxMode=1`, `defaultNewSessionFile=""` (blanked to avoid pizmidi AU crash-storm). **Restore conf when done** (backup `/tmp/Element.conf.bak-*`).

## AGENTS (this run)
- A1 headless real-plugin crash harness (executor/opus) — building `test/.../SandboxRealPluginCrashTest.cpp` (had compile-iteration errors; running).
- H1 collision tracer (tracer/opus) — bundle-id/NSApplication duplicate-kill hypothesis.
- H2 self-kill tracer (tracer/opus) — restart-loop/process-group/audio-fault host-death hypothesis.
- Pillar-2 scope (explore/opus) — D4/D5 implementation map.
- (done) U9/U11 scope; (done) test triage.

## EXIT GATES
- #1 host survives `kill -9 <worker>` with a REAL plugin loaded, both headless (A1 ctest) AND live (computer-use + `crash_isolation_proof.sh`), crash badge shown. Then #2 PASS.
