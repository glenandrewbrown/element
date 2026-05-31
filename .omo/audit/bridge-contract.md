# Authoritative JS↔C++ Bridge Contract (call-site diff)

**Task:** Wave-1 plan item 2 — authoritative bridge contract via call-site diff.
**Date:** 2026-05-29 · **Branch:** `local-enhancements`
**Repo:** `/Volumes/Projects/Development_Projects/Github_Repos/element`
**Raw diff evidence:** `/Volumes/Projects/Development_Projects/Github_Repos/element/.omo/evidence/task-2-call-diff.txt`
**Wave-4 note:** This contract is correctness-critical. Wave 4 C++ builds against it. Every "stale"/"missing"/"present" verdict below is justified by a reference search with file:line.

---

## 0. Headline finding — the audit's "~7 missing natives" estimate is WRONG

The plan asked me to validate/correct the audit estimate of ~7 missing natives
(`elementScanPlugins`, `elementGetPluginPaths`, `elementAddPluginPath`,
`elementRemovePluginPath`, `elementGetPluginFormats`, `elementSetPluginFormat`,
`elementGetAudioDevices`). The authoritative call-site diff proves:

> **The true set of natives called by React but NOT registered in C++ is EMPTY ({}).**
> Every native React actually invokes is registered in `element_webview_host.cpp`.

The 7 audit-named functions have **zero React call sites** (verified: `rg <name> webview/src`
returns nothing for all 7). They are **unbuilt features**, not registration gaps — there is
no React caller AND no C++ registration. BUG-004's data is already satisfied by an existing
native (`elementGetEngineSnapshot.audioSetup`, §4). BUG-002 (plugin-path management) is a
genuinely absent feature on both sides (§5).

The *real* bridge gaps are **data-shape gaps**, not function gaps:
- Graph-state block JSON omits `format` and `category` (BUG-012/013) — verified §3.
- A latent `pluginFormatName` ↔ `PluginFormat` enum mismatch — verified §3.4.

---

## 1. Method (reproducible)

| Set | Command | Result |
|-----|---------|--------|
| JS-called | `rg -oN 'invokeElementNative\(\s*"(element[A-Za-z]+)"' webview/src -r '$1'` ∪ `rg -oN 'invokeNativeFunction\("(element[A-Za-z]+)"' webview/src -r '$1'` (path prefix stripped, `__tests__` excluded) | 80 names (incl. 1 synthetic test name) |
| C++-registered | name literal after each `registerFn (` in `src/ui/element_webview_host.cpp` (→ `opts.withNativeFunction`, host:838-841) | 86 names |
| Missing | `comm -23 js_called cpp_registered` | `{elementAnyCall}` → **false positive** |
| Unused | `comm -13 js_called cpp_registered` | 7 (C++ ahead of React) |

There is exactly **one** native-call mechanism in production code:
`invokeElementNative(name, args)` from `webview/src/bridge/juceBackend.ts` (which wraps
`window.__JUCE__.backend.invokeNativeFunction`). No `registerReceiver`/`getNativeFunction`
patterns exist. The host→JS push channel is `window.__elementNative.*` callbacks
(`useJuceBridge.ts:401-518`, e.g. `onMetering`), wired by C++ via `evaluateJavascript`.

### 1.1 The one "missing" entry is a test artifact

`elementAnyCall` occurs only at `webview/src/bridge/__tests__/juceBackend.test.ts:39`
(`invokeElementNative("elementAnyCall", [])`) — a synthetic arg-passthrough unit test, not a
real call site. Excluded → true missing set = `{}`.

### 1.2 Unused (registered in C++, no React caller) — informational, NOT Wave-4 targets

`elementGraphCreateWirelessBus`, `elementGraphDeleteWirelessBus`,
`elementGraphDuplicateNodesWithRewire`, `elementGraphGetWirelessBuses`,
`elementGraphSetConnectionSource`, `elementGraphSetConnectionTarget`,
`elementPerformMarkParameterMapped`. (C++ ahead of React. `elementGraphGetConnectionList`
is **not** unused — it is called by `nativeGraph.ts`.)

