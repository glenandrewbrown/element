# Session Stock-take — 2026-05-31 (for a fresh-session plan)

Objective stock-take of where EVERYTHING stands. Glen's instruction: next session reviews this +
plans the V3 UI build method from **objective sources**, NOT from "avoid the rejected pattern".
Decisions are deferred — this is status, not a plan.

## Objective (unchanged)
Ship the V3 Instrument UI: looks like the `mindful-studio` mockup, keeps every native JUCE feature,
runs on the real engine. Build spec = 37 locked verdicts (`.omo/bakeoff/VERDICTS.md`).

## Factual status by workstream (what is actually TRUE right now)

| Workstream | State | Evidence |
|---|---|---|
| **V3 Block (pilot)** | **BROKEN / rejected.** Multiple rounds; latest "faithful port" has a transparent chassis centre, broken muted, misalignment. Glen: worst yet. Should be **reverted**, not built on. | screenshots; `ui-comments.jsonl` rounds; checkpoint `204f5545` |
| **Review wizard** | **WORKS, keep.** Side-by-side live-block vs mockup, per-step briefs + feedback → `ui-comments.jsonl`. `🔍 Review/Block` story. | `webview/src/components/canvas/_ReviewBlock.stories.tsx` |
| **CF1 (host crash)** | **Fix applied (12 lines, `plugineditor.cpp`), NOT confirmed to compile, NOT host-verified.** | git diff; agent ended pre-build |
| **UI toolchain audit** | **Done.** Root causes: (1) blind verification — agents AND I called broken UI "a significant leap"; (2) stack mismatch — mockup is TW-v3 + HSL-var + shadcn/Radix, Element webview is TW-v4 + hex + no shadcn → transcribing leaks bugs; (3) design-gen tools (Stitch/21st-magic/neumorphism-generator/ui-ux-pro-max/chrome-devtools) were never used. | `.omo/audit/ui-toolchain-audit-2026-05-31.md` |
| **Next-wave plan** | **Done (read-only swarm).** component-port roadmap, native-parity audit (10 ORPHAN features risk silent regression), criticality-scale plan (plugin-scan is mostly a wrapper job). | `.omo/plans/component-port-roadmap.md`, `.omo/audit/parity-vs-native.md`, `.omo/plans/criticality-scale-plan.md` |
| **Bake-off verdicts** | Locked (prior). 37 components. | `.omo/bakeoff/VERDICTS.md` |
| **Claude Code config** | **Cleaned this session** per Anthropic docs (global lean). 46→25 plugins; niche MCP off; 29 DAW/creative/n8n skills removed-or-moved (reversible). Element re-enables stitch + ruflo. Backup `~/.claude/settings.json.bak.20260531-034811`. | this session |

## The REAL open question (objectively framed — the A/B was a reactive narrowing)
How to build the V3 UI **well**. The honest solution space is WIDER than the A/B I posed; reason it
fresh from objective sources next session. Candidate axes (not a menu to pick blindly — to analyse):
- **Verification first** — fix the inability to *see* UI quality (chrome-devtools computed-style diff vs
  the live mockup + early single-component human gate). This is needed under EVERY build method and is
  the highest-confidence, lowest-regret move. Likely do this regardless.
- **Build method** — options to weigh on merits, not on "what got rejected": faithful port (fails only
  because of the stack gap — fixable by bringing the mockup's token/shadcn layer, not doomed in principle);
  regenerate-native with design-gen tools; adopt the mockup app as the shell and wire Element's engine in;
  hybrid. Note: "piecemeal hand-transcription" failed on *execution* (no token context, no objective
  verify), which is NOT proof the underlying idea is wrong.
- **Decisions queued for Glen:** the 10 ORPHAN parity features (extend a verdict / new component / accept
  loss); CF1 build+host verify; target date.

## Artifacts / recovery
- Checkpoint commit `204f5545` (`.claude/checkpoints.log`) captures everything (incl. broken Block).
- Pre-session-port baseline for the Block = `7c1aa509`.
- Memories written this session: `feedback_ui_failure_root_causes`, `feedback_session_audit_2026-05-31`,
  `feedback_reactive_pattern_avoidance`, `feedback_review_wizard_method`, `feedback_ui_design_workflow_mandate`,
  `reference_mockup_block_design`, `reference_mockup_lovable_preview`, `feedback_adaptive_contextual_layout`.

## Fresh-session starting move
Load this + the toolchain audit + render the live mockup (`https://preview--neurosonic-canvas.lovable.app/`
or `:6008`). Decide the build method from objective analysis. Do NOT inherit this session's A/B framing.
