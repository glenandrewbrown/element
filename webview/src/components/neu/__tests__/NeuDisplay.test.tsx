import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NeuDisplay } from "../NeuDisplay";

describe("<NeuDisplay />", () => {
  it("renders children", () => {
    render(<NeuDisplay>440 Hz</NeuDisplay>);
    expect(screen.getByText("440 Hz")).toBeInTheDocument();
  });

  it("renders without children (empty readout)", () => {
    const { container } = render(<NeuDisplay />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("applies neu-inset class for inset shadow", () => {
    const { container } = render(<NeuDisplay />);
    expect((container.firstChild as HTMLElement).className).toContain(
      "neu-inset",
    );
  });

  it("applies bg-pressed for dark recessed appearance", () => {
    const { container } = render(<NeuDisplay />);
    expect((container.firstChild as HTMLElement).className).toContain(
      "bg-pressed",
    );
  });

  it("merges extra className (e.g. width/height)", () => {
    const { container } = render(<NeuDisplay className="w-24 h-8" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-24");
    expect(el.className).toContain("h-8");
  });

  it("renders numeric ReactNode children", () => {
    render(<NeuDisplay>{127}</NeuDisplay>);
    expect(screen.getByText("127")).toBeInTheDocument();
  });

  it("renders complex children (meter bar)", () => {
    render(
      <NeuDisplay>
        <div data-testid="meter" />
      </NeuDisplay>,
    );
    expect(screen.getByTestId("meter")).toBeInTheDocument();
  });
});
