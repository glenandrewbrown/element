import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { SessionTree } from "./SessionTree";
import { useSessionStore } from "../../stores/useSessionStore";
import { useHostExtrasStore, type GraphOutlineNode } from "../../stores/useHostExtrasStore";
import {
  stInstrument,
  stAudiofx,
  stMidifx,
  stModulator,
} from "../../data/fixtures/sessiontree";
import type { BlockData } from "../../data/types";
import type { BlockCategory } from "../../data/types";

// ── Rich outline node type (story-local; mirrors RichOutlineNode in SessionTree.tsx) ──
// The C++ bridge emits id/name/isContainer/children only. Category + routingCue are
// seeded here from fixture data so the full row design is visible and testable.
// Tracked gap: B1-bridge-category — bridge must be updated to emit these fields.
type StoryOutlineNode = {
  id: string;
  name: string;
  isContainer?: boolean;
  children?: StoryOutlineNode[];
  category?: BlockCategory;
  routingCue?: string;
};

// ── Derive a compact routing cue from BlockData ports ──
function routingCue(ports: BlockData["ports"]): string {
  const fmt = (types: string[]) =>
    [...new Set(types)]
      .map((t) => (t === "audio" ? "Audio" : t === "midi" ? "MIDI" : "CV"))
      .join("+");
  const ins = ports
    .filter((p) => p.direction === "input")
    .map((p) => p.type);
  const outs = ports
    .filter((p) => p.direction === "output")
    .map((p) => p.type);
  if (ins.length === 0) return `→ ${fmt(outs)}`;
  if (outs.length === 0) return `${fmt(ins)} →`;
  return `${fmt(ins)} → ${fmt(outs)}`;
}

// ── Pre-built rich outline nodes from fixture data ──
const richInstrument: StoryOutlineNode = {
  id: stInstrument.id,
  name: stInstrument.name,
  isContainer: false,
  category: stInstrument.category as BlockCategory,
  routingCue: routingCue(stInstrument.ports),
};
const richAudiofx: StoryOutlineNode = {
  id: stAudiofx.id,
  name: stAudiofx.name,
  isContainer: false,
  category: stAudiofx.category as BlockCategory,
  routingCue: routingCue(stAudiofx.ports),
};
const richMidifx: StoryOutlineNode = {
  id: stMidifx.id,
  name: stMidifx.name,
  isContainer: false,
  category: stMidifx.category as BlockCategory,
  routingCue: routingCue(stMidifx.ports),
};
const richModulator: StoryOutlineNode = {
  id: stModulator.id,
  name: stModulator.name,
  isContainer: false,
  category: stModulator.category as BlockCategory,
  routingCue: routingCue(stModulator.ports),
};

// ── Seed helpers ──

function seedNested() {
  useSessionStore.setState({
    filePath: "/Users/glen/Music/LiveSet.els",
    dirty: false,
    recentFiles: [],
    graphs: [
      { id: "g1", name: "Main Board", index: 0, active: true },
      { id: "g2", name: "FX Chain", index: 1, active: false },
      { id: "g3", name: "Drums", index: 2, active: false },
    ],
  });
  const outline: StoryOutlineNode[] = [
    {
      id: "container-1",
      name: "Synth Layer",
      isContainer: true,
      children: [richInstrument, richMidifx],
    },
    richAudiofx,
    richModulator,
  ];
  useHostExtrasStore.setState((s) => ({
    ...s,
    activeGraphOutline: outline as unknown as GraphOutlineNode[],
  }));
}

function seedEmpty() {
  useSessionStore.setState({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
  });
  useHostExtrasStore.setState((s) => ({ ...s, activeGraphOutline: [] }));
}

// ── Story wrapper ──
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 300, height: 580 }} className="bg-panel flex flex-col">
      {children}
    </div>
  );
}

// ── Meta ──
const meta = {
  title: "Layout/SessionTree",
  component: SessionTree,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Sidebar Project navigation tree. Shows all Boards with the active Board's Block outline. Rows display user name, category colour dot + type badge (story-seeded; bridge gap B1), and routing cue. Containers support drill-down with breadcrumb navigation. Reads useSessionStore (boards/filePath/dirty) + useHostExtrasStore.activeGraphOutline.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  tags: ["autodocs", "gate-ab"],
} satisfies Meta<typeof SessionTree>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── With Graphs (multi-board, rich outline) ──
export const WithGraphs: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Multi-Board Project with the active Board's outline showing a Container (Synth Layer) with two Blocks plus two standalone Blocks. Each row shows name + type badge + routing cue (fixture-seeded).",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      seedNested();
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Row: user name present
    const nameEl = await canvas.findByText(stInstrument.name);
    expect(nameEl).toBeTruthy();

    // Row: type badge present (from catConfig.label)
    const typeBadge = canvas.getAllByText("Virtual Instrument");
    expect(typeBadge.length).toBeGreaterThan(0);

    // Row: routing cue present
    const cueEl = canvas.getByText(routingCue(stInstrument.ports));
    expect(cueEl).toBeTruthy();

    // Board count uses "Boards" (not "graphs")
    const header = canvas.getByText(/Boards/);
    expect(header).toBeTruthy();
  },
};

