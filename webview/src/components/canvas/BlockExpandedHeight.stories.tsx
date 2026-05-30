import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import type { BlockData } from "../../data/types";
import { useGraphStore } from "../../stores/useGraphStore";
import { useParameterStore } from "../../stores/useParameterStore";

/**
 * LAYOUT-P1 (BLOCK-OVERLAP) measurement harness.
 *
 * The expanded zoom tier (react-flow zoom > 0.8) renders BlockEmbed on top of
 * the standard block. For a *modifier* block that is the tallest variant
 * (5-fader ParamStrip + Meter + Spectrum). Legacy BRASS_4Horns positions have a
 * minimum vertical column gap of ~140px (478-338), so an expanded modifier block
 * taller than that overlaps its vertically-adjacent neighbour.
 *
 * This story forces the store into the expanded tier and renders a modifier
 * block. The height is MEASURED out-of-band by `.storybook/measure-block.mjs`
 * (Playwright against the :6006 dev server, which — unlike the vitest browser
 * project — applies the `@tailwindcss/vite` plugin from vite.config.ts, so the
 * utility classes that drive the layout are present and the measured height is
 * production-real). Target: expanded modifier block height <= 125px.
 *
 * The story itself is render-only so it stays green under `npm run test:all`.
 * `data-testid="expanded-block"` marks the measurement target.
 */

function modifierBlock(): BlockData {
  return {
    id: "mod-measure",
    name: "Infinite Brass 4 Horns",
    category: "audiofx",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out", type: "audio", direction: "output", label: "Out", connected: true },
    ],
    cpuLoad: 22,
    latencyMs: 3,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  };
}

function flowNode(data: BlockData): Node {
  return { id: data.id, type: "block", position: { x: 0, y: 0 }, data };
}

const nodeTypes = { block: Block };

const meta = {
  title: "Canvas/BlockExpandedHeight",
  component: Block,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Measurement-only harness for the BLOCK-OVERLAP (LAYOUT-P1) layout fix — not a usage pattern. Forces the store into the expanded zoom tier and renders the tallest Block variant so `.storybook/measure-block.mjs` can assert the expanded modifier height stays within the column-gap budget. Excluded from the agent manifest.",
      },
    },
  },
  tags: ["!autodocs", "!manifest"],
} as Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof Block>;

/**
 * Expanded-tier MODIFIER block — the tallest variant, the one that overlaps on
 * BRASS_4Horns. fitView is disabled so the viewport stays at zoom 1 and the
 * measured `offsetHeight` is in flow coordinates (directly comparable to the
 * 140px column gap).
 */
export const ExpandedAudioFx: Story = {
  render: () => {
    // Drive the embed: real fader fills + force the expanded zoom tier.
    useParameterStore.setState({
      values: {
        "mod-measure:0": 0.5,
        "mod-measure:1": 0.7,
        "mod-measure:2": 0.2,
        "mod-measure:3": 0.9,
        "mod-measure:4": 0.45,
      },
    });
    useGraphStore.setState({ zoomTier: "expanded" });
    return (
      <MiniFlow
        nodes={[flowNode(modifierBlock())]}
        nodeTypes={nodeTypes}
        height={360}
        fitView={false}
      />
    );
  },
};
