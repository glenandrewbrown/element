# Element UI/UX Overhaul - LLM Agent Briefing Pack

**Version:** 3.0 (Aligned with Blueprint V3.0 - Instrument Paradigm + Neumorphism)
**Date:** 2026-04-01 (aligned with Blueprint V3.0, feature inventory, Stitch reference, JUCE 8.0.12 WebView flags)
**Purpose:** Ready-to-use prompts, agent definitions, and research briefs for the multi-agent vibe-coded development of Element's UI/UX overhaul.

---

## 1. Agent Roles & Responsibilities

### 1.1 Agent Architecture

```
+--[HUMAN: Glen Brown]-------------------------------------------+
|  Natural language instructions only. No direct code writing.    |
|  Reviews outputs, provides feedback, makes design decisions.    |
+-----------------------------------------------------------------+
        |
        v
+--[ORCHESTRATOR: Claude Code / Claude.ai]------------------------+
|  Reads ELEMENT_UNIFIED_BLUEPRINT.md as context.                  |
|  Decomposes tasks into agent-appropriate work.                   |
|  Routes to specialist agents. Reviews and integrates outputs.    |
+-----------------------------------------------------------------+
        |
        +---> [FRONTEND AGENT: Claude Code / Lovable / Stitch]
        |     React/Tailwind component generation
        |     Visual design implementation
        |     Interactive prototyping
        |
        +---> [BACKEND AGENT: Claude Code]
        |     C++ JUCE modifications
        |     WebView bridge implementation
        |     Lock-free FIFO metering
        |
        +---> [RESEARCH AGENT: Claude.ai / Deep Research]
        |     Technical feasibility studies
        |     Competitive analysis
        |     Performance benchmarks
        |
        +---> [DESIGN AGENT: Claude.ai + Figma MCP]
        |     Mockup generation
        |     Component specification
        |     Visual QA
        |
        +---> [QA AGENT: Claude Code]
              AX-based UI verification
              Cross-platform testing
              Performance profiling
```

---

## 2. Claude Code Session Prompts

**Prompt index:** Use **§2.3** for the full C++ WebView bridge implementation spec. Use **§5.1 Step 5 (INTEGRATION)** for wiring a finished React component into the host app and bridge—not §5.1 for the C++ bridge body. **§6.1** lists companion docs (inventory, Stitch HTML).

### 2.1 Session Initialiser (Run at start of every session)

```
You are working on the Element audio plugin host UI/UX overhaul.

CRITICAL CONTEXT: Load and read ELEMENT_UNIFIED_BLUEPRINT.md before doing anything. This is the single source of truth. V3.0 - the Instrument Paradigm.

KEY FACTS:
- Element is a modular audio plugin host (VST3/AU/LV2/CLAP) built with JUCE 8 / C++20
- UI: React/Tailwind frontend hosted in JUCE's WebBrowserComponent
- Graph engine: @xyflow/react (React Flow v12) with aggressive memoisation
- Bridge: window.__JUCE__ API for C++ <-> JS communication
- State: juce::ValueTree single source of truth, synced to React via 60Hz Timer
- Three signal types: Audio (blue), MIDI (teal), Value/CV (orange)

DESIGN PARADIGM - THE INSTRUMENT:
Element is a precision creative instrument for expert users in flow state. NOT for beginners. Technical depth surfaced beautifully. Speed of iteration is the supreme metric. Information density IS the beauty. One unified dark palette. No mode-switching colour gimmicks.

VISUAL LANGUAGE - NEUMORPHISM (NOT glass):
No glassmorphism. No backdrop-blur. No transparency. The entire UI is one continuous dark chassis with controls extruded from or pressed into the surface via paired soft shadows. Narrow tonal range between surfaces (critical for the "same material" illusion):
- Canvas: #1E1E22, Panel: #222226, Surface: #252529, Elevated: #2A2A2E, Pressed: #1A1A1E
- Raised elements: light shadow top-left rgba(255,255,255,0.05) + dark shadow bottom-right rgba(0,0,0,0.4), 8px blur min
- Pressed elements: inner shadows inverted. Buttons press INTO the surface on click.
- Micro-glow: 4px outer glow of semantic hue at 25% opacity on active elements

SEMANTIC COLOURS (colour-blind safe, each with shape indicator):
- Generators: #4A90D9 Blue + Circle
- Modifiers: #E8A838 Orange + Diamond
- Logic: #2BC4C4 Teal + Triangle
- Text: #E5E5EA primary, #8E8E93 secondary

SPEED-FIRST NAVIGATION:
- Double-click Block = dive into nested Board (150ms)
- Double-click empty canvas = navigate UP one level (150ms)
- Cmd+K = command palette (search everything)
- Right-click canvas = QuickAdd at cursor
- Ctrl+0-9 / Shift+0-9 = spatial bookmarks
- Tab = jump to next block in signal chain
- Escape = deselect/close/back out one level

KEY FEATURES:
- Edit Mode (workshop) / Perform Mode (stage) - structural change, NOT palette change
- Dashboard Builder in Perform Mode (freely composable knobs/faders/buttons/meters/pads)
- Scene/Preset system (multiple parameter snapshots per project, switchable without plugin reload)
- Panic button (red, always visible, sends Note Off to all MIDI outputs)
- Value Events as third signal type (CV/control data independent of MIDI)

TERMINOLOGY (mandatory):
"Project" "Board" "Block" "Cable" "Snippet" "Container" "Portal" "Scene"

Ask me what we're working on today.
```

