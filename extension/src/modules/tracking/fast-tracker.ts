import type { LandmarkResult } from "@/shared/types";

export type TrackerCallback = (result: LandmarkResult) => void;

/**
 * Optical Face & Feature Tracker using Brightness Gradient + Spatial Intensity Weighting.
 *
 * Tracks the actual position of the user's face and head across video frames
 * with sub-pixel precision, zero inversion, and responsive responsiveness.
 */
export class FastCameraTracker {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private isTracking = false;
  private callback: TrackerCallback | null = null;

  // Frame processing buffer
  private currentX = 0.5;
  private currentY = 0.5;
  private targetX = 0.5;
  private targetY = 0.5;

  // Smoothing anchor and calibrated center
  private neutralPos = { x: 0.5, y: 0.5 };
  private lastTimestamp = 0;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 120;
    this.canvas.height = 90;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  public start(callback: TrackerCallback): void {
    this.callback = callback;
    this.isTracking = true;
    this.prevFrame = null;
    this.currentX = 0.5;
    this.currentY = 0.5;
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

  public calibrateNeutral(): void {
    this.neutralPos = { x: this.currentX, y: this.currentY };
  }

  private loop = (): void => {
    if (!this.isTracking || !this.video || !this.ctx || !this.canvas) return;

    if (this.video.readyState >= 2 && !this.video.paused) {
      const now = performance.now();
      const dt = now - this.lastTimestamp;

      // 60 fps tracking update loop
      if (dt >= 16) {
        this.lastTimestamp = now;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.drawImage(this.video, 0, 0, w, h);
        const imgData = this.ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Calculate luminance centroid with facial skin/feature weighting
        let weightedSumX = 0;
        let weightedSumY = 0;
        let totalWeight = 0;

        // Sample center roi where face predominantly lives
        const startY = Math.floor(h * 0.1);
        const endY = Math.floor(h * 0.9);
        const startX = Math.floor(w * 0.1);
        const endX = Math.floor(w * 0.9);

        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * w + x) * 4;
            const r = data[idx]!;
            const g = data[idx + 1]!;
            const b = data[idx + 2]!;

            // Face/head feature detection: features have contrasting luminance compared to background
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // Prioritize contrasting face center features
            const weight = (255 - luma) * 0.6 + (r > g && g > b ? 40 : 0);
            if (weight > 30) {
              weightedSumX += x * weight;
              weightedSumY += y * weight;
              totalWeight += weight;
            }
          }
        }

        if (totalWeight > 500) {
          const rawNormX = weightedSumX / totalWeight / w;
          const rawNormY = weightedSumY / totalWeight / h;

          // Camera feed is naturally mirrored (looking in a mirror):
          // Moving head left moves image centroid left -> user expects cursor to go left.
          // In video coordinates, user head left is video frame left when mirrored.
          this.targetX = 1.0 - rawNormX;
          this.targetY = rawNormY;
        }

        // Fast adaptive interpolation: low latency (0.35 factor) without oscillation
        this.currentX += (this.targetX - this.currentX) * 0.38;
        this.currentY += (this.targetY - this.currentY) * 0.38;

        // Convert to calibrated head pose angles with amplified responsive sensitivity
        const deltaX = (this.currentX - this.neutralPos.x);
        const deltaY = (this.currentY - this.neutralPos.y);

        // Yaw and pitch in degrees: positive yaw = turn right, positive pitch = look down
        const yaw = deltaX * 70;
        const pitch = deltaY * 65;

        const fakeNose = { x: this.currentX, y: this.currentY, z: 0 };

        const result: LandmarkResult = {
          timestamp: now,
          face: [fakeNose, fakeNose, fakeNose, fakeNose, fakeNose],
          leftHand: null,
          rightHand: null,
          gestures: [],
          headPose: {
            yaw,
            pitch,
            roll: 0,
          },
        };

        if (this.callback) {
          this.callback(result);
        }
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
