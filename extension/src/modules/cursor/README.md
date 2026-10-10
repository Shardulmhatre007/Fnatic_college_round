# Cursor Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/cursor/`

## Purpose

Maps normalised head/hand pose from `LandmarkResult` frames to screen-space cursor
coordinates. Applies a **One Euro filter** to smooth jitter without adding perceptible
lag. Implements magnetic snapping to interactive elements when the cursor is near.

## Public interface

```ts
// cursor/index.ts
export function updateCursor(landmarks: LandmarkResult, viewport: ViewportSize): CursorPosition;
export function snapToNearest(pos: CursorPosition, targets: SnapTarget[]): CursorPosition;
export type { CursorPosition, SnapTarget };
```

## Tunables

All constants (filter coefficients, snap radius) live in `cursor/config.ts`; never
magic-number them inline.

## Dependencies

- `shared/types.ts` (LandmarkResult, CursorPosition, NormalisedPoint)

## See also

ADR 0002 (threading model)
