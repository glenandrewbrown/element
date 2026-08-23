# ADR-003: React WebView Frontend with React Flow

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: ui, architecture
**Tags**: webview, frontend, juce, react-flow

## Context

JUCE's native component system is adequate for compact mixers and meters but slows the rate of iteration on richer surfaces (graph canvas, command palette, inspector tabs, dashboard builder). The Instrument Paradigm requires dense, interactive surfaces that change frequently during the V3 overhaul. A web-stack frontend gives faster iteration, a mature graph editor (React Flow), and a single design-system source.

## Decision

Host a **React + Tailwind** UI inside JUCE's `WebBrowserComponent`.

- Graph canvas uses `@xyflow/react` (React Flow v12) with aggressive memoisation.
- C++ ↔ JS bridge: `window.__JUCE__`.
- State: `juce::ValueTree` is the single source of truth; a 60 Hz JUCE Timer mirrors mutations into a React store (Zustand: `useGraphStore`, `useAppStore`, `usePerformStore`).
- WebView assets are built from `webview/` and bundled into the JUCE binary.

Web shell is the long-term target for **all** user-facing features per `docs/WEBVIEW_HYBRID_POLICY.md`; classic JUCE-only panels are transitional, not permanent.

## Consequences

### Positive
- Hot reload + Storybook for UI work without rebuilding C++.
- React Flow handles pan/zoom, edge routing, and minimap out of the box.
- Design tokens defined once in CSS and reused across all panels.

### Negative
- Bridge serialisation cost on every state sync — partly mitigated by 60 Hz batching and structural sharing in Zustand.
- WebView platform quirks (macOS WKWebView vs. Windows WebView2 vs. Linux WebKitGTK) require parallel testing.
- Browser-style accessibility tooling does not replace JUCE AX paths; UI verification still goes through the macOS Accessibility API (`tools/automation/`).

### Neutral
- Native JUCE remains the host for the audio engine, plugin scanning, and any latency-sensitive UI (transport, meters considered case by case).

## Links
- `docs/WEBVIEW_HYBRID_POLICY.md`
- `webview/`
- ADR-001 (visual language)

**Related**: ADR-001
