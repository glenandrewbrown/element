# P1 Slice: Conditional/Logic Routing + Flow-Debug — v2 (2026-06-06)

Source: `.omc/specs/deep-interview-app-status-gap-analysis.md` Pillar-1 gap #1 (Glen flagged twice).
Acceptance (gap spec): *"Conditional/logic-routing Blocks + conditional cables exist; a flow-debug
overlay shows live signal presence per cable."*

v1 was REJECTED by critic (adversarial review). v2 folds in ALL findings. Headline: **the CV signal
path is dead through the live graph** — the slice now starts with Wave 0 "Make CV flow".

## Ground truth (recon + critic, verified file:line)

- **CRITICAL pre-existing defect:** CV does not flow through a built graph:
  - `graphbuilder.cpp:644` — port loop skips everything but Audio/Midi/Control → CV ports get no
    buffers, no Clear/Copy/Add ops, no routing.
  - `graphbuilder.cpp:245,553` — every node's RenderContext gets `dummyCV…, 0` (0-channel CV);
    `totalChans` (:895) counts Audio only.
  - Every CV node guards `rc.cv.getNumChannels() < N → return` (triggernode.hpp:37, mathnodes.hpp,
    readoutnode.hpp, constantnode.hpp) → **whole CV family is dead code live**. Unit tests pass
    because they hand-build RenderContexts (test/TriggerNodeTests.cpp:86) bypassing GraphBuilder.
  - `processor.cpp:337-342` — outRMS sized to AUDIO outputs only → CV-only sources read RMS 0 →
    CV cable levels hardwired 0 in `cableSignalLevelForArc` (element_webview_host.cpp:496).
  - `ReadoutNode::getCurrentDisplayValue()` has zero callers. Nodes landed in c6181785 with no
    builder change. Spec premise "Modulation/CV adequate" is FALSE — tell Glen (status doc + banner).
- Per-cable AUDIO level flows end-to-end already (cableSignalLevelForArc → buildCableLevelsJson
  :5714 → onCableLevels → rAF-coalesced useJuceBridge.ts:480-514 → useCableMeterStore epsilon-diff
  → Cable.tsx:91 pulse). MIDI activity too (bool → 0.75).
- Builder architecture for the fix: per-type buffer-index namespaces ALREADY exist
  (`allNodes[PortType::Unknown]`, ctor :567-571; `buffersNeeded(type)` :582). Ops all live in
  graphbuilder.cpp with a common `perform (AudioSampleBuffer&, OwnedArray<MidiBuffer>&, int)`;
  single call site graphnode.cpp:586. `channelsToUse[PortType::Unknown]` already reaches
  ProcessBufferOp's ctor (5th arg) — CV list arrives today, unused.
- Webview: GhostEdge overlay precedent (GhostEdge.tsx:93 uses EdgeLabelRenderer; @xyflow ^12.10.2);
  toggle precedent useAppStore.toggleCableRouting; bare key `d` FREE in useKeyboard.ts (only
  Cmd+D exists, :198). Signal-type fold: element_webview_host.cpp:144-146 maps Control AND CV →
  "value".
- MIDI panic helper exists: `src/engine/midipanic.hpp` `MidiPanic::write(buffer, frame)` (+ per-ch),
  tested in test/engine/MidiPanicTests.cpp.
- Category mapping is KEYWORD-based: `src/ui/blockcategory.hpp mapBlockCategoryFromStrings` —
  "Comparator"/"Logic Gate"/etc. would fall through to `audiofx`. Needs explicit overrides + tests
  (test/engine/BlockCategoryMapTest.cpp).

## Strategy decision (Wave 0, ratified here)

**Option (a): fix GraphBuilder to route CV.** Rejected alternatives: (b) re-typing condition ports
as Audio breaks the three-signal-type product pillar (orange Value/CV cables are core V3 design);
(c) descoping to audio-only leaves a dead subsystem + fake orange cables shipping (NOTHING-fake).
Fixing the builder resurrects the ENTIRE existing CV family (Constant/Add/Sub/Mul/Div/Trigger/
Readout) — maximum depth-first value.

## Waves

### Wave 0 — Make CV flow (engine surgery + proof) [NEW — single largest item]

1. **Buffer pool:** add a parallel CV pool — a NEW `juce::AudioSampleBuffer cvRenderingBuffers`
   GraphNode member, `setSize (builder.buffersNeeded (PortType::CV), 4096)` inside the SAME
   ScopedLock as the audio pool (graphnode.cpp:432), passed through the extended perform signature
   at :586. ⚠️ The nearest precedent is itself broken: `numAtomBuffersNeeded` is computed (:424)
   but NO Atom pool is ever allocated — do not reproduce the dead-CV bug one layer down; the field
   + allocation + pass-through must all exist.
