import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevicesMock = vi.fn();
const setDeviceMock = vi.fn();
const setEqBandMock = vi.fn();
const getMock = vi.fn();
const setMock = vi.fn();

vi.mock("../lib/ipc", () => ({
  player: {
    listDevices: (...args: unknown[]) => listDevicesMock(...args),
    setDevice: (...args: unknown[]) => setDeviceMock(...args),
    setEqBand: (...args: unknown[]) => setEqBandMock(...args),
  },
  settings: {
    get: (...args: unknown[]) => getMock(...args),
    set: (...args: unknown[]) => setMock(...args),
  },
}));

const { AudioSettings } = await import("./AudioSettings");
const { OUTPUT_DEVICE_SETTING_KEY, EQ_BANDS_SETTING_KEY } =
  await import("../lib/audioPreferences");

describe("AudioSettings", () => {
  beforeEach(() => {
    listDevicesMock.mockReset().mockResolvedValue([]);
    setDeviceMock.mockReset().mockResolvedValue(undefined);
    setEqBandMock.mockReset().mockResolvedValue(undefined);
    getMock.mockReset().mockResolvedValue(null);
    setMock.mockReset().mockResolvedValue(undefined);
  });

  it("shows System default and 0dB on every band when nothing was ever saved", async () => {
    render(<AudioSettings />);

    expect(
      await screen.findByRole("button", { name: "System default" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("0dB")).toHaveLength(10);
  });

  it("populates the device dropdown from the backend and preselects a saved device", async () => {
    listDevicesMock.mockResolvedValue([
      { id: "dev-1", name: "USB Headphones" },
      { id: "dev-2", name: "HDMI Output" },
    ]);
    getMock.mockImplementation((key: string) =>
      Promise.resolve(key === OUTPUT_DEVICE_SETTING_KEY ? "dev-2" : null),
    );

    render(<AudioSettings />);

    expect(
      await screen.findByRole("button", { name: "HDMI Output" }),
    ).toBeInTheDocument();
  });

  it("selecting a device from the dropdown applies it live and persists the choice", async () => {
    listDevicesMock.mockResolvedValue([{ id: "dev-1", name: "USB Headphones" }]);
    const user = userEvent.setup();

    render(<AudioSettings />);
    const trigger = await screen.findByRole("button", { name: "System default" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "USB Headphones" }));

    expect(setDeviceMock).toHaveBeenCalledWith("dev-1");
    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(OUTPUT_DEVICE_SETTING_KEY, "dev-1"),
    );
  });

  it("loads previously saved EQ band gains", async () => {
    const savedBands = [3, -3, 0, 0, 0, 0, 0, 0, 0, 6];
    getMock.mockImplementation((key: string) =>
      Promise.resolve(key === EQ_BANDS_SETTING_KEY ? savedBands : null),
    );

    render(<AudioSettings />);

    expect(await screen.findByLabelText("31Hz gain")).toHaveValue("3");
    expect(screen.getByLabelText("62Hz gain")).toHaveValue("-3");
    expect(screen.getByLabelText("16kHz gain")).toHaveValue("6");
  });

  it("changing one band applies it live and persists the full band array", async () => {
    render(<AudioSettings />);
    const band = await screen.findByLabelText("125Hz gain");

    fireEvent.change(band, { target: { value: "5" } });

    expect(setEqBandMock).toHaveBeenCalledWith(2, 5);
    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(
        EQ_BANDS_SETTING_KEY,
        expect.arrayContaining([5]),
      ),
    );
    const [, persisted] = setMock.mock.calls.find(
      ([key]) => key === EQ_BANDS_SETTING_KEY,
    )!;
    expect(persisted[2]).toBe(5);
  });

  it("Reset zeroes every band, applies each to the live player, and persists a flat array", async () => {
    const savedBands = [3, -3, 4, 0, 0, 0, 0, 0, 0, 6];
    getMock.mockImplementation((key: string) =>
      Promise.resolve(key === EQ_BANDS_SETTING_KEY ? savedBands : null),
    );
    const user = userEvent.setup();

    render(<AudioSettings />);
    await screen.findByLabelText("31Hz gain");
    setEqBandMock.mockClear();
    setMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(setEqBandMock).toHaveBeenCalledTimes(10);
    expect(setEqBandMock).toHaveBeenCalledWith(0, 0);
    await waitFor(() =>
      expect(setMock).toHaveBeenCalledWith(EQ_BANDS_SETTING_KEY, Array(10).fill(0)),
    );
    expect(screen.getAllByText("0dB")).toHaveLength(10);
  });
});
