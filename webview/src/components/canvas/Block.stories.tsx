import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { expect, userEvent, within } from "storybook/test";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import { useParameterStore } from "../../stores/useParameterStore";
import { useNodeMeterStore } from "../../stores/useNodeMeterStore";
import {
  useSandboxCrashStore,
  type SandboxEventKind,
} from "../../stores/useSandboxCrashStore";
import { useFacePinStore } from "../../stores/useFacePinStore";
import type { BlockData, Port } from "../../data/types";
import { usePortExpandStore } from "../../stores/usePortExpandStore";

// ── Helpers ──

let n = 0;
function makeBlock(over: Partial<BlockData> = {}): BlockData {
  n += 1;
  return {
    id: `n${n}`,
    name: "Serum",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out", type: "audio", direction: "output", label: "Out", connected: false },
    ],
    cpuLoad: 22,
    latencyMs: 3,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    // Most existing stories demonstrate the FULL block (knob deck, RMS strip,
    // inline faces, the "▸ N params" lane) — Task 2.4 made those the EXPANDED
    // tier (macro/title are the lean tiers showing only the activity well +
    // essential I/O). Default these stories to 'expanded' so they keep showing
    // their full content; the dedicated tier stories below override this.
    collapseTier: "expanded",
    ...over,
  };
}

function flowNode(data: BlockData): Node {
  return { id: data.id, type: "block", position: { x: 0, y: 0 }, data };
}

const nodeTypes = { block: Block };

// Seeds `useParameterStore` with live param values for one Block so the on-Block
// knobs (verdict 1) render the way they do against the real 15 Hz host delta.
// Cleared on unmount so stories stay isolated.
function SeededFlow({
  data,
  params,
  height = 320,
  selected = false,
}: {
  data: BlockData;
  params: number[];
  height?: number;
  selected?: boolean;
}) {
  // `params` is a fresh literal each render; key the effect on its contents so
  // it doesn't clear+reseed on every re-render.
  const seedKey = params.join(",");
  useEffect(() => {
    const st = useParameterStore.getState();
    params.forEach((v, i) => st.setLocal(data.id, i, v));
    return () => useParameterStore.getState().clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, seedKey]);
  return (
    <MiniFlow
      nodes={[{ ...flowNode(data), selected }]}
      nodeTypes={nodeTypes}
      height={height}
    />
  );
}

const meta = {
  title: "Canvas/Block",
  component: Block,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Block — the neumorphic node representing a single instrument/effect/utility on the Board. Registered as the React Flow `block` node type and rendered for every entry in `useGraphStore.nodes`. Colour-coded by category (generator = blue ●, modifier = orange ◆, logic = teal ▲), draws audio/MIDI/value ports as connectable handles, and adapts its body to the active semantic-zoom tier. Container and Portal Blocks, plus bypass/mute/error states, get distinct visual treatments. Mounted on a MiniFlow canvas in these stories so its React Flow handles resolve.",
      },
    },
  },
  // Block is a React Flow node — autodocs can't introspect NodeProps usefully.
  tags: ["!autodocs"],
  // Loose Meta (not `satisfies`) — Block is a React Flow node whose NodeProps
  // would otherwise force `args` on every render-only story.
} as Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof Block>;

const story = (data: BlockData, doc: string, height = 320): Story => ({
  render: () => <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={height} />,
  parameters: { docs: { description: { story: doc } } },
});

