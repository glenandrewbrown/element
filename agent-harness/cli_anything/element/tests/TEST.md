# TEST.md — cli-anything-element

Test plan + results for the Element QA/debug bridge.

## What "the real software" means here

Element is a real-time GUI audio host with **no headless/batch/render mode**, so
there is no output artifact (PDF/PNG/WAV) to byte-verify. The "real software"
invocation this harness verifies is therefore **behavioural**:

- the real `Element.app` **launches and stays alive** (process state),
- the **OSC control surface accepts commands** and acts on them (the canonical
  proof: OSC `quit` → the process exits cleanly, with no signal sent by us — the
  pre-wiring `// noop` would have left it running),
- **no crash report** is produced (macOS `.ips`),
- **`.els`/`.elg` project files** parse to the expected structure.

No graceful degradation for the live layer: if the Element binary cannot be
found, the E2E launch test **fails** (it does not fake a result).

## Test Inventory Plan

- `test_core.py` — ~24 unit tests, synthetic data, no Element, no network listener.
- `test_full_e2e.py` — live tests (real Element) + safe subprocess tests.

## Unit Test Plan (`test_core.py`)

- **utils/osc.py** — `encode_message` 4-byte alignment for address-only,
  string/int/float args, bool `T`/`F` tags (no payload), blob; OSC string padding.
- **core/control.py** — `resolve` for aliases and raw command names; unknown → None;
  `command_address` format; `ALL_COMMANDS` non-empty and camelCase; vocabulary groups.
- **core/engine.py** — `set_sample_rate` rejects non-positive; shapes a valid result.
- **core/inspect.py** — parse a synthetic `.els` (graphs/blocks/arcs/flags) and a
  synthetic `.elg`; `find_blocks`; bad root rejected; missing file raises.
- **utils/element_backend.py** — PropertiesFile get/set round-trip under a temp
  `ELEMENT_SETTINGS`; `enable_osc_host` writes the two keys; `recent_crash_reports`
  empty dir → `[]`; log-path helpers derive from the settings dir.
- **core/session.py** — locked save/load/update/clear round-trip under a temp home.

## E2E / Live Test Plan (`test_full_e2e.py`)

- **TestCLISubprocess** (always safe — no running Element needed): invokes the
  installed `cli-anything-element` via `_resolve_cli()` and checks `--help`,
  `--json control list`, `--json control raw transportPlay --dry-run`,
  `--json inspect session <generated .els>`, and that an unknown command exits non-zero.
- **TestLiveBridge** (opt-in via `ELEMENT_E2E=1`, because it **kills** any running
  Element to get a deterministic instance): `app launch --fresh` → assert alive +
  OSC bound → `control transport play` → `verify assert --alive --no-crash` passes →
  `app quit` (OSC) → assert the process exited with no crash report.

### Realistic workflow scenarios

- **Smoke-up / smoke-down**: launch fresh → confirm alive + OSC host bound → quit
  over OSC → confirm clean exit + no crash report. (Proves the actuate+observe loop.)
- **Crash-isolation simulation**: launch fresh → `app kill` (SIGKILL) → `app status`
  distinguishes a hard kill from a clean exit (and would surface a real `.ips`).
- **Project-file QA**: `inspect session <file>` → `verify assert --session <file>
  --min-blocks N --has-block <name>` for structural assertions without the GUI.

## Test Results

_Run 2026-06-02 on macOS (Darwin 24.6.0), Python 3.14.5, pytest 9.0.3. Element
build under test: `build-merged` dev build, v2.2.0
(`.../build-merged/element_app_artefacts/Element.app/Contents/MacOS/Element`),
freshly rebuilt with the OSC command wiring._

### Unit + subprocess suite (`test_core.py` + `TestCLISubprocess`)

`CLI_ANYTHING_FORCE_INSTALLED=1 pytest test_core.py test_full_e2e.py::TestCLISubprocess`

```
============================== 30 passed in 0.91s ==============================
```
RC=0. 24 unit (`test_core.py`) + 6 subprocess (`TestCLISubprocess`). The
subprocess tests drive the **installed console script** (confirmed with `-s`:
`[_resolve_cli] Using installed command: /…/.venv/bin/cli-anything-element`).

### Live E2E (`TestLiveBridge`, `ELEMENT_E2E=1`) — drives the real Element

```
test_launch_control_save_verify ............... PASSED
test_kill_is_distinguished_from_clean_exit .... PASSED
============================== 2 passed in 18.52s ==============================
```

- **`test_launch_control_save_verify`** — `app.launch(--fresh)` with a real
  `.els` → `alive=True`, `osc_bound=True` → `control transportPlay` (sent, no
  crash) → `verify.assert_state(alive, no_crash)` passes → **OSC `sessionSave`
  rewrites the `.els` on disk** (the modal-free, deterministic proof that the OSC
  command surface actually *invokes* commands) → SIGKILL teardown → process gone,
  no crash report.
- **`test_kill_is_distinguished_from_clean_exit`** — launch → `app kill`
  (SIGKILL) → instance gone; a hard kill is distinguished from a clean exit.

### Two issues the live run surfaced — both fixed

1. **`osc_port_bound()` used `lsof -iUDP`**, which takes ~51 s/call when the repo
   is on a mounted `/Volumes` volume (lsof enumerates all fds on all mounts),
   making launch block ~3 min and the suite un-runnable. **Fixed:** switched to
   `netstat -an -p udp` (~10 ms) with an lsof fallback. Launch now completes in
   seconds and `osc_bound` reports correctly.
2. **SIGKILL teardown reported the process as still alive** in-process: the test
   launches via `Popen` and SIGKILLs in the same Python process, so the child
   lingered as a `<defunct>` zombie that `os.kill(pid, 0)` still counts as alive.
   **Fixed:** `_pid_alive` is now zombie-aware (`ps -o state=`), and `stop()`
   reaps its own child. (In normal one-shot CLI use launch/stop are separate
   processes, so the child reparents to launchd and is reaped — this only bit the
   in-process API path the test uses.)

### Totals

| Suite | Tests | Passed | Failed |
|-------|------:|-------:|-------:|
| Unit + subprocess | 30 | 30 | 0 |
| Live E2E (`TestLiveBridge`) | 2 | 2 | 0 |
| **Total** | **32** | **32** | **0** |

**Coverage note.** Unit/subprocess tests cover the pure logic (OSC byte-encoding
+ padding, command vocabulary/alias resolution, engine sample-rate guards,
`.els`/`.elg` parsing incl. nested-container blocks, settings/OSC-host
round-trip, crash-report scanning, session locking) and the installed-CLI surface
(`--help`, `control list/raw --dry-run`, `inspect session`, `app info`, non-zero
exit on unknown command). The live layer exercises the real Element end-to-end:
launch + liveness + OSC `transportPlay` + composed verdict + **OSC `sessionSave`
proven by an on-disk `.els` rewrite** + SIGKILL teardown + crash inference.

**Known product caveat (not a test failure):** Element's graceful quit
(`/element/command/quit` → `systemRequestedQuit`) can block on a "save session?"
modal when the session is dirty, so it is unreliable for headless teardown — use
`app stop`/`app kill` (SIGTERM/SIGKILL) for deterministic shutdown. Some
advertised commands (e.g. `mediaNew`, `signIn`) resolve over OSC but have no
registered command target yet, so they are accepted but no-op; the live commands
(transport, session, panic, views, zoom, etc.) invoke correctly.