### 2.2 React Component Generation Prompt

```
Generate a React/TypeScript component for the Element plugin host UI overhaul.

COMPONENT: [Component Name from Blueprint Section 12.2]

REQUIREMENTS:
- TypeScript with strict types
- Tailwind CSS using the neumorphic dark palette (Blueprint Section 5)
- @xyflow/react (React Flow v12) for any graph-related components
- Framer Motion for state-change and navigation animations only
- Use the useAppMode() hook to check Edit/Perform mode
- Use the useJuceBridge() hook for any C++ communication
- Lucide icons (24px base)
- All interactive elements: zero-delay tooltips
- Port hitbox: 24px minimum with 32px snap radius
- Wrap in React.memo() if it's a graph node component
- Apply CSS contain: content on node components

NEUMORPHIC DEPTH RULES:
- Raised elements (blocks, buttons, knobs): paired soft shadows - light top-left rgba(255,255,255,0.05) + dark bottom-right rgba(0,0,0,0.4), minimum 8px blur
- Pressed elements (inputs, inactive toggles, meter tracks): inner shadow inversion
- Surface tones cluster tight: #1A1A1E (pressed) to #2A2A2E (elevated). Wide tonal jumps break the "same material" illusion.
- NO glassmorphism, NO backdrop-blur, NO transparency layers
- Ghost borders (outline at 10-15% opacity) ONLY where overlapping elements need separation
- Micro-glow: 4px outer glow of semantic hue at 25% on active/processing elements

INSTRUMENT PARADIGM CHECKLIST:
- [ ] Can this interaction be done in fewer gestures?
- [ ] Is all relevant information visible without clicking to reveal?
- [ ] Does it work at speed - no confirmation dialogs for reversible actions
- [ ] Does it respect muscle memory - consistent patterns across contexts
- [ ] Would an expert user find this satisfying to use at velocity?
- [ ] Is the information density HIGH ENOUGH? Could more data be shown?

AESTHETIC: Dense, beautiful, information-rich. The UI is one continuous dark chassis with controls machined from it. Knobs are raised neumorphic circles with recessed indicator tracks. Faders have raised thumbs in recessed channels. Buttons press INTO the surface on click (shadow inversion). Everything feels like physical hardware translated to screen.

Output the complete component file with all imports, types, and implementation.
```

### 2.3 C++ WebView Bridge Implementation Prompt