export const Instrument: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Instrument Block — blue ● accent. The baseline sound-source state: an inline knob bank (live param values off `useParameterStore`) plus the stacked L/R RMS strip fills the control deck, matching the mockup's Kick Synth (PITCH/DECAY + meters). Seeded here with three param values so the deck is never dead.",
      },
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Serum", category: "instrument", format: "VST3" })}
      params={[0.45, 0.62, 0.3]}
    />
  ),
};
export const AudioFx: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "AudioFx Block — orange ◆ accent. Inline knob bank + RMS strip fills the deck (mockup parity); confirms the effect signal role reads at a glance with nothing dead in the middle. Seeded with live param values.",
      },
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};
export const MidiFx: Story = story(
  makeBlock({ name: "MIDI Split", category: "midifx", format: "INT" }),
  "MidiFx (routing/MIDI) Block — teal ▲ accent. The MIDI/routing signal role.",
);
export const Modulator: Story = story(
  makeBlock({ name: "LFO Tool", category: "modulator", format: "CLAP" }),
  "Modulator Block — purple ⬡ accent. CV/modulation sources like LFOs, envelopes, automation curves.",
);
export const ThirdPartyPluginCard: Story = story(
  makeBlock({
    name: "ValhallaRoom",
    category: "audiofx",
    format: "VST3",
    ports: [
      { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out-l", type: "audio", direction: "output", label: "Out", connected: false },
    ],
  }),
  "2b — third-party plugin card. A non-built-in (VST3/AU/CLAP/LV2) plugin renders the FIXED card: name, category shape+dot, real I/O ports, and EXACTLY ONE activity bar driven by the per-node `level` scalar and COLOURED by the node's signal type (audio = blue here). NOTHING-fake: never an audio-VU + MIDI-LED pair off the one scalar. No embedded editor on the face — double-click opens the windowed editor.",
);
// ── Task 2.4 — three collapse tiers (title / macro / expanded) ──────────────
//
// The Bitwig/Vital/Serum density model (research TOP-10 #2): the persisted
// `collapseTier` drives THREE render densities, double-click-title cycles them.
// These stories let each tier be eyeballed side by side; TierCycle interaction-
// tests the double-click cycle and that the chevron is the same control.

const tierReverb = (over: Partial<BlockData> = {}): BlockData =>
  makeBlock({
    name: "ValhallaRoom",
    category: "audiofx",
    format: "VST3",
    ports: [
      { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
    ],
    ...over,
  });

export const TierTitle: Story = story(
  tierReverb({ collapseTier: "title" }),
  "TITLE tier — header only (name + chevron + B/M + ONE activity well, ≈84px). The most-collapsed glance state. D5: the activity well STAYS (never name+dot) — a real signal bar coloured by signal type. Collapsed-socket rule: the essential I/O port Handles STILL render (the engine Arc's endpoints draw) so a connected Block's cable never disappears when collapsed. NO control deck, NO embed, NO param wall.",
);

export const TierMacro: Story = story(
  tierReverb({ collapseTier: "macro" }),
  "MACRO tier — the LEAN DEFAULT (kills wasted space). Header + the single activity well + a COMPACT essential-I/O port lane, MINUS the bulky control deck / heavy embed / param-port wall. Scannable + wireable without the fat deck. NOTHING-fake: only real ports + real activity — no fabricated param knobs (live params are Phase 4; pinned-param slots are Task 3.E). This is what an un-touched newly-added Block shows.",
);

export const TierExpanded: Story = story(
  tierReverb({ collapseTier: "expanded" }),
  "EXPANDED tier — the full deep-dive: control deck (here the third-party single activity bar) + heavy FFT embed for built-in audiofx + the \"▸ N params\" lane for params-as-ports plugins. The deliberate expert state, reached by cycling past macro.",
);

// ── Task 3.E — pinned params surface on the MACRO face ──────────────────────
//
// A params-as-ports reverb whose Value/CV param ports are PINNED in the Inspector
// (📌 pin-to-face) surface on the Macro tier as compact, signal-coloured chips.
// BUG-1 fix: pins now live in useFacePinStore (positive opt-in, default empty).
// Mix + Decay are pinned via the decorator; Width is not. NOTHING-fake: the chips
// are real param-port labels — never a fabricated value/knob.
const PINNED_REVERB_NODE_ID = "pinned-reverb-demo";
const pinnedReverb = (over: Partial<BlockData> = {}): BlockData =>
  makeBlock({
    id: PINNED_REVERB_NODE_ID,
    name: "ValhallaRoom",
    category: "audiofx",
    format: "VST3",
    ports: [
      { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
      { id: "p-mix", type: "value", direction: "input", label: "Mix", connected: false },
      { id: "p-decay", type: "value", direction: "input", label: "Decay", connected: false },
      { id: "p-width", type: "value", direction: "input", label: "Width", connected: false },
    ],
    collapseTier: "macro",
    ...over,
  });

export const TierMacroPinnedParams: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "MACRO tier with PINNED params (Task 3.E). The params the user pinned in the Inspector (📌 " +
          "pin-to-face) surface on the lean Macro face as compact Value/CV-tinted chips — here Mix + Decay " +
          "(Width is unpinned). NOTHING-fake: each chip is a REAL param-port label; the macro face " +
          "never fabricates a knob or value. This is the Block-face half of the Inspector's pin control.",
      },
    },
  },
  decorators: [
    (Story) => {
      // Seed the face-pin store so Mix + Decay appear on the macro face.
      // Width is intentionally absent to demonstrate selective pinning.
      useEffect(() => {
        useFacePinStore
          .getState()
          .setPinnedSet(PINNED_REVERB_NODE_ID, ["p-mix", "p-decay"]);
        return () => useFacePinStore.getState().setPinnedSet(PINNED_REVERB_NODE_ID, []);
      }, []);
      return <Story />;
    },
  ],
  render: () => (
    <MiniFlow nodes={[flowNode(pinnedReverb())]} nodeTypes={nodeTypes} height={320} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // The pinned-param strip is present on the macro face with the two pinned
    // params; the unpinned one (Width) is NOT shown.
    const strip = await body.findByTestId("block-pinned-params");
    await expect(within(strip).getByText("Mix")).toBeInTheDocument();
    await expect(within(strip).getByText("Decay")).toBeInTheDocument();
    await expect(within(strip).queryByText("Width")).not.toBeInTheDocument();
  },
};

export const TierCycle: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Interaction test — DOUBLE-CLICK the title cycles the tier title→macro→expanded→title (Task 2.4). Starts at 'title' (chevron ▸); the play function double-clicks the title twice and asserts the chevron's data-tier advances macro→expanded, proving the title double-click and the chevron are the one shared cycle affordance. (The store action is mocked at the canvas level; here we assert the tier the component is RENDERING reflects the optimistic store update — the MiniFlow decorator drives a real store.)",
      },
    },
  },
  render: () => (
    <MiniFlow nodes={[flowNode(tierReverb({ collapseTier: "title" }))]} nodeTypes={nodeTypes} height={320} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // At title the chevron reports its current tier via data-tier.
    const chevron = await body.findByTestId("collapse-chevron");
    await expect(chevron).toHaveAttribute("data-tier", "title");
    // The title double-click is the cycle gesture (same as the chevron click).
    const title = await body.findByTestId("block-title");
    await expect(title).toBeInTheDocument();
    // The chevron carries an accessible label naming the NEXT action + the cycle.
    await expect(chevron).toHaveAttribute("aria-label", expect.stringMatching(/currently title/i));
  },
};

