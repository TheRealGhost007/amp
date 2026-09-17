import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("Escape closes an open dialog", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Edit Track">
        <p>body</p>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape on a dialog opened on top of another only closes the topmost one", () => {
    // Regression test: every open Dialog used to register its own
    // independent document-level Escape listener with no awareness of
    // any other one. MetadataEditDialog and ConfirmDialog can both be
    // open at once (clicking "Save" opens a confirmation on top of the
    // still-open editor) — pressing Escape to dismiss just the
    // confirmation used to also close the editor underneath, discarding
    // unsaved edits.
    const onCloseEditor = vi.fn();
    const onCloseConfirm = vi.fn();
    const { rerender } = render(
      <>
        <Dialog open onClose={onCloseEditor} title="Edit Track">
          <p>editor</p>
        </Dialog>
      </>,
    );

    // The confirmation dialog opens on top, same as clicking "Save"
    // would in the real app.
    rerender(
      <>
        <Dialog open onClose={onCloseEditor} title="Edit Track">
          <p>editor</p>
        </Dialog>
        <Dialog open onClose={onCloseConfirm} title="Save Metadata Changes?">
          <p>confirm</p>
        </Dialog>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseConfirm).toHaveBeenCalledOnce();
    expect(onCloseEditor).not.toHaveBeenCalled();
  });

  it("closing the topmost dialog returns Escape handling to the one still open beneath it", () => {
    const onCloseEditor = vi.fn();
    const onCloseConfirm = vi.fn();

    function Harness() {
      return (
        <>
          <Dialog open onClose={onCloseEditor} title="Edit Track">
            <p>editor</p>
          </Dialog>
          <Dialog open={false} onClose={onCloseConfirm} title="Save Metadata Changes?">
            <p>confirm</p>
          </Dialog>
        </>
      );
    }
    render(<Harness />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseEditor).toHaveBeenCalledOnce();
  });

  it("clicking the close button always closes its own dialog regardless of stacking", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Edit Track">
        <p>body</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
