import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setDeviceMock = vi.fn();
const setEqBandMock = vi.fn();
const setCrossfadeDurationMock = vi.fn();

vi.mock("./ipc", () => ({
  settings: {
    get: (...args: unknown[]) => getMock(...args),
  },
  player: {
    setDevice: (...args: unknown[]) => setDeviceMock(...args),
    setEqBand: (...args: unknown[]) => setEqBandMock(...args),
    setCrossfadeDuration: (...args: unknown[]) => setCrossfadeDurationMock(...args),
  },
}));

const {
  applyStoredAudioPreferences,
  OUTPUT_DEVICE_SETTING_KEY,
  EQ_BANDS_SETTING_KEY,
  CROSSFADE_SETTING_KEY,
} = await import("./audioPreferences");

describe("applyStoredAudioPreferences", () => {
  beforeEach(() => {
    getMock.mockReset();
    setDeviceMock.mockReset();
    setEqBandMock.mockReset();
    setCrossfadeDurationMock.mockReset();
  });

  it("applies a saved device, every saved EQ band, and a saved crossfade duration", async () => {
    getMock.mockImplementation((key: string) => {
      if (key === OUTPUT_DEVICE_SETTING_KEY) return Promise.resolve("device-1");
      if (key === EQ_BANDS_SETTING_KEY) return Promise.resolve([1, -2, 3]);
      if (key === CROSSFADE_SETTING_KEY) return Promise.resolve(4000);
      return Promise.resolve(null);
    });

    await applyStoredAudioPreferences();

    expect(setDeviceMock).toHaveBeenCalledWith("device-1");
    expect(setEqBandMock).toHaveBeenNthCalledWith(1, 0, 1);
    expect(setEqBandMock).toHaveBeenNthCalledWith(2, 1, -2);
    expect(setEqBandMock).toHaveBeenNthCalledWith(3, 2, 3);
    expect(setCrossfadeDurationMock).toHaveBeenCalledWith(4000);
  });

  it("applies nothing when no preferences were ever saved", async () => {
    getMock.mockResolvedValue(null);

    await applyStoredAudioPreferences();

    expect(setDeviceMock).not.toHaveBeenCalled();
    expect(setEqBandMock).not.toHaveBeenCalled();
    expect(setCrossfadeDurationMock).not.toHaveBeenCalled();
  });

  it("a failure applying the device does not block applying the EQ or crossfade", async () => {
    getMock.mockImplementation((key: string) => {
      if (key === OUTPUT_DEVICE_SETTING_KEY) return Promise.resolve("stale-device");
      if (key === EQ_BANDS_SETTING_KEY) return Promise.resolve([5]);
      if (key === CROSSFADE_SETTING_KEY) return Promise.resolve(2000);
      return Promise.resolve(null);
    });
    setDeviceMock.mockRejectedValue(new Error("device unplugged"));

    await applyStoredAudioPreferences();

    expect(setEqBandMock).toHaveBeenCalledWith(0, 5);
    expect(setCrossfadeDurationMock).toHaveBeenCalledWith(2000);
  });

  it("a rejected settings.get for one preference does not block the others", async () => {
    getMock.mockImplementation((key: string) => {
      if (key === OUTPUT_DEVICE_SETTING_KEY)
        return Promise.reject(new Error("db unavailable"));
      if (key === CROSSFADE_SETTING_KEY) return Promise.resolve(3000);
      return Promise.resolve(null);
    });

    await applyStoredAudioPreferences();

    expect(setDeviceMock).not.toHaveBeenCalled();
    expect(setCrossfadeDurationMock).toHaveBeenCalledWith(3000);
  });
});
