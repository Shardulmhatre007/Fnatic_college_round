import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerOptions,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type { GestureId, Landmark, LandmarkResult } from "@/shared/types";
import { estimateHeadPose } from "./index";

export type TrackerCallback = (result: LandmarkResult) => void;

/** Common surface implemented by every head tracker so callers can swap them. */
export interface HeadTracker {
  start(callback: TrackerCallback): void;
  stop(): void;
  calibrateNeutral(): void;
}

/** Bundle-relative paths (copied from public/ into the built extension). */
const WASM_BASE_PATH = "mediapipe/wasm";
const MODEL_PATH = "models/face_landmarker.task";

/** MediaPipe face-mesh index for the nose tip. */
const NOSE_TIP = 1;
/** Cap the detection loop at ~30 fps. */
const MAX_FPS = 30;
/** Head-rotation pitch delta (deg) that fires a nod. */
const NOD_DOWN_DEG = 7;
/** Pitch recovery (deg) needed before the next nod can fire. */
const NOD_UP_DEG = 3;
/** Exponential smoothing applied to the measured nose position. */
const POSITION_SMOOTHING = 0.6;

// ---------------------------------------------------------------------------
// Blink detection via Eye Aspect Ratio (EAR)
// ---------------------------------------------------------------------------
// MediaPipe 468-landmark indices for the 6 points defining each eye contour.
// Using the canonical "6-point EAR" subset from the full face mesh.
// Left eye (from user perspective): p1=outer, p2=top-outer, p3=top-inner, p4=inner, p5=bot-inner, p6=bot-outer
const LEFT_EYE_EAR_IDX = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_EAR_IDX = [33, 160, 158, 133, 153, 144];

