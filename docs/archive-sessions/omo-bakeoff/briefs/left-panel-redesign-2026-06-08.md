# Redesign Brief — Side Panels (Browser + Inspector)
### "Not fit for purpose" → a fast, dense, collapsible, name-coherent browser/inspector system

**For:** Element (modular audio plugin host) — webview UI
**Date:** 2026-06-08
**Author:** product-design pass (this is a BRIEF, not code; implementation is a separate reviewed step)
**Scope:** the **left browser** (`ToolPalette`) and the **right inspector** (`InspectorHub`), their host `AppShell`, and the name pipeline that makes them cohere with the canvas.

**Primary sources (cited throughout):**
- Research: `/.omo/research/nodegraph-ux-research-2026-06-08.md` — §D (collapsible panels), §E (browser/inspector for large libraries), §A (density/curation). Cited as **[R-§x]**.
- Design system: `CLAUDE.md` → "Visual Language — Neumorphism", token table, 4-category taxonomy, "Speed/density" paradigm.
- Real components (verified via Storybook MCP `list-all-documentation` + source read, NOT invented): `layout-appshell`, `layout-toolpalette`, `layout-inspectorhub`, `neu-input`, `neu-button`, `neu-slider`, `neu-toggle`, `neu-icon`, `neu-emptystate`, and the `palette/*` sub-components.

> **The locked frame** (do not violate): neumorphism only — no glass/blur/transparency; one dark chassis (Canvas `#1E1E22` / Panel `#222226` / Surface `#252529` / Elevated `#2A2A2E` / Pressed `#1A1A1E`; text `#E5E5EA` / `#8E8E93`). **Speed wins over appearance.** Density IS the beauty. Expert users in flow. Painter rule: **no per-tick blur/shadow/animation** — collapse/transition is a one-shot, never a continuous repaint.

---

## 0. TL;DR for the impatient

The panels aren't broken because they're ugly — they're broken because they're **incoherent, undifferentiated, and not lean on demand**. Five concrete fixes:

1. **Name coherence is a data-pipeline bug, not a styling bug.** The browser reads the *plugin catalog* name (`BrowserPlugin.name`); the canvas + inspector read the *placed node* name (`block.name`). Lock the placed Block's display name to **one source** — the graph-snapshot `block.name` — and make the inspector read *only* that. Guard it with a test.
2. **The browser over-stacks sections** (Favourites + Recents + All + Molecules + Boards, all in one scroll) and **buries search**. Re-rank: search first, facets as chips, the virtualized list as the dominant surface, collapsibles below the fold.
3. **Collapse is half-built and inconsistent.** Two different collapsed rails exist (`AppShell.CollapsedRail` = a dumb 36px drag-handle; `ToolPalette` = a 40px icon rail). Unify on the **icon-rail-survives-collapse** pattern [R-§D], add a **selection-driven inspector** [R-§D] and a **hide-all-panels** key, and **persist** panel state (today `partialize: () => ({})` persists nothing).
4. **The inspector is a tabbed read-out, not a control surface.** Give it the **vvvv-gamma role** [R-§E]: it owns "what surfaces on the Block face" and re-contextualises to the selection instead of making the user pick a tab.
5. **VST3-primary dedupe already exists** (alias-aware, group-favourites preserved in `usePaletteFilters`/`usePluginBrowserStore`). Don't rebuild it — make the *hidden AU* discoverable via a "also as AU" reveal and never regress group-favourites.

---

## 1. Problem diagnosis — concretely, against the real components

### 1.1 The left browser (`ToolPalette`) — why it underperforms

Verified IA today (from `ToolPalette.tsx` docstring + body, lines 36–361):

```
Tab row [Plugins | Projects]   + view controls [grid][list][collapse]
Search input + gear → ScanControls
Category chips (4-cat)
Favourites      (collapsible, default OPEN, hidden when empty)
Recents         (collapsible, default OPEN, hidden when empty)
ALL PLUGINS     (virtualized list / grid)   ← the actual primary surface
Molecules       (collapsible, default collapsed)
Boards          (collapsible, default collapsed)
Footer: CPU meter
```

Concrete failure modes:

