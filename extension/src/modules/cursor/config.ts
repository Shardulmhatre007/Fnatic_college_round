/**
 * Cursor configuration and tuning parameters.
 * Rule: never use magic numbers inline. All tunables live here.
 */

export interface CursorConfig {
  /** One Euro filter minimum cutoff frequency (Hz). Lower = smoother, higher latency. */
  filterMinCutoff: number;
  /** One Euro filter speed coefficient beta. Higher = less lag during rapid movement. */
  filterBeta: number;
  /** One Euro filter cutoff frequency for derivative (Hz). */
  filterDcutoff: number;
  /** Snapping radius around interactive target elements in screen pixels. */
  snapRadiusPx: number;
  /** Snapping strength between 0 (no snap) and 1 (immediate lock). */
  snapStrength: number;
  /** Deadzone threshold in normalised coordinates to suppress natural micro-tremor. */
  deadzoneThreshold: number;
}

export const DEFAULT_CURSOR_CONFIG: Readonly<CursorConfig> = Object.freeze({
  filterMinCutoff: 1.5,
  filterBeta: 0.025,
  filterDcutoff: 1.2,
  snapRadiusPx: 24,
  snapStrength: 0.65,
  deadzoneThreshold: 0.002,
});
