# Element UI/UX Implementation Plan

**Version:** 1.1 (post architecture review)
**Date:** 2026-03-30
**Scope:** 4 improvements — Plugin Browser, Graph Toolbar, Session Browser, Navigation
**Implementation Order:** A (Plugins) → C (Sessions) → B (Toolbar) → D (Navigation)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

---

## Overview

Four UI/UX improvements to Element, designed within JUCE C++20 constraints. Each improvement is self-contained. Leaf components (A, C) are enhanced before structural consolidation (D) wraps them.

**Design sources:** 4 specialized agents (architecture planner, 3 UI designers) analyzed the codebase and produced specifications. A third-party design pitch was reviewed — adopted: color-coded plugin types + breadcrumbs. Rejected: terminology rename, light theme, portal system.

---

## Architecture Review Findings (3 HIGH, 12 MEDIUM)

### HIGH Risks (must address before implementation)

**H1. DataPathTreeComponent drag-and-drop breaks silently (Phase D)**
`standard.cpp:678` uses the Data Path panel as a drag source for file drops into the graph. Phase D removes this panel. **Mitigation:** Migrate file-drop functionality to the Browse > Sessions tab. Add a "Data Path" footer button in Sessions that opens a file chooser or reveals the data directory.

**H2. ConcertinaPanel APIs disappear (Phase D)**
`standard.cpp:488,490` calls `expandPanelFully()` and `setPanelSize()` which are `juce::ConcertinaPanel` methods. **Mitigation:** The new icon-sidebar class exposes `activatePanel(int index)` as the replacement. Panel sizing is no longer needed since each panel fills the full content area. Remove the sizing calls.

**H3. Phase D inherits instability from A and C (Phase D)**
If phases A or C are left incomplete, phase D wraps broken components. **Mitigation:** Gate criteria before starting D:

- A: Plugin browser builds, all 3 views work (All/Favorites/Recent), star toggle persists across restart
- C: Session browser shows two-line rows, empty state renders, recently-opened tracks across restart

### Key MEDIUM risks

- `PluginUsageTracker::save()` does synchronous I/O — add timer-coalesced saves (2s delay)
- `sigSessionLoaded` doesn't fire for `.elg` imports — document as known limitation v1
- `sigSessionLoaded` fires from `pluginprocessor.cpp` on DAW state restore — filter: only record when `session->getFile().existsAsFile()`
- `configButton`/`sessionConfigButton` overlap with new toolbar — absorb into toolbar or remove
- Extract `PluginUsageTracker` from `moleculemanager.hpp` into own header to avoid UI→engine dependency
- `viewhelpers.hpp` and `standard.hpp` also need updating for nav type change
- Breadcrumb rewrite is closer to "new component" than "modification" — budget accordingly

---

## A. Plugin Browser Enhancement

### Architecture

**Ownership change:** `PluginUsageTracker` moves from standalone to owned by `PluginManager`. This gives it `KnownPluginList&` access, solving the `getFavorites()` / `getRecentlyUsed()` stubs.

```
PluginManager (owns PluginUsageTracker)
    |
    v
PluginsPanelView (receives PluginManager& — already does)
    calls plugins.getUsageTracker().toggleFavorite(desc)
    calls plugins.getUsageTracker().getRecentlyUsed(10)
    |
    v
PluginUsageTracker broadcasts ChangeMessage
    |
    v
PluginsPanelView::changeListenerCallback() → refreshes UI
```

### Layout (panel width = pw, typically 200px)

```
+------------------------------------------+ y=0
| [____Search plugins..._____]         [X] | 22px  (x=4, y=4, w=pw-8)
+------------------------------------------+ y=26
| [ All Plugins | Favorites | Recent ]     | 20px  (x=4, y=30, w=pw-8)
+------------------------------------------+ y=50
| ─────────────────────────────────────── | 1px divider #2A2D2F
+==========================================+ y=53  SCROLLABLE VIEWPORT
|  FAVORITES                          (3) | 20px section header
| [★] Kontakt 7         [●] [VST3] [...] | 28px row
| [★] Pianoteq 8        [●] [AU]   [...] | 28px row
|  RECENTLY USED                      (5) | 20px section header
| [ ] Gullfoss           [●] [VST3] [...] | 28px row
| [ ] Valhalla Room      [●] [AU]   [...] | 28px row
|  ALL PLUGINS                             | 20px section header
| v Effect                                 | 24px folder row
|   v Delay                                | 24px folder row
|     H-Delay            [●] [AU]   [...] | 28px row
+==========================================+
```

