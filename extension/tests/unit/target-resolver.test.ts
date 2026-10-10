import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyTargetRisk,
  isElementActionable,
  resolveTargetAtPoint,
} from "@/modules/fusion/target-resolver";

describe("Target Resolver", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("identifies standard interactive button element", () => {
    const btn = document.createElement("button");
    btn.textContent = "Click Me";
    // Mock getBoundingClientRect
    btn.getBoundingClientRect = () => ({
      top: 50,
      left: 100,
      width: 80,
      height: 30,
      right: 180,
      bottom: 80,
      x: 100,
      y: 50,
      toJSON: () => {},
    });
    document.body.appendChild(btn);

    // Mock document.elementFromPoint
    document.elementFromPoint = (x, y) => {
      if (x >= 100 && x <= 180 && y >= 50 && y <= 80) return btn;
      return document.body;
    };

    const target = resolveTargetAtPoint({ x: 120, y: 60 });
    expect(target).not.toBeNull();
    expect(target?.element).toBe(btn);
    expect(target?.text).toBe("Click Me");
    expect(target?.risk).toBe("low");
  });

  it("resolves nested children up to the interactive container button", () => {
    const btn = document.createElement("button");
    const icon = document.createElement("span");
    icon.textContent = "🔍";
    btn.appendChild(icon);

    btn.getBoundingClientRect = () => ({
      top: 50,
      left: 100,
      width: 80,
      height: 30,
      right: 180,
      bottom: 80,
      x: 100,
      y: 50,
      toJSON: () => {},
    });
    icon.getBoundingClientRect = btn.getBoundingClientRect;
    document.body.appendChild(btn);

    // Hover is directly on child icon
    document.elementFromPoint = () => icon;

    const target = resolveTargetAtPoint({ x: 110, y: 60 });
    expect(target).not.toBeNull();
    expect(target?.element).toBe(btn);
  });

  it("filters out disabled and hidden elements", () => {
    const disabledBtn = document.createElement("button");
    disabledBtn.setAttribute("disabled", "true");
    disabledBtn.getBoundingClientRect = () => ({
      top: 10,
      left: 10,
      width: 50,
      height: 20,
      right: 60,
      bottom: 30,
      x: 10,
      y: 10,
      toJSON: () => {},
    });
    document.body.appendChild(disabledBtn);

    expect(isElementActionable(disabledBtn)).toBe(false);

    const hiddenBtn = document.createElement("button");
    hiddenBtn.setAttribute("aria-hidden", "true");
    hiddenBtn.getBoundingClientRect = disabledBtn.getBoundingClientRect;
    document.body.appendChild(hiddenBtn);

    expect(isElementActionable(hiddenBtn)).toBe(false);
  });

  it("correctly classifies consequence risk tiers", () => {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete Account";
    expect(classifyTargetRisk(deleteBtn)).toBe("high");

    const submitBtn = document.createElement("button");
    submitBtn.setAttribute("type", "submit");
    expect(classifyTargetRisk(submitBtn)).toBe("high");

    const purchaseLink = document.createElement("a");
    purchaseLink.textContent = "Buy Now";
    expect(classifyTargetRisk(purchaseLink)).toBe("high");

    const externalLink = document.createElement("a");
    externalLink.setAttribute("href", "https://example.com");
    externalLink.setAttribute("target", "_blank");
    expect(classifyTargetRisk(externalLink)).toBe("moderate");

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Toggle Menu";
    expect(classifyTargetRisk(toggleBtn)).toBe("low");
  });
});
