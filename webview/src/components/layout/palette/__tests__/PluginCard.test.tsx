/**
 * PluginCard — N2 "also available as AU" reveal.
 *
 * Covers:
 *   - a single-variant plugin shows NO reveal affordance;
 *   - a multi-variant family shows the reveal; opening it lists the OTHER
 *     formats (not the shown primary);
 *   - selecting the AU variant calls onAddVariant with the AU's REAL identifier
 *     (not the VST3 primary id) — so the user gets the AU they asked for.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PluginCard } from "../PluginCard";
import type { PluginEntry } from "../usePaletteFilters";

const family: PluginEntry = {
  id: "vst3:BigVerb",
  name: "BigVerb",
  description: "",
  category: "audiofx",
  format: "VST3",
  variants: [
    { format: "VST3", identifier: "vst3:BigVerb" },
    { format: "AudioUnit", identifier: "au:BigVerb" },
  ],
};

const solo: PluginEntry = {
  id: "vst3:Solo",
  name: "Solo",
  description: "",
  category: "audiofx",
  format: "VST3",
  variants: [{ format: "VST3", identifier: "vst3:Solo" }],
};

function renderCard(plugin: PluginEntry, onAddVariant = vi.fn()) {
  render(
    <PluginCard
      plugin={plugin}
      view="list"
      selected={false}
      isFavourite={false}
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onAddVariant={onAddVariant}
    />,
  );
  return { onAddVariant };
}

describe("PluginCard — N2 variant reveal", () => {
  it("shows no reveal for a single-variant plugin", () => {
    renderCard(solo);
    expect(screen.queryByLabelText(/other formats/i)).toBeNull();
  });

  it("shows the reveal for a multi-variant family", () => {
    renderCard(family);
    expect(screen.getByLabelText(/other formats: AU/i)).toBeTruthy();
  });

  it("inserts the AU variant using the AU's REAL identifier", () => {
    const { onAddVariant } = renderCard(family);
    // Open the reveal (the "+1" chevron toggle).
    fireEvent.click(screen.getByLabelText(/other formats: AU/i));
    // Click the AU "Add as" entry.
    fireEvent.click(screen.getByTitle(/add the AU variant/i));
    expect(onAddVariant).toHaveBeenCalledTimes(1);
    expect(onAddVariant).toHaveBeenCalledWith("au:BigVerb");
  });

  it("does not render the reveal when onAddVariant is omitted", () => {
    render(
      <PluginCard
        plugin={family}
        view="list"
        selected={false}
        isFavourite={false}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/other formats/i)).toBeNull();
  });
});
