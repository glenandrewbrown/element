<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# .storybook/ — Storybook 9 configuration

Storybook 9 config for the Element webview. Stories colocate with their
components as `*.stories.tsx`. The `verify-stories.mjs` script is a mandatory
render-gate that catches mount-time throws TypeScript cannot. Human feedback and
visual governance flow through Chromatic UI Review (per-component comments on PRs).

## Key Files

| File | Description |
|------|-------------|
| `main.ts` | Storybook builder config: `@storybook/react-vite` framework, addon list, story glob (`src/**/*.stories.tsx`). |
| `preview.ts` | Global decorators, parameters, and Tailwind/design-token CSS imports applied to every story. |
| `decorators.tsx` | Shared React decorators (e.g. Zustand store provider, bridge mock wrapper) applied globally via `preview.ts`. |
| `manager.tsx` | Storybook Manager customisation — registers the "Feedback" UI panel that writes to `.omo/audit/ui-comments.jsonl`. |
| `ui-comment-sink.ts` | Logic for writing UI feedback comments from the manager panel to `.omo/audit/ui-comments.jsonl`. |
| `verify-stories.mjs` | **Render-verify gate.** Enumerates all stories via the Storybook index, mounts each one headlessly with Playwright Chromium, fails on any `pageerror` or `console.error`. Exit 0 = all clean, exit 1 = at least one failed. Catches Zustand v5 `getSnapshot` infinite-loop bugs and other mount-time throws. Usage: `node .storybook/verify-stories.mjs [story-id-prefix]`. 2 known pre-existing failures: `layout-bottomstrip--edit-tempo`, `canvas-quickaddpopup--docs` — do not add new ones. Also enforces a `NODE_` prefix lint guard. |
| `shot.mjs` | Story screenshot capture script — renders a story and saves a PNG. Used for design-reference snapshots. |
| `measure-block.mjs` | Utility to measure Block story layout dimensions (used for Chromatic baseline calibration). |
| `vitest.setup.ts` | Storybook-specific Vitest setup (separate from `src/test/setup.ts`). |

## Commands

```bash
cd webview
npm run storybook              # dev server at http://localhost:6006
npm run build-storybook        # static build
npm run verify-stories         # headless render-gate (requires SB running or SB_URL set)
```

## Storybook MCP

The Storybook MCP server runs at `http://localhost:6006/mcp` when the dev server
is active. Use it to:
- `list-all-documentation` / `get-documentation` — discover real component props
- `get-storybook-story-instructions` — authoring conventions for this project
- `run-story-tests` — run interaction + a11y tests; iterate until green

Do NOT invent component props — always verify via the MCP or story source.

## Design references (addon-designs)

Stories can attach design references via `parameters.design` using
`@storybook/addon-designs`. Accepted formats: Figma URL, Stitch export URL,
or image URL. Used for the bake-off review workflow where each story shows
Element implementation alongside the mindful-studio mockup reference.

## Chromatic UI review workflow

See `docs/CHROMATIC_FEEDBACK_WORKFLOW.md` for the full process. Summary:
- Chromatic runs on every PR, generating per-story visual diffs
- Reviewers leave inline comments via the Chromatic UI (or the in-Storybook
  Feedback panel → `.omo/audit/ui-comments.jsonl`)
- The `_Review*.stories.tsx` files in `canvas/` and `layout/` are guided
  side-by-side review stories (mine vs mockup), one component at a time

## For AI Agents

- Every new component needs a `*.stories.tsx` — include at least a Default story
  and any interactive states (hover, pressed, active, disabled).
- Run `npm run verify-stories` after any component change. Do not introduce new
  failures beyond the 2 known pre-existing ones.
- The `verify-stories.mjs` NODE_ lint guard rejects stories that reference
  internal Node.js APIs — keep story files browser-safe.
- Story files are Storybook/dev only — they may import `src/data/demoGraph.ts`
  fixtures, but those fixtures must never leak into production component paths.

## Dependencies

- External: Storybook 9 (`@storybook/react-vite`), Playwright 1.59,
  `@storybook/addon-designs`, `@storybook/addon-interactions`, `@storybook/test`