- **Primary surface is pushed below the fold.** With Favourites *and* Recents both default-open above it, "ALL PLUGINS" — the thing a search-first user actually scrolls — starts halfway down the panel. [R-§E] is explicit: *"Search box first… facets as optional refinements, not a wall."* The Bitwig-5 over-faceting backlash is the named anti-pattern. Right now the panel is closer to the Bitwig-5 failure than to the search-first ideal.
- **Two scroll contexts fight.** The virtualized `PluginList` (own `overflow-y-auto flex-1`, `PluginList.tsx:154`) is nested *inside* the panel body's own `overflow-y-auto` (`ToolPalette.tsx:235`). Nested scroll regions are a known flow-killer: the expert scrolls and the wrong region moves.
- **Mixed concerns in one panel.** Plugins (a *library*) and Projects (a *file browser*) share one tab strip; Molecules and Boards (project-local *reusables*) are stapled to the bottom of the Plugins tab. Four different mental models, one column.
- **The collapse affordance is buried** as a `ChevronLeft` in a row of view-toggles (`ToolPalette.tsx:202`), and the collapsed result is inconsistent with the shell's own rail (see §1.3).
- **Search is keyboard-orphaned.** `Cmd+F` focuses it via a brittle DOM query (`useKeyboard.ts:249` → `document.querySelector('aside input[placeholder*="Search"]')`). That selector breaks the moment the markup changes and is invisible to tests.

### 1.2 The right inspector (`InspectorHub`) — why it underperforms

Verified today (from `InspectorHub.tsx`, lines 80–463): a **docked tabbed shell** `Block | Bus | Cable | Health`. The Block tab renders `BlockHeader` (gradient bar + `block.name` + category + format + ACTIVE/BYPASS/MUTED), `BlockMetrics`, `BlockPortList`, the param list (`BlockParameterList` with filter+prefix-grouping), notes, A/B presets, plugin embed.

Concrete failure modes:

