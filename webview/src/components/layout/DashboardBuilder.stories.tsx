import type { Meta, StoryObj } from "@storybook/react-vite";
import { DashboardBuilder } from "./DashboardBuilder";
import {
  useDashboardStore,
  type DashboardWidget,
} from "../../stores/useDashboardStore";

// ── Store seeding ──
// DashboardBuilder reads useDashboardStore for widgets / editing / selectedId.
// (mapMode, mappedParameters and graph nodes are only read inside BindModal,
// which is not open at static mount, so they do not need seeding.) On mount it
// calls loadDashboardLayoutFromHost / loadMappedParametersFromHost — both
// no-op without a JUCE backend (invokeElementNative returns undefined), so
// seeding the widget list is sufficient.

function seed(widgets: DashboardWidget[], editing: boolean): void {
  useDashboardStore.setState({ widgets, editing, selectedId: null });
}

const demoWidgets: DashboardWidget[] = [
  {
    id: "w-knob",
    kind: "knob",
    x: 24,
    y: 24,
    w: 64,
    h: 80,
    nodeId: "filter-core",
    paramIndex: 0,
    label: "Cutoff",
    color: "blue",
  },
  {
    id: "w-fader",
    kind: "fader",
    x: 120,
    y: 24,
    w: 36,
    h: 140,
    nodeId: "pro-q3",
    paramIndex: 2,
    label: "Gain",
    color: "orange",
  },
  {
    id: "w-button",
    kind: "button",
    x: 200,
    y: 24,
    w: 72,
    h: 36,
    nodeId: "compressor-1176",
    paramIndex: 1,
    label: "Solo",
    color: "teal",
  },
  {
    id: "w-meter",
    kind: "meter",
    x: 300,
    y: 24,
    w: 32,
    h: 100,
    nodeId: "valhalla-room",
    paramIndex: 0,
    label: "Out",
    color: "blue",
  },
  // Unbound widget — exercises the placeholder + Bind overlay in edit mode
  {
    id: "w-unbound",
    kind: "knob",
    x: 360,
    y: 24,
    w: 64,
    h: 80,
    label: "Drive",
    color: "red",
  },
];

const meta = {
  title: "Layout/DashboardBuilder",
  component: DashboardBuilder,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DashboardBuilder>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 480 }} className="bg-canvas">
    <DashboardBuilder />
  </div>
);

export const Populated: Story = {
  decorators: [
    (Story) => {
      seed(demoWidgets, false);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const EditingMode: Story = {
  decorators: [
    (Story) => {
      seed(demoWidgets, true);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Empty: Story = {
  decorators: [
    (Story) => {
      seed([], false);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const EmptyEditing: Story = {
  decorators: [
    (Story) => {
      seed([], true);
      return <Story />;
    },
  ],
  render: () => framed,
};
