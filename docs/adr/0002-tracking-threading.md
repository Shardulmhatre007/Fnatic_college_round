# ADR 0002 — Tracking Threading: Keeping MediaPipe off the Main Thread

**Status:** Accepted  
**Date:** 2026-10-10  
**Deciders:** Orchestrator  

---

## Context

MediaPipe Face Landmarker and Hand Landmarker are WASM-based and CPU-intensive.
Running them on the main thread of a content script or UI page would jank the page.
We must ensure the tracking loop does not block the browsed page's main thread.

## Decision

Tracking runs entirely inside the **offscreen document** (see ADR 0001). The offscreen
document has its own renderer process in Chrome, so its main thread is isolated from
every browsed page. Within the offscreen document we use a **dedicated `Worker`** so
that the WASM computation does not block the offscreen document's own rendering (needed
for the `<video>` element used to consume the camera stream).

```
Offscreen document main thread
  └─ <video> captures frames from getUserMedia stream
  └─ postMessage(ImageBitmap) to tracking Worker (zero-copy transfer)

Tracking Worker thread
  └─ MediaPipe FaceLandmarker.detectForVideo()
  └─ MediaPipe HandLandmarker.detectForVideo()
  └─ postMessage(LandmarkResult) back to offscreen main thread

Offscreen document main thread
  └─ chrome.runtime.sendMessage(LandmarkResult) → service worker
```

`ImageBitmap` is transferred (not copied) to the worker to avoid GC pressure.

## Consequences

- Target frame budget: **≤ 33 ms per frame (30 fps)** on a mid-range laptop (Intel
  Core i5, integrated graphics). The budget must be measured and logged in
  `docs/PERFORMANCE.md`.
- WASM files are bundled with the extension via WXT's asset pipeline.
- If the worker takes longer than the budget, frames are dropped rather than queued.
  This keeps latency low at the cost of throughput.
- Switching between face-only and hand-only modes allows the budget to be met on
  weaker hardware.
