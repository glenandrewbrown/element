/**
 * Tests for lib/snippetDrag — the DROP-SIDE helper (`isSnippetDrag`) added for
 * the GraphCanvas drop target (Wave-2 D, Item 4a-iii). The serialize/parse pair
 * is owned + tested by the C-worker (drag source); this file only covers the
 * additive `isSnippetDrag` dragover guard so the drop target's accept-decision
 * is verified without a redundant rewrite of the shared contract tests.
 */

import { describe, expect, it } from "vitest";
import {
  SNIPPET_DRAG_TYPE,
  isSnippetDrag,
  parseSnippetDrop,
  setSnippetDragData,
} from "../snippetDrag";

/** Minimal in-memory DataTransfer stand-in with a live `types` getter. */
function fakeDataTransfer(initial: Record<string, string> = {}): DataTransfer {
  const store = new Map<string, string>(Object.entries(initial));
  const dt = {
    get types(): readonly string[] {
      return Array.from(store.keys());
    },
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, val: string) => {
      store.set(type, val);
    },
    effectAllowed: "none" as string,
  };
  return dt as unknown as DataTransfer;
}

describe("snippetDrag — drop-side isSnippetDrag", () => {
  it("returns true when the snippet MIME is present in types", () => {
    const dt = fakeDataTransfer({ [SNIPPET_DRAG_TYPE]: '{"name":"Reverb Bus"}' });
    expect(isSnippetDrag(dt)).toBe(true);
  });

  it("returns false for a foreign drag (text/plain only)", () => {
    const dt = fakeDataTransfer({ "text/plain": "hello" });
    expect(isSnippetDrag(dt)).toBe(false);
  });

  it("returns false for a null/absent dataTransfer (synthetic events)", () => {
    expect(isSnippetDrag(null)).toBe(false);
    expect(isSnippetDrag(undefined)).toBe(false);
  });

  it("round-trips with setSnippetDragData + parseSnippetDrop", () => {
    const dt = fakeDataTransfer();
    setSnippetDragData(dt, { name: "Sidechain Comp" });
    expect(isSnippetDrag(dt)).toBe(true);
    expect(parseSnippetDrop(dt)).toEqual({ name: "Sidechain Comp" });
  });
});
