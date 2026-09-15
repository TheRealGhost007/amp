import { useState } from "react";
import "./Artwork.css";

interface ArtworkProps {
  src?: string | null;
  /** Stable identity (e.g. "Artist — Album") used to derive a deterministic
   * placeholder when there is no real artwork — never a generic gray box. */
  seed: string;
  alt: string;
  size?: number;
  shape?: "square" | "circle";
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function placeholderGradient(seed: string): string {
  const hash = hashSeed(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 35 + (hash % 40)) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 38% 42%), hsl(${hueB} 42% 26%))`;
}

function initials(seed: string): string {
  const parts = seed.split(/[\s—-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function Artwork({ src, seed, alt, size = 48, shape = "square" }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  return (
    <div
      className={`op-artwork op-artwork--${shape}`}
      style={{
        width: size,
        height: size,
        background: showPlaceholder ? placeholderGradient(seed) : undefined,
      }}
    >
      {!showPlaceholder && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {showPlaceholder && (
        <span className="op-artwork__initial" aria-hidden="true">
          {initials(seed)}
        </span>
      )}
    </div>
  );
}
