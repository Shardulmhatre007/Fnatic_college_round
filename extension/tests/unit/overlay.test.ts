import { beforeEach, describe, expect, it } from "vitest";
import { OverlayManager } from "@/modules/overlay/index";

describe("OverlayManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("creates shadow root container on document without polluting light DOM", () => {
    const overlay = new OverlayManager();
    const host = document.getElementById("handsfree-overlay-root");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
  });

  it("updates and renders cursor position", () => {
    const overlay = new OverlayManager();
    overlay.renderCursor({ x: 150, y: 250 });
    const host = document.getElementById("handsfree-overlay-root");
    const cursor = host?.shadowRoot?.getElementById("cursor");

    expect(cursor?.classList.contains("active")).toBe(true);
    expect(cursor?.style.left).toBe("150px");
    expect(cursor?.style.top).toBe("250px");
  });

  it("renders numbered badges correctly", () => {
    const overlay = new OverlayManager();
    overlay.showNumbers([
      {
        n: 1,
        rect: { top: 100, left: 100, width: 50, height: 20 },
        elementRef: {},
      },
      {
        n: 2,
        rect: { top: 200, left: 200, width: 50, height: 20 },
        elementRef: {},
      },
    ]);

    const host = document.getElementById("handsfree-overlay-root");
    const badges = host?.shadowRoot?.querySelectorAll(".handsfree-badge");
    expect(badges?.length).toBe(2);
    expect(badges?.[0]?.textContent).toBe("1");
    expect(badges?.[1]?.textContent).toBe("2");
  });
});
