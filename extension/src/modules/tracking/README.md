# Tracking Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/tracking/`

## Purpose

Runs MediaPipe Face Landmarker and Hand Landmarker inside a dedicated `Worker` thread
within the offscreen document. Emits `LandmarkResult` frames to the offscreen document
main thread at up to 30 fps.

## Public interface

```ts
// tracking/index.ts
export function startTracking(options: TrackingOptions): void;
export function stopTracking(): void;
export type { TrackingOptions };
```

`LandmarkResult` frames are posted back via `postMessage` from the worker.

## Frame budget

Target: **≤ 33 ms per frame** (30 fps) on a mid-range laptop with integrated graphics.
Actual measurements are logged in `docs/PERFORMANCE.md`.

## Dependencies

- `@mediapipe/tasks-vision` (WASM; bundled via WXT asset pipeline)
- `shared/types.ts` (LandmarkResult, Landmark, GestureId)

## See also

ADR 0001 (capture context), ADR 0002 (threading model)
