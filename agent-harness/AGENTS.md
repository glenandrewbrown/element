<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# agent-harness/ — Headless QA/Debug Bridge (`cli-anything-element`)

Python package that drives and inspects Element headlessly over OSC
(`/element/command/*` wired in `src/services/oscservice.cpp`). Replaces
flaky GUI/computer-use for CI, crash isolation, and AX suite setup.
Install once with `pip install -e .`; then use the `cli-anything-element`
entry point.

## Key Files
| File | Description |
|------|-------------|
| `ELEMENT.md` | Full CLI reference and OSC command surface |
| `setup.py` | Package definition; entry point → `cli-anything-element` |
| `cli_anything/` | Python package root (element subpackage inside) |
| `examples/` | Usage examples |
| `skills/` | Agent skill descriptors |

## Subcommands
| Subcommand | What it does |
|------------|-------------|
| `app launch --fresh` | Launch a clean Element instance (single-instance, OSC on) |
| `app status` | Is Element alive? crashed? (reads macOS `.ips` crash reports) |
| `app kill` | Deterministic teardown via SIGKILL (use over OSC `quit` — avoids save-dialog block) |
| `control transport play` | Drive Element transport over OSC |
| `engine` | Query audio engine state |
| `inspect` | Inspect loaded graph / session structure |
| `query dumpcv` | Dump live CV/Value signal state (probe wired in `oscservice.cpp`) |
| `verify --json --alive --no-crash` | Pass/fail QA verdict as JSON |

## For AI Agents
```bash
cd agent-harness && pip install -e .

# Launch, verify alive, teardown
cli-anything-element --json app launch --fresh
cli-anything-element --json verify assert --alive --no-crash
cli-anything-element --json app kill
```

**Single-instance rule:** always use `--fresh`; a second instance collides
on the OSC port and `verify` returns a false negative.

**Save-dialog trap:** graceful OSC `quit` blocks when Element shows an
unsaved-session dialog. Always use `app kill` for automated teardown.

Full docs: `agent-harness/ELEMENT.md` and
`cli_anything/element/skills/SKILL.md`.
