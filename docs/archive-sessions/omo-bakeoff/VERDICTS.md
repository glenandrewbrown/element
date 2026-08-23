# Bake-off — Locked verdicts (live audit with Glen, 2026-05-30)

Running log of Glen's per-component calls. Reconciled into COMPONENT-BAKEOFF.md at the end.

| # | Component | Verdict | Detail |
|---|-----------|---------|--------|
| 1 | Block | **Merge (lighter)** | Mockup's real knobs + B/M/S + labeled ports + active LED + type icon on YOUR engine (real ports/params/zoom). DROP the on-block RMS meter (cut clutter at small zoom). |
| 2 | Cable | **Merge** | Mockup's flow-pulse + endpoint plugs + arrowhead + bend-around-blocks routing; KEEP your live RMS glow + real connect/disconnect. |
| 3 | Board / canvas | **Merge + trace + arrange toolbar** | KEEP React Flow board (wired, auto-fit, minimap, semantic zoom); ADD mockup's select-to-trace spotlight + floating arrange toolbar (H/V/distribute/Clean). |
| 4 | Toolbar | **Adapt — mockup buttons, new Edit-only layout** | Glen: likes the mockup's BUTTONS; neither layout/content is right. Perform shelved → DROP the EDIT/PERFORM toggle. Design a fresh Edit-only top bar = mockup button styling + best content of both (file actions, breadcrumb, instance-switcher, ⌘K, PANIC; transport/stats either top or split to bottom strip). Needs a design pass. |
| 5 | Plugin Browser | **Merge — mockup list + your structure** | Mockup's search-first flat list + category filter chips ON your structure (Plugins/Projects tabs, favourites, recents, molecules, usage) wired to the real plugin list. PLUS build the scan/rescan/paths controls (#1 native gap). |
| 6 | Inspector | **Merge — mockup shell + your content** | Mockup's docked tabbed shell (Block / Bus / Cable / Health) with YOUR wired content: param sliders, A/B preset compare, plugin-window embed, per-block note. |
| 7 | Command palette | **Merge — mockup 4-mode + your wiring** | Mockup's 4-mode bar (+Block / @Board / >Command) + category-tile results, driving your real wired commands/plugins/boards. Secondary surface (QuickAdd is primary add). |
| 8 | NeuKnob | **Add purple (4th cat) only** | Extend your knob's colour set to the 4th category (modulator/purple); SKIP the mockup's readout string. Keep your dial + drag interactivity. |
| 9 | NeuToggle | **Use mockup** | Mockup's green 'Active'-style toggle. |
| 10 | NeuFader | **Use mockup** | Mockup's fader. |
| 11 | NeuDisplay | **Use mockup** | Mockup's display (small label over big value, BPM-style). |
| 12 | NeuButton | **Merge** | Keep YOUR variants + colours (default/active/panic etc.); adopt the mockup's filled/solid button STYLE. |
| 13 | NeuBadge | **Keep yours** | Your format chips (VST3/AU/CLAP/LV2) + colour set — richer. |
| 14 | NeuInput | **Keep yours** | Near-identical; keep yours. |
| 15 | NeuIcon | **Keep yours** | Your lucide allowlist wrapper. |
| 16 | NeuEmptyState | **Use mockup** | Mockup's 'Empty board' + round-icon style. |
| 17 | NeuSkeleton | **Merge** | Combine both shimmer sets (line/circle/card/block). |
| 18 | VirtualKeyboard | **Use mockup** | Mockup's 5-octave keyboard + octave/channel steppers; re-add velocity control + real MIDI note-on/off wiring. |
| 19 | Multi-instance / Mirror | **Approve (simplified MVP)** | Build InstanceSwitcher + MirrorPanel (live read-only) FIRST on the Branch-A in-process registry; DEFER the full InstancesPanel roster/actions polish to post-MVP. |
| 20 | Snippets / presets | **Merge into one panel** | One unified save/recall panel using the mockup's tag/filter/save UX, handling BOTH single-block presets AND multi-block group snippets. |
| 21 | Minimap | **Merge — RF wiring + mockup look** | Keep React Flow minimap (wired, auto-syncs graph + viewport); restyle to the mockup's look (category-coloured node bars + viewport frame). |
| 22 | Bottom strip | **Merge 50/50** | Mockup's transport + master meter; KEEP your slim status-field styling for device/SR/buffer/latency/timecode/RUNNING. Wire real engine data. |
| 23 | App shell / layout | **Adopt mockup slot model** | Rebuild the shell on the mockup's generic slot primitive (topBar/leftRail/main/rightRail/bottomBar); place your panels (toolbar/palette/canvas/inspector/shelf) into those slots. |
| 24 | Breadcrumb + Navigation | **⭐ USE MOCKUP — adopt the ENTIRE nav model + handling** | Glen-flagged TOP mockup win. Adopt the mockup's complete enter/exit + nested-state UX; adapt Element's code to match: double-click a Container/Portal **block** → dive into its nested board (150ms); **inside-state chrome** = nested-canvas-frame border + left depth-ribbon + animated depth-banner ("Nested · Level N · {board} inside {parent}") + EXIT button; double-click empty canvas → up one level; depth-tinted breadcrumb pills. **Spans Block (dive gesture) + Board/canvas (nested chrome) + Breadcrumb** — refines row 1 (Block) & row 3 (Board). |

