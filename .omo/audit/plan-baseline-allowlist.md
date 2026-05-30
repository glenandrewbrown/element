# Plan Baseline Allow-List — UI-redesign OMC plan

> R4 (scope-fidelity) and R1 (contamination) MUST treat every path below as
> **pre-existing / out-of-scope noise**, NOT as plan drift. Decided by Glen at
> Pre-Flight (§4 step 1), 2026-05-30. Baseline SHA: `0936d558` (post-hygiene).
>
> Disposition chosen: **commit `reroutenode.hpp`, allow-list the rest.**

## Resolved (committed, removed from dirty tree)
- `src/nodes/reroutenode.hpp` — committed in `0936d558` (juce:: qualification, R1-aligned). NOT in this allow-list going forward; it is now baseline.

## Pre-existing WIP (tracked, modified) — allow-listed
- `test/integration/SessionChangedTest.cpp` — pre-existing test WIP (plan §1).
- `build_number.txt` — installer auto-increment artifact.
- `.claude/settings.json` — local hook/config drift (not plan work).
- `webview/package-lock.json` — npm lockfile churn (not plan work).

## Pre-existing WIP (untracked test scaffolding) — allow-listed
All untracked `test/*Tests.cpp` and `test/engine/*Tests.cpp` + `test/integration/SessionRoundTripTest.cpp`
(ArcTests, AudioFilePlayerTests, AudioMixerProcessorTests, BinaryMathNodeTests, CompressorTests,
ConstantNodeTests, EQFilterTests, LinkedListTests, MappingEngineTests, MatrixStateTests,
MidiChannelFilterNodeTests, MidiChannelSplitterTests, MidiChannelsTests, MidiEngineTests,
MidiIOMonitorTests, MidiMonitorNodeTests, MidiPipeTests, MidiRouterNodeTests, MidiSetListTests,
MidiVelocityAmpTests, NodeEdgeCaseTests, NodeFactoryExtendedTests, OSCSenderNodeTests,
PackMidiNodeTests, ParameterTests, PlaceholderProcessorTests, PortBufferTests, PortCountTests,
RerouteNodeTests, RingBufferTests, SandboxedProcessorNodeTests, SpinLockTests, TransportMonitorTests,
TriggerNodeTests, UnpackMidiNodeTests, VolumeProcessorTests, WebMeteringFifoTests, WetDryProcessorTests,
engine/AudioEngineTests, engine/GraphBuilderTests, engine/GraphManagerTests,
engine/GraphNodeMidiChannelTests, engine/LinearFadeFadeInTest, engine/MidiPanicTests,
engine/MidiTransposeTests) — pre-existing WIP, not authored by this plan.

## Tooling / artifact noise (untracked) — allow-listed wholesale
- `.claude-flow/`, `.claude/agents/`, `.claude/commands/`, `.claude/helpers/`, `.claude/skills/**`, `.claude/worktrees/`, `.claude/settings.local.json.bak.*`
- `.swarm/`, `.opencode/`, `agentdb.rvf`, `agentdb.rvf.lock`, `ruvector.db`
- root `package.json`, root `package-lock.json` (OMC tooling, not the webview)
- `.graphifyignore`, `graphify-out/`, `docs/adr/.omc/`, `tools/automation/.omc/`, `webview/.omc/`
- build/run logs: `build-release.log`, `build-release-configure.log`, `Log.txt`, `Network.log`, `fresh-build.command`
- `.omo/**` (audit, plans, evidence, handoffs, handover, notepads, qa, reports, run-continuation, boulder.json, coordination.md, ralph-loop.local.md, RESTART-PROMPT.md, HANDOVER_*.md) — orchestration state
- `.github/workflows/chromatic.yml`, `docs/UI_DEBUGGING_STORYBOOK_STITCH.md` — feedback-infra (off-plan, Glen-requested)
- `.wwebjs_auth/`
- **Junk / accidental (untracked, NOT plan work — flagged for Glen cleanup later, do NOT touch):**
  `-`, `17-22-33`, `Audio_XLN`, `Cloud`, `Plugin`, `Sync_out`

## Hot files — single-writer in Wave F, then READ-ONLY for the rest of the plan
- `webview/src/index.css` (F1)
- `webview/src/App.tsx`, `webview/src/components/layout/AppShell.tsx`, `webview/src/stores/useAppStore.ts` (F2 + F0)
- 4-cat taxonomy Records (F4)
- per-task `demoGraph`/fixtures (F6)
