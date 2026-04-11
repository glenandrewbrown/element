# Element — Repomix context analysis

Generated from a full **`npx repomix@latest`** run using [repomix.config.json](../repomix.config.json). Regenerate after major changes; figures below are approximate snapshots.

## Pack scale

| Metric | Typical snapshot |
|--------|------------------|
| Files packed | ~926 |
| Total tokens (tiktoken `o200k_base`) | ~1.97M |
| Total characters | ~7.0M |
| Security scan (Secretlint) | No suspicious files reported in last run |

Binary paths (e.g. CLAP `.eps` artwork) are listed in structure but not inlined.

## Token concentration (where context “lives”)

| Area | Approx. tokens | Notes |
|------|----------------|--------|
| `src/` | ~1.19M | Majority of application + vendored Lua interpreter sources |
| `src/ui/` | ~558k | Native JUCE UI; **`icons.cpp` ~280k** dominates (embedded/icon data) |
| `src/lua/` | ~264k | Vendored Lua 5.x sources |
| `src/nodes/` | ~105k | Built-in node processors |
| `src/engine/` | ~102k | Audio engine, graph build, CLAP host paths |
| `deps/clap-juce-extensions/` | ~161k | CLAP + JUCE bridge |
| `docs/` | ~118k | Blueprint, plans, manuals |
| `include/element/` | ~64k | Public headers |
| `webview/` | ~56k | React/Tailwind frontend (sources only; `node_modules` excluded) |
| `test/` | ~56k | Boost.Test suites |

## Implications for LLM use

1. **Single-file context** (~2M tokens) exceeds typical chat windows — use the pack for tools with large context, chunking, or Repomix **`output.splitOutput`** if you need multiple parts.
2. **`icons.cpp`** is the largest single hotspot; for architectural Q&A, a slimmer pack can ignore or strip that file via `ignore.customPatterns`.
3. **Vendored Lua** under `src/lua/` is essential for scripting semantics but inflates size; exclude only if the task is unrelated to Lua embedding.
4. **Build trees and JUCE FetchContent dirs** are excluded by design — local CMake still required to compile; see [CLAUDE.md](../CLAUDE.md) and [repomix-instruction.md](../repomix-instruction.md).

## Regenerate

```bash
npx repomix@latest --verbose
```

Review CLI summary for updated totals; refresh this document when publishing a new baseline.
