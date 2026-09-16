import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMetadataEditDialogStore } from "./metadataEditDialogStore";

describe("metadataEditDialogStore", () => {
  beforeEach(() => {
    useMetadataEditDialogStore.setState({ trackId: null, onSaved: null });
  });

  it("open sets the track id and stores the onSaved callback", () => {
    const onSaved = vi.fn();

    useMetadataEditDialogStore.getState().open(7, onSaved);

    expect(useMetadataEditDialogStore.getState().trackId).toBe(7);
    expect(useMetadataEditDialogStore.getState().onSaved).toBe(onSaved);
  });

  it("open without an onSaved callback clears any previous one", () => {
    useMetadataEditDialogStore.getState().open(1, vi.fn());

    useMetadataEditDialogStore.getState().open(2);

    expect(useMetadataEditDialogStore.getState().trackId).toBe(2);
    expect(useMetadataEditDialogStore.getState().onSaved).toBeNull();
  });

  it("close clears both the track id and the callback", () => {
    useMetadataEditDialogStore.getState().open(3, vi.fn());

    useMetadataEditDialogStore.getState().close();

    expect(useMetadataEditDialogStore.getState().trackId).toBeNull();
    expect(useMetadataEditDialogStore.getState().onSaved).toBeNull();
  });
});
