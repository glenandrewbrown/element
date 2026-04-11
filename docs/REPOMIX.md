# Repomix (repository pack for LLMs)

This repo is configured for **[Repomix](https://github.com/yamadashy/repomix)** (often misspelled “repomax”) — a local CLI that merges the codebase into one AI-friendly file with token counts and a directory map.

## Quick run

From the repository root (use `bash` if your shell errors on `npx`):

```bash
npx repomix@latest
```

Uses [repomix.config.json](../repomix.config.json). Output defaults to **`repomix-output.md`** (gitignored).

## What gets packed

- **Included**: application sources (`src/`, `include/`, `test/`, `cmake/`, `docs/`, `webview/` source, `tools/automation`, vendored deps such as `deps/clap-juce-extensions`, Lua sources under `src/lua/`, `.claude/skills`, etc.
- **Excluded**: `.gitignore` patterns, `node_modules`, build trees, FetchContent stubs for `deps/juce` / `deps/lvtk` / `deps/sol2`, large SDK paths (`libs/vstsdk2.4`, `libs/ASIOSDK`), installer `.pkg`/`.dmg`, `.cursor/`, `repomix-output.*`, screenshot PNG.

Context for readers of the pack: **[repomix-instruction.md](../repomix-instruction.md)** is embedded via `instructionFilePath`.

## Analysis summary

See **[REPOMIX_CONTEXT_SUMMARY.md](REPOMIX_CONTEXT_SUMMARY.md)** for token distribution and hotspots from the last pack.

## Optional: slimmer pack (Element-only)

To focus on first-party C++ and exclude vendored Lua/CLAP trees, run with `--include` patterns or add `ignore.customPatterns` in `repomix.config.json` (e.g. `src/lua/**`, `deps/**`) — trade completeness for smaller context.
