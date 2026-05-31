# `.omo/plans` — index & status

> **The live roadmap is NOT a file in this folder.** Current project state, ship definition, and the
> sequenced plan live in:
> - **`.omo/PROJECT-STATE.md`** — canonical state + plan (read first).
> - **`.omo/HORIZON-v3-ui.md`** — the long-horizon V3 UI objective (M0 stabilise ‖ M1 UI, parallel lanes).
> - **`.omo/bakeoff/VERDICTS.md`** — the 37 locked per-component build specs (the UI build spec).
>
> This folder holds the one active *method* doc + an `archive/` of superseded / shipped / historical
> plans. Every archived file carries a status banner pointing at its live successor.
> _(Index rebuilt 2026-05-30.)_

## Active — execute / consult

| Plan | What it is |
|------|-----------|
| `mvp-bakeoff-plan.md` | **LIVE.** The locked UI build *method* — cherry-pick best-of-{Element webview, `mindful-studio` mockup} per component, build-new where both weak (mandatory design tools), re-house every winner on Element's real arch (Zustand + JUCE bridge + React Flow). Companion to PROJECT-STATE + HORIZON + VERDICTS + ADR-011. |

## Archived — `archive/`

Everything below was superseded, shipped, or is historical. Kept for audit trail; **do not execute.**

### Superseded by the V3 UI cherry-pick bake-off (`docs/adr/ADR-011…` + `.omo/bakeoff/VERDICTS.md`)
| Archived plan | Status |
|------|--------|
| `archive/pass2-stitch-redesign.md` | SUPERSEDED — Stitch-first method folded into the bake-off; its component picks overturned by VERDICTS.md (nav, Inspector). |
| `archive/ui-redesign-OMC-execution.md` | DEAD — the 28-lane OMC Pass-1; built, denied ("trash"), reverted (`8d9575f9`). |
| `archive/ui-redesign-execution.md` | SUPERSEDED — pre-bake-off 24-item neu plan (G-01..G-32). |
| `archive/ui-redesign-KICKOFF.md` | SUPERSEDED — kickoff prompt for `ui-redesign-execution`. |
| `archive/deep-app-audit.md` | HISTORICAL — 2026-05-30 full-stack UI + perf audit (stability findings → M0 audit docs). |

### Shipped
| Archived plan | Status |
|------|--------|
| `archive/wave2-taxonomy-execution.md` | DONE — 4-category taxonomy shipped (Option A, zero-debt, `dadc2c67`). |

### Historical — 2026-05-07/08 stability + early-GUI lineage (`local-enhancements` / `.sisyphus`)
Open stability work from these was carried into M0 → `.omo/audit/28-bug-reconciliation.md` + `.omo/audit/findings.md`.

| Archived plan | Status |
|------|--------|
| `archive/master-fix-plan.md` | HISTORICAL — stability + GUI plan v3 (2026-05-08). |
| `archive/autonomy-execution-spec.md` | HISTORICAL — autonomy / loop execution spec (2026-05-07). |
| `archive/visual-asset-pipeline.md` | HISTORICAL — Phase F creative-asset pipeline (2026-05-07). |
| `archive/bug-catcher-wave2.md` | HISTORICAL — pattern-based bug discovery (2026-05-08). |
| `archive/phase-d-architect-memo.md` | HISTORICAL — Phase D sandbox/engine architecture memo. |
| `archive/phase-d-gate-1.5-evidence.md` | HISTORICAL — Phase D Gate 1.5 acceptance evidence. |
| `archive/phase-h-coverage-evidence.md` | HISTORICAL — Phase H coverage acceptance evidence. |
| `archive/snapshot-extension-design.md` | HISTORICAL — per-Block snapshot / bridge-gap memo. |

## Path-move lookup (so old links still resolve)

All archived plans moved `​.omo/plans/X.md` → `.omo/plans/archive/X.md` on 2026-05-30.

Older frozen records still reference the pre-move paths and are intentionally **not** rewritten
(editing a dated audit trail corrupts it): `.omo/HANDOVER_2026-05-0*.md`, `.omo/handover/`,
`.omo/handoffs/`, `.omo/reports/`, most of `.omo/audit/*`, `.omo/boulder.json`, and the dated
`.sisyphus/…` entries in `AI_HANDOVER.md`. If you hit a stale `plans/X.md` link in one of those,
resolve it to `plans/archive/X.md` via the tables above.
