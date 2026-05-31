import type { StorybookConfig } from "@storybook/react-vite";
import { uiCommentSink } from "./ui-comment-sink";

// Bake-off composition (OPT-IN): surface the mindful-studio mockup Storybook as
// a second source so Element↔mockup component pairs sit side-by-side. This is
// gated behind ELEMENT_SB_MOCKUP_REF because composing a dead :6008 source
// breaks the hub for anyone who isn't running the mockup server — it MUST NOT
// ship on by default (task #9, .omo/plans/mvp-bakeoff-plan.md §7).
//
//   ELEMENT_SB_MOCKUP_REF=1 npm run storybook   # with mindful-studio on :6008
//
const mockupRef = process.env.ELEMENT_SB_MOCKUP_REF
  ? {
      mockup: {
        title: "Mockup (mindful-studio)",
        url: process.env.ELEMENT_SB_MOCKUP_URL ?? "http://localhost:6008",
      },
    }
  : undefined;

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  ...(mockupRef ? { refs: mockupRef } : {}),
  // SB10: viewport / controls / actions / interactions live in core — not
  // listed here. addon-docs is installed separately (essentials was removed).
  // addon-vitest is wired in vitest.config.ts (test runner), not here.
  addons: [
    // Chromatic Visual Tests: surfaces the cloud visual-diff for each story in a
    // "Visual Tests" panel and lets the agent trigger runs in-Storybook —
    // tightens the Chromatic loop in docs/CHROMATIC_FEEDBACK_WORKFLOW.md.
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    // Design tie-in: embeds a reference design (Figma / Stitch export / image /
    // any URL) in a "Design" panel beside the live component, via
    // `parameters.design` on a story. Lets Glen compare impl-vs-design per
    // component and anchor feedback to a Stitch-generated asset.
    "@storybook/addon-designs",
    "@storybook/addon-mcp",
    // Forces :hover / :focus / :active / pressed pseudo-states in stories — maps
    // to the neumorphic pressed/hover aesthetic and gives Chromatic stable
    // snapshots of those states.
    "storybook-addon-pseudo-states",
    // Story coverage instrumentation (pairs with verify-stories gate).
    "@storybook/addon-coverage"
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Dev-server only: adds POST /__ui_comment which appends Glen's in-Storybook
  // feedback to .omo/audit/ui-comments.jsonl. See ui-comment-sink.ts.
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), uiCommentSink()];
    return viteConfig;
  },
  typescript: {
    check: false,
    // Extract prop types + JSDoc prop descriptions so the Storybook MCP
    // (get-documentation) and Docs panel expose real, documented props to agents.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;
