# team-catch — Story 6 — silent-failure / empty-catch sweep

**Mission:** Replace empty `} catch {}` and silent `if (raw == null) return;`
across the React webview with a consistent error-logging helper that surfaces
problems instead of masking them.

**Reference:** `.sisyphus/qa/deep-review.md` Class 8 (16 instances)

---

## Discovery

`grep -rn "catch[ ]*([^)]*)[ ]*{[ ]*}\|catch[ ]*{[ ]*}\|/\* ignore"` over
`webview/src/` returned the following sites:

| File | Lines | Count |
|------|-------|-------|
| `webview/src/bridge/nativeEngineSnapshot.ts` | 78, 86 | 2 |
| `webview/src/bridge/nativeSession.ts` | 62 | 1 |
| `webview/src/bridge/nativeGraph.ts` | 285, 324, 352, 373, 384, 406, 421, 436, 448, 460, 471 | 11 |
| `webview/src/hooks/useJuceBridge.ts` | 414, 453 | 2 |
| `webview/src/stores/usePluginBrowserStore.ts` | 92 (DEV-only warn), 55 (silent null return) | 2 |

Total = 18 distinct catch / silent-null sites (deep-review counted 16 — the
extra 2 are the inline `} catch {}` JSON.parse pairs at the bottom of
`nativeGraph.ts` that share a line). All are mapped to deep-review.md
Class 8 IDs 8.1 .. 8.16.

---

## Helper

`webview/src/bridge/bridgeError.ts` — single `logBridgeError(label, err)`
function. Never throws, `console.warn` with full error context. Does not
spam dev console for benign no-bridge resolutions because
`invokeElementNative` resolves to `undefined` (not a throw) when
`__JUCE__` is absent — the existing `if (raw == null) return null` early
returns short-circuit before the catch runs.

---

## Replacements

### Commit 1 — `cfd21661`
`feat(webview): logBridgeError helper for surfacing silent bridge failures`

Adds the helper file. 1 file, +34 lines.

### Commit 2 — `46f487f0`
`fix(webview): replace empty catches in stores + hooks with logBridgeError`

| File | Sites replaced |
|------|---------------|
| `bridge/nativeEngineSnapshot.ts` | invoke catch + JSON.parse catch |
| `bridge/nativeSession.ts` | listFiles JSON.parse |
| `bridge/nativeGraph.ts` | 11 catches across NodeParameters, GraphTree, ConnectionList, Script*, Preset* |
| `hooks/useJuceBridge.ts` | onGraphState string-parse catch + boot-effect catch |
| `stores/usePluginBrowserStore.ts` | ad-hoc DEV-only warn → unified helper, plus added breadcrumb log on `raw == null` to distinguish "scan complete 0 plugins" from "bridge unavailable" (deep-review 4.4) |

5 files changed, +79 / -24.

The `if (raw == null) return null` in `nativeGetEngineSnapshot.ts:81`
was deliberately **left untouched** — its function comment documents it
as the dev-mode no-bridge fallback, not a silent failure. Only the
preceding invoke + parse catches log.

---

## Verification

| Metric | Before | After |
|--------|--------|-------|
| `vite build` main chunk | 210.82 kB | 211.49 kB |
| `vitest run` | 41/41 pass | 46/46 pass (team-scene added 5) |
| `tsc -b` | 0 errors | 0 errors |
| Empty `} catch {}` sites | 16 | 0 |
| `ctest` | 67/67 (untouched) | 67/67 (untouched, no C++ change) |

No regression. Commits are atomic and never used `--no-verify`.

---

## Sites NOT touched

Files reserved for `team-scene`:
  - `webview/src/components/layout/SceneLauncher.tsx`
  - `webview/src/stores/__tests__/sceneActivation.test.ts` (new)
  - `webview/src/stores/useAppStore.ts`
  - `webview/src/stores/usePerformStore.ts`
  - `webview/src/components/layout/Toolbar.tsx`

If any of those have empty catches, team-scene picks them up.

`nativeGetEngineSnapshot.ts:81` `if (raw == null) return null` is intentional
dev-mode fallback per the function's docstring. Logging would spam pure-Vite
dev consoles. Left as-is.
