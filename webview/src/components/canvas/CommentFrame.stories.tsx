import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { CommentFrame } from "./CommentFrame";
import type { CommentBoxData } from "../../data/types";

// ── Helpers ──
// CommentFrame is a React Flow node rendering CommentBoxData. It is
// `h-full w-full`, so the node needs explicit dimensions via `style` or it
// collapses to nothing.

function makeComment(over: Partial<CommentBoxData> = {}): CommentBoxData {
  return {
    id: "c1",
    label: "Drum Bus",
    color: "#4A90D9",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 140 },
    ...over,
  };
}

function frameNode(data: CommentBoxData): Node {
  return {
    id: data.id,
    type: "comment",
    position: { x: 0, y: 0 },
    data: data as unknown as Record<string, unknown>,
    style: { width: data.size.width, height: data.size.height },
  };
}

const nodeTypes = { comment: CommentFrame };

// Render-only node stories drive everything through MiniFlow, so the story
// type is left loose (`StoryObj`) rather than bound to NodeProps — binding it
// would force a full `args: NodeProps` on every render-only story.
const meta: Meta<typeof CommentFrame> = {
  title: "Canvas/CommentFrame",
  component: CommentFrame,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "CommentFrame — a labelled, colour-coded grouping frame drawn behind Blocks on the Board (the comment box). Registered as the `comment` React Flow node type and rendered for every entry in `useGraphStore.commentBoxes`. Use it to annotate and cluster regions of a large Board so signal flow stays navigable. It is an inset (pressed-in) neumorphic surface — same dark chassis, never glass — sitting at z-index 0 so Blocks render on top. Mounted on a MiniFlow canvas with explicit node dimensions here (it is h-full/w-full).",
      },
    },
  },
  // CommentFrame is a React Flow node — autodocs can't introspect NodeProps.
  tags: ["!autodocs"],
};

export default meta;
type Story = StoryObj;

const story = (data: CommentBoxData, doc: string): Story => ({
  render: () => <MiniFlow nodes={[frameNode(data)]} nodeTypes={nodeTypes} height={280} />,
  parameters: { docs: { description: { story: doc } } },
});

// Generator-blue grouping frame.
export const Blue: Story = story(
  makeComment({ label: "Drum Bus", color: "#4A90D9" }),
  "Labelled, colour-tinted grouping frame — the representative comment-box state, here tinting a region blue.",
);

// Modifier-orange frame — colour variant, excluded from the agent manifest.
export const Orange: Story = {
  ...story(makeComment({ label: "FX Chain", color: "#E8A838" }), "Orange colour variant — visual reference only."),
  tags: ["!manifest"],
};

// Logic-teal frame — colour variant, excluded from the agent manifest.
export const Teal: Story = {
  ...story(makeComment({ label: "MIDI Logic", color: "#2BC4C4" }), "Teal colour variant — visual reference only."),
  tags: ["!manifest"],
};

// Empty label falls back to "Comment".
export const Unlabeled: Story = story(
  makeComment({ label: "", color: "#8E8E93" }),
  "Empty label — confirms the frame falls back to the \"Comment\" placeholder header instead of rendering a blank bar.",
);
