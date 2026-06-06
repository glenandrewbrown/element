<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/ — Vitest global setup and fixtures

Global test infrastructure loaded by `vitest.config.ts`. All unit tests live
colocated with their modules in `__tests__/` subdirectories — this directory
holds only the global setup file, mock utilities, and shared fixtures.

## Key Files

| File | Description |
|------|-------------|
| `setup.ts` | Loaded via `vitest.config.ts` `test.setupFiles`. Extends `expect` with `@testing-library/jest-dom/vitest` matchers. Registers `afterEach(cleanup)` — Vitest 4 does not auto-cleanup the DOM between tests. |
| `mockJuceBridge.ts` | Mock implementation of `src/bridge/juceBackend.ts` for unit tests. Provides `vi.fn()` stubs for all `invokeNativeFunction` calls. Import in test files that need bridge isolation. |
| `fixtures/` | Shared test fixture data (small static graphs, node/edge arrays) for use across `__tests__/` suites. Must not import from `src/data/demoGraph.ts` (keep fixture data small and test-specific). |

## For AI Agents

- Unit tests go in `__tests__/` next to the module they test, NOT in this
  directory.
- `mockJuceBridge.ts` must be kept in sync with the actual bridge API in
  `src/bridge/juceBackend.ts` — update it whenever a new native function is added.
- `setup.ts` is intentionally minimal. Do not add global mocks here unless they
  are needed by every test in the project.
- Run all tests: `npx vitest run` (from `webview/`)
- Run a specific directory: `npx vitest run --dir src/<module>/`
- The Storybook render-gate (`npm run verify-stories`) is a SEPARATE check from
  Vitest — it catches mount-time throws that TypeScript cannot.

## Dependencies

- External: Vitest 4, @testing-library/react, @testing-library/jest-dom
