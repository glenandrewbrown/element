# Element UI Automation & Verification

Autonomous verification of Element's UI using the macOS Accessibility API.
No screenshots, no vision models — deterministic AX-based assertions.

## Quick Start

```bash
# Map Element's AX tree (Element must be running)
python3 element_ax_map.py --depth 5

# Run all verification suites (launches Element if needed)
python3 element_verify.py --suite all

# Run a specific suite
python3 element_verify.py --suite plugin-browser
```

## Architecture

```
Launch Element → Assert window exists → Run suite assertions → JSON output
                                              ↓
                                    AX API queries (50-200ms each)
                                    Fuzzy matching (rapidfuzz, threshold 70)
                                    Polling with timeout (3s default)
```

## Verification Suites

| Suite | What it checks |
|-------|---------------|
| `plugin-browser` | All/Favorites/Recent buttons, search box |
| `session-browser` | All Files/Recent buttons, search box |
| `navigation` | 4 navigation panel icons |
| `toolbar` | Zoom controls, status bar |

## Tools Required

| Tool | Purpose | Install |
|------|---------|---------|
| PyObjC | AX API access | `pip install pyobjc-framework-ApplicationServices pyobjc-framework-Cocoa` |
| rapidfuzz | Fuzzy element matching | `pip install rapidfuzz` |
| pyax | High-level AX wrapper | `pip install pyax` |
| Hammerspoon | Fast AX queries (5-10ms) | `brew install hammerspoon` |

## Files

| File | Purpose |
|------|---------|
| `element_ax_map.py` | Map and cache Element's AX tree |
| `element_assertions.py` | Deterministic AX state assertions |
| `element_verify.py` | Verification orchestrator with CLI |
| `element_ax_cache.json` | Cached AX tree (generated) |
