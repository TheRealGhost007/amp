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
});
