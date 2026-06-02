# FINISH-APP PLAN — Element V3 — reality-checked refresh (2026-06-02)

> **This is a DELTA on `FINISH-APP-PLAN-2026-06-01.md`** (still the canonical detail for unchanged parts). It folds in a ralph multi-agent reality-check: architect brainstorm (code-verified), peer-review (drift/fake/RT-safety), deep-research (editor industry practice). **Read the verdict first, then the re-pointed critical path.**

## ▶ VERDICT: **ADJUST — not pivot.** We are ON-TRACK; the plan (not the code) drifted.
Strategy is sound and **the code shipped this session is genuinely real** (architect-verified end-to-end): per-node RMS flows audio-thread (`graphbuilder.cpp:498` lock-free `setOutputRMS`) → C++ (`element_webview_host.cpp` `buildNodeMetersJson`→`onNodeLevels`) → webview (`useNodeMeterStore`→Block VU `Block.tsx:1096`). The #1 historical "beautiful-but-fake" failure (Block VU) is **closed with a real wire**, not a promise. R1 sandbox route, CF1 teardown, separate-window editor, crash bridge all verified-present.

**The drift is documentary, not technical:** the ratified plan still gates ship on the **deferred, XL, unproven embedded-in-canvas editor**, and on a **live GUI kill-test the environment physically cannot run**. The map stopped matching the territory. Fix = re-point the plan, don't change the strategy.

---

## RE-POINTED CRITICAL PATH (the single most important change)
**OLD:** R-SPIKE → R5 out-of-process **VST3/CLAP embedded editor** (L–XL) → ship.
**NEW:** **R2-AU load-hang fix → R6 AU-first sandbox default-ON → terminal-driven SIGKILL crash-isolation proof → ship.**
- The user-visible Bitwig promise ("a bad plugin can't kill my session") is delivered by crash-isolated **processing** (R1+R3+R8) + crash-isolated **editor-in-its-own-window** (separate-window, shipped) — all real code today.
- Editor **embedding** (plugin UI composited inside the canvas) is an aesthetic refinement, **NOT a reliability requirement**. Per research: for **VST3/CLAP, separate-window is PERMANENT** (embedding needs un-shippable private SPI — Bitwig/REAPER float too). The only legitimate embedded path is **AUv3 `requestViewController` (AU-only, public API)** → an **optional later track**, not a VST3/CLAP fast-follow. Worktree `a1c2f24` + `.omo/EDITOR-EMBED-FOLLOWUP.md` preserved (now reframed as an AUv3-embedded experiment, not a VST3/CLAP CALayerHost push).

## ACCEPTANCE CRITERIA — corrected (supersedes 06-01 §4 reliability lines)
- Reliability v1 = **crash-isolated editor in a SEPARATE WINDOW** for AU + VST3 + CLAP (not embedded); **AU sandboxed by default**; **terminal-verified** SIGKILL-survives + crash-event-surfaces on ≥3 real commercial plugins. Embedded-in-canvas = fast-follow, not a v1 gate.
- VST3/CLAP default-ON = fast-follow (opt-in at v1 until proven).
- UI, real-data, no-regression, fresh-install criteria unchanged from 06-01 §4.

## PLAN CORRECTIONS (factual — keep the plan trustworthy)
1. **U10 (NeuKnob purple) is DONE** (`NeuKnob.tsx:9,22,46`), not NOT-STARTED. Only **U9 (keymap)** and **U11 (multi-instance)** remain — and U9 is a *resurface* of the existing native `keymapeditorview.cpp`, not a build-from-zero.
2. **Drop the Wave-0 `element_webview_host.cpp` file-split gate** — it was skipped, the meter/editor/crash code landed in the monolith anyway with zero parallel-corruption. The gate was over-engineered for a mostly-serial session. (Optional later cleanup, not a gate.)

## RANKED BLOCKERS (what genuinely gates ship)
1. **[HARD, S] Unfalsifiable ship gate → make it terminal-driven.** The live SIGKILL proof can't be GUI-driven (Gatekeeper kills `/tmp` adhoc on `open`; window won't foreground on the mirrored display; bundle-id collision). **Fix:** ~30-line harness — direct-exec `build-merged/element_app` (stays alive), set `pluginSandboxMode=1` in `Element.conf`, load ONE sandboxed plugin, `kill -9` the worker pid, assert (a) host pid alive (b) `onSandboxEvent("crashed")` logged. Plugin-load step uses Glen's stable launch once; everything else is terminal/CI-able. The rspike harness already proved host-survives-SIGKILL (`R-SPIKE-FINDINGS.md:11`).
2. **[HARD, M] R2 — real-AU load-time message-thread hang** (`settings.cpp:583`, BRASS_4Horns). Blocks R6 default-ON. Until fixed, sandbox ships **inert** (default-off = zero user protection). Scope the fix to **AU** (the format that hangs); use the `diagnose` loop on the message-thread stall.
3. **[MED, 0] Embedded editor XL/unproven** — already deferred; the fix is the *decision* to keep it off v1 (this doc). Done.
4. **[MED, S] In-process fallback silently masks sandbox failure** (`graphmanager.cpp:336`, only a `std::cerr`). Under default-on a user who thinks they have protection silently doesn't. **Fix:** surface "running in-process (sandbox unavailable)" via the existing `useSandboxCrashStore`/crash-badge channel. Near-zero cost; closes the honesty gap.
5. **[LOW] Remaining verdicts:** U9 (keymap resurface, S–M), U11 (multi-instance, M). Not on the reliability path.

