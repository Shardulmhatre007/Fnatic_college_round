/**
 * Intent Filter and Safety Gate.
 *
 * Authoritative single decision gate between recognized multimodal intent
 * and browser action execution. Validates tracking state, target stability,
 * temporal freshness, consequence risk tier, and prevents duplicate activations.
 */
import type {
  ActionRiskLevel,
  IntentDecision,
  PendingConfirmation,
  ResolvedTarget,
} from "@/shared/types";
import type { CommandMatch } from "../commands/index";

export interface IntentContext {
  /** Whether the system is paused. */
  isPaused: boolean;
  /** Whether calibration is currently active. */
  isCalibrating: boolean;
  /** Whether head/camera tracking is active. */
  trackingActive: boolean;
  /** Timestamp when target was first continuously acquired. */
  targetAcquiredAt?: number;
  /** Timestamp of the speech event. */
  speechTimestamp: number;
  /** Current evaluation timestamp. */
  now: number;
  /** Target stability duration required in milliseconds. Default: 150ms. */
  minStabilityMs?: number;
  /** Maximum elapsed time allowed between pointer hover and speech. Default: 2500ms. */
  fusionWindowMs?: number;
  /** Timeout for confirmations in milliseconds. Default: 7000ms. */
  confirmationTimeoutMs?: number;
}

export interface IntentValidationResult {
  decision: IntentDecision;
  reasonCode: string;
  explanation: string;
  risk: ActionRiskLevel;
  idempotencyToken?: string;
  pendingConfirmation?: PendingConfirmation;
}

/** Actions that strictly require a target under the virtual cursor. */
const TARGET_DEPENDENT_ACTIONS = new Set<string>([
  "click",
  "click_this",
  "open_this",
]);

let executionCounter = 0;

export class IntentFilter {
  private lastExecutedToken = "";
  private lastExecutionTime = 0;
  private readonly duplicateCooldownMs = 500;

  /**
   * Generates a unique, non-colliding execution idempotency token.
   */
  public generateIdempotencyToken(): string {
    executionCounter += 1;
    return `exec_${Date.now()}_${executionCounter}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Validates a candidate action against target, speech match, and system state.
   */
  public validate(
    target: ResolvedTarget | null,
    match: CommandMatch | null,
    context: IntentContext
  ): IntentValidationResult {
    const minStabilityMs = context.minStabilityMs ?? 150;
    const fusionWindowMs = context.fusionWindowMs ?? 2500;
    const confirmationTimeoutMs = context.confirmationTimeoutMs ?? 7000;

    // 1. Application state verification
    if (context.isPaused) {
      return {
        decision: "REJECT",
        reasonCode: "SYSTEM_PAUSED",
        explanation: "Action blocked because Handsfree is currently paused.",
        risk: "low",
      };
    }

    if (context.isCalibrating) {
      return {
        decision: "REJECT",
        reasonCode: "CALIBRATION_ACTIVE",
        explanation: "Actions are disabled during active calibration.",
        risk: "low",
      };
    }

    if (!context.trackingActive) {
      return {
        decision: "REJECT",
        reasonCode: "TRACKING_INACTIVE",
        explanation: "Action blocked because camera tracking is lost or inactive.",
        risk: "low",
      };
    }

    // 2. Command match verification
    if (!match) {
      return {
        decision: "REJECT",
        reasonCode: "UNRECOGNIZED_COMMAND",
        explanation: "Speech phrase did not match any supported command.",
        risk: "low",
      };
    }

    if (match.confidence < 0.72) {
      return {
        decision: "REJECT",
        reasonCode: "LOW_CONFIDENCE",
        explanation: `Command confidence (${Math.round(match.confidence * 100)}%) is too low to act reliably.`,
        risk: "low",
      };
    }

    const action = match.command.action;
    const isTargetDependent = TARGET_DEPENDENT_ACTIONS.has(action.type);

    // 3. Target requirement and validity
    if (isTargetDependent) {
      if (!target || !target.isActionable) {
        return {
          decision: "REJECT",
          reasonCode: "NO_ACTIONABLE_TARGET",
          explanation: "Please point at an interactive button, link, or input first.",
          risk: "low",
        };
      }

      // 4. Target stability check
      const acquiredAt = context.targetAcquiredAt ?? context.now;
      const dwellDuration = context.now - acquiredAt;
      if (dwellDuration < minStabilityMs) {
        return {
          decision: "REJECT",
          reasonCode: "TARGET_UNSTABLE",
          explanation: "Target is not stable enough; hold cursor steady before speaking.",
          risk: "low",
        };
      }

      // 5. Temporal freshness check
      const speechAge = context.now - context.speechTimestamp;
      if (speechAge > fusionWindowMs) {
        return {
          decision: "EXPIRED",
          reasonCode: "TEMPORAL_WINDOW_EXPIRED",
          explanation: "Speech command arrived too long after pointing at target.",
          risk: "low",
        };
      }

      // 6. Semantic consistency check (e.g. open_this requires link or navigatable element)
      if (action.type === "open_this" && target.tagName !== "a" && !target.href) {
        // Fall back gracefully to click if element is a button
        if (target.tagName !== "button" && target.role !== "button") {
          return {
            decision: "REJECT",
            reasonCode: "INCOMPATIBLE_TARGET",
            explanation: "Target cannot be opened like a link.",
            risk: target.risk,
          };
        }
      }
    }

    // 7. Duplicate command prevention
    if (
      context.now - this.lastExecutionTime < this.duplicateCooldownMs &&
      this.lastExecutedToken !== ""
    ) {
      return {
        decision: "REJECT",
        reasonCode: "DUPLICATE_SUPPRESSED",
        explanation: "Rapid duplicate command ignored.",
        risk: "low",
      };
    }

    // 8. Risk classification & Confirmation gate
    const risk: ActionRiskLevel = target ? target.risk : "low";

    if (risk === "high") {
      const targetLabel = target ? (target.text || target.ariaLabel || target.tagName) : "element";
      const pending: PendingConfirmation = {
        id: this.generateIdempotencyToken(),
        actionType: action.type,
        targetDescription: targetLabel,
        risk: "high",
        createdAt: context.now,
        expiresAt: context.now + confirmationTimeoutMs,
        data: action as unknown as Record<string, unknown>,
      };

      return {
        decision: "CONFIRM",
        reasonCode: "HIGH_RISK_CONFIRMATION_REQUIRED",
        explanation: `Confirmation required for high-consequence action on "${targetLabel}".`,
        risk: "high",
        pendingConfirmation: pending,
      };
    }

    // Low and moderate risk actions proceed
    const token = this.generateIdempotencyToken();
    this.lastExecutedToken = token;
    this.lastExecutionTime = context.now;

    return {
      decision: "ALLOW",
      reasonCode: "INTENT_VALIDATED",
      explanation: "Intent verified and authorized for execution.",
      risk,
      idempotencyToken: token,
    };
  }

  /**
   * Resets internal duplicate and execution tracking state.
   */
  public reset(): void {
    this.lastExecutedToken = "";
    this.lastExecutionTime = 0;
  }
}
