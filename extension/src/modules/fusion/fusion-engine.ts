/**
 * Point-and-Say Fusion Engine.
 *
 * Combines virtual pointer head-tracking coordinates and speech recognition
 * transcripts through a formal finite state machine with target locking,
 * temporal synchronization, risk confirmation, and fatigue monitoring.
 */
import type {
  CommandAction,
  CursorPosition,
  FatigueState,
  FusionState,
  PendingConfirmation,
  ResolvedTarget,
  TranscriptEvent,
} from "@/shared/types";
import { matchCommand } from "../commands/index";
import { areTargetsEqual } from "./target-resolver";
import { IntentFilter, type IntentContext } from "./intent-filter";
import { FatigueManager } from "./fatigue-manager";

export interface FusionConfig {
  /** Target must be continuously hovered for this duration to be stable (ms). Default: 150ms. */
  minTargetStabilityMs: number;
  /** Max time difference between pointing and speech (ms). Default: 2500ms. */
  fusionWindowMs: number;
  /** Timeout for pending high-risk confirmations (ms). Default: 7000ms. */
  confirmationTimeoutMs: number;
  /** Minimum confidence threshold for speech matches. Default: 0.72. */
  confidenceThreshold: number;
}

export const DEFAULT_FUSION_CONFIG: Readonly<FusionConfig> = Object.freeze({
  minTargetStabilityMs: 150,
  fusionWindowMs: 2500,
  confirmationTimeoutMs: 7000,
  confidenceThreshold: 0.72,
});

export interface FusionFeedback {
  type: "info" | "success" | "warning" | "error";
  code: string;
  message: string;
  targetDescription?: string;
}

export type FusionStateListener = (state: FusionState, details?: Record<string, unknown>) => void;
export type FusionExecuteListener = (
  action: CommandAction,
  target: ResolvedTarget | null,
  idempotencyToken: string
) => void;
export type FusionConfirmationListener = (pending: PendingConfirmation | null) => void;
export type FusionFeedbackListener = (feedback: FusionFeedback) => void;
export type FusionFatigueListener = (state: FatigueState, suggestion?: string) => void;

export class FusionEngine {
  private config: FusionConfig;
  private state: FusionState = "IDLE";
  private intentFilter: IntentFilter;
  private fatigueManager: FatigueManager;

  // Pointer state
  private currentCursorPos: CursorPosition = { x: 0, y: 0 };
  private hoveredTarget: ResolvedTarget | null = null;
  private targetAcquiredTime = 0;

  // Locked target for active intent processing / confirmation
  private lockedTarget: ResolvedTarget | null = null;
  private pendingConfirmation: PendingConfirmation | null = null;
  private confirmationTimerId: ReturnType<typeof setTimeout> | null = null;

  // System flags
  private isPaused = false;
  private isCalibrating = false;
  private trackingActive = true;

  // Listeners
  private stateListeners: Set<FusionStateListener> = new Set();
  private executeListeners: Set<FusionExecuteListener> = new Set();
  private confirmationListeners: Set<FusionConfirmationListener> = new Set();
  private feedbackListeners: Set<FusionFeedbackListener> = new Set();
  private fatigueListeners: Set<FusionFatigueListener> = new Set();

  constructor(
    config: Partial<FusionConfig> = {},
    intentFilter = new IntentFilter(),
    fatigueManager = new FatigueManager()
  ) {
    this.config = { ...DEFAULT_FUSION_CONFIG, ...config };
    this.intentFilter = intentFilter;
    this.fatigueManager = fatigueManager;
  }

  public getState(): FusionState {
    return this.state;
  }

  public getCursorPosition(): CursorPosition {
    return this.currentCursorPos;
  }

  public getLockedTarget(): ResolvedTarget | null {
    return this.lockedTarget;
  }

  public getPendingConfirmation(): PendingConfirmation | null {
    return this.pendingConfirmation;
  }

