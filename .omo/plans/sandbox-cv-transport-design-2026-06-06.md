# DESIGN — CV transport through the sandbox (P4 item 4, 2026-06-06)

Status: **DESIGN ONLY — not implemented this wave.** Gap is documented by the
failing-by-design test suite `SandboxCVTransportTests`
(`test/engine/SandboxCVTransportTest.cpp`, registered DISABLED in
`test/CMakeLists.txt`).

## Problem

`SandboxedProcessorNode::render()` (src/nodes/sandboxedprocessor.hpp, render())
forwards **audio + MIDI only** into `SandboxHost::processBlock()`. Element's
third signal type — Value/CV (`RenderContext::cv`) — is dropped at the process
boundary in both directions. Any Block run sandboxed silently loses CV I/O,
violating the NOTHING-fake rule the moment sandbox becomes default-ON, because
CV-driven workflows (LFO → plugin param, logic routing) would appear wired but
carry nothing.

Secondary consumer: the A5/G4 cable telemetry (per-arc CV last-sample + abs
peak latched post-render in graphbuilder.cpp) reads CV buffers on the HOST
side; for sandboxed nodes those buffers stay silent today.

## Why not done in this wave

The shared-memory layout is locked by compile-time guards
(`SharedAudioBuffer` static_asserts: Header offsets 0..52, `sizeof(Header) ==
56`, src/engine/sandboxipc.hpp). Adding CV channels means:

1. Header grows (2 new fields) — every offset assert + the worker's
   byte-for-byte expectation changes (both processes MUST rebuild in lockstep).
2. `calculateRequiredSize()` and the pointer-carving in
   `setupPointersCommon()` change (4 extra channel blocks).
3. `PreparePayload` must negotiate CV channel counts.
4. Host `processBlock()` + worker `processAudioBlock()` both gain CV copy
   phases inside the RT path.
5. The worker has no native CV sink: a `juce::AudioPluginInstance` consumes
   audio buses + parameters only — worker-side CV semantics must be DEFINED,
   not just transported (see §Semantics).

Each step is mechanical but the blast radius crosses the host/worker RT
contract — exactly the kind of change that must land alone, with the stress
suites green before and after, not folded into a 6-item wave.

## Proposed memory layout (v2)

```
[Header v2][Audio In A][Audio In B][Audio Out A][Audio Out B]
           [CV In A][CV In B][CV Out A][CV Out B]
           [MIDI In 4096][MIDI Out 4096]
```

* CV blocks sized `numCVChannels * maxSamples * sizeof(float)`, double-buffered
  with the SAME `activeBuffer` index as audio (one swap covers both — no new
  sequencing).
* Header v2 appends after `midiOutputSize` (offset 52):
  ```cpp
  uint32_t numCVInChannels  { 0 };   // offset 56
  uint32_t numCVOutChannels { 0 };   // offset 60
  // sizeof(Header) == 64
  ```
  Appending (never inserting) keeps all existing offsets valid; update only the
  final `sizeof` assert + add two new offset asserts.
* `kMagic` bumped to a v2 value (`'ELSC'` 0x454C5343) so a stale v1 worker can
  NEVER attach to a v2 region (magic spin times out → honest bail, no silent
  misread). This is the version bump of record; `SandboxMessageHeader` itself
  is unversioned and stays so.
* `PreparePayload` appends `int32_t numCVInChannels, numCVOutChannels` (parsers
  already length-check, old payload rejected by size — fine, lockstep ship).
* `calculateRequiredSize (numChannels, numCVChannels, numSamples)` — overload,
  old signature delegates with 0 CV channels.

## Semantics (worker side)

A sandboxed `AudioPluginInstance` has no CV ports. Two consumption modes:

1. **Param-drive mode (recommended first ship):** worker maps CV input channel
   k → parameter index from a `CVParamMapPayload` control message (host sends
   the same mapping the in-process path uses). Per block, worker reads the CV
   channel's last sample, calls `param->setValueNotifyingHost()` BEFORE
   `processBlock`. CV outputs: not produced by plugins → CV out blocks zeroed
   (honest silence, but ports only advertised if a mapping exists).
2. **Pass-through mode:** unmapped CV inputs copy to the matching CV output
   channel (cable continuity through a sandboxed Block, same behavior as a
   bypassed in-process node).

`SandboxedProcessorNode::render()` then copies `context.cv` into the CV-in
blocks pre-trigger and reads CV-out post-wait, exactly mirroring the audio
path — pre-allocated, memcpy-only, RT-safe.

## Test plan (activates with the implementation)

* `SandboxCVTransportTests` (exists now, DISABLED): un-disable; asserts
  (a) CV written into `RenderContext.cv` of a sandboxed node arrives in the
  worker's CV-in block (TestEchoPluginFormat extended to echo CV → param), and
  (b) pass-through mode returns the same samples on CV out.
* Layout regression: extend `SharedAudioBufferTests` with v2 offsets +
  magic-mismatch attach-refusal case.
* Stress: `SandboxStressTests` must stay green (layout change risk).

## Compat story

Helper + host ship from one build (installer nests the helper inside
Element.app — build_pkg.sh). There is no supported mixed-version pairing; the
magic bump turns any accidental mix into a clean attach-timeout failure with a
logged error instead of corruption.
