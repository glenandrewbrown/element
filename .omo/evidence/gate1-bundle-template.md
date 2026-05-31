# Gate 1 Evidence Bundle — Wave 1 (Phases B + C + E + F.0)

**Generated:** _to be filled at Gate 1_
**Wave 1 start SHA:** `4105eb23` (`local-enhancements`)
**Wave 1 end SHA:** _to be filled_
**Glen verdict required:** OK / revise / stop (3-word reply)

---

## One-sentence summary per team

- **Team B** (crash + RT): _to be filled_
- **Team E** (Lua security): _to be filled_
- **Team U** (UI design system): _to be filled_

## Evidence

| Team | Evidence dir | ctest delta | Commits |
|---|---|---|---|
| B | `.sisyphus/evidence/B/` | 48 → _N_ | _list_ |
| C | `.sisyphus/evidence/C/` | _N_ → _M_ | _list_ |
| E | `.sisyphus/evidence/E/` | _M_ → _P_ | _list_ |
| F.0 / F | `.sisyphus/evidence/F.0/`, `.sisyphus/evidence/F/` | _P_ (no C++ delta from UI) | _list_ |

## Diff stats

```
$ git diff 4105eb23..HEAD --stat
<paste at gate>
```

## Static-quality verification

- [ ] `cmake --build build-merged -j8` exit 0
- [ ] `ctest --test-dir build-merged --output-on-failure -j4` 100% green
- [ ] Sanitizer build (`build-sanitize`) — random-driver 5-minute run, no ASan/UBSan reports
- [ ] `cd webview && npm run build` exit 0, no warnings above threshold
- [ ] `cd webview && npx vitest run` 100% green
- [ ] `cd webview && npx playwright test` smoke green
- [ ] `tools/automation/element_verify.py --suite all` 100% green (Element.app must be running)

## Acceptance per phase (vs master-fix-plan.md §6)

### Phase B
- [ ] All 9 forensic crashers (F-1..F-10 minus already-applied) verified or fixed
- [ ] New `RootGraphMissingNodeTest` proves F-1 fix (or already-applied verified)
- [ ] Sanitiser run clean over 5-minute random session

### Phase C
- [ ] `tools/realtime-safety.sh` (or equivalent harness in test/realtime/) returns 0 audio-thread allocations
- [ ] Steady-state stress harness: 100 plugin nodes, 60-second run, 0 xruns

### Phase E
- [ ] `SandboxIsolationTest` passes for every banned API
- [ ] Counter-tests: allowed APIs still succeed

### Phase F.0
- [ ] `<Icon />` component lives at `webview/src/components/neu/Icon.tsx`
- [ ] `grep -rn 'ICON_[A-Z_]*\s*=' webview/src` returns 0 matches
- [ ] motion vocabulary tokens defined; `webview/src/index.css` has the CSS custom properties

### Phase F (UI parity — only if reached this batch)
- [ ] `window.prompt` removed from shipped JS bundle
- [ ] `MessageManager::callAsync` lambdas use SafePointer
- [ ] WEBVIEW_QA smoke green for Logic AU + standalone

### Phase H (services tests — only if reached this batch)
- [ ] ctest count ≥ 65 (baseline 48 + 7 service tests + extras)

## Risks / surprises discovered

_per-team bullets at gate_

## Audio listen request (mandatory for Phase C ratification)

> Glen — please load a complex session in Element, run for 10 minutes, and listen for glitches/dropouts/xruns under steady-state. Reply OK / regression / hold.

## Recommendation

_proceed | revise <X> | stop_
