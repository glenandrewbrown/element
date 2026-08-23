# ADR-007: Speed-First Navigation Gestures

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: design, ui
**Tags**: ux, keyboard, gestures, performance-mode

## Context

The Instrument Paradigm explicitly targets expert users in flow state. Iteration speed is the supreme metric. Standard DAW-style menus and right-click context chains penalise speed every time. The graph hierarchy is also unusually deep (Project → Board → Container/Portal → nested Board), so navigation must collapse "go down / come back up" to a single gesture.

## Decision

Adopt a fixed gesture and keyboard model that prioritises continuous motion over discoverability:

| Gesture | Action |
|---|---|
| Double-click Block | Dive into nested Board (150 ms transition) |
| Double-click empty canvas | Navigate UP one level (150 ms transition) |
| `Cmd+K` | Command palette — fuzzy search every action and block type |
| Right-click canvas | QuickAdd popup at cursor (inline search → insert) |
| `Ctrl+0`–`Ctrl+9` | Save spatial bookmark |
| `Shift+0`–`Shift+9` | Recall spatial bookmark |
| `Tab` | Jump to next block in the signal chain |
| `Escape` | Deselect / close / back out one level |

Mode model: **Edit Mode** (workshop) and **Perform Mode** (stage) differ structurally — Perform Mode swaps in the Dashboard Builder canvas — they do **not** swap palettes (see ADR-001).

A red, always-visible **Panic** button sends Note Off to all MIDI outputs.

## Consequences

### Positive
- Common loops (dive → tweak → bookmark → return) become continuous motions with no menu seek.
- `Cmd+K` palette doubles as discoverability — any user can find an action even without memorising its shortcut.
- Spatial bookmarks turn the deep Board hierarchy into a flat keyboard map.

### Negative
- New users have a steep gesture-learning cliff. There is no in-canvas hint surface yet.
- "Double-click empty canvas = up one level" conflicts with the convention some DAWs use (deselect). Accepted tradeoff.

### Neutral
- All shortcuts route through `webview/src/hooks/useKeyboard.ts` so they can be remapped centrally if required.

## Links
- `docs/ELEMENT_UNIFIED_BLUEPRINT.md`
- `webview/src/hooks/useKeyboard.ts`
- ADR-001 (no palette switch between modes)
- ADR-006 (sidebar shortcuts `Cmd+1`–`Cmd+4`)

**Related**: ADR-001, ADR-006
