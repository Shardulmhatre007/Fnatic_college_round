# Calibration Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/calibration/`

## Purpose

Runs a 30-second bubble-pop calibration game on the onboarding tab to map the user's
head/gaze to screen coordinates. Supports silent in-session recalibration when drift
or fatigue is detected.

## Public interface

```ts
// calibration/index.ts
export function startCalibration(targetCount?: number): Promise<CalibrationResult>;
export function detectDrift(recentFrames: LandmarkResult[]): boolean;
```

## Dependencies

- `shared/types.ts` (CalibrationResult, LandmarkResult, NormalisedPoint)
- `shared/messaging.ts` (UI_CALIBRATION_DONE)
