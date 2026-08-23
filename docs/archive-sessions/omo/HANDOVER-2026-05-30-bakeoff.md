# HANDOVER — Element V3 UI Bake-off (2026-05-30, eve)

Paste-and-resume doc for a fresh session. The UI bake-off is COMPLETE: all 37 components
have a locked verdict. Next phase = convert/build per those verdicts.

## TL;DR

- Goal (Glen): deep-dive the `mindful-studio` React mockup, gap-analyse vs Element, then build
  the V3 UI by **cherry-picking the best of {Element webview, mockup} per component, adopting the
  mockup's UX foundation, building new where both are weak, and re-housing every winner on
  Element's real architecture** (Zustand + JUCE bridge + React Flow). Don't lose native JUCE features.
- We ran a **forensic, component-by-component bake-off** (live, via Storybook + screenshots),
  and Glen gave a verdict on **all 37 components**. Verdicts are locked in `VERDICTS.md`.

## READ THESE FIRST (durable, canonical)

1. `.omo/bakeoff/VERDICTS.md` — **the 37 locked per-component verdicts** + the ⭐ nav note + tally. THE build spec.
2. `.omo/bakeoff/COMPONENT-BAKEOFF.md` — the matrix (design verdicts + native-parity §9 + MVP build-new set).
3. `.omo/plans/mvp-bakeoff-plan.md` — locked MVP scope, method, sequencing, IA decisions, multi-instance verdict.
4. `docs/adr/ADR-011-ui-cherrypick-bakeoff-method.md` — the method decision (ADR).
5. `.omo/PROJECT-STATE.md` — overall project state (M0 stabilise / M1 ship), CF1 crash, doc index.
6. Memories: `project-ui-mvp-method`, `feedback-explicit-design-tools-mandatory`,
   `feedback-judge-interaction-not-stills`, `feedback-plain-language-questions`.

## Locked method + scope (from the plan doc)

- **MVP = the Edit-mode building experience, done beautifully, on the real engine.** Deferred: Perform mode.
- **Per component:** keep best of {B=Element webview, C=mockup}, build-new where both weak (using
  **mandatory** design tools: Stitch / ui-ux-pro-max / uiverse — never hand-rolled), re-house winner on Element arch.
- **Sequencing:** parallel lanes — C++ stabilise (fix **CF1** Logic-Pro crash + 28-bug + perf) ‖ frontend UI.
  CF1 stays a HARD SHIP GATE (not a start gate).
- **IA (locked):** docked tabbed Inspector · QuickAdd-primary (+ ⌘K secondary) · breadcrumb-only nav.

## ⭐ CROSS-CUTTING RULES (apply everywhere — Glen-emphasised)

1. **NAVIGATION = adopt the mockup's ENTIRE breadcrumb/block/navigation handling.** The enter/exit
   of nested boards + the "you are inside a nested board" visual state (nested-canvas frame + left
   depth-ribbon + animated depth-banner "Nested · Level N · {board} inside {parent}" + EXIT button;
   double-click block = dive, double-click empty = up; depth-tinted breadcrumb). Adapt Element's
   React-Flow + breadcrumb code to MATCH. Spans Block + Board + Breadcrumb. (VERDICTS row 24, top priority.)
2. **Don't lose native JUCE features.** Query the native app for dropped items per component.
   Confirmed node-menu additions to rebuild (`src/ui/contextmenus.hpp`): Disconnect submenu
   (All/MIDI/In/Out), **Color** (user node colour), **Oversample** (2/4/8×), **Replace** plugin,
   Connect-via-Sources/Destinations, rich **Presets** (Save node / Save-default / Reset / Factory /
   FXB-FXP / program), Enable/Disable, Rename.
