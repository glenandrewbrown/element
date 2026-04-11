# Agent / IDE quick start

## Read first (order matters)

1. **[AI_HANDOVER.md](AI_HANDOVER.md)** — opens with the **canonical agent preamble** and a **dated status log** (multi-agent context only; **not** spec).
2. **[docs/ELEMENT_UNIFIED_BLUEPRINT.md](docs/ELEMENT_UNIFIED_BLUEPRINT.md)** — **single source of truth** for product + UI (V3.0 Instrument paradigm). Read before visual/webview implementation work.
3. **[CLAUDE.md](CLAUDE.md)** — build commands, architecture, terminology, realtime and UI conventions.

## Specs and maps

- **[docs/ELEMENT_FEATURE_INVENTORY.md](docs/ELEMENT_FEATURE_INVENTORY.md)** — feature coverage vs implementation.
- **[docs/ELEMENT_LLM_AGENT_BRIEFING.md](docs/ELEMENT_LLM_AGENT_BRIEFING.md)** — agent-oriented project + UI map.
- **`docs/stitch-reference/`** — static layout references (`DESIGN.md`, `edit-mode.html`, `perform-mode.html`) alongside the blueprint.
- **[docs/WEBVIEW_HYBRID_POLICY.md](docs/WEBVIEW_HYBRID_POLICY.md)** — **full Web port mandate**: no feature may remain native-only as the final design; classic UI is a stopgap until bridged.

## Cursor

Project rules live in [`.cursor/rules/`](.cursor/rules/). They mirror the same read order as above.

**Classic UI escape hatch:** set environment variable `ELEMENT_STANDARD_CONTENT=1` to force `StandardContent` instead of the Web shell (debug/support).

## Packaged workflows (Markdown)

- [`.claude/skills/element-build-and-package/SKILL.md`](.claude/skills/element-build-and-package/SKILL.md)
- [`.claude/skills/add-node/SKILL.md`](.claude/skills/add-node/SKILL.md)
- [`.claude/skills/verify-element-ui/SKILL.md`](.claude/skills/verify-element-ui/SKILL.md)
- [`.claude/skills/inspect-ax-tree/SKILL.md`](.claude/skills/inspect-ax-tree/SKILL.md)
- [`.claude/skills/release-sign-notarize/SKILL.md`](.claude/skills/release-sign-notarize/SKILL.md)

## VS Code / Cursor tasks

CMake configure, build, and CTest targets for `build-merged` are in [`.vscode/tasks.json`](.vscode/tasks.json). If you use another build directory (see [AI_HANDOVER.md](AI_HANDOVER.md) operational notes), run the equivalent commands manually or duplicate tasks locally.

## Full-repo LLM pack (Repomix)

See [`docs/REPOMIX.md`](docs/REPOMIX.md) and [`repomix.config.json`](repomix.config.json). Run `npx repomix@latest` at repo root; analysis snapshot: [`docs/REPOMIX_CONTEXT_SUMMARY.md`](docs/REPOMIX_CONTEXT_SUMMARY.md).
