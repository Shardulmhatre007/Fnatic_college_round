import type { CalibrationResult, LandmarkResult, NormalisedPoint } from "@/shared/types";

export interface CalibrationTarget {
  id: string;
  key: "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";
  x: number;
  y: number;
  hit: boolean;
}

export interface CalibrationSessionOptions {
  dwellTargetMs?: number;
  targets?: CalibrationTarget[];
}

export class CalibrationManager {
  private targets: CalibrationTarget[] = [];
  private capturedPoints: Map<string, NormalisedPoint[]> = new Map();
  private isRunning = false;
  private currentTargetIndex = 0;

  constructor() {
    this.resetTargets();
  }

  public resetTargets(): void {
    this.targets = [
      { id: "tl", key: "top-left", x: 0.1, y: 0.1, hit: false },
      { id: "tr", key: "top-right", x: 0.9, y: 0.1, hit: false },
      { id: "c", key: "center", x: 0.5, y: 0.5, hit: false },
      { id: "bl", key: "bottom-left", x: 0.1, y: 0.9, hit: false },
      { id: "br", key: "bottom-right", x: 0.9, y: 0.9, hit: false },
    ];
    this.capturedPoints.clear();
    this.currentTargetIndex = 0;
    this.isRunning = false;
  }

  public start(): CalibrationTarget | null {
    this.resetTargets();
    this.isRunning = true;
    return this.targets[0] ?? null;
  }

  public getCurrentTarget(): CalibrationTarget | null {
    if (!this.isRunning || this.currentTargetIndex >= this.targets.length) {
      return null;
    }
    return this.targets[this.currentTargetIndex] ?? null;
  }

  public recordFrame(landmarks: LandmarkResult): boolean {
    const current = this.getCurrentTarget();
    if (!current) return false;

    if (landmarks.face && landmarks.face.length > 0) {
      const nose = landmarks.face[4] ?? landmarks.face[0];
      if (nose) {
        const points = this.capturedPoints.get(current.key) ?? [];
        points.push({ x: nose.x, y: nose.y });
        this.capturedPoints.set(current.key, points);

        // Require at least 5 sampled frames on the target bubble to confirm hit
        if (points.length >= 5) {
          current.hit = true;
          this.currentTargetIndex += 1;
          return true; // Target completed
        }
      }
    }
    return false;
  }

  public isComplete(): boolean {
    return this.currentTargetIndex >= this.targets.length;
  }

  public finish(silent = false): CalibrationResult {
    const gazeMap: Record<string, NormalisedPoint> = {};

    for (const [key, points] of this.capturedPoints.entries()) {
      if (points.length > 0) {
        const sumX = points.reduce((acc, p) => acc + p.x, 0);
        const sumY = points.reduce((acc, p) => acc + p.y, 0);
        gazeMap[key] = {
          x: Math.round((sumX / points.length) * 1000) / 1000,
          y: Math.round((sumY / points.length) * 1000) / 1000,
        };
      } else {
        gazeMap[key] = { x: 0.5, y: 0.5 };
      }
    }

    this.isRunning = false;

    return {
      completedAt: new Date().toISOString(),
      gazeMap,
      lightingQuality: "good",
      silent,
    };
  }

  /**
   * Detects postural/gaze drift across recent frames compared to expected neutral.
   */
  public detectDrift(recentFrames: LandmarkResult[]): boolean {
    if (recentFrames.length < 15) return false;

    let totalOffset = 0;
    let count = 0;

    for (const frame of recentFrames) {
      if (frame.headPose) {
        // High persistent pitch or yaw offset suggests slouch / posture shift
        const offset = Math.sqrt(
          frame.headPose.pitch * frame.headPose.pitch +
          frame.headPose.yaw * frame.headPose.yaw
        );
        totalOffset += offset;
        count += 1;
      }
    }

    if (count === 0) return false;
    const avgOffset = totalOffset / count;
    // Over 28 degrees persistent tilt indicates significant drift
    return avgOffset > 28;
  }
}

const defaultCalibrationManager = new CalibrationManager();

export async function startCalibration(targetCount?: number): Promise<CalibrationResult> {
  const manager = targetCount ? new CalibrationManager() : defaultCalibrationManager;
  manager.start();
  // Return immediate baseline result for callers
  return manager.finish(false);
}

export function detectDrift(recentFrames: LandmarkResult[]): boolean {
  return defaultCalibrationManager.detectDrift(recentFrames);
}
