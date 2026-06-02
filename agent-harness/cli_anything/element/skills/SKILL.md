---
name: "cli-anything-element"
description: "Drive and inspect the Element audio host from the CLI for QA/debug. Launch a test/debug instance, send OSC commands (transport, panic, session, views), tail logs, detect crashes, inspect .els/.elg project files, and produce pass/fail QA verdicts — replacing flaky manual GUI verification. Use when QA-testing Element, reproducing a bug in Element, scripting Element UI/engine interactions, or asserting Element state without clicking the GUI."
---

# cli-anything-element

An agent-facing bridge to **drive and observe the real Element app** (an audio
plugin host) from the command line, so QA and debugging no longer require manual
GUI clicking or flaky screenshot/AX automation.

Element is a real-time GUI host with **no headless/render mode**. This CLI does
NOT reimplement Element — it (1) **actuates** a running instance over Element's
own OSC command surface, (2) **observes** process/crash/log state, and (3) reads
`.els`/`.elg` project files, then (4) turns all that into machine-checkable
verdicts. Every command supports `--json`.

## Prerequisites

- A built or installed `Element.app`. The CLI auto-discovers it (built
  `build-merged/...Element.app` is preferred, then `/Applications/Element.app`);
  override with `ELEMENT_APP=/path/to/Element.app`.
- The OSC command surface requires an Element build with the OSC command
  receiver wired (this repo, `src/services/oscservice.cpp`). `app launch`
  force-enables Element's OSC host in `Element.conf` (and backs it up).

## Install

```bash
cd agent-harness && pip install -e .          # provides `cli-anything-element`
```

## Command groups

| Group | What it does |
|-------|--------------|
| `app` | `launch` / `status` / `logs` / `crashes` / `quit` / `stop` / `kill` / `info` / `restore-settings` — lifecycle + crash QA |
| `control` | drive the running app over OSC: `transport`, `session`, `graph`, `media`, `view`, `toggle`, `edit`, `panic`, `raw <cmd>`, `list` |
| `engine` | `sample-rate <hz>` (live engine control) |
| `inspect` | `session FILE` / `graph FILE` / `blocks FILE` — read-only `.els`/`.elg` introspection |
| `verify` | `ax [--suite ...]` (accessibility suites) + `assert ...` (composite pass/fail verdict) |

## Agent usage (always pass `--json`)

```bash
# Launch a fresh, deterministic test instance (kills any running Element first)
cli-anything-element --json app launch --fresh

# Is it up? did it crash? (exit code 2 if a crash report is present)
cli-anything-element --json app status

# Drive it
cli-anything-element --json control transport play
cli-anything-element --json control panic
cli-anything-element --json control view graph-editor
cli-anything-element --json control raw sessionSave        # any command by name
cli-anything-element --json engine sample-rate 48000

# Observe
cli-anything-element --json app logs --which main --grep error
cli-anything-element --json app crashes

# Inspect a project file without opening the GUI
cli-anything-element --json inspect session data/sessions/pluginstack.els
cli-anything-element --json verify assert --session run.els --min-blocks 5 --has-block Reverb

# One-call QA verdict (exit 0 = PASS, 1 = FAIL)
cli-anything-element --json verify assert --alive --no-crash

# Stop it: graceful OSC quit, SIGTERM, or hard SIGKILL (crash-iso simulation)
cli-anything-element --json app quit
cli-anything-element --json app kill
```

## Notes for agents

- **UDP is fire-and-forget.** A `control` command returning `sent: true` only
  means the datagram left the socket — confirm the effect via `app status`,
  `app logs`, or `verify`, never the send alone.
- **Single instance.** Element allows one instance; a second launch forwards to
  the first and exits. `app launch` reports `forwarded_to_existing` and a
  `warning`; use `--fresh` to replace the running instance for a clean test.
- **Crash vs exit.** `app status` reports `crashed` only when a real OS crash
  report (`.ips`) exists since launch; a process that merely vanished is
  `exited_unexpectedly`, not a crash.
- **Discover the vocabulary** with `control list`; every name maps to an Element
  `Commands::fromString` id and is sent to `/element/command/<name>`.
- Run `cli-anything-element` with no arguments for an interactive REPL.
