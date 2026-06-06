<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# docs/ — Project Documentation

Design specs, ADRs, audit reports, UI references, and build guides.
`ELEMENT_UNIFIED_BLUEPRINT.md` is the single source of truth (V3.0 —
Instrument Paradigm). All UI work must be grounded in it and in the ADR
verdicts. Do NOT create AGENTS.md inside `plans/` or `stitch-reference/`.

## Subdirectories
| Directory | Description |
|-----------|-------------|
| `adr/` | Architecture Decision Records — see `adr/AGENTS.md` |
| `plans/` | Implementation plans (read-only for agents — never modify) |
| `stitch-reference/` | Stitch design exports and screenshots |
| `:stitch-reference/` | **Legacy duplicate** — stray directory, do not document or use |
| `superpowers/` | Superpower skill references |

## Key Files
| File | Description |
|------|-------------|
| `ELEMENT_UNIFIED_BLUEPRINT.md` | **Single source of truth** — V3.0 Instrument Paradigm |
| `CHROMATIC_FEEDBACK_WORKFLOW.md` | How to give/consume UI feedback via Chromatic PR comments |
| `WEBVIEW_HYBRID_POLICY.md` | Policy for React/JUCE hybrid webview architecture |
| `GraphEditorEnhancements_UserManual.md` | Full keyboard shortcuts and graph editor features |
| `ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md` | Design token reference (colours, shadows, typography) |
| `ELEMENT_LLM_AGENT_BRIEFING.md` | Agent onboarding briefing for this codebase |
| `ELEMENT_FEATURE_INVENTORY.md` | Feature inventory (live vs shelved) |
| `UI_UX_DESIGN_BRIEF.md` | UI/UX brief for the V3 redesign |
| `WEBVIEW_PARITY_MATRIX.md` | Parity tracking: native C++ features vs webview equivalents |
| `building.md` | Build instructions supplement |
| `cppstyle.md` | C++ style guide |
| `luastyle.md` | Lua style guide |
| `sparkle.md` | Sparkle/WinSparkle auto-update integration notes |
| `FORENSIC_AUDIT_REPORT.md` | Post-pass-1 UI audit findings |
| `REACT_UI_AUDIT_2026-05-24.md` | React UI component audit (2026-05-24) |
| `SESSION_JOURNAL.md` | Running session journal for the overhaul project |
| `UI_DEBUGGING_STORYBOOK_STITCH.md` | Storybook + Stitch debugging guide |
| `WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md` | Blueprint compliance checklist |
| `WEBVIEW_QA.md` | Webview QA checklist |
| `REPOMIX.md` / `REPOMIX_CONTEXT_SUMMARY.md` | Repomix-generated context summaries |

## For AI Agents
- Always read `ELEMENT_UNIFIED_BLUEPRINT.md` before any UI or architecture work.
- UI build method: cherry-pick bake-off per `adr/ADR-011-ui-cherrypick-bakeoff-method.md`;
  component verdicts in `.omo/bakeoff/VERDICTS.md`.
- `:stitch-reference/` is a filesystem artefact (colon-prefixed name) — ignore it entirely.
