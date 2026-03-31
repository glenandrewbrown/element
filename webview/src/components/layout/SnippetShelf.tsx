import { NeuButton } from "../neu";

// ── SnippetShelf ──

export function SnippetShelf() {
  return (
    <div className="h-full flex items-center gap-4 px-6 overflow-x-auto select-none">
      {/* Label */}
      <div className="shrink-0 text-[10px] font-bold text-text-secondary uppercase tracking-widest mr-4">
        SNIPPETS
      </div>

      {/* Thumbnails */}
      <div className="flex items-center gap-4">
        {/* Snippet 1: dot-pattern thumbnail */}
        <div className="w-32 h-10 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center group cursor-pointer hover:bg-surface transition-colors">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-generator" />
            <div className="w-3 h-1 bg-white/20 rounded-full my-auto" />
            <div className="w-1.5 h-1.5 rotate-45 bg-modifier" />
          </div>
        </div>

        {/* Snippet 2: VOICE_CHAIN_01 (selected) */}
        <div className="w-32 h-10 bg-surface rounded shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border border-white/10 flex items-center justify-center relative ring-1 ring-modifier/40 cursor-pointer">
          <span className="text-[10px] text-white/50 font-medium">
            VOICE_CHAIN_01
          </span>
        </div>

        {/* Add snippet placeholder */}
        <div className="w-32 h-10 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center opacity-40 cursor-pointer hover:opacity-60 transition-opacity">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-text-secondary"
          >
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status hints */}
      <div className="shrink-0 text-[10px] text-white/20 tracking-[3px] uppercase mr-4">
        SHIFT+DRAG: MULTI-SELECT | ALT+CLICK: FORCE CABLE
      </div>

      {/* Panic button */}
      <NeuButton variant="panic" size="sm">
        PANIC
      </NeuButton>
    </div>
  );
}
