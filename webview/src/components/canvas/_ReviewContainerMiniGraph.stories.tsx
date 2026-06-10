import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useSpeech,
  TldrBlock,
  S1StateToggle,
  S8ActivityDemo,
  useStepDraft,
  AnnotationOverlay,
  DraftSavedIndicator,
  readStepIndex,
  writeStepIndex,
} from "./_reviewWizardKit";

const STORY_TITLE = "🔍 Review/Container MiniGraph (Iteration 2)";

/**
 * 🔍 Review/Container MiniGraph (Iteration 2) — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through each of the 8 container-block specimens
 * (S1–S8) from the Option-1 Iteration-2 design exploration.
 * Left = specimen rendered LIVE from the locked spec iframe.
 * Right = TLDR-first rationale pane with read-aloud + interactive demos for S1/S8.
 *
 * ADHD-optimised: ⚡ TLDR bullets first (≤10 words each), 🔊 read-aloud button,
 * interactive state demos where multi-state UX is judged.
 */

const SPEC = "/review-frames/container-iteration-2.html";

interface Step {
  key: string;
  anchor: string;
  name: string;
  /** ⚡ TLDR — 3-5 punchy bullets, ≤10 words each */
  tldr: string[];
  about: string[];
  judge: string[];
  /** Render an interactive demo below TLDR bullets */
  demo?: React.ReactNode;
}