---

## 2. The reference pattern every native MUST follow (fix #1)

`element_webview_host.cpp:865-876` (`elementGetPluginList`):

```cpp
postCompletion (completion, JSON::parse (buildPluginListJson()));
```

Build a JSON **string** internally, then `JSON::parse(...)` it back to a structured `juce::var`
**before** `postCompletion`. Rationale (verbatim inline comment, host:867-874): JUCE's
`emitCompletionEvent` does `JSON::toString(result).replace("\\","\\\\")`, which is O(n × matches).
A JSON *string* result has every internal quote escaped → matches ≈ quote-count (~28k for the
~700 KB plugin payload) → ~150 s main-thread hang. A `var` serialises structurally → ~0
backslashes → O(n).

- `elementGetNodeParameters` follows the same pattern (host:889).
- **Exception:** `elementGetGraphState` (host:858-863) still returns a **plain string** `j`
  (`postCompletion (completion, j)`). It is consumed by `useJuceBridge` which accepts
  object-or-string. New large-payload natives MUST use the `JSON::parse` form, not this.

**All consuming stores already accept object-or-string** (e.g.
`usePluginBrowserStore.ts:69` `typeof raw === "string" ? JSON.parse(raw) : raw`;
`nativeEngineSnapshot.ts`). So the contract return type is "structured `var`, parsed by
React if a string is received."

---

## 3. Block-JSON contract (the real gap: format + category)

### 3.1 Two different block JSONs exist — do not conflate them

| Block JSON | Builder (host) | Emits `format`? | Emits `category`? | Consumer |
|------------|---------------|-----------------|-------------------|----------|
| **Plugin-list** entry (browser) | `buildPluginListJson()` 4382-4388 | ✅ `desc.pluginFormatName` | ✅ `desc.category` (or `"Uncategorised"`) | `usePluginBrowserStore.ts` |
| **Graph-state** block (canvas) | inline 4207-4250 | ❌ **NOT emitted** | ❌ **NOT emitted** | `useJuceBridge.mapBlock` 201-207 |

### 3.2 Graph-state block — current emitted keys (host:4211-4250, verified)

`id`, `name`, `x`, `y`, `bypassed`, `muted`, `muteInput`, `isContainer`,
`containerNodeCount` (containers only), `color`, `note`, `cpuLoad` (always 0 — FIXME US-002
at host:4232-4240), `latencyMs`, `ports[]` (`id`,`label`,`direction`,`signalType`,`type`).
**No `format`, no `category`.**

### 3.3 Consumer fallback proves the gap (BUG-012 / BUG-013)

`webview/src/hooks/useJuceBridge.ts`:
```ts
// 201-207 mapBlock:
category: (b as any).category ?? inferCategory(b),
format:   typeof (b as any).format === "string" ? (b as any).format : inferFormat(b),
// 181-183 inferFormat ALWAYS returns "INT"  → every block shows INT  (BUG-013)
// 167-179 inferCategory does crude name-substring matching             (BUG-012)
```
Because C++ never sends `format`/`category` on graph blocks, the `??` fallbacks always fire.

### 3.4 Contract: graph-state block JSON — ADD these two fields

| Field | Type | Source in C++ | Notes / back-compat |
|-------|------|---------------|---------------------|
| `format` | string | `n.getProperty(tags::format)` — verified present on node ValueTree at host:2166 | See enum normalisation §3.5. Empty/internal node → `"INT"`. |
| `category` | string ∈ `"generator"｜"modifier"｜"logic"` | derive from `PluginDescription.category` via `findKnownPluginByIdentifier` (host:152) + map to BlockCategory; container ⇒ `"logic"` | Consumer `BlockCategory` is the 3-value union (`webview/src/data/types.ts:2`). Raw plugin category strings ("Synth","Reverb") are NOT assignable — C++ MUST map to the 3-value set or React keeps inferring. |

- **Thread:** message thread (all natives run there; `elementGetGraphState` already builds on
  the message thread).
- **Error/empty:** if `format` unknown → emit `"INT"`; if `category` underivable → omit the key
  (consumer falls back to `inferCategory`, which is non-fatal). Never emit `null`.
