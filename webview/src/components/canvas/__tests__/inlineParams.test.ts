/**
 * T5 — inline-face registry resolution + validation.
 *
 * Guards the NOTHING-fake contract: a curated face binds controls only to real
 * params, and ANY name mismatch / missing param rejects the WHOLE face (caller
 * falls back to the generic deck — never a half-broken face).
 */

import { describe, expect, it } from "vitest";
import type { NodeParameterRow } from "../../../bridge/nativeGraph";
import {
  getInlineFaceSpec,
  validateInlineFace,
  faceNeedsParamMeta,
  INLINE_FACE_REGISTRY,
  type InlineFaceSpec,
} from "../inlineParams";

function param(
  index: number,
  name: string,
  extra: Partial<NodeParameterRow> = {},
): NodeParameterRow {
  return { index, name, value: 0.5, defaultValue: 0.5, ...extra };
}

describe("inlineParams registry", () => {
  it("resolves element.compare to an opChooser face (chooser-only)", () => {
    const spec = getInlineFaceSpec("element.compare");
    expect(spec).toBeDefined();
    expect(spec!.entries).toHaveLength(1);
    expect(spec!.entries[0].kind).toBe("opChooser");
  });

  it("element.compare chooser carries the engine-verified 6 ops in order", () => {
    const spec = getInlineFaceSpec("element.compare")!;
    const entry = spec.entries[0];
    expect(entry.kind).toBe("opChooser");
    if (entry.kind !== "opChooser") return;
    expect(entry.options.map((o) => o.label)).toEqual([
      ">",
      ">=",
      "<",
      "<=",
      "==",
      "!=",
    ]);
    expect(entry.options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("element.logic chooser carries AND/OR/XOR/NAND/NOR/NOT (incl. real NOT)", () => {
    const spec = getInlineFaceSpec("element.logic")!;
    const entry = spec.entries[0];
    expect(entry.kind).toBe("opChooser");
    if (entry.kind !== "opChooser") return;
    expect(entry.options.map((o) => o.label)).toEqual([
      "AND",
      "OR",
      "XOR",
      "NAND",
      "NOR",
      "NOT",
    ]);
    expect(entry.options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("returns undefined for unknown / third-party identifiers", () => {
    expect(getInlineFaceSpec("element.unknown")).toBeUndefined();
    expect(getInlineFaceSpec("VST3-12345")).toBeUndefined();
    expect(getInlineFaceSpec(undefined)).toBeUndefined();
  });

  it("only first-wave honest faces are registered (no fabricated param faces)", () => {
    expect(Object.keys(INLINE_FACE_REGISTRY).sort()).toEqual([
      "element.compare",
      "element.logic",
    ]);
  });
});

describe("faceNeedsParamMeta", () => {
  it("is false for chooser-only faces (no metadata round-trip)", () => {
    expect(faceNeedsParamMeta(getInlineFaceSpec("element.compare")!)).toBe(false);
    expect(faceNeedsParamMeta(getInlineFaceSpec("element.logic")!)).toBe(false);
  });

  it("is true when the face contains a knob/toggle entry", () => {
    const spec: InlineFaceSpec = {
      entries: [{ kind: "knob", paramIndex: 0, expectName: "Gain" }],
    };
    expect(faceNeedsParamMeta(spec)).toBe(true);
  });
});

describe("validateInlineFace", () => {
  it("passes chooser-only faces with NO metadata", () => {
    expect(validateInlineFace(getInlineFaceSpec("element.compare")!, [])).toBe(
      true,
    );
  });

  it("passes a knob face when the real param name matches expectName", () => {
    const spec: InlineFaceSpec = {
      entries: [{ kind: "knob", paramIndex: 1, expectName: "Gain" }],
    };
    expect(validateInlineFace(spec, [param(0, "Mix"), param(1, "Gain dB")])).toBe(
      true,
    );
  });

  it("matches expectName as a RegExp", () => {
    const spec: InlineFaceSpec = {
      entries: [{ kind: "knob", paramIndex: 0, expectName: /^cutoff/i }],
    };
    expect(validateInlineFace(spec, [param(0, "Cutoff Freq")])).toBe(true);
    expect(validateInlineFace(spec, [param(0, "Resonance")])).toBe(false);
  });

  it("REJECTS the whole face on a name mismatch (fall back to generic deck)", () => {
    const spec: InlineFaceSpec = {
      entries: [
        { kind: "knob", paramIndex: 0, expectName: "Gain" },
        { kind: "knob", paramIndex: 1, expectName: "Mix" },
      ],
    };
    // index 1 is "Drive", not "Mix" → entire face rejected.
    expect(
      validateInlineFace(spec, [param(0, "Gain"), param(1, "Drive")]),
    ).toBe(false);
  });

  it("REJECTS when a bound param index is absent", () => {
    const spec: InlineFaceSpec = {
      entries: [{ kind: "toggle", paramIndex: 5, expectName: "Sync" }],
    };
    expect(validateInlineFace(spec, [param(0, "Sync")])).toBe(false);
    expect(validateInlineFace(spec, [])).toBe(false);
  });

  it("does not require metadata for opChooser entries mixed with valid knobs", () => {
    const spec: InlineFaceSpec = {
      entries: [
        { kind: "opChooser", title: "Mode", options: [{ value: 0, label: "A" }] },
        { kind: "knob", paramIndex: 0, expectName: "Rate" },
      ],
    };
    expect(validateInlineFace(spec, [param(0, "Rate Hz")])).toBe(true);
    expect(validateInlineFace(spec, [param(0, "Depth")])).toBe(false);
  });
});
