# docs/PERFORMANCE.md — Frame Budget and Measurements

## Target budget

| Metric | Target | Rationale |
|---|---|---|
| Tracking loop (Face + Hand) | ≤ 33 ms / frame | 30 fps on mid-range laptop (Intel Core i5, integrated graphics) |
| Cursor update → overlay render | ≤ 16 ms | 60 fps visual feedback, sub-frame cursor feel |
| Voice command match | ≤ 50 ms | Perceived as instant response |
| Ritual step dispatch | ≤ 100 ms | Acceptable for macro steps |

## Measurement results

Measurements are added here after each milestone by the Testing Agent.

| Milestone | Device | MediaPipe mode | p50 (ms) | p95 (ms) | p99 (ms) | Pass? |
|---|---|---|---|---|---|---|
| M0 | — | — | — | — | — | N/A |

## Methodology

Measured in the offscreen document Worker using `performance.now()` around each
`FaceLandmarker.detectForVideo()` call. Results are logged to the extension console
during development builds only (stripped in production by the Vite build).

## Strategies if budget is exceeded

1. Switch to face-only mode (disable Hand Landmarker).
2. Reduce input resolution (e.g. 640×360 instead of 1280×720).
3. Skip frames: process every other frame, extrapolate cursor position between them.
4. Offload to GPU: enable MediaPipe GPU delegate if available.
