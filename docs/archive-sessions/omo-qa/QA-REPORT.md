# Element — Full Visual QA Report (autonomous, video-capture workflow)

**Date:** 2026-06-03 · **Build under test:** `build-merged/element_app_artefacts/Element.app`
· **Project:** reltest1 / Graph board · **Device:** Fireface 802 @ 48 kHz / 512 ·
**Engine:** RUNNING throughout.

**Method:** real-motion screen recording (`record-screen.sh` → ffmpeg avfoundation,
12–15 fps) + live UI driving via computer-use, then frame extraction / analyze_video.
The live webview is a `WKWebView` (no CDP/DOM hook), so runtime truth = pixels +
native AX + cross-checked against source. Honors NOTHING-fake + judge-interaction-not-stills.

## Artifacts
- Clips (real motion): `.omo/qa/clips/{A-overview-zoom,C-signal-meter,D-nav-palette-cables}.mp4`
  + 4× condensed `*-4x.mp4` (watchable: A 8s, C 43s, D 97s).
- Key frames: `.omo/qa/frames/` — incl. `Cw-timeline.png` (the dark→green VU proof),
  `A-tiers.png` (zoom tiers), `vu_stopped.png`.
- Findings ledger: 11 entries appended to `.omo/audit/ui-comments.jsonl`
  (`source:autonomous-visual-qa-2026-06-03`).
- Storybook reference set (prior): 260 tight shots `.omo/qa/sb-shots/`; a11y `.omo/qa/a11y-report.json`.

---

## Verdict: SHIP-QUALITY UI with 2 real P2 defects + 2 P3 polish items. NOTHING-fake holds.

Every live component metered REAL engine data. No placeholder/idle/mock surfaced. The
two P2s are small, isolated, and have precise source-level fixes.

## Defects

| # | Sev | Area | Defect | Fix |
|---|-----|------|--------|-----|
| 1 | **P2** | Command Palette | Cmd+K palette does **not close on Escape** (footer literally says "esc close"). Reproduced 3×; backdrop-click closes. | `CommandPalette.tsx:397` has `case "Escape":onClose()` but it's on element-level `onKeyDown` (L430) which doesn't receive Esc in the JUCE WebView. Use a **window-level** keydown listener (as `useKeyboard`/QuickAdd do). |
| 2 | **P2** | LIVE HEALTH | Renders raw unrounded floats: CPU `2.3904370739366%` (13 dp), LATENCY `23.16666666ms` **wraps to 2 lines**. The HOST METERS block right below rounds correctly (`2.4%`,`23.2 ms`). | Round CPU→1 dp, latency→1 dp in the LiveHealth component. Story mocks won't catch (real engine emits full precision). |
| 3 | P3 | Block zoom | STANDARD semantic-tier band (zoom 0.5–0.8) is narrow; mouse-wheel steps jump expanded↔compact, skipping it. | Widen band or snap-to-tier on wheel zoom. (`zoomToTier`, `useGraphStore.ts:59`.) |
| 4 | P3 | Block VU | VU holds green a few s after the source stops (peak-hold/residual). | Confirm intended hold/decay rate vs stale snapshot. Real RMS otherwise (see PASS below). |

## Passes (verified at runtime, with evidence)

- ✅ **Signal → meter (HERO / NOTHING-fake).** Added an Audio File Player, loaded
  `/System/Library/Sounds/Funk.aiff`, pressed Play → the block's output VU lit **green**.
  Frame proof `Cw-timeline.png`: **pre-play frames DARK, post-play GREEN**; the Valhalla
  block (no input) stayed dark → the meter is node-discriminating and signal-coupled.
  Source: `useNodeMeterStore` = real per-node output RMS, 60 Hz host snapshot, *"silent
  node reports 0, nothing fabricated."*
- ✅ **LIVE HEALTH = real telemetry.** CPU LOAD updates frame-to-frame; latency matches
  512@48k; "Smart cables: 0 level channel(s)" matches CABLES:0.
- ✅ **Block render + semantic zoom.** EXPANDED shows the plugin's REAL VST3 params
  (Mix/DelaySync/Feedback/Density/Width/LowCut/HighCut/ModRate/…); COMPACT name-chip;
  swap wired to React Flow viewport zoom.
- ✅ **Command Palette** opens (Cmd+K), live-filters, keyboard hints. (Esc-close = defect #1.)
- ✅ **Discovery/insertion.** Right-click → CanvasContextMenu (Add Block/Comment/Paste/Fit/
  Zoom/Snap/Minimap/Auto-Layout); "Add Block…" → QuickAdd fuzzy search w/ category badges.
- ✅ **Audio File Player** loads via Cmd+Shift+G file dialog, transport + Loop work.
- ✅ **Panel nav** (Cmd+1/2/3/4 collapse sidebars → full-canvas focus mode); block drag-move.
- ✅ **Perform mode correctly absent** (D3 shelved; not a defect).

## Accessibility (axe-core over 260 Storybook stories — the faithful DOM signal)

161/260 stories carry violations. By impact: **16 critical, 157 serious, 3 moderate.**
Dominated by:
- **color-contrast** (serious) — 150 stories / 819 nodes. The neumorphic low-tonal-range
  palette (secondary text `#8E8E93` on `#1E1E22`-family surfaces) trips WCAG AA broadly.
  Design-intentional tension; needs a deliberate contrast pass on secondary/label text.
- **button-name** (critical) — 10 stories / 17 nodes: icon-only buttons missing accessible names.
- **select-name** (critical) — 5; **landmark-unique** (mod) 3; **aria-prohibited-attr** 3; **nested-interactive** 2.
Lowest-effort/highest-impact: add aria-labels to icon buttons (clears most criticals);
then a secondary-text contrast bump.

## Limitations / honesty notes
- **Cable creation not exercised** via automation — React Flow port handles are <10px;
  3 drags grabbed the block body. Automation limitation, not an app defect (a human mouse
  hits them). Cable render/routing covered by Storybook Cable stories + BEZ toolbar toggle.
- analyze_video ran but, for a mostly-static screencast, collapsed to ~1 key frame + weak
  OCR — my own full-res frame extraction was the higher-fidelity analysis path.
- Native AX suite (`.omo/qa/ax-all.json`, 6/19) is largely **obsolete for the webview**:
  WKWebView doesn't bridge accessible names to external AX, and several checks target
  shelved UI. Not visual defects.
- One stills-driven mis-read (VU "stuck") was **corrected by video frames** — exactly why
  this run weighted motion over single screenshots.
- App left with an added Audio File Player + moved blocks (UNSAVED — resets on relaunch).
