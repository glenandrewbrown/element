<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-06-06 -->

# src/nodes/ — Built-in processor implementations

All in-process audio/MIDI processors registered into `NodeFactory`. New nodes go here. See the [`add-node` skill](../../.claude/skills/add-node/SKILL.md) for the scaffolding workflow.

## Inheritance

| Base | When to use | Defined in |
|---|---|---|
| `Processor` | Public API; any node type | `include/element/processor.hpp` |
| `BaseProcessor` | Most audio nodes — extends `juce::AudioPluginInstance` for DAW-style param/state | `baseprocessor.hpp` |
| `MidiFilterNode` | MIDI-only processors (no audio I/O) | `midifilter.hpp` |

## Naming convention (one node = up to 4 files)

```
nodename.hpp           # NodeNameProcessor declaration
nodename.cpp           # NodeNameProcessor implementation (omit if header-only)
nodenameeditor.hpp     # NodeNameEditor (optional UI)
nodenameeditor.cpp
```

`genericeditor.{cpp,hpp}` is the default fallback when a node has parameters but no custom editor. `ionodeeditor.hpp` is shared by I/O nodes. `knobs.cpp` provides reusable widget primitives.

## NodeFactory registration

Built-ins are registered in [`../engine/nodefactory.cpp`](../engine/nodefactory.cpp) via the `SingleNodeProvider<T>` pattern:

```cpp
// in NodeFactory ctor
add (new SingleNodeProvider<CompressorProcessor> (EL_NODE_ID_COMPRESSOR));
add (new SingleNodeProvider<EQFilterProcessor>   (EL_NODE_ID_EQ_FILTER));
```

Public node IDs (`EL_NODE_ID_*`) live in [`../../include/element/node.h`](../../include/element/node.h). **Add a new ID there** for any node visible to plugins / UI / scripts.

## Shipped categories (informal)

- **Effects**: `compressor`, `eqfilter`, `combfilter`, `freqsplitter`, `everb`, `allpassfilter`
- **Mixing / routing**: `audiomixer`, `audiorouter`, `channelize`
- **MIDI**: `MidiFilterNode`-derived (channelize, transpose, panic, programmap, …)
- **I/O / sources**: `audiofileplayer`, `constantnode`, `colorbars`
- **CV logic** (Wave-0, header-only): `logicnodes.hpp` — `ComparatorNode` (`element.compare`, 2 CV in / 1 CV out, 6 comparison ops) + `LogicGateNode` (`element.logic`, AND/OR/XOR/NOT/NAND/NOR/XNOR)
- **CV gates** (Wave-0, header-only): `gatenodes.hpp` — `AudioGateNode` (`element.audioGate`, CV-keyed audio gate with 5ms ramp), `MidiGateNode` (`element.midiGate`), `AudioSwitchNode` (`element.audioSwitch`)
- **CV analysis** (Wave-0, header-only): `envfollowernode.hpp` — `EnvelopeFollowerNode` (`element.envFollower`, stereo audio → unipolar CV, one-pole attack/release)
- **Editor primitives**: `genericeditor`, `ionodeeditor`, `knobs`, `compressoreditor`, `eqfiltereditor`, `audioroutereditor`

## CV node conventions

New CV nodes (Gate/Logic/EnvFollower families) are **header-only** — no `.cpp` counterpart. They inherit `Processor` directly (not `BaseProcessor`, which pulls in `juce::AudioPluginInstance` overhead). RT rules still apply: no allocations in `render()`, atomics for runtime-switchable params. Register in `src/engine/nodefactory.cpp` via `SingleNodeProvider<T>`. Test coverage: `test/engine/CVFlowTests.cpp` (built-graph proof gate) + `test/engine/LogicNodesTest.cpp`.

## Anti-patterns

- Allocating in `prepareToPlay` is fine; reallocating in `processBlock` / `render` is **not** — see [`../engine/AGENTS.md`](../engine/AGENTS.md) realtime rules.
- Skipping the `EL_NODE_ID_*` entry in `include/element/node.h` — UI/scripts can't reference the node without the public ID.
- Bypassing `genericeditor` while having no custom controls — just inherit it.
- Heavy DSP setup in the constructor — defer to `prepareToRender`.
- Adding a Lua-side node here — Lua DSP nodes live in `src/scripting/` + `src/el/`.
