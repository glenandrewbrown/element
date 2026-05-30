# Element - Unified Creative Direction & Implementation Blueprint

**Version:** 3.0 (Paradigm Shift + Research Audit)
**Date:** 2026-03-31
**Author:** Glen Brown (Kushview LLC)
**Purpose:** Single source of truth for the Element UI/UX redesign. This document supersedes all prior briefs, Gemini session outputs, Lovable feedback, Stitch iterations, and the v2.0 Blueprint. Any agent, LLM, or human contributor working on this project MUST treat this document as canonical.

**V3.0 PARADIGM SHIFT:** The design philosophy has fundamentally changed. Element is not designed for accessibility-first or neuroinclusive principles. It is designed as a **precision creative instrument for expert users in flow state.** Technical depth is not hidden - it is surfaced beautifully. Speed of iteration is the supreme metric. The UI embodies the principle that deeply learned technical knowledge operates seamlessly in the background, freeing the fundamentally creative brain to work at the speed of intent.

---

## 0. How to Read This Document

This blueprint serves three audiences simultaneously:

1. **LLM Agents (Claude Code, Lovable, Stitch, Cursor):** Sections 1-11 provide complete context for generating code, components, and design assets. Every section includes implementation-ready specifications.
2. **Human Designers:** Sections 4-8 contain the visual design system, component specs, and interaction patterns in sufficient detail for Figma mockups or direct implementation.
3. **Project Managers / Reviewers:** Section 12 provides the phased roadmap and Section 13 the design decision log explaining why each choice was made.

**Critical note for all agents:** This project is 100% vibe-coded. Glen does not write code directly. All implementation happens through natural language instructions to LLM agents. Every specification must therefore be semantically rich enough to generate correct output from a natural language description alone.

---

## 1. Product Overview

### 1.1 What is Element?

Element is a **modular audio plugin host** for professional music production. It loads, connects, and routes audio plugins (VST3, AU, LV2, CLAP) in a visual node-based graph, creating complex signal chains for instruments, effects, and MIDI processing. It runs as both a standalone application and as a plugin inside DAWs.

### 1.2 Target User

One archetype, not a spectrum: the **creative technical practitioner.** This person has deep knowledge of signal flow, plugin architecture, MIDI routing, and audio engineering. They don't need to be taught what a compressor does. They need to route twelve of them in a complex parallel chain in under thirty seconds, hear the result, and reshape it without breaking flow. They think in signal paths the way a guitarist thinks in chord shapes - the technical knowledge is embodied, automatic, invisible. What they need from Element is an instrument that keeps up with that velocity of thought.

Specific profiles:
- Composers building bespoke instruments from plugin stacks for a film score deadline
- Sound designers chaining experimental FX routing that no DAW mixer can represent
- Live performers who need bulletproof, pre-configured signal paths they can navigate blind
- Audio engineers building reusable processing templates across sessions
- Game audio professionals prototyping adaptive music systems

### 1.3 Core Value Proposition

Replace complex hardware routing with a visual, modular software environment where any audio plugin can be connected to any other in arbitrary configurations - with the visual polish of premium audio software, not developer tooling.

### 1.4 Platform Matrix

| Context | OS | Plugin Formats Hosted |
|---|---|---|
| Standalone App | macOS 14+, Windows 10+, Linux | VST3, AU, LV2, CLAP, (VST2 optional) |
| Plugin-inside-DAW | Same | Same (Element itself runs as VST3/AU/CLAP) |

Both contexts share the same internal UI. When running as a plugin, the minimum window size is approximately 600x400px.

---

## 2. Architectural Resolution - The WebView Pivot

### 2.1 The Decision

**The UI layer is built with React/Tailwind CSS, hosted inside JUCE 8's `WebBrowserComponent`.** The C++ backend handles all real-time audio DSP, plugin hosting, and state management. The React frontend handles all visual rendering, interaction, and theming.

This supersedes the `UI_UX_DESIGN_BRIEF.md` which documented legacy constraints ("No HTML/CSS/React"). That brief captured the pre-pivot state. The Gemini session document captured the evolved direction. This blueprint confirms the WebView path as canonical.

### 2.2 Why This Architecture

| Factor | Native JUCE LookAndFeel | WebView React/Tailwind |
|---|---|---|
| UI iteration speed | Recompile C++ for every visual change | Hot reload, instant feedback |
| LLM/vibe-code friendliness | Low - JUCE paint methods are opaque to LLMs | High - React/Tailwind is the most LLM-fluent stack available |
| Design fidelity | Manual pixel positioning, no CSS, no flexbox | Full CSS, flexbox, grid, SVG, Canvas, WebGL |
| Component ecosystem | None (roll your own) | shadcn/ui, Radix, thousands of React libraries |
| Cross-platform consistency | Varies per OS rendering engine | WebKit (macOS), WebView2/Chromium (Windows), WebKit2 (Linux) |
| Animation | Manual timer-based frame-by-frame | CSS transitions, requestAnimationFrame, GSAP, Framer Motion |
| Production precedent | Industry standard for 20 years | Output Arcade (ADC 2020), JUCE 8 official WebViewPluginDemo |
| Accessibility tooling | Limited JUCE accessibility | Full ARIA, screen reader support, semantic HTML |

### 2.3 JUCE 8 WebView Bridge - Technical Specification

**Communication layer:** `window.__JUCE__` API injected via `Options::withNativeIntegrationEnabled()`

| Direction | Mechanism | Thread Safety |
|---|---|---|
| C++ to JS | `evaluateJavascript()` or `emitEventIfBrowserIsVisible()` | Message thread only |
| JS to C++ | `window.__JUCE__.backend.emitEvent(eventId, data)` | Callback on message thread |
| Parameter binding | `WebSliderRelay` + `WebSliderParameterAttachment` | Built-in JUCE 8 |
| Custom functions | `Options::withNativeFunction(name, callback)` | Callback on message thread |
| Initialisation data | `Options::withInitialisationData(key, value)` | Available before any resource loads |
| User scripts | `Options::withUserScript(js)` | Runs before page content |

**State bridge architecture:**