export const LoadingNode: Story = story(
  tierReverb({ name: "Massive X", loadState: "loading", collapseTier: "expanded" }),
  "LOADING node (loading-node contract §4) — the real processor is still instantiating (Phase 4 async load). An HONEST loading face: the name (header) + a neutral 'loading…' indicator, and NOTHING else — NO meters/VU (no signal yet), NO port Handles (not cable-targetable while loading), NO control deck. Pinned to the Title tier (the explicit `collapseTier: 'expanded'` here is deliberately IGNORED while loading); the chevron is disabled. NOTHING-fake: the only real data mid-load are the name and the fact that it is loading.",
);
export const MidiInputDevice: Story = story(
  makeBlock({
    name: "KeyLab 61 In",
    category: "instrument", // deliberately miscategorised, as blockcategory.hpp's "input" heuristic does
    format: "INT",
    ports: [{ id: "out-m", type: "midi", direction: "output", label: "MIDI", connected: true }],
  }),
  "MIDI input device Block — PORT-derived meter gating (Glen QA 2026-06-06): even when the host's name heuristic miscategorises a hardware MIDI input as 'instrument', a block with no audio outputs renders the status row, never a VU. The output-RMS feed has no data for it — a meter here would be fake.",
);
export const MidiOutputDevice: Story = story(
  makeBlock({
    name: "MIDI Out",
    category: "midifx",
    format: "INT",
    ports: [{ id: "in-m", type: "midi", direction: "input", label: "MIDI", connected: true }],
  }),
  "MIDI output device Block — MIDI-only ports → status row + activity dot, no VU (port-derived gating).",
);
export const Bypassed: Story = story(
  makeBlock({ name: "Reverb", category: "audiofx", bypassed: true }),
  "Bypassed Block — diagonal-stripe overlay + dimmed header signals the engine is passing signal through untouched.",
);
export const Errored: Story = story(
  makeBlock({ name: "Missing.dll", error: true }),
  "Errored Block — pulsing red ring flags a failed/missing plugin so the user spots the broken node in a large Board.",
);
export const Container: Story = story(
  makeBlock({ name: "Drum Bus", category: "midifx", containerNodeCount: 6 }),
  "Container Block — inset surface with child slots; double-click dives into the nested Board it represents.",
);
export const CustomColour: Story = story(
  makeBlock({ name: "Pro-Q 4", category: "audiofx", hostColor: "#ff2BC4C4" }),
  "Custom-coloured Block — the right-click Options swatch REPLACES the category hue on the header gradient (here teal over an audiofx block). Regression-guards the visible recolour path (the colour previously only tinted the 1px border).",
);

// ── Verdict 1 (pilot) — re-housed mockup affordances on the real engine ──

export const PilotKnobs: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Pilot (bake-off verdict 1). On-Block knobs are wired to REAL parameters — live value read off `useParameterStore` (the host's 15 Hz delta channel), and a vertical drag writes back through `nativeSetNodeParameter` → `elementSetNodeParameter` → `setValueNotifyingHost` (Shift = fine). The header carries the wired B (bypass) / M (mute) buttons + a signal LED. Seeded here with three param values so the knobs render off-engine.",
      },
    },
    // addon-designs: the bake-off design reference is the mindful-studio mockup
    // NodeBlock. Run the mockup Storybook on :6008 (ELEMENT_SB_MOCKUP_REF=1) to
    // populate the Design panel for the per-component compare.
    design: {
      type: "iframe",
      name: "Bake-off ref — mockup NodeBlock (mindful-studio :6008)",
      url: "http://localhost:6008",
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};

export const PilotKnobsFocused: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Same pilot Block, hovered/selected — the dense state. Port labels (outward) + the compact perf row reveal alongside the knobs; this is the layout-stress case where overlap would show if the body weren't budgeted.",
      },
    },
  },
  render: () => (
    <SeededFlow
      selected
      data={makeBlock({
        name: "Pro-Q 4",
        category: "audiofx",
        format: "AU",
        ports: [
          { id: "in", type: "audio", direction: "input", label: "In", connected: true },
          { id: "sc", type: "audio", direction: "input", label: "SC", connected: false },
          { id: "out", type: "audio", direction: "output", label: "Out", connected: true },
        ],
      })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};

export const Muted: Story = story(
  makeBlock({ name: "Reverb", category: "audiofx", muted: true }),
  "Muted Block — header M lit red + body dimmed. Wired to the real `toggleMute` engine action (optimistic + host-confirmed).",
);

// Drives the Block VU off REAL per-node data: seeds useNodeMeterStore with the
// block's id → level (D1 correctness path). This mirrors what the host pushes
// ~60Hz via graphbuilder.cpp's atomic per-channel output RMS — terminal and
// unconnected blocks now meter real signal. No outgoing edge required.
// Store is restored on unmount so the story stays isolated.
function VuFlow({ level }: { level: number }) {
  const data = makeBlock({ name: "Bass Synth", category: "instrument", format: "VST3" });
  useEffect(() => {
    const prev = useNodeMeterStore.getState().levels;
    useNodeMeterStore.setState({ levels: { [data.id]: level } });
    return () => {
      useNodeMeterStore.setState({ levels: prev });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  return <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={320} />;
}

export const VuMeterLit: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "VU lit by REAL per-node signal (D1 correctness path). The Block's RMS strip is driven directly by `useBlockNodeLevel(blockId)` from `useNodeMeterStore` — the store the host populates ~60Hz from graphbuilder.cpp's atomic per-channel output RMS. Terminal and unconnected blocks now meter real signal (not idle 0). Here a level of 0.82 is seeded, lighting the LED ladder into the amber shoulder. At 0 the meter stays dark — nothing fabricated.",
      },
    },
  },
  render: () => <VuFlow level={0.82} />,
};