### Row Layout (28px height, within scrollable)

```
|5|★16|4|●8|4|  Plugin Name...  |4|VST3|4|···|4|
 ↑     ↑    ↑                    ↑ badge  ↑ overflow
star  type  name starts at x=37  pw-53   pw-21
```

### Segmented Control (All / Favorites / Recent)

- 3 equal-width `TextButton` children inside a custom `Component`
- **Default bg:** #3b3b3b | **Hover bg:** #4a4a4a | **Active bg:** #4765a0
- **Default text:** #cccccc (12px) | **Active text:** #ffffff (12px bold)
- Border: 1px rounded rect, radius 3px, color #555555

### Star Toggle

- Click area: x=0 to x=22 within row (tested in `listBoxItemClicked` via `e.x < 22`)
- **Off:** #555555 | **Off hover:** #8a9099 | **On:** #33aaf9 | **On hover:** #55bbff
- Shape: 5-point star path, 12x12 centered in 16x16 area
- Toggle calls `PluginUsageTracker::toggleFavorite(desc)` which saves + broadcasts

### Type Indicator (8x8 filled circle)

- **Instrument:** #4fc3f7 (light blue) — detected via `desc.isInstrument`
- **Effect:** #81c784 (green) — default when not instrument and not MIDI
- **MIDI:** #ce93d8 (purple) — detected via `desc.category.containsIgnoreCase("MIDI")`
- Fallback: #555555 when type unknown
- Tooltip: "Instrument" / "Effect" / "MIDI Effect"

### Format Badge

- Rounded rect bg #555555, radius 2px, text #cccccc, font 10px bold
- Width varies: "au" 24px, "lv2" 28px, "vst3" 32px, "clap" 32px
- Position: right-aligned, 4px from overflow button

### Search + View Selector Interaction

- Search filters across whichever view is active (All/Favorites/Recent)
- "Favorites" + search text → only favorited plugins matching the query
- "Recent" + search text → recently used plugins matching the query
- In "All" view with search text: show flat ListBox (not TreeView), hide empty folders
- In "All" view without search: show TreeView sorted by category

### Empty States

- Center vertically in list area
- Icon: 24x24 path-based, color #555555
- Text: 14px, #888888, centered
  - All: "No plugins found."
  - Favorites: "No favorites yet. Right-click a plugin to add it."
  - Recent: "No recently used plugins."

### Files to Modify

| File                                 | Change                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| `include/element/plugins.hpp`        | Add `PluginUsageTracker& getUsageTracker()` to `PluginManager` |
| `src/pluginmanager.cpp`              | Own `PluginUsageTracker` in `Private`, pass `KnownPluginList&` |
| `src/ui/moleculemanager.hpp`         | Add `KnownPluginList&` param to `PluginUsageTracker` ctor      |
| `src/ui/moleculemanager.cpp:340-354` | Implement `getFavorites()`/`getRecentlyUsed()` stubs           |
| `src/ui/pluginspanelview.hpp`        | Expand class with segmented control, viewport, section headers |
| `src/ui/pluginspanelview.cpp`        | Full rewrite of panel layout, add row painting, star toggle    |

---

## B. Graph Editor Toolbar

### Architecture

The existing 24px `BreadCrumbComponent` (already at `src/ui/breadcrumb.hpp`) is absorbed into a new 28px `GraphEditorToolbar`. The toolbar is owned by `GraphEditorView`, positioned between the breadcrumb strip and the `GraphEditor` viewport.

### Layout

```
FULL WIDTH (>= 520px content area):
┌──────────────────────────────────────────────────────────────────────────┐ 28px
│  Session / Main Mix / Reverb Bus        │ [##][HV][□·] │ [-] 100% [+] [↔] │
│  ← breadcrumb zone (flexible) →        │← optional →│← zoom (never hidden)→│
└──────────────────────────────────────────────────────────────────────────┘

COMPACT (400-519px):
┌──────────────────────────────────────────────────────┐ 28px
│  …/ Reverb Bus                    │ [-] 100% [+] [↔] │
└──────────────────────────────────────────────────────┘
  (snap, layout, comment hidden — zoom always visible)
```