  public getFatigueManager(): FatigueManager {
    return this.fatigueManager;
  }

  public onStateChange(listener: FusionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onExecute(listener: FusionExecuteListener): () => void {
    this.executeListeners.add(listener);
    return () => this.executeListeners.delete(listener);
  }

  public onConfirmation(listener: FusionConfirmationListener): () => void {
    this.confirmationListeners.add(listener);
    return () => this.confirmationListeners.delete(listener);
  }

  public onFeedback(listener: FusionFeedbackListener): () => void {
    this.feedbackListeners.add(listener);
    return () => this.feedbackListeners.delete(listener);
  }

  public onFatigue(listener: FusionFatigueListener): () => void {
    this.fatigueListeners.add(listener);
    return () => this.fatigueListeners.delete(listener);
  }

  public setSystemState(flags: {
    isPaused?: boolean;
    isCalibrating?: boolean;
    trackingActive?: boolean;
  }): void {
    if (flags.isPaused !== undefined) {
      this.isPaused = flags.isPaused;
      this.fatigueManager.setPaused(this.isPaused);
    }
    if (flags.isCalibrating !== undefined) this.isCalibrating = flags.isCalibrating;
    if (flags.trackingActive !== undefined) this.trackingActive = flags.trackingActive;

    if (this.isPaused || !this.trackingActive) {
      this.cancel("System paused or tracking lost");
      this.transitionTo("BLOCKED", { reason: "Tracking lost or paused" });
    } else if (this.state === "BLOCKED") {
      this.transitionTo("IDLE");
    }
  }

  /**
   * Updates virtual pointer position and element target.
   * Enforces target locking when awaiting confirmation or validating intent.
   */
  public updatePointer(
    pos: CursorPosition,
    timestamp: number,
    target: ResolvedTarget | null
  ): void {
    this.currentCursorPos = { ...pos };

    if (this.isPaused || !this.trackingActive) {
      return;
    }

    // TARGET LOCKING POLICY: If awaiting confirmation, do not change target due to drift
    if (this.state === "AWAITING_CONFIRMATION" || this.state === "VALIDATING_INTENT") {
      // Validate locked target still exists and is connected
      if (this.lockedTarget && !this.lockedTarget.element.isConnected) {
        this.cancel("Target removed from page");
        this.emitFeedback({
          type: "warning",
          code: "TARGET_DETACHED",
          message: "Target element disappeared from page.",
        });
      }
      return;
    }

    // Normal tracking: update candidate target
    if (!areTargetsEqual(this.hoveredTarget, target)) {
      if (this.hoveredTarget && !target && this.state === "TARGET_ACQUIRED") {
        this.fatigueManager.recordTargetMiss(timestamp);
      }
      this.hoveredTarget = target;
      this.targetAcquiredTime = timestamp;

      if (target && target.isActionable) {
        this.transitionTo("TARGET_ACQUIRED", { target: target.text || target.tagName });
      } else if (this.state === "TARGET_ACQUIRED") {
        this.transitionTo("IDLE");
      }
    }
  }

  /**
   * Processes a speech recognition transcript event through the fusion pipeline.
   */
  public processTranscript(event: TranscriptEvent, timestamp: number = performance.now()): void {
    // Only process final transcripts to prevent spurious interim triggers
    if (!event.isFinal) return;

    if (this.isPaused || !this.trackingActive) {
      this.emitFeedback({
        type: "warning",
        code: "SYSTEM_BLOCKED",
        message: "Commands are disabled while paused or tracking is inactive.",
      });
      return;
    }

    // Match voice command
    const match = matchCommand(event.text, event.locale);
    if (!match) {
      this.fatigueManager.recordCommandRejection(timestamp);
      this.emitFeedback({
        type: "error",
        code: "UNRECOGNIZED_COMMAND",
        message: `Command not recognized: "${event.text}"`,
      });
      return;
    }

    const action = match.command.action;

    // 1. Check for cancellation speech
    if (action.type === "cancel_action") {
      this.cancel("User cancelled by voice");
      this.emitFeedback({
        type: "info",
        code: "ACTION_CANCELLED",
        message: "Action cancelled.",
      });
      return;
    }

    // 2. Check for confirmation speech when awaiting confirmation
    if (action.type === "confirm_action") {
      if (this.state === "AWAITING_CONFIRMATION" && this.pendingConfirmation) {
        this.executeConfirmedAction(timestamp);
        return;
      }
    }

    // 3. Check fatigue controls
    if (action.type === "dismiss_break") {
      this.fatigueManager.dismissBreakSuggestion(timestamp);
      this.emitFatigueUpdate();
      return;
    }
    if (action.type === "recalibrate") {
      this.fatigueManager.recordRecalibration(timestamp);
      this.executeAction(action, null, this.intentFilter.generateIdempotencyToken(), timestamp);
      return;
    }

    // Lock target for validation
    this.lockedTarget = this.hoveredTarget;
    this.transitionTo("COMMAND_RECOGNIZED", { command: match.command.phrase });
    this.transitionTo("VALIDATING_INTENT");

    const context: IntentContext = {
      isPaused: this.isPaused,
      isCalibrating: this.isCalibrating,
      trackingActive: this.trackingActive,
      targetAcquiredAt: this.targetAcquiredTime,
      speechTimestamp: timestamp,
      now: timestamp,
      minStabilityMs: this.config.minTargetStabilityMs,
      fusionWindowMs: this.config.fusionWindowMs,
      confirmationTimeoutMs: this.config.confirmationTimeoutMs,
    };

    const validation = this.intentFilter.validate(this.lockedTarget, match, context);

    switch (validation.decision) {
      case "ALLOW": {
        const token = validation.idempotencyToken ?? this.intentFilter.generateIdempotencyToken();
        this.executeAction(action, this.lockedTarget, token, timestamp);
        break;
      }
      case "CONFIRM": {
        if (validation.pendingConfirmation) {
          this.startConfirmationWorkflow(validation.pendingConfirmation);
        }
        break;
      }
      case "REJECT": {
        this.fatigueManager.recordCommandRejection(timestamp);
        this.transitionTo("CANCELLED", { reason: validation.reasonCode });
        this.emitFeedback({
          type: "error",
          code: validation.reasonCode,
          message: validation.explanation,
        });
        this.clearLockedTarget();
        this.transitionTo("IDLE");
        break;
      }
      case "EXPIRED": {
        this.transitionTo("CANCELLED", { reason: "EXPIRED" });
        this.emitFeedback({
          type: "warning",
          code: "TEMPORAL_EXPIRED",
          message: validation.explanation,
        });
        this.clearLockedTarget();
        this.transitionTo("IDLE");
        break;
      }
    }

    this.emitFatigueUpdate();
  }

  /**
   * Confirms or rejects a pending confirmation explicitly (e.g. from UI buttons or Enter/Esc).
   */
  public resolveConfirmation(confirmed: boolean, timestamp = performance.now()): void {
    if (this.state !== "AWAITING_CONFIRMATION" || !this.pendingConfirmation) {
      return;
    }

    if (confirmed) {
      this.executeConfirmedAction(timestamp);
    } else {
      this.cancel("Confirmation declined");
      this.emitFeedback({
        type: "info",
        code: "CONFIRMATION_DECLINED",
        message: "Action cancelled by user.",
      });
    }
  }

  /**
   * Cancels any pending selection, validation, or confirmation immediately.
   */
  public cancel(reason = "Cancelled"): void {
    if (this.confirmationTimerId) {
      clearTimeout(this.confirmationTimerId);
      this.confirmationTimerId = null;
    }
    this.pendingConfirmation = null;
    this.notifyConfirmationListeners(null);
    this.clearLockedTarget();
    this.transitionTo("CANCELLED", { reason });
    this.transitionTo("IDLE");
  }

  private startConfirmationWorkflow(pending: PendingConfirmation): void {
    this.pendingConfirmation = pending;
    this.transitionTo("AWAITING_CONFIRMATION", {
      target: pending.targetDescription,
      risk: pending.risk,
    });

    this.notifyConfirmationListeners(pending);
    this.emitFeedback({
      type: "warning",
      code: "CONFIRMATION_REQUIRED",
      message: `Confirm ${pending.actionType} on "${pending.targetDescription}"? Say "Confirm" or press Enter.`,
      targetDescription: pending.targetDescription,
    });

    if (this.confirmationTimerId) {
      clearTimeout(this.confirmationTimerId);
    }

    this.confirmationTimerId = setTimeout(() => {
      if (this.state === "AWAITING_CONFIRMATION" && this.pendingConfirmation?.id === pending.id) {
        this.cancel("Confirmation timed out");
        this.emitFeedback({
          type: "warning",
          code: "CONFIRMATION_TIMEOUT",
          message: "Confirmation timed out.",
        });
      }
    }, this.config.confirmationTimeoutMs);
  }

  private executeConfirmedAction(timestamp: number): void {
    if (!this.pendingConfirmation) return;

    if (this.confirmationTimerId) {
      clearTimeout(this.confirmationTimerId);
      this.confirmationTimerId = null;
    }

    const target = this.lockedTarget;
    const action: CommandAction = (this.pendingConfirmation.data as unknown as CommandAction) ?? {
      type: "click",
    };
    const token = this.pendingConfirmation.id;

    this.pendingConfirmation = null;
    this.notifyConfirmationListeners(null);

    this.emitFeedback({
      type: "success",
      code: "ACTION_CONFIRMED",
      message: "Action confirmed. Executing…",
    });

    this.executeAction(action, target, token, timestamp);
  }

  private executeAction(
    action: CommandAction,
    target: ResolvedTarget | null,
    token: string,
    timestamp: number
  ): void {
    this.transitionTo("EXECUTING", { action: action.type });

    // Record interaction with target for fatigue monitoring
    if (target) {
      this.fatigueManager.recordTargetInteraction(target.element, timestamp);
    }

    // Notify execution listeners
    for (const listener of this.executeListeners) {
      try {
        listener(action, target, token);
      } catch (err) {
        console.error("Execution listener error:", err);
      }
    }

    this.emitFeedback({
      type: "success",
      code: "ACTION_EXECUTED",
      message: `Executed: ${action.type}`,
      targetDescription: target ? target.text || target.tagName : undefined,
    });

    this.clearLockedTarget();
    this.transitionTo("IDLE");
  }

  private clearLockedTarget(): void {
    this.lockedTarget = null;
  }

  private transitionTo(nextState: FusionState, details?: Record<string, unknown>): void {
    this.state = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(nextState, details);
      } catch (err) {
        console.error("Fusion state listener error:", err);
      }
    }
  }

  private emitFeedback(feedback: FusionFeedback): void {
    for (const listener of this.feedbackListeners) {
      try {
        listener(feedback);
      } catch (err) {
        console.error("Feedback listener error:", err);
      }
    }
  }

  private emitFatigueUpdate(): void {
    const fatigueState = this.fatigueManager.getState();
    const recommendation = this.fatigueManager.getAdaptiveRecommendation();
    for (const listener of this.fatigueListeners) {
      try {
        listener(fatigueState, recommendation.explanation);
      } catch (err) {
        console.error("Fatigue listener error:", err);
      }
    }
  }

  private notifyConfirmationListeners(pending: PendingConfirmation | null): void {
    for (const listener of this.confirmationListeners) {
      try {
        listener(pending);
      } catch (err) {
        console.error("Confirmation listener error:", err);
      }
    }
  }
}
