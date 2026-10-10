import { beforeEach, describe, expect, it } from "vitest";
import { IntentFilter, type IntentContext } from "@/modules/fusion/intent-filter";
import type { ResolvedTarget } from "@/shared/types";
import type { CommandMatch } from "@/modules/commands/index";

describe("Intent Filter and Safety Gate", () => {
  let filter: IntentFilter;
  let mockTarget: ResolvedTarget;
  let mockClickMatch: CommandMatch;

  beforeEach(() => {
    filter = new IntentFilter();
    const btn = document.createElement("button");
    mockTarget = {
      element: btn,
      tagName: "button",
      text: "Submit Order",
      isActionable: true,
      risk: "high",
      rect: { top: 10, left: 10, width: 100, height: 40 },
    };

    mockClickMatch = {
      command: {
        id: "cmd_click_this",
        phrase: "click this",
        action: { type: "click_this" },
        enabled: true,
      },
      confidence: 0.95,
    };
  });

  const makeContext = (overrides: Partial<IntentContext> = {}): IntentContext => ({
    isPaused: false,
    isCalibrating: false,
    trackingActive: true,
    targetAcquiredAt: 1000,
    speechTimestamp: 1500,
    now: 1500,
    minStabilityMs: 150,
    fusionWindowMs: 2500,
    confirmationTimeoutMs: 7000,
    ...overrides,
  });

  it("blocks commands when application is paused", () => {
    const res = filter.validate(mockTarget, mockClickMatch, makeContext({ isPaused: true }));
    expect(res.decision).toBe("REJECT");
    expect(res.reasonCode).toBe("SYSTEM_PAUSED");
  });

  it("blocks commands when tracking is lost or inactive", () => {
    const res = filter.validate(mockTarget, mockClickMatch, makeContext({ trackingActive: false }));
    expect(res.decision).toBe("REJECT");
    expect(res.reasonCode).toBe("TRACKING_INACTIVE");
  });

  it("rejects target-dependent command when no target is present", () => {
    const res = filter.validate(null, mockClickMatch, makeContext());
    expect(res.decision).toBe("REJECT");
    expect(res.reasonCode).toBe("NO_ACTIONABLE_TARGET");
  });

  it("rejects command when target stability threshold is not met", () => {
    // Acquired at 1450, now is 1500 -> only 50ms dwell vs 150ms required
    const res = filter.validate(
      mockTarget,
      mockClickMatch,
      makeContext({ targetAcquiredAt: 1450, now: 1500, minStabilityMs: 150 })
    );
    expect(res.decision).toBe("REJECT");
    expect(res.reasonCode).toBe("TARGET_UNSTABLE");
  });

  it("expires when speech timestamp is outside the temporal fusion window", () => {
    // Target acquired at 1000, speech at 1000, now is 5000 -> 4000ms elapsed vs 2500ms max
    const res = filter.validate(
      mockTarget,
      mockClickMatch,
      makeContext({ targetAcquiredAt: 1000, speechTimestamp: 1000, now: 5000, fusionWindowMs: 2500 })
    );
    expect(res.decision).toBe("EXPIRED");
    expect(res.reasonCode).toBe("TEMPORAL_WINDOW_EXPIRED");
  });

  it("requires explicit confirmation for high-consequence risk targets", () => {
    const res = filter.validate(mockTarget, mockClickMatch, makeContext());
    expect(res.decision).toBe("CONFIRM");
    expect(res.risk).toBe("high");
    expect(res.pendingConfirmation).toBeDefined();
    expect(res.pendingConfirmation?.targetDescription).toBe("Submit Order");
  });

  it("allows immediate execution for low-risk actions with unique token", () => {
    const lowRiskTarget: ResolvedTarget = {
      ...mockTarget,
      text: "Next Slide",
      risk: "low",
    };

    const res = filter.validate(lowRiskTarget, mockClickMatch, makeContext());
    expect(res.decision).toBe("ALLOW");
    expect(res.idempotencyToken).toBeDefined();
    expect(res.idempotencyToken).toMatch(/^exec_/);
  });
});
