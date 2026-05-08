import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "element-canvas",
      values: [
        { name: "element-canvas", value: "#1e1e22" },
        { name: "element-panel", value: "#222226" },
        { name: "element-surface", value: "#252529" },
        { name: "element-pressed", value: "#1a1a1e" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        dark: "dark",
      },
      defaultTheme: "dark",
      parentSelector: "html",
    }),
  ],
};

export default preview;
