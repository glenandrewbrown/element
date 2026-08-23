# Interactive QA rerun (Glen: "test as a human would") — 2026-06-03

Glen rejected the first report: never tested multi-block / connect / plugin-GUI / breadcrumb.
Reran by ACTUALLY interacting (click-drag done properly + CLI recon). Glen was right — the
first report missed real, serious defects.

## Env note
- "Typeless" (Electron dictation app) was mid auto-update, popping a floating window that
  randomly blocked computer-use clicks. Killed it (pkill typeless + ShipIt) to unblock.

## 1. Add multiple blocks — ✅ PASS
- reltest1 had 1 (Valhalla). Added Audio File Player + a Graph (Container) → board menu showed "3 BLOCKS".

## 2. Connect blocks (cables) — ✅ PASS (first report was WRONG)
- My first "can't do cables / handles <10px" was MY bad technique, not an app limit.
- FAIL mode: single `left_click_drag` or fast batch down+move → mousedown hits the React Flow
  pane → **pans the canvas**.
- WORKS: **Fit-to-View** (stable layout) + **discrete calls** mouse_move(out handle) →
  left_mouse_down → mouse_move(in handle) → left_mouse_up. OS delivers each event so RF starts
  the connection. Drew a real **blue (audio) cable** Audio File Player Main-1 → Valhalla Input-1.

## 3. Open / close plugin GUI — OPEN ✅, CLOSE ❌ **P1 DEFECT**
- OPEN ✅: double-click Valhalla → real **Valhalla Supermassive v3.5.0 VST3** editor renders
  embedded (CALayerHost / out-of-process editor — the flagship reliability feature WORKS).
- CLOSE ❌ **[P1]**: the embedded VST3 editor canNOT be dismissed by ANY means tried:
  breadcrumb ✕ tab, double-click toggle, deselect (empty-click), Escape, node right-click menu
  (Rename/Bypass/Mute/Ports/Color/Oversample/Replace/Copy — **no Close**), and
  **Window → "Close plugin windows…"** (clicked precisely 2×).
- **WORSE:** after **deleting the Valhalla node** (gone from tree + canvas, cable removed), the
  plugin GUI **stayed orphaned on screen** (evidence: `.omo/qa/frames/orphaned-plugin-editor.png`).
  → "Close plugin windows" likely only targets floating JUCE windows, not the embedded
  CALayerHost editor, which has NO working close path. Contrast: the Audio File Player editor
  (a normal JUCE window, traffic-lights) AND the Graph-container window both closed fine.

## 4. Breadcrumb in/out of nested layers — partial ❌ **[P2]**
- ✅ Create nested board: added a **Graph (Container)** → has its own board (Audio In/Out +
  MIDI In/Out, shown in the left tree + a floating "Graph" window on add; window closeable).
- ❌ **In-place dive doesn't engage**: the documented "double-click Block → Dive into nested
  Board" never navigated the board. Tried double-click on the container header, on its body,
  after moving it to a clear area, and double-click in the **left tree**, plus clicking the
  "Graph" editor tab — the center breadcrumb **stayed "LEVEL 1 Graph reltest1 EXIT"** every
  time; canvas never showed the nested Audio In/Out. Double-click only opens top-left editor
  TABS ("ValhallaSupermassive", "Graph") that don't switch the canvas.
  ⚠️ Caveat: the orphaned stuck Valhalla GUI may globally confound events — needs a clean
  re-verify on a fresh launch (no stuck editor) before locking severity.
- Minor: the container block's inner preview shows placeholder **NODE_A–D**, not the real
  nested nodes (Audio In/Out) — possible NOTHING-fake-adjacent placeholder in BlockEmbed.

## Net
First report graded the UI "ship-quality, 2 P2s". Real interactive testing surfaces a **P1**
(plugin editor can't be closed; orphaned after node delete) + a **P2** (nested-board dive /
breadcrumb doesn't engage). Cables DO work (my earlier claim was wrong). Glen's pushback was correct.