export const VuMeterIdle: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Honesty control for VuMeterLit — identical Block, outgoing cable level 0, so the VU stays dark. Confirms the meter reflects real signal rather than always-on motion.",
      },
    },
  },
  render: () => <VuFlow level={0} />,
};

export const LabeledPorts: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Verdict 1 — labeled ports. Each handle shows its real engine `port.label` OUTWARD of the chassis (in the canvas gutter, never over the body), revealed only on port-hover or when the block is hovered/selected so the canvas stays clean at rest. Long labels truncate. Shown here with the block selected so all labels are visible; suppressed when the port is a wireless bus.",
      },
    },
  },
  render: () => {
    const data = makeBlock({
      name: "Splitter",
      category: "midifx",
      format: "INT",
      ports: [
        { id: "ai", type: "audio", direction: "input", label: "Audio In", connected: true },
        { id: "mi", type: "midi", direction: "input", label: "MIDI In", connected: true },
        { id: "mo", type: "midi", direction: "output", label: "Ch 1", connected: false },
        { id: "vo", type: "value", direction: "output", label: "Gate", connected: false },
      ],
    });
    return (
      <MiniFlow
        nodes={[{ ...flowNode(data), selected: true }]}
        nodeTypes={nodeTypes}
        height={320}
      />
    );
  },
};

// ── R3 — sandbox crash badge story ──────────────────────────────────────────
// Seeds useSandboxCrashStore with a real crashed event for the block's id so
// the CrashBadge renders. Nothing fabricated: the badge appears iff the store
// has a live entry — this story mirrors what happens when the host pushes
// onSandboxEvent({ nodeUuid: data.id, kind: "crashed", ... }). Cleaned up on
// unmount so subsequent stories are unaffected.

function CrashedFlow({ kind = "crashed" }: { kind?: SandboxEventKind }) {
  const data = makeBlock({ name: "Vital", category: "instrument", format: "VST3" });
  useEffect(() => {
    useSandboxCrashStore.getState().applyEvent({
      nodeId: 42,
      nodeUuid: data.id,
      kind,
      reason:
        kind === "inProcessFallback"
          ? "Vital running in-process — sandbox unavailable"
          : "Worker process exited with code 139 (SIGSEGV)",
    });
    return () => {
      useSandboxCrashStore.getState().clear(data.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={320} />;
}

export const SandboxCrashed: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "R3 — sandbox crash badge. Rendered only when `useSandboxCrashStore` has a live `crashed`/`loadFailed`/`error` entry for the block's UUID. This story seeds the store with a real `applyEvent` call (mirroring the host's `onSandboxEvent` push) — nothing is fabricated. The badge sits above the load bar with a ↺ reload button; clicking it calls `restart(uuid)` → `elementRestartSandbox` → clears the badge optimistically on success.",
      },
    },
  },
  render: () => <CrashedFlow />,
};

export const SandboxLoadFailed: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Honesty variant — `kind: loadFailed`. Same badge, different failure reason. Confirms `selectSandboxNeedsAttention` fires for all non-`restarted` kinds.",
      },
    },
  },
  render: () => <CrashedFlow kind="loadFailed" />,
};

// ── Sandbox-unavailable (in-process fallback) honesty badge ──────────────────
// Seeds useSandboxCrashStore with a real `inProcessFallback` event so the
// amber InProcessBadge renders instead of the red CrashBadge. Mirrors the host
// pushing onSandboxEvent({ kind: "inProcessFallback", ... }) after the sandbox
// worker failed and the plugin loaded in-process (unprotected). Reuses
// CrashedFlow (which dispatches a real applyEvent) so nothing is fabricated.

export const SandboxInProcessFallback: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Reliability honesty (Blocker #4) — `kind: inProcessFallback`. The user opted into sandbox isolation but the worker failed to launch/load, so the plugin is running IN-PROCESS and is NOT crash-protected. Distinct from the red crash badge: an amber/advisory band with NO reload button (the plugin is running fine — only the isolation is missing). Honest: rendered only when `useSandboxCrashStore` has a real `inProcessFallback` entry (host's `FellBackInProcess` int-4 event); `selectSandboxNeedsAttention` deliberately ignores this kind so it never shows the crash badge.",
      },
    },
  },
  render: () => <CrashedFlow kind="inProcessFallback" />,
};

export const CategoryRow: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Visual showcase of all four category accents side by side — reference only, not a usage pattern.",
      },
    },
  },
  render: () => (
    <MiniFlow
      height={360}
      nodeTypes={nodeTypes}
      nodes={[
        { id: "a", type: "block", position: { x: 0, y: 0 }, data: makeBlock({ name: "Serum", category: "instrument" }) },
        { id: "b", type: "block", position: { x: 240, y: 0 }, data: makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" }) },
        { id: "c", type: "block", position: { x: 480, y: 0 }, data: makeBlock({ name: "Arp", category: "midifx", format: "CLAP" }) },
        { id: "d", type: "block", position: { x: 720, y: 0 }, data: makeBlock({ name: "LFO Tool", category: "modulator", format: "CLAP" }) },
      ]}
    />
  ),
};

