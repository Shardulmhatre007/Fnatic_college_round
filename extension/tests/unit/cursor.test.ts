import { describe, expect, it } from "vitest";
import { OneEuroFilter, OneEuroFilter2D } from "@/modules/cursor/one-euro-filter";
import { CursorManager } from "@/modules/cursor/index";
import type { LandmarkResult } from "@/shared/types";

describe("OneEuroFilter", () => {
  it("initialises and returns initial value without exploding", () => {
    const filter = new OneEuroFilter(1.0, 0.007);
    const result = filter.filter(100, 1000);
    expect(result).toBe(100);
  });

  it("smooths jittery steps over time", () => {
    const filter = new OneEuroFilter(1.0, 0.007);
    filter.filter(100, 1000);
    // Sudden small jitter
    const smoothed = filter.filter(105, 1033);
    // Smoothed value should be between previous and current
    expect(smoothed).toBeGreaterThan(100);
    expect(smoothed).toBeLessThan(105);
  });

  it("handles 2D coordinate streams", () => {
    const filter2D = new OneEuroFilter2D();
    const p1 = filter2D.filter(100, 200, 1000);
    expect(p1.x).toBe(100);
    expect(p1.y).toBe(200);

    const p2 = filter2D.filter(110, 210, 1033);
    expect(p2.x).toBeGreaterThan(100);
    expect(p2.x).toBeLessThan(110);
  });
});

describe("CursorManager", () => {
  const dummyLandmark = (yaw: number, pitch: number, t: number): LandmarkResult => ({
    timestamp: t,
    face: [{ x: 0.5, y: 0.5, z: 0 }],
    leftHand: null,
    rightHand: null,
    gestures: [],
    headPose: { yaw, pitch, roll: 0 },
  });

  it("calculates viewport-relative position from head pose", () => {
    const manager = new CursorManager();
    const viewport = { width: 1920, height: 1080 };
    const pos = manager.updateCursor(dummyLandmark(0, 0, 1000), viewport);

    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x).toBeLessThanOrEqual(viewport.width);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y).toBeLessThanOrEqual(viewport.height);
  });

  it("snaps cursor when within snap radius", () => {
    const manager = new CursorManager();
    const pos = { x: 102, y: 102 };
    const target = { id: "button-1", x: 100, y: 100, radius: 25 };
    const snapped = manager.snapToNearest(pos, [target]);

    expect(snapped.x).toBeLessThan(102);
    expect(snapped.y).toBeLessThan(102);
  });

  it("does not snap when outside target radius", () => {
    const manager = new CursorManager();
    const pos = { x: 500, y: 500 };
    const target = { id: "button-1", x: 100, y: 100, radius: 25 };
    const snapped = manager.snapToNearest(pos, [target]);

    expect(snapped.x).toBe(500);
    expect(snapped.y).toBe(500);
  });
});
