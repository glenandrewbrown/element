import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import type { BlockData, Port } from "../../data/types";

/**
 * 🔍 Review/Stitch Blocks — guided one-at-a-time review of the Stitch
 * design-pass candidates (Lane A, plan §3).
 *
 * ONE story, ONE url. Glen steps through each Wave-3 block-face candidate:
 * LEFT  = the live Element Block as it renders TODAY (the lean reference).
 * RIGHT = the Stitch CANDIDATE export (3 density tiers of the same block).
 * `parameters.design` = the LOCKED reference frame (lean-block-expanded.png) —
 * the existing block is the ref, the Stitch output is the candidate (plan §3
 * step 3 inverts iter-2). Per-step brief + a feedback box → ui-comments.jsonl.
 *
 * Reuses the exact ReviewWizard infra established in _ReviewBlock.stories.tsx
 * (left/right split, severity selector, prior-feedback banner, stepper, POST to
 * /__ui_comment). NOTHING-fake: the "REAL CONTROLS" row of each step is the
 * engine ground truth — a candidate face does not ship until validateInlineFace
 * passes on a real param (inlineParams.ts is law). The Stitch screens live under
 * /review-stitch/ (static PNGs, never a live iframe → no CORS in vitest/build).
 *
 * Stitch project: "Element V3 - Component Studio" (5588354666030058264),
 * design system asset 3cf5097be5ab4a9f9aeab1d164ca9c53.
 *   envFollower screen 972ad9f76e444577968f0769608a7a22
 *   gate        screen 7866f47e82624d44bb2e04335be617ec
 *   lfo         screen eceb0f807e5b4d9289c7e5bf11c1822f
 */

