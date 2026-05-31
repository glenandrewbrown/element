# Phase F — Team F-web evidence log

## Wave 1 batch 3 (2026-05-07, 22:00-22:25 GMT+1)

### F-10 — Vite chunk-split + Icon allowlist (Q1 closeout)
- **Commit:** 20ebf871
- **Files:** webview/src/components/neu/Icon.tsx, webview/vite.config.ts
- **Approach:** Option A — explicit static named-import allowlist for the 32 lucide-react icon names actually used in the codebase. The previous `import * as LucideIcons` defeated tree-shaking. A vite.config.ts manualChunks function additionally splits @xyflow/react, framer-motion, @lottiefiles/react-lottie-player, and react/react-dom/scheduler into separate chunks for cache reuse.
- **Bundle delta (npm run build):**
  - Before: main 1,293.21 kB / 355.59 kB gzip (single chunk, no manualChunks)
  - After: main 198.67 kB / 49.84 kB gzip + flow 185.65 kB + vendor 178.31 kB + motion 124.38 kB
  - Total JS: 1,293 → 687 kB (-606 kB, -47%)
  - Main chunk -84%; comfortably under the < 400 kB Phase F-10 target.
- **Tests:** 5 prior Icon snapshots unchanged (public API preserved).
- **Q1 status:** CLOSED.

### W-1 — NeuPromptModal replaces window.prompt
- **Commit:** 15bb5d31
- **Files:** webview/src/components/layout/NeuPromptModal.tsx (NEW), webview/src/components/layout/InspectorHub.tsx, webview/src/components/layout/__tests__/NeuPromptModal.test.tsx (NEW)
- **API:** Controlled component — open / title / description / placeholder / defaultValue / onConfirm / onCancel.
- **A11y:** role=dialog, aria-modal, aria-labelledby, aria-describedby, focus trap (input ↔ Cancel ↔ Confirm), ESC dismisses, Enter confirms, initial focus + select on input. Backdrop click is intentionally NOT a dismiss (anti foot-gun rule for destructive data ops).
- **InspectorHub PRESETS strip:** both window.prompt() call sites replaced. Diff is +25/-7 on the strip.
- **Tests:** 8 new vitest cases + 1 default snapshot.
- **Verification:** `grep -r 'window.prompt' src/` returns zero call sites in JS — only docstrings retain the term.

### F-9 — About modal + check-updates wiring
- **Commit:** 4b8619f6
- **Files:** webview/src/components/layout/AboutModal.tsx (modified — was a fire-and-forget shell), webview/src/components/layout/Toolbar.tsx (Edit-mode About button), webview/src/components/layout/__tests__/AboutModal.test.tsx (NEW)
- **State machine:** idle / checking / requested / error. Banner is `role="status"` `aria-live="polite"`. The "requested" state surfaces honest copy: Element runs the actual updater check in a separate native window (per Phase G OUT scope).
- **Toolbar:** About now visible in Edit mode (one-line addition next to Settings + Panic), matching Perform-mode placement.
- **Build number constraint:** AboutInfo lacks the field. Adding it requires a C++ change in src/ui/element_webview_host.cpp:2252-2259 (Team F-cpp scope) — recommended in coordination.md.
- **Tests:** 8 new vitest cases + 3 snapshots (idle / checking / requested).

## Cumulative verification (HEAD 4b8619f6 vs 4105eb23 Wave 1 start)

| Metric | Wave 1 start | Batch 1 (24787af3) | Batch 3 end (4b8619f6) |
|---|---|---|---|
| webview vitest | n/a | 7/7 | 34/34 |
| webview tsc errors | 0 | 0 | 0 |
| webview main JS | n/a (pre-batch1) | 1,293 kB | 203.24 kB |
| webview main gzip | n/a | 355.59 kB | 50.99 kB |
| webview total JS | n/a | 1,293 kB | 687 kB |
| ctest (C++) | 48/48 | 48/48 | 53/53 (Team C earlier landings — webview untouched) |

## Commits added by Team F-web in batch 3

```
20ebf871 perf(webview): F-10 Vite chunk-split + Icon allowlist (closes Q1)
15bb5d31 feat(webview): W-1 replace window.prompt with NeuPromptModal in PRESETS
4b8619f6 feat(webview): F-9 About modal with elementAppCheckForUpdates wiring
```

## Risks / surprises

- **lucide-react@1.14.0 (legacy major)** is what package.json pins. The static-import refactor still exposes all 32 icon names this codebase uses — no migration needed for this batch — but a future Phase F.0.8 custom-icon job (audio-domain glyphs that lucide doesn't ship) will need a separate scaffold for non-lucide SVG sources.
- **AboutInfo build number:** the bridge has `{ name, version, copyright }` only. The webview can't display the build number without a C++ change. The "version" string from `ELEMENT_VERSION_STRING` is what the user sees. Team F-cpp follow-up filed in coordination.md.
- **AboutModal "requested" state copy** is a deliberate honesty trade-off: the native bridge is fire-and-forget, so we can't truly tell the user "an update is available" without round-tripping more state from the native updater. Per Glen's directive (Phase G OUT of scope for this batch), the next-best UX is to tell the user that Element will surface the result in a separate window.

## Acceptance check vs master-fix-plan.md

- §F-block 1 W-1 (window.prompt -> NeuPromptModal in PRESETS): SHIPPED (commit 15bb5d31). NeuPromptModal exists at webview/src/components/layout/NeuPromptModal.tsx with full a11y contract. Both prior `window.prompt()` sites replaced. 8 vitest cases gate the contract.
- §F-block 2 F-9 (About modal calls elementAppCheckForUpdates): SHIPPED (commit 4b8619f6). State machine handles idle/checking/requested/error. About button now in both Edit and Perform mode toolbars. Build number deferred to Team F-cpp.
- §F-block 3 F-10 (Vite chunk-splitting + bundle reduction): SHIPPED (commit 20ebf871). Main chunk 198.67 kB (target was ≤ 400 kB). manualChunks splits flow / motion / lottie / vendor. Q1 explicitly closed in coordination.md.
