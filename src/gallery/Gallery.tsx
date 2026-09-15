import { useRef, useState } from "react";
import {
  Artwork,
  Button,
  Card,
  Dialog,
  Dropdown,
  Icon,
  Input,
  MediaRow,
  Menu,
  Slider,
  Tabs,
  Tooltip,
  useToast,
} from "../components";
import type { ThemeMode } from "../lib/theme";
import { applyTheme } from "../lib/theme";
import "./Gallery.css";

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: "omarchy-dark", label: "Omarchy Dark" },
  { id: "omarchy-light", label: "Omarchy Light" },
  { id: "amoled-dark", label: "AMOLED Dark" },
];

export function Gallery() {
  const [theme, setTheme] = useState<ThemeMode>("omarchy-dark");
  const [activeTab, setActiveTab] = useState("songs");
  const [favorite, setFavorite] = useState(false);
  const [volume, setVolume] = useState(70);
  const [progress, setProgress] = useState(35);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  function selectTheme(next: ThemeMode) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <main className="op-gallery">
      <header className="op-gallery__header">
        <h1>Amp — design system</h1>
        <div className="op-gallery__theme-switch" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={theme === t.id ? "primary" : "secondary"}
              onClick={() => selectTheme(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </header>

      <section className="op-gallery__section">
        <h2>Buttons</h2>
        <div className="op-gallery__row">
          <Button variant="primary">Play All</Button>
          <Button variant="secondary">Add to Playlist</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Remove From Library</Button>
          <Button variant="primary" iconOnly aria-label="Play">
            <Icon name="play" />
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section className="op-gallery__section">
        <h2>Inputs &amp; controls</h2>
        <div className="op-gallery__row">
          <Input label="Library folder" placeholder="/home/trg/Music" />
          <Dropdown
            label="Sort by"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "songs", label: "Title" },
              { value: "artist", label: "Artist" },
              { value: "recent", label: "Recently added" },
            ]}
          />
        </div>
        <div className="op-gallery__row">
          <div className="op-gallery__slider-demo">
            <span>Progress</span>
            <Slider
              label="Playback progress"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </div>
          <div className="op-gallery__slider-demo">
            <span>Volume</span>
            <Slider
              label="Volume"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="op-gallery__section">
        <h2>Artwork</h2>
        <div className="op-gallery__row">
          <Artwork seed="Daft Punk — Discovery" alt="" size={72} />
          <Artwork seed="Boards of Canada — Geogaddi" alt="" size={72} />
          <Artwork seed="Tycho — Dive" alt="" size={72} />
          <Artwork seed="Circle avatar" alt="" size={72} shape="circle" />
        </div>
      </section>

      <section className="op-gallery__section">
        <h2>Media row</h2>
        <Card>
          <MediaRow
            artworkSeed="Daft Punk — Discovery"
            title="One More Time"
            subtitle="Daft Punk"
            trailing="3:57"
            active
            favorite={favorite}
            onToggleFavorite={() => setFavorite((f) => !f)}
          />
          <MediaRow
            artworkSeed="Tycho — Dive"
            title="A Walk"
            subtitle="Tycho"
            trailing="4:33"
          />
        </Card>
      </section>

      <section className="op-gallery__section">
        <h2>Tabs</h2>
        <Tabs
          tabs={[
            { id: "songs", label: "Songs" },
            { id: "artist", label: "Artists" },
            { id: "recent", label: "Recently Added" },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        >
          <p className="op-gallery__muted">Panel: {activeTab}</p>
        </Tabs>
      </section>

      <section className="op-gallery__section">
        <h2>Tooltip (collapsed sidebar rail)</h2>
        <div className="op-gallery__row">
          <Tooltip label="Home" side="right">
            <Button variant="ghost" iconOnly aria-label="Home">
              <Icon name="folder" />
            </Button>
          </Tooltip>
          <Tooltip label="Search" side="right">
            <Button variant="ghost" iconOnly aria-label="Search">
              <Icon name="search" />
            </Button>
          </Tooltip>
        </div>
      </section>

      <section className="op-gallery__section">
        <h2>Menu, dialog &amp; toast</h2>
        <div className="op-gallery__row">
          <Button ref={menuAnchor} variant="secondary" onClick={() => setMenuOpen(true)}>
            Open context menu
          </Button>
          <Menu
            anchorRef={menuAnchor}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            items={[
              { id: "play", label: "Play", icon: "play" },
              { id: "queue", label: "Add to Queue", icon: "queue" },
              { id: "fav", label: "Favorite", icon: "heart" },
              {
                id: "remove",
                label: "Remove From Library",
                danger: true,
                separatorBefore: true,
              },
            ]}
          />
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show("Added to Favorites", "success")}
          >
            Show toast
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Delete playlist?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>
                Delete
              </Button>
            </>
          }
        >
          <p>
            This can&rsquo;t be undone. The playlist itself is removed — your music files
            are never touched.
          </p>
        </Dialog>
      </section>
    </main>
  );
}
