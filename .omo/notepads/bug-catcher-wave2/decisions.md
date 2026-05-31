## [2026-05-08T02:05:14Z] Architectural Decisions

### Bridge Data Availability Rules
- If bridge data doesn't exist: render HONEST EMPTY STATE, never fake values
- BlockEmbed VU: replace 0.62/0.58/0.78/0.74 with 0 + TODO comment
- Per-block CPU: if getCpuUsage() per-node not accessible, leave as 0 with honest comment

### Test Infrastructure
- Follow pattern in webview/src/stores/__tests__/useEngineSnapshotStore.test.ts
- Mock window.ipc.invoke for store tests
- Mock window.ipc for bridge wrapper tests
- Use vi.fn() for all mocks

### AX Accessibility Fix Pattern
- Icon-only buttons MUST have title="[Action Name]" on the <button> wrapper
- This surfaces as AXTitle in the accessibility tree
