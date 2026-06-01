import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@xyflow/react", () => ({}));

import { CommentFrame } from "../CommentFrame";
import type { NodeProps } from "@xyflow/react";

function makeProps(data: Record<string, unknown> = {}): NodeProps {
  return {
    id: "comment-1",
    type: "comment",
    data,
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 200,
    height: 150,
  } as NodeProps;
}

describe("CommentFrame", () => {
  it("renders the label", () => {
    render(<CommentFrame {...makeProps({ label: "Drum Bus", color: "#4A90D9" })} />);
    expect(screen.getByText("Drum Bus")).toBeInTheDocument();
  });

  it("falls back to 'Comment' when no label provided", () => {
    render(<CommentFrame {...makeProps({ color: "#4A90D9" })} />);
    expect(screen.getByText("Comment")).toBeInTheDocument();
  });

  it("falls back to 'Comment' when label is empty string", () => {
    render(<CommentFrame {...makeProps({ label: "", color: "#4A90D9" })} />);
    expect(screen.getByText("Comment")).toBeInTheDocument();
  });

  it("applies the color as border", () => {
    const { container } = render(
      <CommentFrame {...makeProps({ label: "FX Chain", color: "#E8A838" })} />
    );
    const outer = container.firstChild as HTMLElement;
    // jsdom normalises hex → rgb() in shorthand border; match either form
    expect(outer.style.border).toMatch(/#E8A838|rgb\(232,\s*168,\s*56\)/i);
  });

  it("prepends # when color lacks it", () => {
    const { container } = render(
      <CommentFrame {...makeProps({ label: "Zone", color: "2BC4C4" })} />
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.border).toMatch(/#2BC4C4|rgb\(43,\s*196,\s*196\)/i);
  });

  it("falls back to default color when no color given", () => {
    const { container } = render(
      <CommentFrame {...makeProps({ label: "Zone" })} />
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.border).toMatch(/#4a4a52|rgb\(74,\s*74,\s*82\)/i);
  });

  it("renders inner spacer div", () => {
    const { container } = render(
      <CommentFrame {...makeProps({ label: "Test" })} />
    );
    const divs = container.querySelectorAll("div");
    expect(divs.length).toBeGreaterThanOrEqual(3);
  });
});
