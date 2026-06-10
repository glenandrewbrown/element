/**
 * pluginDrag — round-trip + drop-logic coverage (T19).
 *
 * Covers the drag contract used to drag a plugin row from the left browser onto
 * the Board: serialize → type-guard → parse, plus the malformed / wrong-MIME
 * rejection the GraphCanvas drop handler relies on to NOT mis-route a snippet
 * drag as a plugin add.
 */
import { describe, it, expect } from "vitest";
import {
  PLUGIN_DRAG_TYPE,
  setPluginDragData,
  isPluginDrag,
  parsePluginDrop,
} from "../pluginDrag";

/** Minimal DataTransfer stand-in (jsdom's is fine, but this keeps it explicit). */
function makeDataTransfer(seed?: Record<string, string>): DataTransfer {
  const store: Record<string, string> = { ...seed };
  return {
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    getData: (k: string) => store[k] ?? "",
    get types() {
      return Object.keys(store);
    },
    dropEffect: "none",
    effectAllowed: "none",
  } as unknown as DataTransfer;
}

describe("pluginDrag", () => {
  it("round-trips a payload through setPluginDragData → parsePluginDrop", () => {
    const dt = makeDataTransfer();
    setPluginDragData(dt, { identifier: "vst3:FabFilter Pro-Q 3", name: "Pro-Q 3" });
    expect(isPluginDrag(dt)).toBe(true);
    expect(parsePluginDrop(dt)).toEqual({
      identifier: "vst3:FabFilter Pro-Q 3",
      name: "Pro-Q 3",
    });
  });

  it("sets effectAllowed to copy on the dataTransfer", () => {
    const dt = makeDataTransfer();
    setPluginDragData(dt, { identifier: "au:synth", name: "Synth" });
    expect(dt.effectAllowed).toBe("copy");
  });

  it("isPluginDrag is false for a snippet drag (different MIME)", () => {
    const dt = makeDataTransfer({
      "application/x-element-snippet": JSON.stringify({ name: "Reverb Chain" }),
    });
    expect(isPluginDrag(dt)).toBe(false);
    expect(parsePluginDrop(dt)).toBeNull();
  });

  it("isPluginDrag is false for null/undefined dataTransfer (synthetic events)", () => {
    expect(isPluginDrag(null)).toBe(false);
    expect(isPluginDrag(undefined)).toBe(false);
  });

  it("parsePluginDrop rejects malformed JSON", () => {
    const dt = makeDataTransfer({ [PLUGIN_DRAG_TYPE]: "{not json" });
    expect(parsePluginDrop(dt)).toBeNull();
  });

  it("parsePluginDrop rejects a payload with an empty identifier", () => {
    const dt = makeDataTransfer({
      [PLUGIN_DRAG_TYPE]: JSON.stringify({ identifier: "", name: "x" }),
    });
    expect(parsePluginDrop(dt)).toBeNull();
  });

  it("parsePluginDrop falls back name to identifier when name is absent", () => {
    const dt = makeDataTransfer({
      [PLUGIN_DRAG_TYPE]: JSON.stringify({ identifier: "vst3:x" }),
    });
    expect(parsePluginDrop(dt)).toEqual({ identifier: "vst3:x", name: "vst3:x" });
  });
});
