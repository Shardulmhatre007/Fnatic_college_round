/**
 * Fatigue and Interaction-Effort Management.
 *
 * Implements observable interaction-strain indicators (NOT medical claims).
 * Evaluates session duration, repeated target slips, command rejection bursts,
 * and high-effort pointing difficulty to offer break suggestions and comfort
 * adjustments with hysteresis and user controls.
 */
import type { EffortMetrics, FatigueState } from "@/shared/types";

export interface FatigueConfig {
  /** Maximum continuous active session before recommending a break (default: 25 mins). */
  sessionBreakThresholdMs: number;
  /** Rolling window for error bursts in ms (default: 60s). */
  rollingWindowMs: number;
  /** Cooldown between break suggestion prompts to avoid annoying the user (default: 10 mins). */
  breakPromptCooldownMs: number;
  /** Target miss count in window to elevate effort (default: 5). */
  missThreshold: number;
  /** Command rejection count in window to elevate effort (default: 4). */
  rejectionThreshold: number;
  /** Strain score threshold to suggest a break (default: 0.65). */
  strainThreshold: number;
}

export const DEFAULT_FATIGUE_CONFIG: Readonly<FatigueConfig> = Object.freeze({
  sessionBreakThresholdMs: 25 * 60 * 1000, // 25 minutes
  rollingWindowMs: 60 * 1000,             // 60 seconds
  breakPromptCooldownMs: 10 * 60 * 1000,   // 10 minutes
  missThreshold: 5,
  rejectionThreshold: 4,
  strainThreshold: 0.65,
});

interface TimestampedEvent {
  timestamp: number;
}

export class FatigueManager {
  private config: FatigueConfig;
  private state: FatigueState = "NORMAL";
  private sessionStartTime: number;
  private lastBreakPromptTime = 0;
  private targetMisses: TimestampedEvent[] = [];
  private commandRejections: TimestampedEvent[] = [];
  private recalibrationCount = 0;
  private repeatAttemptCount = 0;
  private lastTargetElement: HTMLElement | null = null;
  private lastTargetAttemptTime = 0;

  constructor(config: Partial<FatigueConfig> = {}, startTime = performance.now()) {
    this.config = { ...DEFAULT_FATIGUE_CONFIG, ...config };
    this.sessionStartTime = startTime;
  }

  public getState(): FatigueState {
    return this.state;
  }

  public setPaused(paused: boolean): void {
    if (paused) {
      this.state = "PAUSED";
    } else if (this.state === "PAUSED") {
      this.state = "NORMAL";
    }
  }

  /**
   * Records a target slip or lost target during attempted selection.
   */
  public recordTargetMiss(timestamp = performance.now()): void {
    this.targetMisses.push({ timestamp });
    this.pruneOldEvents(timestamp);
    this.evaluateState(timestamp);
  }

  /**
   * Records an unrecognized or rejected voice command.
   */
  public recordCommandRejection(timestamp = performance.now()): void {
    this.commandRejections.push({ timestamp });
    this.pruneOldEvents(timestamp);
    this.evaluateState(timestamp);
  }

  /**
   * Records an attempt to interact with a target. Detects rapid repeated attempts.
   */
  public recordTargetInteraction(el: HTMLElement | null, timestamp = performance.now()): void {
    if (el && this.lastTargetElement === el && timestamp - this.lastTargetAttemptTime < 8000) {
      this.repeatAttemptCount += 1;
    }
    this.lastTargetElement = el;
    this.lastTargetAttemptTime = timestamp;
    this.evaluateState(timestamp);
  }

  /**
   * Records that recalibration was requested or performed.
   */
  public recordRecalibration(timestamp = performance.now()): void {
    this.recalibrationCount += 1;
    this.evaluateState(timestamp);
  }

  /**
   * User dismisses break suggestion prompt. Enters cooldown.
   */
  public dismissBreakSuggestion(timestamp = performance.now()): void {
    this.lastBreakPromptTime = timestamp;
    this.state = "NORMAL";
  }