```
You are implementing the C++ side of the WebView bridge for Element.

CONTEXT: Element uses JUCE 8's WebBrowserComponent to host a React/Tailwind frontend. You are writing the C++ code that:

1. Creates and configures the WebBrowserComponent with Options:
   - withNativeIntegrationEnabled()
   - withResourceProvider() for serving bundled React build
   - withNativeFunction() for each C++ function exposed to JS
   - withEventListener() for each JS event the C++ side needs to hear
   - withInitialisationData() for initial state

2. Implements a 60Hz juce::Timer that:
   - Pops latest metering data from lock-free SPSC FIFO (juce::AbstractFifo)
   - Constructs JSON payload
   - Dispatches to React via evaluateJavascript()

3. Bridges juce::ValueTree state changes to React:
   - Listens for ValueTree changes on the message thread
   - Serialises changed subtrees to JSON
   - Dispatches to React

REAL-TIME SAFETY RULES:
- NEVER use std::mutex on the audio thread
- NEVER allocate memory on the audio thread
- Audio thread writes to SPSC FIFO only
- Message thread reads from FIFO and dispatches to WebView
- Use std::atomic for simple flags
- Use juce::AbstractFifo for buffered data

EXISTING ARCHITECTURE:
- State lives in juce::ValueTree (see CLAUDE.md Architecture section)
- Audio processing uses GraphBuilder -> GraphOp sequence -> atomic pointer swap
- Sandbox plugins use SandboxHost/SandboxWorker with SharedAudioBuffer IPC

JUCE 8 CMAKE / MODULE FLAGS (Element pins JUCE 8.0.12 — verify names in juce_gui_extra):
- Set JUCE_WEB_BROWSER=1 on targets that compile WebView code (today the static library may still force 0 — flip when adding the host).
- Windows WebView2: JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 (exact spelling per upstream; avoid copy-paste from outdated tutorials using different underscores).
- Binary targets created with juce_add_gui_app / juce_add_plugin: NEEDS_WEB_BROWSER TRUE (e.g. Linux WebKit); NEEDS_WEBVIEW2 TRUE on Windows for static WebView2 linking, not only the static element library.
- Prefer WebBrowserComponent::Options::withBackend (Backend::webview2) on Windows so the engine is not the legacy IE backend.
- Production: withResourceProvider + goToURL (WebBrowserComponent::getResourceProviderRoot()); provider serves "/" as index.html. Dev: optional allowedOrigin (e.g. Vite http://127.0.0.1:5173) on withResourceProvider if scripts must reach bundled paths — narrow or omit in release builds.
- JS → C++: window.__JUCE__.backend.emitEvent (eventId, data) with withEventListener on the C++ side; parameter UI may use WebSliderRelay / WebSliderParameterAttachment where applicable.

Write production-quality C++ following the coding guidelines in CLAUDE.md.
```

### 2.4 Smart Cable Animation Prompt

```
Implement the Smart Cable system for Element's React graph editor.

A Cable is an SVG path connecting two Block ports. Cables must encode:

VISUAL ENCODING:
- Colour by data type: Audio=#4A90D9, MIDI=#2BC4C4, CV=#E8A838
- Thickness by channel count: Mono=2px, Stereo=3px, Multichannel=5px
- Stroke style: Solid=main path, Dashed=sidechain
- Routing: Manhattan (orthogonal, right-angle) by default with node avoidance

ANIMATION (requires real-time data from C++ via useJuceBridge):
- Subtle pulse animation flowing in the direction of signal
- Pulse opacity/intensity maps to RMS amplitude (0.0-1.0 float from C++)
- Use requestAnimationFrame, NOT CSS animation (need dynamic values)
- Performance target: 60fps with 30+ cables visible
- Fallback: disable animation if frame budget exceeded

INTERACTION:
- Hover: cable glows brighter, tooltip shows "Source Block > Destination Block"
- Double-click: insert Reroute Pin (invisible anchor point for manual routing)
- Drag endpoint off port: detach and show preview when hovering new port
- Drag new Block onto cable: insert Block inline

SVG IMPLEMENTATION:
- Use SVG <path> elements with calculated d attributes
- Manhattan routing: calculate orthogonal path with automatic bend points
- Avoid overlapping with other Blocks (pathfinding around obstacles)
- Reroute Pins: additional control points in the path

The component receives props: { sourceBlock, sourcePort, destBlock, destPort, dataType, channelCount, isSidechain, amplitude }
```

---

## 3. Lovable / Stitch / Bolt Prompts

### 3.1 Full Application Prototype Prompt

