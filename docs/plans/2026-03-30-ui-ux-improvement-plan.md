# UI/UX Improvement Plan — Element (v2, Gemini-reviewed)

**Date:** 2026-03-30
**Source:** 3 parallel expert reviews + Gemini 3.1 Pro second opinion
**Branch:** `local-enhancements`
**Scores:** Architecture 6.1/10, Visual 4/10, Interaction 5/10

> **Gemini's key correction:** The original plan over-indexed on DX (design tokens,
> shared components) and under-indexed on workflow enablement. A producer routing
> signal in a tiny DAW window doesn't care how elegantly a color was defined in C++.

---

## P0 — Critical (Must Fix Before Merge)

### P0-1: "Quick-Add" workflow — right-click canvas + search + Enter
- **Combines:** original P0-1 (double-click) + P2-3 (canvas context menu)
- **Why P0:** In every node editor (Blender, Max/MSP, Bitwig, Unreal), the canvas IS the interface. Forcing users to a sidebar to find a plugin breaks flow.
- **Implementation:**
  1. Right-click empty canvas → inline search popup at mouse position
  2. Type plugin name → fuzzy filter results
  3. Enter → insert node at mouse position, auto-connect if dropped on a wire
  4. Also: double-click in sidebar plugin list inserts at graph center
  5. Also: Enter key in sidebar list inserts (keyboard accessibility)
- **Files:** `grapheditorcomponent.cpp` (right-click handler), `pluginspanelview.cpp:292` (double-click stub)

### P0-2: Real fit-to-view (Cmd+0)
- **File:** `src/ui/graphtoolbar.hpp` line 698-705
- **Current:** `fitToView()` just resets zoom to 1.0 — the name is a lie
- **Fix:** Calculate bounding box of all nodes, set zoom + viewport to show all content
- **Gemini warning:** Clamp maximum zoom-out to prevent stray nodes at (10000, -5000) from making everything invisible. Use percentile bounds (ignore outlier 5% of nodes) or a minimum zoom floor.

### P0-3: Tooltips on all sidebar icons and toolbar buttons
- **File:** `src/ui/navigation.cpp` lines 98-147
- **Fix:** Implement `juce::TooltipClient` on `IconButton`
- **Labels:** "Session Tree", "Browse Plugins & Sessions", "Inspector", "Node Editor"
- **Also:** Toolbar buttons need tooltips too (Zoom In, Zoom Out, Fit to View, Snap to Grid, Layout Direction, Add Comment)

### P0-4: Fix WCAG AA contrast failures
- **Moved from P1** — if users can't see the star or badge, those features don't exist
- | Element | Current | Fix | Ratio |
  |---------|---------|-----|-------|
  | Breadcrumb ancestor text | `#6b7280` (3.0:1) | `#9ca3af` (5.0:1) | AA pass |
  | Unfavorited star | `#555555` (2.1:1) | `#777777` (4.0:1) | AA pass |
  | Format badge text | `#cccccc on #555555` (4.0:1) | White on badge | AA pass |
  | Toolbar icon default | `#8a9099` (3.7:1) | `#9ca3af` (5.0:1) | AA pass |

### P0-5: Keyboard shortcuts
- **Moved from P1** — audio pros keep one hand on mouse, one on keyboard
- | Shortcut | Action |
  |----------|--------|
  | Cmd+1/2/3/4 | Switch sidebar panels |
  | Cmd+= / Cmd+- | Zoom in/out |
  | Cmd+0 | Fit to view |
  | Shift+A | Quick-add node search at canvas center |

---

## P1 — High Priority (Ship Quality)

### P1-1: Plugin manufacturer name in flat list
- **Moved from P3** — with 500+ plugins, 5 identical "Compressor" entries without manufacturer is a critical usability failure
- **Fix:** Add manufacturer as secondary text (smaller, grey) or parenthetical: "Pro-Q 3 (FabFilter)"
- **File:** `src/ui/pluginspanelview.cpp` paintListBoxItem

### P1-2: Session browser hover states
- **File:** `src/ui/sessionbrowserpanel.cpp` paintListBoxItem
- **Copy pattern from:** `pluginspanelview.cpp` hoveredRow tracking

### P1-3: Small window mode (600x400) fixes
- **Gemini identified — was completely missing from original plan**
- Sidebar must auto-collapse or become overlay at narrow widths
- Minimap must auto-hide below threshold (e.g., 800px wide)
- Node search popup must clamp to viewport bounds
- Consider: hamburger menu trigger instead of permanent icon strip

### P1-4: Node port tooltips
- **Gemini identified — missing from original plan**
- Many plugins have 16+ outputs. Hovering a node pin must show what it does (e.g., "Sidechain Input L", "Audio Out R")
- Without this, routing is guesswork

