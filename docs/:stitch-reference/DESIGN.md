DESIGN.md - Element: The Precision Instrument
The Problem With Every Other Design System
Most design systems produce apps that look like every other app. A sidebar. A toolbar. Cards in a grid. Hover states. That’s not what this is. This is a musical instrument that happens to have a screen. A Stradivarius doesn’t have a settings panel. A Moog doesn’t ask “are you sure?” before you patch a cable. The interface must be so deeply learned that the user’s hands move while their mind stays on the music. Every millisecond of interaction latency, every unnecessary click, every hidden menu is a wall between creative intent and sonic result.
Your job is not to implement a spec. Your job is to design an instrument that rewards mastery with effortless expression.
The User
One person. A professional audio engineer, composer, or sound designer with 10,000+ hours in DAWs. They know what a compressor sidechain is the way a chef knows what a mandoline is - they don’t need labels, they need speed. They’re building a 30-node signal chain at 2am with a deadline, and the tool must keep up with the velocity of their thought. When it does, they enter flow state and produce extraordinary work. When it doesn’t, they fight the UI instead of making music.
What Element Is
A modular audio plugin host. Users load VST3/AU/LV2/CLAP audio plugins as blocks on an infinite dark canvas, connect them with cables, create complex signal chains, and perform with them live. It runs standalone and as a plugin inside DAWs. The UI is React/Tailwind inside a JUCE WebView.
Aesthetic North Star: Beautiful Complexity
The density of information IS the beauty. A graph with 30 blocks, animated cables showing live signal flow, embedded mini-meters on every node, and colour-coded routing visible at a glance is not “cluttered” - it is a living, breathing representation of a complex creative system. Think of the beauty of a watch movement, a circuit board under magnification, a mixing console viewed from above.
Reference the intersection of: FabFilter’s clinical precision + TouchDesigner’s data flow transparency + Houdini’s unapologetic information density + a Neve console’s physical confidence.
Reject entirely: Generic SaaS dashboards. Startup landing pages. Material Design defaults. Anything that looks like it was designed for someone who might be confused. Our user is never confused.
The Surface Hierarchy (Neumorphic Depth)
The UI is a single continuous dark surface. Controls, blocks, and panels are extruded from or pressed into that surface - like physical hardware where knobs, buttons, and displays are machined from the same aluminium chassis. No floating glass panels. No backdrop blur transparency. Everything feels carved from the same material.
Neumorphic shadow pairs on dark surfaces:


Raised elements (blocks, buttons, knobs): light shadow top-left rgba(255,255,255,0.05), dark shadow bottom-right rgba(0,0,0,0.4). The element background matches or nearly matches the parent surface.

Pressed/inset elements (input fields, meter tracks, inactive toggles): invert the shadow direction. Dark shadow top-left (inner), light catch bottom-right (inner). Creates a recessed channel feel.

Soft radius on ALL shadows - neumorphism demands diffused, never sharp shadows. Minimum 8px blur on raised elements, 4px on pressed.
Surface tones (close together - this is critical for neumorphism):


Canvas: #1E1E22 - the base plane

Panel: #222226 - barely distinguishable from canvas, separation comes from shadows not colour

Surface (block bodies): #252529 - raised via neumorphic shadow pair

Elevated (active/hovered): #2A2A2E - subtle lift

Pressed (inset controls): #1A1A1E - recessed into the surface
The tonal range is deliberately NARROW (only ~12 steps between darkest and lightest). Wide tonal jumps break the “same material” illusion. Ghost borders (outline-variant at 10-15% opacity) only where overlapping elements absolutely require separation.
Micro-glow on active elements: 4px outer glow of the semantic hue (blue/orange/teal) at 25% opacity. Mimics the light-bleed of a backlit LED on physical hardware - the glow sits ON the neumorphic surface, not floating above it.
Semantic Colour (Function = Colour = Shape)
Three signal categories, each with a colour AND a geometric indicator so colour is never the sole differentiator:


Generators (synths, inputs, sources): #4A90D9 Blue + Circle

Modifiers (FX, EQ, dynamics, processors): #E8A838 Orange/Amber + Diamond

