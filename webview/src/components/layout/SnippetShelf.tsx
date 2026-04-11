import { useState } from "react";
import { NeuButton } from "../neu";
import { ConsolePanel } from "./ConsolePanel";
import { VirtualKeyboard } from "./VirtualKeyboard";

// ── Icon paths ──
const ICON_FOLDER = "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";
const ICON_AUTOMATION = "M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.04 7.04 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65a7.04 7.04 0 0 0 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z";
const ICON_LOG = "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z";
const ICON_CONSOLE = "M20 19V7H4v12h16m0-16c1.11 0 2 .89 2 2v14c0 1.1-.89 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.11.9-2 2-2h16m-7 14v-2h5v2h-5m-3.13-3.83L9 12.79 6.21 15.5 4.79 14.08l4.21-4.21 2.79 2.79 3.79-3.79 1.42 1.42-5.21 5.21z";
const ICON_DISK = "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z";
const ICON_KEYBOARD = "M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z";

function Icon({ d, size = 14, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={d} />
    </svg>
  );
}

type BottomTab = "snippets" | "automation" | "log" | "console" | "keyboard";

// ── SnippetShelf ──

export function SnippetShelf() {
  const [activeTab, setActiveTab] = useState<BottomTab>("snippets");

  const tabs: { id: BottomTab; label: string; icon: string }[] = [
    { id: "snippets", label: "Snippets", icon: ICON_FOLDER },
    { id: "automation", label: "Automation", icon: ICON_AUTOMATION },
    { id: "log", label: "Log", icon: ICON_LOG },
    { id: "console", label: "Console", icon: ICON_CONSOLE },
    { id: "keyboard", label: "Keyboard", icon: ICON_KEYBOARD },
  ];

  return (
    <div className="h-full flex flex-col select-none">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center border-b border-white/5 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
              activeTab === tab.id
                ? "text-generator border-b-2 border-generator"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            <Icon d={tab.icon} size={14} />
            {tab.label}
          </button>
        ))}
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Status indicators */}
        <div className="flex items-center gap-4 text-[10px] text-text-dim mr-4">
          <span className="flex items-center gap-1.5">
            <Icon d={ICON_DISK} size={12} />
            <span>420 MB / s</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="uppercase tracking-wider">Clock</span>
            <span className="text-logic">Int 48.0k</span>
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "snippets" && (
          <div className="h-full flex items-center gap-4 px-6 overflow-x-auto">
            {/* Thumbnails */}
            <div className="flex items-center gap-4">
              {/* Snippet 1: dot-pattern thumbnail */}
              <div className="w-32 h-12 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center group cursor-pointer hover:bg-surface transition-colors">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-generator" />
                  <div className="w-3 h-1 bg-white/20 rounded-full my-auto" />
                  <div className="w-1.5 h-1.5 rotate-45 bg-modifier" />
                </div>
              </div>

              {/* Snippet 2: VOICE_CHAIN_01 (selected) */}
              <div className="w-32 h-12 bg-surface rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/10 flex items-center justify-center relative ring-1 ring-modifier/40 cursor-pointer">
                <span className="text-[10px] text-white/50 font-medium">
                  VOICE_CHAIN_01
                </span>
              </div>

              {/* Snippet 3 */}
              <div className="w-32 h-12 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] border border-white/5 flex items-center justify-center cursor-pointer hover:bg-surface transition-colors">
                <span className="text-[10px] text-white/40 font-medium">
                  DRUM_RACK_02
                </span>
              </div>

              {/* Add snippet placeholder */}
              <div className="w-24 h-12 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] border border-dashed border-white/10 flex items-center justify-center opacity-50 cursor-pointer hover:opacity-80 transition-opacity">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Status hints */}
            <div className="shrink-0 text-[9px] text-white/20 tracking-[2px] uppercase mr-4">
              SHIFT+DRAG: MULTI-SELECT | ALT+CLICK: FORCE CABLE
            </div>

            {/* Panic button */}
            <NeuButton variant="panic" size="sm">
              PANIC
            </NeuButton>
          </div>
        )}

        {activeTab === "automation" && (
          <div className="h-full flex items-center justify-center px-6">
            <div className="flex items-center gap-6">
              {/* Automation lane placeholder */}
              <div className="w-48 h-16 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] border border-white/5 flex items-center justify-center">
                <div className="w-full h-8 px-2">
                  <svg viewBox="0 0 100 30" className="w-full h-full">
                    <path
                      d="M0,25 Q20,25 30,15 T50,10 T70,20 T100,5"
                      fill="none"
                      stroke="rgba(74,144,217,0.6)"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
              <div className="text-[10px] text-text-dim uppercase tracking-widest">
                Select a parameter to view automation
              </div>
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div className="h-full overflow-y-auto px-4 py-2 font-mono text-[10px]">
            <div className="space-y-0.5">
              <div className="text-text-dim">[12:34:56.123] Session loaded: Project_Alpha.els</div>
              <div className="text-generator">[12:34:56.456] Audio device: Built-in Output (48kHz)</div>
              <div className="text-text-dim">[12:34:56.789] MIDI device: IAC Driver Bus 1</div>
              <div className="text-logic">[12:34:57.012] Graph compiled: 4 nodes, 6 connections</div>
              <div className="text-modifier">[12:35:01.234] Plugin scanned: Serum (VST3)</div>
              <div className="text-text-dim">[12:35:02.567] Plugin scanned: Pro-Q 3 (VST3)</div>
              <div className="text-text-primary">[12:35:03.890] Engine started - latency: 2.6ms</div>
            </div>
          </div>
        )}

        {activeTab === "console" && <ConsolePanel />}

        {activeTab === "keyboard" && <VirtualKeyboard />}
      </div>
    </div>
  );
}
