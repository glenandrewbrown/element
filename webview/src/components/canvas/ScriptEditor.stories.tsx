import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScriptEditor } from "./ScriptEditor";

// ── Notes ──
// ScriptEditor loads its source + runtime variables from the native bridge
// (nativeScriptGetSource / nativeScriptGetRuntimeState). Without a JUCE
// backend these no-op: source resolves to "" and the runtime state to
// { ok: false }, so the editor mounts with an empty textarea, line numbers,
// and the bottom hint — no variables strip, no compile status (those require
// live backend responses that can't be seeded from a store). The component
// takes only `nodeId` + optional `onClose`. It is `h-full`, so each story is
// wrapped in a fixed-height container.

const meta = {
  title: "Canvas/ScriptEditor",
  component: ScriptEditor,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ScriptEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <div className="bg-canvas p-4" style={{ height: 480 }}>
    <Story />
  </div>
);

// Default editor — empty source, Save & Compile enabled.
export const Default: Story = {
  args: { nodeId: "script-1" },
  decorators: [(Story) => framed(Story)],
};

// With a close button in the top bar.
export const WithCloseButton: Story = {
  args: { nodeId: "script-1", onClose: () => {} },
  decorators: [(Story) => framed(Story)],
};
