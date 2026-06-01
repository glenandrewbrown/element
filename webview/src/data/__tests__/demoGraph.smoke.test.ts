/**
 * demoGraph — structure smoke tests.
 *
 * Verifies the export has the expected shape so a refactor or accidental
 * deletion is caught before it silently breaks the dev-server demo seed.
 */

import { describe, it, expect } from "vitest";
import { demoGraph } from "../demoGraph";

describe("demoGraph — export shape", () => {
  it("has a blocks array", () => {
    expect(Array.isArray(demoGraph.blocks)).toBe(true);
    expect(demoGraph.blocks.length).toBeGreaterThan(0);
  });

  it("has a cables array", () => {
    expect(Array.isArray(demoGraph.cables)).toBe(true);
  });

  it("has a commentBoxes array", () => {
    expect(Array.isArray(demoGraph.commentBoxes)).toBe(true);
  });

  it("every block has required fields", () => {
    for (const block of demoGraph.blocks) {
      expect(typeof block.id).toBe("string");
      expect(block.id.length).toBeGreaterThan(0);
      expect(typeof block.name).toBe("string");
      expect(typeof block.category).toBe("string");
      expect(typeof block.position).toBe("object");
      expect(typeof block.position.x).toBe("number");
      expect(typeof block.position.y).toBe("number");
      expect(Array.isArray(block.ports)).toBe(true);
    }
  });

  it("every cable has required fields", () => {
    for (const cable of demoGraph.cables) {
      expect(typeof cable.id).toBe("string");
      expect(typeof cable.source).toBe("string");
      expect(typeof cable.target).toBe("string");
      expect(typeof cable.signalType).toBe("string");
    }
  });

  it("cable source/target ids reference existing blocks", () => {
    const blockIds = new Set(demoGraph.blocks.map((b) => b.id));
    for (const cable of demoGraph.cables) {
      expect(blockIds.has(cable.source), `cable ${cable.id} source "${cable.source}" unknown`).toBe(true);
      expect(blockIds.has(cable.target), `cable ${cable.id} target "${cable.target}" unknown`).toBe(true);
    }
  });

  it("block ids are unique", () => {
    const ids = demoGraph.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cable ids are unique", () => {
    const ids = demoGraph.cables.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("demoGraph — macros and scenes (optional fields)", () => {
  it("macros is an array when present", () => {
    if (demoGraph.macros !== undefined) {
      expect(Array.isArray(demoGraph.macros)).toBe(true);
    }
  });

  it("scenes is an array when present", () => {
    if (demoGraph.scenes !== undefined) {
      expect(Array.isArray(demoGraph.scenes)).toBe(true);
    }
  });
});
