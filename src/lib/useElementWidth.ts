import { useEffect, useState, type RefObject } from "react";

/** Tracks an element's content width via `ResizeObserver` — used to
 * compute how many columns fit in a virtualized grid at the current
 * viewport size (spec §33: no single fixed-width assumption). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