> ⭐ **NAVIGATION — Glen top priority (2026-05-30):** the mockup's breadcrumb/block/navigation handling — how you ENTER and EXIT nested boards, and how the "you are inside a nested board" state is visually illustrated (nested frame + depth ribbon + depth banner + EXIT) — is one of the BEST aspects of the mockup. **Adopt it ENTIRELY and adapt Element's code to match that design.** This is a cross-cutting nav rule touching Block, Board/canvas, and Breadcrumb.

| 25 | BlockEmbed | **Use mockup** | Adopt the mockup's in-block expanded embed; re-add your real meter/spectrum data. |
| 26 | CommentFrame | **Use mockup frame + your inline label** | Mockup's rounded frame + label-tab styling, PLUS keep your inline label; re-wire CRUD + colour-coding. |
| 27 | QuickAdd | **Merge** | Mockup's port-type-aware filtering ("ADD BLOCK ACCEPTING <type>" when dragging off a port) + your favourites/recents + format badges + wired insert-at-cursor. |
| 28 | NodeContextMenu | **Your look + merge ops + native-parity** | Keep YOUR menu look; merge both React action sets; + ADD native node-menu items dropped in React (from `src/ui/contextmenus.hpp`): **Disconnect** submenu (All/MIDI/Input/Output ports) · **Color** (user-set node colour) · **Oversample** (Off/2×/4×/8×) · **Replace** plugin in-place · **Connect via Sources/Destinations** submenus · rich **Presets** (Save node / Save-as-default / Reset-default / Factory / Native FXB-FXP load+save / program select) · **Enable/Disable** · **Rename**. |
| 29 | EdgeContextMenu | **Use mockup** | Adopt the mockup's cable right-click menu; re-wire to real disconnect/bus ops; + native-parity check for any dropped native cable/arc menu items. |
| 30 | Keyboard shortcuts | **Merge + full customisation** | Adopt the mockup's shortcuts reference sheet (?-overlay) wired to your real shortcuts; PLUS build FULL key-command assignment/customisation in Preferences (resurrect the native JUCE keymap-editor). Editable shortcuts IN MVP (pulled in from backlog by Glen). |
| 31 | ConnectionEditor | **Merge** | Your full cable-list + add-form + type-filters + wiring; adopt any nicer styling from the mockup's editor. |
| 32 | BusInspector | **Merge** | Your wiring (bus store + cable-ghost preview) + mockup's detail-card styling (name/type/peers/level/mute-solo). |
| 33 | Preferences | **Merge** | Mockup's tabbed shell (Appearance/Audio/MIDI/Shortcuts) housing YOUR wired audio/OSC/MIDI-map settings + the new key-command customisation (Shortcuts tab); also build the native gaps here — audio-device enumeration + plugin scan/paths/format-toggles. |
| 34 | About | **Keep yours** | Your About modal (version/JUCE/WebView + check-for-updates) as-is. |
| 35 | NeuPromptModal | **Merge** | Your wired single-field prompt + any nicer detail from the mockup's. |
| 36 | ScriptEditor | **Merge** | Mockup's cleaner code-editor surface (syntax + line numbers) + your SAVE & COMPILE + real Lua engine wiring. |
| 37 | BlockTabStrip | **Merge** | Your wired open-block tabs + the mockup's tab styling (badges / active-state). |

**✅ ALL 37 LOCKED (2026-05-30).** Tally: ~Element 5 · Mockup 9 · Merge 19 · Adopt-mockup-model 4 (toggle/fader/display/empty/BlockEmbed/multi-instance/nav…). Cross-cutting: ⭐ adopt mockup nav wholesale; node-menu native-parity additions; keymap-editor + plugin-scan/paths pulled into MVP; Perform mode shelved.

## Global adaptations (apply to EVERY component)
- **Perform mode is shelved from MVP** → strip the EDIT/PERFORM toggle + all perform-only affordances; use the edit/default variant. Touches Toolbar, AppShell, BottomStrip, and any component with a perform state.
