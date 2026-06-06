<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# cli_anything/element/ — Element CLI Implementation

Element-specific subpackage of `cli-anything-element`. `element_cli.py` is
the Click/argparse entry point; `core/` holds domain subcommand modules;
`utils/` provides OSC transport and backend helpers; `tests/` has unit and
e2e suites; `skills/` contains the agent skill descriptor.

## Key Files
| File | Description |
|------|-------------|
| `element_cli.py` | CLI entry point — dispatches to core subcommands |
| `__main__.py` | `python -m cli_anything.element` entry |
| `core/app.py` | `app launch`, `app status`, `app kill` subcommands |
| `core/control.py` | `control transport` and other OSC control commands |
| `core/engine.py` | `engine` — audio engine state queries |
| `core/inspect.py` | `inspect` — graph/session structure inspection |
| `core/session.py` | `session` — session/project file operations |
| `core/verify.py` | `verify --json` — pass/fail QA verdict |
| `utils/osc.py` | OSC client (wraps python-osc; target port 9000) |
| `utils/element_backend.py` | Process management + crash-report reader |
| `utils/repl_skin.py` | REPL/interactive shell skin |
| `tests/test_core.py` | Unit tests for core subcommands |
| `tests/test_full_e2e.py` | Full end-to-end tests (require running Element) |
| `tests/TEST.md` | Test setup and run instructions |
| `skills/SKILL.md` | Agent skill descriptor for `cli-anything-element` |
| `README.md` | Package-level usage notes |

## For AI Agents
- OSC port: **9000** (Element listens when launched with OSC enabled)
- All commands emit JSON with `--json`; parse `result.ok` for pass/fail
- Run unit tests without a live Element: `python -m pytest tests/test_core.py`
- Run e2e tests (Element must be running): `python -m pytest tests/test_full_e2e.py`