```
Build a React/TypeScript/Tailwind prototype of Element, a modular audio plugin host.

THIS IS A PROTOTYPE - mock all C++ communication with hardcoded demo data.

DEMO DATA: Create a realistic graph with ~15 nodes across 3 categories and 3 signal types:
- Generators (Blue #4A90D9 headers, circle indicator): Audio Input, Kontakt 8, Serum
- Modifiers (Orange #E8A838 headers, diamond indicator): FabFilter Pro-Q 3, 1176 Compressor, Valhalla Room, H-Delay
- Logic (Teal #2BC4C4 headers, triangle indicator): MIDI Router, Arpeggiator, LFO Tool, Value Constant
- Three port types: circles (audio, blue), diamonds (MIDI, teal), squares (value/CV, orange)

Connect them in a realistic signal flow. Include one Container (nested graph) and one Portal (amber dashed border). Include cables of all three signal types.

VISUAL LANGUAGE - NEUMORPHISM (CRITICAL):
This is NOT glassmorphism. NO backdrop-blur. NO transparency. The entire UI is one continuous dark chassis with controls extruded from or pressed into the surface via paired soft shadows.

Surface tones cluster TIGHT (narrow range = "same material" illusion):
- Canvas: #1E1E22
- Panel: #222226
- Surface (block bodies): #252529
- Elevated (hovered): #2A2A2E
- Pressed (inputs, recessed): #1A1A1E

Neumorphic shadow pairs on ALL raised elements (blocks, buttons, knobs):
- Light shadow: top-left, rgba(255,255,255,0.05), 8px blur
- Dark shadow: bottom-right, rgba(0,0,0,0.4), 8px blur

Pressed/inset elements (inputs, meter tracks, inactive toggles): INNER shadows inverted.
Micro-glow on active/processing elements: 4px outer glow of semantic hue at 25% opacity.
Ghost borders: outline at 10-15% opacity ONLY where overlapping elements need separation.
NO hard borders anywhere. Boundaries come from shadows and tonal shifts.

Font: Inter exclusively. Tabular figures on all numbers. Min 12px. Primary text #E5E5EA. Secondary #8E8E93.

LAYOUT:
- Top: 40px toolbar: [Transport] [BPM] [TAP] | [EDIT/PERFORM toggle] | [Scene: 1/8] | [Undo Redo] | [PANIC (red)] | [48kHz | 256spl | 2.6ms]
- Left: 260px Tool Palette (search, favourites, recently used, categorised plugins) - collapsible to 36px icon strip
- Right: 280px Inspector / Diagnostics Hub (tabbed: Inspector, Log, Console, Meters) - collapsible to 36px
- Bottom: 64px panel (Snippet Shelf in Edit, Macro Dashboard in Perform) - collapsible
- Centre: Infinite pan/zoom canvas with 20px dot grid

BLOCKS:
- Neumorphic raised rectangles with 24px semantic header (colour inlay, not border)
- Contains: block name, bypass toggle, format badge pill, CPU indicator, category shape
- Ports: 10-12px visual, 16-18px hover with glow, circles/diamonds/squares by type
- States: active (full), bypassed (60% + diagonal stripe), error (red border pulse)
- Embedded mini-visualisations: waveform preview on synths, EQ curve on processors, routing matrix on MIDI blocks

CABLES:
- Manhattan (right-angle) routing with auto node avoidance
- Colour by signal type: blue (audio), teal (MIDI), orange (value/CV)
- Thickness: 2px mono, 3px stereo, 5px multichannel
- Dashed = sidechain ONLY
- Subtle pulse animation in signal direction

INTERACTIONS (speed-first):
- Click block = select (neumorphic highlight, shadow intensifies)
- Double-click block = dive into nested board (150ms zoom animation)
- Double-click empty canvas = navigate UP one level (150ms)
- Right-click canvas = QuickAdd popup at cursor (search + insert)
- Drag blocks to move (snap to 20px grid)
- Drag block onto cable = insert inline
- Tab = jump to next block in chain
- Escape = deselect/close/back out
- Cmd+K = command palette overlay
- Edit/Perform toggle = structural change (panels swap), NO palette change

PERFORM MODE (when toggled):
- Left panel becomes: Quick Access (signal chain list + global presets)
- Right panel becomes: Live Health (CPU, I/O, buffer, latency, status alerts)
- Bottom panel becomes: Dashboard Builder with tabs (Macro Controls, Scene Launch, Performance FX)
- Macro controls: neumorphic knobs and faders with source labels, freely arranged
- MAP MODE toggle for assigning parameters to dashboard
- Graph simplified: ports hidden, cables dimmed, editing locked

This is a PRECISION CREATIVE INSTRUMENT. Think: the density of a watch movement, the confidence of a Neve console, the data transparency of TouchDesigner, the clinical precision of FabFilter. Every element neumorphic - extruded from or pressed into one continuous dark surface. Beautiful complexity. Instrument density. NO generic web app patterns.
```

