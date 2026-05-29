import { useState } from "react";
import {
  usePerformStore,
  selectMacros,
  selectLiveHealth,
  selectMapMode,
} from "../../stores/usePerformStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { NeuKnob, NeuFader, NeuToggle } from "../neu";
import { SceneLauncher } from "./SceneLauncher";
import { nativeTransportPanic } from "../../bridge/nativeGraph";
import type { BlockCategory } from "../../data/types";
import { Icon } from "../neu";

// ── Dashboard tab types ──

type DashTab = "macros" | "scenes" | "fx";

// ── Category colour helpers ──

const CATEGORY_BORDER: Record<BlockCategory, string> = {
  generator: "border-l-generator",
  modifier: "border-l-modifier",
  logic: "border-l-logic",
};

const CATEGORY_DOT: Record<BlockCategory, string> = {
  generator: "bg-generator",
  modifier: "bg-modifier",
  logic: "bg-logic",
};


// ── VU Meter ──

function VuMeter({ level }: { level: number }) {
  return (
    <div className="w-3 h-28 bg-pressed shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] rounded-[2px] flex flex-col-reverse p-[1px]">
      <div
        className="w-full bg-gradient-to-t from-logic via-logic to-error rounded-[1px]"
        style={{ height: `${level}%` }}
      />
    </div>
  );
}

// ── MacroDashboard ──

