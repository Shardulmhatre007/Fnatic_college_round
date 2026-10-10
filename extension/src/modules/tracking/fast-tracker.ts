import type { GestureId, LandmarkResult } from "@/shared/types";

export type TrackerCallback = (result: LandmarkResult) => void;

/** Fraction of the sample width used as the mean-shift search window radius. */
const SEARCH_WINDOW_FRACTION = 0.22;
/** Pixel-luminosity difference above which a pixel counts as motion. */
const MOTION_DIFF_THRESHOLD = 45;
/** Simulated pitch delta (in tracker degrees) that triggers a nod gesture. */
const NOD_THRESHOLD_DEG = 6;
/** Pixels closer than this to the previous head estimate are weighted by motion. */
const SAMPLE_STEP = 2;

/**
 * Optical tracker using HTML5 Canvas & pixel luminosity difference
 * to track head movements and position in real-time without blocking WASM threads.
 */
export class FastCameraTracker {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private isTracking = false;
  private callback: TrackerCallback | null = null;

  private prevFrameData: Uint8ClampedArray | null = null;
  private neutralPos = { x: 0.5, y: 0.5 };
  private currentHead = { x: 0.5, y: 0.5 };
  private lastTimestamp = 0;
  private lastPitch = 0;
  private nodArmed = true;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  public start(callback: TrackerCallback): void {
    this.callback = callback;
    this.isTracking = true;
    this.prevFrameData = null;
    this.lastTimestamp = performance.now();
    this.lastPitch = 0;
    this.nodArmed = true;
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
    this.neutralPos = { ...this.currentHead };
  }

  private loop = (): void => {
    if (!this.isTracking || !this.video || !this.ctx || !this.canvas) return;

    if (this.video.readyState >= 2) {
      const now = performance.now();
      const dt = now - this.lastTimestamp;

      // Limit tracking loop to ~30-40 fps to avoid CPU drain
      if (dt >= 25) {
        this.lastTimestamp = now;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imgData.data;

        // Weighted centroid of motion, restricted to a search window around the
        // previous head estimate so revealed background cannot drag the cursor.
        let sumX = 0;
        let sumY = 0;
        let weight = 0;

        if (this.prevFrameData) {
          const centerX = this.currentHead.x * this.canvas.width;
          const centerY = this.currentHead.y * this.canvas.height;
          const radius = this.canvas.width * SEARCH_WINDOW_FRACTION;
          const radiusSq = radius * radius;

          for (let y = 0; y < this.canvas.height; y += SAMPLE_STEP) {
            for (let x = 0; x < this.canvas.width; x += SAMPLE_STEP) {
              const idx = (y * this.canvas.width + x) * 4;
              const diff =
                Math.abs(data[idx]! - this.prevFrameData[idx]!) +
                Math.abs(data[idx + 1]! - this.prevFrameData[idx + 1]!) +
                Math.abs(data[idx + 2]! - this.prevFrameData[idx + 2]!);

              if (diff <= MOTION_DIFF_THRESHOLD) continue;

              const dxp = x - centerX;
              const dyp = y - centerY;
              if (dxp * dxp + dyp * dyp > radiusSq) continue;

              sumX += x * diff;
              sumY += y * diff;
              weight += diff;
            }
          }
        }

        this.prevFrameData = new Uint8ClampedArray(data);

        if (weight > 0) {
          const normX = sumX / weight / this.canvas.width;
          const normY = sumY / weight / this.canvas.height;

          // Ease towards the weighted motion centre for a stable cursor.
          this.currentHead.x = this.currentHead.x * 0.6 + normX * 0.4;
          this.currentHead.y = this.currentHead.y * 0.6 + normY * 0.4;
        }

        // Map the head offset to simulated yaw/pitch. The raw camera frame is not
        // mirrored, so moving the head to the user's right lowers x; the cursor module
        // expects the same sign so the on-screen cursor follows the mirrored preview.
        const dx = (this.currentHead.x - this.neutralPos.x) * 90;
        const dy = (this.currentHead.y - this.neutralPos.y) * 90;
        const yaw = dx;
        const pitch = dy;

        // Nod detection: a quick downward pitch that then recovers, edge-triggered.
        const gestures: GestureId[] = [];
        const pitchDelta = pitch - this.lastPitch;
        if (this.nodArmed && pitchDelta > NOD_THRESHOLD_DEG) {
          gestures.push("nod");
          this.nodArmed = false;
        } else if (pitchDelta < -NOD_THRESHOLD_DEG) {
          this.nodArmed = true;
        }
        this.lastPitch = pitch;

        const fakeFaceLandmarks = [
          { x: this.currentHead.x, y: this.currentHead.y, z: 0 },
          { x: this.currentHead.x, y: this.currentHead.y, z: 0 },
          { x: this.currentHead.x, y: this.currentHead.y, z: 0 },
          { x: this.currentHead.x, y: this.currentHead.y, z: 0 },
          { x: this.currentHead.x, y: this.currentHead.y, z: 0 }, // nose
        ];

        const result: LandmarkResult = {
          timestamp: now,
          face: fakeFaceLandmarks,
          leftHand: null,
          rightHand: null,
          gestures,
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
