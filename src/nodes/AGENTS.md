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
- **Editor primitives**: `genericeditor`, `ionodeeditor`, `knobs`, `compressoreditor`, `eqfiltereditor`, `audioroutereditor`

## Anti-patterns

- Allocating in `prepareToPlay` is fine; reallocating in `processBlock` / `render` is **not** — see [`../engine/AGENTS.md`](../engine/AGENTS.md) realtime rules.
- Skipping the `EL_NODE_ID_*` entry in `include/element/node.h` — UI/scripts can't reference the node without the public ID.
- Bypassing `genericeditor` while having no custom controls — just inherit it.
- Heavy DSP setup in the constructor — defer to `prepareToRender`.
- Adding a Lua-side node here — Lua DSP nodes live in `src/scripting/` + `src/el/`.
