import { beforeEach, describe, expect, it } from "vitest";
import { FatigueManager } from "@/modules/fusion/fatigue-manager";

describe("Fatigue and Interaction-Effort Management", () => {
  let manager: FatigueManager;

  beforeEach(() => {
    manager = new FatigueManager({
      sessionBreakThresholdMs: 10000,
      breakPromptCooldownMs: 5000,
      missThreshold: 3,
      rejectionThreshold: 3,
    }, 1000);
  });

  it("initializes in NORMAL nominal state", () => {
    expect(manager.getState()).toBe("NORMAL");
    const metrics = manager.getMetrics(1000);
    expect(metrics.strainScore).toBe(0);
    expect(metrics.failedAcquisitions).toBe(0);
    expect(metrics.rejectedCommands).toBe(0);
  });

  it("transitions to EFFORT_ELEVATED on repeated target slips or command rejections", () => {
    // Record target misses
    manager.recordTargetMiss(1100);
    manager.recordTargetMiss(1200);
    manager.recordCommandRejection(1300);

    const score = manager.calculateStrainScore(1400);
    expect(score).toBeGreaterThanOrEqual(0.3);

    manager.recordCommandRejection(1500);
    expect(manager.getState()).toBe("EFFORT_ELEVATED");
  });

  it("suggests a break after extended session or elevated strain", () => {
    // Session threshold is 10000ms. At timestamp 12000ms (11000ms elapsed)
    manager.recordTargetMiss(11000);
    manager.recordTargetMiss(11500);
    manager.recordTargetMiss(11800);

    expect(manager.getState()).toBe("BREAK_SUGGESTED");

    const recommendation = manager.getAdaptiveRecommendation();
    expect(recommendation.suggestBreak).toBe(true);
    expect(recommendation.explanation).toContain("break");
  });

  it("enforces cooldown when user dismisses break suggestion", () => {
    manager.recordTargetMiss(11000);
    manager.recordTargetMiss(11500);
    manager.recordTargetMiss(11800);
    expect(manager.getState()).toBe("BREAK_SUGGESTED");

    // User dismisses at 12000
    manager.dismissBreakSuggestion(12000);
    expect(manager.getState()).toBe("NORMAL");

    // Immediate new miss at 12500 should NOT re-trigger BREAK_SUGGESTED because cooldown is 5000ms
    manager.recordTargetMiss(12500);
    expect(manager.getState()).not.toBe("BREAK_SUGGESTED");
  });

  it("supports pausing and resuming without losing metrics", () => {
    manager.setPaused(true);
    expect(manager.getState()).toBe("PAUSED");

    manager.setPaused(false);
    expect(manager.getState()).toBe("NORMAL");
  });
});
