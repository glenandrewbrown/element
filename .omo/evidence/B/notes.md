# Phase B — Stop the Bleeding — Team B execution log

Wave 1 start SHA: `4105eb23`
Baseline ctest: 48/48 green
Final ctest: 49/49 green (added RootGraphMissingNodeTests)

## Per-task results

```
B-1 | 271fa8a3 | F-1 connectChannels OR-fix already-applied at graphnode.cpp:243 (NOT graphbuilder.cpp); added RootGraphMissingNodeTest with 4 cases (missing src, missing dst, both missing, after-remove)
B-2 | (no SHA) | F-2 lastGraph >= 0 guard already-applied at audioengine.cpp:91 — `(lastGraph >= 0 && lastGraph < graphs.size()) ? getGraph(lastGraph) : nullptr`
B-3 | (no SHA) | F-3 PortBuffer::reset() type guard already-applied at portbuffer.cpp:170-199 — branches on isAudio()/isCV()/isControl()/isSequence()/isEvent() before any atom/event header writes
B-5 | (no SHA) | F-5 sibling<GuiService> null-guard already-applied across services — engineservice.cpp:447,1142,1147; sessionservice.cpp:73,78,221-223 (line 221 is the only ungated read but is followed by `if (! gui) return;` on next line)
B-7 | (no SHA) | F-7 AudioMixer RMS bounds already-applied at audiomixer.cpp:494 — `for (int i = 0; i < jmin (2, output.getNumChannels()); ++i)`
B-9 | (no SHA) | F-9 changeBusesLayout bounded loop already-applied at engineservice.cpp:1057-1061 + 1076-1077 — `attempts < 500` with early-return on still-suspended
B-10 | (no SHA) | F-10 changeResetter null-check already-applied at sessionservice.cpp:63-65 — `if (changeResetter) changeResetter->cancelPendingUpdate();`
```

## Notes / surprises

- The plan §3.2 row F-1 mis-locates the bug as `src/engine/graphbuilder.cpp` — the actual symbol lives in `src/engine/graphnode.cpp` (`GraphNode::connectChannels`). `graphbuilder.cpp` has no `connectChannels` function. Plan should be corrected for future audits.
- Every "🟡 NEEDS verify" item in the plan was already fixed at HEAD `4105eb23`. Phase B was effectively a verification pass; the only net code added was the regression test for B-1 (mandated by brief).
- Pre-commit hook `conventional-commits.js` blocks `git commit -m` heredoc invocations — its regex captures the line after `EOF\n` (empty). Workaround: write message to file and use `-F`.

## Verification commands

```bash
# Baseline + post-test
ctest --test-dir /Volumes/Projects/Development_Projects/Github_Repos/element/build-merged --output-on-failure -j4

# Targeted new test
ctest --test-dir /Volumes/Projects/Development_Projects/Github_Repos/element/build-merged -R "RootGraphMissingNodeTests" --output-on-failure
```