### Toolbar Geometry

- **Height:** 28px (up from 24px)
- **Background:** #1e2123
- **Bottom border:** 1px #0d0f10
- **Left padding:** 6px | **Right padding:** 6px
- **All buttons:** 20x20px, y=4 (vertically centered)
- **Zoom label:** 42px wide, 20px tall, right-aligned text (11px)

### Controls Zone (right-aligned, 166px at full width)

From right edge inward:

```
6px | [fit]20 | 4px | [+]20 | 2px | [100%]42 | 2px | [-]20 | 8px | 1px div | 8px | [□·]20 | 4px | [HV]20 | 4px | [##]20 | 4px | 1px main div
```

### Responsive Breakpoints

| Width     | Hidden                | Visible                              | Controls width |
| --------- | --------------------- | ------------------------------------ | -------------- |
| >= 520px  | none                  | snap + layout + comment + zoom + fit | 166px          |
| 400-519px | snap, layout, comment | zoom + fit only                      | 120px          |
| < 400px   | snap, layout, comment | zoom + fit only                      | 120px          |

### Color Tokens (18 named)

| Token                 | Hex     | Usage              |
| --------------------- | ------- | ------------------ |
| toolbar-bg            | #1e2123 | Background         |
| btn-default-icon      | #8a9099 | Resting icon       |
| btn-hover-bg          | #2e3235 | Hover fill         |
| btn-hover-icon        | #cccccc | Hover icon         |
| btn-pressed-bg        | #3b3f45 | Press fill         |
| btn-pressed-icon      | #ffffff | Press icon         |
| btn-toggle-on-bg      | #1f3260 | Active toggle fill |
| btn-toggle-on-icon    | #33aaf9 | Active toggle icon |
| breadcrumb-ancestor   | #6b7280 | Parent text        |
| breadcrumb-leaf       | #cccccc | Current graph text |
| breadcrumb-divider    | #4a4f55 | "/" separator      |
| breadcrumb-hover-bg   | #2e3235 | Segment hover fill |
| breadcrumb-hover-text | #ffffff | Segment hover text |

### Breadcrumb Truncation Rules (priority order)

1. **Ancestor collapse:** Shorten ancestors to first 2 chars + "…" (min 18px each)
2. **Ellipsis prefix:** Replace distant ancestors with "…/" (16px)
3. **Leaf truncation:** Trailing "…" on current graph name (last resort, leaf never hidden)

### Breadcrumb Interaction

- Ancestor segments are clickable → navigate to that graph level
- Leaf segment is not clickable (current location)
- Click handler calls `GraphEditorView::setNode(ancestorNode)` using stored `nodes` array

### Zoom Label

- Text: integer percentage + "%" (e.g., "100%"), right-aligned in 42px box
- Single click: reset zoom to 100%
- Cursor: pointing hand on hover
- Range: 25% to 400%

### Icon Descriptions (path-based)

| Button      | Shape                                                      |
| ----------- | ---------------------------------------------------------- |
| Zoom Out    | Horizontal bar 8px wide, 1.5px tall, centered              |
| Zoom In     | Plus sign: 8px horizontal + 8px vertical, 1.5px thick      |
| Fit to View | Four outward arrow heads at cardinal edges of 10x10 square |
| Snap Grid   | 3x3 filled circles, 1.5px radius, 4px apart                |
| Layout H/V  | Two rectangles side by side (H) or stacked (V), each 4x8px |
| Comment Box | Hollow rounded-rect 9x7px, 1px stroke, 2px radius          |

### Files to Modify

| File                                 | Change                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| New: `src/ui/graphtoolbar.hpp`       | New `GraphEditorToolbar` component                                                          |
| `src/ui/breadcrumb.hpp`              | Substantial rewrite: add truncation, hover states, click callbacks (treat as new component) |
| `src/ui/graphdisplayview.hpp:94-112` | Change `removeFromTop(24)` to 28px; absorb or remove `configButton`/`sessionConfigButton`   |
| `src/ui/grapheditorview.hpp`         | Add `GraphEditorToolbar` member                                                             |
| `src/ui/grapheditorview.cpp:169-183` | Wire toolbar to `GraphEditorComponent` methods                                              |

