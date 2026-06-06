<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# data/ — types and Storybook/dev demo data

Shared TypeScript types and static fixture data. The fixture files (`demoGraph.ts`,
`functionGroup.ts`) exist exclusively for Storybook stories and dev-mode hot-reload.
They must NEVER be imported from any live component path that ships to users.

## Key Files

| File | Description |
|------|-------------|
| `types.ts` | Canonical TypeScript types for the webview: `BlockData`, `CableData`, `SignalType`, `BlockCategory`, `Port`, `BoardState`, and related interfaces. Import types from here — do not redeclare them locally. |
| `demoGraph.ts` | Static demo Board (nodes + edges) for Storybook stories and `npm run dev` hot-reload. **Storybook/dev only.** |
| `functionGroup.ts` | Demo function-group / Container fixture. **Storybook/dev only.** |

## For AI Agents

- **NOTHING-fake rule**: `demoGraph.ts` and `functionGroup.ts` are FORBIDDEN in any
  file that is part of a live component render path. Lint grep:
  `grep -r "demoGraph\|functionGroup" src/components src/hooks src/stores` must
  return zero results.
- `types.ts` is the single source of type truth. When adding new block categories,
  update `BlockCategory` here first, then update `neu/iconForCategory.ts`.
- `SignalType` values: `"audio"` | `"midi"` | `"value"` — these drive cable colour
  and `Cable.tsx` chip text formatting.
- Test command: `npx vitest run --dir src/data`

## Dependencies

- Internal: none (types only — nothing imports from src/)
- External: none