### P1-5: Bypass/mute toggle on node blocks
- **Gemini identified — missing from original plan**
- Users shouldn't open a plugin UI just to bypass it
- Add a small bypass icon directly on the node block in the graph

---

## P2 — Medium Priority (Polish)

### P2-1: DesignTokens namespace
- **Moved from P1** — important for developer sanity but doesn't change user experience
- Create `src/ui/designtokens.hpp` with semantic names
- 80/20 shortcut: create 3 padding constants (PadSmall/Med/Large) for structural elements only, don't hunt down every 5px→4px

### P2-2: Extract shared UI components
- `SegmentedControl` — replace 2 duplicate `styleSegmentButton` implementations
- `TabBar` — replace 2 duplicate `updateButtonStyles` implementations
- `ListColors` — single shared header
- Increase tab height from 20px to 28px

### P2-3: Replace blocking menu calls
- **File:** `src/ui/sessionbrowserpanel.cpp` line 404
- Use `showMenuAsync` with SafePointer callback

### P2-4: Visual polish
- Drop shadows on floating overlays (minimap, node search)
- Fix minimap border from `Colours::grey` to standard border color
- Normalize corner radii where egregious (don't do a full audit)

### P2-5: Split header-only megafiles
| File | Lines | Split to .cpp |
|------|-------|---------------|
| `graphtoolbar.hpp` | 738 | Yes |
| `commentboxcomponent.hpp` | 508 | Yes |
| `nodesearchcomponent.hpp` | 277 | Yes |
| `minimapcomponent.hpp` | 212 | Yes |

---

## P3 — Future

### P3-1: Audio/signal feedback (Gemini-identified gap)
- Visual signal flow on wires (LED meters on output ports, wire brightness)
- Connection type visualization (audio=thick, MIDI=dashed, CV=dotted)
- Without this the graph "feels dead"

### P3-2: Graph workflow
- Auto-align / tidy graph feature (combat "spaghetti factor")
- Auto-wire / splice: drop node onto existing wire to insert in chain
- Finer zoom steps (10% instead of 25%, or multiplicative)
- Comment box: auto-edit on creation, undo support, "Send to Back"

### P3-3: Plugin window management
- Floating plugin UI window management (pin, tile, close-all)
- Fuzzy search in plugin browser ("PROQ3" → "FabFilter Pro-Q 3")

### P3-4: Other
- Node search: persist on click-away, dismiss only on Escape
- Replace path-based nav icons with SVG/PNG assets
- Minimap connection lines and toolbar toggle button
- Molecule library: ship complete UI or remove dead code
- Minimap: optimize paint() routine (leave 10Hz poll, it's fine)

---

## Gemini's Top 5 (Ship This Week)

1. **Quick-Add workflow** — Right-click canvas → search → Enter (the single biggest interaction win)
2. **Real fit-to-view (Cmd+0)** — Users get lost on infinite canvas
3. **WCAG contrast fixes** — Invisible features effectively don't exist
4. **Tooltips on sidebar/toolbar** — Zero labels = zero discoverability, cheap fix
5. **Keyboard shortcuts (Cmd+1-4, zoom)** — Audio pros need this

---

## Score Targets

| Metric | Current | Target |
|--------|---------|--------|
| Architecture | 6.1/10 | 8/10 |
| Visual Design | 4/10 | 6.5/10 |
| Interaction | 5/10 | 8/10 |
| WCAG AA Compliance | ~60% | 100% |
| Keyboard Coverage | ~20% | 80% |

---

## Key Changes from v1 (After Gemini Review)

| Item | v1 Priority | v2 Priority | Reason |
|------|-------------|-------------|--------|
| Right-click canvas add-node | P2 | **P0** | Canvas IS the interface in node editors |
| WCAG contrast fixes | P1 | **P0** | Invisible = non-existent |
| Keyboard shortcuts | P1 | **P0** | Audio pros need one-hand-on-keyboard |
| Plugin manufacturer name | P3 | **P1** | 500+ plugins → 5 identical "Compressor" = unusable |
| Small window mode fixes | Missing | **P1** | 600x400 DAW mode was unaddressed |
| Port tooltips | Missing | **P1** | 16+ outputs = routing guesswork |
| Node bypass toggle | Missing | **P1** | Opening plugin UI to bypass = hostile |
| DesignTokens | P1 | **P2** | DX not UX — doesn't change user experience |
| Shared components | P1 | **P2** | Same — developer convenience, not user-facing |
| Minimap 10Hz→listener | P2 | **P3** | Over-engineered — 10Hz timer is fine, optimize paint |
| 4px grid normalization | P2 | **P2 (80/20)** | Just 3 constants for structural elements, skip micro-fixes |
