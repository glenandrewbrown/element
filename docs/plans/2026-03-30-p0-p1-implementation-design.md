# P0/P1 Implementation Design — Element UI/UX

**Date:** 2026-03-30
**Status:** Approved
**Branch:** `local-enhancements`

---

## P0-1: QuickAddComponent (Right-click canvas → search → insert)

**New files:** `src/ui/quickaddcomponent.hpp`, `src/ui/quickaddcomponent.cpp`

### Appearance
- 280px wide, up to 300px tall (8 results at 32px + 28px search)
- Dark background (surface.raised), 1px border, 4px drop shadow
- Search field: "Add node..." placeholder
- Result rows: type dot + name + manufacturer (grey) + format badge
- Arrow keys navigate, Enter inserts, Escape dismisses
- Clamped to graph viewport bounds

### Data Source
- `PluginManager::getKnownPlugins().getTypes()` + `NodeFactory` internal types

### Interaction
1. Right-click empty canvas → popup at cursor, search focused
2. Right-click on wire → popup at cursor, splice target stored
3. Type to filter (substring on name + manufacturer)
4. Enter → insert node at mouse position
5. If splice target: disconnect old wire, connect source→new→dest
6. If no splice + selected node exists: auto-connect (existing logic)
7. Escape or click-away dismisses

### Integration Points
- `GraphEditorComponent::mouseDown` (right-click handler)
- `GraphEditorComponent::itemDropped` / node insertion logic
- Wire hit-testing for splice detection

---

## P0-2: Real Fit-to-View

**File:** `src/ui/graphtoolbar.hpp` → `fitToView()`

- Calculate bounding box of all nodes via iteration
- Zoom = `min(viewportW / boundsW, viewportH / boundsH) * 0.9`
- Clamp minimum zoom to 0.1 (stray-node protection)
- Center viewport on bounds center
- Bind to Cmd+0

---

## P0-3: Tooltips

**Files:** `navigation.cpp` (IconButton), `graphtoolbar.hpp` (buttons)

- IconButton implements `juce::TooltipClient::getTooltip()`
- Labels: "Session Tree", "Browse", "Inspector", "Node Editor"
- Toolbar: "Zoom Out", "Zoom In", "Fit to View", "Snap to Grid", "Layout Direction", "Add Comment"

---

## P0-4: WCAG Contrast Fixes

| Element | Old | New |
|---------|-----|-----|
| Breadcrumb ancestor | `#6b7280` | `#9ca3af` |
| Star off | `#555555` | `#777777` |
| Badge text | `#cccccc on #555555` | `#ffffff on #555555` |
| Toolbar icon | `#8a9099` | `#9ca3af` |

---

## P0-5: Keyboard Shortcuts

**File:** `src/ui/standard.cpp` or parent content component

| Shortcut | Action |
|----------|--------|
| Cmd+1/2/3/4 | Switch sidebar panels |
| Cmd+= / Cmd+- | Zoom in/out |
| Cmd+0 | Fit to view |

---

## P1-1: Manufacturer Name in Plugin List

**File:** `src/ui/pluginspanelview.cpp` paintListBoxItem

- After plugin name, draw `desc.manufacturerName` in 10px grey
- Position: after name text, before format badge
- Truncate if needed

---

## P1-2: Session Browser Hover States

**File:** `src/ui/sessionbrowserpanel.cpp`

- Add `hoveredRow` member (int, -1)
- Add `mouseMove`/`mouseExit` overrides (copy pattern from pluginspanelview)
- Paint hover background in `paintListBoxItem`

---

## P1-3: Small Window Mode (600x400)

- Minimap: auto-hide when graph editor width < 600px
- Sidebar: at widths < 500px, collapse content panel (keep icon strip)
- QuickAddComponent: clamp popup bounds to parent viewport
- NodeSearchComponent: same viewport clamping

---

## P1-4: Port Tooltips

**File:** `src/ui/block.cpp` / pin painting area

- Add tooltip to port/pin hit area
- Text: port name from processor bus layout (e.g., "Audio In L", "MIDI In")

---

## P1-5: Bypass Toggle on Node Blocks

**File:** `src/ui/block.cpp` / `block.hpp`

- 12x12 power icon in top-right corner of block
- Click toggles `node.setBypass(!node.isBypassed())`
- Visual: dimmed/greyed node paint when bypassed
- Icon: small circle with vertical line (standard power symbol)
