import { describe, expect, it } from "vitest";
import { hasHardModifier, isEditableElement, normalizeKeyCombo } from "./shortcuts";

function keyEvent(
  key: string,
  mods: Partial<{
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  }> = {},
) {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  };
}

describe("normalizeKeyCombo", () => {
  it("uppercases a bare letter key", () => {
    expect(normalizeKeyCombo(keyEvent("l"))).toBe("L");
  });

  it("renders the space bar as the word Space", () => {
    expect(normalizeKeyCombo(keyEvent(" "))).toBe("Space");
  });

  it("leaves multi-character key names as-is", () => {
    expect(normalizeKeyCombo(keyEvent("ArrowLeft"))).toBe("ArrowLeft");
    expect(normalizeKeyCombo(keyEvent("Escape"))).toBe("Escape");
  });

  it("prefixes modifiers in a fixed order regardless of which were pressed", () => {
    expect(normalizeKeyCombo(keyEvent("k", { ctrlKey: true }))).toBe("Ctrl+K");
    expect(normalizeKeyCombo(keyEvent("p", { shiftKey: true }))).toBe("Shift+P");
    expect(
      normalizeKeyCombo(keyEvent("k", { ctrlKey: true, shiftKey: true, altKey: true })),
    ).toBe("Ctrl+Alt+Shift+K");
  });

  it("distinguishes a bare letter from the same letter with Shift", () => {
    expect(normalizeKeyCombo(keyEvent("p"))).not.toBe(
      normalizeKeyCombo(keyEvent("p", { shiftKey: true })),
    );
  });
});

describe("hasHardModifier", () => {
  it("is true for Ctrl/Alt/Meta", () => {
    expect(hasHardModifier(keyEvent("k", { ctrlKey: true }))).toBe(true);
    expect(hasHardModifier(keyEvent("k", { altKey: true }))).toBe(true);
    expect(hasHardModifier(keyEvent("k", { metaKey: true }))).toBe(true);
  });

  it("is false for a bare key or Shift alone, since both can be normal typing", () => {
    expect(hasHardModifier(keyEvent("p"))).toBe(false);
    expect(hasHardModifier(keyEvent("p", { shiftKey: true }))).toBe(false);
  });
});

describe("isEditableElement", () => {
  it("is true for text inputs, textareas, and selects", () => {
    expect(isEditableElement(document.createElement("input"))).toBe(true);
    expect(isEditableElement(document.createElement("textarea"))).toBe(true);
    expect(isEditableElement(document.createElement("select"))).toBe(true);
  });

  it("is true for a contenteditable element", () => {
    // jsdom doesn't implement `isContentEditable` at all (it reads back
    // `undefined` regardless of the attribute) — define it directly to
    // exercise this branch rather than skip it.
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isEditableElement(div)).toBe(true);
  });

  it("is false for a button or null", () => {
    expect(isEditableElement(document.createElement("button"))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});
