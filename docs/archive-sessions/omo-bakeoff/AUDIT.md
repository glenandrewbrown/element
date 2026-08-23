# Element V3 UI — One-Pass Bake-off Audit

> Walk this top-to-bottom. For each component: open **yours** + **mockup**, then tell me your call
> (or write it in the `Your call` slot). I lock each into `COMPONENT-BAKEOFF.md` and that becomes the build order.
> Links: yours = element hub `:6006`, mockup = `:6008`. Both are live now.
> **👁 = close call — your eyes actually change the outcome. The rest: my pick stands unless you object.**

**Verdict words:** `keep mine` · `use mockup` · `merge — <what to take>` · `build new`.

**If short on time, just do the 👁 rows** (≈12): Block · Cable · Board · Minimap · Toolbar · Browser · Inspector · Command palette · NeuKnob · NeuToggle · NeuFader · NeuDisplay · VirtualKeyboard · Snippets/presets · Multi-instance.

---

## 1 · Canvas core

### Board / Canvas 👁 — my pick: **Merge** (keep React Flow substrate; graft mockup's obstacle-routing + signal-flow pulses)
- yours: http://localhost:6006/?path=/docs/canvas-graphcanvas--docs
- mockup: http://localhost:6008/?path=/docs/components-graphcanvas--docs  (try `--node-selected` for the signal trace)
- Your call: ⬜

### Block 👁 — my pick: **Merge** (mockup silhouettes + on-block knobs ⊕ your wiring/real ports)
- yours: http://localhost:6006/?path=/docs/canvas-block--docs
- mockup: http://localhost:6008/?path=/docs/components-nodeblock--docs
- Your call: ⬜

### Cable 👁 — my pick: **Merge** (mockup bend-around routing + flow pulses ⊕ your live RMS)
- yours: http://localhost:6006/?path=/docs/canvas-cable--docs
- mockup: http://localhost:6008/?path=/docs/components-cableconnection--docs  (`--sidechain`, `--muted` variants)
- Your call: ⬜

### Minimap 👁 — my pick: **Element** (RF minimap wired) — confirm vs mockup's vector minimap
- yours: (built into the Board minimap) http://localhost:6006/?path=/docs/canvas-graphcanvas--docs
- mockup: http://localhost:6008/?path=/docs/components-minimapviewport--docs
- Your call: ⬜

### BlockEmbed (zoom tier-2) — my pick: **Element** (yours is unique; finish real meter)
- yours: http://localhost:6006/?path=/docs/canvas-blockembed--docs
- mockup: http://localhost:6008/?path=/docs/components-canvas-blockembed--docs
- Your call: ⬜

### Comment frame — my pick: **Element** (wired; equivalent design)
- yours: http://localhost:6006/?path=/docs/canvas-commentframe--docs
- mockup: http://localhost:6008/?path=/docs/components-canvas-commentframe--docs
- Your call: ⬜

---

## 2 · Chrome / shell

### Top toolbar 👁 — my pick: **Merge** (mockup breadcrumb + PANIC placement ⊕ your transport/tempo wiring)
- yours: http://localhost:6006/?path=/docs/layout-toolbar--docs
- mockup: http://localhost:6008/?path=/docs/components-toptoolbar--docs
- Your call: ⬜

### Bottom strip / status — my pick: **Mockup** (richer; wire your real engine data)
- yours: http://localhost:6006/?path=/docs/layout-statusbar--docs
- mockup: http://localhost:6008/?path=/docs/components-bottomstrip--docs
- Your call: ⬜

### App shell / layout — my pick: **Mockup foundation** (adopt its IA; re-house clean, not god-component)
- yours: http://localhost:6006/?path=/docs/layout-appshell--docs
- mockup: http://localhost:6008/?path=/docs/components-layout-appshell--docs
- Your call: ⬜

---

## 3 · Browser / inspector

### Plugin Browser 👁 — my pick: **Merge** (mockup search-first look ⊕ your wiring + sessions + molecules + usage)
- yours: http://localhost:6006/?path=/docs/layout-toolpalette--docs
- mockup: http://localhost:6008/?path=/docs/components-toolpalette--docs
- Your call: ⬜