---

## C. Session Browser Polish

### Architecture

- "Recently opened" tracked separately from files-on-disk
- Hook into `SessionService::sigSessionLoaded` to record opens
- **Filter:** Only record when `session->getFile().existsAsFile()` — avoids phantom entries from DAW state restore in plugin mode (`pluginprocessor.cpp:515` also fires this signal)
- **Known limitation v1:** `.elg` graph imports do not fire `sigSessionLoaded` — only `.els` session loads are tracked
- Store in `PropertiesFile` (application settings, survives across sessions)
- Max 20 recently opened entries
- Check `File::existsAsFile()` to handle stale references

### Layout Enhancements

```
+------------------------------------------+ y=0
| [____Search sessions..._____]        [X] | 22px
+------------------------------------------+ y=26
| [ All Files | Recent ]                   | 20px segmented (2 segments)
+------------------------------------------+ y=48
| ─────────────────────────────────────── | 1px divider
+==========================================+ y=51  SCROLLABLE
| [●] My Film Score Session                | 40px row (two-line)
|     Mar 29, 14:30  |  1.2 MB             |
| [●] Orchestral Template                  | 40px row
|     Mar 28, 09:15  |  Session            |
+==========================================+

EMPTY STATE (centered in list area):
     [folder icon 32x32, #555555]
     No sessions found.
     Create one from File > Save Session.
```

### Row Layout (40px height)

