/**
 * Kontakt-scale snapshot apply (2026-06-11 stuck-badge forensics): the host
 * emits ~4162 ports for Kontakt 8 (4096 param Control ports + 64 audio + 2
 * MIDI). This exercises the FULL onGraphState apply path with a payload of
 * that shape — proving the JS leg survives it (parse → mapBlock/mapPorts →
 * hydrate/reconcile) and bounding its cost. If this passes while the live
 * webview stays stale, the breakage is in the TRANSPORT (evaluateJavascript)
 * or the push cadence, not in JS.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useJuceBridge } from "../useJuceBridge";
import { useGraphStore } from "../../stores/useGraphStore";

function kontaktScaleSnapshot(loading: boolean) {
  const ports: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 64; i++)
    ports.push({
      id: `audio_out_${i + 1}`,
      signalType: "audio",
      direction: "output",
      label: `Output ${i + 1}`,
    });
  ports.push({ id: "midi_in_0", signalType: "midi", direction: "input", label: "MIDI In" });
  ports.push({ id: "midi_out_0", signalType: "midi", direction: "output", label: "MIDI Out" });
  for (let i = 0; i < 4096; i++)
    ports.push({
      id: `param_${i}`,
      signalType: "value",
      direction: "input",
      label: `Param ${i} — with some "quoted" text \\ and unicode   sep`,
    });

  return {
    blocks: [
      {
        id: "kontakt-1",
        name: "Kontakt 8",
        x: 100,
        y: 100,
        category: "instrument",
        format: "VST3",
        ports,
        ...(loading ? { loadState: "loading" } : {}),
      },
    ],
    cables: [],
  };
}

describe("onGraphState at Kontakt scale (4162 ports)", () => {
  it("applies loading then ready snapshots without throwing; loadState flips", () => {
    const { unmount } = renderHook(() => useJuceBridge());
    const native = (window as any).__elementNative;
    expect(typeof native?.onGraphState).toBe("function");

    // Loading push (placeholder add) — small, must apply.
    native.onGraphState(kontaktScaleSnapshot(true));
    let node = useGraphStore.getState().nodes.find((n) => n.id === "kontakt-1");
    expect(node?.loadState).toBe("loading");

    // Ready push — the full 4162-port payload, as a JSON STRING (the wire
    // shape evaluateJavascript delivers after parse; exercise the string
    // branch too, including the U+2028 separator hidden in param labels).
    const json = JSON.stringify(kontaktScaleSnapshot(false));
    expect(json.length).toBeGreaterThan(300_000); // honest scale check
    const t0 = performance.now();
    native.onGraphState(json);
    const applyMs = performance.now() - t0;

    node = useGraphStore.getState().nodes.find((n) => n.id === "kontakt-1");
    expect(node?.loadState).toBe("ready");
    expect(node?.ports.length).toBe(4162);
    // Generous ceiling — catches a pathological O(n²) apply, not jitter.
    expect(applyMs).toBeLessThan(2000);

    unmount();
  });
});
