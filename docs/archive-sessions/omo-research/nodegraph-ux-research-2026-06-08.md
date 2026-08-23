# Node-Graph & Matrix-Routing UX Research Brief
### Cutting-edge interaction & visual design patterns for dense, nested node-graph editors
**For:** Element (modular audio plugin host) canvas + side-panel redesign
**Date:** 2026-06-08
**Status:** Research deliverable. Every non-obvious claim is sourced. Each section ends with concrete, opinionated recommendations mapped to Element's locked constraints (dark neumorphic chassis, speed-first, density-is-beauty, expert users, React + @xyflow/react v12).

---

## 0. The locked frame (what every recommendation must respect)

- **Speed of iteration is the supreme metric.** If appearance and speed conflict, speed wins.
- **Information density IS the beauty.** Surface technical depth, don't hide it behind progressive-disclosure walls meant for beginners.
- **North star = Bitwig device panels:** edit a device's controls *on the canvas*, in-place, without opening a separate plugin window.
- **One unified dark neumorphic chassis** — no glass, no blur, no transparency. Controls extruded from / pressed into one continuous surface.
- **Hierarchical graph:** Blocks → Containers (nested sub-graphs) → Modules (logical groupings), breadcrumb-navigable. Cables carry Audio / MIDI / Value-CV.
- **Stack:** React + @xyflow/react (React Flow v12) inside a JUCE WebBrowserComponent.

Owner's motivating feedback (design for THESE):
1. Left browser/inspector panel "not fit for purpose" — redesign.
2. Blocks have "a lot of wasted space" — must be far leaner/denser.
3. Both left (browser) and right (inspector) panels must be **collapsible** for max canvas.
4. Blocks must **never overlap** — clean automatic placement.
5. Latest philosophies for **nested, complex matrix routings**.
6. Default cursor = **SELECT (marquee)**; pan/grab only on a held modifier.

---

## A. On-node / on-canvas direct controls (the Bitwig model)

### How the best-in-class tools do it

