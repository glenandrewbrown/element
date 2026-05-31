# BLOCK-OVERLAP / cramped-layout — root-cause finding

**Wave 5 bug fix scope. Read-only analysis. No redesign.**
Date: 2026-05-29 · Subject: `BRASS_4Horns` board · App-wide (not BRASS-specific).

---

## 1. Symptom

Glen's screenshot of `BRASS_4Horns` (Edit mode, 04.53PM) shows three blocks —
**DIVISIMATE CORE**, **INFINITE BRASS 4 HORNS**, and a third modifier block whose
body reads **SIGNAL PROCESSING** (the modifier-category placeholder) — piling on
top of each other in a cramped vertical column near the canvas centre. Blocks are
present and correctly connected, but the layout is "very poor and not usable".

A second screenshot (Perform mode, 05.28PM, zoomed out) of the *same* board shows
the blocks spread cleanly with **no overlap** — they render as tiny compact pills.

The difference between "clean" and "piled" is the **zoom tier (render mode)**, not
the saved positions. That asymmetry is the whole diagnosis.

---

## 2. Pipeline traced end-to-end

### C++ emit — positions are REAL (refutes "all at 0,0")
- `buildActiveGraphJson` reads `n.getPosition(x,y)` → `b.x/b.y`
  (`src/ui/element_webview_host.cpp:4220-4223`).
- `Node::getPosition` reads absolute `tags::x` / `tags::y`, default `0.0`
  (`src/node.cpp:756-760`).
- **The actual file `/Users/glenandrewbrown/Music/Element/BRASS_4Horns.els` carries
  real, distinct absolute positions** for all 6 nodes (verified by parsing the XML):

  | Node | x | y | relativeX | relativeY |
  |------|---|---|-----------|-----------|
  | Audio In | 100 | 52 | 0.25 | 0.25 |
  | MIDI In | 404 | 42 | 0.708 | 0.110 |
  | Divisimate Core | 403 | 193 | 0.735 | 0.274 |
  | Infinite Brass 4 Horns | 403 | 338 | 1.609 | 0.431 |
  | Audio Out | 404 | 478 | 0.721 | 0.582 |
  | MIDI Out | 280 | 664 | 0.502 | 0.784 |

  → Positions ARE read and ARE distinct. Hypothesis (a) "all 0/identical" is **refuted**.

### JS consume — positions honoured correctly
- `mapBlock` → `position: { x: b.x ?? 0, y: b.y ?? 0 }`
  (`webview/src/hooks/useJuceBridge.ts:207`).
- `toFlowNodes` → React Flow `position: b.position`
  (`webview/src/components/canvas/GraphCanvas.tsx:64-73`). React Flow honours them.
  → Hypotheses (d) "RF not honouring positions" and (e) "coordinate-scale mismatch"
  are **refuted** — a scale mismatch would overlap at *every* tier; this only
  overlaps at one tier.

### The collision — block render HEIGHT vs saved Y-spacing
- Four nodes share x≈403-404 (one column). Vertical gaps in that column:
  `193-42=151`, `338-193=145`, `478-338=140` px.
- React block width is constant `w-48` (192px) across all tiers — width never
  causes the pile. **Only height changes with tier.**
- **Standard tier** (`zoomTier === "standard"`, zoom 0.5-0.8): block ≈ stripe(4) +
  header(24) + body(~29) ≈ **~57px**. Clears every 140-151px gap by 80+px → no overlap.
- **Expanded tier** (`zoomTier === "expanded"`, zoom > 0.8): block ALSO renders
  `BlockEmbed` (`webview/src/components/canvas/Block.tsx:532-534`). For a **modifier**
  block that embed is ParamStrip(5 faders) + Meter + Spectrum
  (`BlockEmbed.tsx:318-345`, modifier branch: `count=5`, `MeterEmbed`, `SpectrumEmbed`)
  ≈ **+113px → ~170px total**.
  - 170 > 145 ⇒ Divisimate[193..363] overlaps Infinite[338..508] overlaps Audio Out[478..648].
  - **Overlap is forced, vertical-only, and zoom-invariant within the expanded tier**
    (zooming scales the gap and the block together — only dropping to standard/compact
    "fixes" it). This exactly matches the two screenshots.
- Corroboration: the three piled blocks are all **modifiers**
  (`inferCategory` in `useJuceBridge.ts:167-179` maps Divisimate Core / Infinite Brass
  to "modifier"), which get the **tallest** embed — which is precisely why those
  specific blocks pile and the third block's body reads "Signal Processing".