// ── Local block factory (kept independent of Block.stories) ──
let uid = 0;
function makeBlock(over: Partial<BlockData> = {}): BlockData {
  uid += 1;
  return {
    id: `rs${uid}`,
    name: "Block",
    category: "modulator",
    format: "INT",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 12,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}
function flowNode(data: BlockData, selected = false): Node {
  return { id: data.id, type: "block", position: { x: 0, y: 0 }, data, selected };
}
const nodeTypes = { block: Block };

// ── Engine-verified ports per node (NOTHING-fake: from the .hpp refreshPorts) ──
const ENV_PORTS: Port[] = [
  { id: "audio_in_l", type: "audio", direction: "input", label: "In L", connected: true },
  { id: "audio_in_r", type: "audio", direction: "input", label: "In R", connected: true },
  { id: "cv_out", type: "value", direction: "output", label: "Env", connected: false },
];
const AUDIO_GATE_PORTS: Port[] = [
  { id: "audio_in_l", type: "audio", direction: "input", label: "In L", connected: true },
  { id: "audio_in_r", type: "audio", direction: "input", label: "In R", connected: true },
  { id: "cv_open", type: "value", direction: "input", label: "Open", connected: false },
  { id: "audio_out_l", type: "audio", direction: "output", label: "Out L", connected: false },
  { id: "audio_out_r", type: "audio", direction: "output", label: "Out R", connected: false },
];
const LFO_PORTS: Port[] = [
  { id: "cv_rate", type: "value", direction: "input", label: "Rate", connected: false },
  { id: "cv_out", type: "value", direction: "output", label: "Out", connected: false },
];

// ── Review steps (one per Stitch candidate) ──
interface Step {
  key: string;
  name: string;
  data: BlockData;
  /** Stitch candidate export under /public/review-stitch/. */
  candidateImg: string;
  /** Stitch screen id (for the lane report / regenerate loop). */
  screenId: string;
  /** Engine-verified REAL controls (NOTHING-fake audit, shown inline). */
  realControls: string[];
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "envfollower",
    name: "Envelope Follower — attack/release (smallest real surface)",
    data: makeBlock({ name: "Env Follower", category: "modulator", format: "INT", cpuLoad: 12, ports: ENV_PORTS }),
    candidateImg: "/review-stitch/envfollower.png",
    screenId: "972ad9f76e444577968f0769608a7a22",
    realControls: [
      "Attack → knob → 0.1–2000 ms (atomic attackMs, default 5 ms) — REAL today",
      "Release → knob → 1–5000 ms (atomic releaseMs, default 120 ms) — REAL today",
      "NOTHING else — there is no gain/threshold on this node (src/nodes/envfollowernode.hpp).",
      "Substrate caveat: the two atomics are NOT yet host params — the §1.6 B-1 spike must expose them lock-free before the face binds.",
    ],
    changed: [
      "Stitch candidate = ONE block at THREE density tiers (compact / medium / large), simplifying the locked lean block — not a new design.",
      "compact (~84px) = purple ⬡ header + amber CV activity well ONLY (keeps the live well, D5 — never name+dot).",
      "medium = + Attack & Release knobs in one row + In L/In R (blue) + Env (amber CV) ports.",
      "large = + larger knobs with '5 ms' / '120 ms' JetBrains-Mono readouts + all ports.",
    ],
    judge: [
      "Does the candidate read as the SAME family as the live lean block (header/well/ports), just tightened?",
      "INTERACTION: the activity well must track the live Env CV out — is the well the right hero for an envelope follower?",
      "Are Attack/Release instrument-grade knobs (not dead circles)? Is the ms readout useful?",
      "compact keeps the well — does it still prove the block is alive when collapsed?",
      "VERDICT: accept a tier / accept-with-tweaks / reject-all (→ I regenerate). Name the tier you'd ship.",
    ],
  },
  {
    key: "gate",
    name: "Audio Gate / MIDI Gate — Threshold-only (controls NET-NEW, pending substrate)",
    data: makeBlock({ name: "Audio Gate", category: "modulator", format: "INT", cpuLoad: 8, ports: AUDIO_GATE_PORTS }),
    candidateImg: "/review-stitch/gate.png",
    screenId: "7866f47e82624d44bb2e04335be617ec",
    realControls: [
      "Open (CV in) → a PORT, not a knob — REAL today (the gate is CV-keyed, src/nodes/gatenodes.hpp).",
      "Threshold → knob → 0.0–1.0 → PENDING SUBSTRATE (net-new param + the §1.6 spike). Brief is NOT accepted until engine-verified.",
      "attack/hold/release are deliberately OUT — they do not exist in the engine (ramp is a hardcoded 5ms). NO fake knobs.",
      "Gate-state pip + activity well = REAL state (currentGain / event activity). MIDI Gate = teal ▲, same shape.",
    ],
    changed: [
      "Stitch candidate = both families (Audio Gate purple ⬡ / MIDI Gate teal ▲) + the Audio Gate's 3 density tiers.",
      "The 'Open' CV-key port is emphasised as THE control surface (the gate is CV-driven).",
      "ONE Threshold knob only; the LARGE tier shows a faint recessed EMPTY reserved slot (room for more, nothing fake in it).",
      "compact (~84px) = header + activity well + green/dim gate-state pip ONLY.",
    ],
    judge: [
      "Is the Threshold-only face HONEST — does the empty reserved row read as 'more coming' without faking attack/release?",
      "Does the 'Open' CV port read clearly as the real control surface (so one knob doesn't over-promise)?",
      "INTERACTION: the gate-state pip + well must show the REAL gate state — is that legible at a glance?",
      "Audio vs MIDI: obviously the same family, differentiated only by signal colour + glyph?",
      "VERDICT: accept / tweak / reject-all. NOTE: this brief stays UN-accepted until the spike confirms Threshold can be a real lock-free param.",
    ],
  },
  {
    key: "lfo",
    name: "LFO — rate/depth/shape (to-be-built node, co-designed with real params)",
    data: makeBlock({ name: "LFO", category: "modulator", format: "INT", cpuLoad: 3, ports: LFO_PORTS }),
    candidateImg: "/review-stitch/lfo.png",
    screenId: "eceb0f807e5b4d9289c7e5bf11c1822f",
    realControls: [
      "Rate → knob → 0.01–40 Hz → real AudioProcessorParameter (built WITH the node).",
      "Depth → knob → 0–100 % → real AudioProcessorParameter.",
      "Shape → chooser → Sine/Tri/Saw/Sqr → opChooser (the proven discrete path, like compare/logic — NOT a fake param).",
      "The node DOES NOT EXIST yet (no element.lfo in nodefactory.cpp) — it's the first B-1 consumer, so face + params are co-designed (NOTHING-fake by construction).",
    ],
    changed: [
      "Stitch candidate = ONE LFO block at THREE tiers; the recessed well is a LIVE WAVEFORM SCOPE (amber CV) — the hero element.",
      "compact (~84px) = header + live scope ONLY (D5 — even collapsed, the LFO proves it's running).",
      "medium = + Rate & Depth knobs + Rate/Out ports.",
      "large = + '1.00 Hz' / '100 %' readouts + a neumorphic Sine/Tri/Saw/Sqr SEGMENTED switch (D7 — not iOS pills) + ports.",
    ],
    judge: [
      "The waveform scope is the centrepiece — does it read as a live, honest LFO view? Should Rate change scope speed + Shape change the trace?",
      "Are Rate/Depth instrument-grade knobs with useful Hz/% readouts?",
      "Is the Shape chooser a proper neumorphic segmented switch (D7), not generic pills?",
      "Does it feel like the face + params were built TOGETHER (no 'coming soon' knobs)?",
      "VERDICT: accept a tier / tweak / reject-all (→ regenerate). Name the tier you'd ship.",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Prior-feedback hook (mirrors _ReviewBlock — silent when dev-server absent) ──
interface PriorRecord {
  text: string;
  status: string;
  severity: string | null;
  resolvedNote?: string;
  resolvedCommit?: string;
}

function usePriorFeedback(): (storyId: string) => PriorRecord | null {
  const [byStory, setByStory] = useState<Map<string, PriorRecord>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/__ui_comments", { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return;
        const data = (await res.json()) as {
          comments?: Array<{
            storyId?: string | null;
            text?: string;
            status?: string;
            severity?: string | null;
            ts?: string;
            resolvedNote?: string;
            resolvedCommit?: string;
          }>;
        };
        if (!Array.isArray(data.comments)) return;
        const sorted = [...data.comments].sort((a, b) =>
          (a.ts ?? "").localeCompare(b.ts ?? ""),
        );
        const m = new Map<string, PriorRecord>();
        for (const c of sorted) {
          if (!c.storyId) continue;
          m.set(c.storyId, {
            text: String(c.text ?? ""),
            status: String(c.status ?? "open"),
            severity: c.severity ?? null,
            resolvedNote: c.resolvedNote,
            resolvedCommit: c.resolvedCommit,
          });
        }
        setByStory(m);
      } catch {
        /* dev-server not running — ignore */
      }
    })();
  }, []);

  return (storyId: string) => byStory.get(storyId) ?? null;
}

