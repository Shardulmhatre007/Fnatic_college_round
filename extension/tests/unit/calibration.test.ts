import { describe, expect, it } from "vitest";
import { CalibrationManager } from "@/modules/calibration/index";
import type { LandmarkResult } from "@/shared/types";

describe("CalibrationManager", () => {
  it("initialises targets correctly", () => {
    const manager = new CalibrationManager();
    const firstTarget = manager.start();
    expect(firstTarget).not.toBeNull();
    expect(firstTarget?.key).toBe("top-left");
    expect(manager.isComplete()).toBe(false);
  });

  it("advances targets when enough frames are recorded", () => {
    const manager = new CalibrationManager();
    manager.start();

    const mockFrame: LandmarkResult = {
      timestamp: 1000,
      face: [{ x: 0.12, y: 0.11, z: 0 }],
      leftHand: null,
      rightHand: null,
      gestures: [],
      headPose: { yaw: 0, pitch: 0, roll: 0 },
    };

    // Send 5 frames to hit first target
    let completed = false;
    for (let i = 0; i < 5; i++) {
      completed = manager.recordFrame(mockFrame);
    }

    expect(completed).toBe(true);
    const nextTarget = manager.getCurrentTarget();
    expect(nextTarget?.key).toBe("top-right");
  });

  it("detects drift when persistent head tilt is high", () => {
    const manager = new CalibrationManager();
    const highTiltFrames: LandmarkResult[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: 1000 + i * 33,
      face: null,
      leftHand: null,
      rightHand: null,
      gestures: [],
      headPose: { yaw: 35, pitch: 10, roll: 0 },
    }));

    const isDrifting = manager.detectDrift(highTiltFrames);
    expect(isDrifting).toBe(true);
  });
});
