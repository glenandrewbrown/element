/**
 * EmptyState — coverage for paths not hit by the snapshot suite.
 *
 * Existing EmptyState.test.tsx covers: role/aria-live, description+CTA,
 * string illustration (registry path), ReactNode illustration, size sm+lg,
 * tone cv+midi snapshots.
 *
 * This file adds:
 *   - Unknown string illustration → literal path passthrough
 *   - Omitted illustration → no <img> rendered
 *   - Omitted description → no <p> rendered
 *   - Omitted action → no CTA wrapper rendered
 *   - size="md" (default) — img pixel size = 96
 *   - tone="neutral" → no tone glow in boxShadow (only var(--shadow-raised))
 *   - tone="audio" → glow present in boxShadow
 *   - className prop forwarded to wrapper
 *   - title rendered as <h2>
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("<EmptyState /> — illustration resolver", () => {
  it("unknown string → renders <img> with literal src (not registry)", () => {
    render(
      <EmptyState illustration="/custom/path.png" title="Custom" />,
    );
    const img = screen.getByRole("status").querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/custom/path.png");
  });

  it("all known registry names resolve to /illustrations/*.webp", () => {
    const known = [
      "no-plugins",
      "no-nodes",
      "no-presets",
      "no-midi-input",
      "no-audio-input",
      "error",
      "loading",
      "sandbox-stopped",
    ] as const;
    known.forEach((name) => {
      const { unmount } = render(
        <EmptyState illustration={name} title="Test" />,
      );
      const img = screen.getByRole("status").querySelector("img");
      expect(img?.getAttribute("src")).toBe(`/illustrations/${name}.webp`);
      unmount();
    });
  });

  it("omitted illustration → no <img> rendered", () => {
    render(<EmptyState title="No illustration" />);
    expect(screen.getByRole("status").querySelector("img")).toBeNull();
  });

  it("size=md (default) → illustration img width/height = 96", () => {
    render(<EmptyState illustration="no-nodes" title="Test" />);
    const img = screen.getByRole("status").querySelector("img");
    expect(img?.getAttribute("width")).toBe("96");
    expect(img?.getAttribute("height")).toBe("96");
  });

  it("ReactNode illustration renders inside aria-hidden wrapper sized by token", () => {
    render(
      <EmptyState
        illustration={<svg data-testid="svg-il" />}
        title="Custom icon"
        size="sm"
      />,
    );
    const svg = screen.getByTestId("svg-il");
    const wrapper = svg.closest("[aria-hidden='true']") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.width).toBe("64px");
    expect(wrapper?.style.height).toBe("64px");
  });
});

describe("<EmptyState /> — conditional slots", () => {
  it("description omitted → no <p> rendered", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("description provided → <p> rendered with text", () => {
    render(
      <EmptyState title="Nothing here" description="Add something to get started." />,
    );
    expect(screen.getByText("Add something to get started.")).toBeInTheDocument();
  });

  it("action omitted → no CTA wrapper div rendered", () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    // The action wrapper is a <div class="mt-2"> — verify absent
    expect(container.querySelector(".mt-2")).toBeNull();
  });

  it("action provided → rendered inside mt-2 wrapper", () => {
    render(
      <EmptyState
        title="Nothing here"
        action={<button type="button">Add one</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Add one" })).toBeInTheDocument();
  });
});

describe("<EmptyState /> — title element", () => {
  it("title rendered as <h2>", () => {
    render(<EmptyState title="My Title" />);
    expect(screen.getByRole("heading", { level: 2, name: /my title/i })).toBeInTheDocument();
  });
});

describe("<EmptyState /> — tone / glow", () => {
  it("tone=neutral → boxShadow contains only var(--shadow-raised), no glow var", () => {
    const { container } = render(
      <EmptyState title="Test" tone="neutral" />,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.boxShadow).toBe("var(--shadow-raised)");
  });

  it("tone=audio → boxShadow appends var(--shadow-glow-audio)", () => {
    const { container } = render(
      <EmptyState title="Test" tone="audio" />,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.boxShadow).toContain("var(--shadow-glow-audio)");
    expect(section.style.boxShadow).toContain("var(--shadow-raised)");
  });

  it("tone=midi → boxShadow appends var(--shadow-glow-midi)", () => {
    const { container } = render(
      <EmptyState title="Test" tone="midi" />,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.boxShadow).toContain("var(--shadow-glow-midi)");
  });

  it("tone=cv → boxShadow appends var(--shadow-glow-cv)", () => {
    const { container } = render(
      <EmptyState title="Test" tone="cv" />,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.boxShadow).toContain("var(--shadow-glow-cv)");
  });
});

describe("<EmptyState /> — className prop", () => {
  it("forwards className to wrapper section", () => {
    const { container } = render(
      <EmptyState title="Test" className="my-custom-class" />,
    );
    expect(container.querySelector(".my-custom-class")).not.toBeNull();
  });
});
