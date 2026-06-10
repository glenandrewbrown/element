import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolPalette } from "./ToolPalette";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { withGroupDefaults } from "../../test/pluginFixture";
import {
  useSpeech,
  TldrBlock,
  useStepDraft,
  AnnotationOverlay,
  DraftSavedIndicator,
  readStepIndex,
  writeStepIndex,
} from "../canvas/_reviewWizardKit";

const STORY_TITLE = "🔍 Review/Left Panel V2 (Category-Led)";

/**
 * 🔍 Review/Left Panel V2 (Category-Led) — guided one-at-a-time review wizard.
 *
 * ADHD-optimised: ⚡ TLDR bullets first, 🔊 read-aloud, explicit interaction
 * instruction per step so Glen knows exactly what to try in the live pane.
 *
 * Left = LIVE Element ToolPalette seeded with real store data.
 * Right = design mockup iframe (variation-2 "Category-Led").
 */

// ── Seed data ─────────────────────────────────────────────────────────────────
const demoPlugins = [
  { identifier: "com.fabfilter.pro-q3.vst3", name: "FabFilter Pro-Q 3", manufacturer: "FabFilter",          format: "VST3", category: "EQ",         blockCategory: "audiofx"    as const, signalOut: "audio" as const, usageCount: 8 },
  { identifier: "com.fabfilter.pro-c2.vst3", name: "FabFilter Pro-C 2", manufacturer: "FabFilter",          format: "VST3", category: "Compressor", blockCategory: "audiofx"    as const, signalOut: "audio" as const, usageCount: 4 },
  { identifier: "com.valhalla.vintageverb.au", name: "ValhallaVintageVerb", manufacturer: "Valhalla DSP",   format: "AU",   category: "Reverb",     blockCategory: "audiofx"    as const, signalOut: "audio" as const, usageCount: 2 },
  { identifier: "com.soundtoys.echoboy.au",  name: "EchoBoy",          manufacturer: "SoundToys",           format: "AU",   category: "Delay",      blockCategory: "audiofx"    as const, signalOut: "audio" as const, usageCount: 3 },
  { identifier: "com.arturia.minimoog-v.au", name: "Mini V3",          manufacturer: "Arturia",             format: "AU",   category: "Instrument", blockCategory: "instrument" as const, signalOut: "audio" as const, usageCount: 6 },
  { identifier: "com.native.kontakt7.vst3",  name: "Kontakt 7",        manufacturer: "Native Instruments",  format: "VST3", category: "Instrument", blockCategory: "instrument" as const, signalOut: "audio" as const, usageCount: 5 },
  { identifier: "com.xfer.serum.clap",       name: "Serum",            manufacturer: "Xfer Records",        format: "CLAP", category: "Synth",      blockCategory: "instrument" as const, signalOut: "audio" as const, usageCount: 7 },
  { identifier: "com.u-he.diva.vst3",        name: "Diva",             manufacturer: "u-he",                format: "VST3", category: "Synth",      blockCategory: "instrument" as const, signalOut: "audio" as const, usageCount: 4 },
  { identifier: "el.MidiMonitor",            name: "MIDI Monitor",     manufacturer: "Element",             format: "INT",  category: "Utility",    blockCategory: "midifx"     as const, signalOut: "midi"  as const, usageCount: 1 },
  { identifier: "com.audiomodern.stepic.clap", name: "Stepic",         manufacturer: "Audiomodern",         format: "CLAP", category: "MIDI",       blockCategory: "midifx"     as const, signalOut: "midi"  as const, usageCount: 2 },
  { identifier: "el.LFO",                    name: "LFO",              manufacturer: "Element",             format: "INT",  category: "Modulator",  blockCategory: "modulator"  as const, signalOut: "value" as const, usageCount: 2 },
  { identifier: "com.xfer.lfotool.vst3",     name: "LFOTool",          manufacturer: "Xfer Records",        format: "VST3", category: "Modulator",  blockCategory: "modulator"  as const, signalOut: "value" as const, usageCount: 1 },
].map(withGroupDefaults);

const FAVOURITES = ["com.fabfilter.pro-q3.vst3", "com.arturia.minimoog-v.au"];
const RECENTS = ["com.soundtoys.echoboy.au", "com.native.kontakt7.vst3", "com.xfer.serum.clap"];

const seededPlugins = demoPlugins
  .map((p) => (FAVOURITES.includes(p.identifier) ? { ...p, isFavorite: true } : p))
  .map((p) => {
    const r = RECENTS.indexOf(p.identifier);
    return r >= 0 ? { ...p, recentRank: r } : p;
  });