/** EAR below this threshold = eye is closed. Typical open-eye EAR is 0.28–0.35. */
const EAR_BLINK_THRESHOLD = 0.22;
/** Maximum time gap (ms) between two sequential blinks to count as a double-blink. */
const DOUBLE_BLINK_WINDOW_MS = 500;
/** Minimum cooldown (ms) between two `blink_both` events to prevent retriggering. */
const BLINK_BOTH_COOLDOWN_MS = 600;

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute Eye Aspect Ratio from 6 landmark points.
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 */
function eyeAspectRatio(lm: NormalizedLandmark[], indices: number[]): number {
  const p1 = lm[indices[0]!]!;
  const p2 = lm[indices[1]!]!;
  const p3 = lm[indices[2]!]!;
  const p4 = lm[indices[3]!]!;
  const p5 = lm[indices[4]!]!;
  const p6 = lm[indices[5]!]!;
  const vertical1 = dist2D(p2, p6);
  const vertical2 = dist2D(p3, p5);
  const horizontal = dist2D(p1, p4);
  if (horizontal < 0.0001) return 1.0; // guard div-by-zero
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Real head tracking using the MediaPipe Face Landmarker running on the
 * extension page. Emits the same `LandmarkResult` frames as the optical tracker,
 * but from a 468-point face mesh, so it is stable when the user sits still and
 * never drifts.
 *
 * Cursor movement is position-based (the nose moves with the head); nod
 * selection is derived from estimated head rotation.
 *
 * Blink detection: a single blink emits `blink_left` or `blink_right`.
 * A double-blink (two blinks within DOUBLE_BLINK_WINDOW_MS) emits `blink_both`
 * which the selection module treats as an immediate click.
 */
export class MediaPipeFaceTracker implements HeadTracker {
  private video: HTMLVideoElement;
  private landmarker: FaceLandmarker | null = null;
  private animFrameId: number | null = null;
  private isTracking = false;
  private callback: TrackerCallback | null = null;

  private lastProcessedAt = 0;
  private lastVideoTime = -1;
  private neutral = { x: 0.5, y: 0.5 };
  private current = { x: 0.5, y: 0.5 };
  private lastPitch = 0;
  private nodArmed = true;

  // Blink state tracking (edge-triggered to prevent repeated fires)
  private leftBlinkArmed = true;
  private rightBlinkArmed = true;
  private lastLeftBlinkAt = 0;
  private lastRightBlinkAt = 0;
  private lastBothBlinkAt = 0;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  /** Load the WASM fileset and face-landmarker model. Must be awaited before start(). */
  public async load(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL(WASM_BASE_PATH));
    const modelAssetPath = chrome.runtime.getURL(MODEL_PATH);
    const base: FaceLandmarkerOptions = {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    };

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, base);
    } catch {
      // GPU delegate may be unavailable (e.g. no WebGL2); retry on CPU.
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        ...base,
        baseOptions: { modelAssetPath, delegate: "CPU" },
      });
    }
  }

  public start(callback: TrackerCallback): void {
    if (!this.landmarker) {
      throw new Error("MediaPipeFaceTracker.load() must be awaited before start()");
    }
    this.callback = callback;
    this.isTracking = true;
    this.lastProcessedAt = performance.now();
    this.lastVideoTime = -1;
    this.lastPitch = 0;
    this.nodArmed = true;
    this.leftBlinkArmed = true;
    this.rightBlinkArmed = true;
    this.lastLeftBlinkAt = 0;
    this.lastRightBlinkAt = 0;
    this.lastBothBlinkAt = 0;
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
    this.neutral = { ...this.current };
  }

  private loop = (): void => {
    if (!this.isTracking) return;

    const now = performance.now();
    const minInterval = 1000 / MAX_FPS;
    if (
      this.landmarker &&
      this.video.readyState >= 2 &&
      this.video.currentTime !== this.lastVideoTime &&
      now - this.lastProcessedAt >= minInterval
    ) {
      this.lastProcessedAt = now;
      this.lastVideoTime = this.video.currentTime;
      try {
        const result = this.landmarker.detectForVideo(this.video, now);
        this.emit(result.faceLandmarks?.[0], now);
      } catch {
        // Skip a frame rather than tearing down the whole tracking loop.
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private emit(landmarks: NormalizedLandmark[] | undefined, timestamp: number): void {
    const gestures: GestureId[] = [];
    let headPose: LandmarkResult["headPose"] = null;
    let face: Landmark[] | null = null;

    if (landmarks && landmarks.length > 0) {
      face = landmarks as unknown as Landmark[];

      const nose = landmarks[NOSE_TIP];
      if (nose) {
        this.current.x = this.current.x * (1 - POSITION_SMOOTHING) + nose.x * POSITION_SMOOTHING;
        this.current.y = this.current.y * (1 - POSITION_SMOOTHING) + nose.y * POSITION_SMOOTHING;
      }

      // Position offset expressed in the same arbitrary "degrees" the cursor module expects.
      headPose = {
        yaw: (this.current.x - this.neutral.x) * 90,
        pitch: (this.current.y - this.neutral.y) * 90,
        roll: 0,
      };

      // Nod detection from real head rotation geometry.
      const rotation = estimateHeadPose(face);
      if (rotation) {
        const delta = rotation.pitch - this.lastPitch;
        if (this.nodArmed && delta > NOD_DOWN_DEG) {
          gestures.push("nod");
          this.nodArmed = false;
        } else if (!this.nodArmed && delta < -NOD_UP_DEG) {
          this.nodArmed = true;
        }
        this.lastPitch = rotation.pitch;
      }

      // -----------------------------------------------------------------------
      // Blink detection via EAR (Eye Aspect Ratio)
      // Edge-triggered: fires once when eye closes, rearms when eye reopens.
      // -----------------------------------------------------------------------
      if (landmarks.length >= 388) {
        const leftEAR = eyeAspectRatio(landmarks, LEFT_EYE_EAR_IDX);
        const rightEAR = eyeAspectRatio(landmarks, RIGHT_EYE_EAR_IDX);

        const leftClosed = leftEAR < EAR_BLINK_THRESHOLD;
        const rightClosed = rightEAR < EAR_BLINK_THRESHOLD;

        // --- Left eye blink ---
        if (leftClosed && this.leftBlinkArmed) {
          this.leftBlinkArmed = false;
          gestures.push("blink_left");
          // Double-blink check: was the right eye closed recently?
          if (
            timestamp - this.lastRightBlinkAt < DOUBLE_BLINK_WINDOW_MS &&
            timestamp - this.lastBothBlinkAt > BLINK_BOTH_COOLDOWN_MS
          ) {
            gestures.push("blink_both");
            this.lastBothBlinkAt = timestamp;
          }
          this.lastLeftBlinkAt = timestamp;
        } else if (!leftClosed) {
          this.leftBlinkArmed = true;
        }

        // --- Right eye blink ---
        if (rightClosed && this.rightBlinkArmed) {
          this.rightBlinkArmed = false;
          gestures.push("blink_right");
          if (
            timestamp - this.lastLeftBlinkAt < DOUBLE_BLINK_WINDOW_MS &&
            timestamp - this.lastBothBlinkAt > BLINK_BOTH_COOLDOWN_MS
          ) {
            gestures.push("blink_both");
            this.lastBothBlinkAt = timestamp;
          }
          this.lastRightBlinkAt = timestamp;
        } else if (!rightClosed) {
          this.rightBlinkArmed = true;
        }

        // --- Simultaneous both-eyes blink ---
        if (
          leftClosed &&
          rightClosed &&
          timestamp - this.lastBothBlinkAt > BLINK_BOTH_COOLDOWN_MS
        ) {
          if (!gestures.includes("blink_both")) {
            gestures.push("blink_both");
            this.lastBothBlinkAt = timestamp;
          }
        }
      }
    }

    this.callback?.({
      timestamp,
      face,
      leftHand: null,
      rightHand: null,
      gestures,
      headPose,
    });
  }
}
