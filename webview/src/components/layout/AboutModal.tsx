import { useEffect, useState } from "react";
import {
  nativeAppCheckForUpdates,
  nativeAppGetAbout,
  type AboutInfo,
} from "../../bridge/nativeApp";

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);

  useEffect(() => {
    void nativeAppGetAbout().then(setInfo);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="About Element"
    >
      <div className="w-[min(420px,92vw)] rounded-lg bg-surface shadow-[8px_8px_24px_rgba(0,0,0,0.5)] border border-white/5 p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-lg font-black tracking-tighter text-text-primary">
            {info?.name ?? "Element"}
          </div>
          <div className="text-[11px] text-text-secondary tabular">
            Version {info?.version ?? "—"}
          </div>
        </div>
        <p className="text-[10px] text-text-dim text-center leading-relaxed">
          {info?.copyright ?? "GPL-3.0-or-later"}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            className="w-full py-2 rounded bg-elevated shadow-neu-raised text-text-primary text-[11px] font-bold uppercase tracking-wide"
            onClick={() => void nativeAppCheckForUpdates()}
          >
            Check for updates
          </button>
          <button
            type="button"
            className="w-full py-2 rounded bg-pressed text-text-secondary text-[11px] uppercase"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
