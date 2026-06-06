# Element — App Status for Glen's QA (2026-06-06)

## TL;DR
**The CV/Value signal system was DEAD in every live graph since it shipped — now resurrected, proof-gated, and built on:** a full **conditional/logic routing family** (6 new Blocks) + **Flow-Debug mode** (live signal readout on every cable). 4 commits on `chromatic-ui-review`, all formats rebuilt + reinstalled. This closes Pillar-1 gap #1 from your interview (logic routing + flow-debugging — you flagged it twice).

## THE HEADLINE FINDING (honesty first)
The orange Value/CV cables have NEVER carried signal in the live app. The graph compiler skipped CV ports entirely (no buffers, no routing; every node saw a 0-channel CV buffer), so the whole existing CV family — Constant, Add/Subtract/Multiply/Divide, Trigger, Readout — was dead code at runtime. Unit tests stayed green for years because they bypassed the graph compiler. The interview's premise "Modulation/CV adequate" was false.
**Fixed at the GraphBuilder level** (parallel CV buffer pool, real routing ops, per-port value latches) and **proof-gated**: a new mandatory test suite (`CVFlowTests`) drives REAL built graphs — value flows, sums, chains, and a Comparator condition evaluated through the live engine.

## INSTALLED — where
| Form | Location |
|---|---|
| Standalone | `~/Applications/Element.app` (fresh, ad-hoc signed) |
| VST3 | `~/Library/Audio/Plug-Ins/VST3/KV-Element.vst3` + `KV-Element-FX.vst3` |
| AU | `~/Library/Audio/Plug-Ins/Components/KV-Element.component` + `-FX` + `-MFX` |
| CLAP | built (not installed): `build-merged/element_*_artefacts/CLAP/` |

All 8 bundles carry webview `index-ClSGGixN.js` + binary with the CV engine (verified per-bundle).

## NEW — what to test (pass criteria)

### 1. ⭐ Conditional routing (the core new capability)
QuickAdd (right-click canvas) → add these — all 6 are new:
| Block | Category | Does |
|---|---|---|
| **Comparator** | Modulators ⬡ | A ⟨op⟩ B → 1/0 (default op `>`) |
| **Logic Gate** | Modulators ⬡ | AND/OR/XOR/NAND/NOR/NOT on CV |
| **Envelope Follower** | Modulators ⬡ | audio in → CV level out ("is signal present?") |
| **Audio Gate** | Modulators ⬡ | passes audio while `Open` CV ≥ 0.5 (click-free 5ms ramp) |
| **MIDI Gate** | MIDI FX ▲ | passes MIDI while open; **panics (all-notes-off) at the exact closing sample** — try closing it mid-note: no stuck notes, ever |
| **Audio Switch** | Modulators ⬡ | A/B selector by CV, 5ms crossfade |

**Recipe to try:** `Constant (set ~0.8)` → `Comparator.A`; `Constant (0.5)` → `Comparator.B`; `Comparator → Audio Gate.Open`; route any synth through the Gate. Audio passes. Lower the first Constant below 0.5 → audio gates out, click-free.
**Pass:** the orange cables now actually carry values (watch them light), and the existing math/Trigger/Readout Blocks WORK for the first time.

### 2. ⭐ Flow-Debug mode (press `D`, or the FLOW toolbar button)
Every cable grows a live mid-cable chip:
- **Audio** → live dB readout (blue)
- **Value/CV** → the SIGNED value, e.g. `-0.80` / `1.00` (orange) — watch a Comparator flip 0.00→1.00 live
- **MIDI** → `● midi` activity (teal)
- **No signal** → dim `—` (this is what a closed gate's downstream looks like — the "conditional cable" visual)
**Pass:** chips update live, no canvas lag with ~20 cables, `D` toggles on/off. (Plain `D` — Cmd+D is still duplicate.)

### 3. CV-only Blocks light their VU
Constant/Comparator/etc. show real meter level from their CV value (no more falsely-dark utility blocks).

### 4. Everything from the 2026-06-05 sheet still applies
(container dive, lean blocks, param config, auto-route ghosts, ★ favourites, editor open/✕) — regression-swept: full engine ctest green; webview 2563 tests, 0 fail; stories 315/317 (2 pre-existing fails only).

## Scriptable live check (for me/agents)
`/element/query dumpcv [path]` over OSC (port 9000) → writes every node's CV output values as JSON. Verified live on the installed app this session. With your session open + a Constant wired, expect real values — the autonomous engine-truth probe.

## KNOWN ISSUES / LIMITS
- **Comparator/Logic op switching has no UI yet** — default ops (`>` / AND) work; modes are persisted+tested engine-side; a small mode dropdown is the queued papercut. Tell me if you want it next.
- **CV across Container boundaries** not routed yet (CV flows within one Board level); CV ignores latency compensation (v1).
- **Flow-debug in plugin form**: the AU/VST3 *Blocks* work everywhere, but the chip overlay rides the standalone webview only (plugin-editor parity = Pillar-4 backlog, unchanged).
- Sandbox env-flaky suites (`SandboxStress` hang, `SandboxOrderedShutdown` 406s) excluded from the sweep — pre-existing, untouched by this work, no relation to CV.
- Esc-vs-focused-plugin-editor + sandbox-default-on + autosave: unchanged from yesterday's sheet.

## Commits (chromatic-ui-review)
- `404ee3c3` engine: CV routed through the graph + 6-node logic family [W0+W1]
- `4b6ecb20` webview: Flow-Debug mode [W3]
- `11759e80` host: CV feed + OSC dumpcv + taxonomy [W2+W4]
(+ this docs commit)

## Storybook sign-off renders
`.omo/qa/frames/flow-debug-{cv-value,audio-hot,audio-silent,midi-active,control-value-dash}.png` — chip states, self-verified. Visual-only; engine truth = CVFlowTests + live dumpcv.
