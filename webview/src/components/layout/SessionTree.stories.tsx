import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionTree } from "./SessionTree";
import { useSessionStore } from "../../stores/useSessionStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

// ── Store seeding ──
// SessionTree reads from useSessionStore (graphs, filePath, dirty) and
// useHostExtrasStore (activeGraphOutline).
// Mount effect calls nativeSessionGetGraphTree which returns [] without a
// JUCE backend (try/catch swallowed). Safe — no console.error.

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
  useHostExtrasStore.setState((s) => ({
    ...s,
    activeGraphOutline: [
      {
        id: "n1",
        name: "Synth Layer",
        isContainer: true,
        children: [
          { id: "n1a", name: "Mini V3", isContainer: false },
          { id: "n1b", name: "Pro-Q 3", isContainer: false },
        ],
      },
      { id: "n2", name: "Kick Bus", isContainer: false },
    ],
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

const meta = {
  title: "Layout/SessionTree",
  component: SessionTree,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof SessionTree>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Nested session with graphs and outline ──
export const WithGraphs: Story = {
  decorators: [
    (Story) => {
      seedNested();
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Empty session (no graphs) ──
export const Empty: Story = {
  decorators: [
    (Story) => {
      seedEmpty();
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Single graph (singular label) ──
export const SingleGraph: Story = {
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
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Dirty indicator (unsaved changes) ──
export const DirtyFile: Story = {
  decorators: [
    (Story) => {
      seedNested();
      useSessionStore.setState({
        filePath: "/Users/glen/Music/LiveSet.els",
        dirty: true,
        graphs: [
          { id: "g1", name: "Main Board", index: 0, active: true },
        ],
      });
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};
