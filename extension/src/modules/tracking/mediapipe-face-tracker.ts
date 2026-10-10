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

/**
 * Real head tracking using the MediaPipe Face Landmarker running on the
 * extension page. Emits the same `LandmarkResult` frames as the optical tracker,
 * but from a 468-point face mesh, so it is stable when the user sits still and
 * never drifts.
 *
 * Cursor movement is position-based (the nose moves with the head); nod
 * selection is derived from estimated head rotation.
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
