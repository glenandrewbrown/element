---
name: inspect-ax-tree
description: Use when debugging Element UI issues, investigating why a UI element is not visible or accessible, mapping the Accessibility tree to understand JUCE component exposure, or when AX-based assertions fail and you need to see what elements are actually present.
---

# Inspect Element's Accessibility Tree

Map Element's AX tree to discover UI element identifiers, debug visibility issues, and understand what JUCE components expose to the Accessibility API.

## Quick Start

```bash
# Map full tree (Element must be running)
cd tools/automation && python3 element_ax_map.py --depth 4

# Focus on a specific window
python3 element_ax_map.py --focus "Element" --depth 6

# Deep scan (slower, warns if depth > 5)
python3 element_ax_map.py --depth 7
```

## Output

- **stdout**: Indented tree showing `[AXRole] title="..." id="..." desc="..."`
- **element_ax_cache.json**: Full JSON with all attributes per element

## JUCE-Specific Notes

- JUCE components expose names via `AXTitle` and sometimes `AXIdentifier`
- `AXWindows` may return empty — the mapper also checks `AXMainWindow` and `AXFocusedWindow`
- `setComponentID()` in JUCE maps to `AXIdentifier`
- `setName()` in JUCE maps to `AXTitle`
- Menu bar items are fully exposed with all submenus

## When to Use

- An AX assertion fails and you need to see what's actually there
- You're adding new UI components and need to verify they're accessible
- You're debugging why a button/panel isn't responding to automation
- You want to understand Element's full UI structure

## Performance

- Depth 4: ~0.16s, ~109 elements
- Depth 6+: Can take seconds on complex windows — use `--focus` to narrow
