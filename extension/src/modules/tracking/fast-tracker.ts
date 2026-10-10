import type { LandmarkResult } from "@/shared/types";

export type TrackerCallback = (result: LandmarkResult) => void;

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

        // Calculate center of mass / motion optical flow in image
        let sumX = 0;
        let sumY = 0;
        let count = 0;

        if (this.prevFrameData) {
          const step = 4; // Sample every 4th pixel for high speed
          for (let y = 0; y < this.canvas.height; y += step) {
            for (let x = 0; x < this.canvas.width; x += step) {
              const idx = (y * this.canvas.width + x) * 4;
              const rDiff = Math.abs(data[idx]! - this.prevFrameData[idx]!);
              const gDiff = Math.abs(data[idx + 1]! - this.prevFrameData[idx + 1]!);
              const bDiff = Math.abs(data[idx + 2]! - this.prevFrameData[idx + 2]!);
              const diff = rDiff + gDiff + bDiff;

              if (diff > 45) {
                sumX += x;
                sumY += y;
                count++;
              }
            }
          }
        }

        this.prevFrameData = new Uint8ClampedArray(data);

        if (count > 20) {
          const normX = sumX / count / this.canvas.width;
          const normY = sumY / count / this.canvas.height;

          // Smooth towards motion center
          this.currentHead.x = this.currentHead.x * 0.7 + normX * 0.3;
          this.currentHead.y = this.currentHead.y * 0.7 + normY * 0.3;
        }

        // Compute simulated pitch and yaw from offset
        const dx = (this.currentHead.x - this.neutralPos.x) * 90;
        const dy = (this.currentHead.y - this.neutralPos.y) * 90;

        // Mirrored camera feed: invert yaw
        const yaw = -dx;
        const pitch = dy;

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