export function MacroDashboard() {
  const [activeTab, setActiveTab] = useState<DashTab>("macros");
  const macros = usePerformStore(selectMacros);
  const health = usePerformStore(selectLiveHealth);
  const mapMode = usePerformStore(selectMapMode);
  const toggleMapMode = usePerformStore((s) => s.toggleMapMode);
  const allNodes = useGraphStore((s) => s.nodes);
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const effectBlocks = allNodes.filter((n) => n.category !== "generator");

  const tabs: { id: DashTab; label: string; iconName: string }[] = [
    { id: "macros", label: "Macro Controls", iconName: "SlidersHorizontal" },
    { id: "scenes", label: "Scene Launch", iconName: "LayoutGrid" },
    { id: "fx", label: "Performance FX", iconName: "Sparkles" },
  ];

  // Separate knobs and faders from macros
  const knobs = macros.filter((m) => m.type === "knob");
  const faders = macros.filter((m) => m.type === "fader");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-black/20 bg-pressed">
        <div className="flex h-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "h-full px-4 flex items-center gap-2 border-r border-white/5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                activeTab === tab.id
                  ? "bg-panel text-modifier shadow-[inset_0_-2px_0_#E8A838]"
                  : "text-text-secondary hover:text-text-primary cursor-pointer",
              ].join(" ")}
            >
              <Icon name={tab.iconName} size={16} aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-4">
          {/* Not a <button>: NeuToggle renders its own <button role="switch">,
              and a nested button is invalid HTML (DOM-nesting error). The
              label toggles via its own onClick; the toggle handles its own. */}
          <div className="flex items-center gap-2 px-3 py-1 bg-surface rounded border border-white/5 hover:border-generator/50 transition-colors">
            <button
              type="button"
              onClick={toggleMapMode}
              className="text-[10px] font-black uppercase text-text-primary cursor-pointer"
            >
              Map Mode
            </button>
            <NeuToggle active={mapMode} onChange={toggleMapMode} color="blue" />
          </div>
          <div className="h-6 w-px bg-white/10" />
          <button className="text-text-secondary" aria-label="More options">
            <Icon name="MoreVertical" size={16} aria-hidden />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex px-6 py-4 gap-12 overflow-x-auto">
        {activeTab === "macros" && (
          <>
            {/* Knobs section */}
            <div className="flex gap-10 shrink-0">
              {knobs.map((macro) => {
                const color =
                  macro.signalType === "value"
                    ? ("teal" as const)
                    : macro.name === "Q-PEAK"
                      ? ("orange" as const)
                      : ("blue" as const);
                return (
                  <NeuKnob
                    key={macro.id}
                    value={macro.value}
                    label={macro.name}
                    sourceLabel={macro.sourceBlock}
                    color={color}
                    size="md"
                  />
                );
              })}
            </div>

            {/* Faders section */}
            <div className="flex gap-12 shrink-0 border-l border-white/5 pl-12">
              {faders.map((macro) => {
                const color =
                  macro.signalType === "value"
                    ? ("teal" as const)
                    : ("blue" as const);
                return (
                  <NeuFader
                    key={macro.id}
                    value={macro.value}
                    orientation="vertical"
                    label={macro.name}
                    color={color}
                  />
                );
              })}
            </div>

            {/* Master section (right-anchored) */}
            <div className="flex-1 flex justify-end gap-10">
              {/* VU Meters — driven by master output peak from
                  `__elementNative.onMetering` (single aggregate scalar today).
                  Both bars render the same value until per-side L/R is wired
                  in the C++ bridge — see Q-id Q-VU-LR. */}
              <div className="flex gap-2">
                <VuMeter level={Math.round(health.outputPeak * 100)} />
                <VuMeter level={Math.round(health.outputPeak * 100)} />
                <div className="flex flex-col justify-between text-[10px] text-text-secondary font-black py-1">
                  <span>0</span>
                  <span>-6</span>
                  <span>-12</span>
                  <span>-18</span>
                  <span>-INF</span>
                </div>
              </div>

              {/* Clock & BPM */}
              <div className="w-40 bg-pressed rounded-lg p-3 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] flex flex-col justify-between border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">
                    Global Master
                  </span>
                  <div className="text-[20px] font-black tabular text-logic tracking-tighter leading-none mt-1">
                    {health.bpm.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-logic uppercase tracking-tighter font-bold">
                    BPM / Locked
                  </span>
                </div>
                <div className="h-px bg-white/5 my-2" />
                <div className="flex items-center gap-2">
                  <Icon
                    name="Clock"
                    size={14}
                    className="text-text-secondary"
                    aria-hidden
                  />
                  <span className="text-[12px] font-black tabular text-text-primary">
                    {health.timecode}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "scenes" && <SceneLauncher />}

        {activeTab === "fx" && (
          <div className="flex-1 overflow-y-auto">
            {effectBlocks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-text-secondary uppercase tracking-widest">
                No effects on the board
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {effectBlocks.map((block) => (
                  <div
                    key={block.id}
                    className={[
                      "bg-surface rounded-lg p-3 border border-white/5 border-l-2 transition-opacity",
                      CATEGORY_BORDER[block.category],
                      block.bypassed ? "opacity-50" : "opacity-100",
                    ].join(" ")}
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={[
                          "w-2 h-2 rounded-full shrink-0",
                          CATEGORY_DOT[block.category],
                        ].join(" ")}
                      />
                      <span
                        className="text-[11px] font-bold text-text-primary truncate flex-1"
                        title={block.name}
                      >
                        {block.name}
                      </span>
                    </div>
                    {/* Bypass toggle row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary uppercase tracking-widest">
                        {block.bypassed ? "Bypassed" : "Active"}
                      </span>
                      <NeuToggle
                        active={!block.bypassed}
                        onChange={() => toggleBypass(block.id)}
                        color={
                          block.category === "modifier"
                            ? "orange"
                            : block.category === "logic"
                              ? "teal"
                              : "blue"
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Floating Panic Button (rendered in canvas area) ──

export function PanicButton() {
  return (
    <button
      onClick={() => void nativeTransportPanic()}
      className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-pressed shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-error/20 flex flex-col items-center justify-center active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] active:translate-y-px group transition-all z-10"
    >
      <Icon
        name="AlertTriangle"
        size={24}
        className="text-error group-active:scale-95"
        aria-hidden
      />
      <span className="text-[10px] font-black text-error uppercase tracking-tighter mt-0.5">
        Panic
      </span>
    </button>
  );
}
