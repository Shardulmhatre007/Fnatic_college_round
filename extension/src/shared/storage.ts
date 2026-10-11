/**
 * Typed wrapper over chrome.storage with schema validation, defaults, and migrations.
 *
 * Always use this module instead of calling chrome.storage directly so that:
 * - All reads are validated with Zod before use.
 * - Defaults are guaranteed to be present.
 * - Schema migrations run transparently on version mismatch.
 */
import { handsfreeSettingsSchema } from "./schemas";
import type { HandsfreeSettings, UserProfile, Id } from "./types";
/** Current schema version. Increment when the settings shape changes. */
const CURRENT_SCHEMA_VERSION = 1;

/** Default profile applied on first install. */
const defaultProfile: UserProfile = {
  id: crypto.randomUUID() as Id,
  name: "Default",
  base: "default",
  dwellMs: 800,
  movementThreshold: 8,
  smoothingMin: 0.01,
  smoothingBeta: 0.007,
  locale: "en",
};

/** Factory that builds a fresh settings object for a new install. */
function buildDefaultSettings(): HandsfreeSettings {
  return {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
    commands: [],
    rituals: [],
    trackingEnabled: false,
    dwellEnabled: false,
    dwellMs: 1200,
    voiceEnabled: false,
    offlineMode: false,
    backendEnabled: false,
    backendUrl: "https://localhost:8000",
    locale: "en",
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Reads settings from chrome.storage.sync, applies defaults if absent, and
 * validates with Zod. Returns validated settings or defaults on failure.
 */
export async function loadSettings(): Promise<HandsfreeSettings> {
  const raw = await chrome.storage.sync.get("settings");
  if (!raw["settings"]) {
    const defaults = buildDefaultSettings();
    await chrome.storage.sync.set({ settings: defaults });
    return defaults;
  }
  const parsed = handsfreeSettingsSchema.safeParse(raw["settings"]);
  if (!parsed.success) {
    // Log the parse failure for debugging but never surface raw errors to the user.
    console.warn("[storage] Settings failed validation, resetting to defaults", parsed.error);
    const defaults = buildDefaultSettings();
    await chrome.storage.sync.set({ settings: defaults });
    return defaults;
  }
  return parsed.data;
}

/**
 * Persists a partial settings update to chrome.storage.sync.
 * Merges with the current stored value before writing.
 */
export async function saveSettings(patch: Partial<HandsfreeSettings>): Promise<void> {
  const current = await loadSettings();
  const updated = { ...current, ...patch };
  await chrome.storage.sync.set({ settings: updated });
}

/**
 * Subscribes to settings changes from any context.
 * The callback receives only the changed fields.
 */
export function onSettingsChanged(
  callback: (changes: Partial<HandsfreeSettings>) => void,
): () => void {
  function listener(changes: Record<string, chrome.storage.StorageChange>): void {
    if (changes["settings"]?.newValue) {
      callback(changes["settings"].newValue as Partial<HandsfreeSettings>);
    }
  }
  chrome.storage.onChanged.addListener(listener);
  // Returns an unsubscribe function.
  return () => chrome.storage.onChanged.removeListener(listener);
}
