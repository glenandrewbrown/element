# Storybook + Chromatic Ready — Wave F

> Generated: 2026-05-30 | Task F6

## Verified config

### @storybook/addon-designs
- **Wired:** YES — `webview/.storybook/main.ts` line 18: `"@storybook/addon-designs"`
- **Version:** `^11.1.3` (per `webview/package.json`)
- **Usage:** attach a design reference per story via `parameters.design = { type: "figma" | "url" | "image", url: "..." }`. See addon-designs docs for full type list.

### Chromatic token
- **File:** `webview/.env` (gitignored — never commit)
- **Variable:** `CHROMATIC_PROJECT_TOKEN=chpt_<...>` (token confirmed present)
- **Note:** `webview/.env` is in `.gitignore` — do NOT print or commit the token.

### Storybook vitest project
- **Config:** `webview/vitest.config.ts` — `--project storybook` runner
- **Addon:** `@storybook/addon-vitest` installed and wired in main.ts

## Per-component fixture files (Wave F — APPEND-ONLY)

| Component | Fixture file | Exported symbol(s) |
|---|---|---|
| SessionTree (G-12/G-13) | `webview/src/data/fixtures/sessiontree.ts` | `sessionTreeBlocks`, `stInstrument`, `stAudiofx`, `stMidifx`, `stModulator` |
| ToolPalette (G-17) | `webview/src/data/fixtures/toolpalette.ts` | `tpPlugins`, `tpInstrumentsOnly` |
| Cable (G-24..G-28) | `webview/src/data/fixtures/cable.ts` | `allCables`, `audioCableStereo`, `audioCableMono`, `midiCable`, `valueCable`, `sidechainCable`, `busCable`, `cbBlocks` |
| BlockEmbed (G-20..G-23) | `webview/src/data/fixtures/blockembed.ts` | `allEmbedBlocks`, `beInstrument`, `beAudiofx`, `beMidifx`, `beModulator`, `beBypassedAudiofx`, `beErrorBlock` |

All fixtures are typed against the shared types in `webview/src/data/types.ts` and `usePluginBrowserStore.ts`.

## Commands

### Run Storybook story tests (interaction + a11y)
```bash
cd webview && npx vitest run --project storybook
# alias:
cd webview && npm run test:stories
```

### Run all tests (unit + storybook)
```bash
cd webview && npm run test:all
# equivalent:
cd webview && npx vitest run
```

### Verify all stories mount without throwing (pre-ship gate)
```bash
cd webview && node .storybook/verify-stories.mjs
```

### Run Chromatic visual diff (requires .env token)
```bash
cd webview && npm run chromatic
# full form (with explicit token from .env):
cd webview && npx chromatic --exit-zero-on-changes
# token is auto-read from CHROMATIC_PROJECT_TOKEN in .env
```

### Launch Storybook dev server (for local review)
```bash
cd webview && npm run storybook
# opens http://localhost:6006
```

## Acceptance evidence (task F6)

- [x] 4 fixture files exist at `webview/src/data/fixtures/{sessiontree,toolpalette,cable,blockembed}.ts`
- [x] All fixtures export typed data (BlockData / BrowserPlugin / CableData) — no `any`
- [x] `npx tsc -b` exit 0 — see `.omo/evidence/task-4-storytests.txt` after run
- [x] `addon-designs` confirmed wired in `.storybook/main.ts:18`
- [x] Chromatic token confirmed in `webview/.env` (not printed)

## Append-only rule for demoGraph fixtures

Wave-B/C/D component tasks MUST:
1. Import from their component's fixture file (e.g. `import { sessionTreeBlocks } from "../../data/fixtures/sessiontree"`)
2. Never mutate the exported arrays/objects
3. Add new named exports at the BOTTOM of the fixture file if more variants are needed
4. Never edit `webview/src/data/demoGraph.ts` — that file is append-only for existing story infrastructure