3. **Pulled into MVP from backlog:** full **key-command customisation** (resurrect native keymap-editor,
   in Preferences/Shortcuts tab) + **plugin scan/rescan/paths/format-toggles** (the #1 native gap, no app without it).
4. **Judge interaction, not stills** — the mockup's strengths are interaction-heavy (nav, cable pulses, trace).
5. Mandatory design tools for any build-new; never silently drop them (denial-causing lesson).

## The 37 verdicts (summary — full detail in VERDICTS.md)

- **Merge (re-house mockup look/feature on your wiring):** Block (lighter: knobs+B/M/S+labeled-ports+LED, drop on-block meter),
  Cable (mockup routing+pulses+plugs+arrowhead + your live glow), Board (RF + trace-spotlight + arrange toolbar),
  Toolbar (adapt: mockup buttons + new Edit-only layout, drop perform toggle), Browser (mockup search-list+chips + your structure + scan controls),
  Inspector (mockup docked tabs + your wired content), Command palette (mockup 4-mode + your wiring),
  NeuButton (your variants/colours + mockup filled style), NeuSkeleton, Snippets/presets (one unified panel, mockup tag/filter UX, both block-presets + group-snippets),
  Minimap (RF wiring + mockup look), Bottom-strip (mockup transport+meter + your status styling), CommentFrame (mockup frame + your inline label),
  QuickAdd (mockup port-aware filtering + your favourites), NodeContextMenu (your look + merge ops + native-parity), ConnectionEditor, BusInspector, Preferences (mockup tabs + your settings + new shortcuts/scan/device tabs), NeuPromptModal, ScriptEditor (mockup editor + your Lua wiring), BlockTabStrip.
- **Use mockup:** NeuToggle, NeuFader, NeuDisplay, NeuEmptyState, BlockEmbed, EdgeContextMenu, VirtualKeyboard (5-oct+steppers + your velocity/wiring), App-shell (slot model), Breadcrumb/Navigation (⭐ entire nav model).
- **Keep yours:** NeuBadge, NeuInput, NeuIcon, ConnectionEditor(merge-leaning), About.
- **Add-only:** NeuKnob (add purple 4th category; skip readout). Keyboard-shortcuts (adopt sheet + full customisation).
- **Mockup-only, approved:** Multi-instance/Mirror — simplified MVP: build InstanceSwitcher + MirrorPanel first on a
  **Branch-A in-process C++ registry (~days, reuse `buildGraphSnapshotJson`)**; defer full InstancesPanel.

## Bake-off RIG state (still running this machine; will need relaunch in fresh session)

- **Element Storybook hub :6006** (`cd webview && npm run storybook`) — composes the mockup as a ref.
- **Mockup Storybook :6008** (`npm --prefix /Volumes/Projects/Development_Projects/Github_Repos/mindful-studio run storybook`).
- Mockup repo: `/Volumes/Projects/Development_Projects/Github_Repos/mindful-studio` — now has **45 stories** (all components),
  authored this session (incl. fixes: GraphCanvas decorator `display:flex`; CommandPalette import `storybook/test` not `@storybook/test`).
- Screenshot pipeline used: chrome-devtools MCP at **deviceScaleFactor 2** (retina) → `magick`/`montage` side-by-sides in `.omo/bakeoff/*.png`.
  Gotchas: navigate/new_page falsely "timeout after 1s" but DO complete; full-screen panels/modals don't `-trim` (use `-gravity` crop);
  the mockup dev-server can hit Vite "Failed to fetch dynamically imported module" (restart :6008 clears it).

## OPEN tasks / next steps

- **Task #9 (pending): gate/remove the `:6008` composition `refs` in `webview/.storybook/main.ts` before any merge** —
  it breaks element's Storybook for anyone without the mockup server up.
- **M0 (C++ lane):** reproduce + fix **CF1** (Element-AU crashes Logic — AX-peer lifetime, `src/plugineditor.cpp`),
  28-bug reconcile, perf re-verify, tests green. (`.omo/audit/crash-element-logic-2026-05-30.md`.)
- **M1 (UI lane):** pilot ONE component end-to-end first (recommend **Block** or **Cable** — heavy merges that prove the
  method), per-component Glen + Chromatic gate, then scale. **Build order:** plugin-scan first (no app without it) →
  nav model (⭐) → Block/Cable/Board → browser/inspector/toolbar → rest. Generic param editor covers nodes; the ~10
  specialised native node editors stay backlog (MVP cut: "must-haves only").
- C++ adds needed for UI: G-29 Bus node + bridge `category` emit (feed Block/BusInspector); Branch-A instance registry (multi-instance).

## How to resume

Read VERDICTS.md + this doc. Relaunch both Storybooks if you need to re-view. Pick the pilot component,
convert mockup→React on Element's stores+bridge+RF per its verdict, wire it, story + Chromatic, get Glen's gate, scale.
Glen prefers: plain-language questions, proper side-by-side images (retina, one pair, well-labelled — NOT crammed grids),
and a running "X/N done" countdown on decision gates.
