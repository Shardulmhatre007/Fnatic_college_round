import { describe, expect, it } from "vitest";
import { SelectionManager } from "@/modules/selection/index";

describe("SelectionManager", () => {
  it("triggers dwell selection after specified duration inside radius", () => {
    const manager = new SelectionManager({ dwellMs: 400, dwellRadiusPx: 15 });
    const pos = { x: 200, y: 200 };

    // Initial frame
    let event = manager.feedFrame(pos, [], 1000);
    expect(event).toBeNull();
    expect(manager.getDwellProgress()).toBe(0);

    // Mid dwell frame
    event = manager.feedFrame({ x: 205, y: 202 }, [], 1200);
    expect(event).toBeNull();
    expect(manager.getDwellProgress()).toBe(0.5);

    // Completed dwell frame
    event = manager.feedFrame({ x: 204, y: 203 }, [], 1400);
    expect(event).not.toBeNull();
    expect(event?.method).toBe("dwell");
    expect(event?.position.x).toBe(200);
  });

  it("resets dwell when cursor moves outside radius", () => {
    const manager = new SelectionManager({ dwellMs: 400, dwellRadiusPx: 10 });
    manager.feedFrame({ x: 100, y: 100 }, [], 1000);
    manager.feedFrame({ x: 102, y: 102 }, [], 1200);
    expect(manager.getDwellProgress()).toBe(0.5);

    // Sudden move outside radius
    const event = manager.feedFrame({ x: 150, y: 150 }, [], 1300);
    expect(event).toBeNull();
    expect(manager.getDwellProgress()).toBe(0);
  });

  it("triggers instant gesture selection on pinch gesture", () => {
    const manager = new SelectionManager();
    const event = manager.feedFrame({ x: 300, y: 400 }, ["pinch"], 1000);
    expect(event).not.toBeNull();
    expect(event?.method).toBe("gesture");
  });

  it("respects cooldown between selections", () => {
    const manager = new SelectionManager({ cooldownMs: 500 });
    const event1 = manager.feedFrame({ x: 100, y: 100 }, ["pinch"], 1000);
    expect(event1).not.toBeNull();

    // Immediate second action within cooldown
    const event2 = manager.feedFrame({ x: 100, y: 100 }, ["pinch"], 1200);
    expect(event2).toBeNull();

    // After cooldown
    const event3 = manager.feedFrame({ x: 100, y: 100 }, ["pinch"], 1600);
    expect(event3).not.toBeNull();
  });
});
