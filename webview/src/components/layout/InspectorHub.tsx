import { useState } from "react";
import {
  useGraphStore,
  selectSelectedNode,
  selectNodes,
  selectEdges,
} from "../../stores/useGraphStore";
import { NeuKnob, NeuFader, NeuButton, NeuDisplay } from "../neu";

type Tab = "inspector" | "log" | "meters";

// ── Waveform bars for the mini-viz ──

const WAVEFORM_HEIGHTS = [16, 32, 48, 64, 40, 24, 56, 80, 48, 32];

function MiniWaveform() {
  return (
    <NeuDisplay className="h-24 p-2">
      <div className="absolute inset-0 flex items-center justify-around opacity-30">
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="w-1 bg-generator rounded-full"
            style={{ height: h / 4 }}
          />
        ))}
      </div>
      <span className="absolute bottom-1 right-2 text-[10px] text-text-secondary">
        PREVIEW_RENDER_LIVE
      </span>
    </NeuDisplay>
  );
}

// ── Block header card ──

function BlockHeader({ name, category }: { name: string; category: string }) {
  const colorClass =
    category === "generator"
      ? "bg-generator/20 border-generator/30 text-generator"
      : category === "modifier"
        ? "bg-modifier/20 border-modifier/30 text-modifier"
        : "bg-logic/20 border-logic/30 text-logic";

  return (
    <div className="flex items-center gap-3 p-2 bg-surface rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center border ${colorClass}`}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6H8l-4 4h16l-4-4zm2 6H2v8h20v-8zM4 16h2v2H4v-2z" />
        </svg>
      </div>
      <div>
        <div className="text-[11px] font-bold text-text-primary">{name}</div>
        <div className="text-[10px] text-text-secondary uppercase">
          TYPE: {category} / MONO
        </div>
      </div>
    </div>
  );
}

// ── Project overview (nothing selected) ──

function ProjectOverview() {
  const nodes = useGraphStore(selectNodes);
  const edges = useGraphStore(selectEdges);
  const totalCpu = nodes.reduce((sum, n) => sum + n.cpuLoad, 0);

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
        Project Overview
      </div>
      {[
        { label: "BLOCKS", value: String(nodes.length) },
        { label: "CABLES", value: String(edges.length) },
        { label: "TOTAL CPU", value: `${totalCpu.toFixed(1)}%` },
        { label: "SAMPLE RATE", value: "48 kHz" },
        { label: "BUFFER", value: "256 SPL" },
      ].map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center">
          <span className="text-[10px] text-text-secondary">{label}</span>
          <span className="text-[10px] font-bold text-text-primary tabular">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── InspectorHub ──

export function InspectorHub() {
  const [activeTab, setActiveTab] = useState<Tab>("inspector");
  const selectedBlock = useGraphStore(selectSelectedNode);

  const tabs: { id: Tab; label: string }[] = [
    { id: "inspector", label: "INSPECTOR" },
    { id: "log", label: "LOG" },
    { id: "meters", label: "METERS" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-white/5 text-[10px] font-bold tracking-tight text-text-secondary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-3 text-center transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-generator text-text-primary bg-surface"
                : "hover:bg-white/5 cursor-pointer",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === "inspector" && (
          <>
            {selectedBlock ? (
              <>
                {/* Block header */}
                <BlockHeader
                  name={selectedBlock.name}
                  category={selectedBlock.category}
                />

                {/* Knob trio */}
                <div className="flex justify-between items-center px-2">
                  <NeuKnob
                    value={33}
                    label="FREQ"
                    sourceLabel="440.0 Hz"
                    color="blue"
                    size="sm"
                  />
                  <NeuKnob
                    value={42}
                    label="RESO"
                    sourceLabel="0.42"
                    color="orange"
                    size="sm"
                  />
                  <NeuKnob
                    value={78}
                    label="DETUNE"
                    sourceLabel="+12.0"
                    color="teal"
                    size="sm"
                  />
                </div>

                {/* Faders */}
                <div className="p-3 bg-pressed rounded-lg shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] space-y-4">
                  <NeuFader value={70} label="GAIN" color="blue" />
                  <NeuFader value={30} label="PAN" color="blue" />
                </div>

                {/* Bypass / Solo */}
                <div className="grid grid-cols-2 gap-2">
                  <NeuButton variant="active" size="sm">
                    BYPASS
                  </NeuButton>
                  <NeuButton size="sm">SOLO</NeuButton>
                </div>

                {/* Mini waveform */}
                <MiniWaveform />
              </>
            ) : (
              <ProjectOverview />
            )}
          </>
        )}

        {activeTab === "log" && (
          <div className="text-[10px] text-text-dim uppercase tracking-widest text-center pt-8">
            Event log
          </div>
        )}

        {activeTab === "meters" && (
          <div className="text-[10px] text-text-dim uppercase tracking-widest text-center pt-8">
            Level meters
          </div>
        )}
      </div>
    </div>
  );
}
