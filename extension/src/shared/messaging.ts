/**
 * Typed message bus for all inter-context communication.
 *
 * Every message is a discriminated union of `{ type, payload }`. Add new message
 * types here first before implementing senders or receivers (contract-first).
 * See ADR 0003 for the transport layer decisions.
 */
import type {
  LandmarkResult,
  TranscriptEvent,
  HandsfreeSettings,
  Id,
  FusionState,
  FatigueState,
  EffortMetrics,
} from "./types";

// ---------------------------------------------------------------------------
// Message type catalogue
// ---------------------------------------------------------------------------

/** All message type string literals. */
export type MessageType =
  // Capture lifecycle (service worker → offscreen document)
  | "CAPTURE_START"
  | "CAPTURE_STOP"
  | "CAPTURE_STATUS"
  // Tracking results (offscreen document → service worker → content script)
  | "TRACKING_LANDMARKS"
  | "TRACKING_STATE_CHANGED"
  // Voice (content script → service worker)
  | "VOICE_TRANSCRIPT"
  | "VOICE_ERROR"
  | "VOICE_STATE_CHANGED"
  // Commands (service worker → content script)
  | "COMMAND_EXECUTE"
  | "COMMAND_CONFIRM_REQUEST"
  | "COMMAND_CONFIRM_RESPONSE"
  // Rituals (service worker ↔ content script)
  | "RITUAL_START"
  | "RITUAL_STEP_EXECUTE"
  | "RITUAL_STEP_RESULT"
  | "RITUAL_DONE"
  | "RITUAL_FAILED"
  // UI sync (service worker ↔ options/sidepanel)
  | "UI_SETTINGS_CHANGED"
  | "UI_STATUS_UPDATE"
  | "UI_CALIBRATION_DONE"
  // M6: Fusion and Fatigue (content script ↔ UI / service worker)
  | "FUSION_STATE_CHANGED"
  | "FATIGUE_STATE_CHANGED"
  // Tab management (content script → service worker)
  | "CMD_NEXT_TAB"
  | "CMD_PREV_TAB"
  | "CMD_CLOSE_TAB"
  | "CMD_NEW_TAB"
  | "CMD_OPEN_SIDEPANEL";

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

interface CaptureStartPayload {
  /** Whether to also activate the microphone stream. */
  withMic: boolean;
}

interface CaptureStatusPayload {
  cameraActive: boolean;
  micActive: boolean;
  error?: string;
}

interface TrackingStatePayload {
  active: boolean;
}

interface VoiceStatePayload {
  listening: boolean;
  locale: string;
}

interface VoiceErrorPayload {
  code: string;
  message: string;
}

interface CommandExecutePayload {
  commandId: Id;
  /** Resolved action type for the receiver. */
  actionType: string;
  /** Extra data the action needs (e.g. scroll amount, click number). */
  data?: Record<string, unknown>;
}

interface CommandConfirmRequestPayload {
  /** Human-readable description of the action requiring confirmation. */
  description: string;
  /** Timeout in milliseconds before the request is auto-cancelled. */
  timeoutMs: number;
}

interface CommandConfirmResponsePayload {
  confirmed: boolean;
}

interface RitualStartPayload {
  ritualId: Id;
  params?: Record<string, string>;
}

interface RitualStepExecutePayload {
  stepIndex: number;
  op: string;
  data: Record<string, unknown>;
}

interface RitualStepResultPayload {
  stepIndex: number;
  success: boolean;
  error?: string;
}

interface RitualDonePayload {
  ritualId: Id;
}

interface RitualFailedPayload {
  ritualId: Id;
  stepIndex: number;
  reason: string;
}

interface UiSettingsChangedPayload {
  settings: Partial<HandsfreeSettings>;
}

interface UiStatusUpdatePayload {
  cameraActive: boolean;
  micActive: boolean;
  listening: boolean;
  trackingActive: boolean;
}

interface UiCalibrationDonePayload {
  success: boolean;
}

interface FusionStateChangedPayload {
  state: FusionState;
  targetName?: string;
  commandPhrase?: string;
}

interface FatigueStateChangedPayload {
  state: FatigueState;
  suggestion?: string;
  metrics?: EffortMetrics;
}

// ---------------------------------------------------------------------------
// Message union
// ---------------------------------------------------------------------------

/** Discriminated union covering every message that can flow through the extension. */
export type ExtensionMessage =
  | { type: "CAPTURE_START"; payload: CaptureStartPayload }
  | { type: "CAPTURE_STOP"; payload: Record<string, never> }
  | { type: "CAPTURE_STATUS"; payload: CaptureStatusPayload }
  | { type: "TRACKING_LANDMARKS"; payload: LandmarkResult }
  | { type: "TRACKING_STATE_CHANGED"; payload: TrackingStatePayload }
  | { type: "VOICE_TRANSCRIPT"; payload: TranscriptEvent }
  | { type: "VOICE_ERROR"; payload: VoiceErrorPayload }
  | { type: "VOICE_STATE_CHANGED"; payload: VoiceStatePayload }
  | { type: "COMMAND_EXECUTE"; payload: CommandExecutePayload }
  | { type: "COMMAND_CONFIRM_REQUEST"; payload: CommandConfirmRequestPayload }
  | { type: "COMMAND_CONFIRM_RESPONSE"; payload: CommandConfirmResponsePayload }
  | { type: "RITUAL_START"; payload: RitualStartPayload }
  | { type: "RITUAL_STEP_EXECUTE"; payload: RitualStepExecutePayload }
  | { type: "RITUAL_STEP_RESULT"; payload: RitualStepResultPayload }
  | { type: "RITUAL_DONE"; payload: RitualDonePayload }
  | { type: "RITUAL_FAILED"; payload: RitualFailedPayload }
  | { type: "UI_SETTINGS_CHANGED"; payload: UiSettingsChangedPayload }
  | { type: "UI_STATUS_UPDATE"; payload: UiStatusUpdatePayload }
  | { type: "UI_CALIBRATION_DONE"; payload: UiCalibrationDonePayload }
  | { type: "FUSION_STATE_CHANGED"; payload: FusionStateChangedPayload }
  | { type: "FATIGUE_STATE_CHANGED"; payload: FatigueStateChangedPayload }
  | { type: "CMD_NEXT_TAB"; payload: Record<string, never> }
  | { type: "CMD_PREV_TAB"; payload: Record<string, never> }
  | { type: "CMD_CLOSE_TAB"; payload: Record<string, never> }
  | { type: "CMD_NEW_TAB"; payload: Record<string, never> }
  | { type: "CMD_OPEN_SIDEPANEL"; payload: Record<string, never> };

/** Helper to narrow an unknown runtime value to ExtensionMessage. */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as Record<string, unknown>)["type"] === "string"
  );
}