**Bitwig Studio — the reference.** All direct interaction with a device happens in the **Device Panel**, an inline horizontal lane at the bottom of the window showing every device on a track. You adjust parameters and modulation routing *in place* without a separate editor; an optional "Expanded Device View" button overlays extra controls/visualisation in the central area, and only *that* can be undocked into a floating window if you choose. The default workflow is in-place. ([Bitwig user guide — The Device Panel](https://www.bitwig.com/userguide/bws44-504/the_device_panel/), [Anatomy of the Bitwig Studio Window](https://www.bitwig.com/userguide/latest/anatomy_of_the_bitwig_studio_window/))

Key Bitwig density mechanics:
- **Device collapse tiers.** A Bitwig device renders at multiple sizes: a *collapsed* state (just the title bar / a few macros), an *expanded* state (full panel of controls), and a "shrink" toggle that hides everything but the macro row. You scale density per-device to taste — the chain stays scannable.
- **Modulation as overlay, not separate UI.** Right-click a modulator, then click any target knob; a coloured ring appears *around the target knob* showing modulation depth. No separate routing window. This is the canonical "edit it where it lives" pattern.
- **The Grid (Bitwig's modular layer)** is a node canvas where modules are compact rectangles with their key control inline on the node face, ports on the left/right edges. ([Bitwig user guide — the_grid](https://www.bitwig.com/userguide/latest/))

**VCV Rack.** Modules are skeuomorphic Eurorack panels with knobs/ports/switches directly on the face. Its panel guide is explicit about density discipline: *"Labels should succinctly state the purpose of knobs, switches, and ports… roughly follow the graphical density and text sizes of VCV modules. Text should be readable at 100% on a non-high-DPI monitor."* The lesson: density is a *governed* property — there is a house standard for label size and component spacing so every module reads at a consistent rhythm. ([VCV Rack Manual — Panel](https://vcvrack.com/manual/Panel))

**Reaktor Blocks vs VCV Rack — a cautionary tale on density.** Community consensus: Reaktor Blocks feels "clunky" because Reaktor was built as a "build-your-own-synth" tool, not a fast patching environment — *"if you create a patch yourself you have access to any knob on any module — that gets out of hand quick."* VCV is preferred because you can "easily see your whole patch." The takeaway for Element: **exposing every parameter on the node face is a failure mode, not a goal.** Curate which controls surface. ([ProducerHive — Reaktor Blocks vs VCV Rack](https://producerhive.com/buyer-guides/vst/reaktor-blocks-vs-vcv-rack/), [MOD WIGGLER thread](https://www.modwiggler.com/forum/viewtopic.php?t=193729))

**Vital / Serum macro panels.** Both expose a small fixed set of **macro knobs** (Vital: 4 assignable macros; Serum: 4 macros) as the "front-of-house" controls, with the full mod matrix one click deeper. The macro row is the lean default; the matrix is the expert deep-dive. This is the two-tier density model in commercial synths.

**Bitwig Grid — auto-wiring + wireless modulation.** Two patterns directly relevant to Element: (1) **dropping a module auto-wires it** — "making common connections preconfigured and wireless"; you don't draw the obvious cable. (2) **A "mod arrow" on a module** (e.g. an LFO) lets you "modulate a dozen different parameters without any wiring" — click the arrow, click targets. Modulation is *not* a cable in the matrix; it's a lightweight overlay. Element already ships auto-cable on drop — extend toward Grid's wireless-modulation arrow for Value/CV. ([Bitwig — The Grid](https://www.bitwig.com/the-grid/), [Grid Modules userguide](https://www.bitwig.com/userguide/latest/grid_modules/))

**Max/MSP — Presentation Mode (a different axis of density).** Max separates the **patching view** (all objects + wires, for building) from a **Presentation Mode** where you hand-place *only the controls that matter* into a clean performance layout — the wiring is hidden, the knobs you exposed are arranged freely. `bpatcher` embeds a subpatch's presentation-mode UI inline in the parent, so a sub-graph shows as a compact custom control panel rather than its raw node graph. This is exactly Element's **Edit Mode vs Perform Mode** split, and the right mental model for it. ([Cycling '74 — presentation mode with subpatchers](https://cycling74.com/forums/presentation-mode-with-subpatchers), [Max bpatcher tutorial](https://docs.cycling74.com/max5/tutorials/max-tut/interfacechapter01.html))

### What makes a node "lean" (the anti-wasted-space spec)

Concrete, sourced numbers and rules for killing wasted space:
- **8px spacing grid, with 4px for tightly-associated elements.** The dominant UI spacing system: every padding/margin/row-height is a multiple of 8 (or 4 for associated items like a knob + its value). Density tools (AG Grid) expose a single `spacing` multiplier so the whole node scales tightness uniformly. ([AG Grid — Theming: Compactness](https://www.ag-grid.com/react-data-grid/theming-compactness/), [UX spacing guide — 8px grid](https://www.uxlab.academy/blogs/the-ultimate-spacing-guide-for-ui-designers))
- **The "internal ≤ external" rule.** An element's inner padding must be ≤ its outer margin. Violating this is the #1 cause of "wasted space" — fat internal padding on a node that already has a margin reads as bloat. Tighten internal padding first. ([Marvel — harmonious spacing](https://marvelapp.com/blog/harmonious-spacing-system-faster-design-dev-handoff/))
- **Fixed header height, independent of font/icon size** (AG Grid `headerHeight`, `headerVerticalPaddingScale`) — a node header should be a fixed compact height (Bitwig device titles are ~18–22px), not auto-grown by content.
- **Configurable pin/control visibility** (vvvv gamma 6.0): the Inspector lets you "configure the visibility of pins in the patch" — i.e. *hide rarely-used ports/controls from the node face* and only show them in the inspector. This is the surgical fix for wasted space: the node face shows the curated few; the inspector holds the rest. ([vvvv gamma 6.0 release — Inspector](https://vvvv.org/blog/2024/vvvv-gamma-6.0-release/))

### How they achieve density without clutter
- **Collapse tiers** (Bitwig device shrink; Blender node collapse) — the single most reused mechanism.
- **Value-on-knob** — the current value is drawn *inside or under* the knob, not in a separate label column (Bitwig, Ableton, every modern synth). Saves a whole column of width.
- **Hover-reveal** — secondary controls/labels appear only on hover (Blender, n8n action buttons).
- **Micro-meters** — a 2–4px signal meter integrated into the node edge or title bar rather than a dedicated meter widget (Bitwig track headers, Ableton device on/off LEDs).
- **One curated control row** — surface only the 2–6 most-tweaked params; everything else lives in the inspector or an expanded tier.

### → For Element
1. **Three explicit collapse tiers per Block, toggled on the node, persisted in the graph** (you already shipped `elementNodeSetCollapsed` — extend it to a 3-state enum): **(a) Title-only** (name + signal-coloured activity bar + I/O port stubs, ~28px tall); **(b) Macro row** (title + 4–6 curated knobs/value-on-knob, the lean default — mirrors Bitwig's shrunk device and Vital/Serum's 4-macro front); **(c) Expanded** (full curated control surface, Bitwig "Expanded Device View"). Double-click the title bar cycles tiers; tier is per-Block state.
2. **Value-on-knob, always.** Draw the numeric value inside the knob ring (neumorphic inset) — never a separate label column. This is how Bitwig/Ableton/Vital reclaim horizontal space and is the highest-density-per-pixel win.
3. **Modulation as an on-target ring overlay, not a routing window.** Adopt Bitwig's gesture: select a Value/CV source, click a target knob, draw a coloured arc around that knob = depth. Keeps "edit where it lives" and avoids a matrix popup for the common case.
4. **Govern density with a house spec** (VCV's lesson): one knob diameter, one label type-size, one port pitch, one row height — documented as design tokens so every Block reads at the same rhythm. Density without a grid spec becomes Reaktor-clunky.
5. **Curate, don't dump.** Default Block face shows only the most-tweaked parameters (data-drive this from your `PluginUsageTracker` / param-touch frequency later). The mod matrix / full param list is the inspector's job, not the node face.

---

## B. Dense node-graph editors (general patterns)

### Node anatomy: header / body / port-lanes

The near-universal convention across Blender, Unreal, Houdini, Nuke, TouchDesigner, n8n:
- **Header** = coloured/typed strip with the node name + a category colour. (Element already does gradient header + 4-category colour — keep.)
- **Body** = inline controls (synth knobs) or a data viewer (TouchDesigner viewer flag).
- **Port lanes** = inputs on one edge, outputs on the other. Blender/Unreal/Houdini put labelled sockets in vertical lanes; audio tools (Bitwig Grid, VCV) put them left→right to match signal flow.

**TouchDesigner "flags".** State indicators (Bypass, Display, Lock, Viewer-active) live as tiny toggles on the **left and bottom edges of the node** rather than inside the body — so state is glanceable without consuming body real estate, and a node can be a pure data viewer. `a` toggles viewer-active on all selected nodes. Crucially for a real-time host: TouchDesigner's #1 perf tip is *"turn off the viewers on any Operators that don't need to be monitored"* — live visualisation on every node is a performance cost. ([TouchDesigner — Flag](https://docs.derivative.ca/Flag), [Network Editor](https://derivative.ca/UserGuide/Network_Editor), [Viewer Active](https://docs.derivative.ca/Viewer_Active))

### Port grouping & many-to-many (matrix) routing

- **Collapsed-panel sockets stay routable.** Blender's standout pattern: when a node panel is collapsed but has links connected to its sockets, *the sockets aren't drawn — the link lines lead behind the node*, and you can still cut/reroute them. So collapsing a node never orphans its cables. ([Blender geometry-nodes workshop, May 2024](https://code.blender.org/2024/05/geometry-nodes-workshop-may-2024/))
- **Sub-panels / nested sockets** with a darker background group related ports (Blender's "panel/column/row" layout system, 2024–25 rework). ([Blender Node Groups manual](https://docs.blender.org/manual/en/latest/interface/controls/nodes/groups.html))
- **Reroute knots** (Unreal "Add Reroute Node", Blender reroute, Element already has `RerouteNode`): a 1-in/1-out pass-through dot you drop on a cable to bend it cleanly around other nodes. Unreal renders custom 1-in/1-out nodes *as a knot* via `DrawNodeAsVariable`. Essential for keeping matrix routing legible. ([Unreal — custom Blueprint nodes](https://unrealist.org/custom-blueprint-nodes/), [Epic forums — reroute node](https://forums.unrealengine.com/t/blueprints-add-a-reroute-node-to-help-keep-the-layout-cleaner/4097))
- **Edge bundling / bus routing for complete sub-graphs.** Where many nodes connect many-to-many, graph-drawing literature uses **bus-style orthogonal routing** — a shared backbone segment ("bus") that individual short stubs tap into — and **edge bundling**, which routes related edges along shared paths to concentrate density and open white space. This is the formal answer to "matrix routing looks like spaghetti." ([yEd polyline edge router](https://yed.yworks.com/support/manual/layout/router_polyline.html), [Edge Routing with Ordered Bundles, arXiv](https://arxiv.org/pdf/1209.4227), [edgebundle algorithms](https://schochastics.github.io/edgebundle/))

### Multi-cable fan-out from one port

A single output port commonly fans out to many inputs. Best practice (Blender, Unreal, Nuke): one port emits N edges with no extra UI; the *visual* problem is solved at the routing layer (bundling/reroutes), not by limiting connections. n8n and Node-RED draw the fan-out as smooth bezier splines that separate at the source.

### Minimaps & auto-layout

- **Minimap** for large graphs is standard (React Flow ships `<MiniMap/>`; Blender, Houdini overview). Element already has a minimap concept.
- **Auto-layout**: the dominant engines are **Dagre** and **ELK (Eclipse Layout Kernel)**; React Flow's official examples use both for directed layered layouts. ELK is more powerful (orthogonal routing, port constraints, nested/hierarchical layout) but heavier; Dagre is fast and simple for DAGs. ([React Flow — Dagre layout example](https://reactflow.dev/examples/layout/dagre), [ELK layout example](https://reactflow.dev/examples/layout/elkjs))

### → For Element
1. **Move Block state-toggles to the node edge as "flags" (TouchDesigner model):** bypass, mute/solo, and a "live-meter on/off" toggle as 8–10px controls on the Block's bottom/left edge — not inside the body. This frees the body for controls and lets a Block become a pure meter when wanted. Tie "live-meter off" to a real CPU saving (don't run the meter when hidden) — directly serves speed-first.
2. **Adopt Blender's collapsed-socket rule:** when a Block collapses to Title-only, do **not** drop its cables — route them *into the collapsed node's edge* (or to a thin port stub) so connections survive collapse. This is the make-or-break detail that lets dense graphs collapse without breaking topology.
3. **Make `RerouteNode` a first-class cable gesture, drawn as a small neumorphic knot.** Drag off a port → "Add Reroute"; double-click a cable → drop a reroute at the cursor. This is your manual antidote to matrix spaghetti before you invest in auto-routing.
4. **For true matrix sections, offer an orthogonal "bus" routing mode** (toggle per Container) using ELK's orthogonal router — many-to-many becomes a clean bus with stubs instead of crossing beziers. Keep bezier as the default for sparse graphs (it reads as "signal flow"), switch to orthogonal-bundled when edge density crosses a threshold.
5. **Auto-layout = ELK, not just Dagre.** Element's hierarchy (Containers/Modules) + port constraints + need for orthogonal routing all favour ELK; Dagre can't do nested/port-constrained layout. Run it for the "Tidy" action you already ship.

---

## C. Nested / hierarchical graphs (Containers, Modules, dive-in/out)

### Group-selection-into-a-node — the gesture + the keybinding

This is a *core expert gesture* and the keybinding convention is remarkably consistent:
- **Unreal Blueprints:** marquee or Ctrl+click to select → right-click → **"Collapse Nodes"** creates a sub-graph node with auto-generated inputs/outputs; you dive in to edit. ([Unreal — Nodes / Collapse Nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine))
- **Houdini:** select → **collapse into subnetwork**; subnet node carries up to 4 inputs routed to special internal input nodes. Houdini also distinguishes **network boxes** (visual grouping, *doesn't* encapsulate — like a comment frame you can minimise) from **subnetworks** (true encapsulation into one node). ([Houdini — Organizing nodes](https://www.sidefx.com/docs/houdini/network/organize.html))
- **Blender:** select → **Ctrl+G** = "Make Group" (group selection into a node group); **Tab** dives into / out of the group; Ctrl+Alt+G ungroups. This Ctrl+G convention is shared with many DCC tools.
- **Max/MSP:** select → **encapsulate** (turns selection into a `patcher` subpatch); the inverse is "de-encapsulate."

The two-concept split (lightweight visual group vs. true encapsulated sub-graph) appears in *every* mature tool — exactly Element's **Module** (logical grouping label) vs **Container** (nested Board) distinction. That is the correct, validated model.

### Breadcrumb + dive-in/out navigation

- Houdini shows a **path breadcrumb** at the top of the network editor (`/obj/geo1/`), explicitly likening it to OS file-path breadcrumbs; **Enter / `i`** to dive *in*, **`u`** to go *up*. ([Houdini — Network navigation](https://www.sidefx.com/docs/houdini/network/navigate.html))
- Blender uses **Tab** to dive in/out of a group.
- Element already uses double-click-Block = dive in, double-click-canvas = up — keep, but add the breadcrumb as the always-visible "where am I."

### Showing what's inside a collapsed container at a glance

- Unreal/Houdini collapsed subnet nodes **expose auto-generated input/output pins** matching the internal connections — so the boundary signals what crosses it.
- Blender's collapsed panels route hidden links *behind* the node (above) — the cable count entering/leaving still reads.
- Bitwig nested device chains show a **mini preview** of the contained chain.
- Best emerging pattern: a **thumbnail / mini-map glyph** baked into the collapsed container face (a tiny rendering of the inner topology), plus an I/O signature (e.g. "2 in · 1 out · 3 blocks").

### → For Element
1. **Bind group-into-Container to Cmd/Ctrl+G** (you already have Cmd+Shift+D for group-into-Container — *also* accept Cmd+G as the industry-standard alias; expert muscle memory from Blender/DCC tools is Ctrl+G). Keep marquee-select → right-click → "Group into Container" as the discoverable path (Unreal model).
2. **Always-visible breadcrumb path** at the top of the canvas (`Project / Module / Container`), clickable to jump levels (Houdini model). Pair with `Esc` = up one level (you have double-click-canvas; add Esc as the keyboard twin of Houdini's `u`).
3. **Collapsed Container face = I/O signature + topology glyph.** Show auto-generated boundary ports (Unreal), an I/O count badge ("2▸1, 3 blocks"), and a tiny neumorphic-inset thumbnail of the inner graph. This makes a collapsed Container self-describing without diving in.
4. **Preserve the Module vs Container split exactly** — it matches every mature tool's "visual group vs. encapsulated subgraph" dichotomy (Houdini network-box vs subnet; Blender frame vs group). Don't merge them. Module = frame/label (cables pass through visually), Container = encapsulation (cables cross a boundary port).
5. **Dive transition = 150ms zoom-to-fit into the child** (you already target 150ms). On dive-up, restore the parent viewport exactly (remember per-level viewport state — Figma/Blender both restore prior pan/zoom).

---

## D. Collapsible / adaptive side panels (pro creative tools)

### How the best tools collapse panels

- **Figma** — `Shift+\` minimises/expands both side panels; **the right (properties) panel auto-expands when an object is selected and auto-minimises when you deselect** — so the inspector only takes space when it has something to show. `Ctrl+.` (or `Cmd+.`) hides *all* UI for a clean canvas (presentation). ([Figma Forum — show/hide UI](https://forum.figma.com/t/keyboard-shortcut-show-hide-panel-width-french-keybord/1611), [Frames X — Figma shortcuts](https://framesxdesign.com/figma-shortcuts))
- **VS Code** — `Cmd/Ctrl+B` toggles the Primary Side Bar; the **Activity Bar is a permanent icon rail** that stays when the sidebar content collapses, so you can re-open any panel with one click; `Cmd/Ctrl+Shift+E/F/...` jump straight to a specific panel (Explorer/Search). The icon-rail-survives-collapse pattern is the key idea: collapsing hides *content*, not *access*. ([VS Code — User interface](https://code.visualstudio.com/docs/getstarted/userinterface), [bobbyhadz — hide sidebar](https://bobbyhadz.com/blog/vscode-show-hide-sidebar))
- **Ableton Live 12** — clip and device views toggle **independently** (`Opt+Cmd+3` / `Opt+Cmd+4`), a deliberate 2024 change from one combined shortcut — expert users want per-panel control, not all-or-nothing. ([Ableton — Navigation and View Options in Live 12 FAQ](https://help.ableton.com/hc/en-us/articles/12243771208092-Navigation-and-View-Options-in-Live-12-FAQ))
- **Bitwig** — panels (Inspector, Browser, Device) each have a dedicated toggle and remember their width; the Inspector is a single left strip that re-contextualises to the current selection.
- **Blender** — the **N-panel** (`N`) and **T-toolbar** (`T`) toggle independently per editor; regions collapse to a thin arrow tab you click to re-expand.

### The recurring principles
1. **Collapse content, keep access.** Always leave a thin icon-rail (VS Code Activity Bar) so re-opening is one click — never make the user hunt a menu.
2. **Independent toggles per panel** (Ableton 12, Blender) — not one master switch.
3. **Selection-driven auto-reveal** (Figma) — inspector appears when there's a selection, hides when there isn't.
4. **Remember width + state** per panel, per project.
5. **A "hide everything" key** for max-canvas / performance moments (Figma `Cmd+.`).

### → For Element
1. **Collapse to an icon-rail, never to nothing.** When the left browser collapses, leave a ~40px neumorphic rail with the section icons (Plugins / Snippets / Project) — one click re-expands. Same for the right inspector (icons: Block / Container / Board). This is the VS Code Activity Bar pattern and it's the single most important "lean but reachable" move. Satisfies owner-feedback #3 without burying access.
2. **Independent toggles + keybindings:** `Cmd+\` toggles the left browser, `Cmd+Opt+\` toggles the right inspector, and a `Cmd+.` "hide all panels → full-bleed canvas" for performance/flow (Figma's presentation key). Do **not** use one combined toggle (Ableton learned this and split it).
3. **Selection-driven inspector (Figma model):** when nothing is selected, the right inspector auto-collapses to its icon-rail; selecting a Block auto-expands it to that Block's params. This is the highest-leverage way to maximise canvas "when panels aren't needed" — it's automatic, not a chore.
4. **Persist panel width + collapsed-state per project** (you already persist collapse for Blocks — extend the same mechanism to panels).
5. **Drag-to-resize with a snap-to-collapse threshold:** dragging a panel narrower than ~120px snaps it to the icon-rail (tldraw/Figma-style), so collapse is also a fluid drag gesture, not only a keypress.

---

## E. Browser / inspector panels for large plugin libraries

### Search-first + faceted filtering — how the leaders do it

- **Bitwig browser** — a persistent **Favorites filter (hollow star)**; a **File Kind filter** to isolate result types; **Sort Order** with *"Date — most recently touched first"* as an option; **Collections** (user-defined groups incl. Favorites); user-extensible **metadata tags**. The browser is column-based and filter-driven. ([Bitwig — Common Browser Elements](https://www.bitwig.com/userguide/latest/common_browser_elements/), [Browsers in Bitwig Studio](https://www.bitwig.com/userguide/latest/browsers/))
- **Ableton Live 12 browser** — **color-coded Collections** assignable via context menu or **number keys 1–7**; clicking a Collection label filters to that colour; a built-in **Favorites** tag; sidebar split into Collections / Library / Places. Live 12 added **Sound Similarity search** and tag-based filtering. ([Ableton — Working with the Browser, v12](https://www.ableton.com/en/live-manual/12/working-with-the-browser/), [The Live 12 Browser](https://help.ableton.com/hc/en-us/articles/12927340213660-The-Live-12-Browser))
- **Note the failure mode:** Bitwig 5's browser redesign drew sustained "it's a mess" community criticism — over-faceting and column overload can *hurt* speed. Lesson: search box first, facets as optional refinements, not a wall of columns. ([KVR — Bitwig 5 browser is a mess](https://www.kvraudio.com/forum/viewtopic.php?t=599738&start=45))

### Virtualization (large lists)

For thousands of plugins, the React standard is **list virtualization** — render only visible rows. `@tanstack/react-virtual` (TanStack Virtual) is the current best-in-class headless virtualizer; `react-window`/`react-virtuoso` are alternatives. You already virtualize the sidebar (per your notes) — keep it; this is mandatory for a large library to stay at 60fps. ([TanStack Virtual docs](https://tanstack.com/virtual/latest))

### The inspector as the "everything else" surface + pin-visibility control

- **vvvv gamma 6.0's Inspector (`Ctrl+I`)** gives "an overview of all the pins of a selected node, where inputs can be manipulated **and the visibility of pins in the patch can be configured**." This is the model: the inspector is the full parameter list *and* the control for what surfaces on the node face. ([vvvv gamma 6.0 release](https://vvvv.org/blog/2024/vvvv-gamma-6.0-release/))
- **Origami Studio** confirms the inputs-left / outputs-right convention and that the inspector *drives* node behaviour: "patch outputs can be connected to layer properties in the Inspector," and clicking a property in the inspector spawns the corresponding patch. The inspector and the canvas are two views of one model. ([Origami — Patches](https://origami.design/documentation/patch-editor/patches), [Origami — Canvas](https://origami.design/documentation/canvas/canvas))
- **Bitwig/Ableton inspector = re-contextualising single strip.** One inspector that swaps its contents to the current selection (Block / Container / Board), rather than separate tabbed panels — fewer clicks, less chrome.

### Selected-item naming must match the canvas

A recurring pro-tool rule: **the name shown in the browser/inspector for the selected item must be identical to the name on the node/device on the canvas.** Bitwig and Ableton both show the device's display name in the inspector header matching the device title bar; mismatches (e.g. showing a VST's internal ID in one place and a friendly alias in another) are a known confusion source. You already did "names-not-descriptions" + alias-aware dedupe — extend that so the inspector header for a selected Block is byte-identical to the Block's title on the canvas.

### → For Element
1. **Search box first, full-width, auto-focused** on panel open (you rebuilt QuickAdd two-pane — apply the same to the browser). Indexed/fuzzy search (you measured 12.8→2.7ms — keep). Facets (Format / Category / Vendor) are *secondary chips* below the search, not a column wall — avoid Bitwig 5's over-faceting.
2. **Favorites (star) + Recents + Collections, all as one-key filters.** Steal Ableton's **number-key 1–7 colour Collections** for power users and Bitwig's **hollow-star favorites toggle**. Recently-used should default-sort "most recent first" (Bitwig). You already track usage via `PluginUsageTracker` — surface it as a Recents facet.
3. **Virtualize the result list** (TanStack Virtual) and render rows at one fixed height with the 4-category shape+colour glyph inline — so the browser visually rhymes with the canvas Blocks.
4. **Inspector header = the exact Block name on canvas.** Enforce mechanically (a test): selected-Block inspector title string === canvas Block title string. Closes owner-feedback that the panel is "not fit for purpose" — half of "fit for purpose" is *coherence* with the canvas.
5. **Two-pane browser (category rail | results)** like your QuickAdd, and like Ableton's sidebar+content split — the left rail is the facet/Collection selector, the right pane is the virtualized search result. Keep it dense: small fixed rows, no thumbnails-by-default (thumbnails kill density and scroll perf).
6. **Inspector owns "what shows on the Block face" (vvvv gamma model).** Give the inspector a per-parameter "pin to node face" toggle so the expert curates their own lean Block — the inspector is the full param list, the node face is the chosen subset. This is the single cleanest answer to both "panel not fit for purpose" (#1) and "wasted space on blocks" (#2): the inspector becomes the density-control surface, not just a read-out.
7. **One re-contextualising inspector strip, not many tabs** (Bitwig/Ableton). The right panel shows the current selection's params; selecting a Container shows Container props; nothing selected → collapses to icon-rail (Figma). Avoid a tab bar of Block/Graph/etc. that costs a click each.

---

## F. Modern canvas interaction defaults (select-vs-pan, marquee, gestures)

### The current best practice (and it's a strong consensus)

The modern design-tool convention — **Figma, FigJam, Excalidraw, tldraw** all share it:
- **Default tool = Select.** A click-drag on empty canvas draws a **marquee** (rubber-band) selection.
- **Pan = hold Space + drag** (turns the cursor into a hand), *or* middle-mouse drag, *or* two-finger trackpad scroll. tldraw explicitly brought **inertial glide** to spacebar and middle-mouse panning so it feels like the hand tool. ([tldraw — Tools docs](https://tldraw.dev/docs/tools), [tldraw release notes 2023-02-10](https://tldraw.dev/blog/release-notes/release-notes-20230210))
- **Global panning state:** "Many whiteboard applications, such as Excalidraw and FigJam, use a **global panning state when the spacebar or the middle mouse button is pressed**, which allows you to make canvas adjustments regardless of what tool you're currently using." This is the exact behaviour to copy. ([tldraw issue #318](https://github.com/tldraw/tldraw-v1/issues/318), [tldraw issue #1254](https://github.com/tldraw/tldraw/issues/1254))
- **Zoom = Cmd/Ctrl + scroll** (or pinch); plain scroll pans.
- **Multi-select** = Shift+click (additive) and Shift+marquee.

### React Flow v12 — the exact configuration (this is the load-bearing part)

React Flow's **documented defaults are the OPPOSITE of what Element wants** — so you must explicitly flip them:

| Prop | React Flow **default** | Element should set |
|------|------------------------|--------------------|
| `panOnDrag` | **`true`** (drag pans) | **`false`** (drag selects) |
| `selectionOnDrag` | **`false`** | **`true`** (marquee on drag) |
| `panOnScroll` | **`false`** | **`true`** (scroll pans) |
| `zoomOnScroll` | **`true`** | **`false`** (scroll pans, not zooms) |
| `zoomOnPinch` | `true` | `true` (keep pinch-zoom) |
| `selectionMode` | `'full'` | `'partial'` (touch-to-select; see below) |
| `selectionKeyCode` | `'Shift'` | `'Shift'` (keep) |
| `panActivationKeyCode` | `'Space'` | `'Space'` (keep — Space+drag pans) |
| `multiSelectionKeyCode` | `'Meta'`(mac)/`'Control'` | keep |

Sources for defaults: [React Flow — `<ReactFlow>` API reference](https://reactflow.dev/api-reference/react-flow), [Panning and Zooming](https://reactflow.dev/learn/concepts/the-viewport), [Interaction Props example](https://reactflow.dev/examples/interaction/interaction-props).

The canonical "design-tool preset" React Flow itself documents:
```jsx
<ReactFlow
  panOnScroll          // scroll pans
  selectionOnDrag      // drag = marquee select
  panOnDrag={false}    // drag does NOT pan
  selectionMode={SelectionMode.Partial}  // node included if marquee touches it
  zoomOnScroll={false} // Cmd+scroll zooms instead
/>
```
With `selectionOnDrag` + `panOnDrag={false}`, React Flow keeps panning available via **Space+drag, middle-mouse, and right-mouse drag** — exactly the Figma/tldraw global-pan model. ([Panning and Zooming](https://reactflow.dev/learn/concepts/the-viewport))

> ⚠️ **Known gotcha:** `selectionOnDrag` + `panOnDrag={false}` has an open issue where pane `onMouseDown`-type events can be swallowed by the selection layer — test your right-click QuickAdd and empty-canvas double-click still fire. ([xyflow issue #5563](https://github.com/xyflow/xyflow/issues/5563))

`SelectionMode.Partial` means a node joins the selection if the marquee merely *touches* it (vs `'full'` requiring full containment) — faster for expert lasso-grabbing. ([SelectionMode docs](https://reactflow.dev/api-reference/types/pan-on-scroll-mode))

### Trackpad

On macOS (Element's primary platform), two-finger scroll should **pan** and pinch should **zoom** — `panOnScroll` + `zoomOnPinch` gives exactly this. Avoid the default where two-finger scroll zooms; expert macOS users expect scroll-to-pan in a canvas.

### → For Element
1. **Ship the design-tool preset verbatim:** `selectionOnDrag`, `panOnDrag={false}`, `panOnScroll`, `zoomOnScroll={false}`, `zoomOnPinch`, `selectionMode={SelectionMode.Partial}`. This *is* owner-feedback #6 (select-default, pan-on-modifier) and React Flow supports it natively — no custom code. This single change has the highest UX-per-effort ratio in the whole brief.
2. **Space+drag = pan (hand cursor), middle-mouse = pan, right-mouse = pan** — keep all three as the modifier-pan paths (React Flow provides them automatically once `panOnDrag={false}` + `selectionOnDrag`). Add inertial glide if cheap (tldraw parity) — but speed-first, so it's optional polish.
3. **Two-finger trackpad pans, pinch zooms** (mac-native). Plain wheel pans; `Cmd+wheel` zooms.
4. **Guard the regressions:** explicitly test that right-click→QuickAdd and double-click-empty-canvas→navigate-up still fire under `selectionOnDrag` (xyflow #5563). Add a vitest/interaction-test so the preset can't silently break these.
5. **Shift+click and Shift+marquee are additive** (owner's prior QA flagged shift+click wasn't additive). `multiSelectionKeyCode` + `selectionKeyCode` both default to Shift/Meta — wire them so Shift extends the current selection rather than replacing it.

---

## G. Blocks must NEVER overlap — clean automatic placement

### How React Flow / the ecosystem solves it

Three complementary techniques (use together):
1. **On-drag-stop collision resolution.** React Flow's official *Node Collisions* example runs a `resolveCollisions(nodes, { overlapThreshold: 0.5, margin: 15, maxIterations })` on `onNodeDragStop` — after you drop a node, overlapping neighbours are nudged apart with a margin. ([React Flow — Node Collisions example](https://reactflow.dev/examples/layout/node-collisions))
2. **Intersection helpers for live feedback.** `getIntersectingNodes(node, partially)` (from `useReactFlow()`) returns nodes the dragged node overlaps; `getNodesBounds(nodes)` returns a bounding box; `getViewportForBounds` fits them. Use `getIntersectingNodes` *during* drag to highlight a would-be collision (red glow), then resolve on drop. ([React Flow — Intersections example](https://reactflow.dev/examples/nodes/intersections), [getNodesBounds](https://reactflow.dev/api-reference/utils/get-nodes-bounds), [useReactFlow](https://reactflow.dev/api-reference/hooks/use-react-flow))
3. **d3-force with a *rectangular* collide force for auto-placement.** Newly-added nodes never overlap existing ones via d3-force; but note **d3's built-in `forceCollide` assumes circular nodes** — React Flow's force-layout example ships a custom `collision.js` that does the same for **rectangles**. Use this for the "drop a new Block / auto-place" path. ([React Flow — Force Layout example](https://reactflow.dev/examples/layout/force-layout), [d3-force collide](https://d3js.org/d3-force/collide))

### Spawn-position (you flagged this as a defect)

New Blocks should spawn at a **deterministic, non-overlapping** spot: place at cursor (QuickAdd) or to the right of the selected Block's output, then run one collision-resolve pass so it can't land on an existing node. Origami/Blender place new nodes offset from the source by a fixed delta then nudge if occupied.

### → For Element
1. **Collision-resolve on drag-stop** (React Flow's `resolveCollisions`, `margin:15`) — guarantees no overlap *after* a manual move, with a clean gutter. Cheap, native pattern, satisfies owner-feedback #4 directly.
2. **Live collision glow during drag** via `getIntersectingNodes(node, true)` — red 4px micro-glow (you already have the glow primitive) on a node being overlapped; resolves on drop. Gives the expert immediate spatial feedback without blocking the drag.
3. **Auto-place new Blocks with the rectangular collide force** (React Flow's `collision.js`, not raw d3 `forceCollide` — your Blocks are rectangles, and at multiple collapse-tier heights). Spawn at cursor/output-of-selection, then one resolve pass. Fixes the spawn-position defect.
4. **Your "Tidy" (ELK auto-layout) is the global non-overlap guarantee** — ELK's layered layout never overlaps and respects port order + nesting. Keep Tidy ON-by-default (you shipped this) with glide + hysteresis auto-fit. ELK is the structural answer; collision-resolve is the per-drag answer; use both.
5. **Snap-to-grid as a cheap overlap-avoider + alignment aid.** React Flow's `snapToGrid` + `snapGrid={[gx,gy]}` quantises positions so Blocks line up and gutters stay uniform; combine with collision-resolve. (Toggleable — experts sometimes want free placement.)

---

## H. Cross-cutting: cables for 3 signal types (Audio / MIDI / Value-CV)

Element already has bezier cables + plugs + arrowheads + the 3 signal colours (Audio `#4A90D9`, MIDI `#2BC4C4`, Value/CV `#E8A838`). Sourced best practice to layer on:
- **Line *style* should encode flow type, not just colour** (colour-blind safety, density legibility): solid vs dashed vs dotted differentiates signal classes even at small zoom. React Flow: "solid, dashed, or curved lines help indicate flow type." Element's 4-category shapes already do this for Blocks — extend the same belt-and-braces (colour + style) to cables. ([React Flow — animating edges](https://reactflow.dev/examples/edges/animating-edges), [Synergy Codes — React Flow guide](https://www.synergycodes.com/blog/react-flow-everything-you-need-to-know))
- **Animated travel = live data, reserved.** React Flow's built-in `animated` edge (marching dashes) and the advanced Web-Animations-API technique (a dot riding `offsetPath`/`offsetDistance` along the cable) can show *active* signal. Speed-first caveat: animate **only active/selected cables**, never all — per your perf wave, idle animation is a CPU sink. Use animation as a *probe* (hover/select a cable → it pulses) not a permanent state. ([React Flow — animating edges](https://reactflow.dev/examples/edges/animating-edges))
- **Direction via arrowheads/plugs** (you have these) — React Flow markers. Keep.
- **Node status as a ring, not a badge:** React Flow ships a `<NodeStatusIndicator>` (loading/success/error ring around the node) — useful for a Block that's erroring/bypassed without consuming body space. ([React Flow UI — Node Status Indicator](https://reactflow.dev/ui/components/node-status-indicator))

→ **For Element:** add a line-style axis to the 3 signal colours (e.g. Audio solid, MIDI dashed, Value/CV dotted) so cable type survives at low zoom and for colour-blind users; reserve cable animation for hover/selected/probe only (speed-first); use a status ring for Block error/bypass state.

---

## TOP 10 highest-leverage moves (ranked)

Ranked by UX-impact ÷ implementation-cost, respecting all locked constraints.

1. **Ship React Flow's design-tool interaction preset verbatim** — `selectionOnDrag`, `panOnDrag={false}`, `panOnScroll`, `zoomOnScroll={false}`, `selectionMode={SelectionMode.Partial}`, Space/middle/right-drag to pan. Native, ~10 lines, *is* owner-feedback #6, and flips React Flow's defaults (which are the opposite). Highest impact-per-effort in the brief. (§F)
2. **Three persisted collapse tiers per Block** — Title-only / Macro-row (lean default) / Expanded; double-click title cycles. Bitwig+Vital+Serum model; extends your existing `elementNodeSetCollapsed`. Directly kills "wasted space" (#2) while preserving density-on-demand. (§A)
3. **Collapse panels to an icon-rail, never to nothing; selection-driven inspector** — left browser → 40px icon rail; right inspector auto-expands on Block-select, auto-collapses on deselect (Figma) + `Cmd+\` / `Cmd+Opt+\` / `Cmd+.` toggles. Satisfies #3 (collapsible, lean) without burying access (VS Code Activity Bar). (§D)
4. **No-overlap = collision-resolve on drag-stop + rectangular collide force for auto-place** — React Flow `resolveCollisions({margin:15})` on `onNodeDragStop`; `getIntersectingNodes` red-glow during drag; ELK "Tidy" as the global guarantee. Directly satisfies #4 and fixes the spawn-position defect. (§G)
5. **Value-on-knob + 8px/4px density grid + fixed-height headers** — draw values inside knob rings, kill a label column; enforce internal ≤ external padding; fixed ~20px headers. The concrete anti-wasted-space spec (#2). (§A, §B)
6. **Inspector becomes the density-control surface (vvvv gamma model)** — per-param "pin to node face" toggle; one re-contextualising strip (not tabs); header name byte-identical to the canvas Block name. Re-purposes "panel not fit for purpose" (#1) into the tool that *governs* node leanness. (§E)
7. **Move Block state to edge "flags" (TouchDesigner) + tie live-meter to real CPU cost** — bypass/mute/meter-on-off as edge toggles, freeing the body; don't run a meter that's hidden. Density + speed-first in one. (§B)
8. **Matrix routing: reroute knots now, orthogonal "bus" routing mode + edge bundling for dense Containers** — make `RerouteNode` a first-class cable gesture; add an ELK orthogonal-bus mode toggled per-Container when edge density is high; keep bezier for sparse graphs. The cutting-edge answer to "nested complex matrix routings" (#5). (§B)
8.5 *(tie)* **Wireless modulation arrow for Value/CV (Bitwig Grid)** — modulate many params from one source without drawing matrix cables; on-target depth ring (Bitwig). Keeps the matrix from becoming spaghetti. (§A)
9. **Always-visible clickable breadcrumb + `Cmd/Ctrl+G` group-into-Container + collapsed-Container I/O signature** — Houdini path bar + Esc=up; Blender/Unreal grouping convention; collapsed Containers show "2▸1, 3 blocks" + topology glyph + boundary ports. Nails hierarchical navigation (#5). (§C)
10. **Search-first browser: auto-focused fuzzy search, facets as chips, Favorites-star + number-key Collections + Recents, virtualized fixed rows** — Bitwig+Ableton browser patterns, TanStack Virtual; avoid Bitwig 5's over-faceting. Rebuilds the "not fit for purpose" left panel (#1). (§E)

---

## Anti-patterns to avoid

- **Expose-every-parameter-on-the-node.** The Reaktor-Blocks failure: "access to any knob on any module — gets out of hand quick." Curate; the inspector holds the rest. ([source](https://producerhive.com/buyer-guides/vst/reaktor-blocks-vs-vcv-rack/))
- **Over-faceted browser / column wall.** Bitwig 5's redesign drew sustained "it's a mess" backlash. Search box first; facets are optional chips. ([source](https://www.kvraudio.com/forum/viewtopic.php?t=599738&start=45))
- **Collapse that hides *access*, not just content.** Never collapse a panel to nothing — always leave the icon-rail (VS Code). Never make re-opening a menu hunt.
- **One master "toggle all panels" key.** Ableton deliberately split it in Live 12 — experts want per-panel control. Keep independent toggles (plus one optional hide-all for performance).
- **Collapsing a node that orphans its cables.** Blender routes links behind a collapsed node so they survive. Element must never drop cables on collapse.
- **Animating every cable / running every meter all the time.** Per Element's own perf wave + TouchDesigner's #1 tip ("turn off viewers you don't need"). Idle animation/metering is a CPU sink — make it probe-on-demand. ([source](https://docs.derivative.ca/Viewer_Active))
- **Fat internal padding.** Violating "internal ≤ external" is the literal definition of wasted space. Tighten inner padding before anything else. ([source](https://marvelapp.com/blog/harmonious-spacing-system-faster-design-dev-handoff/))
- **Pan-on-drag default (React Flow's out-of-box).** It fights expert marquee-select muscle memory from Figma/tldraw. Flip it. ([source](https://reactflow.dev/api-reference/react-flow))
- **Inspector name ≠ canvas name.** Showing a VST's internal ID in one place and a friendly alias in another is a known confusion source. Enforce identity mechanically.
- **Auto-zoom-tiers / mode-switching colour gimmicks.** Already killed in Element (zoom-morph dead); don't reintroduce. Density is governed by explicit collapse tiers the expert controls, not automatic LOD that surprises them.

---

## Source index (primary)

**Audio / modular:** Bitwig user guide ([Device Panel](https://www.bitwig.com/userguide/bws44-504/the_device_panel/), [The Grid](https://www.bitwig.com/the-grid/), [Browsers](https://www.bitwig.com/userguide/latest/browsers/)); VCV Rack ([Panel guide](https://vcvrack.com/manual/Panel)); Ableton ([Live 12 Browser](https://help.ableton.com/hc/en-us/articles/12927340213660-The-Live-12-Browser), [Instruments & Effects](https://www.ableton.com/en/manual/working-with-instruments-and-effects/)); Reaktor vs VCV ([ProducerHive](https://producerhive.com/buyer-guides/vst/reaktor-blocks-vs-vcv-rack/)); Max/MSP ([presentation mode](https://cycling74.com/forums/presentation-mode-with-subpatchers), [bpatcher tutorial](https://docs.cycling74.com/max5/tutorials/max-tut/interfacechapter01.html)).
**Node-graph DCC tools:** Blender ([geometry-nodes workshop 2024](https://code.blender.org/2024/05/geometry-nodes-workshop-may-2024/), [Node Groups](https://docs.blender.org/manual/en/latest/interface/controls/nodes/groups.html)); Unreal ([Nodes/Collapse](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine), [custom nodes](https://unrealist.org/custom-blueprint-nodes/)); Houdini ([navigate](https://www.sidefx.com/docs/houdini/network/navigate.html), [organize](https://www.sidefx.com/docs/houdini/network/organize.html)); TouchDesigner ([Flag](https://docs.derivative.ca/Flag), [Network Editor](https://derivative.ca/UserGuide/Network_Editor)); vvvv gamma ([6.0 Inspector](https://vvvv.org/blog/2024/vvvv-gamma-6.0-release/)); Cables.gl ([cdm.link](https://cdm.link/cables-gl-open-offline/)); Origami ([Patches](https://origami.design/documentation/patch-editor/patches)); n8n ([Node UI design](https://docs.n8n.io/integrations/creating-nodes/plan/node-ui-design/)).
**Canvas / panels / layout:** React Flow ([viewport](https://reactflow.dev/learn/concepts/the-viewport), [API ref](https://reactflow.dev/api-reference/react-flow), [node collisions](https://reactflow.dev/examples/layout/node-collisions), [force layout](https://reactflow.dev/examples/layout/force-layout), [intersections](https://reactflow.dev/examples/nodes/intersections), [animating edges](https://reactflow.dev/examples/edges/animating-edges), [Dagre](https://reactflow.dev/examples/layout/dagre)/[ELK](https://reactflow.dev/examples/layout/elkjs)); tldraw ([Tools](https://tldraw.dev/docs/tools), [global pan #318](https://github.com/tldraw/tldraw-v1/issues/318)); Figma ([panel shortcuts](https://framesxdesign.com/figma-shortcuts)); VS Code ([UI](https://code.visualstudio.com/docs/getstarted/userinterface)); d3-force ([collide](https://d3js.org/d3-force/collide)); spacing ([8px grid](https://www.uxlab.academy/blogs/the-ultimate-spacing-guide-for-ui-designers), [Marvel](https://marvelapp.com/blog/harmonious-spacing-system-faster-design-dev-handoff/)); edge bundling ([ordered bundles arXiv](https://arxiv.org/pdf/1209.4227), [yEd polyline router](https://yed.yworks.com/support/manual/layout/router_polyline.html)).



