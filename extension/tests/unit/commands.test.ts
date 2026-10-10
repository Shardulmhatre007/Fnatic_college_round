import { describe, expect, it } from "vitest";
import {
  extractNumberFromTranscript,
  levenshteinDistance,
  matchCommand,
  normaliseTranscript,
} from "@/modules/commands/index";

describe("Commands Module", () => {
  it("normalises transcript punctuation and whitespace", () => {
    expect(normaliseTranscript("  Scroll, Down! ")).toBe("scroll down");
    expect(normaliseTranscript("नीचे जाओ।")).toBe("नीचे जाओ");
  });

  it("calculates accurate Levenshtein distance", () => {
    expect(levenshteinDistance("scroll", "scrol")).toBe(1);
    expect(levenshteinDistance("click", "clock")).toBe(1);
  });

  it("extracts digits and number words in English and Hindi", () => {
    expect(extractNumberFromTranscript("click 14")).toBe(14);
    expect(extractNumberFromTranscript("choose number five")).toBe(5);
    expect(extractNumberFromTranscript("number teen")).toBe(3);
    expect(extractNumberFromTranscript("सात दबाओ")).toBe(7);
  });

  it("matches English core voice commands", () => {
    const match = matchCommand("please scroll down", "en");
    expect(match).not.toBeNull();
    expect(match?.command.id).toBe("cmd_scroll_down");
    expect(match?.command.action.type).toBe("scroll");
  });

  it("matches Hindi and Hinglish voice commands", () => {
    const hindiMatch = matchCommand("नीचे जाओ", "hi");
    expect(hindiMatch).not.toBeNull();
    expect(hindiMatch?.command.id).toBe("cmd_scroll_down");

    const hinglishMatch = matchCommand("neeche scroll", "hi");
    expect(hinglishMatch).not.toBeNull();
    expect(hinglishMatch?.command.id).toBe("cmd_scroll_down");

    const pauseMatch = matchCommand("सुनना बंद करो", "hi");
    expect(pauseMatch).not.toBeNull();
    expect(pauseMatch?.command.action.type).toBe("pause_listening");
  });

  it("matches dynamic click number commands", () => {
    const match = matchCommand("click 42", "en");
    expect(match).not.toBeNull();
    expect(match?.command.action.type).toBe("click_number");
    if (match?.command.action.type === "click_number") {
      expect(match.command.action.n).toBe(42);
    }
  });

  it("matches typos fuzzy-tolerantly", () => {
    const match = matchCommand("scrol down", "en");
    expect(match).not.toBeNull();
    expect(match?.command.id).toBe("cmd_scroll_down");
  });
});
