# UI Debugging — Storybook + Google Stitch MCP

A quickstart for **Glen**, **Claude**, and the **Storybook + Stitch** toolchain used to
build and debug the Element React UI efficiently — without round-tripping the 85 MB JUCE host
every time.

> Element's graphics were designed in **Google Stitch**. The committed design source-of-truth
> lives in [`docs/stitch-reference/`](stitch-reference/) (`DESIGN.md`, `edit-mode.html`,
> `perform-mode.html`). Storybook is where those designs become live, isolated React components.

---

## TL;DR

```bash
cd webview
npm run storybook        # → http://localhost:6006 (HMR, isolated components)
npm run build-storybook  # → static export (CI / sharing)
```

Stitch MCP (one-time, needs your API key — see §3):
```bash
claude mcp add stitch --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: <YOUR_KEY>" -s user
```

---

## 1. Storybook

Already installed and configured (`storybook@10.3.6`, `@storybook/react-vite`). Verified building,
serving, and rendering with the full design system (canvas `#1E1E22`, neumorphic shadows, semantic
colours, dark theme).

### Run

| Command (from `webview/`) | Result |
|---|---|
| `npm run storybook` | Dev server, port **6006**, hot reload |
| `npm run build-storybook` | Static `storybook-static/` |

### What's wired (`.storybook/`)

- **`main.ts`** — globs `src/**/*.stories.@(ts|tsx|…)` and `*.mdx`; framework `@storybook/react-vite`
  (this reuses `webview/vite.config.ts`, so the **Tailwind v4** plugin and chunking apply automatically).
- **`preview.ts`** — imports `../src/index.css` (every `@theme` design token loads), forces the
  **dark** theme via `withThemeByClassName` (`html.dark`), and registers the Element background swatches
  (`element-canvas/panel/surface/pressed`).
- **Addons** — `@storybook/addon-a11y` (WCAG/contrast checks — directly serves the colour-blind-safe
  mandate in the blueprint) and `@storybook/addon-themes`.

### Existing stories

```
src/components/neu/NeuButton.stories.tsx
src/components/neu/NeuKnob.stories.tsx
src/components/neu/EmptyState.stories.tsx
```

### Add a story (the project pattern)

Mirror `NeuButton.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyComponent } from "./MyComponent";

const meta = {
  title: "Group/MyComponent",          // → sidebar path
  component: MyComponent,
  parameters: { layout: "centered" },  // or "fullscreen" for panels
  tags: ["autodocs"],                  // auto-generates a Docs page
  argTypes: {
    variant: { control: { type: "select" }, options: ["a", "b"] },
    onClick: { action: "clicked" },
  },
} satisfies Meta<typeof MyComponent>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { variant: "a" } };

// A "matrix" render is the fastest way to eyeball every variant at once:
export const Matrix: Story = {
  render: () => (
    <div className="flex gap-3 p-6">
      <MyComponent variant="a" />
      <MyComponent variant="b" />
    </div>
  ),
};
```

For a component that reads a Zustand store, set the store state in a decorator before render:

```tsx
import { useParameterStore } from "../../stores/useParameterStore";
export const WithData: Story = {
  decorators: [(Story) => {
    useParameterStore.setState({ values: { "n1:0": 0.5, "n1:1": 0.8 } });
    return <Story />;
  }],
};
```

### Why this is the fastest debug surface

The blank-webview bug ([`project-zustand-v5-selectors`] memory) was a **Zustand v5** selector returning
a fresh array each call → infinite `useSyncExternalStore` loop **at mount**. Bugs in that class surface
*immediately* in an isolated story (the browser console throws `"getSnapshot should be cached"` the moment
the story mounts) — seconds, versus a full `vite build` + 85 MB app rebuild + host launch. **Reproduce
suspect components in a story first.**

---

## 2. How Claude "sees" Storybook

Claude can't watch the live browser, so it screenshots a story headlessly with the project's Playwright dep.

- **Story ID** = `kebab(title)` + `--` + `kebab(StoryName)`.
  `title:"Neu/Button"` + `VariantMatrix` → `neu-button--variant-matrix`.
