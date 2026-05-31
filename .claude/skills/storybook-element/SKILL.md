---
name: storybook-element
description: Use when doing Storybook work in THIS Element repo — stories under webview/src/**, the :6006 MCP, Chromatic UI Review, neumorphic component states, or verifying webview UI via stories. Element-specific delta on top of the global `storybook` skill.
---

# Storybook — Element project delta

**REQUIRED BACKGROUND:** invoke the global `storybook` skill for the durable workflow (MCP-first loop, story patterns, testing, addons). This file is only the Element-specific delta. The repo's `CLAUDE.md` "Agentic UI workflow" section and `docs/CHROMATIC_FEEDBACK_WORKFLOW.md` are the canonical project context — read them; do not duplicate them here.

## Where things are

- Frontend lives in **`webview/`** (React + Vite + Tailwind, hosted in JUCE `WebBrowserComponent`). Run all Storybook commands from there: `cd webview`.
- Stories: `webview/src/**/*.stories.tsx` (~160). Config: `webview/.storybook/`.
- Start the dev server (makes the MCP live): `cd webview && npm run storybook` → `http://localhost:6006`, MCP at `:6006/mcp` (registered in repo `.mcp.json` as server `storybook`).

## Installed addons (don't re-add; setup is deliberately minimal)

`addon-docs`, `addon-themes`, `addon-a11y`, `addon-vitest`, `addon-designs`, `addon-mcp`, plus `@chromatic-com/storybook` (Visual Tests), `storybook-addon-pseudo-states` (hover/focus/pressed — used for neu states), `@storybook/addon-coverage`. Essentials was removed on purpose. See global `storybook` skill `references/addons.md`.

## Element-specific rules

- **Design system is locked + neumorphic** (NOT glass). Component states must use the neu tokens/shadows — see `CLAUDE.md` design tokens and the `neumorphism-generator` skill. Use `storybook-addon-pseudo-states` to show pressed/hover states as their own snapshots.
- **Stories seed Zustand stores in a decorator** (`useAppStore`/`useGraphStore`/`usePerformStore` `.setState(...)`) — mind the [[project_zustand_v5_selectors]] useShallow gotcha when a story mounts.
- **Verify gate:** after story/UI changes run `npm run verify-stories` (catches mount-time throws `tsc` can't) and `npm run build-storybook` (exit 0). Then MCP `run-story-tests` for interaction + a11y. See [[project_storybook_coverage]].
- **Feedback loop:** Glen comments per-component in **Chromatic UI Review**; resolve via the global skill's golden loop, then re-publish (`npm run chromatic`). In-Storybook "💬 Feedback" panel writes to `.omo/audit/ui-comments.jsonl` (see [[project_ui_feedback_channel]]).
- A webview-only change can leave the embedded app stale — see [[project_webview_bundle_postbuild]].
- **Do NOT** wire shelved UI (Dashboard / Macro / Scene) into new stories — decision D3.

## Commands

`/storybook` (project-aware orient) · global `/storybook:story|test|review` work here once `cd webview`.
