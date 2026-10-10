/**
 * Zod runtime schemas for the Handsfree extension.
 *
 * Each schema mirrors a type in shared/types.ts and is used to validate data
 * crossing trust boundaries: storage reads, backend responses, and message payloads.
 *
 * Keep schemas and types in sync. Types are derived from schemas where practical.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const localeSchema = z.enum(["en", "hi"]);

export const idSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const normalisedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// Rituals
// ---------------------------------------------------------------------------

export const elementRefSchema = z
  .object({
    text: z.string().optional(),
    ariaLabel: z.string().optional(),
    role: z.string().optional(),
    cssFallback: z.string().optional(),
    positionFallback: normalisedPointSchema.optional(),
  })
  // At least one stable anchor must be provided (position alone is fragile).
  .refine((v) => v.text !== undefined || v.ariaLabel !== undefined || v.role !== undefined, {
    message: "ElementRef must include at least one of text, ariaLabel, or role",
  });

export const ritualStepSchema: z.ZodType = z.discriminatedUnion("op", [
  z.object({ op: z.literal("open_url"), url: z.string().url(), newTab: z.boolean().optional() }),
  z.object({ op: z.literal("type"), target: elementRefSchema, text: z.string().min(1) }),
  z.object({ op: z.literal("click"), target: elementRefSchema }),
  z.object({
    op: z.literal("scroll"),
    direction: z.enum(["up", "down"]),
    amount: z.number().positive(),
  }),
  z.object({
    op: z.literal("wait"),
    for: z.enum(["load", "element", "ms"]),
    value: z.union([z.string(), z.number()]).optional(),
  }),
  z.object({
    op: z.literal("switch_tab"),
    index: z.number().int().nonnegative().optional(),
    match: z.string().optional(),
  }),
  z.object({ op: z.literal("speak"), text: z.string().min(1) }),
]);

export const ritualSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  trigger: z.object({
    type: z.enum(["phrase", "gesture", "combo"]),
    phrase: z.string().optional(),
    gesture: z
      .enum(["nod", "shake", "blink_left", "blink_right", "blink_both", "open_palm", "pinch", "fist", "point"])
      .optional(),
  }),
  params: z
    .record(z.object({ label: z.string(), default: z.string().optional() }))
    .optional(),
  requiresConfirmation: z.boolean(),
  steps: z.array(ritualStepSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const commandActionSchema: z.ZodType = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]), amount: z.number().positive() }),
  z.object({ type: z.literal("click") }),
  z.object({ type: z.literal("go_back") }),
  z.object({ type: z.literal("go_forward") }),
  z.object({ type: z.literal("next_tab") }),
  z.object({ type: z.literal("prev_tab") }),
  z.object({ type: z.literal("close_tab") }),
  z.object({ type: z.literal("new_tab") }),
  z.object({ type: z.literal("show_numbers") }),
  z.object({ type: z.literal("hide_numbers") }),
  z.object({ type: z.literal("click_number"), n: z.number().int().positive() }),
  z.object({ type: z.literal("pause_listening") }),
  z.object({ type: z.literal("resume_listening") }),
  z.object({ type: z.literal("dictate_start") }),
  z.object({ type: z.literal("dictate_stop") }),
  z.object({ type: z.literal("new_line") }),
  z.object({ type: z.literal("delete_last_word") }),
  z.object({ type: z.literal("run_ritual"), ritualId: idSchema }),
]);

export const commandDefinitionSchema = z.object({
  id: idSchema,
  phrase: z.string().min(1),
  aliases: z.record(localeSchema, z.array(z.string())).optional(),
  action: commandActionSchema,
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const userProfileSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(40),
  base: z.enum(["default", "tremor", "one_handed", "rsi", "injury"]),
  dwellMs: z.number().int().min(200).max(5000),
  movementThreshold: z.number().min(0).max(50),
  smoothingMin: z.number().min(0.0001).max(1),
  smoothingBeta: z.number().min(0).max(10),
  locale: localeSchema,
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const handsfreeSettingsSchema = z.object({
  activeProfileId: idSchema,
  profiles: z.array(userProfileSchema).min(1),
  commands: z.array(commandDefinitionSchema),
  rituals: z.array(ritualSchema),
  trackingEnabled: z.boolean(),
  voiceEnabled: z.boolean(),
  offlineMode: z.boolean(),
  backendEnabled: z.boolean(),
  backendUrl: z.string().url(),
  locale: localeSchema,
  schemaVersion: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

export const benchmarkRunSchema = z.object({
  id: idSchema,
  taskId: z.string().min(1),
  durationMs: z.number().nonnegative(),
  commandAccuracy: z.number().min(0).max(1),
  selectionErrorRate: z.number().min(0).max(1),
  accidentalActivationsPerMin: z.number().nonnegative(),
  completedAt: z.string().datetime(),
});
