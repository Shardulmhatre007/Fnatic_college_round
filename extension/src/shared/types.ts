/**
 * Shared TypeScript types for the Handsfree extension.
 *
 * This file is the single source of truth. Import from here; never duplicate shapes
 * in module-local files. Zod schemas for runtime validation live in schemas.ts.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Supported UI and voice grammar locales. */
export type Locale = "en" | "hi";

/** Unique identifier string (UUID v4). */
export type Id = string;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A normalised 2-D point (values in [0, 1] relative to the viewport). */
export interface NormalisedPoint {
  x: number;
  y: number;
}

/** A 3-D landmark as returned by MediaPipe (z is relative depth). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** Named gesture IDs recognised by the tracking module. */
export type GestureId =
  | "nod"
  | "shake"
  | "blink_left"
  | "blink_right"
  | "blink_both"
  | "open_palm"
  | "pinch"
  | "fist"
  | "point";

/** The result emitted by the tracking Worker each frame. */
export interface LandmarkResult {
  /** Monotonic timestamp in milliseconds. */
  timestamp: number;
  face: Landmark[] | null;
  leftHand: Landmark[] | null;
  rightHand: Landmark[] | null;
  /** Detected gestures in this frame. */
  gestures: GestureId[];
  /** Head pose angles in degrees. */
  headPose: { pitch: number; yaw: number; roll: number } | null;
}

/** Coarse lighting quality estimate from the tracking module. */
export type LightingQuality = "good" | "dim" | "bright" | "uneven";

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/** Smoothed screen-space cursor position (pixels). */
export interface CursorPosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** How a selection was confirmed. */
export type SelectionMethod = "dwell" | "nod" | "gesture" | "voice";

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/** A transcript event from the speech engine. */
export interface TranscriptEvent {
  text: string;
  /** True when the recognition engine considers the result final. */
  isFinal: boolean;
  confidence: number;
  locale: Locale;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** A built-in or custom voice command definition. */
export interface CommandDefinition {
  id: Id;
  /** Canonical phrase in English. */
  phrase: string;
  /** Optional aliases per locale. */
  aliases?: Partial<Record<Locale, string[]>>;
  /** The action to perform. */
  action: CommandAction;
  /** Whether this command is currently active. */
  enabled: boolean;
}

/** The action a command triggers. */
export type CommandAction =
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "click" }
  | { type: "go_back" }
  | { type: "go_forward" }
  | { type: "next_tab" }
  | { type: "prev_tab" }
  | { type: "close_tab" }
  | { type: "new_tab" }
  | { type: "show_numbers" }
  | { type: "hide_numbers" }
  | { type: "click_number"; n: number }
  | { type: "pause_listening" }
  | { type: "resume_listening" }
  | { type: "dictate_start" }
  | { type: "dictate_stop" }
  | { type: "new_line" }
  | { type: "delete_last_word" }
  | { type: "run_ritual"; ritualId: Id }
  | { type: "open_sidepanel" }
  | { type: "open_url"; url: string };

// ---------------------------------------------------------------------------
// Rituals
// ---------------------------------------------------------------------------

/** A reference to a DOM element, resolved in priority order at replay time. */
export interface ElementRef {
  text?: string;
  ariaLabel?: string;
  role?: string;
  /** CSS selector stored as a last-resort fallback only. */
  cssFallback?: string;
  /** Normalised viewport position as a last-resort positional fallback. */
  positionFallback?: NormalisedPoint;
}

/** A single step in a Ritual macro. */
export type RitualStep =
  | { op: "open_url"; url: string; newTab?: boolean }
  | { op: "type"; target: ElementRef; text: string }
  | { op: "click"; target: ElementRef }
  | { op: "scroll"; direction: "up" | "down"; amount: number }
  | { op: "wait"; for: "load" | "element" | "ms"; value?: string | number }
  | { op: "switch_tab"; index?: number; match?: string }
  | { op: "speak"; text: string };

/** A saved multi-step macro. */
export interface Ritual {
  id: Id;
  name: string;
  trigger: {
    type: "phrase" | "gesture" | "combo";
    phrase?: string;
    gesture?: GestureId;
  };
  /** Named substitution parameters, e.g. { product: { label: "Product name" } }. */
  params?: Record<string, { label: string; default?: string }>;
  /**
   * Forced true when any step is flagged dangerous (payment, delete, submit).
   * Cannot be set to false programmatically if a dangerous step exists.
   */
  requiresConfirmation: boolean;
  steps: RitualStep[];
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** A named accessibility profile that adjusts tracking and selection behaviour. */
export type ProfileId = "default" | "tremor" | "one_handed" | "rsi" | "injury";

export interface UserProfile {
  id: Id;
  name: string;
  base: ProfileId;
  /** Dwell time in milliseconds before a target is selected. */
  dwellMs: number;
  /** Minimum head movement (pixels) to move the cursor. */
  movementThreshold: number;
  /** Smoothing factor for the One Euro filter (lower = smoother, more lag). */
  smoothingMin: number;
  /** Speed coefficient for the One Euro filter. */
  smoothingBeta: number;
  locale: Locale;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The full persisted settings object stored in chrome.storage.sync. */
export interface HandsfreeSettings {
  activeProfileId: Id;
  profiles: UserProfile[];
  commands: CommandDefinition[];
  rituals: Ritual[];
  /** Whether camera tracking is on. */
  trackingEnabled: boolean;
  /** Whether dwell clicking is enabled. */
  dwellEnabled?: boolean;
  /** Dwell click delay in milliseconds. */
  dwellMs?: number;
  /** Whether voice recognition is on. */
  voiceEnabled: boolean;
  /** Use offline STT engine instead of Web Speech API. */
  offlineMode: boolean;
  /** Whether the optional backend is enabled. */
  backendEnabled: boolean;
  backendUrl: string;
  locale: Locale;
  /** Storage schema version for migrations. */
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

/** A single benchmark task run. */
export interface BenchmarkRun {
  id: Id;
  taskId: string;
  /** Time to complete in milliseconds. */
  durationMs: number;
  commandAccuracy: number;
  selectionErrorRate: number;
  /** Accidental activations per minute. */
  accidentalActivationsPerMin: number;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

/** A numbered badge shown on a clickable element. */
export interface NumberBadge {
  n: number;
  /** Bounding rect of the target element (viewport-relative pixels). */
  rect: { top: number; left: number; width: number; height: number };
  elementRef: ElementRef;
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/** Result of a calibration session. */
export interface CalibrationResult {
  /** ISO-8601 timestamp. */
  completedAt: string;
  /** Mapping from corner/centre key to normalised gaze point. */
  gazeMap: Record<string, NormalisedPoint>;
  lightingQuality: LightingQuality;
  /** Whether recalibration was triggered automatically. */
  silent: boolean;
}
