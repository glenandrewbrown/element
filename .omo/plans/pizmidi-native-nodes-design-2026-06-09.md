# Design Spec — pizmidi → Element Native On-Block MIDI Nodes

- **Date:** 2026-06-09
- **Author:** Claude (brainstormed with Glen)
- **Branch:** `pizmidi-native-nodes` (worktree off wave-3 tip `8b607e4a`)
- **Status:** Design — awaiting spec review, then implementation plan
- **Parallel session:** another Claude session is on `wave-3-leanfast-ux` running a UI/UX QA loop (churns `Block.tsx` / `GraphCanvas.tsx` / stores / cables). This work is engineered to stay file-disjoint from it.

## 1. Goal

Convert the **pizmidi** MIDI plugin collection into **Element native built-in nodes** whose controls render **directly on the block face** in the canvas (live-editable, no separate editor window required). Core MIDI processing of each plugin is preserved (behavioural parity), while the UI/UX of each plugin is **freshly designed by an expert design pass** and intelligently improved (controls, layout, interaction, and — where approved — function).

**Source repo:** `/Volumes/Projects/Development_Projects/Github_Repos/pizmidi_2025` (graphify graph at `pizmidi_2025/graphify-out/`).

## 2. Key finding — this is an *extension*, not greenfield

The wave-3 tip already contains the load-bearing foundation (verified on disk):

- **5 atomic-param MIDI nodes** already exist and establish the pattern: `midiTranspose`, `midiChannelFilter`, `midiVelocityAmp`, `packMidi`, `unpackMidi` (+ `midiGate`). Each is a **header-only `element::Processor`** with parameters as `std::atomic<T>` + typed `setX/getX` (lock-free, RT-safe). Registered in `src/engine/nodefactory.cpp:142-160`.
- **On-block control system already exists:** `InlineFace` + `INLINE_FACE_REGISTRY` (`webview/src/components/canvas/inlineParams.ts`, `inline/`). `Block.tsx` already mounts `<InlineFace>` (line ~1757), keyed on node `identifier`. Only **2 nodes wired so far** (`element.compare`, `element.logic`).

This work **extends both registries**. It does **not** rebuild Block rendering.

## 3. Licensing basis

- `pizmidi-modern/` (the port source) declares **MIT License** (`pizmidi-modern/README.md`). MIT is compatible with Element's **GPL-3.0-or-later** (permissive folds into GPL).
- The legacy VST2 `pizmidi/` tree bundles GPLv2-era JUCE and has no clear top-level license → **do not copy from it**. For any plugin not present in `pizmidi-modern/`, reimplement the algorithm in Element's idiom from observed behaviour.
- **Compliance:** preserve attribution. Add `THIRD-PARTY-NOTICES.md` entry crediting *Insert Piz Here / pizmidi (MIT)* and a short attribution header comment in each ported node file.

## 4. Scope

**~38 distinct nodes** — all cleanly-portable TRIVIAL + MODERATE plugins. (40 plugins listed below, minus 2 velocity merges = ~38 distinct nodes: ~35 new + 3 already-existing to wire.)

**TRIVIAL (~22):** `midiGain`* · `midiChannelize` · `midiChannelFilter`✅ · `midiBlackKeyFilter` · `midiForceToRange` · `midiNotchFilter` · `midiTranspose`✅ · `midiInvertNotes` · `midiProbability` · `midiDuplicateBlocker` · `midiNoteToggle` · `midiPitchBendQuantize` · `midiCCReset` · `midiCCToggle` · `midiProgramChange` · `midiAlias` · `midiSostenuto` · `midiPitchBendToNotes` · `midiFingered` · `midiStuckNoteKiller` · `midiOverlappingNoteKiller` · `midiChs`

**MODERATE (~18):** `midiForceToKey` · `midiScaleChanger` · `midiVelocityScale`* · `midiKeySplit` · `midiKeySplit4` · `midiNoteGroups` · `midiChordHold` · `midiPolyphony` · `midiNotesToCC` · `midiCCModulator` · `midi16CCRouter`◆ · `midiChordSplit`◆ · `midiNRPNConverter`◆ · `midiNoteMap`◆ · `midiTriggerList` · `midiMultiProgramChange` · `midiConverter3` · `midiHumanizer`

