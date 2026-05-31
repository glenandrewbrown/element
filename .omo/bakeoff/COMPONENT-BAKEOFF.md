# Element V3 UI — Component Bake-off Matrix

> The build plan, per UI piece. Generated 2026-05-30. Method + rubric: `.omo/plans/mvp-bakeoff-plan.md`.
> **Provisional** design verdicts from the two deep React inventories (B + C). Parity-vs-A column
> filled by task #8 (native-feature agent). Glen reviews + overrides the verdicts (task #7).

## The three Elements

- **A** = original native JUCE UI (`src/ui/`) — the FEATURE baseline (look not ported; features must not be lost).
- **B** = today's React webview (`webview/`) — wired to engine, visually weak.
- **C** = mindful-studio mockup — design target, no engine.

## How to read a verdict (design track, B vs C — architecture NOT scored)

- **Element** — B's component is the better design; keep it, polish lightly.
- **Mockup** — C's is better; re-derive it clean onto Element's stores/bridge/RF.
- **Merge** — take the best of both (usually C's visuals + B's wiring/real-data).
- **Build-new** — both weak → design fresh with Stitch + ui-ux-pro-max + uiverse.

**Flags:** 👁 = close call, needs eyes-on in the rig before locking · Effort = re-house cost (L/M/H) ·
Parity = native (A) feature coverage in the NEW UI (⏳ = pending task #8).

Rubric (design only): paradigm-fit · a11y · interaction · info-density · feature-value.

---

## 1. Canvas core (the heart)

| Piece                        | B (webview)                                                                 | C (mockup)                                                                            | Verdict                                                                                                                                      | 👁  | Effort | Parity vs A |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ----------- |
| **Board / Canvas**           | React Flow v12, wired, semantic-zoom, minimap                               | custom SVG, pan/zoom, **obstacle-route + signal-flow pulses**                         | **Merge** — keep B's React Flow substrate (wired); graft C's routing + pulse visuals (pure logic: `buildPath`/`findDetour`, `useSignalFlow`) | –   | M      | ⏳           |
| **Block**                    | semantic-zoom tiers, ports=Handles, wired, BlockEmbed; container=fake slots | **per-type silhouettes** (clip-path), on-block knobs, B/M/S, RMS, aperture mini-graph | **Merge** — C's silhouettes + on-block controls + aperture; B's zoom-tiers + real ports + wiring                                             | 👁  | H      | ⏳           |
| **Cable**                    | manhattan/bezier toggle, live RMS brightness, wired                         | **obstacle-avoid routing, depth-staggered flow pulses**, tooltips, muted styling      | **Merge** — C's routing+pulses; B's live RMS + connect/disconnect wiring                                                                     | 👁  | M      | ⏳           |
| **Signal-flow trace**        | partial (RMS brightness only)                                               | **BFS trace + spotlight/dim chain** (`useSignalFlow`)                                 | **Mockup** — copy the pure BFS hook onto B's edges/store                                                                                     | –   | L      | ⏳           |
| **CommentFrame**             | `comment` node type, colour-coded, wired                                    | CommentFrame (unwired)                                                                | **Element** — B wired, equivalent design                                                                                                     | –   | L      | ⏳           |
| **Minimap**                  | RF minimap, category colours, wired                                         | MinimapViewport vector, auto-fit                                                      | **Element** (B wired) — check C polish                                                                                                       | 👁  | L      | ⏳           |
| **BlockEmbed** (zoom tier-2) | faders/meter/spectrum (meter+spectrum stubbed)                              | inline in NodeBlock (no separate)                                                     | **Element** — B unique; finish real meter (`Q-VU-PER-BLOCK`)                                                                                 | –   | –      | ⏳           |

## 2. Chrome / shell

| Piece                     | B                                                    | C                                                                                   | Verdict                                                                                       | 👁  | Effort | Parity vs A |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- | ------ | ----------- |
| **App shell / layout**    | AppShell, mode-swapped panels                        | Index hand-rolled (god-component) BUT the foundation IA we adopt                    | **Mockup (foundation)** — adopt C's layout/IA; re-house clean (NOT god-component) on AppShell | –   | M      | ⏳           |
| **Top toolbar**           | Toolbar: file/undo/transport/tempo/mode/scenes/prefs | TopToolbar: mode, breadcrumb, **instance-switcher**, ⌘K, modal launchers, **PANIC** | **Merge** — C's breadcrumb + panic placement; B's transport/tempo/scene wiring                | 👁  | M      | ⏳           |
| **Bottom strip / status** | StatusBar (slim 24px)                                | BottomStrip: transport, master meter, embedded minimap, engine stats                | **Mockup** — C richer; wire B's real engine data                                              | –   | M      | ⏳           |
| **Breadcrumb nav**        | Breadcrumb component                                 | breadcrumb pills + dive/pop (locked nav model)                                      | **Mockup** — wire to real id-based nesting                                                    | –   | M      | ⏳           |

## 3. Browser / inspector

| Piece                          | B                                                                                          | C                                                          | Verdict                                                                       | 👁  | Effort | Parity vs A |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | --- | ------ | ----------- |
| **Plugin Browser**             | ToolPalette: plugins favs/recents/molecules/category + sessions, **wired** (usage tracker) | ToolPalette: search/filter/favorites (library-search look) | **Merge** — C's search-first look; B's wiring + sessions + molecules + usage  | 👁  | M      | ⏳           |
| **Inspector** (docked, locked) | InspectorHub: A/B compare, param sliders, plugin-window embed, note, **wired**             | InspectorPanel: tabbed Block/Bus/Cable/Health              | **Merge** — C's docked tabbed shell; B's wired param/A-B/plugin-embed content | 👁  | H      | ⏳           |
| **ConnectionEditor**           | cable list + add-cable, wired                                                              | ConnectionEditor (unwired)                                 | **Element**                                                                   | –   | L      | ⏳           |
| **BusInspector**               | wireless-bus, wired to bus store                                                           | BusInspector (unwired)                                     | **Element** — needs G-29 engine                                               | –   | M      | ⏳           |

## 4. Add-flow / menus (QuickAdd primary, ⌘K secondary — locked)

| Piece                           | B                                | C                                                    | Verdict                                          | 👁  | Effort | Parity vs A |
| ------------------------------- | -------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | --- | ------ | ----------- |
| **QuickAdd** (primary)          | QuickAddPopup, wired, fav-pinned | QuickAddPopup (unwired)                              | **Element** — B wired; lift C visual if better   | –   | L      | ⏳           |
| **Command palette** (secondary) | CommandPalette, wired            | **CommandPalette 4-mode** (`+`/`@`/`>`), polished UX | **Merge** — C's 4-mode UX onto B's wired palette | 👁  | M      | ⏳           |
| **Node context menu**           | NodeContextMenu, wired           | NodeContextMenu (richer 6-action, unwired)           | **Merge** — C's action set, B wired              | –   | L      | ⏳           |
| **Edge context menu**           | EdgeContextMenu, wired           | EdgeContextMenu (unwired)                            | **Element**                                      | –   | L      | ⏳           |

## 5. Neu primitives (B = the locked design system; cherry-pick C's API ideas)

| Piece       | B                                                                       | C                                                              | Verdict                                                                              | 👁  | Effort | Parity vs A |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --- | ------ | ----------- |
| **NeuKnob** | `color:blue\|teal\|orange` (3), value 0–100, `sourceLabel`, interactive | **`tone` 4-cat** (+modulator), value 0–1, **`readout` string** | **Merge** — adopt C's 4-cat `tone` + `readout`; keep B's interactivity/`sourceLabel` | 👁  | L      | n/a         |
| NeuButton   | canonical, 170-story tested                                             | variant set                                                    | **Element**                                                                          | –   | L      | n/a         |
| NeuBadge    | format/signal pills                                                     | tone pills                                                     | **Element** (verify C tone coverage)                                                 | –   | L      | n/a         |
| NeuToggle   | wired switch                                                            | sliding-dot                                                    | **Element**                                                                          | 👁  | L      | n/a         |
| NeuFader    | mixer fader                                                             | V/H + ticks                                                    | **Element** (check C ticks)                                                          | 👁  | L      | n/a         |
| NeuInput    | pressed field                                                           | pressed field                                                  | **Element**                                                                          | –   | L      | n/a         |
| NeuDisplay  | inset readout                                                           | LCD + glow                                                     | **Element** (check C glow)                                                           | 👁  | L      | n/a         |
| Icon        | lucide allowlist                                                        | lucide wrapper                                                 | **Element**                                                                          | –   | L      | n/a         |
| EmptyState  | + Lottie                                                                | round-icon CTA                                                 | **Element**                                                                          | –   | L      | n/a         |
| Skeleton    | 3 variants                                                              | shimmer                                                        | **Element**                                                                          | –   | L      | n/a         |

## 6. Modals / aux

| Piece               | B                             | C                                   | Verdict                                    | 👁  | Effort | Parity vs A |
| ------------------- | ----------------------------- | ----------------------------------- | ------------------------------------------ | --- | ------ | ----------- |
| **VirtualKeyboard** | 2-oct, wired note on/off      | **5-oct + octave/channel steppers** | **Merge** — C's 5-oct+steppers, B's wiring | 👁  | L      | ⏳           |
| Preferences         | audio/osc/mapping/snap, wired | tabbed, non-persist                 | **Element**                                | –   | M      | ⏳           |
| About               | check-updates                 | BlurText flair                      | **Element** (+ optional C flair)           | –   | L      | ⏳           |
| NeuPromptModal      | replaces native prompt        | modal chassis                       | **Element**                                | –   | L      | ⏳           |
| ScriptEditor (Lua)  | Lua node editor, wired        | textarea + run/stop                 | **Element**                                | –   | L      | ⏳           |
| BlockTabStrip       | open-block tabs               | tab row                             | **Element**                                | –   | L      | ⏳           |

## 7. Bigger features

| Piece                       | B                                     | C                                                           | Verdict                                                                          | 👁  | Effort  | Parity vs A |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | --- | ------- | ----------- |
| **Multi-instance / Mirror** | NONE                                  | **InstanceSwitcher + InstancesPanel + MirrorPanel** (faked) | **Mockup** (only candidate) + **Branch A C++ registry (~days)**. **IN MVP — Branch A in-process registry (Glen 2026-05-30)** | 👁  | H (C++) | new         |
| **Snippets / presets**      | SnippetShelf (molecules, hosts PANIC) | **BlockPresetsPanel** (22 presets, tags, localStorage)      | **Merge** — C's preset system mapped to Element molecules/snippets               | 👁  | M       | ⏳           |

## 8. Deferred (post-v1, not in MVP — do not build now)

Perform mode (QuickAccess, LiveHealth, MacroDashboard, SceneLauncher) · Module tier · rail-tree / SessionTree · DashboardBuilder. (Stores/code stay per D3.)

---

## Tally (design track — provisional, pre-Glen-review)

- **Element wins:** ~14 (most neu + wired editors/menus)
- **Mockup wins:** ~4 (bottom strip, breadcrumb, multi-instance, layout-foundation)
- **Merge:** ~9 (Board, Block, Cable, toolbar, browser, inspector, palette, knob, keyboard, presets, trace)
- **Build-new (design track): 0** — BUT the parity audit (§9) adds **~14 native-only Build-new items**. That is the headline: the B-vs-C design bake-off alone would have silently dropped them.

## Close calls needing eyes-on (👁)

Block · Cable · Top toolbar · Plugin Browser · Inspector · Command palette · NeuKnob · VirtualKeyboard · Minimap · a few neu (Toggle/Fader/Display) · Snippets/presets · Multi-instance.

---

## 9. Native must-keep features — parity vs A (task #8, source-validated)

Two kinds of parity:
- **(a) Components in §1–7** already exist in B → feature present; verify fidelity at eyes-on.
- **(b) NATIVE-ONLY features with NO good B or C home → the at-risk-of-loss set → BUILD-NEW.** The design bake-off would ignore these. This is exactly the "don't lose the original Element" requirement, made concrete.

### Tier 1 — blocks the core workflow (must address before ship) → BUILD-NEW
1. **Plugin scan / rescan + VST/AU path config + format toggles** — MISSING in B *and* C. Without it the browser is empty → no blocks → no graph. (Scan itself is OS/engine = hybrid; the **trigger + progress + path UI must be React**.) **Highest priority — no app without it.**
2. **~10 specialised node editors** — AudioRouter patch-grid, graphical EQ curve, Compressor, MidiProgramMap table, MidiSetList, OSC send/recv, MIDI-device/IO/volume. In B they *all* collapse to the generic param list; C has none. **Biggest fidelity loss.** → **DEFERRED to tracked backlog (Glen 2026-05-30: MVP = must-haves only; NOT dropped). MVP covers these via the generic param editor.**
3. **MIDI controller-mapping editor** — native is a full device/map editor; B has only a learn-toggle + remove-row.

### Tier 2 — major parity gaps → BUILD-NEW
4. **Molecule / snippet SAVE** (B is load-only — can't create templates).
5. **Graph mixer (fader view)** + **Meter bridge** (interface levels) — no B/C equivalent.
6. **Lua console / REPL** (app-level; the Script *node* editor ≠ console).
7. **Preset/chain file UI** (.eln/.elpreset) + **Controller file UI** (.elc).
8. **Inspector LOG tab** (real log stream; B is a placeholder).

### Tier 3 — editing niceties / polish → small Build-new or Merge-into-existing
9. **Node colour** (user-set 8 presets; B uses category-derived only).
10. **Compact / Small block display modes** (user-chosen; B has only auto semantic-zoom).
11. **Node align / distribute**, **insert-plugin-on-wire**, **layout-direction (H/V) toggle**.
12. **Keymap editor** (custom shortcuts; B has fixed handlers).
13. **MIDI clock sync/send**, **keyboard splits**.
14. **PARTIAL polish:** audio-device prefs actually populated, editable BPM, live timecode.

### Hybrid (OS-service-backed — React must own the TRIGGER/surface; NOT "native-only")
File choosers (open/save/import/export) · audio+MIDI device enumeration → React selection UI · plugin-scan trigger/progress/paths · plugin-GUI embed/float controls.

### Do NOT rebuild — D3-shelved (present in B, intentionally hidden; parity docs are stale here)
Scene/Preset system (SceneLauncher) · MacroDashboard · DashboardBuilder. Code/stores stay as reversible backlog.

### Doc trust
Native baseline (A) = source-validated (high). The 5 webview-parity docs predate the 2026-05-30 pivot → their B-status/"must-port" verdicts are stale; re-derived from the live tree. Full report: agent `a4161e2727bf24aed`.

---

## The build plan, in one line
**§1–7 design verdicts** (keep/merge/mockup per piece, on the real engine) **+ the MVP Build-new set.**

**MVP Build-new (LOCKED — Glen 2026-05-30 "must-haves only"):** (1) **plugin scan + paths + format toggles** — FIRST, nothing works without it; (2) **MIDI-mapping editor**; (3) **one strong generic param editor** for every node. Everything else in §9 (the ~10 specialised editors, graph mixer, meter bridge, Lua console, preset/controller files, log tab, node colour, align/distribute, keymap, MIDI clock) is **tracked backlog for after v1 — deferred, not dropped.**

**Sequence:** plugin-scan → MIDI-map editor + generic param editor → the design merges (§1–7), interleaved — all on the parallel UI lane while the C++ stabilise lane (CF1) runs alongside. Multi-instance/Mirror: **IN MVP via Branch A** (in-process registry, common hosts; degrade gracefully on AUv3/sandboxed).