- Direct render URL: `http://localhost:6006/iframe.html?id=<storyId>&viewMode=story`.

```js
// run from webview/ (where @playwright/test resolves)
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 400 } });
await p.goto("http://localhost:6006/iframe.html?id=neu-button--variant-matrix&viewMode=story",
            { waitUntil: "networkidle" });
await p.screenshot({ path: "/tmp/story.png" });   // Claude then reads /tmp/story.png
await b.close();
```

**Loop:** you describe the bug/feature → Claude writes or edits a story → screenshots it → iterates →
you confirm in Storybook at :6006 → Claude ports the change into the live app and rebuilds.

---

## 3. Google Stitch MCP

A **remote** MCP server (`https://stitch.googleapis.com/mcp`) that lets Claude read your live Stitch
projects (screens, layout, colours, HTML, screenshots) and generate/edit/variant designs — closing the
loop from the original Stitch designs to this codebase.

### Setup — API key (recommended)

1. Go to **stitch.withgoogle.com → Settings → API Keys → Create API Key**. Copy it (your Google account).
2. Register it with Claude Code:
   ```bash
   claude mcp add stitch --transport http https://stitch.googleapis.com/mcp \
     --header "X-Goog-Api-Key: <YOUR_KEY>" -s user
   ```
   - `-s user` saves to `~/.claude.json` (per-machine, **not** committed). **Never** put the key in the
     repo's `.mcp.json` or in `-s project`.
3. Restart / reconnect Claude Code, then confirm: `claude mcp list` → `stitch` listed and reachable.

### Setup — OAuth (only if API keys are blocked)

`gcloud auth login` + `gcloud auth application-default login`, `gcloud beta services mcp enable
stitch.googleapis.com`, then pass `Authorization: Bearer <token>` + `X-Goog-User-Project: <project>`.
⚠️ The access token **expires ~hourly** — you must re-mint and update it. Prefer the API key.

### Tools exposed (once connected)

| Category | Tools |
|---|---|
| Projects | `list_projects`, `get_project`, `create_project` |
| Screens | `list_screens`, `get_screen` |
| Generate | `generate_screen_from_text`, `edit_screens`, `generate_variants` |
| Design systems | `create_design_system`, `update_design_system`, `list_design_systems`, `apply_design_system` |

### Design-to-code loop (Stitch → Storybook → React → host)

1. **Pull** — `get_project` / `get_screen` to fetch the target screen's layout, colour tokens, and HTML.
2. **Diff vs source-of-truth** — compare against [`docs/stitch-reference/`](stitch-reference/) (committed
   `edit-mode.html` / `perform-mode.html` / `DESIGN.md`). If Stitch has moved on, update those files.
3. **Implement** — build/adjust the React component; keep tokens in `webview/src/index.css` `@theme`.
4. **Isolate + compare** — add a Storybook story, screenshot it (§2), visually diff against the Stitch screen.
5. **Integrate** — port into the live app and verify in the JUCE host (`build-merged` Element.app).

---

## 4. Who does what

| Step | Glen | Claude |
|---|---|---|
| Design in Stitch | ✅ owns the designs | reads them via Stitch MCP |
| Stitch API key / login | ✅ generates + runs `claude mcp add` (or pastes key for Claude to run) | provides the exact command |
| Write/iterate stories | reviews at :6006 | authors stories, screenshots, iterates |
| Visual + a11y check | final eye | a11y panel + screenshot diff vs Stitch |
| Port to live app + rebuild | runtime UX confirmation | builds, launches, installs (per project rule) |

---

## Gotchas

- Storybook reuses `webview/vite.config.ts` — design tokens come from `@theme` in `src/index.css`, not a
  separate Tailwind config (Tailwind v4, `@tailwindcss/vite`).
- Stitch OAuth tokens expire hourly → `"Unauthenticated"` errors → refresh. API keys persist until revoked.
- Keep Stitch keys out of git. `-s user` only.
- Isolate Zustand-store-bound components in a story before chasing render loops — see the
  `project-zustand-v5-selectors` learning.
