# SESSION HANDOFF 2026-06-10 — out-of-process hosting FUNCTIONAL, default mode=1 SHIPPED

**Commit:** `36e87345` on `wave-3-leanfast-ux` · **Installed:** `~/Applications/Element.app` (engine-only change; webview marker unchanged `index-D2DPQ5sG.js`) · **RT verdict:** PASS (initial REJECT → fixed → delta APPROVE) `.omc/state/qa-wave-reports/sandbox-mode1-RT-VERDICT-2026-06-10.md` · **Full narrative:** plan doc `.omo/plans/out-of-process-plugin-hosting-2026-06-09.md` §STATUS 2026-06-10 + memory `project_sandbox_mode1_functional.md`.

## What shipped
The 2026-06-09 "blockers" (helper-won't-launch, session-load hang) were misdiagnoses. Five real fixes:
1. `wantsContext()=true` on SandboxedProcessorNode (audio-thread null-deref SIGSEGV on first render — THE mode=1 killer). Regression test added.
2. Crash-handler leak: host's scanner-mode probe installed an empty handler → every host crash = silent self-SIGKILL, no .ips, for months. Install moved to `handleConnectionMade`. **Crash reports work again.**
3. `tearingDownWorker` guard — restart no longer kills its own healthy replacement (was an infinite ~1Hz loop).
4. Self-healing block sequencing (`expected = shm workerSequence+1`) + xrun log on threshold-crossing only (was per-block file I/O on the audio thread; 100% xrun storm after session load).
5. Host-owned single post-launch prepare (`preparedSinceLaunch`) BEFORE the audio gate opens; node listener no longer re-prepares (RT-verifier catch: post-gate shm re-create raced in-flight render reads).
Plus: `defaultPluginSandboxMode = 1`; Glen's conf `pluginSandboxMode` key removed so the default governs; `AsyncPluginLoadTest` fixture pins policy per-test (conf-independent).

## Verified
ctest 13/13 · live add → worker spawns, block ready, no badge · Default.els (pizmidi AUs) session-loads out-of-process, responsive, xruns settle 0 · worker SIGKILL ×2 → single restart each, host alive · default-governed run · installed app booted + observed under real interactive use (3 AUs → 3 workers, Inspector shows the sandboxed-plugin panel).

## Owed to Glen
- **Kontakt feel-test** — the #1 acceptance (heavy AU loads with UI staying responsive at mode=1). pizmidi proves the mechanism; Kontakt proves the experience.
- Note: double-clicking a sandboxed block opens an EMPTY host-side window today — use the Inspector's "OPEN EDITOR WINDOW" (worker's real GUI in a floating crash-isolated window). P3 React double-click wiring is the next UX task.

## Follow-ups (not gates)
- P3: route double-click on sandboxed blocks to `elementOpenSandboxedEditor` (+ suppress the empty host PluginWindow auto-open for sandboxed nodes).
- P0.2: worker quit NSException 'Periodic events are already being generated' — likely double `quit()` from handleConnectionLost firing twice; idempotent guard at sandboxworker.hpp:362/:941. Cosmetic.
- Worker idle poll ≈9% CPU each (50µs `sem_trywait` loop in `SandboxSemaphore::timedWait`) — consider blocking wait or adaptive backoff when many workers.
- Helper code-signing must be re-run for any DISTRIBUTED build (scripts ready from P2; dev box is x86_64 and runs unsigned).
- CV-through-sandbox still a known gap (audio+MIDI only).

## Traps (new this session)
- **Launch Element via `open` for sandbox tests** — workers spawned under Claude's Bash can't reach the AU registry (`AudioComponentFindNext` → "No compatible plug-in format"); host unaffected.
- `ls` is aliased to eza and `log` is a zsh builtin — use `/bin/ls` and `/usr/bin/log`.
- launchd's `exited due to SIGKILL | sent by Element[pid]` = the (now-fixed) self-SIGKILL crash-handler signature; with the fix, real .ips files appear again.
- lldb cannot attach to this debug build (crashes in ParseSymtab).