```
C++ Audio Thread                    C++ Message Thread                React Frontend
     |                                    |                               |
     | (lock-free SPSC FIFO)              |                               |
     |-----> juce::AbstractFifo --------->|                               |
     |                                    | (60Hz juce::Timer)            |
     |                                    |-----> evaluateJavascript() -->|
     |                                    |                               |
     |                                    |<--- emitEvent() -------------|
     |                                    |                               |
     |  juce::ValueTree (single source of truth)                         |
     |         ^                          |                               |
     |         |    ValueTreeSynchroniser  |                               |
     |         |   (for Portal sync)      |                               |
```

**Resource delivery (production):**
- Frontend is built with Vite, producing a static bundle
- Bundle is served via `ResourceProvider` callback - no web server, no filesystem access needed
- Development mode: `goToURL("http://localhost:5173")` for Vite hot reload
- Production mode: `goToURL(WebBrowserComponent::getResourceProviderRoot())` serving bundled assets

**Known issues and mitigations:**

| Issue | Mitigation |
|---|---|
| White flash on startup | Match WebView background to app theme colour; use `addChildComponent` (hidden), delay `setVisible` until first paint |
| WebView renders above JUCE components | Acceptable - WebView IS the entire UI. Only transport/status bars might remain native JUCE |
| Window resize white edges | Debounce resize, use CSS `background-color` matching app chrome |
| WebView2 dependency on Windows | Ship with static linking (`JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING`); Win11 has it pre-installed; Win10 received update mid-2022 |

### 2.4 Hybrid Strategy

Not everything moves to React. The split is:

| Layer | Technology | Rationale |
|---|---|---|
| Audio DSP, plugin hosting, MIDI, sandbox IPC | C++20 / JUCE 8 | Real-time safety, zero-allocation audio thread |
| ValueTree state management | C++ JUCE | Single source of truth, serialisation, undo/redo |
| Plugin GUI hosting (third-party plugin windows) | Native JUCE | Plugin GUIs are native windows - they cannot run inside a WebView |
| Element's own UI (graph editor, panels, toolbars, browsers) | React / Tailwind / TypeScript | All user-facing Element chrome |
| Real-time metering data bridge | Lock-free SPSC FIFO + 60Hz Timer + evaluateJavascript | Safe audio-to-UI data flow |

---

## 3. Lexicon & Terminology

Legacy engineering terminology is replaced with physical, recognisable analogies:

| Legacy Term | New Term | Definition |
|---|---|---|
| Session | **Project** | The master file containing all audio routings, scripts, and layouts |
| Graph | **Board** | The visual routing canvas where Blocks are connected |
| Node / Plugin | **Block** | An individual instrument, effect, or utility on the Board |
| *(new tier)* | **Module** | Named grouping ABOVE Blocks; breadcrumb-navigable, multi-use across Boards in a Project. A logical hierarchy label, NOT a nested Board (distinct from Container). |
| Sub-Graph | **Container** | A nested Board housed within a single Block (local to the project) |
| Sub-Graph (linked) | **Portal** | A nested Board linked to an external global master file (.elboard) |
| Connection / Arc | **Cable** | A signal path between two Block ports |
| Preset / Template | **Snippet** | A reusable group of Blocks and Cables saved for drag-and-drop reuse |

All UI labels, documentation, and code comments should use the new terminology. Internal C++ class names may retain legacy naming for backward compatibility, but all React components and user-facing strings MUST use the new terms.

---

## 4. Design Philosophy - The Instrument Paradigm

Element is not a tutorial, a wizard, or an accessibility exercise. It is a **precision creative instrument.** Like a Stradivarius, it rewards mastery with effortless expression. The technical complexity is not hidden behind progressive disclosure - it is the beauty of the thing itself. A dense, information-rich interface that a skilled user navigates at the speed of thought is more beautiful than a sparse one that forces everyone to click through menus.

### 4.1 Core Principles

**Speed of iteration is the supreme metric.** Every interaction must be measurable in milliseconds of user intent-to-result. If an action takes three clicks, find a way to make it one. If navigating into a nested Board requires hunting for a button, make it a double-click on the Block. If going back up requires finding a breadcrumb, make it a double-click on empty canvas. The fastest path wins, always.

**Information density is beauty.** A graph with thirty Blocks, animated cables showing live signal flow, embedded mini-meters on every node, and colour-coded routing visible at a glance is not "cluttered." It is a living, breathing representation of a complex creative system. The goal is not to reduce information - it is to present maximum information with such clarity and visual hierarchy that the eye finds what it needs instantly.

**Technical depth is always one gesture away.** No feature is buried behind "Advanced Settings." Parameters, routing options, scripting interfaces, and hardware I/O are all accessible without mode switches or preference panels. The UI trusts the user's expertise. Power features sit alongside basic ones, distinguished by visual hierarchy rather than hidden behind walls.

**The UI disappears in flow state.** When a user is deep in creative work - building a signal chain, tweaking parameters, routing feedback loops - they should never be pulled out of the zone by the interface itself. No confirmation dialogs for reversible actions. No tooltip delays on controls they already know. No animations that make them wait. The interface becomes transparent, a pure conduit between creative intent and sonic result.

**Muscle memory compounds.** Every interaction pattern should be learnable and then forgettable - executed by the hands while the mind stays on the music. Consistent gesture vocabulary across all contexts. Keyboard shortcuts that form logical groups. Spatial layouts that never shift unexpectedly. Once learned, the instrument plays itself.

### 4.2 The Aesthetic Position

**Beautiful complexity, not simplistic minimalism.** The visual language draws from two sources: the meticulous craft of premium audio plugin design (FabFilter, UAD, Arturia) and the dense, information-rich canvases of professional creative tools (TouchDesigner, Unreal Engine, Houdini). The result should feel like opening the back of a beautifully engineered machine - every component visible, every connection traceable, every status readable, and the whole thing gorgeous because of its functional precision, not despite it.

**Neumorphism as the depth language.** Controls (knobs, faders, toggles, buttons) are extruded from or pressed into the surface using paired soft shadows - creating the illusion of physical hardware machined from a single material. No glassmorphism, no backdrop-blur, no transparency layers. The entire UI feels like one continuous dark chassis with controls embossed from it. Decorative textures (wood, metal screws, brushed aluminium) are banned - the neumorphic shadows do all the depth work.

**One visual language, one mode.** There is no colour palette shift between Design and Run states. The same refined dark palette serves both. Mode differences are structural (which panels are visible, which controls are exposed) not cosmetic. A palette shift is a gimmick that communicates nothing and breaks spatial memory.

### 4.3 Motion Philosophy

