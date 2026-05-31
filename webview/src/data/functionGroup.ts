/* ============================================================
   Function Subcategory — what a Block *does*, not its plugin format.
   Drives block icons + (later) palette grouping + inspector context.

   Re-housed verbatim from the mindful-studio mockup (pure logic, per the
   bake-off re-house rule). The mockup keys on its own `nodeType`; Element keys
   on the 4-cat `BlockCategory`, so `functionGroupFromCategory` bridges the two.
   ============================================================ */

import type { BlockCategory } from "./types";

export type FunctionGroup =
  | "synth" | "sampler" | "drum"
  | "eq" | "filter" | "dynamics" | "distortion"
  | "reverb" | "delay" | "modulation" | "imager"
  | "midi-gen" | "midi-transform"
  | "routing" | "logic" | "meter" | "controller";

export interface FunctionMeta {
  group: FunctionGroup;
  label: string;
  /** Short code for a header chip. */
  code: string;
  /** Inline SVG path data (24x24 viewBox) — minimalist line icon. */
  iconPath: string;
}

const META: Record<FunctionGroup, Omit<FunctionMeta, "group">> = {
  synth: { label: "Synthesizer", code: "SYN", iconPath: "M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" },
  sampler: { label: "Sampler", code: "SMP", iconPath: "M3 18V8l4-2 4 4 4-3 6 5v6M3 18h18" },
  drum: { label: "Drum Synth", code: "DRM", iconPath: "M4 8c0-2 4-3 8-3s8 1 8 3-4 3-8 3-8-1-8-3zm0 0v8c0 2 4 3 8 3s8-1 8-3V8" },
  eq: { label: "Equalizer", code: "EQ", iconPath: "M3 16c4-12 7-6 9 0s4 4 9-6" },
  filter: { label: "Filter", code: "FLT", iconPath: "M3 10h10l5 6h3M3 14h7" },
  dynamics: { label: "Dynamics", code: "DYN", iconPath: "M3 20V10l4-4 4 8 4-12 4 16h4" },
  distortion: { label: "Distortion", code: "SAT", iconPath: "M3 12l3-6 3 12 3-12 3 12 3-12 3 6" },
  reverb: { label: "Reverb", code: "RV", iconPath: "M4 12a8 8 0 0116 0M7 12a5 5 0 0110 0M10 12a2 2 0 014 0" },
  delay: { label: "Delay", code: "DLY", iconPath: "M3 12h3l2-4 2 8 2-6 2 4h7" },
  modulation: { label: "Modulation", code: "MOD", iconPath: "M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" },
  imager: { label: "Stereo / Imager", code: "IMG", iconPath: "M12 4v16M4 8l8 4-8 4M20 8l-8 4 8 4" },
  "midi-gen": { label: "MIDI Generator", code: "GEN", iconPath: "M4 18l4-12 4 12 4-12 4 12" },
  "midi-transform": { label: "MIDI Transform", code: "XFM", iconPath: "M4 8h12l-3-3M20 16H8l3 3" },
  routing: { label: "Routing", code: "RTE", iconPath: "M4 6h6l4 12h6M4 18h6" },
  logic: { label: "Logic / CV", code: "CV", iconPath: "M4 12h4l2-6 2 12 2-6h6" },
  meter: { label: "Meter / Analyser", code: "MTR", iconPath: "M4 20V12m4 8V8m4 12V4m4 16v-6m4 6v-10" },
  controller: { label: "Controller", code: "CTL", iconPath: "M3 14h18M6 14V8m4 6V6m4 8v-8m4 8v-5" },
};

/** Map Element's 4-category taxonomy onto the mockup's vst-* nodeType buckets
 *  so the name-based inference below can run unchanged. */
function pseudoNodeType(category: BlockCategory): string {
  switch (category) {
    case "instrument": return "vst-instrument";
    case "audiofx": return "vst-effect";
    case "midifx": return "vst-midi";
    case "modulator": return "logic";
  }
}

/** Infer the function group from a node's name + Element category. */
export function inferFunctionGroup(name: string, category: BlockCategory): FunctionGroup {
  const nodeType = pseudoNodeType(category);
  const n = name.toLowerCase();
  if (nodeType === "routing") return "routing";
  if (nodeType === "logic")
    return n.includes("lfo") || n.includes("env") || n.includes("mod") ? "modulation" : "logic";
  if (nodeType === "vst-midi") return n.includes("arp") ? "midi-gen" : "midi-transform";
  if (nodeType === "vst-instrument") {
    if (n.includes("kick") || n.includes("snare") || n.includes("hat") || n.includes("drum") || n.includes("hihat")) return "drum";
    if (n.includes("sampl") || n.includes("kontakt")) return "sampler";
    return "synth";
  }
  // vst-effect (audiofx)
  if (n.includes("eq") || n.includes("equal")) return "eq";
  if (n.includes("filter") || n.includes("ladder")) return "filter";
  if (n.includes("comp") || n.includes("limit") || n.includes("gate") || n.includes("expand") || n.includes("dyn")) return "dynamics";
  if (n.includes("sat") || n.includes("drive") || n.includes("dist") || n.includes("crush") || n.includes("fuzz")) return "distortion";
  if (n.includes("reverb") || n.includes("verb") || n.includes("plate") || n.includes("hall") || n.includes("room")) return "reverb";
  if (n.includes("delay") || n.includes("echo") || n.includes("tape")) return "delay";
  if (n.includes("chorus") || n.includes("phaser") || n.includes("flange") || n.includes("trem")) return "modulation";
  if (n.includes("imager") || n.includes("stereo") || n.includes("width") || n.includes("m/s")) return "imager";
  if (n.includes("meter") || n.includes("analy") || n.includes("scope") || n.includes("tuner")) return "meter";
  return "eq";
}

export function getFunctionMeta(name: string, category: BlockCategory): FunctionMeta {
  const group = inferFunctionGroup(name, category);
  return { group, ...META[group] };
}
