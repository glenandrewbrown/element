# Element Graph Editor Enhancements
## User Manual v2.0

---

## Table of Contents

1. [Introduction](#introduction)
2. [Comment Boxes](#comment-boxes)
3. [Node Alignment Tools](#node-alignment-tools)
4. [Minimap Navigation](#minimap-navigation)
5. [Node Search](#node-search)
6. [Performance Indicators](#performance-indicators)
7. [Keyboard Shortcuts Reference](#keyboard-shortcuts-reference)

---

## Introduction

This manual covers the new graph editor enhancements added to Element. These features improve workflow efficiency when working with complex audio graphs, making it easier to organize, navigate, and monitor your node-based audio processing chains.

---

## Comment Boxes

Comment boxes (also known as frames) allow you to visually organize groups of related nodes in your graph. Similar to comment boxes in Unreal Engine Blueprints or frame nodes in Blender.

### Creating a Comment Box

**Method 1: Keyboard Shortcut**
1. Select the nodes you want to group (click and drag to select multiple, or Shift+click)
2. Press the **`C`** key
3. A comment box will automatically be created around your selected nodes

**Method 2: Empty Comment Box**
1. Press **`C`** with no nodes selected
2. An empty comment box appears at a default position
3. Resize and position it as needed

### Visual Diagram

```
┌─────────────────────────────────────────────────────┐
│  ▼ My Synth Chain                                   │  ← Header (double-click to rename)
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐ │
│   │  Osc 1   │─────▶│  Filter  │─────▶│   Amp    │ │
│   └──────────┘      └──────────┘      └──────────┘ │
│                                                     │
│   ┌──────────┐                                      │
│   │  Osc 2   │──────────────────┘                  │
│   └──────────┘                                      │
│                                                     │
│                                              ◢──────│  ← Resize handle
└─────────────────────────────────────────────────────┘
```

### Editing Comment Boxes

| Action | How To |
|--------|--------|
| **Rename** | Double-click the header area |
| **Move** | Click and drag the header or border |
| **Resize** | Drag the bottom-right corner |
| **Change Color** | Right-click → Color submenu |
| **Delete** | Right-click → Delete, or select and press Delete/Backspace |

### Available Colors

```
┌─────────────────────────────────────────────────┐
│  Color Palette                                  │
├─────────────────────────────────────────────────┤
│  🔴 Red      - Alerts, critical paths           │
│  🟠 Orange   - Warnings, side-chains            │
│  🟡 Yellow   - Highlights, important nodes      │
│  🟢 Green    - Main signal path                 │
│  🔵 Blue     - Effects, processing              │
│  🟣 Purple   - Modulation, control signals      │
│  ⚪ Gray     - Default, neutral grouping        │
└─────────────────────────────────────────────────┘
```

### Tips
- Comment boxes are saved with your session
- They don't affect audio routing - purely organizational
- Use descriptive names for complex graphs
- Color-code different sections for quick identification

---

## Node Alignment Tools

Alignment tools help you create clean, organized layouts by aligning multiple selected nodes.

### Accessing Alignment Tools

1. Select multiple nodes (Shift+click or drag-select)
2. Right-click to open the context menu
3. Navigate to **Alignment** submenu

### Alignment Options

```
                    Align Top
                       ↑
         ┌─────────────┴─────────────┐
         │                           │
         │   ┌───┐   ┌───┐   ┌───┐   │
Align    │   │ A │   │ B │   │ C │   │    Align
Left  ←──│   └───┘   └───┘   └───┘   │──→ Right
         │                           │
         │                           │
         └─────────────┬─────────────┘
                       ↓
                   Align Bottom
```

### Available Alignments

| Option | Description | Diagram |
|--------|-------------|---------|
| **Align Left** | Aligns left edges of all selected nodes | `│A` `│B` `│C` |
| **Align Right** | Aligns right edges of all selected nodes | `A│` `B│` `C│` |
| **Align Top** | Aligns top edges of all selected nodes | All nodes same Y top |
| **Align Bottom** | Aligns bottom edges of all selected nodes | All nodes same Y bottom |
| **Center Horizontally** | Centers nodes on horizontal axis | Nodes centered on X |
| **Center Vertically** | Centers nodes on vertical axis | Nodes centered on Y |
| **Distribute Horizontal** | Evenly spaces nodes horizontally | `A──B──C──D` |
| **Distribute Vertical** | Evenly spaces nodes vertically | Stacked with equal gaps |

### Before and After Example

**Before Alignment:**
```
    ┌───┐
    │ A │
    └───┘
              ┌───┐
              │ B │
              └───┘
  ┌───┐
  │ C │
  └───┘
                    ┌───┐
                    │ D │
                    └───┘
```

**After "Align Top" + "Distribute Horizontal":**
```
┌───┐     ┌───┐     ┌───┐     ┌───┐
│ A │     │ B │     │ C │     │ D │
└───┘     └───┘     └───┘     └───┘
```

### Snap to Grid

Nodes automatically snap to a 20-pixel grid when moved, helping maintain alignment. This creates cleaner, more organized layouts automatically.

---

## Minimap Navigation

The minimap provides a bird's-eye view of your entire graph, making navigation in large projects effortless.

### Visual Layout

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│     Main Graph Editor Canvas                                   │
│                                                                │
│        ┌──────┐         ┌──────┐         ┌──────┐             │
│        │Node 1│────────▶│Node 2│────────▶│Node 3│             │
│        └──────┘         └──────┘         └──────┘             │
│                                                                │
│                                                                │
│                                                                │
│                                     ┌─────────────────────────┐│
│                                     │ ┌─┐  ┌─┐  ┌─┐           ││
│                                     │ └─┘──└─┘──└─┘           ││  ← Minimap
│                                     │ ┌───────────┐           ││
│                                     │ │  Viewport │           ││  ← Current view
│                                     │ └───────────┘           ││
│                                     └─────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### Using the Minimap

| Action | Result |
|--------|--------|
| **Toggle visibility** | Press **`M`** key |
| **Navigate** | Click anywhere on the minimap |
| **Pan** | Click and drag on the minimap |

### Minimap Features

- **Node representation**: Each node appears as a small rectangle
- **Selection highlighting**: Selected nodes shown in orange
- **Viewport indicator**: White rectangle shows current visible area
- **Real-time updates**: Minimap refreshes 10 times per second

### Position

The minimap appears in the **bottom-right corner** of the graph editor:

```
┌─────────────────────────────────────┐
│                                     │
│         Graph Editor                │
│                                     │
│                                     │
│                        ┌───────────┐│
│                        │  MINIMAP  ││
│                        │    150px  ││
│                        │  × 100px  ││
│                        └───────────┘│
└─────────────────────────────────────┘
```

---

## Node Search

Quickly find and navigate to any node in your graph using the search feature.

### Opening Node Search

Press **`Cmd+F`** (Mac) or **`Ctrl+F`** (Windows/Linux)

### Search Interface

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search nodes...                  │ │  ← Type to filter
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ▶ Audio Input                       │ │  ← Selected result
│ │   Audio Output                      │ │
│ │   Compressor                        │ │
│ │   EQ                                │ │
│ │   Reverb                            │ │
│ │   Synth                             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Navigation

| Key | Action |
|-----|--------|
| **↑ / ↓** | Move selection up/down |
| **Enter** | Select node and close search |
| **Escape** | Close search without selecting |
| **Click** | Select and highlight node |
| **Double-click** | Select node and close search |

### Search Behavior

- **Case-insensitive**: "reverb" matches "Reverb", "REVERB", etc.
- **Partial match**: "verb" matches "Reverb"
- **Alphabetically sorted**: Results are sorted A-Z
- **Auto-scroll**: Graph automatically scrolls to show selected node
- **Auto-hide**: Search closes when focus is lost

### Example Workflow

1. Press `Cmd+F` to open search
2. Type "comp" to filter
3. Results show: "Compressor", "Sidechain Compressor"
4. Press `↓` to select "Sidechain Compressor"
5. Press `Enter` - graph scrolls to and selects the node

---

## Performance Indicators

Real-time visual feedback showing latency and signal activity for each node.

### Indicator Layout

```
┌────────────────────────────────────────┐
│  Node Name                             │
├────────────────────────────────────────┤
│                                        │
│                                        │
│                                     ▐  │  ← Activity meter
│                                     ▐  │    (color-coded)
│                                     ▐  │
│  ┌──────────┐                          │
│  │  2.3ms   │                          │  ← Latency indicator
│  └──────────┘                          │
└────────────────────────────────────────┘
```

### Latency Indicator

Shows the processing latency of each node:

| Display | Meaning |
|---------|---------|
| `2.3ms` | Latency in milliseconds (when sample rate available) |
| `512 smp` | Latency in samples (fallback) |

**Location**: Bottom-left corner of the node

### Activity Meter

A vertical bar showing signal activity level:

```
Activity Levels:

  Low        Medium      High
  ▐          ▐▐▐         ▐▐▐▐▐▐
  │          │           │
  │          │           │
  │          │           │
  Green      Yellow      Red
```

| Color | Level | Meaning |
|-------|-------|---------|
| 🟢 Green | < 50% | Normal signal level |
| 🟡 Yellow | 50-80% | Moderate level |
| 🔴 Red | > 80% | High level / potential clipping |

### Reading Performance Data

```
Example Node Display:

┌──────────────────────────┐
│  Compressor              │
├──────────────────────────┤
│                          │
│    Signal processing     │
│    happens here...       │
│                       ▐▐ │  ← Medium activity (yellow)
│                       ▐▐ │
│  ┌────────┐              │
│  │ 5.8ms  │              │  ← 5.8ms latency
│  └────────┘              │
└──────────────────────────┘
```

### Understanding Latency

- **Plugin latency**: Time a plugin takes to process audio
- **Lookahead**: Some plugins (limiters, compressors) introduce intentional delay
- **Total path latency**: Sum of all nodes in the signal chain
- **Automatic compensation**: Element compensates for latency automatically

---

## Keyboard Shortcuts Reference

### Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    KEYBOARD SHORTCUTS                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ORGANIZATION                                               │
│  ─────────────────────────────────────────────────────────  │
│  C              Create comment box around selection         │
│                                                             │
│  NAVIGATION                                                 │
│  ─────────────────────────────────────────────────────────  │
│  Cmd/Ctrl + F   Open node search                            │
│  M              Toggle minimap visibility                   │
│  Escape         Close search / deselect                     │
│                                                             │
│  EDITING                                                    │
│  ─────────────────────────────────────────────────────────  │
│  Delete/Backspace   Delete selected nodes/comment boxes     │
│  Double-click       Open node editor / rename comment       │
│                                                             │
│  SELECTION                                                  │
│  ─────────────────────────────────────────────────────────  │
│  Click + Drag       Select multiple nodes                   │
│  Shift + Click      Add to selection                        │
│  Right-click        Context menu                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Context Menu Options

```
Right-click on graph background:
├── Add Node...
├── Paste
├── Alignment ─────────────────┐
│                              ├── Align Left
│                              ├── Align Right
│                              ├── Align Top
│                              ├── Align Bottom
│                              ├── Center Horizontally
│                              ├── Center Vertically
│                              ├── Distribute Horizontally
│                              └── Distribute Vertically
└── Comment Box...

Right-click on comment box:
├── Color ─────────────────────┐
│                              ├── Red
│                              ├── Orange
│                              ├── Yellow
│                              ├── Green
│                              ├── Blue
│                              ├── Purple
│                              └── Gray
├── Rename
└── Delete
```

---

## Tips and Best Practices

### Organizing Large Graphs

1. **Use comment boxes** to group related nodes (instruments, effects chains, routing)
2. **Color-code sections** - use consistent colors for similar functions
3. **Align nodes** for cleaner cable routing
4. **Use the minimap** to maintain orientation in complex graphs

### Performance Monitoring

1. **Watch latency indicators** to identify high-latency plugins
2. **Monitor activity meters** to spot unexpected signal levels
3. **Red activity bars** may indicate clipping - check your gain staging

### Navigation Workflow

1. **Use search** (`Cmd+F`) for quick access to specific nodes
2. **Use the minimap** for visual navigation
3. **Combine both**: Search to find, minimap to orient

---

## Version Information

- **Element Version**: 1.x.x
- **Enhancement Pack Version**: 2.0
- **Release Date**: December 2024

---

*This documentation covers the Graph Editor Enhancement features. For general Element documentation, please refer to the main user manual.*