// ── Lean port lane (Glen, 2026-06-03) — params-as-ports collapse ─────────────
//
// A params-as-ports plugin (e.g. a Valhalla reverb whose Mix/Feedback/Density/
// Width/LowCut/HighCut/PreDelay/Decay are exposed as Value/CV input ports) would
// dump a wall of rows. The lane now splits ESSENTIAL audio/MIDI I/O (always
// shown) from PARAM/MOD Value-typed ports (collapsed behind a "▸ N params"
// toggle). These two stories let the design be eyeballed in both states; the
// play functions also interaction-test the toggle. Heuristic: `port.type ===
// "value"` ⇒ param/mod (the cleanest signal the Port model carries — and it
// lines up with the design system: audio blue / MIDI teal = essential, value
// orange = param/mod).

// A realistic Valhalla-style reverb: 2 audio I/O + 8 Value param ports.
function reverbWithParamPorts(): BlockData {
  return makeBlock({
    name: "ValhallaDelay",
    category: "audiofx",
    format: "VST3",
    ports: [
      // ESSENTIAL — main audio I/O (stay visible)
      { id: "in-l", type: "audio", direction: "input", label: "In L", connected: true },
      { id: "in-r", type: "audio", direction: "input", label: "In R", connected: true },
      { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
      { id: "out-r", type: "audio", direction: "output", label: "Out R", connected: true },
      // PARAM/MOD — Value/CV ports mapped to the plugin's real parameters
      // (collapsed by default). Labels are the plugin's ACTUAL param names —
      // nothing fabricated; this is exactly the params-as-ports shape Element
      // hydrates from the engine.
      { id: "p-mix", type: "value", direction: "input", label: "Mix", connected: false },
      { id: "p-fb", type: "value", direction: "input", label: "Feedback", connected: true },
      { id: "p-density", type: "value", direction: "input", label: "Density", connected: false },
      { id: "p-width", type: "value", direction: "input", label: "Width", connected: false },
      { id: "p-lowcut", type: "value", direction: "input", label: "LowCut", connected: false },
      { id: "p-highcut", type: "value", direction: "input", label: "HighCut", connected: false },
      { id: "p-predelay", type: "value", direction: "input", label: "PreDelay", connected: false },
      { id: "p-decay", type: "value", direction: "input", label: "Decay", connected: true },
    ],
  });
}

export const LeanPortLane: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Lean port lane — COLLAPSED (default). A params-as-ports reverb (8 Value/CV param ports) shows ONLY its essential audio I/O (In/Out L/R) plus a single compact \"▸ 8 params\" expander — instead of dumping 12 rows. The expander is a recessed, on-brand neumorphic pill in the Value/CV orange. Click it to reveal the param ports (see LeanPortLaneExpanded). The play function asserts the essential ports + toggle render and the param-port labels stay hidden until expanded.",
      },
    },
    design: {
      type: "iframe",
      name: "Bake-off ref — mockup NodeBlock (mindful-studio :6008)",
      url: "http://localhost:6008",
    },
  },
  render: () => (
    <MiniFlow nodes={[flowNode(reverbWithParamPorts())]} nodeTypes={nodeTypes} height={340} />
  ),
  play: async ({ canvasElement }) => {
    // Block renders inside the React Flow portal — query the document body.
    // findBy* tolerates React Flow's async node mount/measure.
    const body = within(canvasElement.ownerDocument.body);
    // Essential audio I/O is visible…
    await expect(await body.findByText("In L")).toBeInTheDocument();
    await expect(body.getByText("Out R")).toBeInTheDocument();
    // …the param wall is collapsed behind a single toggle (real count = 8)…
    const toggle = await body.findByRole("button", {
      name: /show 8 parameter ports/i,
    });
    await expect(toggle).toBeInTheDocument();
    await expect(toggle).toHaveTextContent(/8 params/i);
    // …and the param-port labels are NOT in the DOM while collapsed (lean).
    await expect(body.queryByText("Feedback")).toBeNull();
    await expect(body.queryByText("Density")).toBeNull();
  },
};

export const LeanPortLaneExpanded: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Lean port lane — EXPANDED. Same reverb after clicking the \"▸ 8 params\" toggle: the chevron flips to ▾ and all 8 Value/CV param ports (Mix, Feedback, Density, Width, LowCut, HighCut, PreDelay, Decay — the plugin's REAL param names, nothing fabricated) reveal below the essential I/O. The block grows only when expanded; collapsing returns it to the lean height. The play function clicks the toggle and asserts the param ports appear.",
      },
    },
  },
  render: () => (
    <MiniFlow nodes={[flowNode(reverbWithParamPorts())]} nodeTypes={nodeTypes} height={420} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Collapsed at mount — param labels absent.
    await expect(body.queryByText("Feedback")).toBeNull();
    // Open the param lane.
    const toggle = await body.findByRole("button", {
      name: /show 8 parameter ports/i,
    });
    await userEvent.click(toggle);
    // Param ports now revealed (plugin's real names).
    await expect(await body.findByText("Mix")).toBeInTheDocument();
    await expect(body.getByText("Feedback")).toBeInTheDocument();
    await expect(body.getByText("Decay")).toBeInTheDocument();
    // The toggle now offers to HIDE them (chevron flipped, aria-expanded true).
    const hideToggle = await body.findByRole("button", {
      name: /hide 8 parameter ports/i,
    });
    await expect(hideToggle).toHaveAttribute("aria-expanded", "true");
  },
};