// ── Empty session ──
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Untitled Project with no Boards — shows the 'No Boards' placeholder and the Untitled header.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    const msg = await canvas.findByText(/No Boards in this Project/);
    expect(msg).toBeTruthy();
  },
};

// ── Single board ──
export const SingleGraph: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "One Board with no outline — verifies the singular 'Board' header label and a flat root row with no expand control.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      useSessionStore.setState({
        filePath: "/Users/glen/Music/Simple.els",
        dirty: false,
        recentFiles: [],
        graphs: [{ id: "g1", name: "Root Board", index: 0, active: true }],
      });
      useHostExtrasStore.setState((s) => ({ ...s, activeGraphOutline: [] }));
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Singular "Board" label
    const header = await canvas.findByText(/1.Board/);
    expect(header).toBeTruthy();
  },
};

// ── Dirty file indicator ──
export const DirtyFile: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Unsaved Project (dirty=true): the accent-orange dot appears next to the filename, signalling pending changes.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      seedNested();
      useSessionStore.setState({
        filePath: "/Users/glen/Music/LiveSet.els",
        dirty: true,
        graphs: [{ id: "g1", name: "Main Board", index: 0, active: true }],
      });
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    const dot = await canvas.findByLabelText("unsaved changes");
    expect(dot).toBeTruthy();
  },
};

// ── With Modules (deep hierarchy, all 4 categories) ──
export const WithModules: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "All four block categories shown in a nested outline. Each row renders name + type badge + routing cue from fixture data. Demonstrates the Container drill-down affordance.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      useSessionStore.setState({
        filePath: "/Users/glen/Music/Modular.els",
        dirty: false,
        recentFiles: [],
        graphs: [{ id: "g1", name: "Modular Board", index: 0, active: true }],
      });
      const outline: StoryOutlineNode[] = [
        {
          id: "mod-a",
          name: "Voice Module",
          isContainer: true,
          children: [richInstrument, richMidifx],
        },
        {
          id: "mod-b",
          name: "FX Module",
          isContainer: true,
          children: [richAudiofx],
        },
        richModulator,
      ];
      useHostExtrasStore.setState((s) => ({
        ...s,
        activeGraphOutline: outline as unknown as GraphOutlineNode[],
      }));
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Container row is present with type badge
    const containerBadge = await canvas.findAllByText("Container");
    expect(containerBadge.length).toBeGreaterThan(0);

    // A block name is visible
    const instrumentName = canvas.getByText(stInstrument.name);
    expect(instrumentName).toBeTruthy();

    // A type badge is visible (data-block-type attribute)
    const typeBadge = canvas.getAllByText("Virtual Instrument");
    expect(typeBadge.length).toBeGreaterThan(0);

    // A routing cue is visible
    const cue = canvas.getByText(routingCue(stInstrument.ports));
    expect(cue).toBeTruthy();
  },
};

// ── With Breadcrumb (drill into container, assert breadcrumb nav) ──
export const WithBreadcrumb: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Verifies container drill-down: clicking the drill arrow on 'Voice Module' replaces the flat outline with its children and shows the breadcrumb trail. Clicking 'Board' in the breadcrumb navigates back.",
      },
    },
    design: {
      type: "link",
      url: "docs/stitch-reference/DESIGN.md",
    },
  },
  decorators: [
    (Story) => {
      useSessionStore.setState({
        filePath: "/Users/glen/Music/Modular.els",
        dirty: false,
        recentFiles: [],
        graphs: [{ id: "g1", name: "Modular Board", index: 0, active: true }],
      });
      const outline: StoryOutlineNode[] = [
        {
          id: "voice-mod",
          name: "Voice Module",
          isContainer: true,
          children: [richInstrument, richMidifx],
        },
        richAudiofx,
      ];
      useHostExtrasStore.setState((s) => ({
        ...s,
        activeGraphOutline: outline as unknown as GraphOutlineNode[],
      }));
      return (
        <Wrapper>
          <Story />
        </Wrapper>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Container row is present before drill
    const voiceModule = await canvas.findByText("Voice Module");
    expect(voiceModule).toBeTruthy();

    // Drill into the container
    const drillBtn = canvas.getByRole("button", {
      name: /enter container voice module/i,
    });
    await userEvent.click(drillBtn);

    // Breadcrumb nav appears after drill
    const breadcrumb = canvas.getByRole("navigation", {
      name: "Board navigation",
    });
    expect(breadcrumb).toBeTruthy();

    // Breadcrumb shows the container name
    const crumbLabel = canvas.getByText("Voice Module");
    expect(crumbLabel).toBeTruthy();

    // Children are now shown (drilled into Voice Module)
    const childName = canvas.getByText(stInstrument.name);
    expect(childName).toBeTruthy();

    // Navigate back via "Board" breadcrumb button
    const boardBtn = canvas.getByRole("button", { name: "Board" });
    await userEvent.click(boardBtn);

    // Breadcrumb should be gone after navigating back to root
    expect(
      canvas.queryByRole("navigation", { name: "Board navigation" }),
    ).toBeNull();
  },
};