function PriorBanner({ record }: { record: PriorRecord | null }) {
  if (!record) return null;

  const isAddressed =
    record.status === "resolved" ||
    record.status === "fixed" ||
    record.status === "wontfix" ||
    record.status === "accepted";

  const sevColors: Record<string, string> = {
    P0: "#FF453A",
    P1: "#FF9F0A",
    P2: "#4A90D9",
    P3: "#8E8E93",
  };
  const accentColor = sevColors[record.severity ?? ""] ?? "#8E8E93";

  const short =
    record.text.length > 120 ? record.text.slice(0, 120) + "…" : record.text;

  return (
    <div
      style={{
        borderRadius: 5,
        border: `1px solid ${isAddressed ? "#2A3A2A" : "#2E2A1E"}`,
        background: isAddressed ? "#1A221A" : "#1E1C14",
        padding: "7px 10px",
        marginBottom: 8,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>
        {isAddressed ? "✅" : "💬"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: isAddressed ? "#34D399" : "#FF9F0A",
            }}
          >
            {isAddressed ? "ADDRESSED" : "OPEN FEEDBACK"}
          </span>
          {record.severity && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: accentColor,
                border: `1px solid ${accentColor}44`,
                borderRadius: 3,
                padding: "0 4px",
              }}
            >
              {record.severity}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: isAddressed ? "#4A5A4A" : "#9E9080", lineHeight: 1.45 }}>
          {short}
        </p>
      </div>
    </div>
  );
}

