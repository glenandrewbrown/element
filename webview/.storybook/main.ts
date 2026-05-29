import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  // SB10: viewport / controls / actions / interactions live in core — not
  // listed here. addon-docs is installed separately (essentials was removed).
  // addon-vitest is wired in vitest.config.ts (test runner), not here.
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    // Design tie-in: embeds a reference design (Figma / Stitch export / image /
    // any URL) in a "Design" panel beside the live component, via
    // `parameters.design` on a story. Lets Glen compare impl-vs-design per
    // component and anchor feedback to a Stitch-generated asset.
    "@storybook/addon-designs",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    check: false,
  },
};

export default config;