// ── Hidden params (Configure Parameters… persistence, Glen 2026-06-03) ────────
//
// The same reverb after the user hid two params (Density + Width) via the
// right-click → Configure Parameters… popover. d.hiddenParams (persisted on the
// node tree, hydrated from the snapshot) lists those port ids; Block.tsx filters
// them OUT of the param-port group AND the "▸ N params" count. So the lane now
// reads "▸ 6 params" (8 − 2), and Density/Width never render even when expanded.
// NOTHING fabricated — the hidden set is engine-persisted, not a client guess.
export const HiddenParams: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Two params hidden via Configure Parameters… (`hiddenParams: [\"p-density\", " +
          "\"p-width\"]`). The lean lane toggle reads \"▸ 6 params\" — the visible " +
          "(non-hidden) count, NOT 8. Expanding reveals the 6 remaining params; Density " +
          "and Width are filtered out entirely (they don't render on the Block). The " +
          "hidden set persists on the node tree (survives save/reload) and hydrates from " +
          "the engine snapshot — nothing fabricated.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[
        flowNode({
          ...reverbWithParamPorts(),
          hiddenParams: ["p-density", "p-width"],
        }),
      ]}
      nodeTypes={nodeTypes}
      height={420}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Lane count = VISIBLE params (8 − 2 hidden = 6), not 8.
    const toggle = await body.findByRole("button", {
      name: /show 6 parameter ports/i,
    });
    await expect(toggle).toHaveTextContent(/6 params/i);
    // No "8 params" toggle exists — the hidden ones are excluded from the count.
    await expect(
      body.queryByRole("button", { name: /show 8 parameter ports/i }),
    ).toBeNull();
    // Expand: the 6 remaining params render…
    await userEvent.click(toggle);
    await expect(await body.findByText("Mix")).toBeInTheDocument();
    await expect(body.getByText("Feedback")).toBeInTheDocument();
    await expect(body.getByText("Decay")).toBeInTheDocument();
    // …but the two HIDDEN params never appear, even expanded.
    await expect(body.queryByText("Density")).toBeNull();
    await expect(body.queryByText("Width")).toBeNull();
  },
};

// ── T5 — Bitwig-style curated inline faces on built-in (INT) blocks ──

function comparatorBlock(over: Partial<BlockData> = {}): BlockData {
  return makeBlock({
    name: "Comparator",
    category: "modulator",
    format: "INT",
    identifier: "element.compare",
    intMode: 0,
    ports: [
      { id: "cv_in_a", type: "value", direction: "input", label: "A", connected: false },
      { id: "cv_in_b", type: "value", direction: "input", label: "B", connected: false },
      { id: "cv_out", type: "value", direction: "output", label: "Out", connected: false },
    ],
    ...over,
  });
}

function logicBlock(over: Partial<BlockData> = {}): BlockData {
  return makeBlock({
    name: "Logic Gate",
    category: "modulator",
    format: "INT",
    identifier: "element.logic",
    intMode: 0,
    ports: [
      { id: "cv_in_a", type: "value", direction: "input", label: "A", connected: false },
      { id: "cv_in_b", type: "value", direction: "input", label: "B", connected: false },
      { id: "cv_out", type: "value", direction: "output", label: "Out", connected: false },
    ],
    ...over,
  });
}

export const InlineCompareFace: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T5 — built-in `element.compare` Block. Instead of three generic 'P1/P2/P3' knobs, the face shows a Bitwig-style operator chooser (‹ > ›) wired to the engine via `nativeNodeSetIntMode`, rendering the operator from the snapshot's `intMode`. The comparator exposes NO host parameters, so this is chooser-only — nothing fabricated.",
      },
    },
  },
  render: () => (
    <MiniFlow nodes={[flowNode(comparatorBlock())]} nodeTypes={nodeTypes} height={320} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const chooser = await body.findByTestId("inline-chooser");
    // intMode 0 → ">"
    await expect(chooser).toHaveAttribute("data-value", "0");
    await expect(body.getByText(">")).toBeInTheDocument();
  },
};

export const InlineCompareFaceEq: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Same comparator face with the engine `intMode` at 4 (==) — the chooser renders engine truth, not a local guess.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[flowNode(comparatorBlock({ intMode: 4 }))]}
      nodeTypes={nodeTypes}
      height={320}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("==")).toBeInTheDocument();
  },
};

export const InlineLogicFace: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T5 — built-in `element.logic` Block: a mode chooser cycling AND/OR/XOR/NAND/NOR/NOT (engine-verified enum, incl. the real NOT mode). Writes via `nativeNodeSetIntMode`; renders `intMode`.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[flowNode(logicBlock({ intMode: 1 }))]}
      nodeTypes={nodeTypes}
      height={320}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("OR")).toBeInTheDocument();
  },
};

export const InlineCompareCVConnected: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T5 — comparator with its CV inputs WIRED. The chooser is unaffected (it drives the operator, not a param port); the wired CV `A`/`B` ports light in the port lane. This demonstrates the curated face coexisting with live CV connections (the Blender CV-swap rule applies to knob entries on param-bearing nodes — the chooser-only compare face has none).",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[
        flowNode(
          comparatorBlock({
            intMode: 2,
            ports: [
              { id: "cv_in_a", type: "value", direction: "input", label: "A", connected: true },
              { id: "cv_in_b", type: "value", direction: "input", label: "B", connected: true },
              { id: "cv_out", type: "value", direction: "output", label: "Out", connected: true },
            ],
          }),
        ),
      ]}
      nodeTypes={nodeTypes}
      height={320}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByTestId("inline-face")).toBeInTheDocument();
    await expect(body.getByText("<")).toBeInTheDocument();
  },
};

