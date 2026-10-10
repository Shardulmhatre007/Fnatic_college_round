/**
 * Unit tests for shared/schemas.ts.
 *
 * These tests verify that valid data passes and invalid data fails with the
 * correct error paths. They run in the Vitest environment without a browser.
 */
import { describe, it, expect } from "vitest";
import {
  elementRefSchema,
  ritualSchema,
  handsfreeSettingsSchema,
  userProfileSchema,
} from "@/shared/schemas";

describe("elementRefSchema", () => {
  it("accepts an element ref with text", () => {
    const result = elementRefSchema.safeParse({ text: "Submit" });
    expect(result.success).toBe(true);
  });

  it("accepts an element ref with ariaLabel and role", () => {
    const result = elementRefSchema.safeParse({ ariaLabel: "Search", role: "button" });
    expect(result.success).toBe(true);
  });

  it("rejects an element ref with only a CSS selector", () => {
    const result = elementRefSchema.safeParse({ cssFallback: ".submit-btn" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty element ref", () => {
    const result = elementRefSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("userProfileSchema", () => {
  const valid = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Default",
    base: "default",
    dwellMs: 800,
    movementThreshold: 8,
    smoothingMin: 0.01,
    smoothingBeta: 0.007,
    locale: "en",
  };

  it("accepts a valid profile", () => {
    expect(userProfileSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects dwell time below 200 ms", () => {
    expect(userProfileSchema.safeParse({ ...valid, dwellMs: 100 }).success).toBe(false);
  });

  it("rejects an unknown locale", () => {
    expect(userProfileSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false);
  });
});