### 3.2 Edit Mode Polish Prompt (Iteration)

```
I need you to be more investigative and build on my suggestions - not robotically implement them with no analysis and ideation. I've outlined the features needed and the design vision to follow. I need you to act as a creative architect and technical designer - taking all context and generating a vast array of ideas with no upper limit on quantity or scope - as long as they adhere to the design philosophy.

THE DESIGN PHILOSOPHY:
- Instrument paradigm: rewards mastery with effortless expression
- Speed-first: every interaction measured in milliseconds of intent-to-result
- Information density is beauty: show everything, beautifully
- Neumorphism: controls extruded from / pressed into one continuous dark surface - NO glass, NO blur, NO transparency
- Audio-domain specific: this should feel like pro audio hardware, not a web app

AREAS TO IDEATE ON:
1. Block hover/selection states - how do neumorphic shadows change to communicate "selected" vs "hovered" vs "processing" vs "bypassed"? Shadow intensification? Glow addition? Subtle elevation shift?
2. Cable animation - how does signal flow feel on Manhattan-routed cables? Right-angle pulse animation? Colour intensity mapping to amplitude?
3. Port connection UX - what neumorphic transition happens as you drag a cable toward a compatible port? Does the port socket "open" (shadow shifts from pressed to raised)? What about incompatible ports?
4. Neumorphic knobs - how does the raised circular body + recessed arc track + indicator line work together? What happens during drag rotation? Does the arc fill? Does the glow intensify?
5. The Perform Mode Dashboard Builder - how do you freely position knobs, faders, buttons, meters, and displays on a neumorphic surface? What does the MAP MODE editing state look like?
6. Portal "fly-in" animation when double-clicking into a nested graph - maintaining spatial awareness in 150ms
7. Scene switching - what neumorphic affordance lets you see which Scene is active and quickly switch? A recessed selector strip?
8. Comment Box interaction - neumorphic recessed regions that group blocks, with editable labels
9. Empty state - what does a brand new project canvas look like? Not a tutorial - maybe a faint "ghost" of a common routing template ready to fill?
10. The Panic button - this needs to FEEL urgent. A raised neumorphic red button with a satisfying pressed state. How does it communicate "I'm here, I'm safe, one click"?
11. The command palette (Cmd+K) - a neumorphic recessed search channel that drops from the toolbar? Or a floating panel (the ONE element that uses a traditional drop shadow since it genuinely floats above the surface)?
12. Mini-visualisations on blocks - recessed neumorphic display windows showing waveforms, spectra, routing matrices live inside each block

Generate specific, implementable ideas for each. Include CSS shadow values, Tailwind classes, animation timing. Think about the FEEL of the neumorphic surface - every control should feel like it has physical weight and position on the chassis.
```

---

## 4. Deep Research Prompts

### 4.1 JUCE WebView Performance Benchmarking

```
Research and document the performance characteristics of JUCE 8's WebBrowserComponent when used as the primary UI for an audio plugin host.

QUESTIONS TO ANSWER:
1. What is the measured CPU overhead of running a React UI inside WebBrowserComponent vs native JUCE LookAndFeel components?
2. What is the startup time (time from component creation to first meaningful paint) across platforms?
3. How does evaluateJavascript() latency compare to native component painting at 60fps?
4. What is the memory footprint difference (WebView process vs native)?
5. Are there documented cases of WebView-based audio plugins passing DAW plugin scan reliability tests?
6. What are the specific WebView versions (WebKit, WebView2, GTK WebKit2) available on each target OS and their rendering capabilities?
7. What are the maximum practical limits: how many DOM elements before performance degrades? How many canvas redraws per frame?

SEARCH: JUCE forum threads, ADC talks, GitHub issues, real-world case studies, benchmark reports. Focus on data from 2024-2026.

OUTPUT: A technical feasibility report with specific numbers, test methodology where available, and risk assessment for each finding.
```

### 4.2 Node Graph UI Competitive Analysis