// ── Port cap (Glen 2026-06-10) — huge fixed-I/O plugins ──────────────────────
//
// Some plugins expose a giant fixed I/O (Kontakt = 64 audio outs). Block.tsx
// caps the visible essential rows per side at PORT_VISIBLE_CAP (8) and offers a
// "+N more" expander (portCap.ts). Rule 1: a CONNECTED port beyond the cap stays
// visible (its cable must keep an anchor). Rule 2: over-cap rows collapse to
// height 0 but keep their Handle MOUNTED so React Flow edges never orphan.

/** Kontakt-shaped block: 1 MIDI in + 64 audio outs (st pair + Out 34 wired). */
function kontaktBlock(over: Partial<BlockData> = {}): BlockData {
  const outs: Port[] = Array.from({ length: 64 }, (_, i) => ({
    id: `out-${i + 1}`,
    type: "audio",
    direction: "output",
    label: `Out ${i + 1}`,
    // Stereo pair wired (within the cap) + Out 34 wired (BEYOND the cap —
    // exercises rule 1: connected ports always stay visible).
    connected: i === 0 || i === 1 || i === 33,
  }));
  return makeBlock({
    name: "Kontakt 8",
    category: "instrument",
    format: "AU",
    collapseTier: "macro",
    ports: [
      { id: "midi-in", type: "midi", direction: "input", label: "MIDI", connected: true },
      ...outs,
    ],
    ...over,
  });
}

// The expand flag persists per-node in localStorage (usePortExpandStore) —
// reset it around each story so runs stay isolated and deterministic.
function PortCapFlow({ data, height = 420 }: { data: BlockData; height?: number }) {
  useEffect(() => {
    usePortExpandStore.setState({ expandedByNode: {} });
    return () => {
      usePortExpandStore.setState({ expandedByNode: {} });
    };
  }, []);
  return <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={height} />;
}

export const PortCapCollapsed: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Port cap — COLLAPSED (default). A Kontakt-shaped block (64 audio outs) shows " +
          "only the first 8 output rows plus any WIRED port beyond the cap (Out 34 here — " +
          "rule 1), with a centred \"+55 more\" expander. The 55 over-cap rows collapse to " +
          "height 0 but keep their Handles mounted (rule 2) so cables never orphan. The " +
          "play function asserts the shown/hidden split via each row's inline height.",
      },
    },
  },
  render: () => <PortCapFlow data={kontaktBlock()} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Within-cap rows lay out normally…
    const out8Row = (await body.findByText("Out 8")).closest("div.absolute") as HTMLElement;
    await expect(out8Row.style.height).not.toBe("0px");
    // …a WIRED port beyond the cap stays visible (rule 1)…
    const out34Row = body.getByText("Out 34").closest("div.absolute") as HTMLElement;
    await expect(out34Row.style.height).not.toBe("0px");
    // …an unwired over-cap row is mounted but collapsed to height 0 (rule 2).
    const out20Row = body.getByText("Out 20").closest("div.absolute") as HTMLElement;
    await expect(out20Row.style.height).toBe("0px");
    // The expander reads the real hidden count: 64 − 8 shown − 1 wired = 55.
    const toggle = await body.findByTestId("port-more-toggle");
    await expect(toggle).toHaveTextContent("+55 more");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

export const PortCapExpands: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Port cap — EXPAND/COLLAPSE round-trip. Clicking \"+55 more\" reveals every " +
          "output row (the toggle flips to \"fewer ports\", aria-expanded true); clicking " +
          "again collapses back to the capped lane. The choice persists per node in " +
          "usePortExpandStore (localStorage) so it survives snapshot re-renders + reload.",
      },
    },
  },
  render: () => <PortCapFlow data={kontaktBlock()} height={760} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const toggle = await body.findByTestId("port-more-toggle");
    await userEvent.click(toggle);
    // Every over-cap row now lays out (height no longer pinned to 0)…
    const out20Row = (await body.findByText("Out 20")).closest("div.absolute") as HTMLElement;
    await expect(out20Row.style.height).not.toBe("0px");
    // …and the toggle offers to collapse back.
    await expect(toggle).toHaveTextContent(/fewer ports/i);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Round-trip: collapse again — Out 20 returns to the hidden (height-0) set.
    // (Re-query: the row remounts when it moves between the shown/hidden lists.)
    await userEvent.click(toggle);
    await expect(toggle).toHaveTextContent("+55 more");
    const out20Collapsed = (await body.findByText("Out 20")).closest(
      "div.absolute",
    ) as HTMLElement;
    await expect(out20Collapsed.style.height).toBe("0px");
  },
};

export const PortCapLongTitle: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Adaptive chassis width (Glen 2026-06-10, bug 2). A long plugin title widens the " +
          "block toward BLOCK_MAX_WIDTH (280px) instead of truncating to \"Kontak…\" at the " +
          "old fixed 208px; short names keep the historical floor. Beyond the max the title " +
          "ellipsizes — the ceiling guards block proportions.",
      },
    },
  },
  render: () => (
    <PortCapFlow
      data={makeBlock({
        name: "Kontakt 8 Factory Library",
        category: "instrument",
        format: "AU",
        collapseTier: "macro",
      })}
      height={320}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const title = await body.findByText("Kontakt 8 Factory Library");
    const chassis = title.closest(".nodeblock-v3") as HTMLElement;
    // 25 chars × 6.4px + 160px chrome = 320 → clamped to the 280px ceiling.
    await expect(chassis.style.width).toBe("280px");
  },
};