2. **Op signature:** extend `GraphOp::perform` to carry the CV pool (struct or extra arg) — all op
   classes live in graphbuilder.cpp (9 classes) + the one call site graphnode.cpp:586. Mechanical.
3. **Port loop (graphbuilder.cpp:644):** include `PortType::CV`; reuse the generic output-branch
   (getFreeBuffer(CV) + channelsToUse[CV] + markBufferAsContaining); input-branch gets CV variants
   of Clear/Copy/Add ops targeting the CV pool (no Delay op for CV v1 — CV ignores PDC; note it).
4. **ProcessBufferOp:** consume `chans[PortType::CV]` (already arrives); member cvChannels array,
   `totalCvChans = max(CV ins, CV outs)`; gather CV pool pointers in perform; build the
   RenderContext at :245 with REAL CV pointers (kill dummyCV for context-wanting nodes).
5. **CV value publication:** `Processor::setOutputCV/getOutputCV(ch)` — relaxed-atomics array
   (`outCV`) allocated at the processor.cpp:337-342 site but sized from the CV-OUTPUT count
   (`ports.size (PortType::CV, false)`), NOT `getNumAudioOutputs()` (sizing off audio would re-zero
   CV-only nodes — the original bug's signature); ProcessBufferOp latches each
   CV out channel's LAST sample post-render (loop parallel to the setOutputRMS loop at :513-514).
   This is the generic per-port feed (critic A2: NOT per-node latches).
6. **RT-safety:** no alloc/lock in perform — CV-pool sizing happens at REBUILD time under
   `getPropertyLock()` (graphnode.cpp:432 pattern), sized to 4096 samples (not blockSize) so a
   buffer-size change never reallocates mid-render — identical to audio, NOT in prepareToRender.
   perform = pointer gathers + float copies + relaxed atomic stores only. RT-review before merge.
7. **PROOF GATE (mandatory, blocks Wave 1):** GraphBuilder-level integration test
   (test/engine/GraphBuilderTests.cpp precedent): build a REAL graph Constant→Add→Readout via the
   actual builder/render path; assert nonzero value arrives (ReadoutNode latch + getOutputCV).
   A second case: Audio source→EnvelopeFollower-style CV consumer arc validity per porttype.hpp:124.
8. Out of scope v1 (non-goals): CV across container/IONode boundaries (IONode guard :621-635 is
   audio-only); CV delay compensation.

### Wave 1 — Engine: logic/conditional node family (6 nodes)

| ID | Class | Ports | Behaviour |
|----|-------|-------|-----------|
| `element.compare` | ComparatorNode | CV A, CV B → CV out | out = A ⟨op⟩ B ? 1 : 0; op ∈ {>, ≥, <, ≤, =±ε, ≠} atomic; state = op+ε |
| `element.logic` | LogicGateNode | CV A, CV B → CV out | AND/OR/XOR/NAND/NOR/NOT-A; true ⇔ ≥0.5 |
| `element.envFollower` | EnvelopeFollowerNode | audio L,R → CV out | rectified peak follower, atomic attack/release ms; audio→condition bridge |
| `element.audioGate` | AudioGateNode | audio L,R + CV open → audio L,R | pass when open ≥0.5; ~5ms gain ramp (click-free) |
| `element.midiGate` | MidiGateNode | MIDI + CV open → MIDI | per-event gating at the event's samplePosition vs CV buffer; on falling edge within the buffer write `MidiPanic::write` at that frame (stuck-note-proof, incl. mid-buffer close); buffers ensureSize'd in prepareToRender |
| `element.audioSwitch` | AudioSwitchNode | audio A-L,A-R,B-L,B-R + CV sel → L,R | sel<0.5→A else B; ~5ms crossfade |

- Pattern: triggernode.hpp (Processor(0), atomics, refreshPorts, state blob). uniqueIds
  'elcp','ellg','elef','elag','elmg','elsw'. Register nodefactory.cpp:137-148 block.
- **renderBypassed (explicit, per critic G3):** AudioGate bypass = passthrough (fully open);
  AudioSwitch bypass = pass A; MidiGate bypass = passthrough. Override each (default ≠ passthrough).
- Discrete op/mode params: ship default op (>)/(AND) with state setters; mode UI = follow-up
  papercut (do not rabbit-hole); document in status doc.
- Boost tests `test/engine/LogicNodesTest.cpp`: per node render correctness (all comparator ops,
  gate ramp monotonic + closed silence, midiGate panic-on-close incl mid-buffer, envFollower
  rise/decay, switch crossfade) **plus one save→load round-trip asserting op/ε preserved
  (Comparator at minimum)** (critic G2). PLUS the new nodes added to the Wave-0 integration test
  (source→Comparator→AudioGate chain through a real built graph).

### Wave 2 — Host: flow-debug feed (re-specified post-Wave-0)

- `cableSignalLevelForArc` CV branch: read `getOutputCV(channel)` (presence = |v| clamped); rows in
  `buildCableLevelsJson` gain `v` (signed float) for CV-sourced arcs. MIDI unchanged (activity).
  (v1's "fallback to RMS" line is DELETED — not viable; critic F2.)
- OSC live-proof hook: add `/element/command/dumpcv` (oscservice.cpp + commands.hpp pattern) →
  writes `{nodeUuid: cvOutValues[]}` JSON to a known path. Gives cli-anything-element a scriptable
  live assertion + starts Task-#15 groundwork.

### Wave 3 — Webview: Flow-Debug mode

- `useAppStore`: `flowDebug` + `toggleFlowDebug` + selector (session-only).
- Toolbar button beside cable-routing toggle; shortcut bare `d` (verified free).
- **Touch points (explicit, critic F6):** `useCableMeterStore.ts` (rows → `{level, v?}` — value
  shape change; epsilon-diff MUST cover `v`), `useJuceBridge.ts` pendingCableLevels type (~:488),
  `useCableMeterStore.test.ts`, `useCableMeterStore.gaps.test.ts`, `useBlockOutputLevel` consumers.
- `Cable.tsx`: flowDebug → EdgeLabelRenderer chip at midpoint: audio = dB (1dp) + presence dot;
  CV = signed value (2dp); MIDI = activity dot; level≈0 → dim "—" (the blocked/conditional visual).
  Display-quantised (2dp + change-only) so 60Hz feed ≠ 60Hz text re-render.
  **Note (critic F8):** Control-sourced "value" cables show "—" by design (host folds Control+CV →
  "value", :144-146; only CV carries `v`). Not a defect.
- Stories: visual-only variants via store-injection (audio hot/silent, cv value, midi, blocked).
  vitest: store + quantise. **Storybook verifies VISUALS ONLY — it cannot and does not verify
  engine behaviour (fixture data by design).**

### Wave 4 — Surfacing + taxonomy

- `blockcategory.hpp`: explicit overrides so all 6 IDs map to Modulators/Utilities (purple ⬡);
  + a test case per node in BlockCategoryMapTest.cpp (critic F7).
- Verify QuickAdd/CommandPalette listing; lean-block render sanity for CV-only nodes.

### Wave 5 — Gate + ship (verification NON-fallback-able; critic F4/A1)

1. cmake reconfigure + build clean; **ctest: Wave-0 integration test + LogicNodes + full suite, no
   NEW fails** vs pre-existing ledger.
2. webview: tsc -b, vitest full, build, verify-stories (301/303 baseline).
3. Force-bundle dist into all 8 product bundles + re-sign + install (~/Applications + VST3/AU).
4. **Live engine proof (mandatory, not skippable):** scripted via cli-anything-element — load a
   session containing Constant→Comparator→AudioGate(+Readout), `dumpcv` assert nonzero/correct gate
   state live in the INSTALLED app. Storybook is NOT an acceptable substitute (visual claims only).
5. Glen visual sign-off of chips in the live app (his eyes on the real thing, not renders).
6. Docs: update APP-STATUS (incl. the corrected "CV was dead, now fixed" record + what to test) +
   ui-comments ledger; correct the spec premise note. Serialized commits per change.

## Non-goals

- Cables stay passive: conditions live in gate/switch Blocks (that IS the conditional-cable
  mechanic, visualised by flow-debug).
- CV across container boundaries; CV PDC; MIDI event-content inspection (MidiMonitor exists).
- Block-library breadth beyond these 6 (next backlog item).
- **Plugin-form flow-debug parity: plugin editor (src/plugineditor.cpp) has no webview — nodes work
  in plugin form, the overlay does not. Pillar-4 backlog item (critic G4).**
- Mode-UI for discrete params (papercut follow-up).

## Risks

- Wave 0 touches the RT render path → mechanical op changes only, RT-review + integration test +
  full ctest before anything stacks on it. If Wave 0 slips, STOP — do not build nodes on dead CV.
- MidiBuffer alloc in render → ensureSize in prepareToRender; panic via MidiPanic::write.
- 60Hz chip churn → quantise + epsilon covers `v`; chips mount only when flowDebug on.
- Sandbox: SandboxedProcessorNode parity for CV NOT in scope (sandbox not default-on yet; R6 later).

## Estimate (corrected; critic G1)

Wave 0 ≈ 250–350 engine lines + integration tests (the largest item). Wave 1 ≈ 6×~130 + ~450 test.
Wave 2 ≈ 80. Wave 3 ≈ 300 + stories/tests. Waves 4–5 ≈ glue + verification.