- **A tab bar costs a click on every context switch.** [R-§E] / Bitwig+Ableton: the pro pattern is *one re-contextualising strip*, not a tab row — *"selecting a Container shows Container props… avoid a tab bar that costs a click each."* Block/Bus/Cable/Health are really *selection types*, not user-chosen tabs — the inspector should follow the selection, not ask the user to.
- **It's a read-out, not a control surface.** It shows params; it does not let the expert decide *which params live on the Block face*. [R-§E] item 6 (the single highest-leverage fix): the inspector should own the per-param "pin to node face" toggle — turning "panel not fit for purpose" into "panel that governs node leanness." There is already a `userHiddenParams` field on `BlockData` (`data/types.ts:49`) — the data substrate for this exists and is unused by the inspector.
- **No empty/lean state.** When nothing is selected, the inspector still occupies its full 280px (`AppShell` `RIGHT_W = 280`). [R-§D]/Figma: the inspector should *auto-collapse to its rail when there's no selection* and *auto-expand on select*. This is the biggest free win for "max canvas."
- **The name shown can disagree with the canvas** — see §2 (this is Glen's explicit complaint and it is a real pipeline bug, diagnosed below).

### 1.3 The shell (`AppShell`) — collapse is half-built

Verified (from `AppShell.tsx`, lines 28–232 + `useAppStore.ts`):

- Panel constants: `LEFT_W 260 / LEFT_COLLAPSED_W 36`, `RIGHT_W 280 / RIGHT_COLLAPSED_W 36`. Toggles wired to `togglePanel('left'|'right'|'bottom')`, bound to **Cmd+1 / Cmd+2 / Cmd+3** (`useKeyboard.ts:228–243`).
- **Two inconsistent collapsed rails.** `AppShell.CollapsedRail` (lines 95–123) renders *only a drag-handle pill* — no icons, no way to see what's in the panel. But `ToolPalette`'s *own* `collapsed` branch (lines 103–135) renders a **40px icon rail with category filters**. So depending on wiring, the collapsed left panel is either a blank 36px strip or a 40px icon rail. They must be one thing.
- **Nothing is persisted.** `useAppStore` `partialize: () => ({})` (line 225) deliberately persists nothing. So collapse state, panel widths, and which panel was open are all lost on reload. [R-§D] item 4: *"Persist panel width + collapsed-state per project."*
- **No "hide everything" key** (Figma `Cmd+.`), **no per-panel independent semantics beyond toggles**, and **no drag-to-resize** (widths are hard constants).
- **Panels animate `x` + `opacity` via framer-motion** (`slideLeft`/`slideRight`, 200ms). That's a one-shot transform/opacity transition — *acceptable* under the painter rule (transform+opacity are GPU-composited, not per-tick layout). Keep it; do **not** add shadow/blur transitions.

---

## 2. Name-match fix — the single source of truth (Glen's #2)

### 2.1 Root-cause diagnosis (verified in code)

There are **two independent name pipelines**, fed by **two different host endpoints**:

| Surface | Reads | From host endpoint | Mutable? |
|---|---|---|---|
| **Browser** (ToolPalette / QuickAdd) | `BrowserPlugin.name` → `PluginEntry.name` | `elementGetPluginList` | No — static catalog name |
| **Canvas Block** | `block.name` (`BlockData.name`) | `elementGetGraphState` → `mapBlock` (`useJuceBridge.ts:249`, `name: b.name`) | **Yes** — Cmd+R in-place rename writes it |
| **Inspector** (`BlockHeader`) | `block.name` (same `BlockData`) | same graph snapshot | Yes |

The browser name and the placed-node name are **different fields from different host calls**. They legitimately differ once a node is renamed — but they can *also* differ at the moment of insertion if the host's graph-snapshot `name` is derived differently from the catalog `name`. Two concrete divergence vectors:

1. **The description-as-title leak (N1 class).** The browser was already fixed so the row title is `PluginDescription.name`, never `descriptiveName` (see `usePluginBrowserStore` `BrowserPlugin.name` doc: *"internal Element nodes set `descriptiveName` to a sentence DESCRIPTION … that must NEVER be the title"*). **But the graph-snapshot path (`mapBlock`) has no equivalent guard** — if the host populates a placed node's `name` from a different field than the browser does, an internal node can show its friendly name in the browser and a different string on the canvas/inspector. The N1 fix must be applied **host-side at the single point that emits node `name`**, so both endpoints draw the same string.
2. **Rename is canvas-only.** Cmd+R / in-place rename updates `block.name`; it does **not** (and should not) rewrite the catalog. So after a rename the inspector *correctly* shows the new name and the browser *correctly* shows the catalog name. That's not a bug — but it surprises users. The fix is to make the relationship explicit (see §2.3).

### 2.2 The rule (single source of truth)

> **A placed Block's display name is `block.name` from the graph snapshot — full stop. Every surface that names a *placed* Block (canvas title, inspector header, BlockTabStrip tab, command palette "go to block") MUST read `block.name` and MUST NOT re-derive a name from the plugin catalog.**

The browser/QuickAdd name the *catalog* (un-placed plugins) and correctly use `BrowserPlugin.name` — that is a different object (a plugin you *could* add), so it is allowed to differ from a renamed instance.

### 2.3 What to actually change

1. **Host-side, one emit point:** the function that serialises a node into the graph snapshot must set `name` using the **same name-not-description rule** the plugin list uses (prefer `PluginDescription.name`; never `descriptiveName`; fall back to a sensible default). This is the load-bearing fix — it guarantees the *insertion-time* name matches.
2. **Webview-side, forbid re-derivation:** audit the inspector and any "name a block" call site to confirm they read `block.name` only. `BlockHeader` already does (`InspectorHub.tsx:398–401`, `const { name, … } = block`). Add a guard so no future code looks up a placed Block's name from `usePluginBrowserStore`.
3. **Make the rename relationship explicit (UX):** when a Block's `name` differs from its plugin family's catalog name, show the catalog name as a **muted secondary line** in the inspector header (`"Renamed from: Diva"`), and in the browser tooltip note it's a catalog entry. This removes the surprise without merging the two fields.
4. **Mechanical guard (the test):** a Storybook interaction test asserting **inspector-header name string === canvas-Block title string** for the same selected node id (the research's exact prescription, [R-§E] item 4). See §6 phase B.

---

## 3. Proposed IA + layout

### 3.1 Principles applied

- **Search-first** [R-§E]: full-width auto-focused search on open; facets are chips, not columns.
- **One dominant surface per panel** [R-§E]: the left panel's job is *find a Block to add*; the right panel's job is *inspect/shape the selected Block*. Everything else is secondary and collapses below the fold.
- **Collapse content, keep access** [R-§D]: never collapse to nothing; always leave a one-click icon rail.
- **Selection-driven inspector** [R-§D]: right panel auto-reveals on selection, auto-collapses on deselection.
- **Density governed by a grid** [R-§A]: 8px base, 4px for tightly-associated items; fixed row heights; `tabular-nums` for all numerics (already the house habit).

### 3.2 Left browser — re-ranked IA (annotated wireframe)

```
┌─ LEFT BROWSER  (260px expanded · 40px icon-rail collapsed) ────────────┐
│ ┌───────────────────────────────────────────────────────────────────┐ │  ── HEADER (fixed, ~76px) ──
│ │ [ Plugins ] [ Projects ]              [grid] [list]  [«collapse]   │ │  Tabs + view + collapse
│ │ ┌───────────────────────────────────────────────────────────────┐ │ │
│ │ │ 🔍  Search plugins…                                      [⚙]   │ │ │  Search FIRST, full width,
│ │ └───────────────────────────────────────────────────────────────┘ │ │  auto-focused on open (⌘1/⌘L).
│ │  ● VI   ▲ MIDI   ◆ Audio   ⬡ Mod        [★ Fav] [⏱ Recent]        │ │  Facet chips: 4 categories
│ └───────────────────────────────────────────────────────────────────┘ │  + Favourites + Recents as
│ ┌───────────────────────────────────────────────────────────────────┐ │  TOGGLE chips (not stacked
│ │  All plugins · 248                                                │ │  sections). One scroll region.
│ │  ● Diva                          Synth · VST3            ★        │ │  ── PRIMARY SURFACE ──
│ │  ◆ Pro-Q 3                       EQ · VST3   (also AU)            │ │  Virtualized fixed-height
│ │  ▲ Arp                           MIDI · INT                       │ │  rows (34px). 4-cat shape+
│ │  ⬡ LFO                           Mod · INT                        │ │  colour glyph inline so the
│ │  …                                                                │ │  row RHYMES with the canvas
│ │  (virtualized — only visible rows mount)                          │ │  Block. Hidden-AU = "(also AU)"
│ └───────────────────────────────────────────────────────────────────┘ │  reveal, not a 2nd row.
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ ▸ Snippets (3)                                                    │ │  ── BELOW THE FOLD ──
│ │ ▸ Containers / Boards (2)                                         │ │  Collapsibles, default COLLAPSED
│ └───────────────────────────────────────────────────────────────────┘ │  (Molecules→"Snippets", Boards).
│  CPU ▓▓▓░░░  14%                                                       │  Footer: CPU meter (unchanged).
└────────────────────────────────────────────────────────────────────────┘
```

Key changes vs today:
- **Favourites/Recents become filter *chips*, not stacked sections.** Tapping `★` filters the one list to favourites; tapping `⏱` sorts by most-recent-first (Bitwig's default-sort, [R-§E]). This removes two above-the-fold scroll blocks and makes the virtualized list the immediate primary surface. (The grouping data — `isFavorite`, `recentRank` on `BrowserPlugin` — already exists; we change presentation, not data.)
- **One scroll region.** Collapse the nested scroll: the header is fixed, the virtualized list owns the only scroll; Snippets/Boards live in a small footer disclosure that doesn't double-scroll.
- **Projects becomes its own clean view** (the file browser mental model is separate from the library) — keep the existing Recover/Project-files/Recent grouping, it's good.
- **Collapse → 40px icon rail** (unify on ToolPalette's existing rail, kill `AppShell.CollapsedRail`'s blank pill).

**Density targets (left):** row 34px (already), header type 9px uppercase tracking-widest for section labels, 11px for plugin names, 8–9px mono for format pills. Icon glyphs 13–14px. Internal padding ≤ outer margin (the "internal ≤ external" rule, [R-§A]/§B) — tighten `px-3` body padding to `px-2` and keep card padding at `py-1.5`.

### 3.3 Right inspector — selection-driven, re-contextualising (annotated wireframe)

```
┌─ RIGHT INSPECTOR  (280px on selection · 40px icon-rail when empty) ─────┐
│ ┌───────────────────────────────────────────────────────────────────┐ │  ── HEADER (gradient, ~48px) ──
│ │ ◆ Pro-Q 3                                        VST3   ● ACTIVE   │ │  block.name (THE source of truth)
│ │ Audio Effect · 2 in · 2 out          Renamed from: FabFilter Pro-Q │ │  + category + ports + live state.
│ └───────────────────────────────────────────────────────────────────┘ │  Muted "renamed from" only if ≠ catalog.
│  [ Params ]  [ I/O ]  [ Notes ]                       (context strip)   │  Sub-nav = SECTIONS of THIS block,
│ ┌───────────────────────────────────────────────────────────────────┐ │  not Block/Bus/Cable/Health tabs.
│ │ 🔍 Filter 24 parameters…                                          │ │  (Selection TYPE drives the panel:
│ │ ▾ Low Cut                                                         │ │   Block→this; Cable→signal monitor;
│ │   Freq        ───────●────────   80 Hz          📌                │ │   Bus→bus monitor; nothing→rail.)
│ │   Slope       ──●──────────────  12 dB/oct      📌                │ │
│ │ ▾ Band 1                                                          │ │  📌 = "pin to Block face" toggle
│ │   Gain        ────────●───────  +3.2 dB         •                 │ │  (vvvv-gamma model). Pinned params
│ │   …                                                               │ │  appear on the Block's Macro tier.
│ └───────────────────────────────────────────────────────────────────┘ │  Value-on-row (already), tabular.
│  [Open editor]   [A | B  ⇄]   [Snapshot]                               │  Action row (existing A/B + embed).
└────────────────────────────────────────────────────────────────────────┘
```

Key changes vs today:
- **The top-level `Block | Bus | Cable | Health` tab bar is replaced by selection-routing.** What's selected decides what the panel shows — Block selected → block sections; Cable selected → the (already-built, excellent) live signal monitor; Bus selected → bus monitor; nothing → collapse to rail. This is the Bitwig/Ableton single-strip model [R-§E] item 7. The *within-block* sub-nav (`Params / I/O / Notes`) stays, because those are genuine sub-views of one object.
  - **Health** is not a selection — move engine vitals to the StatusBar/bottom (it already partly lives in `StatusBar`), or keep it as a pinned "no selection" inspector view (so the empty inspector shows engine health instead of nothing, if Glen prefers vitals-always-visible over max-canvas — *flag this as a decision, see §7*).
- **Add the per-param "pin to Block face" toggle (`📌`)** wired to the existing `BlockData.userHiddenParams` substrate (inverted: pinned = surfaced). This makes the inspector the *density-control surface* and is the single highest-leverage move [R-§E].
- **Header gains the muted "Renamed from: …" line** (§2.3) when `block.name` ≠ catalog name.

**Density targets (right):** header 48px fixed (gradient 30px + sub-row 18px, already), param row `min-h-24px` (already), filter appears only > 8 params (already, `PARAM_FILTER_THRESHOLD`), prefix-grouping > 12 (already). Keep these — they're good. Add: pin toggle 14px, right-aligned.

### 3.4 The browser↔inspector relationship

They are **two views of one model** [R-§E]/Origami. Concretely:
- **Browser = the catalog** (un-placed plugins; names from `elementGetPluginList`). Action = *add a Block*.
- **Inspector = the selected placed Block** (names from the graph snapshot). Action = *inspect / shape / curate*.
- The seam between them is the **add gesture** — and that's the one moment names must reconcile (§2.1 fix #1). After insertion they diverge *only* by user rename, surfaced explicitly (§2.3 fix #3).

---

## 4. Collapsible spec (Glen's #3 — BOTH panels)

Built directly on [R-§D] (Figma + VS Code + Ableton 12 + Bitwig + Blender patterns) and the **real** `AppShell`/`useAppStore` wiring.

### 4.1 Affordance & collapsed state

| | Left (Browser) | Right (Inspector) |
|---|---|---|
| **Expanded width** | 260px (`LEFT_W`) | 280px (`RIGHT_W`) |
| **Collapsed state** | **40px icon rail** — Search icon (one-click re-expand + focus search) + the 4 category-filter glyphs (tapping a glyph re-expands *and* applies that filter). **Unify on `ToolPalette`'s existing rail; delete `AppShell.CollapsedRail`'s blank pill.** | **40px icon rail** — section glyphs for the *current selection's* sub-views (Params / I/O / Notes) + a chevron to re-expand. When nothing is selected, the rail shows a single dim "inspector" glyph. |
| **Collapse affordance** | A clear chevron in the header (`«`), **plus** drag-to-resize past a ~120px snap threshold collapses it [R-§D item 5]. | Same chevron (`»`) + drag-to-resize snap. |
| **Re-expand** | Click anywhere on the rail, the chevron, or the keybind. | Same; **and auto-expands on selection** (see 4.3). |

**Why a rail, never nothing:** [R-§D] item 1 — *"collapse hides content, not access."* VS Code's Activity Bar is the model. A blank strip (today's `CollapsedRail`) fails this; the icon rail passes it.

### 4.2 Keyboard (independent toggles + hide-all)

Today: Cmd+1 left, Cmd+2 right, Cmd+3 bottom (`useKeyboard.ts:228–243`). Keep these (don't break muscle memory), and **add the research's standard set** [R-§D item 2] as aliases/additions:

| Key | Action | Status |
|---|---|---|
| **`Cmd+1`** | Toggle left browser | exists — keep |
| **`Cmd+2`** | Toggle right inspector | exists — keep |
| **`Cmd+3`** | Toggle bottom (snippet shelf) | exists — keep |
| **`Cmd+\`** | Toggle left browser (Figma-muscle alias for `Cmd+1`) | add |
| **`Cmd+Opt+\`** | Toggle right inspector (alias for `Cmd+2`) | add |
| **`Cmd+.`** | **Hide ALL panels → full-bleed canvas** (performance/flow); press again restores prior layout | **add — new** |

Do **not** add a single "toggle all" key as the *primary* mechanism — Ableton 12 deliberately split combined toggles because experts want per-panel control [R-§D item 2]. `Cmd+.` is an *additional* max-canvas escape hatch (Figma's presentation key), not a replacement for per-panel toggles. It must remember the pre-hide state of each panel and restore it.

Also: **replace the brittle `Cmd+F` DOM-query search focus** (`useKeyboard.ts:249`) with a store-driven focus signal (a `focusBrowserSearch` nonce in `useAppStore`, mirrored by `ToolPalette`), and ensure `Cmd+1`/`Cmd+L` opening the browser also focuses search [R-§E item 1].

### 4.3 Selection-driven inspector (the free max-canvas win)

[R-§D item 3] / Figma: 
- **Nothing selected → right inspector auto-collapses to its 40px rail.**
- **Select a Block/Cable/Bus → auto-expands to that selection's view.**
- A manual override exists: if the user *explicitly* collapsed the inspector (via chevron/keybind), respect that and don't auto-expand until they re-open it (track `inspectorUserCollapsed` separately from `rightPanelOpen`). This prevents the panel "fighting the user."

### 4.4 Persistence

Today `useAppStore` persists nothing (`partialize: () => ({})`, line 225). Change `partialize` to persist:
```
{ leftPanelOpen, rightPanelOpen, bottomPanelOpen, leftWidth, rightWidth, inspectorUserCollapsed }
```
[R-§D item 4]. Keep the existing `merge` that coerces legacy `mode:"perform"` → `"edit"`. Widths become state (defaulted to 260/280), not constants, to support drag-resize. **Per-project** persistence is a nice-to-have; per-app (localStorage, as today) is the floor.

### 4.5 Animation budget (painter rule)

- Panel open/close: the **existing** framer-motion `x`+`opacity` one-shot (200ms, `EASE = [0.16,1,0.3,1]`) is fine — transform+opacity are GPU-composited, fired once. Keep.
- Canvas inset transition: existing CSS `transition: left/right/bottom 0.2s` on `<main>` — fine, one-shot.
- **Forbidden:** animating `box-shadow`/`filter`/`backdrop-filter` on collapse, or any per-tick (rAF/60Hz) repaint of panel chrome. The neumorphic shadows are static; only transform/opacity move. This is the locked painter rule and the perf-wave learning.
- Drag-resize: update width on `pointermove` via a CSS variable / direct style write (no React state per move; commit to store on `pointerup`) so dragging doesn't trigger a render storm.

---

## 5. Component inventory (real names + props — verified, not invented)

### 5.1 Reuse as-is

| Component (Storybook id) | Role in redesign | Real props (verified) |
|---|---|---|
| `AppShell` (`layout-appshell`) | The shell host — keep its slot API | `toolbar`, `editLeftPanel`, `editRightPanel`, `editBottomPanel`, `statusBar`, `children` (+ perform-* slots) |
| `NeuInput` (`neu-input`) | Search box + param filter | `placeholder`, `value`, `onChange` (used at `BlockParameterList`/`PaletteSearch`) |
| `NeuButton` (`neu-button`) | Action rows, ON/OFF param toggles | `size` (`"sm"`), `variant` (`"active"\|"default"`), `onClick`, `className` |
| `NeuSlider` (`neu-slider`) | Param rows | `value`, `step`, `ariaLabel`, `ariaValueText`, `onChange`, `className` |
| `NeuToggle` (`neu-toggle`) | The pin-to-face toggle, boolean params | (verify props via `get-documentation neu-toggle` before wiring) |
| `Icon` (`neu-icon`) | All glyphs incl. rail icons, category shapes | `name`, `size`, `strokeWidth`, `aria-hidden` |
| `EmptyState` (`neu-emptystate`) | "No plugins scanned", "Select a Block" | `illustration`, `size`, `tone`, `title`, `description`, `action` |
| `palette/PluginList`, `PluginCard`, `CategoryChips`, `PaletteSearch`, `usePaletteFilters`, `usePluginBrowserStore` | The browser engine — virtualization + alias-aware dedupe already correct | `PluginEntry{id,name,description,category,format,variants}`; `BrowserPlugin{…isFavorite,recentRank,aliases,variants}` |

### 5.2 Modify

| Component | Change |
|---|---|
| `ToolPalette` (`layout-toolpalette`) | Re-rank IA: search-first; Favourites/Recents → **filter chips** not stacked sections; single scroll region; Snippets/Boards → footer disclosure. Keep tabs, view-mode, collapse rail. |
| `InspectorHub` (`layout-inspectorhub`) | Replace top `Block\|Bus\|Cable\|Health` **tab bar** with **selection-routing**; keep within-block `Params/I/O/Notes` sub-nav. Add `📌` pin-to-face per param (wire to `userHiddenParams`). Add "Renamed from:" muted line. Add empty-state → rail. |
| `AppShell` | Delete blank `CollapsedRail`; both rails become real icon rails. Widths → state (drag-resize + snap-collapse). Add `Cmd+.` hide-all + restore. Wire selection-driven inspector. |
| `useAppStore` | `partialize` persists panel open/width/collapse. Add `focusBrowserSearch` nonce, `inspectorUserCollapsed`, `leftWidth`/`rightWidth`, `hideAllPanels()`/`restorePanels()`. |
| `useKeyboard` | Add `Cmd+\`, `Cmd+Opt+\`, `Cmd+.`; replace DOM-query search-focus with store nonce. |
| Host graph-snapshot serialiser (C++) | Apply the **name-not-description** rule at the single node-`name` emit point so `block.name` matches the catalog name at insertion (§2.3 fix #1). |

### 5.3 Add (new, small)

| New component | Role |
|---|---|
| `palette/FacetChips` (or fold into `CategoryChips`) | Favourites + Recents as toggle chips alongside the 4 category chips. |
| `inspector/PinToFaceToggle` | The `📌` per-param control (thin wrapper over `NeuToggle` + `userHiddenParams` write). |
| `layout/PanelRail` | The unified 40px icon rail used by BOTH collapsed panels (replaces the two divergent rails). |
| `inspector/InspectorEmpty` | "Select a Block to inspect" empty state (or engine-health, per §7 decision). |

> **Verification gate before building:** for every `neu-*` component above, call `get-documentation <id>` and confirm props before wiring. The Storybook MCP is the source of truth; do not assume props (the instructions are explicit on this).

---

## 6. Phased build plan (small, independently-shippable, each verifiable)

Each phase ships behind the existing Storybook + interaction-test gate. "Verify" = a story + a `run-story-tests` interaction/a11y pass (self-healing loop per the storybook workflow), plus the named assertion.

**Phase A — Name coherence (highest priority; it's the explicit complaint).**
- A1 (C++): apply name-not-description at the graph-snapshot node-`name` emit point.
- A2 (webview): audit inspector/canvas/tab-strip to read `block.name` only; add the "Renamed from:" muted line.
- **Verify:** interaction test selecting a node → assert `InspectorHub` header text === `Block` canvas title text for the same id (the [R-§E] item-4 prescription). Story: `InspectorHub` with a renamed node + a catalog-named node.

**Phase B — Persist + unify collapse rails.**
- B1: `useAppStore.partialize` persists `{left/right/bottomOpen, widths, inspectorUserCollapsed}`.
- B2: new `PanelRail`; both collapsed panels use it; delete `AppShell.CollapsedRail` blank pill.
- **Verify:** story toggling each panel; reload-persistence test (set collapsed → re-mount store → assert collapsed). a11y: rail buttons have `aria-label` (existing pattern).

**Phase C — Keyboard + hide-all + search focus.**
- C1: add `Cmd+\`, `Cmd+Opt+\`, `Cmd+.` (+ restore); C2: replace DOM-query search focus with store nonce.
- **Verify:** `useKeyboard` interaction test — `Cmd+.` hides all + restores prior state; `Cmd+1` opens browser AND focuses search (assert `document.activeElement` is the search input).

**Phase D — Browser IA re-rank (search-first).**
- D1: Favourites/Recents → filter chips; D2: single scroll region; D3: Snippets/Boards → footer disclosure.
- **Verify:** `ToolPalette` story (Synthetic1000 plugins) — assert search input is the first focusable in the body and the virtualized list is the dominant region; perf: virtualization still mounts only visible rows (existing `data-testid="plugin-list-virtual"`). Don't regress group-favourites (star an AU → family stays favourited — assert via `usePaletteFilters` unit test, already isolatable).

**Phase E — Selection-driven inspector + the `📌` pin-to-face.**
- E1: replace top tab bar with selection-routing (Block/Cable/Bus/empty); keep within-block sub-nav. E2: `PinToFaceToggle` wired to `userHiddenParams`; pinned params surface on the Block Macro tier.
- **Verify:** interaction test — select Block → block view; select Cable → signal monitor; deselect → rail. Pin a param → assert it appears in the Block's pinned set (and on the Block face story). a11y on the toggle.

**Phase F — Drag-to-resize + snap-collapse (polish).**
- F1: width state + pointer-driven resize (CSS var, no per-move React state); F2: snap-to-rail under ~120px.
- **Verify:** story with resize handle; assert width commits to store on `pointerup`; assert no React render per `pointermove` (perf guard — the painter/perf rule).

Order rationale: A is the named bug; B/C make "collapsible + lean" *real and persistent* (Glen's #3) with low risk; D rebuilds the "not fit for purpose" browser (#1, #4, #5); E delivers the inspector's reason-to-exist; F is fluid polish. A–C are each < a day and independently shippable.

---

## 7. Open decisions for Glen (flag, don't assume)

1. **Empty inspector = nothing (max canvas) OR engine-health (always-visible vitals)?** [R-§D] says auto-collapse to rail = max canvas; but you may prefer the no-selection inspector to show Health (CPU/SR/buffer/device) since that's genuinely "always useful." Recommendation: **collapse to rail by default, with a pin so the user can choose "keep Health visible."**
2. **Favourites/Recents: chips (recommended, denser) vs the current stacked sections.** Chips reclaim the most above-the-fold space and match Bitwig/Ableton; some users like a persistent visible favourites shelf. Recommendation: **chips**, with the list defaulting to "All" and `★`/`⏱` one-tap filters.
3. **`Cmd+.` for hide-all** — confirm it doesn't collide with a host/JUCE binding. (Figma uses it; verify in Element's key map.)
4. **Per-project vs per-app panel persistence.** Per-app (localStorage) is the cheap floor and matches today's store; per-project (in the `.els`) is more "pro" but needs host plumbing. Recommendation: **per-app now, per-project later.**

---

## 8. Anti-patterns this brief explicitly avoids (from the research)

- **Over-faceted / column-wall browser** (Bitwig-5 backlash) → search-first, facets as chips. [R-§E]
- **Collapse that hides access** → icon rail always, never a blank strip. [R-§D]
- **One master toggle-all as the only control** → per-panel toggles kept; `Cmd+.` is an *extra*. [R-§D]
- **Inspector name ≠ canvas name** → one source of truth + mechanical test. [R-§E]
- **Expose-every-param / dump** → inspector *curates* (pin-to-face); the Block face shows the chosen few. [R-§A]
- **Per-tick shadow/blur animation** → transform+opacity one-shots only (painter rule).
- **Brittle DOM-query wiring** (the `Cmd+F` selector) → store-driven, testable signals.

---

### Appendix — file map (where the work lands)

- Browser: `webview/src/components/layout/ToolPalette.tsx` + `…/palette/{PluginList,PluginCard,CategoryChips,PaletteSearch,usePaletteFilters,FavouritesSection,RecentsSection,MoleculesSection,BoardsSection}.tsx`
- Inspector: `webview/src/components/layout/InspectorHub.tsx` (+ `BusInspector.tsx`, `LiveHealth.tsx`)
- Shell + state: `webview/src/components/layout/AppShell.tsx`, `webview/src/stores/useAppStore.ts`, `webview/src/hooks/useKeyboard.ts`
- Name pipeline: `webview/src/hooks/useJuceBridge.ts` (`mapBlock`, line ~246) + the **host C++** node-snapshot serialiser (single `name` emit point) + `webview/src/stores/usePluginBrowserStore.ts` (already correct for the catalog side)
- Types: `webview/src/data/types.ts` (`BlockData`, incl. existing `userHiddenParams`)