Motion serves exactly two purposes: **communicating state change** and **maintaining spatial continuity.** A Block fading to indicate bypass communicates state. A canvas animating as you zoom into a nested Board maintains spatial awareness of where you are in the hierarchy. Everything else is decorative noise that breaks flow.

Cable signal-flow animation is the exception that proves the rule - it communicates real-time data (amplitude, activity) that would otherwise require separate meters. This is functional motion.

All animations respect `prefers-reduced-motion`. All animation durations are short (150-250ms). Nothing bounces, pulses decoratively, or parallax-scrolls.

---

## 5. Visual Design System

### 5.1 Colour Palette - Unified Dark

One palette. No mode-switching. Dark backgrounds are the industry standard for professional audio - they reduce eye fatigue in dim studios, make signal visualisations pop, and minimise glare.

**Canvas & Backgrounds:**

| Token | Hex | Usage |
|---|---|---|
| `--canvas-base` | `#1E1E22` | Main canvas background |
| `--canvas-grid` | `#2A2A2E` | 20px dot grid |
| `--panel-bg` | `#252529` | Side panels, toolbars |
| `--panel-border` | `#3A3A3E` | Dividers, subtle borders |
| `--surface` | `#2C2C30` | Cards, dropdowns, floating elements |
| `--surface-elevated` | `#333338` | Hovered surfaces, active selections |

**Semantic Block Headers (Colour + Shape - colour-blindness safe):**

> ⚠️ Decision D1 (2026-05-30) — OVERTURN: the 3-category Generator/Modifier/Logic taxonomy is replaced by the 4 categories below. Use --color-instrument/midifx/audiofx/modulator; do not use --block-generator/modifier/logic.

| Category | Hex | Token | Shape | Examples |
|---|---|---|---|---|
| Virtual Instruments | `#4A90D9` | `--color-instrument` | ● Circle | Synths, Samplers, Audio Input |
| MIDI Effects | `#2BC4C4` | `--color-midifx` | ▲ Triangle | MIDI Router, MIDI I/O, Processors |
| Audio Effects | `#E8A838` | `--color-audiofx` | ◆ Diamond | EQ, Compressor, Reverb, Delay |
| Modulators / Utilities | `#A87FE0` | `--color-modulator` | ⬡ Hexagon | LFO, Value/CV nodes, Scripting, Routing logic |

Colour-blind safety carried by the 4 distinct shapes. Blue/teal/orange/purple maximises distinction for deuteranopia and protanopia (~8% of male users).

**Format Badges:** VST3 `#4A90D9` Blue, AU `#A855F7` Purple, CLAP `#2BC4C4` Teal, LV2 `#6B7280` Gray.

**Signal & Feedback:** Primary `#4A90D9`, Success `#34D399`, Warning `#E8A838`, Error `#EF4444`, Text Primary `#E5E5EA`, Text Secondary `#8E8E93`, Text Dim `#5A5A5E`.

**Typography:** Inter throughout. All numerical displays use tabular figures (`'tnum' 1`). Block titles 14px/600, body 13px/400, values 13px/500, labels 12px/500. Letter-spacing 0.01em body, 0.02em labels. Minimum 12px.

### 5.2 Spacing, Grid & Elevation

- 4px base grid, scale: 4/8/12/16/24/32px
- Canvas grid: 20px dots
- Border radius: 4px blocks, 6px panels, 8px modals

**Neumorphic depth (not glassmorphism):** All depth communicated through shadow pairs on a narrow tonal range. Elements feel extruded from or pressed into the same material surface.
- Raised (blocks, buttons): light shadow `rgba(255,255,255,0.05)` top-left 8px blur + dark shadow `rgba(0,0,0,0.4)` bottom-right 8px blur
- Pressed (inputs, inset tracks): inner dark shadow top-left + inner light catch bottom-right
- Floating (modals only): traditional drop shadow `0 8px 32px rgba(0,0,0,0.5)`
- Port visual: 10-12px rendered, 16-18px hover glow, 24px hitbox, 32px snap radius
- Micro-glow on active elements: 4px outer glow of semantic hue at 25% opacity

### 5.3 Icons

Lucide set, 24px base. Plugin type shapes: ● circle (Virtual Instruments), ▲ triangle (MIDI Effects), ◆ diamond (Audio Effects), ⬡ hexagon (Modulators/Utilities). Tooltips show immediately on hover (zero delay for expert users).

---

## 6. Dual-State Architecture

The application restructures between two modes. Same palette, same visual language - the difference is **structural**, not cosmetic.

### 6.1 Edit Mode ("The Workshop")

Everything exposed. Full tooling. Maximum freedom.

- All panels visible (Tool Palette, Inspector, Snippet Shelf)
- All ports visible on all Blocks
- Embedded plugin GUIs available (double-click Block to expand)
- Cable routing visible with full signal-flow animation
- Canvas dot-grid visible for alignment
- All keyboard shortcuts active
- Full Lua Scripting, MIDI Mapping, Hardware I/O access

### 6.2 Perform Mode ("The Stage") [SHELVED: Dashboard Builder + Scene system — D3]

> ⚠️ Decision D3 (2026-05-30) — SHELVED (hide-UI, keep-code): Dashboard Builder and the Scene/Preset system are removed from UI/nav, code preserved, do not add nav entry. Text below preserved for reference.

Locked down for live use. A custom instrument panel, not just a stripped-down graph.

**Structural changes (same palette):**
- Tool Palette, Snippet Shelf hidden
- Routing ports hidden on all Blocks
- Embedded GUIs collapse
- Canvas dot-grid hidden
- Structural editing disabled (no drag, no delete, no new connections)
- Transport controls, Virtual Keyboard, and **Panic Button** prominent