Logic (MIDI routing, scripting, CV, control): #2BC4C4 Teal + Triangle
Three cable/signal types: Audio (blue), MIDI (teal), Value/CV (orange). Thickness encodes channel count (2px mono, 3px stereo, 5px multichannel). Dashed = sidechain only.
Typography
Inter exclusively. Tabular figures (font-variant-numeric: tabular-nums) on ALL numerical readouts - frequencies, dB, ms, percentages, BPM, timecode. No layout jitter during real-time modulation. Primary text #E5E5EA (never pure white). Secondary #8E8E93. Minimum 12px anywhere. Letter-spacing 0.01em body, 0.02em labels.
Depth (Neumorphic, Not Glass)
No glassmorphism. No backdrop-blur. No transparency layers. Depth is communicated through neumorphic shadow pairs - the same technique that makes a hardware faceplate’s buttons feel physically present.
Three depth levels, all using shadow pairs:


Resting (blocks on canvas): light shadow 2px/-2px at rgba(255,255,255,0.04) 8px blur + dark shadow 2px/-2px at rgba(0,0,0,0.35) 8px blur

Hovered/Active (focused blocks, active panels): shadows intensify - light at 0.06, dark at 0.45, blur increases to 12px. The element feels like it’s being pushed slightly toward you.

Pressed (clicked buttons, active toggles, inset controls): shadows INVERT. Inner dark shadow top-left, inner light catch bottom-right. The element feels pushed INTO the surface.
For knobs and faders specifically: the neumorphic raised base creates the physical body, and the indicator arc/track is a pressed inset channel. This dual-depth (raised knob body + recessed track) is what makes audio plugin knobs feel tangible.
Floating modals and context menus are the ONE exception - these use a traditional drop shadow (0 8px 32px rgba(0,0,0,0.5)) because they genuinely float above the surface plane, not extruded from it.
Motion
Motion serves two purposes ONLY: communicating state change, and maintaining spatial continuity during navigation. Cable signal-flow animation is the functional exception - it communicates real-time amplitude data.
All transitions 150-250ms. Navigation transitions (diving into/out of nested boards) 150ms max. Custom easing: cubic-bezier(0.16, 1, 0.3, 1) for a “heavy, mechanical” feel - like a precision switch snapping into position. Respect prefers-reduced-motion.
Speed-First Interaction Philosophy
Every interaction must feel faster than thought. If the user thinks “I want to add a compressor after this EQ” the tool should have the compressor placed before the thought completes. This means:
Navigation Must Be Instant


Double-click a block = dive INTO its nested board (semantic zoom, 150ms)

Double-click empty canvas = navigate UP one layer (back to parent board, 150ms)

Breadcrumb trail always visible showing Project > Board > Sub-Board - clickable at every level

Spatial bookmarks (Ctrl+0-9 save, Shift+0-9 recall) - instant camera jumps with no animation

Command palette (Cmd+K) - search EVERYTHING: plugins, actions, settings, blocks on canvas, scenes, recent projects
Insertion Must Be Frictionless


Right-click canvas = QuickAdd popup exactly at cursor position. Type plugin name, hit Enter, block appears RIGHT THERE

Drag from Tool Palette = block follows cursor onto canvas, drops where you release

Drag block onto cable = insert inline automatically

Tab key on a selected block = jump to next block in signal chain
No Interruptions in Flow


Zero confirmation dialogs for any reversible action (undo exists, use it)

Zero tooltip hover delays (expert users don’t need waiting, show immediately)

Zero mode switches required for basic operations

Escape always deselects/closes/backs out one level
Component Design Directives
The Block (Node)
Not a card. Not a rectangle. A physical module extruded from the canvas surface. It has the same material feel as the surface it sits on - neumorphic shadow pairs give it presence without lifting it into a separate visual plane. The 24px semantic-coloured header is the faceplate accent strip - a machined colour inlay on the module housing.
Think about what information a user needs at a glance without clicking:


What IS this? (name + format badge + category shape)

Is it DOING anything? (signal flow on connected cables, micro-glow when processing)

Is something WRONG? (red border pulse for clipping, amber for high CPU)

Is it BYPASSED? (60% opacity + diagonal stripe)

