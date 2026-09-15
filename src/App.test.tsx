import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the design-system gallery with all three themes selectable", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /amp — design system/i }),
    ).toBeInTheDocument();

    const light = screen.getByRole("button", { name: "Omarchy Light" });
    await userEvent.click(light);

    expect(document.documentElement.dataset.theme).toBe("omarchy-light");
  });

  it("opens a toast from the design-system demo without throwing", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /show toast/i }));

    expect(await screen.findByText("Added to Favorites")).toBeInTheDocument();
  });
});
