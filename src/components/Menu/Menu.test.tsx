import { useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu } from "./Menu";

function TestHarness({ onSelect }: { onSelect: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  // `open` must be real state wired to `onClose`, matching how every
  // real call site uses Popover/Menu — a hardcoded `open` prop would
  // never unmount even if the outside-click handler misfires, which
  // would hide exactly the bug this test exists to catch.
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button ref={anchorRef}>Open</button>
      <Menu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        items={[{ id: "play", label: "Play", onSelect }]}
      />
    </div>
  );
}

function ThreeItemHarness() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button ref={anchorRef}>Open</button>
      <Menu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        items={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
        ]}
      />
    </div>
  );
}

describe("Menu", () => {
  it("fires an item's onSelect when clicked, instead of the popover's outside-click handler swallowing it first", async () => {
    // Regression test: Popover's outside-click check only looked at the
    // anchor, never its own portaled content, so a pointerdown on any
    // menu item closed the menu before its onClick ever ran.
    const onSelect = vi.fn();
    render(<TestHarness onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("menuitem", { name: "Play" }));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("moves focus to the first item as soon as it opens, so arrow keys work immediately", () => {
    // Regression test: focus previously stayed on the trigger button
    // after opening, so ArrowDown/ArrowUp did nothing until the user
    // manually Tabbed or clicked into an item first.
    render(<ThreeItemHarness />);

    expect(screen.getByRole("menuitem", { name: "A" })).toHaveFocus();
  });

  it("wraps to the last item on ArrowUp from the first item", async () => {
    // Regression test: the wrap-around formula's implicit handling of
    // "nothing focused yet" (index -1) landed ArrowUp on the
    // second-to-last item instead of the last one.
    render(<ThreeItemHarness />);
    const user = userEvent.setup();

    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("menuitem", { name: "C" })).toHaveFocus();
  });

  it("wraps to the first item on ArrowDown from the last item", async () => {
    render(<ThreeItemHarness />);
    const user = userEvent.setup();

    await user.keyboard("{ArrowUp}"); // A -> C (last)
    await user.keyboard("{ArrowDown}"); // C -> A (wraps)

    expect(screen.getByRole("menuitem", { name: "A" })).toHaveFocus();
  });
});