What can I INTERACT with? (ports glow and expand on hover approach)
Ports are 10-12px visual, expanding to 16-18px with a soft glow on hover, with a 32px snap-to-port radius so you don’t need pixel-perfect aim. Circles for audio, diamonds for MIDI, squares for value/CV.
Cables (Smart Connections)
Manhattan (right-angle, orthogonal) routing by default. Cables route themselves around blocks - no spaghetti. Every cable carries real-time data: a subtle pulse animation flowing in the direction of signal, opacity mapping to amplitude. You should be able to LOOK at the graph and SEE where audio is flowing.
Double-click a cable to insert a reroute pin (invisible anchor for manual routing). Drag a cable endpoint off its port to detach and preview connections. These should feel as natural as plugging in a patch cable.
The Canvas
An infinite dark plane with a subtle 20px dot grid. Pan with middle-mouse or trackpad gesture. Zoom with Cmd+scroll. Fit-to-view with Cmd+0. The canvas should feel like a physical surface - when you pan, the content has momentum and weight, not frictionless sliding.
The minimap (bottom-right) shows the full board as a bird’s-eye view with coloured dots representing blocks. The viewport rectangle is draggable. This is non-negotiable for graphs over 15 blocks.
Panels
Three panel zones: left (Tool Palette / Browser), right (Inspector / Diagnostics), bottom (Snippet Shelf / Macro Dashboard / Console). All collapsible to icon-only strips (36px). All togglable via Cmd+1/2/3/4. The default state should maximise canvas space.
Panels are neumorphic surfaces that feel like they slide out from the chassis - same material, slight tonal shift, shadow pairs defining their edges against the canvas. When collapsed, only the icon strip remains, pressed slightly INTO the surface. When expanded, the panel body is raised slightly FROM the surface. No glass. No blur. No transparency.
The Toolbar
Thin (40px), dense, functional. Every pixel earns its place:
[Transport: Rew Play Stop] [BPM: 128.00] [4/4] [TAP] | [EDIT/PERFORM toggle] | [Scene: 1/8 Prev Next] | [Undo(5) Redo] | [PANIC] | [48kHz | 256spl | 2.6ms] [Engine: LIVE]

The Panic button is always red, always visible, always one click. It sends Note Off to all MIDI outputs.
The Two Modes
Edit Mode
Everything exposed. Full power. The “workshop” where you build the machine.


All panels available

All ports visible

Embedded plugin GUIs can be opened inline

Comment boxes for organisation

Molecule templates for reusing patterns

Full scripting access (Lua console)
Perform Mode
The “stage.” Locked down, bulletproof, performance-ready. Same visual palette - NO colour shift. The difference is structural:


Editing disabled (no drag, no delete, no new connections)

Tool Palette becomes Quick Access (signal chain list + global presets)

Inspector becomes Live Health (CPU, I/O, buffer, latency, alerts)

Bottom panel becomes the Dashboard Builder: a freely composable control surface with knobs, faders, buttons, meters, grid pads, displays - all wired to parameters from any block in the graph

Macro Controls / Scene Launch / Performance FX tabs

MAP MODE toggle: switch on, click any parameter anywhere, it appears in the dashboard. Switch off.
Creative Directives for Generation
When generating components, don’t just implement the spec. Ask yourself:


What would a 20-year veteran of audio production want to see here? They don’t need tutorials or explanations. They need density, precision, and speed.

What information can I show WITHOUT the user asking for it? Live signal metering on cables. CPU load per-block. Latency per-block. Format badges. Processing status. All passive, all ambient, all beautiful.

Where can I remove a click? If something takes a click to reveal, can it be visible by default? If it takes two clicks, can it take one? If it takes a mode switch, can it be available in both modes?

Does this feel like a physical instrument? Knobs are neumorphic raised circles with recessed indicator tracks. Faders have raised thumbs in recessed channels. Buttons press INTO the surface on click (shadow inversion). Toggle switches snap between raised and pressed states. Ports have recessed sockets that glow when a cable approaches. The entire surface feels like ONE material with controls machined from it - not stickers placed on top.

Is the information density HIGH ENOUGH? Professional users prefer seeing more data. A compact parameter readout with 6 values visible is better than a scrollable list showing 2. A dense block with inline meters is better than a blank rectangle you have to click to inspect.
Do Not


Use glassmorphism, backdrop-blur, or transparency layers (neumorphic shadow depth only)

Use decorative images or stock photography anywhere

Show empty states with illustrations and “get started” messaging (show an example project instead)

Use confirmation dialogs for reversible actions

Use loading spinners longer than 200ms without streaming content

Apply borders heavier than ghost borders (10-15% opacity) - boundaries come from shadows, not lines

Use pure black (#000) or pure white (#FFF) anywhere

Break the 12px minimum text size

Use tooltip delays (show instantly or don’t show at all)

Generate components that “look nice” but don’t do anything - every element must be functional

Use sharp drop shadows on neumorphic elements (all shadows must be soft/diffused, minimum 8px blur)

Make surface tones too far apart (the narrow tonal range is what makes neumorphism work on dark UIs)

Simplify. Density is the goal. Beautiful density. Professional density. Instrument density.