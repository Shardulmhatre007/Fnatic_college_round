import { describe, expect, it } from "vitest";
import { detectGestures, estimateHeadPose, TrackingEngine } from "@/modules/tracking/index";
import type { Landmark } from "@/shared/types";

describe("TrackingEngine", () => {
  it("estimates head pose from landmark geometry", () => {
    // Generate minimal landmark array with nose, eyes, chin
    const landmarks: Landmark[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    // Nose
    landmarks[4] = { x: 0.5, y: 0.5, z: 0 };
    // Left eye corner
    landmarks[33] = { x: 0.4, y: 0.45, z: 0 };
    // Right eye corner
    landmarks[263] = { x: 0.6, y: 0.45, z: 0 };
    // Chin
    landmarks[152] = { x: 0.5, y: 0.65, z: 0 };

    const pose = estimateHeadPose(landmarks);
    expect(pose).not.toBeNull();
    expect(pose?.yaw).toBeCloseTo(0, 0);
  });

  it("detects pinch gesture when thumb and index are close", () => {
    const hand: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    hand[4] = { x: 0.5, y: 0.5, z: 0 }; // Thumb tip
    hand[8] = { x: 0.51, y: 0.51, z: 0 }; // Index tip (close proximity)

    const gestures = detectGestures(null, hand, null, null);
    expect(gestures).toContain("pinch");
  });

  it("processes frame and forwards to callback", () => {
    let captured = false;
    const engine = new TrackingEngine({
      onLandmarks: () => {
        captured = true;
      },
    });

    engine.processRawLandmarks(null, null, 1000);
    expect(captured).toBe(true);
  });
});