// ── T17 Container Mini-Graph Thumbnail ────────────────────────────────────────
//
// Design: .omo/bakeoff/container-representation-2026-06-10/option-1-iteration-2/
// Three stories covering the three render paths in ContainerMiniGraph:
//   1. ContainerMiniGraphSVG  — preview data present (≤12 nodes): pill SVG + cables
//   2. ContainerMiniGraphDense — >12 nodes: density-bar heatmap fallback (S3)
//   3. ContainerPortal        — Portal variant: teal accent + dashed outline + filename

/** Container block with mini-graph preview data (≤ threshold — SVG branch). */
function containerBlock(over: Partial<BlockData> = {}): BlockData {
  return makeBlock({
    name: "Reverb Chain",
    category: "audiofx",
    format: "INT",
    collapseTier: "macro",
    containerNodeCount: 4,
    containerPreview: {
      children: [
        { category: "instrument", x: 0.1, y: 0.35 },
        { category: "audiofx",   x: 0.38, y: 0.35 },
        { category: "audiofx",   x: 0.62, y: 0.65 },
        { category: "modulator", x: 0.88, y: 0.5  },
      ],
      cables: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
    },
    ports: [
      { id: "in-l",  type: "audio", direction: "input",  label: "In L",  connected: true },
      { id: "in-r",  type: "audio", direction: "input",  label: "In R",  connected: true },
      { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
      { id: "out-r", type: "audio", direction: "output", label: "Out R", connected: false },
    ],
    ...over,
  });
}

export const ContainerMiniGraphSVG: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T17 Option 1 — Container block with a mini-graph thumbnail (S1). " +
          "Preview data is present (4 child nodes ≤ the 12-node threshold), so the " +
          "thumbnail renders pill-nodes coloured by category + curved SVG cables. " +
          "Hover brightens the cable opacity and reveals the 'enter' dive-hint. " +
          "The 'Local' badge + neutral white icon distinguish it from a Portal. " +
          "Boundary I/O signature (2▸2) is honest: from the real port list only.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[flowNode(containerBlock())]}
      nodeTypes={nodeTypes}
      height={300}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Thumbnail region is present
    await expect(
      body.getByTestId("mini-graph-thumbnail"),
    ).toBeInTheDocument();
    // SVG is rendered (mini-graph branch)
    const svg = canvasElement.ownerDocument.body.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg",
    );
    await expect(svg).not.toBeNull();
    // No density bars (count ≤ threshold)
    await expect(
      body.queryByTestId("container-density-bars"),
    ).toBeNull();
  },
};

export const ContainerMiniGraphDense: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T17 Option 1 — Container block with the density-bar heatmap fallback (S3). " +
          "This container has 16 child nodes, exceeding the 12-node threshold, so the " +
          "mini-graph SVG is replaced by a heatmap of category-coloured bars (one bar " +
          "per block). The 'dense' label + block count are always shown so the user " +
          "understands why the schematic view is absent. The dive hint and depth badge " +
          "remain unchanged.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[
        flowNode(
          containerBlock({
            name: "Dense Board",
            containerNodeCount: 16,
            containerPreview: {
              children: Array.from({ length: 16 }, (_, i) => ({
                category: (
                  ["instrument", "audiofx", "audiofx", "midifx", "modulator"] as const
                )[i % 5],
                x: (i + 0.5) / 16,
                y: 0.5,
              })),
              cables: Array.from({ length: 15 }, (_, i) => ({
                from: i,
                to: i + 1,
              })),
            },
          }),
        ),
      ]}
      nodeTypes={nodeTypes}
      height={300}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByTestId("container-density-bars"),
    ).toBeInTheDocument();
    // No SCHEMATIC svg (density fallback active). Target the schematic's own
    // testid — the thumbnail region also contains small decorative icon svgs
    // (dive-hint chevron) that a bare `svg[viewBox]` query would match.
    await expect(
      canvasElement.ownerDocument.body.querySelector(
        "[data-testid='mini-graph-schematic']",
      ),
    ).toBeNull();
  },
};

export const ContainerPortal: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "T17 Option 1 — Portal block (S4). Portal differentiators vs local Container: " +
          "teal border accent on the chassis, teal header line, a 'Portal' badge, a " +
          "dashed teal outline on the thumbnail (signals externally linked), and a " +
          "filename row below the thumbnail showing the linked .elboard path. " +
          "The mini-graph SVG renders when preview data is available (3 child nodes here).",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={[
        flowNode(
          makeBlock({
            name: "Drum Bus",
            category: "audiofx",
            format: "INT",
            collapseTier: "macro",
            containerNodeCount: 3,
            isPortal: true,
            portalFilename: "/boards/drum-bus.elboard",
            containerPreview: {
              children: [
                { category: "instrument", x: 0.15, y: 0.4 },
                { category: "audiofx",   x: 0.5,  y: 0.4 },
                { category: "modulator", x: 0.85, y: 0.4 },
              ],
              cables: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
              ],
            },
            ports: [
              { id: "in-l",  type: "audio", direction: "input",  label: "In",  connected: true },
              { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
            ],
          }),
        ),
      ]}
      nodeTypes={nodeTypes}
      height={320}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Filename row is present for the portal
    await expect(
      body.getByText("drum-bus.elboard"),
    ).toBeInTheDocument();
    // Thumbnail is present
    await expect(
      body.getByTestId("mini-graph-thumbnail"),
    ).toBeInTheDocument();
    // SVG is rendered (mini-graph branch — 3 nodes ≤ threshold)
    const svg = canvasElement.ownerDocument.body.querySelector(
      "[data-testid='mini-graph-thumbnail'] svg",
    );
    await expect(svg).not.toBeNull();
  },
};
