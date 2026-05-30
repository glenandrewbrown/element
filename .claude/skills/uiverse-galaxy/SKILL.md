---
name: uiverse-galaxy
description: Search 3,800+ community UIverse elements (MIT) — especially the 109 neumorphism-tagged buttons/cards/toggles/loaders — and convert a chosen one into a React+Tailwind component reskinned to Element's locked neu tokens. Use when sourcing a UI element pattern (toggle, loader, button, card) for the redesign.
---

# UIverse Galaxy (community UI elements)

Source: github.com/uiverse-io/galaxy (MIT, no attribution required). Cloned to `webview/vendor/galaxy`
(gitignored). 3,802 elements; **109 tagged `neumorphism`** (Buttons 33 · Cards 23 · loaders 16 ·
Inputs 9 · Toggle-switches 7 · Forms 7 · Checkboxes 6 · Radio 5 · Tooltips 3).

## Build / refresh the index
```bash
cd webview
git clone --depth 1 https://github.com/uiverse-io/galaxy.git vendor/galaxy   # if absent
node scripts/index-galaxy.mjs            # → vendor/galaxy-index.json + vendor/galaxy-neumorphism.json
node scripts/index-galaxy.mjs box-shadow # filter by any tag
```
Each indexed entry: `{ id, category, author, tags[], html, css }`.

## Find a candidate
```bash
# list neumorphism toggles
node -e "require('./vendor/galaxy-neumorphism.json').filter(e=>e.category==='Toggle-switches').forEach(e=>console.log(e.id))"
# search css/html for a feature
node -e "require('./vendor/galaxy-neumorphism.json').filter(e=>e.css.includes('inset')).slice(0,10).forEach(e=>console.log(e.id))"
```

## Convert → React + Element tokens (mandatory reskin)
These are raw HTML+CSS. Do NOT paste verbatim — they ship arbitrary light-grey palettes. Reskin:
1. Read the chosen entry's `html` + `css` from the index.
2. Rewrite as a React component under `webview/src/components/neu/imported/`.
3. **Swap every hard-coded colour to Element tokens** (Canvas `#1E1E22`, Surface `#252529`, Pressed `#1A1A1E`, text `#E5E5EA`); replace shadow rgba with the canonical `rgba(255,255,255,0.05)` / `rgba(0,0,0,0.40)` or use `neu()` from [[neumorphism-generator]].
4. Scope class names (prefix `.neu-<slug>`) to avoid collisions; convert inline where simple.
5. Add a `.stories.tsx` + run `npm run verify-stories` / Storybook MCP `run-story-tests`.

## Rules
- License is MIT — fine to use/modify. Keep the `// Source: uiverse.io/<author>` credit comment.
- Exclude `glassmorphism`/`skeuomorphism`-tagged elements (violate the locked system).
- Always reskin to tokens + Chromatic-gate before shipping.
