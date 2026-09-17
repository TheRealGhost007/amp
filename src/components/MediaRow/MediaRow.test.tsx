import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaRow } from "./MediaRow";

describe("MediaRow", () => {
  // Regression context: MediaRow used to be a real <button> that also
  // contained two independently-focusable role="button" spans (the
  // favorite toggle, the "..." menu trigger) — interactive content
  // nested inside a native <button> is invalid HTML and risks those
  // inner controls not being reachable/announced correctly by assistive
  // tech. It's now a role="button" div with Enter/Space wired up
  // manually; these tests confirm that still behaves like a real button
  // for anyone driving it by keyboard.

  it("clicking the row activates onClick", () => {
    const onClick = vi.fn();
    render(<MediaRow artworkSeed="seed" title="Track" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("pressing Enter on the row activates onClick, like a real button", () => {
    const onClick = vi.fn();
    render(<MediaRow artworkSeed="seed" title="Track" onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Track" }), { key: "Enter" });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("pressing Space on the row activates onClick, like a real button", () => {
    const onClick = vi.fn();
    render(<MediaRow artworkSeed="seed" title="Track" onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Track" }), { key: " " });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("the row is reachable via Tab", () => {
    render(<MediaRow artworkSeed="seed" title="Track" onClick={() => {}} />);

    expect(screen.getByRole("button", { name: "Track" })).toHaveAttribute(
      "tabIndex",
      "0",
    );
  });

  it("activating the favorite toggle does not also activate the row's own onClick", () => {
    const onClick = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <MediaRow
        artworkSeed="seed"
        title="Track"
        onClick={onClick}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));

    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("activating the favorite toggle by keyboard does not also activate the row's own onClick", () => {
    const onClick = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <MediaRow
        artworkSeed="seed"
        title="Track"
        onClick={onClick}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Add to favorites" }), {
      key: "Enter",
    });

    expect(onToggleFavorite).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
