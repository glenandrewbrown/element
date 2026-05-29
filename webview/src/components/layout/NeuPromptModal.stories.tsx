import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { NeuPromptModal } from "./NeuPromptModal";

// NeuPromptModal is a pure controlled component — no store dependency.
// Stories use a stateful wrapper so the open/close cycle is interactive.

const meta = {
  title: "Layout/NeuPromptModal",
  component: NeuPromptModal,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    onConfirm: { action: "confirmed" },
    onCancel: { action: "cancelled" },
  },
} satisfies Meta<typeof NeuPromptModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Primary: open with a defaultValue pre-filled.
export const Open: Story = {
  args: {
    open: true,
    title: "Save Preset",
    description: "Enter a name for the new preset.",
    placeholder: "Preset name…",
    defaultValue: "Lead Synth 01",
    confirmLabel: "Save",
    cancelLabel: "Cancel",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

// Empty input — confirm button should be disabled until text is entered.
export const EmptyInput: Story = {
  args: {
    open: true,
    title: "Rename Block",
    placeholder: "Enter a new name…",
    defaultValue: "",
    confirmLabel: "Rename",
    cancelLabel: "Cancel",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

// No description variant — description prop omitted entirely.
export const NoDescription: Story = {
  args: {
    open: true,
    title: "New Container",
    placeholder: "Container name…",
    defaultValue: "",
    confirmLabel: "Create",
    cancelLabel: "Cancel",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

// Closed state — renders nothing (verifies open=false guard).
export const Closed: Story = {
  args: {
    open: false,
    title: "Save Preset",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

// Interactive toggle: button in background opens/closes the modal.
function InteractiveWrapper() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas gap-4">
      <button
        type="button"
        className="px-4 py-2 rounded bg-elevated text-text-primary text-sm"
        onClick={() => setOpen(true)}
      >
        Open prompt
      </button>
      {last !== null && (
        <div className="text-[11px] text-text-secondary">
          Last confirmed: <span className="text-text-primary font-bold">{last}</span>
        </div>
      )}
      <NeuPromptModal
        open={open}
        title="Save Preset"
        description="Enter a name for the current parameter state."
        placeholder="Preset name…"
        defaultValue="My Preset"
        confirmLabel="Save"
        cancelLabel="Cancel"
        onConfirm={(v) => { setLast(v); setOpen(false); }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Interactive: Story = {
  args: {
    open: false,
    title: "Save Preset",
    onConfirm: () => {},
    onCancel: () => {},
  },
  render: () => <InteractiveWrapper />,
};