- **Line 1 (y=4, h=20):** Category dot (x=4, 8x8 at y=16) + Name (x=16, 14px bold, #cccccc)
- **Line 2 (y=20, h=16):** Date + file size (x=16, 11px, #888888)
- **Category dot colors:** Session #4fc3f7, Graph #81c784, Preset #ffb74d, Controller #ce93d8

### "All Files" vs "Recent"

- "All Files": scans disk directories (existing behavior)
- "Recent": reads from `PropertiesFile` key `"recentlyOpenedSessions"`, shows sessions the user actually loaded
- Segmented control switches between views
- Search filters whichever view is active

### Empty State

- Paint in `SessionBrowserPanel::paint()` when `filteredEntries.isEmpty()`
- Folder icon: 32x32, path-based, #555555, centered
- Text: 14px, #888888, centered below icon

### Files to Modify

| File                                   | Change                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `src/ui/sessionbrowserpanel.hpp`       | Add segmented control, recently-opened tracking            |
| `src/ui/sessionbrowserpanel.cpp:148`   | Implement empty state in `paint()`                         |
| `src/ui/sessionbrowserpanel.cpp:25-61` | Enhance `paintListBoxItem` with file size, two-line layout |
| `src/services/sessionservice.cpp`      | Hook `sigSessionLoaded` to record recently opened          |
| `src/ui/navigation.cpp:384-389`        | Pass `PropertiesFile*` to SessionBrowserPanel if needed    |

---

## D. Navigation Consolidation

### Architecture

**Approach: Icon sidebar + content switching** (replaces accordion entirely)

A 24px-wide vertical icon strip replaces the accordion headers. Clicking an icon switches the entire content area to that panel. This eliminates the header tax (7 headers x 24px = 168px wasted) and gives each panel maximum vertical space.

```
+----+---------------------------------------+
|    |                                       |
| 🌲 |  (content area for active panel)     |
| 🔍 |                                       |
| 🔧 |  Height = full sidebar height        |
| 📝 |                                       |
|    |  Width = sidebar width - 24px         |
+----+---------------------------------------+
  24px           content area
```

### 4 Navigation Icons

| Index | Icon   | Label     | Content                                                                 |
| ----- | ------ | --------- | ----------------------------------------------------------------------- |
| 0     | Tree   | Session   | `SessionTreePanel` (existing, unchanged)                                |
| 1     | Search | Browse    | Tabbed: Plugins tab + Sessions tab                                      |
| 2     | Wrench | Inspector | Tabbed: Node tab + Graph tab (auto-activates on selection)              |
| 3     | Pencil | Editor    | `NodeEditorView` (existing, auto-activates when editable node selected) |

### Icon Strip Specs

- **Width:** 24px fixed
- **Icon size:** 14x14 centered in 24x24 cell
- **Default icon:** #6b7280
- **Hover icon:** #cccccc, hover bg #2e3235
- **Active icon:** #33aaf9 (toggle blue), left edge indicator 2px wide #33aaf9
- **Tooltip:** appears right of icon on hover

### Browse Panel (tabbed)

```
+------------------------------------------+
| [ Plugins | Sessions ]                   | 20px tab bar
+------------------------------------------+
|                                          |
|  (PluginsPanelView or SessionBrowser)   |
|                                          |
+------------------------------------------+
```

- Tab bar: two `TextButton`s, same segmented control style as plugin browser
- Active tab: #4765a0 bg, #ffffff text
- Inactive tab: transparent bg, #888888 text
- Content switches between existing `PluginsPanelView` and `SessionBrowserPanel`

### Inspector Panel (tabbed, auto-activating)

```
+------------------------------------------+
| [ Node | Graph ]                         | 20px tab bar
+------------------------------------------+
|                                          |
|  (NodePropertiesView or GraphSettings)  |
|                                          |
+------------------------------------------+
```

- When a node is selected: auto-switch to Node tab (unless user manually navigated away)
- When no node is selected: show Graph tab
- Both tabs always accessible via click

### Data Path Disposition

Data Path (`DataPathTreeComponent`) is removed from the navigation sidebar entirely. Access via:

- **File > Open Data Folder** menu item (calls `DataPath::defaultLocation().revealToUser()`)
- Or a button within Browse > Sessions tab footer

**IMPORTANT (HIGH risk from review):** `standard.cpp:678` uses `DataPathTreeComponent` as a drag-and-drop source for file drops into the graph. This functionality must be migrated to the Browse > Sessions tab before removing the Data Path panel. The Sessions tab should support dragging `.els`/`.elg` files onto the graph canvas.

### State Migration

```cpp
// In restoreState(): migrate old panel names to new icon indices
if (props->containsKey("ccNavPanel")) {
    // old format — migrate
    auto oldActive = props->getValue("ccNavPanel_activePanel", "Plugins");
    if (oldActive == "Plugins" || oldActive == "Sessions") activeIcon = 1; // Browse
    else if (oldActive == "Graph" || oldActive == "Node") activeIcon = 2; // Inspector
    else if (oldActive == "Editor") activeIcon = 3;
    else activeIcon = 0; // Session
    // save under new key
    props->setValue("navIconPanel_activeIcon", activeIcon);
    props->removeValue("ccNavPanel");
}
```

### Call Site Updates (standard.cpp)

12 call sites use `nav->findPanel<T>()`. Replace with typed accessors:

```
nav->findPanel<SessionTreePanel>()    → nav->getSessionTreePanel()
nav->findPanel<NodePropertiesView>()  → nav->getNodePropertiesView()
nav->findPanel<NodeEditorView>()      → nav->getNodeEditorView()
nav->findPanel<GraphSettingsView>()   → nav->getGraphSettingsView()
nav->findPanel<DataPathTreeComponent>() → removed (migrate drag-drop to Sessions tab)
nav->expandPanelFully()                → nav->activatePanel(index) (HIGH: ConcertinaPanel API disappears)
nav->setPanelSize()                    → removed (panels fill full height in icon mode)
```

### Files to Modify

| File                                | Change                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `src/ui/navigation.cpp`             | Replace `ConcertinaPanel` with icon strip + content switching               |
| `include/element/ui/navigation.hpp` | New class API: typed accessors + `activatePanel(int)`                       |
| `include/element/ui/standard.hpp`   | Update `getNavigationConcertinaPanel()` return type                         |
| `src/ui/viewhelpers.hpp`            | Update forward declaration                                                  |
| `src/ui/standard.cpp`               | Update 12 `findPanel<T>()` + remove `expandPanelFully`/`setPanelSize` calls |
| `include/element/ui/style.hpp:170`  | Remove dead `drawConcertinaPanelHeader` override                            |
| New: `src/ui/browsepanel.hpp`       | Tabbed Plugins + Sessions wrapper                                           |
| New: `src/ui/inspectorpanel.hpp`    | Tabbed Node + Graph wrapper                                                 |

### Gate Criteria (must pass before starting Phase D)

Phase D wraps components from A and C. Do not start D until:

- [ ] A: Plugin browser builds, all 3 views work (All/Favorites/Recent), star toggle persists across restart
- [ ] C: Session browser shows two-line rows, empty state renders, recently-opened tracks across restart
- [ ] A+C: Both panels work correctly as standalone `Component`s (ready to be wrapped in tabs)

---

## Implementation Order & Dependencies

```
A (Plugin Browser)  ──→  independent, do first
        |
C (Session Browser) ──→  independent, do second (but after A since sessions panel
        |                 is simpler and benefits from same segmented control pattern)
        |
B (Graph Toolbar)   ──→  independent, do third
        |
D (Navigation)      ──→  depends on A and C being complete (wraps them in tabs)
```

### Estimated Scope

| Task               | New files | Modified files | Risk                                                            |
| ------------------ | --------- | -------------- | --------------------------------------------------------------- |
| A. Plugin Browser  | 0         | 6              | Medium (PluginUsageTracker ownership change)                    |
| B. Graph Toolbar   | 1         | 4              | Low (new component, no existing behavior changed)               |
| C. Session Browser | 0         | 4              | Low (polish existing panel)                                     |
| D. Navigation      | 2         | 3              | High (structural change, 12 call site updates, state migration) |

---

## Shared Design Tokens

These values are used across all 4 improvements for consistency:

| Token           | Hex     | Usage                      |
| --------------- | ------- | -------------------------- |
| bg-primary      | #16191A | Main background            |
| bg-widget       | #3b3b3b | Widget/control background  |
| bg-toolbar      | #1e2123 | Toolbar background         |
| bg-hover        | #2e3235 | Hover state fill           |
| bg-active       | #4765a0 | Active/selected state      |
| text-primary    | #cccccc | Default text               |
| text-active     | #ffffff | Hover/active text          |
| text-dimmed     | #888888 | Secondary/placeholder text |
| text-muted      | #6b7280 | Tertiary text              |
| accent-blue     | #33aaf9 | Toggle active, highlights  |
| brand-blue      | #4765a0 | Active tabs, selections    |
| divider         | #2A2D2F | Separator lines            |
| type-instrument | #4fc3f7 | Instrument indicator       |
| type-effect     | #81c784 | Effect indicator           |
| type-midi       | #ce93d8 | MIDI indicator             |
| type-preset     | #ffb74d | Preset indicator           |
| badge-bg        | #555555 | Format badge background    |
| font-default    | 13px    | Primary text               |
| font-small      | 11px    | Secondary text, badges     |
| font-label      | 10px    | Badge text                 |
| row-height      | 28px    | Plugin list rows           |
| row-height-tall | 40px    | Session list rows          |
| section-header  | 20px    | Section header height      |
| toolbar-height  | 28px    | Graph toolbar              |
| button-size     | 20x20px | Toolbar icon buttons       |
| border-radius   | 3px     | Standard corner radius     |

---

## Follow-Up Items (not in scope for this plan)

These were identified during review but are deferred to future iterations:

1. **Empty canvas state** — When Element opens with no nodes in the graph, the canvas is blank with no guidance. Design a watermark or onboarding hint (e.g., "Right-click to add a node, or drag a plugin from the browser"). Low effort, high polish.

2. **Connection signal metering** — Animate cable opacity/color based on audio RMS. Requires `juce::AbstractFifo` or atomic ring buffer from audio thread to GUI at ~30fps. Keep animations primitive (opacity shift, not particle effects). Deferred until audio engine plumbing is in place.

3. **Accessibility / WCAG contrast** — Verify all text/background combinations meet WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text). Key risk areas: `text-dimmed` (#888888) on `bg-primary` (#16191A) = 5.3:1 (passes), but `text-muted` (#6b7280) on `bg-primary` = 3.8:1 (fails AA for normal text). Consider bumping `text-muted` to #7b8290 for compliance. Add `Component::setAccessible()` and keyboard focus order to new components.

4. **Linux FileSystemWatcher gap** — Session browser auto-refresh only works on macOS/Windows. Add a periodic timer fallback (10s poll) for Linux.