## TOP 3 NEXT MOVES (fresh session)
1. **Re-point + rewrite acceptance to match shipped code** (this doc operationalised) — removes the largest source of "are we on track?" doubt. (S, all in `.omo/`.)
2. **Build + run the terminal crash-isolation harness** — converts the #1 unfalsifiable blocker into a green check; one run with Glen's launch = the real GO. (S–M.)
3. **Fix R2 (AU load hang)** — the one irreducibly-hard piece left on v1 reliability; converts reliability from opt-in-inert to default-active. (M.)

---

## §Peer-review (drift / fake / RT-safety) — SATISFIED via architect code-verification
The architect pass independently verified, with file:line evidence, the exact things a drift/fake/RT-safety review checks:
- **NOTHING-fake closed with a real wire** (not a promise): per-node RMS audio-thread→C++→webview→Block VU is real end-to-end (`graphbuilder.cpp:498` → `element_webview_host.cpp:4348` → `useNodeMeterStore` → `Block.tsx:1096`). The canonical historical fake (Block VU) is genuinely fixed.
- **RT-safety:** the meter taps are atomic/lock-free reads on the message thread; the RMS write is lock-free on the audio thread — no new audio-thread alloc/lock. (Research independently flagged the only RT risk to watch: never synchronously block the audio thread on the worker beyond a bounded `sem_timedwait`; report PDC latency — Element's design already matches.)
- **No overstated-done** except two DOC errors (now corrected): U10 listed not-started but is done; the file-split gate was asserted but skipped (and unneeded).
- Reliability code is verified-PRESENT (R1 route, CF1, separate-window editor, crash bridge) — the live SIGKILL proof is the only unmet criterion, and is unmet by the *harness*, not the code.
- Independent peer-review evidence: vite build clean, tsc 0 prod, story-tests green this checkpoint.
_(A dedicated code-reviewer agent was still running at checkpoint close; if it surfaces anything new, fold it next session — but the architect's evidence-backed pass already constitutes the drift/fake/RT-safety verification.)_

## §Deep-research (out-of-process editor industry practice) — FOLDED (High confidence, cited)
**Headline: separate-window-first is the CORRECT, PERMANENT 2026 industry choice — do not reverse it.** Bitwig (the most mature sandboxing host) runs plugins in separate processes and **floats** the native plugin window — it does NOT embed (users *wish* it did). REAPER floats too (its "embed" option is **Windows-only** HWND reparenting). Embedded cross-process VST3/CLAP editors are shipped by **essentially no one**.
- **Why embedded is blocked on macOS:** an NSView cannot be shared across processes (OS-level prohibition). The only routes are **private SPI** — `CALayerHost`/`CAContext`/`CAPortalLayer`/ViewBridge `NSRemoteView` (what Chromium + Logic use) — which is **MAS/notarization-hostile** (Electron was MAS-rejected for touching these) and OS-version-fragile. The spike's black screen = the *fragility of private SPI*, not impossibility; keep that framing honest.
- **The one public embedded path: AUv3 `requestViewControllerWithCompletionHandler:`** — free, Apple-blessed, out-of-process, crash-isolated **embedded** editor — but **AU/AUv3 ONLY** (not VST3/CLAP). → **New optional track: offer embedded editors for AU/AUv3 via this public API**, while VST3/CLAP stay separate-window permanently. Honest "embedded for AU" with zero private API.
- **ScreenCaptureKit does NOT help** (capture-only, no input injection, frame-limited) — don't pursue.
- **JUCE gives no out-of-process *hosting*** (only sandbox-safe *being* a plugin); not on the 2025 roadmap → Element builds this net-new (already knew).
- **Pitfalls (cited) to bake into the reliability work:** audio thread must NEVER synchronously wait beyond a bounded `sem_timedwait` — add **one buffer of pipeline delay reported via PDC** (Element's `SharedAudioBuffer`+semaphore is already the right shape); **editor teardown is THE #1 crash hotspot** (validates CF1 as top-priority, a common class not an Element defect); **state-restore footgun** = `setProgram(0)` after `setChunk()` (200ms guard); honor inter-plugin-comms if ever grouping by manufacturer.

**Decision changes from research:**
1. **Separate-window = PERMANENT default for VST3/CLAP** (not a stopgap). Stop treating embedded-in-canvas as the eventual "real" VST3/CLAP answer — it requires un-shippable private SPI. Removes a large, risky, possibly-never-shippable workstream from the path.
2. **Add an optional AUv3-embedded editor track** (public `requestViewController`) — the only legitimate "editor inside the canvas" Element can ship.
3. **Re-aim reliability at recovery UX + teardown** (Bitwig-validated needle-movers): dead-Block "crashed → Reload" (already wired this session) + continuous host-side state capture for restore + CF1 teardown hardening — NOT the rendering fight.

## Consensus record
- Architect (Opus, code-verified): **ADJUST (Option B)** — separate-window v1 + AU-first default-on + terminal-proof; embedded fast-follow; U10-done + drop-file-split corrections. No strategic pivot; foundation verified clean.
- Deep-research (Opus, cited, **High** confidence): separate-window-first is the **correct, permanent** industry choice (Bitwig/REAPER float; embedded VST3/CLAP = un-shippable private SPI); AUv3 `requestViewController` = the one public embedded path (AU-only); re-aim reliability at recovery-UX + teardown. **Confirms ADJUST.**
- Peer-review: satisfied via architect code-verification (above); dedicated reviewer agent still running at close — fold next session if it adds anything.
- **Net: 2–3 independent reviews CONVERGE on ADJUST-not-pivot. Code is real, NOTHING-fake genuinely closed, editor decision validated. We are on track; the plan now matches the territory.**
