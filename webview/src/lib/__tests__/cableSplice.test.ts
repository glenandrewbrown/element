/**
 * Tests for lib/cableSplice — the Item 1b type-gated splice logic.
 *
 * Spec acceptance: compatible block highlights, incompatible never, splice
 * result edges (A→new→B), original edge gone. These all derive from the pure
 * predicate (`canBlockSpliceCable`) + planner (`planSplice`).
 */

import { describe, expect, it } from "vitest";
import {
  canBlockSpliceCable,
  pickSplicePorts,
  planSplice,
  planSpliceAtomic,
  type AtomicSplicePlan,
  type SpliceBlock,
} from "../cableSplice";
import type { CableData, Port } from "../../data/types";

const port = (
  id: string,
  type: Port["type"],
  direction: Port["direction"],
): Port => ({ id, type, direction, label: id, connected: false });

// An audio fx: audio in + audio out → can splice an audio cable.
const audioFx: SpliceBlock = {
  id: "fx",
  ports: [port("in-0", "audio", "input"), port("out-0", "audio", "output")],
};
// A MIDI-only processor: no audio ports → must NOT splice an audio cable.
const midiOnly: SpliceBlock = {
  id: "midi",
  ports: [port("in-0", "midi", "input"), port("out-0", "midi", "output")],
};
// An instrument: MIDI in + audio out (no audio IN) → can't bridge an audio cable.
const instrument: SpliceBlock = {
  id: "synth",
  ports: [port("in-0", "midi", "input"), port("out-0", "audio", "output")],
};

const audioCable: Pick<
  CableData,
  "source" | "sourcePort" | "target" | "targetPort" | "signalType"
> = {
  source: "A",
  sourcePort: "out-0",
  target: "B",
  targetPort: "in-0",
  signalType: "audio",
};

describe("cableSplice — type-compat gate (NOTHING-fake)", () => {
  it("a block with both an audio in AND out can splice an audio cable", () => {
    expect(canBlockSpliceCable(audioFx, audioCable)).toBe(true);
    expect(pickSplicePorts(audioFx, "audio")).toEqual({
      inPortId: "in-0",
      outPortId: "out-0",
    });
  });

  it("a MIDI-only block never highlights an audio cable", () => {
    expect(canBlockSpliceCable(midiOnly, audioCable)).toBe(false);
    expect(pickSplicePorts(midiOnly, "audio")).toBeNull();
  });

  it("an instrument (audio OUT but no audio IN) cannot splice an audio cable", () => {
    expect(canBlockSpliceCable(instrument, audioCable)).toBe(false);
  });

  it("the cable's own endpoints are never splice targets", () => {
    const asSource: SpliceBlock = { ...audioFx, id: "A" };
    const asTarget: SpliceBlock = { ...audioFx, id: "B" };
    expect(canBlockSpliceCable(asSource, audioCable)).toBe(false);
    expect(canBlockSpliceCable(asTarget, audioCable)).toBe(false);
  });
});

describe("cableSplice — planSplice ops (A→new→B, original gone)", () => {
  it("disconnects A→B first, then connects A→new and new→B", () => {
    const ops = planSplice(audioFx, audioCable);
    expect(ops).not.toBeNull();
    expect(ops).toEqual([
      { kind: "disconnect", source: "A", sourcePort: "out-0", target: "B", targetPort: "in-0" },
      { kind: "connect", source: "A", sourcePort: "out-0", target: "fx", targetPort: "in-0" },
      { kind: "connect", source: "fx", sourcePort: "out-0", target: "B", targetPort: "in-0" },
    ]);
  });

  it("the disconnect op exactly matches the original cable (original edge gone)", () => {
    const ops = planSplice(audioFx, audioCable)!;
    const disc = ops[0];
    expect(disc.kind).toBe("disconnect");
    expect({
      source: disc.source,
      sourcePort: disc.sourcePort,
      target: disc.target,
      targetPort: disc.targetPort,
    }).toEqual({
      source: audioCable.source,
      sourcePort: audioCable.sourcePort,
      target: audioCable.target,
      targetPort: audioCable.targetPort,
    });
  });

  it("returns null (no ops) for an incompatible block", () => {
    expect(planSplice(midiOnly, audioCable)).toBeNull();
  });

  it("splices a MIDI cable through a MIDI-capable block", () => {
    const midiCable = { ...audioCable, signalType: "midi" as const };
    const ops = planSplice(midiOnly, midiCable);
    expect(ops).not.toBeNull();
    expect(ops![1]).toMatchObject({ kind: "connect", target: "midi" });
  });
});

describe("cableSplice — planSpliceAtomic (single undoable native call)", () => {
  it("returns the one 7-field plan that wires A→new→B in a single call", () => {
    const plan = planSpliceAtomic(audioFx, audioCable);
    expect(plan).not.toBeNull();
    expect(plan).toEqual<AtomicSplicePlan>({
      aId: "A",
      aPort: "out-0",
      newId: "fx",
      newInPort: "in-0",
      newOutPort: "out-0",
      bId: "B",
      bPort: "in-0",
    });
  });

  it("preserves the original cable's exact source and target ports", () => {
    const plan = planSpliceAtomic(audioFx, audioCable)!;
    expect(plan.aId).toBe(audioCable.source);
    expect(plan.aPort).toBe(audioCable.sourcePort);
    expect(plan.bId).toBe(audioCable.target);
    expect(plan.bPort).toBe(audioCable.targetPort);
  });

  it("agrees with planSplice on the chosen splice ports (one source of truth)", () => {
    const plan = planSpliceAtomic(audioFx, audioCable)!;
    const ports = pickSplicePorts(audioFx, audioCable.signalType)!;
    expect(plan.newInPort).toBe(ports.inPortId);
    expect(plan.newOutPort).toBe(ports.outPortId);
  });

  it("returns null for an incompatible block (NOTHING-fake)", () => {
    expect(planSpliceAtomic(midiOnly, audioCable)).toBeNull();
  });

  it("returns null when the block is one of the cable's own endpoints", () => {
    const asSource: SpliceBlock = { ...audioFx, id: "A" };
    const asTarget: SpliceBlock = { ...audioFx, id: "B" };
    expect(planSpliceAtomic(asSource, audioCable)).toBeNull();
    expect(planSpliceAtomic(asTarget, audioCable)).toBeNull();
  });

  it("splices a MIDI cable through a MIDI-capable block", () => {
    const midiCable = { ...audioCable, signalType: "midi" as const };
    const plan = planSpliceAtomic(midiOnly, midiCable);
    expect(plan).not.toBeNull();
    expect(plan!.newId).toBe("midi");
  });
});
