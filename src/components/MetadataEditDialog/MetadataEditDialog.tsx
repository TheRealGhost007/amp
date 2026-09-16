import { useCallback, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useLibrary } from "../../context/LibraryContext";
import {
  metadata as metadataApi,
  type ArtworkUpdateInput,
  type TrackListItem,
} from "../../lib/ipc";
import { useConfirmDialogStore } from "../../store/confirmDialogStore";
import { Artwork } from "../Artwork/Artwork";
import { Button } from "../Button/Button";
import { Dialog } from "../Dialog/Dialog";
import { Input } from "../Input/Input";
import { useToast } from "../Toast/Toast";
import "./MetadataEditDialog.css";

interface MetadataEditDialogProps {
  open: boolean;
  trackId: number | null;
  onSaved?: () => void;
  onClose: () => void;
}

interface FormState {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  trackNumber: string;
  discNumber: string;
  year: string;
  artwork: ArtworkUpdateInput;
}

function emptyForm(): FormState {
  return {
    title: "",
    artist: "",
    album: "",
    albumArtist: "",
    genre: "",
    trackNumber: "",
    discNumber: "",
    year: "",
    artwork: { type: "Unchanged" },
  };
}

function formFromTrack(track: TrackListItem): FormState {
  return {
    title: track.title,
    artist: track.artist_name ?? "",
    album: track.album_title ?? "",
    albumArtist: track.album_artist ?? "",
    genre: track.genre_name ?? "",
    trackNumber: track.track_number?.toString() ?? "",
    discNumber: track.disc_number?.toString() ?? "",
    year: track.year?.toString() ?? "",
    artwork: { type: "Unchanged" },
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Failed to update metadata.";
}

/** Spec §10/§37: edits title/artist/album/album artist/genre/year/track/
 * disc/artwork and writes them to the actual file via `lofty`, but only
 * after the shared destructive-action confirmation — this is the one
 * dialog in the app that overwrites a file on disk, not just DB rows.
 * Mounted once globally (`GlobalDialogs.tsx`), like `AddToPlaylistDialog`. */
export function MetadataEditDialog({
  open,
  trackId,
  onSaved,
  onClose,
}: MetadataEditDialogProps) {
  const { tracks, refresh } = useLibrary();
  const track = tracks.find((t) => t.id === trackId) ?? null;
  const confirm = useConfirmDialogStore((s) => s.confirm);
  const { show } = useToast();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadedForId, setLoadedForId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Render-time reset (same pattern as `LibraryContext`/`PlaylistDetail`):
  // re-derive the form whenever a *different* track's dialog opens,
  // rather than a useEffect-based state write.
  if (track && loadedForId !== track.id) {
    setForm(formFromTrack(track));
    setLoadedForId(track.id);
  } else if (!track && loadedForId !== null) {
    setLoadedForId(null);
  }

  async function handlePickArtwork() {
    const selected = await openFileDialog({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setForm((f) => ({ ...f, artwork: { type: "Replace", path: selected } }));
  }

  function handleRemoveArtwork() {
    setForm((f) => ({ ...f, artwork: { type: "Remove" } }));
  }

  function handleReset() {
    if (track) setForm(formFromTrack(track));
  }

  // `Dialog`'s focus-trap effect keys off this identity (see its own
  // `useEffect` deps) — a fresh closure every render would re-trigger
  // that effect on every keystroke in this form, yanking focus back to
  // the dialog's close button after each typed character.
  const handleClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [saving, onClose]);

  async function doSave(title: string) {
    if (!track) return;
    setSaving(true);
    try {
      await metadataApi.update(track.id, {
        title,
        artist: form.artist.trim() || null,
        album: form.album.trim() || null,
        album_artist: form.albumArtist.trim() || null,
        genre: form.genre.trim() || null,
        track_number: numberOrNull(form.trackNumber),
        disc_number: numberOrNull(form.discNumber),
        year: numberOrNull(form.year),
        artwork: form.artwork,
      });
      await refresh();
      onSaved?.();
      show("Metadata updated", "success");
      onClose();
    } catch (error) {
      show(errorMessage(error), "danger");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!track) return;
    const title = form.title.trim();
    if (!title) {
      show("Title is required", "danger");
      return;
    }
    confirm({
      title: "Save Metadata Changes",
      description: `This will overwrite the tags stored in "${track.path.split("/").pop()}" on disk.`,
      confirmLabel: "Save",
      onConfirm: () => void doSave(title),
    });
  }

  const artworkNote =
    form.artwork.type === "Replace"
      ? `New artwork: ${form.artwork.path.split("/").pop()}`
      : form.artwork.type === "Remove"
        ? "Artwork will be removed"
        : null;
  const canRemoveArtwork =
    form.artwork.type !== "Remove" &&
    (track?.has_embedded_art || form.artwork.type === "Replace");

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Edit Metadata"
      footer={
        <>
          <Button variant="ghost" onClick={handleReset} disabled={!track || saving}>
            Reset
          </Button>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!track || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="op-metadata-edit">
        <div className="op-metadata-edit__artwork">
          <Artwork
            seed={`${form.artist || form.title} — ${form.album || form.title}`}
            alt="Track artwork"
            size={96}
          />
          <div className="op-metadata-edit__artwork-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handlePickArtwork()}
            >
              Change Artwork…
            </Button>
            {canRemoveArtwork && (
              <Button variant="ghost" size="sm" onClick={handleRemoveArtwork}>
                Remove Artwork
              </Button>
            )}
            {artworkNote && (
              <p className="op-metadata-edit__artwork-note">{artworkNote}</p>
            )}
          </div>
        </div>
        <div className="op-metadata-edit__fields">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            label="Artist"
            value={form.artist}
            onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
          />
          <Input
            label="Album"
            value={form.album}
            onChange={(e) => setForm((f) => ({ ...f, album: e.target.value }))}
          />
          <Input
            label="Album Artist"
            value={form.albumArtist}
            onChange={(e) => setForm((f) => ({ ...f, albumArtist: e.target.value }))}
          />
          <Input
            label="Genre"
            value={form.genre}
            onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
          />
          <div className="op-metadata-edit__row">
            <Input
              label="Track #"
              type="number"
              min={0}
              value={form.trackNumber}
              onChange={(e) => setForm((f) => ({ ...f, trackNumber: e.target.value }))}
            />
            <Input
              label="Disc #"
              type="number"
              min={0}
              value={form.discNumber}
              onChange={(e) => setForm((f) => ({ ...f, discNumber: e.target.value }))}
            />
            <Input
              label="Year"
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