- **Consumer:** `useJuceBridge.mapBlock` → `BlockData.format: PluginFormat`,
  `BlockData.category: BlockCategory` (`types.ts:18-19`).

### 3.5 Format-name normalisation (latent mismatch — must be specified)

`juce::PluginDescription::pluginFormatName` yields **`"AudioUnit"`, `"VST3"`, `"VST"`,
`"LV2"`, `"CLAP"`, `"Internal"`**. The React `PluginFormat` enum is **`"VST3"｜"AU"｜"CLAP"｜
"LV2"｜"INT"`** (`types.ts:3`). Mismatches: `"AudioUnit"`≠`"AU"`, `"Internal"`≠`"INT"`,
`"VST"`(VST2) has no enum member.

- The **plugin browser** store stores `format` as a raw string (`usePluginBrowserStore.ts:96`
  `String(p.format ?? "")`) — no enum coercion — so display is the raw JUCE name today.
- The **graph block** `mapBlock` casts to `PluginFormat` (`types.ts:19`), so a raw `"AudioUnit"`
  would be a type-invalid value at runtime.

**Contract:** C++ MUST normalise to the enum on graph-block `format` (and SHOULD on plugin-list
`format` for consistency): `AudioUnit→AU`, `VST3→VST3`, `CLAP→CLAP`, `LV2→LV2`,
`Internal/Element/empty→INT`, `VST→VST3`-fallback-or-document. Do the mapping in C++; do not
push raw `pluginFormatName`.

### 3.6 Saved-session BACK-COMPAT

- Graph nodes persist `tags::format` in the session ValueTree (proven by paste-rehydrate at
  host:2166 `nodeData.getProperty(tags::format)`). **Old sessions saved before `format` was
  written may have an empty `tags::format`** → C++ MUST treat empty as `"INT"` (mirrors
  host:2171 `formatName.isEmpty() ? "Internal"`), never crash or emit `null`.
- `category` is NOT persisted per-node; it is derived at snapshot time from the known-plugin
  list. For a plugin missing from the scan, derivation fails → omit `category` → React infers.
  This is the documented graceful degradation; no migration needed.
- React side is already tolerant: `mapBlock`'s `??` fallbacks make missing fields non-breaking.
  Therefore adding the fields is **purely additive and back-compatible** — no React change
  required for old payloads.

---

## 4. Audio devices — already covered by `elementGetEngineSnapshot` (BUG-004 is satisfied)

The audit listed `elementGetAudioDevices` as P0-missing. **It is not needed**: device data is a
sub-object of the engine snapshot. Registered at host:858-style `elementGetEngineSnapshot`;
`audioSetup` built at host:430-477.

### 4.1 `audioSetup` return schema — C++ keys vs consumer (EXACT MATCH, verified)

| Key | C++ emit (host) | Type | Consumer read | Match |
|-----|-----------------|------|---------------|-------|
| `outputDeviceName` | 430 | string | `useHostExtrasStore.ts:108` | ✅ |
| `inputDeviceName` | 431 | string | 111 | ✅ |
| `sampleRate` | 432 | number | 114 | ✅ |
| `bufferSize` | 433 | number | 115 | ✅ |
| `audioDeviceType` | 437 | string | 116 | ✅ |
| `deviceTypes` | 443 | string[] | 118-120 | ✅ |
| `outputDevices` | 472 | string[] | 121-123 | ✅ |
| `inputDevices` | 473 | string[] | 124-126 | ✅ |
| `bufferSizes` | 474 | number[] | 127-129 | ✅ |
| `sampleRates` | 475 | number[] | 130-132 | ✅ |

- **Thread:** message thread.
- **Error/empty:** `outDevs`/`inDevs` only populated for the current device type
  (host:447-463); `bufferSizes`/`sampleRates` only if `getCurrentAudioDevice() != nullptr`
  (host:464-470) → empty arrays when no device open. Consumer filters non-string/non-number
  and falls back to previous snapshot or `[]` (`useHostExtrasStore.ts:118-132`). Safe.
