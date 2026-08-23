# Reliability ship-gate — Layer-3 fix design (2026-06-02)

## Blocker (verified)
Sandbox now works end-to-end (worker boots + loads real VST3 + processes audio — commits `03507200`, `7053028c`). Remaining failure: when the worker is alive, the **host is SIGKILLed (exit 137, no `.ips`) ~4s later** = macOS duplicate-instance enforcement on two running `net.kushview.Element` (host + re-exec'd worker, same Mach-O / same `CFBundleIdentifier`). The `Prohibited` activation-policy mitigation (`5078290c`) is insufficient — it doesn't change the bundle identity macOS dedupes on. Natural experiment: distinct-id workers (`test_element`, old `rspike`) survive; same-id dev worker kills the host.

## DECISION: Option 1 — dedicated worker binary with a distinct bundle id  ★
Add a small `element_sandbox_host` GUI-app target, bundle id `net.kushview.Element.sandbox`, launched by the host instead of re-exec'ing `Element.app`. macOS then sees a different identity → no duplicate-instance kill. This is what **Bitwig** (`BitwigPluginHost*`), **REAPER** (`reaper_host*`), and **JUCE**'s own plugin-host/scanner do. Options 2 (non-GUI `main.cc` intercept), 3 (runtime identity-disclaim SPI), 4-survey all rejected — none changes the dedupe identity, and 2/3 break the future plugin-editor window. Effort **M (~1 day)**, risk low–med, and it *improves* the editor feature (frees the worker from the activation-policy tightrope).

**Enabling facts:** `ChildProcessCoordinator::launchWorkerProcess(executableToLaunch, …)` accepts ANY exe ("may be the same exe") — Element just passes `currentExecutableFile` today (`sandboxhost.hpp:728`). The worker code lives entirely in the `kv::element` STATIC lib (`src/CMakeLists.txt:5`, GLOB_RECURSE over all `src/`), already linked by both `element_app` and `test_element` → near-total code reuse for a new target.

## Implementation checklist
1. `CMakeLists.txt`: `juce_add_gui_app(element_sandbox_host PRODUCT_NAME "Element Sandbox Host" BUNDLE_ID "net.kushview.Element.sandbox" …)` + `LSUIElement=1` plist; `target_link_libraries(… PRIVATE kv::element)`; `target_sources(… PRIVATE src/sandbox_host_main.cc)`.
2. `src/sandbox_host_main.cc` (NEW, ~10 lines): build `SandboxWorker`, `initialiseFromCommandLine(cmd, EL_PLUGIN_HOST_PROCESS_ID, …)`, else exit. (no NSApplicationMain duplicate-instance concerns — distinct id.)
3. `SandboxHost::launchWorkerProcess()` (`sandboxhost.hpp:728`): resolve the helper binary (sibling in the bundle; dev-build / installed-.app / test fallbacks mirroring `application.cpp:486 initializeModulePath`) and pass THAT `File` to `launchWorkerProcess` instead of `currentExecutableFile`.
4. Sign inside-out: extend `tools/reliability/sign-dev-build.sh` + `scripts/sign-all-macos.sh` to sign the nested helper FIRST with `cmake/entitlements.plist` (hardened runtime + `disable-library-validation` — needed for 3rd-party dylib load). Add the helper to `installer/build_pkg.sh`.
5. Keep `Prohibited`/`Accessory` policy + `setsid()` as defence-in-depth. The `moreThanOneInstanceAllowed` worker carve-out (`application.cpp:209`) + `maybeLaunchSandboxWorker` (`:460`) become host-only/unnecessary — leave harmless or tidy.

## Verify (the ship-gate, now achievable)
Headless recipe with the new worker: sign → `crash_isolation_proof.sh setup` (mode=1) → load **≥3 real plugins** OOP (ValhallaSupermassive + 2 others; avoid BRASS_4Horns R2-hang) → for each `crash_isolation_proof.sh proof` asserts **host SURVIVED a LIVE worker SIGKILL** (confirm worker genuinely alive + plugin loaded via `pgrep -f pshelbg` + EL_SANDBOX_PROBE log) + crash marker in `main.log`. Gate met only when all 3 pass with a plugin actually hosted.

Caveat: the helper bundle must carry the entitlements (already solved for the current worker; carry them over).