Legend: ✅ already exists (wire its face) · ◆ dense (miniGrid + expand) · * **velocity merge** — `midiGain` + `midiVelocityScale` fold into the existing `midiVelocityAmp` (one node covering gain/scale/curve/power), so they are not separate nodes.

**Explicitly OUT of scope:**
- `midi2qwerty16` (emits OS keystrokes, not MIDI) — un-portable.
- `midiAudioToCC` (needs audio input ports) — different node class; revisit separately.
- `pizMidiRack` / `BigClock` / `KVRBrowser` (host/container/display, not MIDI processors).
- **Tempo-synced set** (`midiDelay`, `midiNoteRepeater`, `midiSwing`, `midiCCStepper`, `midiSimpleLFO`) — need host BPM/PPQ in `render`; **deferred pending a tempo-access spike** (see §11).
- **pizjuce rewrites** (`midiLooper`, `midiStep`, `midiCurve`, `midiChords`) — large rewrites, separate effort.

## 5. Architecture

### 5.1 Node model (C++)

Each plugin → one **header-only** `class XxxNode : public element::Processor` in `src/nodes/`:

- Params as `std::atomic<T>` members + typed `setX/getX` (message-thread writes, audio-thread reads, `memory_order_relaxed`). RT-safe by construction.
- `render(RenderContext& rc)`: read `rc.midi.getWriteBuffer(0)`, transform into a pre-allocated `juce::MidiBuffer scratch`, `buf->swapWith(scratch)`. No allocation on the audio path.
- Core logic ported **1:1** from pizmidi-modern `processMidi(in, out, numSamples)` → `render`.
- Implement `prepareToRender / releaseResources / getState / setState / getPluginDescription / refreshPorts`.
- Register: one `#include` + one `add(new SingleNodeProvider<XxxNode>("element.xxx"));` line in `nodefactory.cpp`.
- Header-only nodes need **no CMake reconfigure**.

### 5.2 Parameter bridge — `InlineParamControl` (O(1) host edits)

The generic "B-1 atomic param bridge" was only ever a planning decision and **never shipped**. The real, RT-safe mechanism available today is the typed-atomic-setter + an `elementNodeSetIntMode`-style `dynamic_cast` bridge. To make it scale to ~38 nodes **without editing the shared host file per node**, introduce one small interface:

```cpp
struct InlineParamControl {
    virtual ~InlineParamControl() = default;
    virtual bool   setInlineParam (const juce::String& key, double value) = 0;
    virtual double getInlineParam (const juce::String& key) const = 0;
    virtual void   listInlineParams (juce::Array<InlineParamInfo>& out) const = 0; // key,label,min,max,step,kind
};
```

Every MIDI node implements it (in its own new header). Then:

- **Write path:** generalize `setNodeIntMode` → **one** `elementNodeSetParam(uuid, key, value)` native fn that does a single `dynamic_cast<InlineParamControl*>(proc)` and calls `setInlineParam`. (`element_webview_host.cpp`, ~line 1383/7456; calls `scheduleGraphPush(40)` so the UI re-reads engine truth.)
- **Read path:** **one** generic loop in `buildActiveGraphJson` (~line 6640) emitting each node's `listInlineParams()` values into the block JSON snapshot (60 Hz, debounced).

**Result: adding 40 nodes requires zero further `element_webview_host.cpp` edits** — the single biggest merge-safety lever.

### 5.3 On-block face (webview)

`INLINE_FACE_REGISTRY` entry per node, keyed on `identifier`. An entry specifies **either**:

- `entries: InlineFaceEntry[]` — generic control list (the common case), **or**
- `component: React.FC<FaceProps>` — a **bespoke hand-designed face** (for plugins whose expert design needs custom layout).

Both render through the single `<InlineFace>` mount in `Block.tsx` and both read/write via the `InlineParamControl` data path. **`Block.tsx` is never structurally edited.**

**Entry-kinds** (added once in `inline/`):