---

## 3. Root cause (most-supported)

**Hypothesis (c): block render height at the expanded zoom tier exceeds the vertical
gap between saved block positions, so same-column blocks overlap.**

Evidence chain:
- Saved positions real & distinct — `BRASS_4Horns.els` (verified) + `element_webview_host.cpp:4220`.
- Column Y-gaps 140-151px — computed from the file.
- Standard block ~57px (no overlap) vs expanded block ~170px (overlap) — `Block.tsx:419-534`, `BlockEmbed.tsx:318-345`.
- Overlap appears **only** at expanded tier — confirmed by the two screenshots
  (04.53PM expanded = piled, 05.28PM compact = clean).

**App-wide, not BRASS-specific.** The legacy positions were authored for the old
JUCE editor's ~100px-tall `BlockComponent`. React's expanded block is ~170px. Any
legacy-authored session with vertical spacing under ~170px overlaps at expanded tier.

Note `zoomTier` initialises to `"standard"` (`useGraphStore.ts:138`); the board
enters expanded tier once the user zooms in past 0.8 (`onViewportMoveEnd` →
`setZoomTier`, `GraphCanvas.tsx:426-446`) — i.e. as soon as Glen zooms in to read
the blocks, they collide.

---

## 4. Fix recommendation — React-side. NOT C++. No redesign.

Do **not** mutate the user's saved positions in `buildActiveGraphJson` — they are
correct user-authored data.

**Recommended (contained, lowest-risk):** cap / compress the expanded `BlockEmbed`
vertical footprint in `webview/src/components/canvas/BlockEmbed.tsx` (the root
`BlockEmbedComponent`, lines 318-345) so an expanded block's total height stays at
or below the standard-tier collision footprint (target ≤ ~130px so it clears the
~140px minimum legacy gap). Options within that file: shrink fader/meter/spectrum
heights, drop the spectrum row, or render the embeds in a horizontal row rather
than the current vertical `flex-col` stack so added detail grows the block
horizontally (width has headroom) instead of vertically.
- Honest limitation: won't clear graphs with even tighter (<~130px) vertical spacing.

**Alternative (more complete, higher-touch, changes visual layout — document only,
do not ship without sign-off):** on snapshot import, detect same-column blocks whose
expanded-tier footprints would collide and spread their effective Y-spacing
(scale Y or auto-distribute). This touches `mapBlock`/`hydrateFromEngine`
(`useJuceBridge.ts:201-226`, `useGraphStore.ts:268-291`).

---

## 5. Secondary finding (separate, lower severity) — new nodes pile at origin

Distinct from the BRASS symptom. Webview-added blocks get NO absolute position:
- `elementGraphAddPlugin` posts `AddPluginMessage` with no coords
  (`element_webview_host.cpp:1277`).
- `EngineService::addPlugin/addNode` → `GraphManager::addNode(desc, rx, ry)` with
  default `rx=ry=0.5` (`engineservice.cpp:549-555,624`).
- `GraphManager::addNode` writes **only** `tags::relativeX/relativeY` (lines 408-409,
  `src/engine/graphmanager.cpp:385-409`) — never absolute `tags::x/y`.
- The legacy materialiser `BlockComponent::updatePosition()` (`src/ui/block.cpp:1658-1664`)
  that converts relative→absolute (scaled by the live JUCE viewport pixel size) **never
  runs in the webview UI**.
- Result: `buildActiveGraphJson` emits `(0,0)` for any node never opened in the legacy
  editor → freshly-added webview nodes stack at the origin. There is **no auto-layout
  fallback** (hypothesis (b)) to spread them.

Fix (C++): seed absolute `tags::x/y` in the add path (e.g. in `GraphManager::addNode`
alongside the relative write, or have the webview add-handler pass cursor coords through
to `setPosition`). Severity P2/P3.

---

## 6. Severity

- **Primary (overlap at expanded tier): P1** — major usability ("not usable"),
  no crash/data-loss, workaround = zoom out. Fix is React (`BlockEmbed.tsx`).
- **Secondary (new nodes at origin): P2** — affects fresh adds, masked once the
  user drags a node (which writes absolute `tags::x/y` via `elementGraphMoveNodes`
  → `setPosition`, `element_webview_host.cpp:1383`). Fix is C++ (`graphmanager.cpp`).
