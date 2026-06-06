# Session Handoff — 2026-06-06 (QA feedback wave: all 10 items shipped)

> Fresh session: read this first. Previous handoff: `.omo/SESSION-HANDOFF-2026-06-06-ccg.md`.
> Glen's 10-item installed-build QA feedback → consensus plan (2 Plan agents + critic
> APPROVE-WITH-CHANGES) → ralph wave-gated execution → architect reviewer **APPROVED**.
> Plan: `~/.claude/plans/read-omo-session-handoff-2026-06-06-ccg-luminous-hickey.md`.

## Commits this session (chromatic-ui-review)

| Commit | Wave |
|---|---|
| `1c05e37b` | W1: T1 native ctx-menu suppressor · T2 RC=board menu / Shift+RC=QuickAdd · T4 port-gated VU |
| `fe814d2f` | W5: T5 inline INT faces (compare/logic op choosers, Bitwig gestures) · T6 palette split/IA/virtualized |
| `48f862ce` | W2: T7 terminology (~70 strings) + ctest/vitest guards · P0 snapshot identifier/intMode + elementNodeSetIntMode |
| `0e7eb16f` | W3: T3 Opt+drop add-and-connect (elementGraphAddPluginConnected) · T10 groupNodes engine+Cmd+Shift+D+menu |
| `eaa8ace5` | W6: T9 cable bezier default + plugs + arrowheads + amp-scaled pulse |
| `f92f2419` | W2 follow-up: 4 missed node→block strings |
| `d28465f4` | W4: T8 ghost suggestions fixed (edge-gap distance + zIndex + footer hint) — live-diagnosed |
| `5da7de32` | deslop: shared groupSelectionWithFeedback |

## Installed (Glen's QA targets)

`~/Applications/Element.app` + VST3 ×2 + AU ×3, ALL on webview marker **`index-VjDgiQuw.js`**,
helper `Element Sandbox Host.app` nested. Smoke: launch alive, no crash, clean teardown.
⚠️ `/Applications/Element.app` is a STALE root-owned PKG install (marker index-CIzTTsEA) —
could not be replaced without sudo. Glen: delete it or ignore it; QA the `~/Applications` copy.

## Gates (lead-verified)

- vitest full: 2700+ passed / 0 failed (post-deslop rerun) · tsc clean
- verify-stories: 345/346 (sole fail `layout-bottomstrip--edit-tempo` = pre-existing baseline)
- ctest: full run sole failure = SandboxOrderedShutdownTests (documented env-flaky); targeted
  GroupNodesTests + ContainerDiveTests + terminology-guard PASS
- Architect reviewer verdict: APPROVED
- Live (computer-use, one actor): RC menus correct, no Reload leak, T8 ghost + hint + Enter-accept
  → real engine cable (CABLES 0→1), T9 bezier + endpoint plug visible

## T8 root cause (for the record)

Ghost suggestions never fired because `blockDistance` was CENTRE-to-centre vs a 150px threshold —
unreachable for non-overlapping ~200-260px blocks — AND ghost edges painted under node chassis.
Fixed: edge-to-edge AABB gap + zIndex 2000 + footer gesture hint.

## Known limitations / follow-ups (named, not in scope)

1. **LFO block does not exist** (engine) — Glen-approved future task; inline-control infra ready.
2. **Built-in nodes expose no host AudioProcessorParameters** → knob faces wait on engine-side
   param exposure (registry + widgets + validation all shipped and tested).
3. **Input-side RMS bridge** so the Audio Output device gets an honest meter (port-gating removed its fake one).
4. **T9d bend-around-blocks** smart cable routing (deferred by critic + plan).
5. **Molecule insert positioning bug** — `tags::x/y` writes at element_webview_host.cpp:3119-3132 never
   reach AddPluginMessage (same class T3 fixed for its own path). Also: generic QuickAdd adds still
   spawn top-right, not at cursor — fix by reusing T3's positioned-add path.
6. **MIDI activity feed** (per-node) would light the skipped midiActivity inline widget.
7. T10 v1 limits (documented in code): >2 boundary audio channels fold round-robin; compound undo.
8. eVerb/plugin editors auto-open on add — pre-existing behaviour, possibly unwanted (ask Glen).
9. Stale `.claude/worktrees/agent-a1c2f243783cd6324` debris pollutes repo-root vitest runs — cwd into webview.

## Hard-won session lessons

- cli-anything-element launches the BUILD-TREE app (`build-merged/element_app_artefacts/Element.app`),
  NOT ~/Applications — sync BOTH before live QA.
- Never truncate `tasks/a*.output` (agent transcripts) when tmpfs fills — kills SendMessage resume;
  truncate only `b*` bash outputs.
- Subagent final messages get eaten by a stop hook — have executors WRITE REPORTS TO FILES
  (`.omc/state/qa-wave-reports/`) and/or jq the transcript JSONL.
- DeviceServiceControllerTests wedges (killed once); SandboxStress/SandboxOrderedShutdown timeout-flaky.
- test::context() never prepares the engine — engine-backed tests need
  `prepareExternalPlayback(44100,512,2,2)` + `releaseExternalResources()` teardown (see GroupNodesTest fixture).
- Bash cwd drifts between calls — use absolute paths for builds/installs.
