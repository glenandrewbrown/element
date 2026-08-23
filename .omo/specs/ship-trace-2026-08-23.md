# Deep Dive Trace: evaluate-the-post-repo-merge

Date: 2026-08-23. Branch: `wave-3-leanfast-ux` @ `f8861b5d`. Trace = 3 parallel lanes, all reported.

## Observed Result
Post 3-repo consolidation (element / element-2 / mbpro-backup, 2026-08-23), Glen wants: current build/project health vs perceived priorities+specs, to produce a ship plan for a "finished plugin."

## Ranked Hypotheses
| Rank | Hypothesis | Confidence | Evidence Strength | Why it leads |
|------|------------|------------|-------------------|--------------|
| 1 | Lane 3: specs/priorities stale — docs measure a world 12 weeks gone | High | Strong (direct doc-vs-git-log falsification) | CF1 marked open in CLAUDE.md but fixed 06-02; VERDICTS 0% tracked while ~80-90% built; last real status doc 2026-06-10 |
| 2 | Lane 2: consolidation incomplete | High (but scoped) | Strong (read-only git evidence) | Purge verified clean, but push/gc/port decisions all pending |
| 3 | Lane 1: build/test breakage from merge | Low (mostly refuted) | Strong (controlled build+test runs) | Build fully green; single reliably-failing sandbox real-process test + 28 disabled tests are the only stains |

## Evidence Summary by Hypothesis

### Lane 1 — Build/code health (verdict: mostly REFUTED, one real failure)
- C++ `cmake --build build-merged -j8`: exit 0, zero warnings, all targets current (fresh configure today 21:24, deployment target 14.0 set).
- Webview: `npx tsc -b` exit 0; `npm run build` exit 0, normal bundle sizes.
- `webview/dist` NEWER than all of `src` — not stale; CMakeLists.txt:122 embeds dist directly, so this matters and is fine.
- GLOB_RECURSE reconfigure already done post-merge (new .cpp files e.g. sandboxeditorwindow.cpp compiled fine).
- ctest (156 tests, finished 21:46): **1 failure — `SandboxRealProcessTests/RealProcessRoundTrip`**, `successfulCycles >= requiredSuccesses [7 < 8]`; reruns got 5<8 twice → **reliably failing, NOT flaky** (test/engine/SandboxRealProcessTest.cpp:141). Lane 1 final: git blame shows test source untouched by consolidation commits → likely **pre-existing**, not merge-caused; environment/timing contribution not excluded (probe: recent changes to src/engine/sandboxhost.hpp, sandboxworker.hpp, src/nodes/sandboxedprocessor.hpp).
- **28/156 tests DISABLED** — including core suites: GraphManagerTests, MidiEngineTests, RingBufferTests, RerouteNodeTests, EQFilter/Compressor, SessionChangedTest, BridgeContractTests, SandboxCVTransportTests, etc. Large intentionally-dark coverage zone.

