import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setMock = vi.fn();
const setCrossfadeDurationMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  settings: {
    get: (...args: unknown[]) => getMock(...args),
    set: (...args: unknown[]) => setMock(...args),
  },
  player: {
    setCrossfadeDuration: (...args: unknown[]) => setCrossfadeDurationMock(...args),
  },
}));

const { PlaybackSettings } = await import("./PlaybackSettings");
const { CROSSFADE_SETTING_KEY } = await import("../lib/audioPreferences");

describe("PlaybackSettings", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue(null);
    setMock.mockReset().mockResolvedValue(undefined);
    setCrossfadeDurationMock.mockReset().mockResolvedValue(undefined);
  });

  it("loads a previously saved crossfade duration and shows it enabled", async () => {
    getMock.mockResolvedValue(5000);

    render(<PlaybackSettings />);

    const toggle = await screen.findByRole("switch", { name: "Crossfade" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("5.0s")).toBeInTheDocument();
  });

  it("stays off by default when nothing was ever saved", async () => {
    render(<PlaybackSettings />);

    const toggle = await screen.findByRole("switch", { name: "Crossfade" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/s$/)).not.toBeInTheDocument();
  });

  it("turning the toggle on persists the duration and applies it to the live player", async () => {
    const user = userEvent.setup();
    render(<PlaybackSettings />);

    const toggle = await screen.findByRole("switch", { name: "Crossfade" });
    await user.click(toggle);

    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(CROSSFADE_SETTING_KEY, 3000),
    );
    expect(setCrossfadeDurationMock).toHaveBeenCalledWith(3000);
  });

  it("turning the toggle off persists null and disables crossfade on the live player", async () => {
    getMock.mockResolvedValue(4000);
    const user = userEvent.setup();
    render(<PlaybackSettings />);

    const toggle = await screen.findByRole("switch", { name: "Crossfade" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    await user.click(toggle);

    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(CROSSFADE_SETTING_KEY, null),
    );
    expect(setCrossfadeDurationMock).toHaveBeenCalledWith(null);
  });
});
