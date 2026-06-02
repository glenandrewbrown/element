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

---

## ▶ APPENDED — AUXILIARY TOOLING SESSION (2026-06-02, later) — NO Element-app changes
This was a **dev-workflow / tooling** session — it touched **zero Element app code, zero verdicts, zero reliability work**. App-state above is unchanged. What it produced (all under `.claude/` + `~/.claude/`, commits `f336956e` + `313f4ba7`):
- **Video UI-feedback review system** — 3 skills (`video-localfile` global; `video-review-pipeline` + `video-qa-capture` project) + native `extract.sh` (ffmpeg scene-frames + Whisper transcript → synced timeline, no cloud) + 5 slash commands (`/review-video`, `/qa-capture`, `/serve-video`, `/vet-tool`, `/smoke-media`). Lets Glen hand over a narrated screen-recording → verified fixes via a 3-gate HITL loop; Claude can also self-produce QA captures. Full detail: wiki `video-qa-review-system` + memory `project_video_qa_pipeline`.
- Added `video-analyzer` MCP (audited safe, but flaky → native path is primary).
- 2 learned skills: `vet-tool-before-install`, `media-pipeline-smoke-test`.

## ⭐ REVIEW-READINESS GATE (Glen wants a video review at the OPTIMUM time)
Glen will give a narrated video review (using the new `/review-video` workflow) but **only when the app is feature-complete enough that feedback isn't wasted on known-incomplete roadmap items.** Lead must PROACTIVELY signal when that point is reached. **Do NOT invite the review until ALL of:**
1. **Last 2 UI verdicts built:** U9 (keymap resurface) + U11 (multi-instance). (U10 done.) → all 37 components exist.
2. **Pillar-2 real-data leftovers wired** so no panel shows fake/idle: FFT/spectrum, `acceptsType`, per-lane surround RMS, `usageCount`, + the disconnect/Color/Oversample/Replace/Presets/auto-layout bridges. (Per-node CPU D4 already done.)
3. **Coherence/polish pass** run across the UI (the plan's "batched Glen wizard + coherence pass" after verdicts).
4. **Fresh full build + INSTALL** for Glen (per `feedback_build_install_before_claiming`).
Reliability live-proof + R2 AU-hang are a SEPARATE backend ship-gate — they do NOT block the UI review (crash-badge/recovery UX is already wired). When 1–4 are green, tell Glen: "UI is feature-complete + real — optimal point to record your `/review-video` walkthrough now." Until then, steer any review toward already-built surfaces only.

---

## ▶ APPENDED — ELEMENT CLI QA/DEBUG BRIDGE SESSION (2026-06-02, later) — one small reviewed app-code change
A second **dev-workflow / tooling** session, in parallel with the video-tooling one above. **Unlike the video session, this one DID make one small, reviewed Element app-code change** — so app-state is *not* entirely unchanged: see "App-code change" below. Goal (Glen's reframe): a CLI **bridge so Claude/agents can drive + inspect a test/debug Element from the terminal for QA/debugging**, replacing the flaky GUI/computer-use verification that the section above repeatedly hit.

**What it produced:** `agent-harness/` at repo root — a `cli-anything` harness, installable as `cli-anything-element` (`cd agent-harness && pip install -e .`; venv at `agent-harness/.venv`). Python + click, `--json` on every command, REPL. Full docs: `agent-harness/ELEMENT.md` (analysis/SOP), `README.md`, `skills/cli-anything-element/SKILL.md`, `cli_anything/element/tests/TEST.md`. Memory: `project_element_cli_bridge`.
- **Actuate:** `control transport|session|graph|view|toggle|edit|panic …`, `engine sample-rate <hz>` → over Element's OSC command surface.
- **Observe:** `app launch/status/logs/crashes/stop/kill` — process liveness, **crash inference from macOS `.ips`**, log tail (main/verbose).
- **Inspect:** `inspect session|graph|blocks FILE` — read `.els`/`.elg` (plain ValueTree XML), no GUI.
- **Verify:** `verify assert --alive --no-crash [--session F --min-blocks N --has-block X]` → pass/fail verdict + exit codes; `verify ax` wraps `tools/automation/element_verify.py`.

**App-code change (reviewed APPROVE, 0 crit/high; default-inert):** `src/services/oscservice.cpp` + `include/element/ui/commands.hpp`. Element's OSC command receiver `CommandOSCListener` was a literal `// noop` — it parsed commands but never invoked them. Now it invokes via `world.services().find<GuiService>()->commands().invokeDirectly(id, true)` (message-thread-safe — `ListenerWithOSCAddress<>` = `MessageLoopCallback`), registered on `/element/command` + every `Commands::getOSCAddresses()` per-command address; `toString`/`fromString` extended symmetrically to cover transport/session/media/edit. **Inert unless the OSC host is enabled** (`oscHostEnabledKey`, default false), which `app launch` sets. Verified live on a fresh build: OSC `sessionSave` rewrote a `.els` on disk, `transportPlay`/`panic` invoke, app survives. **Tests: 32/32 (30 unit/subprocess + 2 live E2E driving real Element).**

**★ DIRECTLY RELEVANT TO THE ORIGINAL PATH — the reliability ship-gate (NEXT #1).** The blocker above is *"could NOT GUI-drive the live SIGKILL-survives proof via computer-use."* This bridge IS the headless control surface that sidesteps it — no `open`/Gatekeeper/window-foreground problem. Suggested hybrid for the crash-iso proof: set conf `pluginSandboxMode=1` → `cli-anything-element app launch --fresh` → load ValhallaSupermassive sandboxed → SIGKILL the *worker* pid (find via `app status` process list / `ps`) → `app status` + `app crashes` assert the host stayed alive with no new `.ips`. This automates most of the "~1 min terminal verify" the section above describes (Glen's launch step may still be wanted for the daily-launch context, but the bridge removes the computer-use dependency).

**Gotchas (carry forward, complements the GOTCHAS above):**
- Element is **single-instance** — a stale instance holds `~/Library/Caches/com.juce.locks/juceAppLock_Element`, so a new launch forwards to it + exits rc=0 (no new `main.log` line). Use `app launch --fresh` (SIGKILLs existing first). The bridge matches the bare `Element` argv (process renames itself) and reports `forwarded_to_existing`.
- **Graceful OSC `quit` can block on the "save session?" modal** when dirty → unreliable headless. Use `app stop` (SIGTERM) / `app kill` (SIGKILL) for deterministic teardown (also the crash-iso SIGKILL primitive).
- `osc_port_bound` uses `netstat` not `lsof` — on this `/Volumes`-mounted repo `lsof -iUDP` took ~51 s/call (would block launch ~3 min). If you add port checks elsewhere, avoid `lsof -i`.
- Some advertised commands (`mediaNew`, `signIn`, `sessionSaveAs`…) resolve over OSC but have **no registered ApplicationCommandTarget yet** → accepted but no-op (crash-safe). Live/useful: transport, sessionSave/New/Close, panic, views, zoom, graph*. (C++ review MEDIUM: optionally log `invokeDirectly`-returns-false for debuggability — not done, would need a rebuild.)

**ENV:** I restored the bridge's own settings backup — `Element.conf` is back to Glen's pre-bridge state (`app restore-settings`; each `app launch` re-applies OSC-on + scan-off and re-backs-up). The `/Applications/Element.app` → `/tmp/Element-2.2.0-aside.app` restore is **still Glen's `sudo` step** (untouched by me). Branch unchanged: `chromatic-ui-review`.
