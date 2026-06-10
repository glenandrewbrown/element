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

// ── T19 / V2: inline ★ favourite toggle + drag source ───────────────────────
describe("PluginCard — inline favourite + drag (V2)", () => {
  it("renders a clickable ★ that toggles favourite without selecting/adding", () => {
    const onToggleFavourite = vi.fn();
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(
      <PluginCard
        plugin={solo}
        view="list"
        selected={false}
        isFavourite={false}
        onSelect={onSelect}
        onAdd={onAdd}
        onToggleFavourite={onToggleFavourite}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add to favourites/i }));
    expect(onToggleFavourite).toHaveBeenCalledTimes(1);
    // The star is its own button — clicking it must NOT add or select.
    expect(onAdd).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the favourited state + 'remove' affordance when isFavourite", () => {
    render(
      <PluginCard
        plugin={solo}
        view="list"
        selected={false}
        isFavourite
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onToggleFavourite={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /remove from favourites/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the vendor column when showVendor is set", () => {
    render(
      <PluginCard
        plugin={{ ...solo, manufacturer: "FabFilter" }}
        view="list"
        selected={false}
        isFavourite={false}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        showVendor
      />,
    );
    expect(screen.getByText("FabFilter")).toBeInTheDocument();
  });

  it("is an HTML5 drag source carrying the plugin identifier", () => {
    render(
      <PluginCard
        plugin={solo}
        view="list"
        selected={false}
        isFavourite={false}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    const row = screen.getByRole("button", { name: /Solo/i });
    expect(row).toHaveAttribute("draggable", "true");

    // Fire a dragstart and assert the pluginDrag payload was written.
    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => {
        store[k] = v;
      },
      getData: (k: string) => store[k] ?? "",
      effectAllowed: "none",
    };
    fireEvent.dragStart(row, { dataTransfer });
    expect(store["application/x-element-plugin"]).toContain("vst3:Solo");
  });
});
