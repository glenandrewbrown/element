import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuInput } from "./NeuInput";

const meta = {
  title: "Neu/Input",
  component: NeuInput,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuInput — a neumorphic single-line text input, pressed into the chassis to signal an editable slot. Use for search boxes, rename-in-place, and short text entry (Block names, Project names, filter queries). Controlled via `value`/`onChange`; forwards its ref so callers can focus it programmatically (e.g. autofocusing a QuickAdd or rename field).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NeuInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Search blocks…",
  },
  parameters: {
    docs: {
      description: {
        story: "Baseline empty field — the common Block-search input with placeholder text.",
      },
    },
  },
};

export const WithValue: Story = {
  args: {
    value: "Reverb",
    placeholder: "Name",
    onChange: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Populated field — a controlled value, e.g. a Block name during rename-in-place.",
      },
    },
  },
};

export const Placeholder: Story = {
  args: {
    placeholder: "Enter project name",
  },
  parameters: {
    docs: {
      description: {
        story: "Placeholder-only state prompting for entry — e.g. naming a new Project.",
      },
    },
  },
};

export const VariantMatrix: Story = {
  tags: ["!manifest"],
  args: {},
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-4 p-6 w-64">
      <NeuInput placeholder="Empty / placeholder" />
      <NeuInput value="With a value" onChange={() => {}} />
      <NeuInput value="Long text truncates inside a narrow container gracefully" onChange={() => {}} />
      <NeuInput placeholder="Disabled (read-only prop)" value="read only" />
    </div>
  ),
};

export const Interactive: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "Live controlled usage: typing drives state — the real search/rename binding pattern with a character count.",
      },
    },
  },
  render: () => {
    const [val, setVal] = useState("");
    return (
      <div className="flex flex-col gap-3 p-6 w-64">
        <NeuInput
          value={val}
          placeholder="Type something…"
          onChange={setVal}
        />
        <span className="text-text-secondary text-[10px]">
          value: &ldquo;{val}&rdquo; ({val.length} chars)
        </span>
      </div>
    );
  },
};
