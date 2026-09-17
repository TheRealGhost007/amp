import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom doesn't implement matchMedia at all — anything that touches
// theme resolution (src/lib/theme.ts) throws immediately without this.
// A no-op stub is enough for tests that don't care about the resolved
// value; tests that do (theme.test.ts) replace `window.matchMedia`
// themselves with a more detailed mock.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
