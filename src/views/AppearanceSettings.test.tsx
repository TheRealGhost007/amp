import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/Toast/Toast";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

const getMock = vi.fn();
const setMock = vi.fn();
const readAsDataUrlMock = vi.fn();
vi.mock("../lib/ipc", () => ({
  settings: {
    get: (...args: unknown[]) => getMock(...args),
    set: (...args: unknown[]) => setMock(...args),
  },
  images: {
    readAsDataUrl: (...args: unknown[]) => readAsDataUrlMock(...args),
  },
}));

const { AppearanceSettings } = await import("./AppearanceSettings");
const { THEME_SETTING_KEY, CUSTOM_THEME_SETTING_KEY, BACKGROUND_IMAGE_SETTING_KEY } =
  await import("../lib/theme");

function renderWithToast() {
  return render(
    <ToastProvider>
      <AppearanceSettings />
    </ToastProvider>,
  );
}

describe("AppearanceSettings", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue(null);
    setMock.mockReset().mockResolvedValue(undefined);
    readAsDataUrlMock.mockReset();
    openMock.mockReset();
    document.documentElement.dataset.theme = "";
    document.documentElement.style.cssText = "";
    document.body.style.background = "";
  });

  it("shows the custom color/gradient controls only once Custom is selected", async () => {
    const user = userEvent.setup();
    renderWithToast();

    expect(screen.queryByLabelText("Base")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /Theme/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Custom" }));

    expect(await screen.findByLabelText("Base")).toBeInTheDocument();
    expect(screen.getByText("Gradient start")).toBeInTheDocument();
    expect(screen.getByText("Gradient end")).toBeInTheDocument();
    expect(screen.getByText("Accent")).toBeInTheDocument();
  });

  it("switching to Custom persists the mode and a config", async () => {
    const user = userEvent.setup();
    renderWithToast();

    await user.click(await screen.findByRole("button", { name: /Theme/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Custom" }));

    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(THEME_SETTING_KEY, "custom"),
    );
    expect(setMock).toHaveBeenCalledWith(
      CUSTOM_THEME_SETTING_KEY,
      expect.objectContaining({ base: "omarchy-dark" }),
    );
  });

  it("restores a previously saved custom config into the color pickers", async () => {
    getMock.mockImplementation((key: string) => {
      if (key === THEME_SETTING_KEY) return Promise.resolve("custom");
      if (key === CUSTOM_THEME_SETTING_KEY) {
        return Promise.resolve({
          base: "omarchy-light",
          gradientFrom: "#ff0000",
          gradientTo: "#0000ff",
          angle: 90,
          accent: "#00ff00",
        });
      }
      return Promise.resolve(null);
    });

    renderWithToast();

    expect(await screen.findByLabelText("Base")).toHaveTextContent("Light");
    expect(screen.getByLabelText("Gradient angle: 90°")).toHaveValue("90");
  });

  it("picking a background image reads it, applies it, and shows the chosen path", async () => {
    openMock.mockResolvedValue("/home/user/Pictures/wallpaper.png");
    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    const user = userEvent.setup();
    renderWithToast();

    await user.click(await screen.findByRole("button", { name: "Choose Image…" }));

    await waitFor(() =>
      expect(screen.getByText("/home/user/Pictures/wallpaper.png")).toBeInTheDocument(),
    );
    expect(readAsDataUrlMock).toHaveBeenCalledWith("/home/user/Pictures/wallpaper.png");
    expect(setMock).toHaveBeenCalledWith(
      BACKGROUND_IMAGE_SETTING_KEY,
      "/home/user/Pictures/wallpaper.png",
    );
    expect(await screen.findByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("shows a toast and doesn't crash when the picked file can't be read", async () => {
    openMock.mockResolvedValue("/home/user/huge.png");
    readAsDataUrlMock.mockRejectedValue(
      new Error("image is too large (25 MB, max 20 MB)"),
    );
    const user = userEvent.setup();
    renderWithToast();

    await user.click(await screen.findByRole("button", { name: "Choose Image…" }));

    expect(
      await screen.findByText("image is too large (25 MB, max 20 MB)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("/home/user/huge.png")).not.toBeInTheDocument();
  });

  it("removing a background image clears it", async () => {
    openMock.mockResolvedValue("/wallpaper.png");
    readAsDataUrlMock.mockResolvedValue("data:image/png;base64,ZmFrZQ==");
    const user = userEvent.setup();
    renderWithToast();
    await user.click(await screen.findByRole("button", { name: "Choose Image…" }));
    await screen.findByRole("button", { name: "Remove" });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(BACKGROUND_IMAGE_SETTING_KEY, null),
    );
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Image…" })).toBeInTheDocument();
  });
});