**[SHELVED D3] The Dashboard Builder (inspired by Soundigy MIDI Lab's Custom Tab Editor):**

Perform Mode is NOT just "show tagged macro knobs." It is a **bespoke instrument panel** that the user designs in Edit Mode and uses in Perform Mode. The user can compose a custom control surface containing:

- **Knobs** wired to any parameter from any Block in the graph
- **Faders** wired to any parameter from any Block
- **Buttons** (momentary, toggle) for bypass/mute/scene switching
- **Meters** showing audio levels from any point in the graph
- **Displays** showing parameter values, tempo, timecode
- **Grid pads** for triggering MIDI notes or switching presets/scenes
- **Embedded plugin GUIs** from selected Blocks

All freely positionable on a canvas. Saved per-Project and per-Scene. This is what makes the Edit/Perform split genuinely powerful - Perform Mode becomes a **custom instrument**, not a reduced view.

**[SHELVED D3] Scene/Preset System (inspired by MIDI Lab):**

A single Project can contain multiple **Scenes** - complete parameter snapshots within the same graph topology. The engine is optimised to not reload plugins between scene switches when the topology is unchanged. Scenes are switchable via:
- Scene list in Perform Mode toolbar
- MIDI Program Change
- Keyboard shortcuts
- OSC commands

### 6.3 Speed-First Navigation

Navigation is the interaction that happens most often. Every millisecond counts.

| Gesture | Action | Context |
|---|---|---|
| Double-click Block | Dive into nested Board (Container/Portal) | Semantic zoom in |
| Double-click empty canvas | Navigate UP one level | Semantic zoom out |
| Breadcrumb click | Jump to any ancestor level | Direct navigation |
| `Cmd+Shift+M` | Toggle Edit/Perform Mode | Global |
| `Ctrl+0-9` | Save spatial bookmark (position + zoom) | Canvas |
| `Shift+0-9` | Recall spatial bookmark instantly | Canvas |
| `Cmd+K` | Command palette (search everything) | Global |
| `Cmd+F` | Focus Tool Palette search | Plugin search |
| Right-click canvas | QuickAdd popup at cursor | Insert Block |
| `Escape` | Deselect all / close floating panel | Context-dependent |
| Middle-mouse drag | Pan canvas | Navigation |
| `Cmd+Scroll` | Zoom canvas | Navigation |
| `Cmd+0` | Fit entire Board to view | Reset zoom |

The double-click-background-to-go-up pattern mirrors file manager conventions (double-click folder to enter, navigate up to exit). It must feel instant - no transition animation longer than 150ms for navigation. The user's spatial model of the hierarchy is maintained by the breadcrumb trail and the zoom animation direction (zooming in vs zooming out).

---

## 7. Core UI Components

### 7.1 The Block

**Dimensions:** Minimum 120x80px. Maximum width determined by content (embedded GUI).

**Visual structure:**
```
+--[Header: 24px, semantic colour]---------+
| [Bypass] Block Name        [CPU] [Badge] |
+-------------------------------------------+
|                                           |
|  [Embedded micro-controls or mini-GUI]    |
|                                           |
+---[Ports: 24x24px hitbox]----------------+
  O  O  O          O  O  O
  (inputs)         (outputs)
```

**Header bar:** 24px tall, solid fill with semantic colour (Blue/Orange/Teal by function category). Contains Block name (14px Semi-Bold), bypass toggle, mini CPU meter, and format badge.

**State encoding:**

| State | Visual Treatment |
|---|---|
| Active | Full opacity, normal rendering |
| Bypassed | 60% opacity + diagonal stripe overlay (semi-transparent) |
| Muted | Distinct desaturated treatment, mute icon overlay |
| Error/Clipping | Animated red border pulse |
| Processing load healthy | Subtle green border glow |
| Processing load high | Amber border pulse |

**Ports:**

| Data Type | Shape | Colour | Size |
|---|---|---|---|
| Audio | Circle | Blue (`#4A90D9`) | 10-12px visual, 24px hitbox, 32px snap radius |
| MIDI | Diamond | Teal (`#2BC4C4`) | 10-12px visual, 24px hitbox, 32px snap radius |
| CV / Automation | Square | Orange (`#E8A838`) | 10-12px visual, 24px hitbox, 32px snap radius |

- Connected port: filled shape
- Unconnected port: hollow (stroke only)
- Hover state: spring-expand animation + tooltip showing connected target name

### 7.2 Smart Cables

Cables are information-rich, not minimalist lines.

**Data type encoding (colour):**
- Audio: Blue (`#4A90D9`)
- MIDI: Teal (`#2BC4C4`)
- CV/Automation: Orange (`#E8A838`)

**Channel count encoding (thickness):**
- Mono / single MIDI channel: 2px
- Stereo: 3px
- Multichannel (surround, Atmos): 5px

**Signal flow animation:**
- Subtle pulse animation flowing in the direction of signal
- Opacity/intensity maps to real-time RMS amplitude (via the SPSC FIFO bridge)
- Sidechain paths: dashed stroke
- Main signal: solid stroke

**Routing style:** Manhattan (orthogonal) by default with automatic node avoidance. Users can toggle to bezier curves if preferred. Right-angle routing with clean paths prevents spaghetti.

**Reroute Pins:** Double-click any Cable to insert an invisible anchor point, allowing manual routing around obstacles (borrowed from Unreal Engine Blueprints).

**Wireless Patching (Named Buses):** For complex patches, assign an output port to a named transmitter bus (e.g., "Reverb Send A") and place a corresponding receiver Block anywhere. Signal passes without a physical Cable across the screen.

### 7.3 Tool Palette & Search (Left Panel)

Replaces both the legacy accordion sidebar AND the radial menu (which was rejected - hiding tools behind spatial recall slows expert users down).

**Architecture:** Flat, persistent, always visible in Edit Mode.

**Layout:**
```
+---[TOOL PALETTE]-------------------+
| [______Search plugins...______]    |
| [Type: All v] [Format: All v]      |
+------------------------------------+
|                                    |
| FAVOURITES                    [*]  |
|   Kontakt 8         (vst3) [inst]  |
|   FabFilter Pro-Q   (vst3) [fx]   |
|                                    |
| RECENTLY USED                      |
|   Gullfoss           (vst3) [fx]   |
|   Cinematic Rooms    (vst3) [fx]   |
|                                    |
| ALL PLUGINS (by category)          |
|   v Effects                        |
|     v Delay                        |
|       H-Delay        (au)   [fx]   |
|     v Reverb                       |
|       Cinematic Rooms (vst3) [fx]  |
|   v Instruments                    |
|     Kontakt 8        (vst3) [inst] |
+------------------------------------+
```

**Behaviours:**
- Search active: flat results list, no empty categories, instant filter
- Search empty: category tree with expand/collapse
- Right-click plugin: Add/Remove Favourite
- Double-click: insert into current Board at centre
- Drag onto Board: insert at drop position
- Format badges: coloured pills [inst] blue, [fx] green, [midi] purple
- Format shown in parentheses: (au), (vst3), (clap), (lv2)
- Frequency-based suggestions: PluginUsageTracker feeds "most used" into ordering

### 7.4 Inspector Panel (Right Panel)

Context-sensitive, changes based on current selection:

**Block selected:**
- Plugin name, format, latency, I/O configuration
- Full parameter list with knobs
- "Tag as Macro" toggle per parameter (for Perform Mode exposure)
- Preset dropdown
- Notes field
- Bypass / Mute / Solo controls

**Cable selected:**
- Source to Destination label
- Data type, channel count
- Option to insert a Block inline

**Nothing selected:**
- Project overview: total latency, Block count, CPU estimate
- Project notes
- Audio engine status (sample rate, buffer size, device state)

### 7.5 Snippet Shelf (Bottom Panel)

Dockable panel at bottom of Edit Mode workspace. Uses visual recognition over recall.

**Workflow:** Lasso a group of Blocks on the Board, drag onto the Snippet Shelf. The shelf generates a lightweight visual thumbnail. Thumbnails can be dragged back onto any Board to instantiate the routing structure.

**Storage:** Saved as `.eln` XML files. Organised by user-defined categories.

### 7.6 Breadcrumb Navigation

Persistent at top of canvas: `Main Project > Drum Bus > Snare Processing`

Clickable at each level. Essential for maintaining spatial orientation when using semantic zooming into nested Portals/Containers.

### 7.7 Minimap Viewport

Bottom-right of canvas. Shows bird's-eye view of the full Board with a viewport rectangle. Essential for navigating large 15+ Block canvases. Toggle: `Shift+M`.

### 7.8 Top Toolbar

```
[Rewind] [Play/Stop] [BPM: 120] [4/4] [TAP] | [EDIT / PERFORM toggle] | [Scene: 1/8 < >] [SHELVED D3] | [Undo (5)] [Redo] | [PANIC] | [EXT] [48kHz / 512] [Latency: 23ms]
```

- Transport: Rewind, Play/Stop, BPM (editable), Time Signature, TAP tempo
- Mode toggle: prominent Edit/Perform switch
- Scene selector: current scene number, previous/next arrows, dropdown list **[SHELVED D3] — do not render in nav**
- Undo/Redo: buttons with depth counter
- **Panic button:** Sends Note Offs to all active MIDI outputs. Red, always visible. Essential for live safety.
- EXT sync indicator
- Audio engine status: Sample Rate, Buffer Size, Latency, Device state

### 7.9 Portals vs. Containers (Semantic Zooming)

**Container (Local Sandbox):**
- Standard solid border
- Nested Board entirely local to the current Project
- Double-click to fly in (semantic zoom animation)
- Destructive edits are localised

**Portal (Global Inheritance):**
- Dashed amber (`#E8A838`) border + prominent link icon
- Padlock watermark when locked
- Linked reference to an external master file (`.elboard`)
- Synced via `juce::ValueTreeSynchroniser`

When editing a Portal, two choices appear:
1. **"Snap the Chain" (Make Local):** Dashed border solidifies, data deep-copied to local Project, freeing edits
2. **"Unlock Global Edit":** Edit the master file directly; changes propagate to all Projects using this Portal

---

## 8. Complexity Management

### 8.1 Spatial Bookmarks

`Ctrl+0-9` saves current camera position and zoom. `Shift+0-9` instantly snaps to the saved view. Essential for maintaining velocity in large sessions - jump between workflow zones without searching.

### 8.2 Comment Boxes

Semi-transparent coloured grouping boxes (7 colour presets at 25% alpha). Drag to surround related Blocks. Label editable. Used for organising complex routing by function.

### 8.3 Modular Re-patching

- **Quick-swap:** Right-click Block shows "Replace with..." filtered to same I/O configuration
- **Cable re-routing:** Drag Cable endpoint off port to detach; hover over new port to preview before committing
- **Inline insertion:** Drag a new Block onto an existing Cable to insert it inline
- **Multi-select operations:** Lasso + bulk bypass/mute/delete, bulk macro-tag

### 8.4 Alignment & Layout Tools

- Snap-to-grid (20px)
- Auto-align selected Blocks (horizontal/vertical)
- Layout direction toggle (horizontal flow / vertical flow)
- Distribute evenly (horizontal / vertical)

---

## 9. Three Signal Types (Inspired by Soundigy MIDI Lab)

Element currently handles Audio and MIDI. The addition of a third signal type - **Value Events** - transforms Element from a plugin chainer into a creative routing laboratory.

### 9.1 Signal Type Architecture

| Signal Type | Cable Colour | Port Shape | Description |
|---|---|---|---|
| Audio | Blue (`#4A90D9`) | Circle | PCM audio streams (mono, stereo, multichannel) |
| MIDI | Teal (`#2BC4C4`) | Diamond | MIDI messages (notes, CC, program change, SysEx) |
| Value | Orange (`#E8A838`) | Square | Numerical control signals (0.0-1.0 float, triggers, data) |

Value Events flow between processing blocks independently of MIDI - enabling LFO-to-parameter modulation, mathematical transformations, conditional logic, and data-driven automation without using MIDI CC as a carrier. Pack MIDI / Unpack MIDI blocks bridge between Value and MIDI worlds.

### 9.2 Planned Built-in Node Expansion

Organised by the semantic Block categories (Generator / Modifier / Logic / Utility):

**MIDI Processing (Logic - Teal):**

| Node | Purpose | Priority |
|---|---|---|
| MIDI Channel Filter | Pass/block specific channels | Tier 1 |
| MIDI Transpose | Shift notes up/down by semitones | Tier 1 |
| MIDI Velocity Amplifier | Scale velocity with curve | Tier 1 |
| MIDI Map | Arbitrary MIDI transformations (save/restore) | Tier 2 |
| MIDI Delay | Time-delay MIDI events | Tier 2 |
| MIDI Filter | Filter by message type/value range | Tier 1 |
| MIDI Zones | Split notes to channels by range (extends existing Keyboard Splits) | Tier 1 |
| MIDI Store/Recall | Save and recall CC/PC/SysEx states per scene | Tier 2 |
| MIDI (N)RPN | Handle RPN and NRPN messages | Tier 3 |
| MIDI Patchbay (4x4/8x8) | Matrix routing grid | Tier 2 |
| MIDI File Player | Play .mid files with transport | Tier 1 |
| SysEx Editor/Send/Receive | Hardware configuration workflows | Tier 2 |
| Bank/Program Send | Send bank select + program change | Tier 2 |

**Value Event Blocks (Logic - Teal):**

| Node | Purpose | Priority |
|---|---|---|
| Constant | Output a fixed value | Tier 1 |
| Clock | Periodic value pulses (tempo-synced) | Tier 1 |
| Random | Random value generation | Tier 2 |
| Trigger | Emit value on event | Tier 1 |
| MIDI Trigger | Convert MIDI event to value | Tier 1 |
| Pack MIDI | Convert values to MIDI message | Tier 1 |
| Unpack MIDI | Extract values from MIDI message | Tier 1 |
| Read/Write Variable | Named global variables | Tier 1 |
| Readout | Display current value | Tier 1 |
| Audio-to-Value | Extract RMS/peak/frequency from audio | Tier 1 |
| Smoother | Glide/portamento for value transitions | Tier 2 |
| Accumulator | Sum incoming values | Tier 2 |
| Iterator | Step through values sequentially | Tier 2 |

**Math/Logic (Logic - Teal):**

| Node | Purpose | Priority |
|---|---|---|
| Add / Subtract / Multiply / Divide | Basic math on values | Tier 1 |
| Switch (A/B) | Route between two paths | Tier 2 |
| Conditional Gate | Pass/block based on condition | Tier 2 |
| Expression | Single-formula value transform (lightweight scripting) | Tier 2 |
| Distributor | Route to multiple outputs by rule | Tier 3 |

**Audio Utilities (Modifier - Orange):**

| Node | Purpose | Priority |
|---|---|---|
| Audio Mixer (stereo, 8x, 16x) | Mix audio signals with faders | Tier 1 |
| Mergers (2x/4x/8x) | Merge multiple MIDI/audio streams | Tier 2 |
| Splitters (2x/4x/8x) | Split to multiple outputs | Tier 2 |

**Performance (Utility):**

| Node | Purpose | Priority |
|---|---|---|
| Panic Button | Send Note Offs to all MIDI outputs | Tier 1 (toolbar, not a node) |
| Clock Generator | Internal MIDI clock generation | Tier 2 |

### 9.3 Expression Blocks (Lightweight Scripting)

Full Lua scripting (existing `el.Script`) is powerful but heavyweight. Expression blocks offer single-formula transforms for quick math operations - one line that transforms input to output without a full scripting environment. Example: `output = clamp(input * 2.0 + offset, 0.0, 1.0)`.

---

## 10. User Workflows

### Workflow 1: Building a Channel Strip

1. Open Element (standalone or as plugin in DAW)
2. `Cmd+F` or click Tool Palette search bar
3. Type "Pro-Q" - see filtered results instantly
4. Drag FabFilter Pro-Q 3 onto Board
5. Type "compressor" - drag 1176 onto Board
6. Element auto-suggests connection (ghost connector from Audio In to EQ to Compressor to Audio Out)
7. Click to confirm auto-route, or manually drag Cable from port to port
8. Double-click EQ Block to embed its GUI in the Board canvas (Edit Mode)
9. Adjust parameters directly on the embedded GUI
10. In Inspector, tag "Output Gain" parameter as Macro
11. Switch to Perform Mode - see only the Macro knob at the EQ Block's spatial position
12. Save Project

### Workflow 2: Live Performance Setup

1. Load a Project with multiple instrument Boards
2. Switch to Perform Mode
3. Only Macro controls visible - tagged volume faders, effect sends, preset selectors
4. Use MIDI controller mapping (set up in Edit Mode) to control Macro knobs
5. Use Spatial Bookmarks to jump between "Song 1 Board" and "Song 2 Board"
6. Monitor via macro-tagged level meters

### Workflow 3: Reusing a Signal Chain

1. In Edit Mode, lasso a group of Blocks (e.g., a vocal chain: De-Esser > EQ > Compressor > Reverb Send)
2. Drag selection onto Snippet Shelf
3. Shelf generates thumbnail
4. In a new Project, drag thumbnail from Shelf onto Board
5. All Blocks and Cables instantiate with the saved routing

### Workflow 4: Managing a Complex Session

1. 30+ Blocks on a single Board
2. Use Comment Boxes to colour-code: Blue = instruments, Green = effects, Orange = sends
3. Use Spatial Bookmarks: `Ctrl+1` = Drums area, `Ctrl+2` = Synths area, `Ctrl+3` = Master bus
4. Use Minimap for overview navigation
5. Group related Blocks into Containers to reduce visual clutter
6. Use Wireless Patching for reverb sends that span the entire Board

---

## 11. Interaction Reference

### 10.1 Mouse Interactions

| Action | Behaviour |
|---|---|
| Click Block | Select |
| Shift+Click Block | Add to selection |
| Double-click Block | Dive into nested Board (Container/Portal) OR open embedded plugin GUI if not a container |
| Double-click empty canvas | Navigate UP one level in hierarchy (to parent Board) |
| Right-click Block | Context menu: Duplicate, Delete, Replace With..., Colour, Bypass, Mute, Tag Macros |
| Drag from port | Create Cable |
| Drag Block | Move (snaps to grid) |
| Drag empty space | Lasso select |
| Scroll wheel | Scroll canvas |
| Cmd+Scroll | Zoom canvas |
| Double-click empty canvas | Navigate UP one level (or deselect if at root level) |
| Right-click empty canvas | QuickAdd popup (search and insert at cursor position) |
| Double-click Cable | Insert Reroute Pin |
| Drag Block onto Cable | Insert Block inline |

### 10.2 Keyboard Shortcuts

| Key | Action |
|---|---|
| `Cmd+F` | Focus Tool Palette search |
| `Cmd+K` | Command palette (search everything - plugins, actions, settings) |
| `Cmd+S` | Save Project |
| `Cmd+N` | New Project |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / Redo |
| `Cmd+D` | Duplicate selected |
| `Cmd+A` | Select all |
| `Cmd+Shift+M` | Toggle Design/Perform Mode |
| `Delete` / `Backspace` | Delete selected |
| `Space` | Toggle transport play/stop |
| `Shift+C` | Create Comment Box |
| `Shift+M` | Toggle Minimap |
| `Ctrl+0-9` | Save Spatial Bookmark |
| `Shift+0-9` | Recall Spatial Bookmark |
| `Cmd+1/2/3/4` | Switch sidebar panels |
| `Cmd+=` / `Cmd+-` | Zoom in / out |
| `Cmd+0` | Fit Board to view |
| `Cmd+T` | Rename selected Block |

---

## 12. Technical Implementation Map

### 11.1 C++ Backend (Existing, Maintained)

| Component | File | Status |
|---|---|---|
| Audio engine | `src/engine/audioengine.cpp` | Existing - no changes |
| Graph builder | `src/engine/graphbuilder.cpp` | Existing - no changes |
| Plugin manager | `include/element/plugins.hpp` | Existing - add PluginUsageTracker integration |
| Sandbox host | `src/engine/sandboxhost.hpp` | Existing - no changes |
| Sandbox IPC | `src/engine/sandboxipc.hpp` | Existing - no changes |
| ValueTree state | Throughout | Existing - add WebView bridge layer |
| Metering FIFO | NEW | Lock-free SPSC ring buffer for cable amplitude data |
| WebView bridge | NEW | Timer-based JSON dispatch to React frontend |
| WebBrowserComponent host | NEW | React frontend container with ResourceProvider |

### 11.2 React Frontend (New)

| Component | File | Purpose |
|---|---|---|
| App shell | `src/App.tsx` | Mode state, layout, panel management |
| Mode hook | `src/hooks/useAppMode.ts` | Edit/Perform mode state + transition |
| JUCE bridge | `src/hooks/useJuceBridge.ts` | Wraps `window.__JUCE__` API |
| Graph canvas | `src/components/GraphCanvas.tsx` | Dot-grid canvas, pan/zoom, breadcrumb |
| Block | `src/components/NodeBlock.tsx` | Semantic headers, ports, micro-controls |
| Cable | `src/components/CableConnection.tsx` | SVG paths with data-type encoding, animation |
| Tool Palette | `src/components/ToolPalette.tsx` | Left panel: search, favourites, plugin browser |
| Inspector | `src/components/InspectorPanel.tsx` | Right panel: context-sensitive properties |
| Snippet Shelf | `src/components/SnippetShelf.tsx` | Bottom panel: visual template thumbnails |
| Breadcrumb | `src/components/BreadcrumbNav.tsx` | Hierarchical path navigation |
| Portal Block | `src/components/PortalNode.tsx` | Gold dashed border, lock/unlock, snap-chain |
| Macro Knob | `src/components/MacroKnob.tsx` | Rotary knob with arc, rendered inside Block in Perform Mode |
| Minimap | `src/components/MinimapViewport.tsx` | Bird's-eye navigation |
| Top Toolbar | `src/components/TopToolbar.tsx` | Transport, mode toggle, undo, engine status |
| Comment Box | `src/components/CommentBox.tsx` | Coloured grouping overlay |
| Theme provider | `src/providers/ThemeProvider.tsx` | CSS variable management, mode transitions |
| Demo data | `src/data/demoGraph.ts` | 15+ node demo with 3 depth levels, Portal, macros |

### 11.3 Build & Dev Tooling

| Tool | Purpose |
|---|---|
| Vite | Frontend build tool, hot module replacement |
| React 18+ | UI framework |
| TypeScript | Type safety for all frontend code |
| Tailwind CSS 4+ | Utility-first styling |
| shadcn/ui | Base component primitives (heavily customised to match Element's dark palette) |
| Framer Motion | Animation library for mode transitions, spring physics |
| Zustand or Jotai | Lightweight state management (avoid Redux overhead) |

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

- [ ] Set up Vite + React + TypeScript + Tailwind project scaffold
- [ ] Implement `WebBrowserComponent` host in Element with `ResourceProvider`
- [ ] Build `useJuceBridge` hook wrapping `window.__JUCE__`
- [ ] Implement Theme Provider with unified dark palette CSS variables
- [ ] Build Top Toolbar (static, no C++ binding yet)
- [ ] Build GraphCanvas with pan, zoom, dot-grid rendering
- [ ] Build NodeBlock component with semantic headers and port rendering
- [ ] Build CableConnection SVG component with data-type colour encoding
- [ ] Load and render demo graph (hardcoded data)

### Phase 2: Panels & Navigation (Weeks 4-6)

- [ ] Build Tool Palette with search, favourites, recently used
- [ ] Connect Tool Palette to PluginManager via bridge
- [ ] Build Inspector Panel (context-sensitive)
- [ ] Build Breadcrumb Navigation
- [ ] Build Minimap Viewport
- [ ] Implement Comment Boxes
- [ ] Implement Spatial Bookmarks (Ctrl+0-9 / Shift+0-9)

### Phase 3: Interaction & State (Weeks 7-9)

- [ ] Implement drag-and-drop: Block placement, Cable creation, inline insertion
- [ ] Implement lasso selection and multi-select operations
- [ ] Connect ValueTree state to React via bridge (graph topology changes)
- [ ] Implement undo/redo with depth counter
- [ ] Implement Block bypass/mute with visual state encoding
- [ ] Build Snippet Shelf with drag-to-save and drag-to-instantiate

### Phase 4: Live Data & Perform Mode (Weeks 10-12)

- [ ] Implement SPSC FIFO metering bridge (C++ audio thread to React)
- [ ] Animate Smart Cables with real-time amplitude data
- [ ] Build Macro Knob component
- [ ] Implement "Tag as Macro" in Inspector
- [ ] Build Perform Mode layout (structural changes only - same palette, panels hidden, editing locked)
- [ ] Implement Design/Perform Mode toggle with animated transition
- [ ] Build Portal/Container components with semantic zoom

### Phase 5: Polish & Ship (Weeks 13-16)

- [ ] Session Browser panel (file management)
- [ ] Keyboard shortcut system (full mapping)
- [ ] Quick-swap and replace-with functionality
- [x] Wireless Patching (Named Buses)
- [ ] Manhattan routing with auto-avoidance
- [ ] Reroute Pins
- [ ] Performance optimisation (canvas virtualisation for 50+ node boards)
- [ ] Cross-platform testing (macOS, Windows, Linux)
- [ ] Startup flash mitigation
- [ ] Production ResourceProvider packaging

---

## 14. Design Decision Log

| Iteration | Decision | Rationale |
|---|---|---|
| V1 | Documented legacy JUCE UI problems | Tree-view plugin browser, unintuitive session management, cramped navigation |
| V2 | Pivoted to WebView architecture | JUCE 8 WebBrowserComponent enables React/Tailwind with C++ audio backend; massively better for vibe-coding |
| V3 | ~~Created Studio Light neuroinclusive theme~~ | ~~Superseded by V11~~ |
| V4 | Rejected radial menu | Hides tools behind spatial recall - slows expert users. Replaced with persistent Tool Palette |
| V5 | Fixed port sizes to 24px minimum | Fitts's Law compliance - smaller ports cause targeting errors |
| V6 | Macro knobs stay on-canvas in Perform Mode | Extracting to a separate row destroys spatial memory |
| V7 | Rejected neon RGB aesthetic | "Space-invader neon" is not professional audio; demanded meticulous industrial design |
| V8 | Added Unreal Engine complexity management | Bookmarks, Reroute Pins, Wireless Buses, Comment Boxes for managing blueprint-level complexity |
| V9 | Demanded neo-skeuomorphism over flat design | Lovable/Stitch outputs looked like Miro/Whimsical, not premium audio software |
| V10 | Confirmed WebView pivot with research | JUCE 8 official support, Output Arcade precedent, production-proven Vite+React+Tailwind stack, known mitigations for startup flash |
| V11 | **PARADIGM SHIFT: Killed neuroinclusive framing. Killed palette shift.** | Element is an instrument for expert creative technicians in flow state, not a tutorial. One dark palette. Speed of iteration is the supreme metric. Technical depth is surfaced beautifully, not hidden. Double-click-background navigates up. Information density is the aesthetic, not something to reduce. |
| V12 | Revised colour palette: blue/orange/teal replacing blue/green/purple | Research audit found green/purple indistinguishable for ~8% of colour-blind male users. Shape indicators added as secondary differentiator. |
| V13 | Adopted React Flow v12 (@xyflow/react) as graph engine | Research validated: handles 50-200 nodes with proper memoisation. Built-in minimap, viewport culling, custom node components. CSS containment provides 13x layout improvement. |
| V14 | Integrated Soundigy MIDI Lab reference: Value Events, Dashboard Builder, Scene system, expanded built-in nodes | MIDI Lab demonstrates the third signal type (Value Events) that transforms Element from plugin chainer to creative routing lab. Dashboard Builder enables custom Perform Mode instrument panels. Scene presets enable live set management. 30+ new built-in node types planned across MIDI, Value, Logic, and Utility categories. |
| V15 | Adopted neumorphism over glassmorphism for all depth/elevation | Neumorphism ("controls extruded from the same surface material") fits the physical instrument paradigm better than glass/blur transparency. Dark glass says "modern web app." Neumorphic shadows say "hardware faceplate with machined controls." Narrow tonal range between surfaces is critical. No backdrop-blur, no transparency layers. |
| D1 (2026-05-30) | **4-category block taxonomy replaces Generator/Modifier/Logic.** New categories: Virtual Instruments (● #4A90D9), MIDI Effects (▲ #2BC4C4), Audio Effects (◆ #E8A838), Modulators/Utilities (⬡ #A87FE0). CSS tokens: --color-instrument/midifx/audiofx/modulator. Old tokens --block-generator/modifier/logic are deprecated. | Prior 3-category taxonomy conflated signal type with function. The 4-category system cleanly separates instrument sources, MIDI processors, audio processors, and modulators/utilities — matching user mental models and enabling a distinct purple/hexagon slot for LFO/CV/scripting nodes that had no clean home in the old system. |
| D2 (2026-05-30) | **Module tier added above Block in the hierarchy.** A Module is a named grouping, breadcrumb-navigable, reusable across Boards in a Project. Distinct from Container (which is a nested Board). | Users needed a way to name and navigate logical groupings of Blocks without creating full nested Boards. Module provides a lightweight hierarchy label that preserves spatial context and breadcrumb continuity without the overhead of a Container. |
| D3 (2026-05-30) | **Dashboard Builder, MacroDashboard, and Scene/Preset system shelved (hide-UI, keep-code).** Removed from all UI, nav, and toolbar. Stores and C++ code preserved intact as reversible backlog. | Complexity/scope reduction for current development phase. The Perform Mode structural changes (panel hiding, port hiding, editing lock) remain. Dashboard Builder and Scene system are deferred rather than deleted — the code stays in place for future reactivation. Do not add nav entries or wire UI for these features. |

---

## 15. Reference Applications

| Application | What to Study |
|---|---|
| **Bitwig Studio** | Modern node-based modular UI, dark theme, grid editor |
| **VCV Rack** | Virtual modular synth with cable physics, skeuomorphic design |
| **Unreal Engine Blueprint Editor** | Node graph UX, spatial bookmarks, reroute pins, named buses, comment boxes |
| **Max/MSP** | Patcher-style modular audio, dual Edit/Performance modes |
| **Figma** | Canvas-based editor with panels, properties, component systems |
| **Blender Node Editor** | Graph editing with grouping, navigation, themes |
| **FabFilter Pro-Q 3** | Premium audio plugin visual design (tactile, precise, neo-skeuomorphic) |
| **UAD Console** | Professional audio routing interface |
| **Output Arcade** | Production JUCE plugin with WebView-based UI |
| **Soundigy MIDI Lab** | Three signal types (MIDI/Audio/Value), custom dashboard builder, expression blocks, scene presets, comprehensive built-in MIDI processing nodes |

---

## 16. File Format Reference

| Extension | Type | Purpose |
|---|---|---|
| `.els` | Project | Complete Element session/project file |
| `.elg` | Board | Standalone graph/board file |
| `.eln` | Snippet | Reusable node group template |
| `.elpreset` | Preset | Plugin preset |
| `.elc` | Controller | MIDI controller mapping |
| `.elboard` | Portal Master | External master file for Portal inheritance |
| `.elscene` | Scene | Parameter snapshot within a Project (multiple per project) |

**Template Project:** Users can define a template project loaded on startup (Preferences > General > Template Project). Saves workflow time for users who always start from the same base configuration.

**Built-in Example Projects:** Accessible from File > Example Projects menu. Demonstrates common routing patterns: basic channel strip, parallel compression, multi-instrument live rig, MIDI processing chain, sidechain routing, sub-graph nesting. Essential for onboarding and demonstrating capabilities.

---

*End of Blueprint. All agents and contributors: this is your north star. Element is an instrument. Build it like one.*
