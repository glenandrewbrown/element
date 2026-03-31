import { useState } from "react";
import {
  usePerformStore,
  selectMacros,
  selectLiveHealth,
  selectMapMode,
} from "../../stores/usePerformStore";
import { NeuKnob, NeuFader, NeuToggle } from "../neu";

// ── Icons ──

const ICON_TUNE =
  "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";
const ICON_GRID =
  "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z";
const ICON_FX =
  "M7.5 5.6L5 7l1.4 3.5L3 12l3.4 1.5L5 17l2.5 1.4L9 22l1.5-3.4L14 20l-1.5-3.5L16 15l-3.5-1.5L14 10l-2.5-1.4L10 5l-1.5 3.5L5 7l2.5-1.4z";
const ICON_MORE =
  "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z";
const ICON_CLOCK =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";
const ICON_EMERGENCY =
  "M18.5 8.5L12 2 5.5 8.5 2 12l3.5 3.5L12 22l6.5-6.5L22 12l-3.5-3.5zM12 20l-8-8 8-8 8 8-8 8z";

function Icon({
  d,
  size = 16,
  className = "",
}: {
  d: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

// ── Dashboard tab types ──

type DashTab = "macros" | "scenes" | "fx";

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

  const tabs: { id: DashTab; label: string; icon: string }[] = [
    { id: "macros", label: "Macro Controls", icon: ICON_TUNE },
    { id: "scenes", label: "Scene Launch", icon: ICON_GRID },
    { id: "fx", label: "Performance FX", icon: ICON_FX },
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
              <Icon d={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-surface rounded border border-white/5 hover:border-generator/50 cursor-pointer transition-colors">
            <span className="text-[10px] font-black uppercase text-text-primary">
              Map Mode
            </span>
            <NeuToggle active={mapMode} onChange={toggleMapMode} color="blue" />
          </div>
          <div className="h-6 w-px bg-white/10" />
          <button className="text-text-secondary">
            <Icon d={ICON_MORE} />
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
              {/* VU Meters */}
              <div className="flex gap-2">
                <VuMeter level={75} />
                <VuMeter level={72} />
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
                    d={ICON_CLOCK}
                    size={14}
                    className="text-text-secondary"
                  />
                  <span className="text-[12px] font-black tabular text-text-primary">
                    {health.timecode}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "scenes" && (
          <div className="flex-1 flex items-center justify-center text-[10px] text-text-dim uppercase tracking-widest">
            Scene Launch Grid
          </div>
        )}

        {activeTab === "fx" && (
          <div className="flex-1 flex items-center justify-center text-[10px] text-text-dim uppercase tracking-widest">
            Performance FX
          </div>
        )}
      </div>
    </div>
  );
}

// ── Floating Panic Button (rendered in canvas area) ──

export function PanicButton() {
  return (
    <button className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-pressed shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-error/20 flex flex-col items-center justify-center active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] active:translate-y-px group transition-all z-10">
      <Icon
        d={ICON_EMERGENCY}
        size={24}
        className="text-error group-active:scale-95"
      />
      <span className="text-[10px] font-black text-error uppercase tracking-tighter mt-0.5">
        Panic
      </span>
    </button>
  );
}
