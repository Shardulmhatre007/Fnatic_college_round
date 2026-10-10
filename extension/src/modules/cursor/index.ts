import type { CursorPosition, LandmarkResult } from "@/shared/types";
import { DEFAULT_CURSOR_CONFIG, type CursorConfig } from "./config";
import { OneEuroFilter2D } from "./one-euro-filter";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface SnapTarget {
  id: string;
  x: number;
  y: number;
  radius?: number;
}

export class CursorManager {
  private filter: OneEuroFilter2D;
  private config: CursorConfig;
  private currentPos: CursorPosition = { x: 0, y: 0 };
  private calibratedNeutral: { pitch: number; yaw: number } = { pitch: 0, yaw: 0 };
  private sensitivity: { x: number; y: number } = { x: 2.2, y: 2.0 };

  constructor(config: CursorConfig = DEFAULT_CURSOR_CONFIG) {
    this.config = config;
    this.filter = new OneEuroFilter2D(
      config.filterMinCutoff,
      config.filterBeta,
      config.filterDcutoff
    );
  }

  public setConfig(config: Partial<CursorConfig>): void {
    this.config = { ...this.config, ...config };
    this.filter.setParams(
      this.config.filterMinCutoff,
      this.config.filterBeta,
      this.config.filterDcutoff
    );
  }

  public setNeutral(pitch: number, yaw: number): void {
    this.calibratedNeutral = { pitch, yaw };
  }

  public setSensitivity(x: number, y: number): void {
    this.sensitivity = { x, y };
  }

  public updateCursor(
    landmarks: LandmarkResult,
    viewport: ViewportSize
  ): CursorPosition {
    let rawX = this.currentPos.x;
    let rawY = this.currentPos.y;

    if (landmarks.headPose) {
      const relYaw = landmarks.headPose.yaw - this.calibratedNeutral.yaw;
      const relPitch = landmarks.headPose.pitch - this.calibratedNeutral.pitch;

      const normX = 0.5 - relYaw * this.sensitivity.x * 0.02;
      const normY = 0.5 + relPitch * this.sensitivity.y * 0.02;

      const clampedX = Math.min(Math.max(normX, 0), 1);
      const clampedY = Math.min(Math.max(normY, 0), 1);

      rawX = clampedX * viewport.width;
      rawY = clampedY * viewport.height;
    } else if (landmarks.face && landmarks.face.length > 0) {
      // Fallback: use nose tip / face landmark 4
      const nose = landmarks.face[4] ?? landmarks.face[0];
      if (nose) {
        // Mirrored webcam tracking: 1 - x
        rawX = (1 - nose.x) * viewport.width;
        rawY = nose.y * viewport.height;
      }
    }

    const smoothed = this.filter.filter(rawX, rawY, landmarks.timestamp);
    this.currentPos = {
      x: Math.round(smoothed.x * 10) / 10,
      y: Math.round(smoothed.y * 10) / 10,
    };

    return this.currentPos;
  }

  public snapToNearest(pos: CursorPosition, targets: SnapTarget[]): CursorPosition {
    if (targets.length === 0) return pos;

    let nearest: SnapTarget | null = null;
    let minDistanceSq = Number.POSITIVE_INFINITY;
    const snapRadiusSq = this.config.snapRadiusPx * this.config.snapRadiusPx;

    for (const target of targets) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const distSq = dx * dx + dy * dy;
      const effectiveRadiusSq = target.radius
        ? target.radius * target.radius
        : snapRadiusSq;

      if (distSq < effectiveRadiusSq && distSq < minDistanceSq) {
        minDistanceSq = distSq;
        nearest = target;
      }
    }

    if (!nearest) return pos;

    const strength = this.config.snapStrength;
    return {
      x: Math.round(pos.x + (nearest.x - pos.x) * strength),
      y: Math.round(pos.y + (nearest.y - pos.y) * strength),
    };
  }

  public getPosition(): CursorPosition {
    return this.currentPos;
  }

  public reset(): void {
    this.filter.reset();
  }
}

// Global default singleton instance
const defaultCursorManager = new CursorManager();

export function updateCursor(
  landmarks: LandmarkResult,
  viewport: ViewportSize
): CursorPosition {
  return defaultCursorManager.updateCursor(landmarks, viewport);
}

export function snapToNearest(
  pos: CursorPosition,
  targets: SnapTarget[]
): CursorPosition {
  return defaultCursorManager.snapToNearest(pos, targets);
}

export type { CursorPosition };
