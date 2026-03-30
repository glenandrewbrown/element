---
name: verify-element-ui
description: Use when UI code has been modified (src/ui/*.cpp, src/ui/*.hpp), after a successful build, when verifying UI changes work correctly, or when the user says "verify", "test the UI", or "check the UI". Runs deterministic Accessibility API assertions against running Element — no screenshots needed.
---

# Verify Element UI

Run autonomous AX-based verification of Element's UI components.

## Quick Start

```bash
# Element must be running (launch if needed)
pgrep -x Element || open build-merged/element_app_artefacts/Element.app
sleep 3

# Run all verification suites
cd tools/automation && python3 element_verify.py --suite all
```

## Available Suites

| Suite | Command | What it checks |
|-------|---------|---------------|
| All | `--suite all` | Everything below |
| Plugin Browser | `--suite plugin-browser` | All/Favorites/Recent buttons, search box |
| Session Browser | `--suite session-browser` | All Files/Recent buttons, search box |
| Navigation | `--suite navigation` | 4 icon sidebar panels |
| Toolbar | `--suite toolbar` | Zoom controls, status bar |

## When to Run

- After modifying any `src/ui/*.cpp` or `src/ui/*.hpp` file
- After a successful `cmake --build` that touched UI code
- Before committing UI changes
- When debugging UI issues ("is the button actually there?")

## Output

JSON to stdout with pass/fail per assertion. Exit code 0 = all pass, 1 = failures.

## If Element isn't running

Launch it first — the orchestrator can auto-launch but needs the build path:

```bash
open build-merged/element_app_artefacts/Element.app
# or for release builds:
open build-release/element_app_artefacts/Release/Element.app
```

## Troubleshooting

- **"Accessibility permission not granted"**: Grant Terminal/Claude access in System Settings > Privacy > Accessibility
- **All assertions fail**: Element may not be fully loaded. Wait 3s after launch.
- **Specific button not found**: Run `python3 element_ax_map.py --depth 5` to see what AX exposes
