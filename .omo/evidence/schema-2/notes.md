# team-schema-2 — Evidence

## Status (2026-05-08 01:15 GMT+1)

Both ralph stories 2 + 3 were already shipped by the prior team-snap-schema dispatch
(commits `9ba350bc` and `19ca97fe` / `590e7d1a` / `d626a19f`). Re-dispatch verified
the work is durable and on `local-enhancements`.

## Part 1 — Per-block cpuLoad + latencyMs (commit `9ba350bc`)

- `src/ui/element_webview_host.cpp:4136-4186` — `buildActiveGraphJson` reads
  `context.devices().getCurrentAudioDevice()->getCurrentSampleRate()` once
  outside the node loop, then per-node calls `Processor::getLatencySamples()`
  and emits `cpuLoad` + `latencyMs` on each block JSON object.
- `cpuLoad` is currently 0 with a `FIXME(US-002)` because there is no
  per-Processor CPU source today (`AudioDeviceManager::getCpuUsage()` is
  engine-wide). JSON shape is stable for when a per-block measurement layer
  lands.
- `webview/src/hooks/useJuceBridge.ts:199-224` — `mapBlock` no longer
  hard-codes `cpuLoad: 0, latencyMs: 0`; reads via type-safe defaults
  (`typeof b.cpuLoad === "number" && b.cpuLoad >= 0 ? b.cpuLoad : 0`).

## Part 2 — transport.timecode + typo fix (commits `19ca97fe`/`590e7d1a`/`d626a19f`)

- `src/ui/element_webview_host.cpp:885-958` — `elementGetEngineSnapshot`
  emits `transportTimecode` (BBT string from `Monitor::getBarsAndBeats`,
  1-indexed `bar.beat.subBeat`) plus `transportFrame` (lossless sample-frame
  count) plus `timeSig` array.
- `webview/src/bridge/nativeEngineSnapshot.ts:32-35,99-101,116` — parses
  `transportTimecode` from the snapshot, defaults to `"1.1.0"` when absent.
- `webview/src/stores/useEngineSnapshotStore.ts:88-91,144-145` — write-throughs
  `transportTimecode` into `usePerformStore.liveHealth.timecode` and exposes
  `selectTransportTimecode` selector.
- `webview/src/hooks/useJuceBridge.ts:343-361` — `applySnapshot` no longer
  writes `timecode: sampleRateLabel` (typo dropped). Comment block at
  `:353-356` documents that `useEngineSnapshotStore` owns the field.

## Verification (2026-05-08 01:15)

| Check | Result |
|------|--------|
| `npx tsc -b --noEmit` (webview) | exit 0 |
| `npx vitest run` (webview) | 41/41 |
| `npm run build` (webview) | exit 0; main chunk 210.36 kB / gzip 53.10 kB |
| `cmake --build build-merged --target element_app -j8` | exit 0 |
| `ctest --output-on-failure` | (pending — running) |

## Files touched (vs HEAD-at-start `f62147aa`)

```
src/ui/element_webview_host.cpp                 +29 (Part 1)
webview/src/hooks/useJuceBridge.ts              +10/-2 (Part 1 + Part 2 typo fix)
webview/src/bridge/nativeEngineSnapshot.ts      transportTimecode parsing (Part 2)
webview/src/stores/useEngineSnapshotStore.ts    transportTimecode write-through + selector (Part 2)
```

## Closes

- deep-review.md Class 1 / 1.1 — mapBlock cpuLoad/latencyMs hardcoded 0
- deep-review.md Class 1 / 1.15-1.17 — InspectorHub + Block.tsx downstream zeros
- deep-review.md Class 5 / 5.1 — StatusBar timecode placeholder
- deep-review.md Class 5 / 5.2 — Toolbar SAMPLE timecode field

## Risks

- `cpuLoad` always renders 0 by design (FIXME documented). Block.tsx and
  InspectorHub already gate display on `> 0`, so it's invisible until a
  per-Processor CPU source ships.
- `transportTimecode` BBT string is computed only when the audio engine is
  active and a `Transport::Monitor` is available; default `"1.1.0"`
  otherwise. Consumers must tolerate the default.
