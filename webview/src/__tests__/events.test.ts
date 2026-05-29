// Tests for events.ts — validate constant values haven't drifted
import { describe, it, expect } from "vitest";
import {
  EV_FIT_BOARD,
  EV_CREATE_COMMENT,
  EV_OPEN_PREFERENCES,
  EV_START_RENAME,
} from "../events";

describe("events constants", () => {
  it("EV_FIT_BOARD has expected value", () => {
    expect(EV_FIT_BOARD).toBe("element:fit-board");
  });

  it("EV_CREATE_COMMENT has expected value", () => {
    expect(EV_CREATE_COMMENT).toBe("element:create-comment");
  });

  it("EV_OPEN_PREFERENCES has expected value", () => {
    expect(EV_OPEN_PREFERENCES).toBe("element:open-preferences");
  });

  it("EV_START_RENAME has expected value", () => {
    expect(EV_START_RENAME).toBe("element:start-rename");
  });

  it("all event names share the element: namespace prefix", () => {
    const events = [EV_FIT_BOARD, EV_CREATE_COMMENT, EV_OPEN_PREFERENCES, EV_START_RENAME];
    for (const ev of events) {
      expect(ev).toMatch(/^element:/);
    }
  });

  it("all event names are distinct", () => {
    const events = [EV_FIT_BOARD, EV_CREATE_COMMENT, EV_OPEN_PREFERENCES, EV_START_RENAME];
    const unique = new Set(events);
    expect(unique.size).toBe(events.length);
  });
});