### Inspector 👁 — my pick: **Merge** (mockup docked tabbed shell ⊕ your wired params/A-B/plugin-embed)
- yours: http://localhost:6006/?path=/docs/layout-inspectorhub--docs
- mockup: http://localhost:6008/?path=/docs/components-inspectorpanel--docs  ·  alt http://localhost:6008/?path=/docs/components-layout-inspectorhub--docs
- Your call: ⬜

### Connection editor — my pick: **Element** (wired)
- yours: http://localhost:6006/?path=/docs/layout-connectioneditor--docs
- mockup: http://localhost:6008/?path=/docs/components-layout-connectioneditor--docs
- Your call: ⬜

### Bus inspector — my pick: **Element** (wired to bus store; needs G-29 engine)
- yours: http://localhost:6006/?path=/docs/layout-businspector--docs
- mockup: http://localhost:6008/?path=/docs/components-layout-businspector--docs
- Your call: ⬜

---

## 4 · Add-flow / menus

### Command palette 👁 — my pick: **Merge** (mockup 4-mode UX ⊕ your wired actions) — secondary surface
- yours: http://localhost:6006/?path=/docs/canvas-commandpalette--docs
- mockup: http://localhost:6008/?path=/docs/components-commandpalette--docs
- Your call: ⬜

### QuickAdd (primary add) — my pick: **Element** (wired; lift mockup visual if better)
- yours: http://localhost:6006/?path=/docs/canvas-quickaddpopup--docs
- mockup: http://localhost:6008/?path=/docs/components-canvas-quickaddpopup--docs
- Your call: ⬜

### Node context menu — my pick: **Merge** (mockup's richer action set ⊕ your wiring)
- yours: http://localhost:6006/?path=/docs/canvas-nodecontextmenu--docs
- mockup: http://localhost:6008/?path=/docs/components-canvas-nodecontextmenu--docs
- Your call: ⬜

### Edge context menu — my pick: **Element** (wired)
- yours: http://localhost:6006/?path=/docs/canvas-edgecontextmenu--docs
- mockup: http://localhost:6008/?path=/docs/components-canvas-edgecontextmenu--docs
- Your call: ⬜

### Keyboard shortcuts reference — my pick: **Mockup** (mockup has a dedicated sheet; yours is fixed handlers)
- yours: (no dedicated component — `useKeyboard`)
- mockup: http://localhost:6008/?path=/docs/components-keyboardshortcuts--docs
- Your call: ⬜

---

## 5 · Neu primitives  (yours = the locked design system; cherry-pick mockup API ideas)

### NeuKnob 👁 — my pick: **Merge** (adopt mockup 4-cat `tone` + `readout` ⊕ your interactivity)
- yours: http://localhost:6006/?path=/docs/neu-knob--docs
- mockup: http://localhost:6008/?path=/docs/components-neu-knob--docs
- Your call: ⬜

### NeuToggle 👁 — my pick: **Element**
- yours: http://localhost:6006/?path=/docs/neu-toggle--docs  · mockup: http://localhost:6008/?path=/docs/components-neu-toggle--docs
- Your call: ⬜

### NeuFader 👁 — my pick: **Element** (check mockup ticks)
- yours: http://localhost:6006/?path=/docs/neu-fader--docs  · mockup: http://localhost:6008/?path=/docs/components-neu-fader--docs
- Your call: ⬜

### NeuDisplay 👁 — my pick: **Element** (check mockup glow)
- yours: http://localhost:6006/?path=/docs/neu-display--docs  · mockup: http://localhost:6008/?path=/docs/components-neu-display--docs
- Your call: ⬜

