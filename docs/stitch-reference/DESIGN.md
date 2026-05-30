# Stitch reference — Element Web shell (companion to the blueprint)

**Authority:** [docs/ELEMENT_UNIFIED_BLUEPRINT.md](../ELEMENT_UNIFIED_BLUEPRINT.md) is the product and visual spec. This folder holds **static layout references** for audits and visual QA alongside the live `webview/` app.

## Tokens (neumorphic chassis)

| Token     | Hex       | Role                          |
|-----------|-----------|-------------------------------|
| Canvas    | `#1E1E22` | Main background               |
| Panel     | `#222226` | Side rails, toolbars          |
| Surface   | `#252529` | Cards, blocks                 |
| Elevated  | `#2A2A2E` | Hover                         |
| Pressed   | `#1A1A1E` | Inset fields                  |

Semantic hues (4-category taxonomy, D1 2026-05-30):

| Category | Token | Hex | Shape |
|----------|-------|-----|-------|
| Virtual Instruments | `--color-instrument` | `#4A90D9` | ● Circle |
| MIDI Effects | `--color-midifx` | `#2BC4C4` | ▲ Triangle |
| Audio Effects | `--color-audiofx` | `#E8A838` | ◆ Diamond |
| Modulators/Utilities | `--color-modulator` | `#A87FE0` | ⬡ Hexagon |

No glassmorphism, no backdrop blur on primary chrome.

## HTML companions

- `edit-mode.html` — workshop layout: graph canvas, left palette, right inspector rail.
- `perform-mode.html` — stage layout: macro strip, meters, scene controls.

These are **not** the running app; they approximate region proportions and tone for design review.

## Live implementation

React sources: `webview/src/components/layout/`, `webview/src/components/canvas/`, `webview/src/index.css`.
