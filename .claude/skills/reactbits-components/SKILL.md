---
name: reactbits-components
description: Add React Bits animated components (text reveals, motion wrappers, particle backgrounds) to the Element webview, reskinned to the locked neumorphic system. Use when adding motion/polish — text animations, scroll/fade reveals, animated backgrounds — NOT pre-styled glassy widgets.
---

# React Bits (reactbits.dev)

Copy-paste animated React components (110+). License: MIT + Commons Clause (fine to use in the app;
can't resell the components). Stack here: React 19, Vite 8, Tailwind v4, `motion`@12 installed.

## What's SAFE vs what CONFLICTS with the locked neu system
- ✅ **SAFE (token-agnostic motion):** `Text Animations` (BlurText, SplitText, CountUp), `Animations`
  (FadeContent, AnimatedContent), `Backgrounds` (Particles, DotGrid — pass a semantic hue). Reskin via
  `className`/props to Element tokens.
- ⛔ **CONFLICT — do not use:** `Components/*` that ship their own styling — GlassIcons (backdrop-blur),
  SpotlightCard, TiltCard, colourful gradient backgrounds (Aurora). These violate no-glass / narrow tonal range.

## Install a component (proven method — direct registry fetch, no shadcn init)
```bash
cd webview
NAME=BlurText-TS-TW   # variant suffix: TS-TW = TypeScript + Tailwind
curl -s "https://reactbits.dev/r/$NAME.json" -o /tmp/$NAME.json
# inspect deps + import path:
node -e "const j=require('/tmp/$NAME.json'); console.log('deps',j.dependencies); console.log((j.files[0].content.match(/import .*/g)||[]).join('\n'))"
# write the component:
node -e "const j=require('/tmp/$NAME.json'),f=j.files[0]; require('fs').writeFileSync('src/components/reactbits/'+f.path.split('/').pop(), '// React Bits (MIT+Commons Clause). Vendored.\n'+f.content)"
npm install <deps from above>   # e.g. motion (installed) or: npm i gsap @gsap/react
```

## GOTCHAS (hit + fixed during validation)
- **Type-only imports:** many components do `import { motion, Transition, Easing } from 'motion/react'`.
  `Transition`/`Easing` are **types** → change to `import { motion, type Transition, type Easing }` or the
  vitest-browser bundler throws "Failed to import test file".
- **gsap vs motion:** FadeContent/AnimatedContent use **gsap** (`npm i gsap @gsap/react`); BlurText/most text
  use **motion** (already installed). Check `dependencies` in the registry JSON first.
- After installing a NEW dep, **restart Storybook** so Vite re-optimizes (else 504 on first import).

## Reskin + validate (mandatory)
- Wrap/pass tokens: `text-[#E5E5EA]` on canvas, semantic hue for background colour props.
- Add a `.stories.tsx` under `src/components/reactbits/`, then Storybook MCP `run-story-tests` (mount+a11y) → Chromatic.
- Working example shipped: `webview/src/components/reactbits/BlurText.{tsx,stories.tsx}` (story tests green).

## Optional: shadcn MCP for natural-language adds
`npx shadcn@latest mcp init --client claude` wires the shadcn MCP + `@react-bits` registry
(`https://reactbits.dev/r/{name}.json`) → "add the DotGrid background from React Bits". Needs `components.json`
+ a Claude Code restart. Not required — the direct-fetch method above is proven.
