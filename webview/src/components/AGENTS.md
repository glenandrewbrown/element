<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# components/ — UI component tree

All React components for the Element webview. Three functional layers: `neu/` (design-system
primitives), `layout/` (shell, toolbar, panels), `canvas/` (graph editing surface). `reactbits/`
holds a single third-party-derived animated text component. Every directory has colocated
`*.stories.tsx` files and a `__tests__/` subdirectory.

## Subdirectories

| Directory | AGENTS.md | Role |
|-----------|-----------|------|
| `canvas/` | [canvas/AGENTS.md](canvas/AGENTS.md) | GraphCanvas, Block, Cable, QuickAddPopup, CommandPalette, context menus |
| `layout/` | [layout/AGENTS.md](layout/AGENTS.md) | AppShell, Toolbar, panels (InspectorHub, BottomStrip, ToolPalette, LiveHealth…) |
| `neu/` | [neu/AGENTS.md](neu/AGENTS.md) | Neumorphic design-system primitives (NeuButton, NeuKnob, NeuFader, NeuToggle, NeuInput, NeuDisplay, NeuBadge, Icon, EmptyState, Skeleton) |
| `reactbits/` | [reactbits/AGENTS.md](reactbits/AGENTS.md) | Animated text components (BlurText) |

## For AI Agents

- All new components must use neumorphic tokens from `src/index.css` — no glass, no
  `backdrop-blur`, no `bg-opacity-*`.
- Block category colours (Virtual Instruments blue, MIDI Effects teal, Audio Effects
  orange, Modulators/Utilities purple) are SEPARATE from signal-type cable colours.
- Shelved components (DashboardBuilder, MacroDashboard, SceneLauncher) exist in
  `layout/` but must NOT be added to navigation or new UI flows.
- Stories run via `npm run storybook` (port 6006); render-verified via
  `npm run verify-stories`. Always run verify-stories after touching a component.

## Dependencies

- Internal: `src/stores/`, `src/bridge/`, `src/lib/neu.ts`, `src/motion/`
- External: React 19, framer-motion 12, @xyflow/react 12, lucide-react (via `neu/Icon.tsx` allowlist only)
