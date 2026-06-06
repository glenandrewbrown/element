<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# tools/automation/ — AX-Based Autonomous UI Verification

Python suite that drives macOS Accessibility API assertions against a live
Element instance. No screenshots required. Covers four UI suites and
exposes a tree-mapping helper for debugging. The `qa2_runtime_suite.py`
extends coverage with runtime data-flow checks.

## Key Files
| File | Description |
|------|-------------|
| `element_verify.py` | Entry point — runs named suites via `--suite <name>` |
| `element_ax_map.py` | Maps the AX tree for debugging (`--depth 5` recommended) |
| `element_assertions.py` | Shared assertion primitives imported by the suites |
| `qa2_runtime_suite.py` | Runtime data-flow suite (signal meters, CV checks) |
| `README.md` | Setup and usage notes |
| `element_ax_cache.json` | Cached AX snapshot (stale if Element was updated) |

## Suites
| Suite name | What it checks |
|------------|---------------|
| `plugin-browser` | Plugin browser panel presence and list population |
| `session-browser` | Session/project tree panel |
| `navigation` | Icon sidebar navigation items |
| `toolbar` | Graph editor toolbar: zoom, breadcrumb, toggles |

## For AI Agents
```bash
# Prerequisite: Element must be running
cd agent-harness && cli-anything-element --json app launch --fresh

# Run all suites
cd tools/automation && python3 element_verify.py --suite all

# Map AX tree when an assertion fails
python3 element_ax_map.py --depth 5
```

**Gotcha — JUCE AX quirk:** `AXWindows` may return empty for JUCE apps.
`element_assertions.py` falls back to `AXMainWindow` / `AXFocusedWindow`
automatically — do not query `AXWindows` directly.

**Gotcha — stale cache:** delete `element_ax_cache.json` after a build that
changes component structure or accessibility labels.