const STEPS: Step[] = [
  {
    key: "s1",
    anchor: "s1",
    name: "S1 — Standard 96px (idle / hover / selected)",
    tldr: [
      "Mini-graph thumbnail of the Board inside",
      "Idle = dim cables; hover = bright + dive hint",
      "Selected = category-colour ring, no fill",
      "Header: glyph + name + badge + LED + stats",
      "Toggle states below to judge the progression",
    ],
    about: [
      "The everyday container state: a 96px mini-graph THUMBNAIL of the contained Board (category-coloured mini-nodes + signal-typed cables), reading as a schematic.",
      "Idle keeps cable opacity low. Hover brightens cables AND the 'double-click to enter' dive hint together.",
      "Selected adds a 1.5px instrument-colour ring + soft outer glow — the RING carries selection, not a colour-fill.",
      "Header: nested-squares container glyph, name, 'Container' badge, LED; footer stats (4 blocks · 5 cables) + 2→2 audio IO summary.",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: is the mini-graph thumbnail the right primary read for a container at standard zoom?",
      "Idle→hover→selected progression legible and on the one-chassis neu palette (no glass)?",
      "Selection-via-ring (not fill) read clearly enough against an unselected neighbour?",
    ],
    demo: <S1StateToggle />,
  },
  {
    key: "s2",
    anchor: "s2",
    name: "S2 — Compact / title tiers (zoom-down)",
    tldr: [
      "3 zoom breakpoints keep container legible when small",
      "≥0.45×: micro-strip — category dots + count",
      "≤0.35×: count chip only — thumbnail DOM gone",
      "≤0.20×: icon + count + bare port pips",
      "Name always readable at every tier",
    ],
    about: [
      "Three discrete zoom breakpoints so the container stays legible as it shrinks.",
      "S2a micro-strip (~0.45×): category colour dots only, no labels, + count.",
      "S2b count chip (≤0.35×): the thumbnail DOM is eliminated entirely — just a '4×' chip in the header (zero layout cost at extreme zoom).",
      "S2c icon tier (≤0.20×): nested-squares icon + tiny count + bare port pips.",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: are the three breakpoints (micro-strip / count-chip / icon) the right ladder?",
      "Dropping the thumbnail DOM at ≤0.35× (count chip only) — right tradeoff for big-board performance?",
      "Does the title stay the anchor at every tier (you can always read the container's name)?",
    ],
  },
  {
    key: "s3",
    anchor: "s3",
    name: "S3 — Dense fallback (>12 blocks)",
    tldr: [
      ">12 blocks: swap thumbnail for density heatmap",
      "One bar per block, height = output-port count",
      "Threshold shown so the switch isn't surprising",
      "Still usable at exactly 12 (generous cutoff)",
    ],
    about: [
      "Above 12 internal blocks the node-by-node mini-graph is replaced by a category-coloured DENSITY HEATMAP — one bar per block, height = output-port count as a complexity proxy.",
      "The threshold note is always visible so the switch is never surprising.",
      "S3b shows the mini-graph is still usable at exactly 12 — the cutoff is deliberately generous.",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: is a density heatmap the right dense fallback (vs e.g. a clamped node count)?",
      "OPEN Q: density threshold at 12 blocks — right, or drop to 8 for cleaner thumbnails earlier?",
      "Is bar-height = output-port-count a meaningful complexity proxy, or misleading?",
    ],
  },
  {
    key: "s4",
    anchor: "s4",
    name: "S4 — Portal vs local Container",
    tldr: [
      "Local = neutral badge + white icon",
      "Portal = teal accent + dashed thumbnail outline",
      "Missing-file = red ring + warning + locate CTA",
      "Judge: distinguishable at a glance?",
    ],
    about: [
      "Local Container: neutral 'Local' badge, standard white nested-squares icon.",
      "Portal (linked to an external .elboard): teal accent on the header line, icon, badge, LED + a DASHED thumbnail outline (dashes = externally linked).",
      "Missing-file state escalates to a red ring + warning surface with a locate instruction.",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: is Portal vs Container distinguishable at a glance?",
      "OPEN Q: is the Portal dashed outline clear enough, or would a teal fill-strip on the thumbnail top edge be stronger?",
      "Missing-file red escalation read as an error without being alarmist?",
    ],
  },
  {
    key: "s5",
    anchor: "s5",
    name: "S5 — Muted / Bypassed",
    tldr: [
      "Muted = red ring + desaturated + darkened",
      "Bypassed = grey ring + full desaturate + quieter",
      "Two distinct severities must read differently",
      "Both stay on the neu chassis (no jarring colour)",
    ],
    about: [
      "Muted: red ring (1.5px, 55% opacity) + filter:saturate(0.15) brightness(0.65) on the thumbnail — red + heavy, per the recurring muted=red+heavy rule.",
      "Bypassed: grey ring + full saturate(0) + a 'signal passes through' hint.",
      "Bypassed is intentionally QUIETER than muted (different severities should read differently).",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: muted (red+heavy) vs bypassed (grey+quiet) — clearly different severities?",
      "Is the desaturated thumbnail an effective 'this isn't passing audio' signal?",
      "Do the overlays stay within the one-chassis palette (no jarring colour)?",
    ],
  },
  {
    key: "s6",
    anchor: "s6",
    name: "S6 — IO summary lanes",
    tldr: [
      "IN/OUT bars flush above/below thumbnail",
      "Share inset shadow — one recessed panel read",
      "Signal pips use shapes: ●=audio ▲=MIDI ◆=CV",
      "Judge: readable enough to skip diving in?",
    ],
    about: [
      "IN / OUT bars sit flush above and below the thumbnail, sharing its inset shadow so they read as ONE recessed panel.",
      "The multi-signal variant uses circle / triangle / diamond pip SHAPES consistent with the rest of the 4-category system (colour-blind-safe by shape).",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: do the IN/OUT lanes belong flush to the thumbnail (one recessed panel), or feel cramped?",
      "Are the signal-type pip shapes (●/▲/◆) legible at this size + consistent with canvas blocks?",
      "Is the IO summary readable enough to skip diving in for a quick routing check?",
    ],
  },
  {
    key: "s7",
    anchor: "s7",
    name: "S7 — Nested container in thumbnail",
    tldr: [
      "Nested container = bordered rect inside thumbnail",
      "Shows own mini icon + internal node row",
      "Depth badge: 'N levels deep' when nesting found",
      "Judge: legible at 96px or too busy?",
    ],
    about: [
      "A nested container renders inside the thumbnail as a bordered rectangle with its OWN mini icon + a tiny internal node row (containers-within-containers are visible one level down).",
      "The depth badge switches to 'N levels deep' when nesting is detected.",
    ],
    judge: [
      "LOCK / TWEAK / REJECT: is a nested container legible inside the thumbnail, or too busy at 96px?",
      "Is 'N levels deep' the right depth cue, or do you want the actual nested name?",
      "Does showing one level of nesting earn its complexity vs just a count?",
    ],
  },
  {
    key: "s8",
    anchor: "s8",
    name: "S8 — Activity hint (motion intent)",
    tldr: [
      "3 motion cues: cable drift + LED pulse + border pulse",
      "All off after 500ms silence",
      "Toggle the live demo below to judge the feel",
      "Decide layer count BEFORE any motion code ships",
    ],
    about: [
      "Static mock of idle vs ACTIVE. Motion intent (S8c, NOT yet coded): cable dash-offset animation, a 4-bar VU strip in the header driven by rAF, and a thumbnail border pulse on a 2s loop.",
      "All three cues switch off on silence after 500ms.",
      "No animation code is written yet — this step is to approve the MOTION LAYER COUNT before implementation (animation has a CPU/visual-noise budget).",
    ],
    judge: [
      "OPEN Q: all THREE motion layers (cable dash + VU + border pulse), or just ONE, to avoid playback noise?",
      "Is an active-container hint worth any animation budget at all, or is the static state enough?",
      "LOCK / TWEAK / REJECT the activity direction before any motion code is written.",
    ],
    demo: <S8ActivityDemo />,
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

function LivePane({ step }: { step: Step }) {
  return (
    <iframe
      key={step.key}
      title={`Container specimen ${step.name}`}
      src={`${SPEC}#${step.anchor}`}
      style={{ width: "100%", height: "100%", border: "none", background: "#1E1E22" }}
    />
  );
}

// Per-step body — keyed by step.key so its draft state re-initialises cleanly
// from localStorage on every step change.
function StepBody({
  step,
  i,
  total,
  saved,
  onSavedStep,
  onStepChange,
}: {
  step: Step;
  i: number;
  total: number;
  saved: Record<string, boolean>;
  onSavedStep: (key: string) => void;
  onStepChange: (next: number) => void;
}) {
  const { available, speaking, speak, cancel } = useSpeech();
  const { text, setText, severity, setSeverity, annotations, setAnnotations, clear, savedTick } =
    useStepDraft(STORY_TITLE, step.key, "P2");
  const [busy, setBusy] = useState(false);

  function handleReadAloud() {
    speak([...step.tldr, ...step.judge]);
  }

  async function submit(advance: boolean) {
    if ((text.trim() || annotations.length) && step) {
      setBusy(true);
      try {
        await fetch("/__ui_comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId: `review:container-minigraph:${step.key}`,
            title: STORY_TITLE,
            name: step.name,
            severity,
            text: text.trim(),
            annotations,
          }),
        });
        onSavedStep(step.key);
        clear(); // only clear this step's draft on a successful submit
      } catch {
        /* dev-server only; ignore */
      }
      setBusy(false);
    }
    cancel();
    if (advance) onStepChange(i + 1);
  }

  return (
    <>
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#8E8E93", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            STEP {i + 1} / {total}
          </span>
          <span style={{ color: "#E5E5EA", fontSize: 14, fontWeight: 700 }}>{step.name}</span>
          {saved[step.key] && <span style={{ color: "#34D399", fontSize: 11 }}>✓ feedback saved</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {STEPS.map((s, n) => (
            <div
              key={s.key}
              title={s.name}
              style={{
                width: 22,
                height: 4,
                borderRadius: 2,
                background: n === i ? "#4A90D9" : saved[s.key] ? "#34D399" : "#3A3A3E",
              }}
            />
          ))}
        </div>
      </div>

      {/* Split — live spec render (left) | rationale pane (right) */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>SPECIMEN (live spec render) — ✏️ Annotate to mark it up</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "#1E1E22", position: "relative" }}>
            <LivePane step={step} />
            <AnnotationOverlay annotations={annotations} onChange={setAnnotations} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E", flex: "0 0 380px" }}>
          <div style={paneLabel}>RATIONALE + OPEN Qs</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#1E1E22", padding: "14px 16px" }}>
            <TldrBlock
              bullets={step.tldr}
              judge={step.judge}
              speaking={speaking}
              available={available}
              onReadAloud={handleReadAloud}
              demo={step.demo}
            />
            <div style={{ ...briefHead, marginTop: 10 }}>WHAT IT IS (full)</div>
            <ul style={ul}>
              {step.about.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div style={bottom}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {annotations.length > 0 && (
            <span style={{ fontSize: 10, color: "#E8A838", fontWeight: 700 }}>
              ✏️ {annotations.length} annotation{annotations.length === 1 ? "" : "s"} attached
            </span>
          )}
          <span style={{ marginLeft: "auto" }}>
            <DraftSavedIndicator tick={savedTick} />
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#8E8E93", fontSize: 10, fontWeight: 700 }}>SEVERITY</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
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
            placeholder={`Lock / tweak / reject "${step.name}" (leave blank to skip)…`}
            style={textarea}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              style={{ ...btnGhost, opacity: i === 0 ? 0.4 : 1 }}
              disabled={i === 0}
              onClick={() => { cancel(); onStepChange(Math.max(0, i - 1)); }}
            >
              ← Prev
            </button>
            <button style={btnPrimary} disabled={busy} onClick={() => submit(true)}>
              {busy ? "Saving…" : text.trim() || annotations.length ? "Save + Next →" : "Skip →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewWizard() {
  const [i, setI] = useState(() => {
    const saved = readStepIndex(STORY_TITLE);
    return saved < STEPS.length ? saved : 0;
  });
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const total = STEPS.length;
  const done = i >= total;

  function handleStepChange(next: number) {
    writeStepIndex(STORY_TITLE, next);
    setI(next);
  }

  if (done) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: "#E5E5EA", fontSize: 18, marginBottom: 8 }}>Review complete</h2>
          <p style={{ color: "#8E8E93", fontSize: 13, lineHeight: 1.5 }}>
            {Object.keys(saved).length} of {total} specimens with feedback, saved to{" "}
            <code style={{ color: "#4A90D9" }}>.omo/audit/ui-comments.jsonl</code>. Tell me "done" and
            I'll read + apply them.
          </p>
          <button style={btnPrimary} onClick={() => handleStepChange(0)}>
            ↻ Review again
          </button>
        </div>
      </div>
    );
  }

  const step = STEPS[i];
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
      <StepBody
        key={step.key}
        step={step}
        i={i}
        total={total}
        saved={saved}
        onSavedStep={(k) => setSaved((s) => ({ ...s, [k]: true }))}
        onStepChange={handleStepChange}
      />
    </div>
  );
}

// ── styles ──
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
const li: React.CSSProperties = { color: "#C7C7CF", fontSize: 12, lineHeight: 1.5, marginBottom: 5 };
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
  title: "🔍 Review/Container MiniGraph (Iteration 2)",
  parameters: {
    layout: "fullscreen",
    options: { showPanel: false },
    chromatic: { disableSnapshot: true },
  },
  tags: ["!autodocs", "!test"],
} as Meta;

export default meta;
type Story = StoryObj;

export const StartReview: Story = {
  name: "▶ Start review",
  render: () => <ReviewWizard />,
};