// ── Wizard ──
function ReviewWizard() {
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [sev, setSev] = useState<(typeof SEVERITIES)[number]>("P2");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const getPrior = usePriorFeedback();

  const step = STEPS[i];
  const total = STEPS.length;
  const done = i >= total;

  async function submit(advance: boolean) {
    if (text.trim() && step) {
      setBusy(true);
      try {
        await fetch("/__ui_comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId: `review:stitch:${step.key}`,
            title: "🔍 Review/Stitch Blocks",
            name: step.name,
            severity: sev,
            text: text.trim(),
            // Lane-A metadata so an ACCEPTED verdict carries the Stitch screen id
            // (the brief-complete definition logs the chosen variant to the sink).
            stitchScreenId: step.screenId,
          }),
        });
        setSaved((s) => ({ ...s, [step.key]: true }));
      } catch {
        /* dev-server only; ignore */
      }
      setBusy(false);
    }
    if (advance) {
      setText("");
      setSev("P2");
      setI((n) => n + 1);
    }
  }

  if (done) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: "#E5E5EA", fontSize: 18, marginBottom: 8 }}>Stitch review complete</h2>
          <p style={{ color: "#8E8E93", fontSize: 13, lineHeight: 1.5 }}>
            {Object.keys(saved).length} of {total} candidates with a verdict, saved to{" "}
            <code style={{ color: "#4A90D9" }}>.omo/audit/ui-comments.jsonl</code>. An ACCEPTED verdict
            (with the Stitch screen id) completes a brief; “reject all” triggers the regenerate loop.
          </p>
          <button style={btnPrimary} onClick={() => setI(0)}>
            ↻ Review again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        background: "#161619",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Top bar — progress */}
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#8E8E93", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            CANDIDATE {i + 1} / {total}
          </span>
          <span style={{ color: "#E5E5EA", fontSize: 14, fontWeight: 700 }}>{step.name}</span>
          {saved[step.key] && <span style={{ color: "#34D399", fontSize: 11 }}>✓ verdict saved</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {STEPS.map((s, n) => (
            <div
              key={s.key}
              title={s.name}
              style={{
                width: 26,
                height: 4,
                borderRadius: 2,
                background: n === i ? "#4A90D9" : saved[s.key] ? "#34D399" : "#3A3A3E",
              }}
            />
          ))}
        </div>
      </div>

      {/* Split — live Element block | Stitch candidate */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live, today)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <MiniFlow nodes={[flowNode(step.data)]} nodeTypes={nodeTypes} height={312} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E" }}>
          <div style={paneLabel}>STITCH CANDIDATE — 3 density tiers</div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1E1E22",
            }}
          >
            <img
              src={step.candidateImg}
              alt={`Stitch candidate — ${step.name}`}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        </div>
      </div>

      {/* Brief + feedback — pinned at the bottom, always visible. */}
      <div style={bottom}>
        <div style={{ display: "flex", gap: 20, marginBottom: 12, maxHeight: "30vh", overflowY: "auto" }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...briefHead, color: "#34D399" }}>REAL CONTROLS (engine truth — NOTHING fake)</div>
            <ul style={ul}>
              {step.realControls.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1 }}>
            <div style={briefHead}>WHAT THE CANDIDATE DOES</div>
            <ul style={ul}>
              {step.changed.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...briefHead, color: "#4A90D9" }}>JUDGE THIS (interaction, not stills)</div>
            <ul style={ul}>
              {step.judge.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <PriorBanner record={getPrior(`review:stitch:${step.key}`)} />

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#8E8E93", fontSize: 10, fontWeight: 700 }}>SEVERITY</span>
            <select
              value={sev}
              onChange={(e) => setSev(e.target.value as (typeof SEVERITIES)[number])}
              style={select}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Verdict on “${step.name}” — accept a tier / tweak / reject-all (leave blank to skip)…`}
            style={textarea}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button style={{ ...btnGhost, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
              ← Prev
            </button>
            <button style={btnPrimary} disabled={busy} onClick={() => submit(true)}>
              {busy ? "Saving…" : text.trim() ? "Save + Next →" : "Skip →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── styles (mirrors _ReviewBlock.stories.tsx) ──
const wrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#161619",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Inter, system-ui, sans-serif",
};
const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  background: "#1E1E22",
  borderBottom: "1px solid #2A2A2E",
  flexShrink: 0,
};
const pane: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  background: "#1A1A1E",
};
const paneLabel: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#6E6E73",
  borderBottom: "1px solid #26262A",
};
const bottom: React.CSSProperties = {
  padding: "12px 16px 14px",
  background: "#1E1E22",
  borderTop: "1px solid #2A2A2E",
  flexShrink: 0,
};
const briefHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#8E8E93",
  marginBottom: 6,
};
const ul: React.CSSProperties = { margin: 0, paddingLeft: 16 };
const li: React.CSSProperties = { color: "#C7C7CF", fontSize: 12, lineHeight: 1.5, marginBottom: 3 };
const textarea: React.CSSProperties = {
  flex: 1,
  height: 52,
  resize: "none",
  background: "#121214",
  border: "1px solid #2E2E33",
  borderRadius: 6,
  color: "#E5E5EA",
  fontSize: 13,
  padding: "8px 10px",
  fontFamily: "inherit",
};
const select: React.CSSProperties = {
  background: "#121214",
  border: "1px solid #2E2E33",
  borderRadius: 6,
  color: "#E5E5EA",
  fontSize: 12,
  padding: "8px 6px",
};
const btnPrimary: React.CSSProperties = {
  background: "#4A90D9",
  color: "#0B0B0E",
  border: "none",
  borderRadius: 6,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnGhost: React.CSSProperties = {
  background: "#26262A",
  color: "#E5E5EA",
  border: "1px solid #34343A",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const meta = {
  title: "🔍 Review/Stitch Blocks",
  parameters: {
    layout: "fullscreen",
    options: { showPanel: false },
    chromatic: { disableSnapshot: true },
    // The LOCKED reference frame (plan §3 D1): the existing lean block is the
    // ref, the Stitch output is the candidate. Served from /public/review-frames.
    design: {
      type: "image",
      url: "/review-frames/lean-block-expanded.png",
    },
  },
  // !test → kept out of the vitest story runner (it fetches the dev-server
  // feedback endpoints — a live review surface, not an automated assertion).
  tags: ["!autodocs", "!test"],
} as Meta;

export default meta;
type Story = StoryObj;

export const StartReview: Story = {
  name: "▶ Start review",
  render: () => <ReviewWizard />,
};
