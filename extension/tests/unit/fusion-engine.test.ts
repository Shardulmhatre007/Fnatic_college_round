import { beforeEach, describe, expect, it, vi } from "vitest";
import { FusionEngine } from "@/modules/fusion/fusion-engine";
import type { ResolvedTarget, TranscriptEvent } from "@/shared/types";

describe("Point-and-Say Fusion Engine", () => {
  let engine: FusionEngine;
  let mockTarget: ResolvedTarget;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new FusionEngine({
      minTargetStabilityMs: 100,
      fusionWindowMs: 2000,
      confirmationTimeoutMs: 5000,
    });

    const btn = document.createElement("button");
    btn.textContent = "Test Button";
    document.body.appendChild(btn);
    mockTarget = {
      element: btn,
      tagName: "button",
      text: "Test Button",
      isActionable: true,
      risk: "low",
      rect: { top: 20, left: 20, width: 60, height: 30 },
    };
  });

  const makeTranscript = (text: string, isFinal = true): TranscriptEvent => ({
    text,
    isFinal,
    confidence: 0.95,
    locale: "en",
  });

  it("transitions to TARGET_ACQUIRED when hovering over actionable target", () => {
    expect(engine.getState()).toBe("IDLE");

    engine.updatePointer({ x: 50, y: 35 }, 1000, mockTarget);
    expect(engine.getState()).toBe("TARGET_ACQUIRED");
  });

  it("executes point-and-say click when target is stable and command is spoken", () => {
    const executeSpy = vi.fn();
    engine.onExecute(executeSpy);

    // Hover at t=1000
    engine.updatePointer({ x: 50, y: 35 }, 1000, mockTarget);

    // Speak "click this" at t=1200 (> 100ms stability threshold)
    engine.processTranscript(makeTranscript("click this"), 1200);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [action, target, token] = executeSpy.mock.calls[0]!;
    expect(action.type).toBe("click_this");
    expect(target).toBe(mockTarget);
    expect(token).toMatch(/^exec_/);
    expect(engine.getState()).toBe("IDLE");
  });

  it("rejects interim speech results and only acts on final transcripts", () => {
    const executeSpy = vi.fn();
    engine.onExecute(executeSpy);

    engine.updatePointer({ x: 50, y: 35 }, 1000, mockTarget);
    engine.processTranscript(makeTranscript("click", false), 1200);

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("enforces target locking and confirmation workflow for high-risk actions", () => {
    const highRiskTarget: ResolvedTarget = {
      ...mockTarget,
      text: "Delete Project",
      risk: "high",
    };

    const confirmSpy = vi.fn();
    const executeSpy = vi.fn();
    engine.onConfirmation(confirmSpy);
    engine.onExecute(executeSpy);

    // Hover at t=1000
    engine.updatePointer({ x: 50, y: 35 }, 1000, highRiskTarget);

    // Speak "click this"
    engine.processTranscript(makeTranscript("click this"), 1200);

    // Should enter AWAITING_CONFIRMATION, not execute immediately
    expect(engine.getState()).toBe("AWAITING_CONFIRMATION");
    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      targetDescription: "Delete Project",
      risk: "high",
    }));
    expect(executeSpy).not.toHaveBeenCalled();

    // TARGET LOCKING: Pointer moves away while awaiting confirmation
    engine.updatePointer({ x: 999, y: 999 }, 1300, null);
    expect(engine.getState()).toBe("AWAITING_CONFIRMATION");
    expect(engine.getLockedTarget()).toBe(highRiskTarget);

    // User speaks "confirm" to validate
    engine.processTranscript(makeTranscript("confirm"), 1400);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(engine.getState()).toBe("IDLE");
  });

  it("cancels pending confirmation immediately when user says 'cancel'", () => {
    const highRiskTarget: ResolvedTarget = {
      ...mockTarget,
      text: "Wipe Data",
      risk: "high",
    };

    engine.updatePointer({ x: 50, y: 35 }, 1000, highRiskTarget);
    engine.processTranscript(makeTranscript("click this"), 1200);
    expect(engine.getState()).toBe("AWAITING_CONFIRMATION");

    // Speak "cancel"
    engine.processTranscript(makeTranscript("cancel"), 1300);
    expect(engine.getState()).toBe("IDLE");
    expect(engine.getPendingConfirmation()).toBeNull();
  });

  it("blocks actions and cancels intent when system is paused", () => {
    const executeSpy = vi.fn();
    engine.onExecute(executeSpy);

    engine.setSystemState({ isPaused: true });
    expect(engine.getState()).toBe("BLOCKED");

    engine.processTranscript(makeTranscript("scroll down"), 1000);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("aborts pending confirmation if locked element is removed from DOM", () => {
    const highRiskTarget: ResolvedTarget = {
      ...mockTarget,
      risk: "high",
    };

    engine.updatePointer({ x: 50, y: 35 }, 1000, highRiskTarget);
    engine.processTranscript(makeTranscript("click this"), 1200);
    expect(engine.getState()).toBe("AWAITING_CONFIRMATION");

    // Remove element from DOM
    mockTarget.element.remove();

    // Next pointer frame triggers detachment safety check
    engine.updatePointer({ x: 50, y: 35 }, 1250, null);
    expect(engine.getState()).toBe("IDLE");
    expect(engine.getPendingConfirmation()).toBeNull();
  });
});