| kind | for | write |
|---|---|---|
| `atomicKnob` | continuous param | `nativeNodeSetParam` |
| `stepper` | discrete ±int | `nativeNodeSetParam` |
| `chooser` | enum/mode | `nativeNodeSetIntMode` (existing) |
| `toggle` | bool | `nativeNodeSetParam` |
| `miniGrid` | dense table summary → click expands | read + expand |
| `activity` | live MIDI in/out indicator (real flow) | read-only |

**Adaptive density:** each param in a registry entry carries a tier flag `face` | `expand`. The face renders the `face` subset; `expand` params (and dense `miniGrid` editors) render in the expanded block body / Inspector. Simple nodes mark all params `face`; dense nodes mark only essentials `face`.

### 5.4 Data flow summary

```
message thread  setInlineParam(key,val) ── atomic store ──► node param
                       ▲                                        │
   webview face ── nativeNodeSetParam(uuid,key,val) ──► elementNodeSetParam (1 cast)
                                                                │ render() reads atomic (RT-safe)
   webview face ◄── block JSON snapshot (60Hz) ◄── buildActiveGraphJson listInlineParams() loop
```

## 6. Expert design lane

Design is a **first-class gate before implementation**, per Glen's requirement and the project's locked rule that explicit design tools are mandatory and the Storybook Review-wizard is the review method.

**Toolbelt (named, baked into every design task, usage verified):** `oh-my-claudecode:designer` agent · `ui-ux-pro-max` skill · `neumorphism-generator` (locked dark tokens) · `uiverse-galaxy` (neu component sourcing) · `reactbits` (motion/feedback). Output authored as **Storybook stories** → **Review wizard** side-by-side for Glen's verdict → **Chromatic** visual governance. Reviews judge **interaction** (drag, feedback, state transitions), not static stills.

**Archetype system (~8 control families):** plugins cluster so related controls/layouts/functions are unified and improved together.

1. **Transform** — `midiTranspose`, `midiInvertNotes`, `midiForceToRange`, `midiPitchBendQuantize`, `midiVelocityAmp`, `midiPitchBendToNotes`
2. **Filter / Gate** — `midiChannelFilter`, `midiBlackKeyFilter`, `midiNotchFilter`, `midiProbability`, `midiDuplicateBlocker`, `midiStuckNoteKiller`, `midiOverlappingNoteKiller`
3. **Channel-route** — `midiChannelize`, `midiChs`, `midiKeySplit`, `midiKeySplit4`
4. **Scale / Key** — `midiForceToKey`, `midiScaleChanger`, `midiAlias`
5. **CC-map / modulate** — `midiNotesToCC`, `midiCCModulator`, `midi16CCRouter`, `midiCCToggle`, `midiCCReset`, `midiConverter3`
6. **Chord / Voice** — `midiChordHold`, `midiChordSplit`, `midiPolyphony`, `midiFingered`, `midiSostenuto`
7. **Dense-table** — `midiNoteMap`, `midiNRPNConverter`, `midiNoteGroups`
8. **Generator / Trigger** — `midiProgramChange`, `midiMultiProgramChange`, `midiTriggerList`, `midiHumanizer`

(Archetype membership is finalised in the design-system pass; some plugins may move.)