### Lane 2 — Consolidation completeness (verdict: PARTIAL)
- Purge of `.wwebjs_auth`: **verified clean across ALL local refs** (`git rev-list --all --objects` → zero hits). filter-repo completed (`.git/filter-repo/already_ran` present).
- `pre-filter-head.txt` (71266440…) RESOLVED via `.git/filter-repo/commit-map`: old name of live commit `9040a04f` — **nothing lost**. (Closes lane 2's critical unknown.)
- **Origin NOT rewritten**: `origin/main` = `ae5bc44e` (old pre-purge history); local diverged both directions. Force-push (or remote abandonment) still pending. **Non-dry-run fetch/pull from origin would re-import purged blobs — forbidden until resolved.**
- `.git` = 2 packs, 693MB total (483M post-filter pack + unexplained 242M pack written 21:44). `git gc --prune=now` pending; second-pack provenance unverified.
- Unported work needing explicit accept/drop decisions:
  - `gui-vs-features`: 11 real commits (2026-04-11/12, PreferencesModal + WebView UI parity work) not in wave-3.
  - `archive/pizmidi-native-nodes`: 9 commits (2026-06-09) — coherent InlineParamControl MIDI-FX feature, shelved unmerged.
  - `element-2-dirty-2026-08-15.patch` + `element-A-webview-dirty-2026-08-15.patch`: every hunk fails `git apply --check`; touch D3-shelved components (DashboardBuilder/MacroDashboard/SceneLauncher) → pre-shelving, stale; triage-or-drop, not mechanical apply.
  - `stash@{0}`: docs-only, CHANGELOG hunk superseded by later 2.2.0 entry — safe to drop, decide explicitly.
  - `local-enhancements`, local `main`: 0 unique commits — fully subsumed.

### Lane 3 — Spec/premise mismatch (verdict: CONFIRMED)
- Doc supersession chain ends 2026-06-10 (`SESSION-HANDOFF-2026-06-10-sandbox-mode1.md` = last engineering status; same-day commercialization-research handoff unresolved). Nothing since until today.
- **CF1 FIXED** `8c37eafd` (2026-06-02, setAccessible(false) before plugin-window teardown), re-confirmed by 06-09 RT-verifier pass. CLAUDE.md still calls it an open hard ship-gate — directly falsified.
- Sandbox out-of-process hosting: ~30+ commits, default `pluginSandboxMode=1` **shipped** 06-10 (`36e87345`), helper in installer, 2 ASan-proven UAFs fixed 06-12. Docs still list sandboxing as a minor M0 bullet.
- V3 UI: formal Stitch→37-verdict pipeline abandoned after Block pilot; **~80-90% of the 37 components exist functionally** in `webview/src/components/` via the QA-wave/live-feedback method; VERDICTS.md frozen at "ALL 37 LOCKED", 0% tracked.
- Activity: 147 commits 06-01→06-12, then **zero 06-12→08-23**, then 6 today (consolidation).
- Studio-checkout reconciliation (`2654b74b`): a parallel checkout had independently begun a 27-file re-implementation on a stale April base (archived as superseded) — live demonstration of the stale-premise failure mode. Root `PRODUCT.md`/`DESIGN.md` (2026-08-15) from that checkout describe "Platform: web / React 19 / Vite 8 / Tailwind 4" — likely template contamination, not considered product docs.
- D3 shelving respected: DashboardBuilder/MacroDashboard/SceneLauncher unwired (App.tsx comment-only; imports only in their own tests/stories).
- Ship-target evidence: all work targets Element-as-host (standalone hosting third-party plugins). No commits/roadmap toward Element-as-a-plugin as a product surface; CF1 was a stability fix for the existing plugin build, not productization.

## Evidence Against / Missing Evidence
- Lane 1: no pre-merge ctest baseline in hand → cannot yet prove SandboxRealProcessTests failure is (a) merge-caused, (b) pre-existing, or (c) environmental (worker binary codesign/spawn under new tree).
- Lane 2: second 242M pack provenance unattributed; unknown whether origin history has other consumers (CI, collaborators) affecting force-push safety.
- Lane 3: the 06-12→08-23 gap is unexplained (pause vs off-repo work); commercialization mission has no recorded decision.

## Per-Lane Critical Unknowns
- **Lane 1**: Is the `SandboxRealProcessTests` reliable failure a post-merge regression, a pre-existing failure, or an environment issue (worker binary signing/path)?
- **Lane 2**: What are Glen's accept/drop decisions for the unported work (gui-vs-features, pizmidi-native-nodes, dirty patches, stash) — and is force-pushing rewritten history to origin authorized?
- **Lane 3**: What does "finished plugin" mean as today's ship bar — and are PRODUCT.md/DESIGN.md (studio checkout, "web platform") intentional direction or noise? What happened 06-12→08-23?

## Rebuttal Round
- Leader (Lane 3, docs stale) vs Lane 2 (consolidation incomplete): Lane 2's facts are real but bounded — a known, mechanical close-out list. Lane 3's staleness poisons *planning itself* (already caused one stale-base re-implementation). Leader holds: without re-baselining the spec, any ship plan repeats the studio-checkout failure.
- Lane 1 rebuttal: "health is fine" — except the one reliably-failing test guards the flagship shipped feature (out-of-process sandboxing). Small surface, high relevance. Doesn't unseat leader; folds in as a ship-gate item.

## Convergence / Separation Notes
Lanes 2+3 converge on one mechanism: **no single current source of truth** — for code (3 repos, now merged), for history (origin vs local), or for plan (doc chain dead-ends 06-10). Lane 1 is separate and mostly clean.

## Most Likely Explanation
Project health is materially BETTER than the canonical docs claim (build green, CF1 fixed, sandbox hosting shipped default-on, ~80-90% of the V3 UI component set built). The real gap-to-ship is: (1) consolidation close-out (origin force-push, gc, 4 port-or-drop decisions), (2) one reliably-failing sandbox real-process test + 28 disabled test suites, (3) a re-baselined spec — because the current docs would misdirect any plan, and (4) an explicit, current definition of the "finished plugin" ship bar from Glen.

## Critical Unknown
The ship bar itself: what "finished plugin" concretely means to Glen today (Element standalone MVP? installer/release? Element-as-plugin surface? UI completeness threshold?). Every plan branch hangs off this.

## Recommended Discriminating Probe
Ask Glen the ship-bar question directly (with the evidence-backed menu of candidate bars), plus the port-or-drop menu — cheaper than any further code probe.
