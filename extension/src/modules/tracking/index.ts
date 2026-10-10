import type { GestureId, Landmark, LandmarkResult } from "@/shared/types";

export interface TrackingOptions {
  enableFace?: boolean;
  enableHands?: boolean;
  maxFps?: number;
  onLandmarks?: (result: LandmarkResult) => void;
  onError?: (err: Error) => void;
}

export interface HeadPoseEstimation {
  pitch: number;
  yaw: number;
  roll: number;
}

/**
 * Calculates head pose angles (pitch, yaw, roll) from MediaPipe face landmarks.
 * Canonical landmark indices:
 * - Nose tip: 4
 * - Left eye corner: 33
 * - Right eye corner: 263
 * - Chin: 152
 */
export function estimateHeadPose(face: Landmark[]): HeadPoseEstimation | null {
  if (!face || face.length < 264) return null;

  const nose = face[4];
  const leftEye = face[33];
  const rightEye = face[263];
  const chin = face[152];

  if (!nose || !leftEye || !rightEye || !chin) return null;

  // Yaw: horizontal displacement of nose relative to eye midpoint
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeDistance < 0.001) return null;

  const yaw = ((nose.x - eyeMidX) / eyeDistance) * 90;

  // Pitch: vertical displacement of nose relative to eye-chin line
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.hypot(chin.x - eyeMidX, chin.y - eyeMidY);
  const pitch = ((nose.y - eyeMidY) / faceHeight - 0.45) * 90;

  // Roll: angle of the line between the two eye corners
  const roll = (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
  };
}

/**
 * Detects basic gestures from landmark positions (e.g. pinch, blink, nod).
 */
export function detectGestures(
  _face: Landmark[] | null,
  hands: Landmark[] | null,
  prevPose: HeadPoseEstimation | null,
  currPose: HeadPoseEstimation | null
): GestureId[] {
  const gestures: GestureId[] = [];

  // Nod detection: rapid pitch downward then back
  if (prevPose && currPose) {
    const pitchDelta = currPose.pitch - prevPose.pitch;
    if (pitchDelta > 10) {
      gestures.push("nod");
    }
  }

  // Hand pinch detection: distance between thumb tip (4) and index finger tip (8)
  if (hands && hands.length >= 9) {
    const thumbTip = hands[4];
    const indexTip = hands[8];
    if (thumbTip && indexTip) {
      const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      if (dist < 0.05) {
        gestures.push("pinch");
      }
    }
  }

  return gestures;
}

export class TrackingEngine {
  private options: TrackingOptions;
  private isRunning = false;
  private lastPose: HeadPoseEstimation | null = null;

  constructor(options: TrackingOptions = {}) {
    this.options = {
      enableFace: true,
      enableHands: false,
      maxFps: 30,
      ...options,
    };
  }

  public processRawLandmarks(
    faceLandmarks: Landmark[] | null,
    handLandmarks: Landmark[] | null,
    timestamp: number
  ): LandmarkResult {
    const headPose = faceLandmarks ? estimateHeadPose(faceLandmarks) : null;
    const gestures = detectGestures(faceLandmarks, handLandmarks, this.lastPose, headPose);
    this.lastPose = headPose;

    const result: LandmarkResult = {
      timestamp,
      face: faceLandmarks,
      leftHand: null,
      rightHand: handLandmarks,
      gestures,
      headPose,
    };

    if (this.options.onLandmarks) {
      this.options.onLandmarks(result);
    }

    return result;
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
    this.lastPose = null;
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}

let defaultEngine: TrackingEngine | null = null;

export function startTracking(options: TrackingOptions = {}): void {
  if (!defaultEngine) {
    defaultEngine = new TrackingEngine(options);
  }
  defaultEngine.start();
}

export function stopTracking(): void {
  if (defaultEngine) {
    defaultEngine.stop();
  }
}
