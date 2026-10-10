import type { CursorPosition, GestureId, SelectionMethod } from "@/shared/types";

export interface SelectionEvent {
  method: SelectionMethod;
  position: CursorPosition;
  timestamp: number;
}

export interface SelectionConfig {
  /** Dwell duration in ms before triggering click. Default: 800ms. */
  dwellMs: number;
  /** Radius in pixels within which cursor is considered stationary for dwell. */
  dwellRadiusPx: number;
  /** Minimum time between two triggered selections to prevent double fire. */
  cooldownMs: number;
  /** Nod pitch delta threshold for nod-to-select. */
  nodThresholdDeg: number;
}

export const DEFAULT_SELECTION_CONFIG: Readonly<SelectionConfig> = Object.freeze({
  dwellMs: 800,
  dwellRadiusPx: 20,
  cooldownMs: 600,
  nodThresholdDeg: 12,
});

export class SelectionManager {
  private config: SelectionConfig;
  private dwellAnchor: CursorPosition | null = null;
  private dwellStartTime: number | null = null;
  private lastSelectionTime = 0;
  private dwellProgress = 0;

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = { ...DEFAULT_SELECTION_CONFIG, ...config };
  }

  public setConfig(config: Partial<SelectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getDwellProgress(): number {
    return this.dwellProgress;
  }

  public feedFrame(
    pos: CursorPosition,
    gestures: GestureId[] = [],
    timestamp: number
  ): SelectionEvent | null {
    // Check cooldown period
    if (timestamp - this.lastSelectionTime < this.config.cooldownMs) {
      this.dwellProgress = 0;
      this.dwellAnchor = null;
      this.dwellStartTime = null;
      return null;
    }

    // 1. Gesture click (immediate if open_palm or pinch detected)
    if (gestures.includes("open_palm") || gestures.includes("pinch") || gestures.includes("blink_both")) {
      this.lastSelectionTime = timestamp;
      this.reset();
      return {
        method: "gesture",
        position: { ...pos },
        timestamp,
      };
    }

    // 2. Nod-to-select (nod gesture)
    if (gestures.includes("nod")) {
      this.lastSelectionTime = timestamp;
      this.reset();
      return {
        method: "nod",
        position: { ...pos },
        timestamp,
      };
    }

    // 3. Dwell calculation
    if (!this.dwellAnchor || !this.dwellStartTime) {
      this.dwellAnchor = { ...pos };
      this.dwellStartTime = timestamp;
      this.dwellProgress = 0;
      return null;
    }

    // Check if cursor moved outside stationary dwell radius
    const dx = pos.x - this.dwellAnchor.x;
    const dy = pos.y - this.dwellAnchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.config.dwellRadiusPx) {
      // User moved cursor, reset dwell anchor to new position
      this.dwellAnchor = { ...pos };
      this.dwellStartTime = timestamp;
      this.dwellProgress = 0;
      return null;
    }

    // Still within dwell radius, calculate dwell duration
    const elapsed = timestamp - this.dwellStartTime;
    this.dwellProgress = Math.min(elapsed / this.config.dwellMs, 1.0);

    if (elapsed >= this.config.dwellMs) {
      this.lastSelectionTime = timestamp;
      const confirmedPos = { ...this.dwellAnchor };
      this.reset();
      return {
        method: "dwell",
        position: confirmedPos,
        timestamp,
      };
    }

    return null;
  }

  public reset(): void {
    this.dwellAnchor = null;
    this.dwellStartTime = null;
    this.dwellProgress = 0;
  }
}

const defaultSelectionManager = new SelectionManager();

export function feedFrame(
  pos: CursorPosition,
  gestures: GestureId[],
  timestamp: number
): SelectionEvent | null {
  return defaultSelectionManager.feedFrame(pos, gestures, timestamp);
}

export function reset(): void {
  defaultSelectionManager.reset();
}
