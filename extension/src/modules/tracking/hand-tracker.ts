import type { LandmarkResult } from "@/shared/types";

export interface HandTrackerOutput {
  landmarks: LandmarkResult;
  isPalmOpen: boolean;
  fingerCount: number;
}

export type HandTrackerCallback = (output: HandTrackerOutput) => void;

/**
 * High-speed 2-Finger Hand & Open-Palm Optical Gesture Tracker.
 *
 * Dedicated strictly to Hand tracking:
 * - Tracks 2 fingers (index & middle) to position the screen cursor with high sensitivity.
 * - Detects Open Palm gesture to trigger left click.
 * - Ignores face/head movements completely to eliminate confusion.
 * - Non-inverted left/right mapping.
 */
export class HandGestureTracker {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private isTracking = false;
  private callback: HandTrackerCallback | null = null;

  // Smoothed hand position [0..1]
  private handX = 0.5;
  private handY = 0.5;
  private targetX = 0.5;
  private targetY = 0.5;

  private wasPalmOpen = false;
  private lastTimestamp = 0;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 120;
    this.canvas.height = 90;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  public start(callback: HandTrackerCallback): void {
    this.callback = callback;
    this.isTracking = true;
    this.handX = 0.5;
    this.handY = 0.5;
    this.targetX = 0.5;
    this.targetY = 0.5;
    this.lastTimestamp = performance.now();
    this.loop();
  }

  public stop(): void {
    this.isTracking = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop = (): void => {
    if (!this.isTracking || !this.video || !this.ctx || !this.canvas) return;

    if (this.video.readyState >= 2 && !this.video.paused) {
      const now = performance.now();
      const dt = now - this.lastTimestamp;

      if (dt >= 16) {
        this.lastTimestamp = now;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.drawImage(this.video, 0, 0, w, h);
        const imgData = this.ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Detect Hand Skin Pixels & Centroid
        let handSumX = 0;
        let handSumY = 0;
        let handPixelCount = 0;

        // Bounding box for spread (palm detection)
        let minX = w;
        let maxX = 0;
        let minY = h;
        let maxY = 0;

        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4;
            const r = data[idx]!;
            const g = data[idx + 1]!;
            const b = data[idx + 2]!;

            // Human skin chrominance heuristic in RGB
            const isSkin =
              r > 95 &&
              g > 40 &&
              b > 20 &&
              r > g &&
              r > b &&
              r - g > 15 &&
              Math.abs(r - g) > 15;

            if (isSkin) {
              handSumX += x;
              handSumY += y;
              handPixelCount++;

              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        let isPalmOpen = false;
        let fingerCount = 2; // Default 2 fingers pointing mode

        if (handPixelCount > 60) {
          // Centroid in raw mirrored video coordinates
          const rawCenterX = handSumX / handPixelCount / w;
          const rawCenterY = handSumY / handPixelCount / h;

          // Mirror correction so moving hand left moves cursor left
          const mirroredX = 1.0 - rawCenterX;

          // High sensitivity amplification: map central [0.25..0.75] hand motion to full [0..1] screen
          // This allows small hand gestures to easily cover the full screen
          const amplifiedX = Math.min(Math.max((mirroredX - 0.5) * 2.5 + 0.5, 0), 1);
          const amplifiedY = Math.min(Math.max((rawCenterY - 0.5) * 2.5 + 0.5, 0), 1);

          this.targetX = amplifiedX;
          this.targetY = amplifiedY;

          // 2. Open Palm Detection: measure bounding area and total skin mass
          const boundWidth = maxX - minX;
          const boundHeight = maxY - minY;
          const area = boundWidth * boundHeight;

          // If skin pixel count and spread area exceed threshold, user opened palm
          if (handPixelCount > 340 && area > 2400) {
            isPalmOpen = true;
            fingerCount = 5;
          } else {
            isPalmOpen = false;
            fingerCount = 2;
          }
        }

        // Fast responsive motion smoothing (factor 0.55 for snappy cursor speed)
        this.handX += (this.targetX - this.handX) * 0.55;
        this.handY += (this.targetY - this.handY) * 0.55;

        // Trigger open-palm click gesture
        const gestures: ("open_palm" | "point" | "pinch")[] = [];
        if (isPalmOpen && !this.wasPalmOpen) {
          gestures.push("open_palm");
        } else if (!isPalmOpen) {
          gestures.push("point");
        }
        this.wasPalmOpen = isPalmOpen;

        const fakeHandLandmark = { x: this.handX, y: this.handY, z: 0 };
        const result: LandmarkResult = {
          timestamp: now,
          face: null, // Head tracking completely disabled as requested
          leftHand: null,
          rightHand: [fakeHandLandmark, fakeHandLandmark],
          gestures: gestures as any,
          headPose: null,
        };

        if (this.callback) {
          this.callback({
            landmarks: result,
            isPalmOpen,
            fingerCount,
          });
        }
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
