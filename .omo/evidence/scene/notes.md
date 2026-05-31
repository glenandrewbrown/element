# F-201 Scene divergence — investigation notes (team-scene)

## Actual flow at HEAD-at-start (3e189415)

Toolbar prev/next button (Toolbar.tsx:455, 473)
  → useAppStore.setScene(index)
    → set({ activeScene: index })            // UI mirror
    → usePerformStore.getState().activateScene(index)   // <-- ALREADY WIRED
      → nativePerformSetActiveScene(index)
        → invokeElementNative("elementPerformSetActiveScene", [index])
          → C++ bridge

team-review's claim that "Toolbar prev/next never reaches the bridge"
is OUTDATED. The delegation in useAppStore.setScene (lines 74-77) was
landed in an earlier commit. The chain works at HEAD.

## What's actually missing

1. No test pinned the chain → any future regression that drops the
   `usePerformStore.getState().activateScene(index)` call from
   `useAppStore.setScene` would silently break F-201.
2. SceneLauncher.handleActivate / handleCaptureScene called
   nativePerformSetActiveScene directly *and* called setScene. That
   double-fires the bridge call (harmless but wasteful — the second
   call is identical and the host clamps it).

## Approach taken

Option (b)-equivalent: useAppStore.setScene is the canonical entry
point, and it already delegates to usePerformStore.activateScene (which
owns the bridge call). Lock that contract with a vitest suite so it
can't silently regress.

## Changes

- webview/src/stores/__tests__/sceneActivation.test.ts (new, 5 cases)
- webview/src/components/layout/SceneLauncher.tsx (drop redundant
  nativePerformSetActiveScene calls — chain via setScene only)

## Verification

- vitest: 41/41 → 46/46 (+5 new F-201 cases)
- tsc -b --noEmit: 0 errors
- npm run build: success, main bundle 210.82 kB (< 400 kB budget)
- Test cases:
  1. setScene updates UI index
  2. setScene flips usePerformStore.scenes[*].active
  3. setScene reaches the bridge with `elementPerformSetActiveScene`
  4. usePerformStore.activateScene reaches the bridge directly
  5. Toolbar prev/next math (mod sceneCount) hits the bridge with the
     correct argument; two button presses → exactly two bridge calls
     (no double-fire from setScene path)

## Verification: Toolbar prev/next reaches bridge?

YES — confirmed by test case 5 ("Toolbar prev/next semantics").
Two synthetic button presses produce exactly two
`invokeElementNative("elementPerformSetActiveScene", [N])` calls with
the correct N. The bridge contract is locked.
