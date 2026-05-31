---
description: Storybook in Element — orient on the webview Storybook + MCP and route to the right action
argument-hint: "[optional: what you want to do]"
---

# Storybook (Element)

Invoke the **`storybook-element`** skill (Skill tool) AND the global **`storybook`** skill. Intent (optional): $ARGUMENTS

Then:
1. `cd webview` — all Storybook work happens there.
2. Check the MCP: `curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/mcp`. If down, offer to run `cd webview && npm run storybook` so the Storybook MCP goes live.
3. Use the MCP tools (`list-all-documentation`, `get-documentation`, `get-storybook-story-instructions`, `run-story-tests`, `preview-stories`) for the task — never invent component props.
4. Honor Element specifics: locked neumorphic tokens, Zustand store-seeding decorators, the `verify-stories` + `build-storybook` gates, Chromatic UI Review loop. Don't wire shelved Dashboard/Macro/Scene UI.
5. For concrete tasks route to global `/storybook:story`, `/storybook:test`, `/storybook:review` (run from `webview`).

Report Storybook state + recommended next step.