- **Consumer chain:** `nativeEngineSnapshot.ts:78` → `useJuceBridge.ts:364-365`
  `hydrateFromSnapshot({ audioSetup: s.audioSetup })` → `PreferencesModal.tsx:15,86,103`.
- **Coverage verdict:** every field the consumer reads IS supplied. **No new native needed.**
  Wave 4 should mark BUG-004 as "already wired" and instead surface a UI that applies the
  selection — `elementAudioApplySetup` is already registered (host) and called
  (`nativePrefs.ts`).

---

## 5. Forward-looking contracts for the 7 audit-named functions (NOT currently called)

These have no React caller and no C++ registration today. They are documented here as specs
**iff** Wave 4 decides to build plugin-path management (BUG-002). Each MUST follow the §2
`JSON::parse` structured-var pattern, run on the message thread, and never emit `null`.
**If Wave 4 does not build plugin scanning, none of these are required — do not add dead natives.**

| Fn | Args (`Array<var>`) | Return (structured var) | Empty/Error | Intended consumer (does not exist yet) |
|----|---------------------|--------------------------|-------------|----------------------------------------|
| `elementScanPlugins` | `[]` or `[formatName:string]` | `{ scanned:number, added:number, failures:string[] }` | failures `[]` if none; never throw | a plugin-manager store (TBD) |
| `elementGetPluginPaths` | `[]` | `{ paths: string[] }` (per current device formats) | `paths:[]` | preferences plugin-paths panel (TBD) |
| `elementAddPluginPath` | `[path:string]` | `{ ok:boolean, paths:string[] }` | `ok:false` if invalid path | same |
| `elementRemovePluginPath` | `[path:string]` | `{ ok:boolean, paths:string[] }` | `ok:false` if not present | same |
| `elementGetPluginFormats` | `[]` | `{ formats: Array<{ name:string, enabled:boolean }> }` | `formats:[]` | preferences formats panel (TBD) |
| `elementSetPluginFormat` | `[formatName:string, enabled:boolean]` | `{ ok:boolean }` | `ok:false` if unknown format | same |
| `elementGetAudioDevices` | — | **DO NOT BUILD.** Superseded by `elementGetEngineSnapshot.audioSetup` (§4). | — | — |

> Return-string note: `formatName` here is the **enum** value (`"VST3"`,`"AU"`,`"CLAP"`,`"LV2"`),
> normalised per §3.5 — do not pass raw JUCE `pluginFormatName`.

---

## 6. Acceptance-criteria checklist

| Acceptance item | Status | Evidence |
|-----------------|--------|----------|
| Complete missing-native set justified by call-site diff (not estimate) | ✅ set = `{}` | §0, §1, `.omo/evidence/task-2-call-diff.txt` |
| Each entry: arg shape + exact return JSON schema + thread + consumer | ✅ | §3 (block), §4 (audio), §5 (forward-looking) |
| Block-JSON spec incl. back-compat | ✅ | §3.5 (enum norm), §3.6 (empty `tags::format`→INT, category-omit graceful) |
| Cross-check return shapes against consumers | ✅ | §3.1, §4.1 (key-by-key, all supplied) |
| `postCompletion` structured-var pattern (fix #1) for all new natives | ✅ documented + exception flagged | §2 |

---

## 7. Wave-4 actionable summary

1. **Do NOT add the 7 audit-named natives reflexively.** The diff proves zero are "missing
   registrations." Build plugin-path management (§5) only if BUG-002 is in scope.
2. **Add `format` + `category` to graph-state block JSON** (host inline builder ~4211-4250),
   sourced from `tags::format` (host:2166) and `PluginDescription.category` via
   `findKnownPluginByIdentifier` (host:152), mapped to the 3-value `BlockCategory`. Fixes
   BUG-012 + BUG-013. Purely additive / back-compatible.
3. **Normalise format names to the `PluginFormat` enum in C++** (§3.5); empty → `"INT"` (§3.6).
4. **Mark BUG-004 closed** — audio device lists already flow via
   `elementGetEngineSnapshot.audioSetup` with key-exact match (§4.1).
