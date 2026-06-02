# Reliability crash-isolation test — status (2026-06-02)

Goal: prove the Bitwig-grade ship-gate — **load a plugin sandboxed → SIGKILL its worker → Element host survives** (+ crash event surfaces). Attempted live via computer-use this session.

## ✅ SESSION-2c MILESTONE (2026-06-02 ~04:10) — CRASH-ISOLATION MECHANISM PROVEN HEADLESS (autonomous, no display/signing)
The ship-gate's CORE is met by automated tests, sidestepping the entire phantom-display/GUI/signing confound:
- **`SandboxIsolationTests` PASS + `SandboxRealProcessTests` PASS** (ctest, headless) — the host survives worker loss and the real cross-process round-trip works. `SandboxWaitForResponse` + `SandboxProtocol` also pass. `SandboxStressTests` (#59, the D-9 1000-cycle SIGKILL stress) + `SandboxOrderedShutdown` (1000-cycle) confirming under long timeout (the earlier "timeout" was the 1000-cycle stress exceeding 120s, not a hang). Re-run on the current build (test_element rebuilt with this session's changes).
- **H2 root cause confirmed:** the test_element worker spawns + runs fine **UNSIGNED** with the in-process `TestEchoPluginFormat` → the IPC/mechanism is sound. The unsigned **app** worker dies only when loading a **real 3rd-party plugin dylib** = macOS **library-validation** rejecting an unsigned host's `dlopen` → needs the `disable-library-validation` entitlement, which only binds with a **signature**. So "sandbox broken on the dev build" = a SIGNING/library-validation issue at real-plugin load, NOT an IPC or code bug.
- **Tracer-corrected facts:** control IPC = `/tmp` FIFOs (NOT Mach ports); the worker's stdout/stderr go to `/dev/null` + its logger is created late → spawn failures were invisible (fixed by the `[probe]` instrumentation, commit `74aa9e59`).
- **Misdiagnosis owned:** the `shouldSandboxPlugin` "Element"-format fix (`b14ed31e`) is valid hardening but was NOT the cause of Glen's launch crash (that was format=AudioUnit pizmidi plugins crashing the unsigned worker under mode=1).

**Shipped this session (committed):** `b14ed31e` (Element-format exclusion + `tools/reliability/crash_isolation_proof.sh`), `74aa9e59` (Blocker #4 in-process-fallback amber badge — independently designer-approved — + worker `[probe]`). Webview unit suite green (1852→1855/0). 

**What is genuinely BLOCKED (env, not code):** the production demo of crash-isolation with a REAL commercial plugin in the GUI app. Two stacked obstacles, both outside code: (a) Element's window routes to monitor "display 4128836" which is **disconnected** on Glen's multi-monitor setup → invisible/undrivable, and session-restore-spawn is tied to that window initialising; (b) the dev build must be signed (H2) for real-plugin sandboxing. Even the prior signed rspike GUI binary died ~16s in this same env → the obstacle is the windowing environment, not the harness.

**▶ RECIPE for the production proof (when a connected display + signed build are available):** sign build-merged (`codesign --force --sign - --entitlements cmake/entitlements.plist` on the single Mach-O — it has NO nested bundles), launch on a CONNECTED display, add ONE ValhallaSupermassive (VST3) at `pluginSandboxMode=1` → `tools/reliability/crash_isolation_proof.sh proof` does the kill+assert. The `[probe]` log (`sandbox_worker_probe.log`) will confirm the signed worker initialises.

---

## ⛔ SESSION-2b UPDATE (2026-06-02 ~03:30) — ROOT BLOCKER FOUND: sandbox needs a SIGNED build. Live proof still UNMET.
Drove the live attempt via computer-use (Glen: the app-crash theory was disproven — app IS stable). Findings, in order:
1. **"App crashes on launch under mode=1" = NOT Gatekeeper, NOT my code.** It is `pluginSandboxMode=1` trying to sandbox the **default session's plugins**, which **crash the sandbox worker → restart-loop → message-thread stall → no window**. At **mode=0 the build runs perfectly** (stable, windowed, reskinned UI). The whole "custom build won't stay alive / no window" trap from session-1 was THIS, mislabeled as a launch-env/Gatekeeper problem.
2. **MISDIAGNOSIS corrected:** the crashing nodes `midiForceToRange` / `midiDuplicateBlocker` are **`format="AudioUnit"`** (pizmidi AU MIDI-FX), **not** Element-format script nodes. The `shouldSandboxPlugin` "Element"-format fix I shipped (`settings.cpp:621`, rebuilt 02:58) is **valid hardening but NOT the cause** of Glen's crash. Owned, not hidden.
3. **THE REAL BLOCKER — sandbox is non-functional on the UNSIGNED dev build.** The worker dies **on spawn, before writing any `sandbox_worker.log` init line** → every sandboxed plugin "crashes": pizmidi AUs **and ValhallaSupermassive VST3** (which rspike loaded fine **when ad-hoc signed**). Strongly indicates the Mach/shared-mem IPC + `disable-library-validation` entitlement need a real signature. → see memory `project_sandbox_needs_signed_build`.
4. **Ad-hoc `codesign --deep` of build-merged was inconclusive** — the app then launches but won't window / logs nothing (nested VST3/AU helper bundles re-signed inconsistently; needs inside-out signing). Display is **mirrored + Space-switching**, which confounded windowing observation.
5. **Possible robustness gap (unconfirmed):** when the unsigned worker crash-looped, the **host process also died** (`attemptRestart re-entered, ignoring` → gone). rspike proved host-survives-SIGKILL with a real (signed) worker, so this may be an artifact of the degenerate unsigned case — **re-check on a signed build**.

**▶ NEXT to unblock the proof:** produce a **properly inside-out-signed** `build-merged` (`scripts/sign-all-macos.sh` with `DEVELOPER_ID_APP`, or a correct ad-hoc inside-out sign). Then the worker should init → `tools/reliability/crash_isolation_proof.sh proof` does the kill+assert, and R2 (real-AU hang) can be re-tested honestly. Env restored: conf `pluginSandboxMode=0` + `defaultNewSessionFile` back to `Default.els`; binary signature stripped back to working unsigned.

---

## ▶▶ HARNESS BUILT + READY (2026-06-02, session 2) — `tools/reliability/crash_isolation_proof.sh`
Ranked-blocker #1 ("make the ship-gate terminal-driven") is operationalised. The full crash-isolation code path is **re-verified end-to-end (file:line)** and a deterministic terminal harness is built + plumbing-self-tested. **Only the 1-min GUI plugin-load (Glen's stable launch) remains.**

- **Code path verified:** worker SIGKILL → JUCE pipe-break (instant) | heartbeat ≤5s [`sandboxhost.hpp:644`/`:674`] → `handleConnectionLost` (state=Crashed, `sandboxCrashed` + `crashed()`) → `SandboxedProcessorNode::sandboxCrashed` [`sandboxedprocessor.hpp:444`] logs `"[SandboxedProcessor] Sandbox crashed: <name>"` + `emitSandboxEvent(Crashed)` → `sigSandboxEvent` [`plugins.hpp:135`] → `ElementWebViewHost` → `onSandboxEvent({kind:"crashed"})` → React crash badge [`element_webview_host.cpp:4175`/`:4577`]; then `attemptRestart()`. Host never crashes (message-thread listener calls only).
- **Worker discovery:** worker = same `Element` binary relaunched as a JUCE child carrying cmdline UID `pshelbg` (`EL_PLUGIN_HOST_PROCESS_ID`). `pgrep -f pshelbg` finds it; host = its ppid. Plumbing self-tested green (discovery + host-resolve + `kill -9`).
- **Env prepped this session:** `pluginSandboxMode=1` already set in the conf (via `… setup`). `/Applications/Element.app` is restored (no `/tmp` aside copy). Direct-exec of build-merged does NOT LaunchServices-collide. Harness writes a PASS/FAIL evidence file to `.omo/evidence/`.
- **Restore when done:** `tools/reliability/crash_isolation_proof.sh restore` (sets mode back to 0).

## ✅ VERIFIED (automation)
- **Current build healthy:** `build-merged` (binary 01:03, this session) runs clean via direct-exec (only harmless `lilv` LV2 reload warnings, no crash). Has the committed sandbox route + the new reskinned webview UI (`index-DjrhxzHr.js`).
- **Sandbox route present:** `GraphManager::createFilter` (graphmanager.cpp:332) → `Settings::shouldSandboxPlugin(desc)` → `PluginManager::createSandboxedGraphNode`. Mode key `pluginSandboxMode` (0=off default, 1=all external, 2=problematic). Settings file: **`~/Library/Application Support/Kushview/Element/Element.conf`** (XML).
- **Worker mechanism proven (prior spike runs, `~/Library/Element/log/sandbox_worker.log`):** `Plugin loaded successfully: ValhallaSupermassive` in a separate worker pid; `PrepareToPlay rate=48000`; shared memory `/el_sb_*`; editor created 820x435 + `CAContextID` published. The out-of-process load + editor-create path works.
- **Live UI runs:** first snapshot launch showed the redesigned webview (Inspector tabs, scan controls, honest "NO SPECTRUM"); ValhallaSupermassive search → load worked (loaded **in-process** because the setting was initially read from the wrong store — see below — then corrected).

## 🚧 BLOCKED — live SIGKILL-survives proof UNMET (launch-environment, not code)
Three distinct macOS obstacles, none a code fault:
1. **`open` Gatekeeper-kills adhoc-signed `/tmp` copies** within ~10s. Direct-exec (`Element.app/Contents/MacOS/Element`) bypasses Gatekeeper → stays alive — but gets **no window** (no LaunchServices activation).
2. **Bundle-id collision:** installed `/Applications/Element.app 2.2.0` shares `net.kushview.Element` → LaunchServices terminates the dev build as a "duplicate". Moving the installed app needs **sudo** (root-owned). Renaming the dev copy's bundle id avoids the collision but then **computer-use screen-access is denied** ("not_installed" — not a registered app).
3. **Window won't foreground** in the (native-filtered) screenshots even when the in-repo build is alive — Glen's display is **mirrored**; the window likely renders where the capture can't see it. The in-repo build also exited ~2 min in (adhoc-launch context; Glen's normal daily launch of this same build is stable).

Also: this Element config had **0 scanned plugins in the prefs grep** (the browser shows ~1996 from a separate store), and sessions are blank/`Internal`-only or reference plugins that won't instantiate without a scan — so no headless session-autoload shortcut. `BRASS_4Horns` AU-hangs (R2) — avoid.

## ▶ HYBRID PATH TO COMPLETE (next session, ~1 min — needs Glen's launch)
1. Glen restores his app first if desired: `sudo mv /tmp/Element-2.2.0-aside.app /Applications/Element.app` — OR keeps testing build-merged directly.
2. Set the conf: `pluginSandboxMode` → `1` in `…/Kushview/Element/Element.conf`.
3. Glen launches `build-merged` **his normal way** (stable for him; window shows on his real screen).
4. Right-click canvas → type `valhalla` → add **ValhallaSupermassive (VST3)**.
5. Lead (terminal): `pgrep -P <host-pid>` → confirm a separate worker process hosts it (R1 proof) → `kill -9 <worker-pid>` → confirm host pid still alive + `sandbox_worker.log`/`onSandboxEvent` shows the crash (crash-isolation proof). Then `elementRestartSandbox` reload.

The Block "plugin crashed — reload" badge (committed this session) will show once a sandboxed node actually crashes — wire-verify it during this run.

## Note
This is the LAST ship-gate criterion that is unmet by evidence. Code is in place + unit/spike-proven; only the production end-to-end SIGKILL demo on a real commercial plugin remains. Do NOT mark Pillar-3 "done" until this passes live.