```
Conduct a comprehensive competitive analysis of node/graph-based UIs in audio and creative software.

APPLICATIONS TO ANALYSE:
1. Bitwig Studio (Grid / Modular)
2. VCV Rack 2
3. Max/MSP 8
4. Unreal Engine 5 Blueprint Editor
5. TouchDesigner
6. Blender Geometry Nodes / Shader Editor
7. Figma (not audio, but best-in-class canvas UX)
8. Reaktor 6
9. FMOD Studio
10. Wwise (Audio Authoring)

FOR EACH APPLICATION DOCUMENT:
- Node visual design (shape, colour coding, port style, label placement)
- Cable routing approach (bezier, Manhattan, freeform)
- Zoom behaviour (semantic zoom levels, LOD changes)
- Navigation (minimap, bookmarks, breadcrumbs)
- Search and insert UX
- Grouping and organisation tools
- Performance mode / runtime mode (if applicable)
- Accessibility features
- Dark/Light theme handling

OUTPUT: Comparison matrix with screenshots/descriptions. Identify the top 3 UX patterns Element should adopt and the top 3 anti-patterns to avoid.
```

### 4.3 Flow State UX for Expert Creative Tools

```
Research evidence-based principles for designing complex software interfaces that facilitate flow state for expert users.

FOCUS AREAS:
1. Flow state theory (Csikszentmihalyi) applied to creative software interfaces (2018-2026)
2. Expert user performance: how skilled users interact with dense, information-rich UIs vs simplified ones
3. Muscle memory and gestural vocabulary research for power-user interaction patterns
4. Typography research for data-dense UIs: font choice, sizing, spacing for rapid scanning
5. The role of information density in expert performance vs the "simplicity" myth
6. Animation and motion: when does motion aid spatial awareness vs break flow?
7. Colour theory for professional creative tools: optimal contrast, semantic encoding, fatigue reduction
8. Case studies of expert-oriented creative tools that reward mastery (Houdini, TouchDesigner, Blender, Vim)

SEARCH: HCI research papers, creative tool design blogs, ADC/SIGGRAPH talks, Houdini/TouchDesigner/Blender community UX discussions.

OUTPUT: An evidence-based design principles document focused on maximising expert user velocity and creative flow.
```

### 4.4 Lock-Free Real-Time Metering Architecture

```
Research and document the optimal architecture for bridging real-time audio metering data from a C++ audio thread to a React UI running in a WebView.

CONSTRAINTS:
- Zero allocations on the audio thread
- Zero mutex locks on the audio thread
- Audio thread callback runs at buffer sizes of 64-2048 samples at 44.1-192kHz
- UI refresh target: 60fps
- Data: per-cable RMS amplitude (float, 0.0-1.0), per-block CPU load (float), clipping flags (bool)
- Expected scale: 30-50 cables, 30-50 blocks
- Platform: macOS (WebKit), Windows (WebView2), Linux (WebKit2)

QUESTIONS:
1. What is the optimal FIFO size and structure for this data volume?
2. Should the Timer poll individual FIFOs per cable, or batch into a single structured FIFO?
3. What JSON serialisation approach is fastest for this payload size (raw string construction vs library)?
4. Is evaluateJavascript() the right dispatch method, or should we use emitEventIfBrowserIsVisible()?
5. What is the measured round-trip latency from audio callback to React paint?
6. Are there alternative approaches (SharedArrayBuffer, WebSocket, etc.) that offer better performance?

REFERENCE: juce::AbstractFifo documentation, JUCE real-time safety guidelines, WebBrowserComponent API reference.

OUTPUT: Architecture diagram, code skeleton (C++ producer, C++ timer consumer, TypeScript receiver), performance estimates.
```

### 4.5 React Canvas Performance for Large Graphs

