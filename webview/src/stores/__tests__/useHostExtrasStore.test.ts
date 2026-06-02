/**
 * Tests for useHostExtrasStore.hydrateFromSnapshot
 * Covers audioSetup, oscHost, molecules, canvas, midiMapping, activeGraphOutline,
 * and setLogLines — with happy paths, partial updates, and edge/null inputs.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useHostExtrasStore } from "../useHostExtrasStore";

function reset() {
  useHostExtrasStore.setState({
    audioSetup: null,
    midiSetup: null,
    oscHost: null,
    molecules: [],
    canvas: {
      snapToGrid: false,
      gridSize: 8,
      viewport: { x: 0, y: 0, zoom: 1 },
      graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
    },
    midiMapping: { learning: false, maps: [] },
    activeGraphOutline: [],
    logLines: [],
  });
}

describe("useHostExtrasStore.hydrateFromSnapshot — audioSetup", () => {
  beforeEach(reset);

  it("happy path: hydrates full audio setup", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      audioSetup: {
        outputDeviceName: "Speakers",
        inputDeviceName: "Mic",
        sampleRate: 48000,
        bufferSize: 256,
        audioDeviceType: "CoreAudio",
        deviceTypes: ["CoreAudio"],
        outputDevices: ["Speakers"],
        inputDevices: ["Mic"],
        bufferSizes: [128, 256, 512],
        sampleRates: [44100, 48000],
      },
    });
    const { audioSetup } = useHostExtrasStore.getState();
    expect(audioSetup?.outputDeviceName).toBe("Speakers");
    expect(audioSetup?.sampleRate).toBe(48000);
    expect(audioSetup?.bufferSizes).toEqual([128, 256, 512]);
  });

  it("filters non-string values from array fields", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      audioSetup: {
        // @ts-expect-error intentional bad input
        outputDevices: ["Speakers", 42, null, "Headphones"],
        // @ts-expect-error intentional bad input
        bufferSizes: [128, "bad", 512],
      },
    });
    const { audioSetup } = useHostExtrasStore.getState();
    expect(audioSetup?.outputDevices).toEqual(["Speakers", "Headphones"]);
    expect(audioSetup?.bufferSizes).toEqual([128, 512]);
  });

  it("falls back to previous values when fields are undefined", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      audioSetup: { outputDeviceName: "Speakers", sampleRate: 44100 },
    });
    useHostExtrasStore.getState().hydrateFromSnapshot({
      audioSetup: { bufferSize: 512 },
    });
    const { audioSetup } = useHostExtrasStore.getState();
    expect(audioSetup?.outputDeviceName).toBe("Speakers");
    expect(audioSetup?.sampleRate).toBe(44100);
    expect(audioSetup?.bufferSize).toBe(512);
  });

  it("ignores audioSetup key when absent", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({});
    expect(useHostExtrasStore.getState().audioSetup).toBeNull();
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — oscHost", () => {
  beforeEach(reset);

  it("happy path: sets oscHost enabled + port", () => {
    useHostExtrasStore
      .getState()
      .hydrateFromSnapshot({ oscHost: { enabled: true, port: 9000 } });
    const { oscHost } = useHostExtrasStore.getState();
    expect(oscHost?.enabled).toBe(true);
    expect(oscHost?.port).toBe(9000);
  });

  it("non-boolean enabled falls back to default false", () => {
    // @ts-expect-error intentional bad input
    useHostExtrasStore.getState().hydrateFromSnapshot({ oscHost: { enabled: "yes", port: 8080 } });
    expect(useHostExtrasStore.getState().oscHost?.enabled).toBe(false);
  });

  it("non-number port falls back to default 9001", () => {
    // @ts-expect-error intentional bad input
    useHostExtrasStore.getState().hydrateFromSnapshot({ oscHost: { enabled: true, port: "bad" } });
    expect(useHostExtrasStore.getState().oscHost?.port).toBe(9001);
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — molecules", () => {
  beforeEach(reset);

  it("happy path: populates molecules list", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      molecules: [
        { name: "Reverb Chain", description: "Hall + Room" },
        { name: "Comp Gate", description: "Dynamics" },
      ],
    });
    const { molecules } = useHostExtrasStore.getState();
    expect(molecules).toHaveLength(2);
    expect(molecules[0].name).toBe("Reverb Chain");
  });

  it("coerces missing name/description to empty string", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({ molecules: [{}] });
    expect(useHostExtrasStore.getState().molecules[0]).toEqual({
      name: "",
      description: "",
    });
  });

  it("empty array clears molecules", () => {
    useHostExtrasStore.setState({
      molecules: [{ name: "Old", description: "" }],
    } as never);
    useHostExtrasStore.getState().hydrateFromSnapshot({ molecules: [] });
    expect(useHostExtrasStore.getState().molecules).toEqual([]);
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — canvas", () => {
  beforeEach(reset);

  it("happy path: updates snapToGrid and gridSize", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { snapToGrid: true, gridSize: 16 },
    });
    const { canvas } = useHostExtrasStore.getState();
    expect(canvas.snapToGrid).toBe(true);
    expect(canvas.gridSize).toBe(16);
  });

  it("rounds gridSize to integer", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { gridSize: 7.7 },
    });
    expect(useHostExtrasStore.getState().canvas.gridSize).toBe(8);
  });

  it("ignores non-positive gridSize — keeps previous", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { gridSize: 0 },
    });
    expect(useHostExtrasStore.getState().canvas.gridSize).toBe(8);
  });

  it("updates viewport fields partially", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { viewport: { zoom: 1.5 } },
    });
    const { viewport } = useHostExtrasStore.getState().canvas;
    expect(viewport.x).toBe(0);
    expect(viewport.y).toBe(0);
    expect(viewport.zoom).toBe(1.5);
  });

  it("ignores zoom <= 0", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { viewport: { zoom: -1 } },
    });
    expect(useHostExtrasStore.getState().canvas.viewport.zoom).toBe(1);
  });

  it("updates graphBounds", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      canvas: { graphBounds: { minX: -100, minY: -50, maxX: 1000, maxY: 800 } },
    });
    expect(useHostExtrasStore.getState().canvas.graphBounds).toEqual({
      minX: -100,
      minY: -50,
      maxX: 1000,
      maxY: 800,
    });
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — midiMapping", () => {
  beforeEach(reset);

  it("happy path: sets learning flag and maps", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiMapping: {
        learning: true,
        maps: [
          {
            index: 0,
            deviceName: "APC40",
            controlName: "Fader 1",
            nodeName: "Reverb",
            nodeId: "node-r",
            parameterIndex: 2,
            valid: true,
          },
        ],
      },
    });
    const { midiMapping } = useHostExtrasStore.getState();
    expect(midiMapping.learning).toBe(true);
    expect(midiMapping.maps).toHaveLength(1);
    expect(midiMapping.maps[0].deviceName).toBe("APC40");
  });

  it("defaults missing map fields", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiMapping: { maps: [{}] },
    });
    const map = useHostExtrasStore.getState().midiMapping.maps[0];
    expect(map.index).toBe(0);
    expect(map.deviceName).toBe("");
    expect(map.parameterIndex).toBe(-1);
    expect(map.valid).toBe(true);
  });

  it("uses i as fallback index when map.index absent", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiMapping: { maps: [{}, {}] },
    });
    const maps = useHostExtrasStore.getState().midiMapping.maps;
    expect(maps[0].index).toBe(0);
    expect(maps[1].index).toBe(1);
  });

  it("non-array maps treated as empty", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      // @ts-expect-error intentional bad input
      midiMapping: { maps: "bad" },
    });
    expect(useHostExtrasStore.getState().midiMapping.maps).toEqual([]);
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — activeGraphOutline", () => {
  beforeEach(reset);

  it("sets activeGraphOutline", () => {
    const outline = [{ id: "g1", name: "Root" }];
    useHostExtrasStore
      .getState()
      .hydrateFromSnapshot({ activeGraphOutline: outline });
    expect(useHostExtrasStore.getState().activeGraphOutline).toEqual(outline);
  });

  it("null outline does not overwrite", () => {
    const outline = [{ id: "g1", name: "Root" }];
    useHostExtrasStore.setState({ activeGraphOutline: outline } as never);
    useHostExtrasStore.getState().hydrateFromSnapshot({});
    expect(useHostExtrasStore.getState().activeGraphOutline).toEqual(outline);
  });
});

describe("useHostExtrasStore.hydrateFromSnapshot — midiSetup (G3c item 1)", () => {
  beforeEach(reset);

  it("happy path: hydrates inputs, outputs, and defaultOutputId", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiSetup: {
        inputs: [
          { name: "Launchpad", identifier: "in-1", enabled: true },
          { name: "APC", identifier: "in-2", enabled: false },
        ],
        outputs: [
          { name: "IAC Bus 1", identifier: "out-1", isDefault: true },
          { name: "IAC Bus 2", identifier: "out-2", isDefault: false },
        ],
        defaultOutputId: "out-1",
      },
    });
    const { midiSetup } = useHostExtrasStore.getState();
    expect(midiSetup?.inputs).toHaveLength(2);
    expect(midiSetup?.inputs[0]).toEqual({
      name: "Launchpad",
      identifier: "in-1",
      enabled: true,
    });
    expect(midiSetup?.outputs[0].isDefault).toBe(true);
    expect(midiSetup?.defaultOutputId).toBe("out-1");
  });

  it("empty device arrays hydrate as empty (honest 'no devices' state)", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiSetup: { inputs: [], outputs: [], defaultOutputId: "" },
    });
    const { midiSetup } = useHostExtrasStore.getState();
    expect(midiSetup).not.toBeNull();
    expect(midiSetup?.inputs).toEqual([]);
    expect(midiSetup?.outputs).toEqual([]);
    expect(midiSetup?.defaultOutputId).toBe("");
  });

  it("drops device rows missing an identifier", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiSetup: {
        inputs: [
          { name: "Good", identifier: "in-1", enabled: true },
          // bad row — no identifier; must be filtered out
          { name: "Bad", enabled: true },
        ],
        outputs: [],
        defaultOutputId: "",
      },
    });
    const { midiSetup } = useHostExtrasStore.getState();
    expect(midiSetup?.inputs).toHaveLength(1);
    expect(midiSetup?.inputs[0].identifier).toBe("in-1");
  });

  it("null midiSetup does not overwrite the previous snapshot", () => {
    useHostExtrasStore.getState().hydrateFromSnapshot({
      midiSetup: {
        inputs: [{ name: "Launchpad", identifier: "in-1", enabled: true }],
        outputs: [],
        defaultOutputId: "",
      },
    });
    // A later snapshot with no midiSetup must preserve the prior one.
    useHostExtrasStore.getState().hydrateFromSnapshot({});
    expect(useHostExtrasStore.getState().midiSetup?.inputs).toHaveLength(1);
  });
});

describe("useHostExtrasStore.setLogLines", () => {
  beforeEach(reset);

  it("sets log lines", () => {
    useHostExtrasStore.getState().setLogLines(["line A", "line B"]);
    expect(useHostExtrasStore.getState().logLines).toEqual(["line A", "line B"]);
  });

  it("clears log lines with empty array", () => {
    useHostExtrasStore.setState({ logLines: ["old"] } as never);
    useHostExtrasStore.getState().setLogLines([]);
    expect(useHostExtrasStore.getState().logLines).toEqual([]);
  });

  it("makes a copy — mutating input does not affect store", () => {
    const lines = ["a", "b"];
    useHostExtrasStore.getState().setLogLines(lines);
    lines.push("c");
    expect(useHostExtrasStore.getState().logLines).toHaveLength(2);
  });
});