### NeuButton — **Element** · yours http://localhost:6006/?path=/docs/neu-button--docs · mockup http://localhost:6008/?path=/docs/components-neu-button--docs — Your call: ⬜
### NeuBadge — **Element** · yours http://localhost:6006/?path=/docs/neu-badge--docs · mockup http://localhost:6008/?path=/docs/components-neu-badge--docs — Your call: ⬜
### NeuInput — **Element** · yours http://localhost:6006/?path=/docs/neu-input--docs · mockup http://localhost:6008/?path=/docs/components-neu-input--docs — Your call: ⬜
### Icon — **Element** · yours http://localhost:6006/?path=/docs/neu-icon--docs · mockup http://localhost:6008/?path=/docs/components-neu-icon--docs — Your call: ⬜
### EmptyState — **Element** · yours http://localhost:6006/?path=/docs/neu-emptystate--docs · mockup http://localhost:6008/?path=/docs/components-neu-emptystate--docs — Your call: ⬜
### Skeleton — **Element** · yours http://localhost:6006/?path=/docs/neu-skeleton--docs · mockup http://localhost:6008/?path=/docs/components-neu-skeleton--docs — Your call: ⬜
### InlineMiniKnob / MacroKnob (mockup on-block knobs) — fold into the NeuKnob decision · mockup http://localhost:6008/?path=/docs/components-inlineminiknob--docs · http://localhost:6008/?path=/docs/components-macroknob--docs

---

## 6 · Modals / aux

### Virtual keyboard 👁 — my pick: **Merge** (mockup 5-oct + octave/channel steppers ⊕ your wiring)
- yours: http://localhost:6006/?path=/docs/layout-virtualkeyboard--docs
- mockup: http://localhost:6008/?path=/docs/components-layout-virtualkeyboard--docs
- Your call: ⬜

### Preferences — **Element** (wired) · yours http://localhost:6006/?path=/docs/layout-preferencesmodal--docs · mockup http://localhost:6008/?path=/docs/components-layout-preferencesmodal--docs — Your call: ⬜
### About — **Element** (+ optional mockup BlurText flair) · yours http://localhost:6006/?path=/docs/layout-aboutmodal--docs · mockup http://localhost:6008/?path=/docs/components-layout-aboutmodal--docs — Your call: ⬜
### Prompt modal — **Element** · yours http://localhost:6006/?path=/docs/layout-neupromptmodal--docs · mockup http://localhost:6008/?path=/docs/components-layout-neupromptmodal--docs — Your call: ⬜
### Script editor (Lua) — **Element** (Lua-wired) · yours http://localhost:6006/?path=/docs/canvas-scripteditor--docs · mockup http://localhost:6008/?path=/docs/components-canvas-scripteditor--docs — Your call: ⬜
### Block tab strip — **Element** · yours http://localhost:6006/?path=/docs/layout-blocktabstrip--docs · mockup http://localhost:6008/?path=/docs/components-layout-blocktabstrip--docs — Your call: ⬜

---

## 7 · Bigger features

### Snippets / presets 👁 — my pick: **Merge** (mockup preset system mapped onto your molecules/snippets)
- yours (SnippetShelf): http://localhost:6006/?path=/docs/layout-snippetshelf--docs
- mockup (BlockPresetsPanel): http://localhost:6008/?path=/docs/components-blockpresetspanel--docs
- Your call: ⬜

### Multi-instance / Mirror 👁 — my pick: **Mockup** (you have none) — **IN MVP via Branch A**
- yours: none today
- mockup: switcher http://localhost:6008/?path=/docs/components-instanceswitcher--docs · panel http://localhost:6008/?path=/docs/components-instancespanel--docs · mirror http://localhost:6008/?path=/docs/components-mirrorpanel--docs
- Your call: ⬜ (confirm the design; engine = small C++ registry)

---

## 8 · Deferred (post-v1 — NOT in this audit, here for completeness)
Perform-mode panels (mockup `components-layout-livehealth`, `components-layout-quickaccess`, `components-layout-sessiontree`) + element's shelved `layout-dashboardbuilder` / `layout-macrodashboard` / `layout-scenelauncher`. Stories exist if you want a peek, but they're not MVP — no verdict needed.

---

## Tally to fill as we go
Decisions land in `COMPONENT-BAKEOFF.md` (the verdict column). When every 👁 row has a call, the build sequence is locked: plugin-scan first → MIDI-map + generic editor → the merges, on the UI lane; C++ stabilise (CF1) in parallel.