function seed() {
  usePluginBrowserStore.setState({
    plugins: seededPlugins,
    favoriteIdentifiers: new Set(FAVOURITES),
    recentIdentifiers: RECENTS,
    refresh: async () => {},
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    recentFiles: ["/Users/glen/Music/Demo.els", "/Users/glen/Music/LiveSet.els"],
    graphs: [
      { id: "g1", name: "Main Board", index: 0, active: true },
      { id: "g2", name: "FX Chain", index: 1, active: false },
    ],
  });
  useHostExtrasStore.setState((s) => ({
    ...s,
    molecules: [
      { name: "Sidechain Comp", description: "Classic sidechain compression chain" },
      { name: "Reverb Send", description: "Stereo reverb send with pre-delay" },
    ],
    activeGraphOutline: [],
  }));
  usePerformStore.setState((s) => ({
    liveHealth: { ...s.liveHealth, cpu: 14.2 },
  }));
}

const MOCKUP = "/review-frames/left-panel-v2.html";

// ── Step definitions ──────────────────────────────────────────────────────────
interface Step {
  key: string;
  name: string;
  railAriaLabel: string | null;
  /** ⚡ TLDR — 3-5 punchy bullets, ≤10 words each. Last bullet = what to try. */
  tldr: string[];
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "rail-counts",
    name: "Rail + counts — All Blocks (default)",
    railAriaLabel: "All Blocks",
    tldr: [
      "Always-visible 52px category rail replaces chip row",
      "Each entry: canvas glyph + label + live count",
      "Active entry = 2px left accent bar in category colour",
      "Default = ALL: every block listed",
      "Try: click each rail entry and watch the list change",
    ],
    changed: [
      "V2 CATEGORY-LED layout: a persistent 52px CategoryRail column is always visible (ALL / 4 categories / ★ Fav / ⏱ Recent / Projects) and drives the list pane — it replaces the old facet CHIP row.",
      "Each rail entry shows the canvas category glyph (●/▲/◆/⬡, same shape+colour as on-canvas Blocks) + a tiny label + a LIVE count over the full list (ignoring search).",
      "Default = ALL: list shows every Block; the active entry gets a 2px left-edge accent bar in the category hue (mirrors canvas block accent language).",
    ],
    judge: [
      "Is the always-visible rail (category-first) the right model vs the old hidden-behind-a-chip approach?",
      "Do the per-entry counts read clearly + are they the right info to surface?",
      "Rail glyphs consistent with the canvas-block shapes/colours (one visual language)?",
      "52px rail width feel right against the 228px list pane (280px total)?",
    ],
  },
  {
    key: "drilldown",
    name: "Category drill-down — Audio FX (sub-type dividers)",
    railAriaLabel: "FX Blocks",
    tldr: [
      "Tap category → list narrows + shows category titlebar",
      "Sub-type dividers (EQ/Comp/Reverb) when drilled in",
      "Flat list in ALL/search mode — dividers only on drill-down",
      "Try: click the FX rail entry, check the EQ/Comp dividers",
    ],
    changed: [
      "Tapping a category narrows the list to that category and shows a category titlebar (glyph + name + count).",
      "When narrowed to ONE category, the list groups by sub-type DIVIDERS (e.g. EQ / Compressor / Reverb / Delay) — derived from the plugin's real category, only when the list is long enough to warrant it.",
      "The flat ALL / search list stays virtualized (no dividers) — grouping is a drill-down-only affordance.",
    ],
    judge: [
      "Is the drill-down (tap FX → see only FX) fast + obvious?",
      "Sub-type dividers (EQ / Comp / Reverb…) genuinely helpful for a 100+ plugin category, or noise here at demo scale?",
      "Category titlebar (glyph + name + count) read clearly as 'you are filtered to X'?",
    ],
  },
  {
    key: "fav-recent",
    name: "Favourites ★ + Recents ⏱ facets",
    railAriaLabel: "Favourites only",
    tldr: [
      "★ and ⏱ are persistent rail entries, not stacked sections",
      "★ filters group-aware (AU+VST3 family together)",
      "⏱ sorts most-recently-used first",
      "Starred here: Pro-Q 3 + Mini V3. Recent: EchoBoy/Kontakt/Serum",
      "Try: click ★ then ⏱ rail entries to compare",
    ],
    changed: [
      "★ Favourites + ⏱ Recent are persistent RAIL entries (not stacked above-the-fold sections that pushed the list down).",
      "★ filters to favourited Blocks (group-aware: starring an AU keeps the VST3 family favourited). Inline ★ per row lets you favourite without leaving the list.",
      "⏱ sorts most-recently-used first. Both entries auto-disable + self-heal when their data goes away (last favourite unstarred → facet drops).",
      "Here: Pro-Q 3 + Mini V3 are starred; EchoBoy / Kontakt / Serum are recent.",
    ],
    judge: [
      "★ filter — is favourites-as-a-facet better than a pinned section?",
      "Inline per-row ★ discoverable for one-click favouriting?",
      "⏱ recents ordering useful for the 'add the thing I just used' path?",
      "Disabled state of ★/⏱ when nothing is starred/recent clear enough?",
    ],
  },
  {
    key: "search",
    name: "Search behaviour — metadata fuzzy match",
    railAriaLabel: "All Blocks",
    tldr: [
      "Search is full-width, auto-focused on panel open",
      "Fuzzy across name + manufacturer + category + signal aliases",
      "Search collapses drill-down to flat ranked list",
      "Try: type 'fabfilter' then 'reverb' then 'eq' in the search box",
    ],
    changed: [
      "Search is the first field in the list-pane header, full-width, auto-focused on open via the focusBrowserSearch nonce.",
      "Fuzzy match spans name + manufacturer + category + signal-type aliases (type 'fabfilter' → Pro-Q + Pro-C; 'reverb' → Valhalla; 'eq' → Pro-Q).",
      "Search collapses the category drill-down to a single flat ranked list (dividers off while searching).",
    ],
    judge: [
      "Try a search (type in the live pane): does it feel fast + the right results near the top?",
      "Metadata search (manufacturer / category, not just name) discoverable + useful?",
      "Search-first header placement correct, or should the rail selection take precedence?",
    ],
  },
  {
    key: "drag",
    name: "Drag-to-board affordance",
    railAriaLabel: "All Blocks",
    tldr: [
      "Every row is draggable onto the canvas",
      "Card lift + cursor signals 'grab me'",
      "Primary add path alongside double-click / QuickAdd",
      "Try: drag a row from the live panel to the left",
    ],
    changed: [
      "Every plugin row is draggable onto the canvas to add the Block at the drop point (real onDragStart with the Element plugin payload).",
      "Rows are raised neumorphic cards with a category shape + format badge; the drag cursor + card lift signal 'grab me onto the board'.",
      "This is the primary add path alongside double-click / QuickAdd.",
    ],
    judge: [
      "Is it obvious a row can be DRAGGED to the board (affordance/cursor/lift)?",
      "Card density + format badge legible at the row height without crowding?",
      "Does drag-to-board feel like a first-class add path next to QuickAdd / double-click?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
const PANEL = { width: 280, height: 660 } as const;

// ── Live pane ─────────────────────────────────────────────────────────────────
function LivePane({ step }: { step: Step }) {
  const ref = useRef<HTMLDivElement>(null);
  seed();
  useEffect(() => {
    const el = ref.current;
    if (!el || !step.railAriaLabel) return;
    const id = requestAnimationFrame(() => {
      const btn = el.querySelector<HTMLButtonElement>(
        `[aria-label="${step.railAriaLabel}"]`,
      );
      if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  return (
    <div ref={ref} style={PANEL} className="bg-panel">
      <ToolPalette key={step.key} />
    </div>
  );
}

// ── Per-step body (keyed by step.key) ─────────────────────────────────────────
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
            storyId: `review:left-panel-v2:${step.key}`,
            title: STORY_TITLE,
            name: step.name,
            severity,
            text: text.trim(),
            annotations,
          }),
        });
        onSavedStep(step.key);
        clear(); // clear this step's draft only on successful submit
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
                width: 26,
                height: 4,
                borderRadius: 2,
                background: n === i ? "#4A90D9" : saved[s.key] ? "#34D399" : "#3A3A3E",
              }}
            />
          ))}
        </div>
      </div>

      {/* Split — live Element ToolPalette (left) | design mockup iframe (right) */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live) — ✏️ Annotate to mark it up</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: 12, background: "#1E1E22", position: "relative" }}>
            <LivePane step={step} />
            <AnnotationOverlay annotations={annotations} onChange={setAnnotations} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E" }}>
          <div style={paneLabel}>MOCKUP (target — variation-2 Category-Led)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "#1E1E22" }}>
            <iframe
              title="Left Panel V2 mockup"
              src={MOCKUP}
              style={{ width: "100%", height: "100%", border: "none", background: "#1E1E22" }}
            />
          </div>
        </div>
      </div>

      <div style={bottom}>
        {/* TLDR + full details in the bottom rationale strip */}
        <div style={{ marginBottom: 10 }}>
          <TldrBlock
            bullets={step.tldr}
            judge={step.judge}
            speaking={speaking}
            available={available}
            onReadAloud={handleReadAloud}
          />
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 10, color: "#6E6E73", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", listStyle: "none", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 9 }}>▸</span> WHAT CHANGED (full)
            </summary>
            <ul style={{ ...ul, marginTop: 6 }}>
              {step.changed.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </details>
        </div>

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
            placeholder={`Your feedback on "${step.name}" (leave blank to skip)…`}
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

// ── Wizard ────────────────────────────────────────────────────────────────────
function ReviewWizard() {
  const [i, setI] = useState(() => {
    const s = readStepIndex(STORY_TITLE);
    return s < STEPS.length ? s : 0;
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
            {Object.keys(saved).length} of {total} steps with feedback, saved to{" "}
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

// ── styles ────────────────────────────────────────────────────────────────────
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
void briefHead; // used in kit only — suppress unused warning
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
  title: "🔍 Review/Left Panel V2 (Category-Led)",
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
