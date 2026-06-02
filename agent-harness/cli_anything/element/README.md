# cli-anything-element

A command-line bridge that lets an AI agent (or a human) **drive and inspect the
real Element audio host** for QA and debugging — without clicking the GUI.

Element is a real-time GUI plugin host with no headless mode, so this is **not**
a reimplementation. It:

1. **Actuates** a running Element over its OSC command surface
   (`/element/command/<name>` → the app's `ApplicationCommandManager`),
2. **Observes** lifecycle, crashes (macOS `.ips`), and logs,
3. **Inspects** `.els`/`.elg` project files (read-only),
4. **Verifies** all of the above into pass/fail QA verdicts.

Built because GUI-based verification of Element was slow and unreliable; this
turns "open it, click around, eyeball it" into deterministic, scriptable calls.

## Requirements

- **Element** — built (`build-merged/element_app_artefacts/Element.app`) or
  installed (`/Applications/Element.app`). Auto-discovered; override with
  `ELEMENT_APP=/path/to/Element.app`.
- The OSC **command** surface needs a build whose `src/services/oscservice.cpp`
  invokes commands (wired in this repo). `app launch` enables Element's OSC host
  by writing `Element.conf` (a `.cli-bak` backup is made; restore with
  `app restore-settings`).
- Python ≥ 3.10. The interactive REPL optionally uses `prompt-toolkit`
  (`pip install -e ".[repl]"`); one-shot `--json` commands need only `click`.

## Install

```bash
cd agent-harness
python3 -m venv .venv && . .venv/bin/activate     # optional but recommended
pip install -e .                                   # installs `cli-anything-element`
which cli-anything-element
```

## Quick start

```bash
# Launch a clean test instance (kills any running Element), OSC enabled
cli-anything-element --json app launch --fresh

# Drive it
cli-anything-element --json control transport play
cli-anything-element --json control panic
cli-anything-element --json engine sample-rate 48000

# Observe + verify
cli-anything-element --json app status
cli-anything-element --json app logs --which main --grep error
cli-anything-element --json verify assert --alive --no-crash      # exit 0 = PASS

# Inspect a project file (no GUI)
cli-anything-element --json inspect session ../data/sessions/pluginstack.els

# Stop it
cli-anything-element --json app quit       # graceful (OSC)
cli-anything-element --json app kill       # SIGKILL — crash-isolation simulation
```

Run with **no arguments** for an interactive REPL.

## Command reference

- `app` — `info`, `launch [SESSION] [--fresh] [--port N] [--no-osc] [--wait S]`,
  `status`, `logs`, `crashes`, `quit`, `stop --method term|kill|osc`, `kill`,
  `restore-settings`
- `control` — `list`, `raw <command> [--dry-run]`, `panic`,
  `transport <play|stop|record|rewind|forward|seek-zero>`,
  `session <new|open|close|save|save-as|add-graph|import>`,
  `graph <new|open|save|save-as|export|import|zoom-in|zoom-out|fit>`,
  `media <…>`, `view <…>`, `toggle <…>`, `edit <undo|redo|copy|paste|cut|select-all>`
- `engine` — `sample-rate <hz>`
- `inspect` — `session FILE`, `graph FILE`, `blocks FILE [--filter X]`
- `verify` — `ax [--suite all|…]`, `assert [--alive/--dead] [--no-crash]
  [--log-contains X] [--log-absent X] [--session FILE --min-blocks N --has-block NAME]`

## How it maps to Element

| CLI | Element internals |
|-----|-------------------|
| `control …` | OSC → `CommandOSCListener` → `Commands::fromString` → `GuiService::commands().invokeDirectly` |
| `engine sample-rate` | OSC `/element/engine "samplerate" <hz>` → `EngineOSCListener` |
| `inspect …` | parses ValueTree XML (`<Session>`/`<Node type="Graph">`) |
| `app status` crash | macOS `~/Library/Logs/DiagnosticReports/Element-*.ips` |
| `app logs` | `~/Library/Application Support/Kushview/Element/log/{main,element-verbose}.log` |
| `verify ax` | wraps `tools/automation/element_verify.py` |

## Tests

```bash
# unit + safe subprocess (no running Element)
CLI_ANYTHING_FORCE_INSTALLED=1 python -m pytest cli_anything/element/tests -v
# live tests that drive real Element (kills running instances — opt in)
ELEMENT_E2E=1 python -m pytest cli_anything/element/tests/test_full_e2e.py::TestLiveBridge -v
```