```
Research the best-performing approach for rendering a large interactive node graph (50-200 nodes, 100-500 connections) in a React application.

OPTIONS TO EVALUATE:
1. Pure SVG with React components for each node and path
2. HTML/CSS for nodes + SVG overlay for connections
3. HTML Canvas (2D) for the entire graph
4. WebGL via Three.js / PixiJS for the entire graph
5. React Flow (existing library) - customised to match Element's design
6. Hybrid: HTML for selected/nearby nodes, Canvas for distant nodes (LOD)

EVALUATION CRITERIA:
- Render performance at 60fps with 100+ nodes visible
- Interaction latency (drag, zoom, select)
- DOM element count and memory usage
- Compatibility with JUCE WebBrowserComponent on all three platforms
- Developer experience for vibe-coding (how LLM-friendly is the approach?)
- Ability to implement: semantic zoom, Manhattan routing, cable animation, embedded plugin GUIs

SPECIFIC CONCERNS:
- JUCE's WebBrowserComponent may have different capabilities than a standard browser
- Plugin GUIs are native windows that float above the WebView - how does this interact with canvas/SVG rendering?
- Touch/trackpad gestures for pan and zoom

OUTPUT: Recommendation with benchmarks, code examples for the recommended approach, and a migration path if the initial choice needs to change.
```

---

## 5. Multi-Agent Workflow Definitions

### 5.1 New Component Workflow

```
TRIGGER: Glen requests a new UI component

STEP 1 - ORCHESTRATOR (Claude.ai):
  - Identify which Blueprint section the component belongs to
  - Extract the full specification from the Blueprint
  - Check for dependencies on other components
  - Generate a component brief with all specs, props, states, interactions

STEP 2 - FRONTEND AGENT (Claude Code):
  - Generate the React/TypeScript component
  - Include all Tailwind styling with CSS custom properties
  - Include Framer Motion animations where specified
  - Include type definitions for all props
  - Include Storybook story for isolated testing

STEP 3 - DESIGN AGENT (Claude.ai):
  - Review generated component against Blueprint aesthetic requirements
  - Check: neumorphic depth? Controls feel extruded from the surface?
  - Check: does this feel like an instrument? Would an expert find it satisfying at velocity?
  - Check: is information density maximised without becoming noise?
  - Check: NO glass, NO blur, NO transparency anywhere?

STEP 4 - QA AGENT (Claude Code):
  - Verify component renders correctly at minimum size (600x400)
  - Verify all interactive states (hover, active, disabled, selected)
  - Verify tooltip content
  - Verify keyboard accessibility
  - Run against instrument paradigm checklist (speed, density, flow)

STEP 5 - INTEGRATION (Claude Code):
  - Wire component into the app layout
  - Connect to JUCE bridge if needed
  - Update demo data if needed
  - Test in the full application context
```

### 5.2 Design Iteration Workflow

```
TRIGGER: Glen provides visual feedback (screenshot, annotation, description)

STEP 1 - ORCHESTRATOR:
  - Analyse feedback for: specific issues, general direction, aesthetic concerns
  - Classify each piece of feedback: Bug / Enhancement / Polish / Rethink
  - Prioritise: Critical (blocks workflow) / High / Medium / Low

STEP 2 - MAP TO BLUEPRINT:
  - For each issue, identify which Blueprint section is relevant
  - Determine if the feedback requires a Blueprint update or just an implementation fix
  - If Blueprint update needed: propose changes for Glen's approval

STEP 3 - IMPLEMENT:
  - Route each fix to the appropriate agent
  - Visual polish -> Frontend Agent
  - Interaction bug -> Frontend Agent
  - Data/state issue -> Backend Agent
  - Design system change -> Design Agent first, then Frontend Agent

STEP 4 - REVIEW:
  - Present changes to Glen with before/after comparison
  - Wait for approval before committing
```

### 5.3 Research-to-Implementation Pipeline

```
TRIGGER: A technical question needs answering before implementation can proceed

STEP 1 - RESEARCH AGENT:
  - Use the appropriate Deep Research Prompt (Section 4)
  - Search web, JUCE forum, GitHub, academic papers
  - Produce a findings report with specific recommendations

STEP 2 - ORCHESTRATOR:
  - Review findings for relevance and accuracy
  - Extract actionable decisions
  - Update ELEMENT_UNIFIED_BLUEPRINT.md if findings change any architectural decisions
  - Generate implementation tasks

STEP 3 - IMPLEMENTATION AGENTS:
  - Execute tasks based on research findings
  - Reference the findings report in code comments where relevant

STEP 4 - VALIDATION:
  - Test the implementation against the research findings' predicted outcomes
  - Document any deviations
```

---

## 6. Context Window Management

### 6.1 Essential Files for Any Session

