<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# docs/adr/ — Architecture Decision Records

Immutable records of key architectural decisions. Read before proposing
changes in the covered areas. ADR-011 is the **active UI build method** —
all V3 component work must follow it.

## ADR Index
| File | Decision |
|------|----------|
| `ADR-001-neumorphic-design-language.md` | Neumorphism (not glassmorphism) as the sole visual language |
| `ADR-002-three-signal-types.md` | Three signal types: Audio (blue), MIDI (teal), Value/CV (orange) |
| `ADR-003-react-webview-frontend.md` | React/Tailwind frontend hosted in JUCE `WebBrowserComponent` |
| `ADR-004-atomic-pointer-swap-audio-thread.md` | Lock-free audio thread via atomic pointer swap (no mutexes) |
| `ADR-005-sandboxed-plugin-processing.md` | Out-of-process plugin isolation via `element_sandbox_host` |
| `ADR-006-navigation-panel-icon-sidebar.md` | Icon sidebar (`NavigationPanel`) replaces `ConcertinaPanel` accordion |
| `ADR-007-speed-first-navigation-gestures.md` | Speed-first gestures: double-click dive, Cmd+K palette, spatial bookmarks |
| `ADR-008-plugin-editor-teardown-order.md` | Plugin editor must be closed and cleared BEFORE removal from JUCE hierarchy |
| `ADR-009-verbose-log-convention.md` | Verbose logging convention for agent-readable diagnostics |
| `ADR-010-au-off-thread-call-deferral.md` | AU off-thread call deferral to avoid audio-thread violations |
| `ADR-011-ui-cherrypick-bakeoff-method.md` | **Current UI build method** — cherry-pick bake-off; 37 verdicts in `.omo/bakeoff/VERDICTS.md` |

## For AI Agents
- ADRs are **read-only** — never modify them.
- Before any UI component work, check ADR-011 and the corresponding verdict
  in `.omo/bakeoff/VERDICTS.md`.
- Before any audio-thread change, review ADR-004.
- Before any plugin-editor lifecycle change, review ADR-008.