  /**
   * Resets session timer (e.g. after a genuine break).
   */
  public resetSession(timestamp = performance.now()): void {
    this.sessionStartTime = timestamp;
    this.targetMisses = [];
    this.commandRejections = [];
    this.repeatAttemptCount = 0;
    this.recalibrationCount = 0;
    this.state = "NORMAL";
  }

  /**
   * Computes a normalized strain score [0.0, 1.0] based on recent interaction difficulty.
   */
  public calculateStrainScore(timestamp = performance.now()): number {
    this.pruneOldEvents(timestamp);

    const missFactor = Math.min(this.targetMisses.length / this.config.missThreshold, 1.0) * 0.35;
    const rejFactor =
      Math.min(this.commandRejections.length / this.config.rejectionThreshold, 1.0) * 0.30;
    const sessionDuration = timestamp - this.sessionStartTime;
    const durationFactor =
      Math.min(sessionDuration / this.config.sessionBreakThresholdMs, 1.0) * 0.35;

    return Math.round((missFactor + rejFactor + durationFactor) * 100) / 100;
  }

  /**
   * Returns current effort metrics snapshot.
   */
  public getMetrics(timestamp = performance.now()): EffortMetrics {
    this.pruneOldEvents(timestamp);
    return {
      sessionDurationMs: Math.round(timestamp - this.sessionStartTime),
      failedAcquisitions: this.targetMisses.length,
      rejectedCommands: this.commandRejections.length,
      repeatAttempts: this.repeatAttemptCount,
      recalibrationRequests: this.recalibrationCount,
      strainScore: this.calculateStrainScore(timestamp),
    };
  }

  /**
   * Suggests safe adaptive tuning adjustments when strain is elevated.
   * NOTE: Never makes pointer more sensitive or bypasses intent gates.
   */
  public getAdaptiveRecommendation(): {
    suggestBreak: boolean;
    suggestRecalibration: boolean;
    recommendedSmoothingMin?: number;
    explanation: string;
  } {
    const metrics = this.getMetrics();
    const suggestBreak = this.state === "BREAK_SUGGESTED";
    const suggestRecalibration = metrics.failedAcquisitions >= 4 || metrics.recalibrationRequests > 1;

    let explanation = "Interaction effort is currently nominal.";
    if (suggestBreak) {
      explanation = "Extended interaction session observed. Taking a 2-minute break is recommended.";
    } else if (metrics.strainScore >= 0.4) {
      explanation =
        "Higher pointing strain observed. You can recalibrate or enable higher smoothing for stability.";
    }

    return {
      suggestBreak,
      suggestRecalibration,
      recommendedSmoothingMin: metrics.strainScore >= 0.4 ? 0.02 : undefined,
      explanation,
    };
  }

  private pruneOldEvents(now: number): void {
    const cutoff = now - this.config.rollingWindowMs;
    this.targetMisses = this.targetMisses.filter((e) => e.timestamp >= cutoff);
    this.commandRejections = this.commandRejections.filter((e) => e.timestamp >= cutoff);
  }

  private evaluateState(now: number): void {
    if (this.state === "PAUSED") return;

    const score = this.calculateStrainScore(now);
    const sessionDuration = now - this.sessionStartTime;
    const timeSinceLastPrompt = now - this.lastBreakPromptTime;

    // Check if session length or high strain qualifies for break suggestion
    if (
      (sessionDuration >= this.config.sessionBreakThresholdMs || score >= this.config.strainThreshold) &&
      timeSinceLastPrompt >= this.config.breakPromptCooldownMs
    ) {
      this.state = "BREAK_SUGGESTED";
      this.lastBreakPromptTime = now;
      return;
    }

    // Elevated effort tier
    if (score >= 0.4 && this.state !== "BREAK_SUGGESTED") {
      this.state = "EFFORT_ELEVATED";
      return;
    }

    // Nominal
    if (score < 0.4 && this.state !== "BREAK_SUGGESTED") {
      this.state = "NORMAL";
    }
  }
}
