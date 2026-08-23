# Element UI/UX Design Brief

**Document Version:** 1.0
**Date:** 2026-03-30
**Author:** Glen Brown (Kushview LLC)
**For:** Frontend UI/UX Designer

---

## 1. Product Overview

### What is Element?

Element is a **modular audio plugin host** for professional music production. It allows users to load, connect, and route audio plugins (VST3, AU, LV2, CLAP) in a visual node-based graph, creating complex signal chains for instruments, effects, and MIDI processing.

### Who uses it?

- Music producers and composers
- Sound designers and audio engineers
- Live performers needing complex plugin routing
- Film/game audio professionals (Nuendo/Pro Tools users)

### How is it used?

- **Standalone application** on macOS/Linux/Windows
- **Plugin inside a DAW** (VST3/AU/CLAP format) hosted within Logic Pro, Nuendo, Cubase, Ableton, etc.
- Both contexts share the same internal UI

### Core Value Proposition

Replace complex hardware routing with a visual, modular software environment where any audio plugin can be connected to any other in arbitrary configurations.

---

## 2. Current Architecture

### Tech Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Language     | C++20                                                            |
| UI Framework | JUCE 8.0.12 (custom component-based UI, not HTML/CSS)            |
| Rendering    | Native OS rendering (CoreGraphics on macOS, Direct2D on Windows) |
| Theming      | Custom `LookAndFeel_E1` class with programmatic colors           |
| Layout       | Manual `setBounds()` positioning + `StretchableLayoutManager`    |
| State        | `ValueTree` (JUCE's observable tree data structure)              |
| Fonts        | System default (JUCE sans-serif)                                 |

### Design Constraints

- **No HTML/CSS/React** - all UI is C++ JUCE components
- **Single-window application** with panels and views
- **Must work at small sizes** when hosted as a plugin UI inside a DAW (minimum ~600x400)
- **Dark theme only** (current) - professional audio convention
- **No web views or external rendering** - pure native components
- **Cross-platform** - must look consistent on macOS, Windows, Linux

---

## 3. Current Layout Structure

```
+------------------------------------------------------------------+
|  Transport Bar (BPM | TAP | Time Signature)                      |
+------------------------------------------------------------------+
|         |                                                         |
| NAV     |  MAIN CONTENT AREA                                     |
| PANEL   |                                                         |
| (170-   |  Currently shows one of:                                |
|  510px) |  - Graph Editor (node canvas)                           |
|         |  - Plugin Editor (plugin UI)                            |
|         |  - Settings views                                       |
|         |  - Console views                                        |
|         |                                                         |
| +-----+|                                                         |
| |SESSN||                                                         |
| +-----+|                                                         |
| |GRAPH||                                                         |
| +-----+|                                                         |
| |NODE ||                                                         |
| +-----+|                                                         |
| |EDITR||                                                         |
| +-----+|                                                         |
| |PLUGS||  +--------------------------------------------------+   |
| |[___]||  |  Minimap (bird's eye view)                       |   |
| | tree ||  +--------------------------------------------------+   |
| +-----+|                                                         |
| |SESNS||                                                         |
| +-----+|                                                         |
| |DATA ||                                                         |
| |PATH ||                                                         |
| +-----+|                                                         |
+---------+---------------------------------------------------------+
|  Status Bar (Device: Fireface 802 | Engine: Running)             |
+------------------------------------------------------------------+
```

### Navigation Panel Sections (Concertina/Accordion)

| Section   | Purpose                      | Current State            |
| --------- | ---------------------------- | ------------------------ |
| SESSION   | Session tree (graphs, nodes) | Functional but basic     |
| GRAPH     | Graph settings               | Minimal                  |
| NODE      | Selected node properties     | Functional               |
| EDITOR    | Node editor view             | Functional               |
| PLUGINS   | Plugin browser with search   | **Needs improvement**    |
| SESSIONS  | Session file browser (NEW)   | Just added, needs design |
| DATA PATH | Raw file tree browser        | **Unintuitive**          |

---

## 4. Current Color Palette

### Background Colors

```
Main Background:    #2a2a2a (dark gray)
Widget Background:  #3b3b3b (medium gray)
Content Background: #2e2e2e (slightly lighter than main)
Minimap Background: #1a1a1a (very dark)
```

### Brand / Accent Colors

```
Elemental Blue:     #4765a0 (primary brand)
Toggle Blue:        #33aaf9 (active state)
Toggle Green:       #92e75e (enabled)
Toggle Orange:      #faa63a (warning/modified)
Toggle Red:         #ff0000 (error/mute)
```

### Node Block Colors (8 presets)

```
Dark Red:     #800000    Dark Orange:  #E24B00
Dark Yellow:  #EDED00    Pastel Green: #247D21
Pastel Blue:  #2969BE    Purple:       #5627A1
Jet:          #363636    Snow:         #FFFCFF
```

### Comment Box Colors (7 presets, 25% alpha)

```
Red, Orange, Yellow, Green, Blue, Purple, Gray
(Used for visual grouping of nodes)
```

---

## 5. Known UX Problems

### 5.1 Plugin Browser (CRITICAL)

**Current behavior:**

- Tree view sorted by category (manufacturer submenu)
- Search box filters leaf nodes but **shows empty category folders**
- No distinction between instruments, effects, MIDI effects
- No favorites, no recently used, no frequency-based suggestions
- AU instruments and MIDI effects were not being found (bug, now fixed)

**User frustration:**

> "When filtering plugins by keyword, empty folders are still displayed - only results should be returned"

**Desired behavior:**

- Flat search results (no empty folders) when searching
- Category tree when browsing (no search text)
- Favorites section at top
- Recently used section
- Plugin type icons (instrument/effect/MIDI)
- Format badge (AU/VST3/CLAP/LV2)

### 5.2 Session Management (CRITICAL)

**Current behavior:**

- `File > Open` standard OS file dialog
- `File > Open Recent` submenu (filename only, no metadata)
- `Data Path` panel shows raw file system tree (no sorting, no previews)

**User frustration:**

> "Loading sessions is very un-intuitive - accessing saved sessions organised by date modified would be useful to quickly view browse and add - as well as smaller elements like graphs, plugin chains etc"

**Desired behavior:**

- Dedicated session browser panel
- Sort by date modified (most recent first)
- Visual preview or metadata (graph count, plugin count, last opened)
- Quick-access to sub-elements: graphs (.elg), presets (.eln), controllers (.elc)
- Drag-and-drop session elements onto the graph
- Category filter (sessions / graphs / presets / controllers)

### 5.3 Graph Editor Usability

**Current strengths:**

- Snap-to-grid alignment
- Comment boxes for organization
- Minimap navigation
- Lasso multi-select
- Auto-connect suggestions (ghost connectors)

**Missing features:**

- No zoom controls in the UI (only keyboard/scroll)
- No breadcrumb navigation for nested graphs
- Connection routing is point-to-point (no cable routing)
- No undo/redo indicator
- No visual feedback for audio signal flow (metering on connections)

### 5.4 Navigation Panel

**Issues:**

- Too many accordion sections compete for space
- Section headers take up significant vertical space
- Collapsed sections provide no information
- No way to pin/float panels
- No way to hide unused sections

---

## 6. Recommended UI/UX Improvements

### 6.1 Plugin Browser Redesign

```
PLUGINS
+----------------------------------------------+
| [____Search plugins...______] [Type: All v]  |
+----------------------------------------------+
|                                              |
| FAVORITES                         [star icon]|
| +------------------------------------------+|
| | Kontakt 8              (vst3) [inst]      ||
| | Waves H-Delay          (au)   [fx]        ||
| | Pianoteq 8             (vst3) [inst]      ||
| +------------------------------------------+|
|                                              |
| RECENTLY USED                                |
| +------------------------------------------+|
| | Gullfoss               (vst3) [fx]        ||
| | Cinematic Rooms Pro    (vst3) [fx]        ||
| +------------------------------------------+|
|                                              |
| ALL PLUGINS (sorted by category)             |
| +------------------------------------------+|
| | v Effect                                   ||
| |   v Delay                                  ||
| |     H-Delay             (au)  [fx]        ||
| |   v Reverb                                 ||
| |     Cinematic Rooms     (vst3) [fx]        ||
| | v Instrument                               ||
| |   Kontakt 8             (vst3) [inst]      ||
| |   Pianoteq 8            (vst3) [inst]      ||
| +------------------------------------------+|
+----------------------------------------------+
```

**Behaviors:**

- When search text is entered: show flat list, hide empty categories
- Right-click plugin: Add to favorites / Remove from favorites
- Double-click: insert into current graph
- Drag onto graph: insert at drop position
- Type badges: colored pills [inst] blue, [fx] green, [midi] purple
- Format shown in parentheses: (au), (vst3), (clap), (lv2)

### 6.2 Session Browser Redesign

```
SESSIONS
+----------------------------------------------+
| [____Search sessions...____] [Filter: All v] |
+----------------------------------------------+
|                                              |
| [blue] My Film Score Session                 |
|        Mar 29, 14:30                         |
|                                              |
| [blue] Orchestral Template                   |
|        Mar 28, 09:15                         |
|                                              |
| [green] String Ensemble Graph                |
|         Mar 27, 18:00                        |
|                                              |
| [orange] Reverb Chain Preset                 |
|          Mar 25, 11:45                       |
|                                              |
| [purple] MIDI Controller Map                 |
|          Mar 20, 16:30                       |
+----------------------------------------------+
```

**Behaviors:**

- Color-coded category indicator (dot/pill):
  - Blue = Session (.els)
  - Green = Graph (.elg)
  - Orange = Preset (.eln/.elpreset)
  - Purple = Controller (.elc)
- Sorted by date modified (most recent first)
- Filter dropdown: All / Sessions / Graphs / Presets / Controllers
- Double-click: open session or import graph
- Right-click: Open / Show in Finder / Delete
- Auto-refreshes when files change on disk

### 6.3 Graph Editor Improvements

```
+------------------------------------------------------------------+
| [+] Add Node  [Zoom -][100%][Zoom +]  [Layout: H/V]  [Minimap] |
+------------------------------------------------------------------+
|                                                                    |
|  +--------+     +--------+     +--------+                         |
|  | Input  |---->| Plugin |---->| Output |                         |
|  | Device |     | (FX)   |     | Device |                         |
|  +--------+     +--------+     +--------+                         |
|                     |                                              |
|                     v                                              |
|                 +--------+                                         |
|                 | Plugin |                                         |
|                 | (Send) |                                         |
|                 +--------+                                         |
|                                                                    |
|                              +------------------+                  |
|                              | Minimap          |                  |
|                              | [viewport rect]  |                  |
|                              +------------------+                  |
+------------------------------------------------------------------+
```

**Recommended additions:**

- **Toolbar** above graph canvas with zoom controls, layout toggle, add node button
- **Zoom percentage indicator** with click-to-reset
- **Node search overlay** (Cmd+Space) for quick node insertion at cursor
- **Connection metering** - thin colored bars on connections showing signal level
- **Breadcrumb trail** for navigating into sub-graphs

### 6.4 Consolidated Navigation

Reduce the 7 accordion sections to 4 logical groups:

```
BROWSE        (Plugins + Sessions + Data merged)
GRAPH         (Graph settings + Node properties merged)
EDITOR        (Node editor view)
INSPECTOR     (Selected node details, I/O, parameters)
```

---

## 7. Common User Workflows

### Workflow 1: Building a Channel Strip

1. Open Element (standalone or as plugin)
2. Browse plugins panel for an EQ
3. Drag EQ onto graph
4. Browse for a compressor
5. Drag compressor onto graph
6. Connect: Input → EQ → Compressor → Output
7. Open each plugin's editor to configure
8. Save session

### Workflow 2: Loading a Previous Session

1. Open Element
2. **Current:** File > Open > navigate file system > find .els file
3. **Desired:** Click Sessions panel > see recent sessions > double-click

### Workflow 3: Finding and Adding a Plugin

1. **Current:** Scroll through category tree, expand folders, find plugin
2. **Desired:** Type plugin name in search > see filtered results > double-click or drag

### Workflow 4: Organizing a Complex Graph

1. Add comment boxes around related node groups
2. Color-code comment boxes by function (instruments=blue, effects=green)
3. Use minimap to navigate
4. Use alignment tools to clean up layout
5. Save as a template graph (.elg)

### Workflow 5: Live Performance

1. Load a session with multiple instruments and effects
2. Use MIDI controller mapping to control parameters
3. Switch between graphs for different songs
4. Monitor levels and routing via the graph view

---

## 8. Interaction Patterns Reference

### Mouse Interactions

| Action             | Behavior                                        |
| ------------------ | ----------------------------------------------- |
| Click node         | Select                                          |
| Shift+click        | Add to selection                                |
| Double-click node  | Open plugin editor                              |
| Right-click node   | Context menu (duplicate, delete, color, bypass) |
| Drag from port     | Create connection                               |
| Drag node          | Move node (snaps to grid)                       |
| Drag empty space   | Lasso select                                    |
| Scroll wheel       | Scroll graph                                    |
| Cmd+scroll         | Zoom graph                                      |
| Double-click empty | Deselect all                                    |
| Right-click empty  | Context menu (add node, paste, alignment)       |

### Keyboard Shortcuts

| Key                 | Action                     |
| ------------------- | -------------------------- |
| Delete/Backspace    | Delete selected nodes      |
| Cmd+D               | Duplicate selected         |
| Cmd+A               | Select all                 |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo                |
| Space               | Toggle transport play/stop |
| Cmd+S               | Save session               |
| Cmd+N               | New session                |

---

## 9. Deliverables Required

### From the Designer

1. **High-fidelity mockups** (Figma or similar) for:
   
   - Redesigned plugin browser panel
   - Session browser panel
   - Graph editor toolbar
   - Node block visual refresh (all display modes)
   - Connection visual styles (audio vs MIDI vs CV)
   - Color palette refinement

2. **Component specifications:**
   
   - Exact pixel dimensions, padding, margins
   - Color values (hex) for all states (default, hover, active, disabled, selected)
   - Font sizes and weights for all text elements
   - Icon set (SVG) for plugin types, actions, navigation
   - Animation/transition specs (duration, easing)

3. **Interaction documentation:**
   
   - State diagrams for complex interactions (drag-connect, lasso select)
   - Hover states for all interactive elements
   - Loading/scanning progress indicators
   - Error states and empty states
   - Tooltip content and placement

4. **Design system:**
   
   - Spacing scale (4px grid recommended)
   - Border radius scale
   - Shadow/elevation scale
   - Typography scale
   - Icon size scale

### From the Developer (Implementation)

All UI changes are implemented in **C++ using JUCE components**. The developer needs:

1. **Color values** as hex codes (e.g., `Colour(0xff33aaf9)`)
2. **Layout dimensions** in pixels (absolute positioning, not CSS)
3. **Font specifications** as size + style (e.g., `Font(FontOptions(13.f, Font::bold))`)
4. **Icons** as embedded SVG paths or PNG binary data
5. **Interaction specs** described in terms of mouse events (mouseDown, mouseMove, mouseUp, mouseDoubleClick, mouseWheelMove)

### Key Source Files for Implementation

| Component        | File                                                               |
| ---------------- | ------------------------------------------------------------------ |
| Plugin browser   | `src/ui/pluginspanelview.cpp/hpp`                                  |
| Session browser  | `src/ui/sessionbrowserpanel.cpp/hpp` (new)                         |
| Graph editor     | `src/ui/grapheditorcomponent.hpp` (~2000 lines)                    |
| Node blocks      | `src/ui/block.hpp/cpp`                                             |
| Connections      | `src/ui/grapheditorcomponent.cpp` (ConnectorComponent inner class) |
| Navigation panel | `src/ui/navigation.cpp`                                            |
| Main content     | `src/ui/standard.cpp`                                              |
| Colors/Theme     | `src/ui/style.cpp` + `include/element/ui/style.hpp`                |
| Comment boxes    | `src/ui/commentboxcomponent.hpp/cpp`                               |
| Minimap          | `src/ui/minimapcomponent.hpp/cpp`                                  |
| Node search      | `src/ui/nodesearchcomponent.hpp/cpp`                               |
| Context menus    | `src/ui/contextmenus.hpp`                                          |

---

## 10. Technical Constraints for Designer

1. **No CSS** - all styling is programmatic (C++ paint methods)
2. **No flexbox/grid** - manual pixel positioning with `setBounds(x, y, w, h)`
3. **Limited text rendering** - single font family, limited text layout options
4. **No SVG rendering** (except through JUCE Drawable) - prefer PNG or path-based icons
5. **No gradients on text** - solid colors only
6. **No blur effects** - only drop shadows (DropShadow class)
7. **No rounded rectangles with individual corner radii** - all corners same radius
8. **Custom scrollbars** - styled via LookAndFeel, not OS-native
9. **ListBox** for lists (row-based, not CSS list) - each row is painted individually
10. **TreeView** for hierarchical data - each item painted individually

### What IS possible:

- Rounded rectangles with configurable radius
- Drop shadows
- Opacity/alpha blending
- Custom painting with Graphics context (lines, arcs, paths, fills)
- Embedded images (PNG, JPEG)
- Custom cursors
- Tooltips
- Modal dialogs and popup menus
- Drag and drop (within app)
- Timer-based animations (manual frame-by-frame)
- Anti-aliased rendering

---

## Appendix: Reference Applications

For design inspiration from the same domain:

| Application                        | Relevance                                      |
| ---------------------------------- | ---------------------------------------------- |
| **Bitwig Studio**                  | Modern node-based modular UI, dark theme       |
| **VCV Rack**                       | Virtual modular synth with cable routing       |
| **Unreal Engine Blueprint Editor** | Node graph editing UX patterns                 |
| **Max/MSP**                        | Patcher-style modular audio programming        |
| **Figma**                          | Canvas-based editor with panels and properties |
| **Blender** (Node Editor)          | Graph editing with grouping and navigation     |

These applications demonstrate mature solutions for node-based editing, panel management, and search/browse patterns that Element should aspire to.
