import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    player_core: "0.1.0",
    audio_engine: "0.1.0",
    linux_integration: "0.1.0",
  }),
}));

describe("App", () => {
  it("renders the scaffold placeholder and engine versions from the IPC bridge", async () => {
    render(<App />);

    expect(screen.getByText(/design system lands in phase 1/i)).toBeInTheDocument();

    expect(await screen.findByText(/player_core/)).toBeInTheDocument();
  });
});
