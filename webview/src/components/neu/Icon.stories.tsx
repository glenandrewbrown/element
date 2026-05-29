import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon";
import type { IconTone } from "./Icon";

const meta = {
  title: "Neu/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: { type: "select" },
      options: ["audio", "midi", "cv", "primary", "secondary", undefined],
    },
    size: { control: { type: "range", min: 12, max: 48, step: 2 } },
    strokeWidth: { control: { type: "range", min: 0.5, max: 3, step: 0.25 } },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "AudioWaveform",
    size: 24,
    tone: "audio",
    strokeWidth: 1.5,
  },
};

export const UnknownFallback: Story = {
  args: {
    name: "ThisIconDoesNotExist",
    size: 24,
    strokeWidth: 1.5,
  },
};

const ALL_ICON_NAMES = [
  "Activity",
  "AudioWaveform",
  "Cable",
  "Camera",
  "ChevronLeft",
  "ChevronRight",
  "Circle",
  "Clock",
  "Cpu",
  "Folder",
  "GripVertical",
  "HeartPulse",
  "Layers",
  "LayoutGrid",
  "Link",
  "List",
  "MoreVertical",
  "Music",
  "Network",
  "Pause",
  "Pencil",
  "Play",
  "Plus",
  "Power",
  "Puzzle",
  "Redo2",
  "Search",
  "Settings",
  "SkipBack",
  "Square",
  "Trash2",
  "Undo2",
  "Volume2",
  "X",
] as const;

const TONES: IconTone[] = ["audio", "midi", "cv", "primary", "secondary"];
const TONE_LABELS: Record<IconTone, string> = {
  audio: "#4A90D9 audio",
  midi: "#2BC4C4 midi",
  cv: "#E8A838 cv",
  primary: "#E5E5EA primary",
  secondary: "#8E8E93 secondary",
};

export const AllIcons: Story = {
  args: { name: "Play" },
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-6 p-6">
      <span className="text-text-secondary text-[10px] uppercase tracking-wide">
        All registered icons — default tone (primary), size 20
      </span>
      <div className="flex flex-wrap gap-4">
        {ALL_ICON_NAMES.map((name) => (
          <div
            key={name}
            className="flex flex-col items-center gap-1.5 w-16"
            title={name}
          >
            <Icon name={name} size={20} tone="primary" />
            <span className="text-[8px] text-text-secondary text-center leading-tight break-all">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const ToneMatrix: Story = {
  args: { name: "AudioWaveform" },
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-4 p-6">
      {TONES.map((tone) => (
        <div key={tone} className="flex items-center gap-4">
          <span className="text-text-secondary text-[10px] w-32 shrink-0">
            {TONE_LABELS[tone]}
          </span>
          <div className="flex items-center gap-3">
            {(["AudioWaveform", "Cable", "Power", "Settings", "Music"] as const).map(
              (name) => (
                <Icon key={name} name={name} size={18} tone={tone} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const SizeMatrix: Story = {
  args: { name: "AudioWaveform" },
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-end gap-6 p-6">
      {[12, 16, 20, 24, 32, 40].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Icon name="AudioWaveform" size={size} tone="audio" />
          <span className="text-[9px] text-text-secondary">{size}px</span>
        </div>
      ))}
    </div>
  ),
};

export const UnknownFallbackGrid: Story = {
  args: { name: "BadName" },
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-4 p-6">
      <span className="text-text-secondary text-[10px] uppercase tracking-wide">
        Unknown icon names → HelpCircle fallback
      </span>
      <div className="flex items-center gap-4">
        {["BadName", "NotAnIcon", "missing-icon", "123"].map((name) => (
          <div key={name} className="flex flex-col items-center gap-1.5">
            <Icon name={name} size={20} />
            <span className="text-[8px] text-text-secondary">{name}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};