Every Claude Code session working on Element should load:

1. `docs/ELEMENT_UNIFIED_BLUEPRINT.md` (north star architecture + WebView spec)
2. `docs/ELEMENT_FEATURE_INVENTORY.md` (feature → UI mapping, parity checklist)
3. `CLAUDE.md` (build commands, architecture, coding guidelines)
4. `AGENTS.md` (Cursor/agent entry; points at rules and skills)
5. Visual reference: `docs/stitch-reference/` (`DESIGN.md`, `edit-mode.html`, `perform-mode.html`)
6. The specific source file(s) being worked on

**Web v1 product policies (don’t contradict in agents):** session **New/Open/Save/Recent** stay on the **native File menu** (not bridged in React). Nested **plugin editor UIs** use **floating JUCE windows**; `WebContent::presentView` is intentionally a no-op until an in-web embed bridge exists. Graph **copy/paste** in the Web shell uses a **host pasteboard** + `DuplicateNodeMessage` (undo-aligned), not the OS text clipboard.

### 6.2 Context Budget Guidelines

| Session Type | Max Context | Strategy |
| --- | --- | --- |
| Single component work | 60k tokens | Blueprint + inventory + CLAUDE.md + component file + adjacent components |
| Architecture work | 100k tokens | Blueprint + CLAUDE.md + `src/ui/` / bridge host codemaps |
| Bug fix | 40k tokens | Blueprint (visual Section 5 only if UI-related) + specific file + error output |
| Research | 80k tokens | Research prompt + results + Blueprint (relevant section) |

### 6.3 RepoPrompt Strategy

Use codemaps for the C++ codebase (don't load full files unless editing). For the React app under `webview/`, load full files only when editing:

- The specific component being created/edited (e.g. `webview/src/components/**`)
- `webview/src/hooks/useJuceBridge.ts` — **add this when the bridge exists**; until then, stub types at the call sites
- `webview/src/App.tsx`, `webview/src/main.tsx` (app shell entry)
- `webview/src/index.css` — **Tailwind v4 `@theme` tokens** (design system; no `tailwind.config.ts` in this project)
- `vite.config.ts` when changing Vite/Tailwind plugin options

---

## 7. Quality Gates

Every PR / commit should pass these checks:

### 7.1 Visual Quality Gate
- [ ] Neumorphic shadow pairs present on all raised elements (light top-left + dark bottom-right)
- [ ] Pressed/inset elements use inner shadow inversion
- [ ] Surface tones within the narrow range (#1A1A1E to #2A2A2E) - no wide tonal jumps
- [ ] NO glassmorphism, NO backdrop-blur, NO transparency layers anywhere
- [ ] Ghost borders at 10-15% opacity maximum (used sparingly)
- [ ] Micro-glow (4px, 25% opacity) on active/processing elements only
- [ ] Typography follows Blueprint Section 5.1 specs (tabular figures on numbers)
- [ ] Renders correctly at 600x400px minimum
- [ ] Looks like hardware - controls extruded from one continuous surface

### 7.2 Instrument Quality Gate
- [ ] Can every interaction be completed in fewer gestures than the current implementation?
- [ ] Navigation actions complete in < 150ms
- [ ] No confirmation dialogs for reversible actions
- [ ] All relevant information visible without clicking to reveal
- [ ] Colour is not the ONLY way to communicate state (shape indicators present)
- [ ] Consistent interaction patterns across all contexts (same gesture = same result)
- [ ] Works at expert velocity - no artificial delays, no tooltip hover delays
- [ ] All animations < 250ms, navigation transitions < 150ms
- [ ] Information density: would an expert user want MORE data visible, not less?

### 7.3 Technical Quality Gate
- [ ] TypeScript strict mode passes (`cd webview && npx tsc -b`)
- [ ] No console errors or warnings
- [ ] Renders in WebKit (macOS), WebView2 (Windows), and WebKit2 (Linux)
- [ ] No memory leaks in component lifecycle
- [ ] 60fps maintained with demo graph visible
- [ ] **C++ / realtime:** metering or graph telemetry uses lock-free queues only; no allocations and no `std::mutex` on the audio thread (see §2.3)

---

*End of Agent Briefing Pack. Use these prompts as starting points - adapt them to the specific task at hand. The Blueprint is always the authority.*