**Design depth (Glen's choice):** archetype system first for one consistent neu language, then **every plugin gets its own design pass** that customises and improves within or beyond its archetype — fully bespoke where its function warrants. Cross-plugin improvement happens at the cluster review.

## 7. Per-plugin port unit (repeatable, file-disjoint)

1. **Design pass** — design agent + toolbelt produce the face (layout · controls · interaction · improvement proposals) as a Storybook story.
2. **Review-wizard gate** — Glen gives ACCEPT / revise. Functional changes are flagged and require Glen's approval (core MIDI processing preserved otherwise).
3. **Node** — `src/nodes/midiXxx.hpp` (`Processor` + atomics + `InlineParamControl` + ported `render` + MIT attribution header) + 1 `nodefactory.cpp` registration line.
4. **Face wiring** — 1 `INLINE_FACE_REGISTRY` entry (`entries` or `component`).
5. **Tests** — parity ctest + face vitest/Chromatic.
6. **Commit** — atomic (stage + commit in one operation).

Files touched per node: `src/nodes/*` (new), `nodefactory.cpp` (append), `inlineParams.ts` (append), optionally `inline/*` (new bespoke component or new entry-kind), optionally `inline/*.stories.tsx`. **Never** `Block.tsx` / `GraphCanvas.tsx` / `useAppStore.ts` / `Cable.tsx`.

## 8. Testing & verification

- **MIDI parity (mandatory per node):** Boost.Test ctest feeding a known `MidiBuffer` input → asserting output equals a reference vector derived from pizmidi-modern behaviour. This mechanically proves "core processing fundamentally the same."
- **Faces:** vitest for entry-kinds + `InlineFace` render; Storybook story + Chromatic per face.
- **Nothing-fake rule:** the `activity` indicator must reflect **real** MIDI flow (signal → indicator test), never an idle placeholder.
- **Gates per phase:** `tsc` clean · vitest green · C++ build 0-err · ctest green · live smoke (drag a control on a block → MIDI output changes).

## 9. Improvement policy

Glen invited review and intelligent improvement of controls, layouts, and **functions**. The expert design pass proposes improvements per plugin and per cluster. Rules:

- Visual/control/layout improvements: design pass owns them, shipped via the Review-wizard gate.
- **Functional** changes (behaviour, defaults, control semantics): flagged explicitly, require Glen's approval; default is behavioural parity with pizmidi.
- Structural cleanups that preserve behaviour are allowed (e.g. `midiNoteMap`'s 131 individual params → `std::array<int,128>` state).

## 10. Merge-safety vs the parallel session

- **Isolation:** separate worktree + branch; runtime conflict impossible.
- **Disjoint files:** `src/nodes/*` (new), and **O(1)** edits to `element_webview_host.cpp/.hpp` (the `InlineParamControl` bridge + snapshot loop, added once). Shared-file edits are append-only: `nodefactory.cpp`, `inlineParams.ts`, `inline/InlineFace.tsx` (one `switch` branch per new entry-kind), `nativeGraph.ts`, `types.ts`.
- **Never touched:** `Block.tsx`, `GraphCanvas.tsx`, `useAppStore.ts`, `Cable.tsx`, `GhostEdge.tsx`.
- **Cadence:** commit per node/small batch; `git fetch` + rebase onto the wave-3 tip whenever the other session commits, to surface drift early in small chunks.
- **Honest risk:** `inlineParams.ts` / `InlineFace.tsx` originate from the QA-wave lineage; the other session *could* touch them. All edits there are additive to keep merges trivial.

## 11. Phasing & definition of done

- **P0 — Foundation + first archetype (end-to-end proof).**
  - C++: `InlineParamControl` interface + `elementNodeSetParam` bridge + snapshot loop.
  - Webview: new entry-kinds + `nativeNodeSetParam` wrapper + `types.ts` fields + support for `component:` faces.
  - Expert-design the **Transform** archetype; wire the **5 existing nodes** to live editable faces.
  - **Done =** values round-trip C++↔JS; drag a knob on a block → MIDI output changes; all gates green; Review-wizard ACCEPT on the Transform archetype.
- **Design-system pass** — expert-design the remaining ~7 archetypes; Review-wizard lock.
- **P1 — TRIVIAL batch** (~20 new nodes), per-cluster.
- **P2 — MODERATE batch** (~18 nodes, incl. dense `miniGrid` + expand editors), per-cluster.

Each phase: own commits + parity tests + green gates + Review-wizard verdicts before the next.

## 12. Open items / risks

- **Tempo access spike** (gates the deferred tempo-sync set): determine whether Element's `RenderContext` / `Processor` exposes host BPM/PPQ/transport. Out of current scope; decision point before any tempo-synced plugin.
- **Dense-table expand editors** (`midiNoteMap` 128-cell, `midiNRPNConverter` 16-slot): the expanded editor surface (in block body vs Inspector) is designed in the Dense-table archetype pass.
- **Un-migrated plugins:** some scoped plugins are VST2-only in the source repo; their algorithm is reimplemented in Element idiom (not copied) — slightly more effort than the JUCE8-migrated ones.
- **CC output path:** confirm Element nodes can emit CC/value MIDI cleanly from `render` (proven by `midiNotesToCC` early in P1's CC-map cluster).
- **Category taxonomy:** MIDI Effects (teal ▲) vs Modulator/Utility (purple ⬡) per node — finalised during design passes.
