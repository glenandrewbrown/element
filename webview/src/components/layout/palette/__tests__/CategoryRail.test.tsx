/**
 * CategoryRail — V2 (Category-Led) nav rail.
 *
 * Verifies the rail emits the right RailSelection for each entry, shows live
 * counts, reflects the active state, disables Fav/Recent when empty, and routes
 * the Projects entry to the tab switch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryRail, type RailSelection } from "../CategoryRail";

const counts = {
  all: 248,
  byCategory: { instrument: 42, audiofx: 147, midifx: 19, modulator: 40 },
  favourites: 12,
};

function setup(overrides?: Partial<Parameters<typeof CategoryRail>[0]>) {
  const onSelect = vi.fn<(s: RailSelection) => void>();
  const onSelectProjects = vi.fn();
  render(
    <CategoryRail
      activeTab="plugins"
      activeCategory={null}
      favouritesOnly={false}
      recentSort={false}
      counts={counts}
      hasFavourites
      hasRecents
      onSelect={onSelect}
      onSelectProjects={onSelectProjects}
      {...overrides}
    />,
  );
  return { onSelect, onSelectProjects };
}

describe("<CategoryRail />", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders All + 4 category entries + Fav + Recent + Projects", () => {
    setup();
    expect(screen.getByRole("button", { name: "All Blocks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "INST Blocks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MIDI Blocks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "FX Blocks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MOD Blocks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favourites only" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Most recently used first" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
  });

  it("shows the live counts on the badges", () => {
    setup();
    expect(screen.getByText("248")).toBeInTheDocument(); // All
    expect(screen.getByText("147")).toBeInTheDocument(); // FX
    expect(screen.getByText("12")).toBeInTheDocument(); // Fav
  });

  it("emits the matching RailSelection for each entry", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: "All Blocks" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "all" });
    fireEvent.click(screen.getByRole("button", { name: "FX Blocks" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "category", category: "audiofx" });
    fireEvent.click(screen.getByRole("button", { name: "Favourites only" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "favourites" });
    fireEvent.click(screen.getByRole("button", { name: "Most recently used first" }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "recents" });
  });

  it("routes the Projects entry to onSelectProjects", () => {
    const { onSelectProjects } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(onSelectProjects).toHaveBeenCalledTimes(1);
  });

  it("marks the active category aria-pressed", () => {
    setup({ activeCategory: "audiofx" });
    expect(screen.getByRole("button", { name: "FX Blocks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All Blocks" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("disables Fav / Recent when there is nothing to filter to", () => {
    setup({ hasFavourites: false, hasRecents: false });
    expect(screen.getByRole("button", { name: "Favourites only" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Most recently used first" }),
    ).toBeDisabled();
  });

  it("ALL is active only when no category/fav/recent is set", () => {
    setup();
    expect(screen.getByRole("button", { name: "All Blocks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
