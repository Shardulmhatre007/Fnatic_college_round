import type { CommandDefinition, Locale } from "@/shared/types";

export interface CommandMatch {
  command: CommandDefinition;
  confidence: number;
  extractedNumber?: number;
  extractedText?: number | string;
}

/**
 * Normalises text by trimming, lowercasing, and stripping punctuation.
 */
export function normaliseTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'।]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculates Levenshtein distance between two strings for typo tolerance.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Parses numbers expressed as digits or spoken words in English and Hindi.
 */
export function extractNumberFromTranscript(text: string): number | undefined {
  // Direct digit regex match
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) {
    return parseInt(digitMatch[0], 10);
  }

  // Common number words
  const wordToNumber: Record<string, number> = {
    // English
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    // Common homophones recognized by Web Speech API
    to: 2,
    too: 2,
    tree: 3,
    for: 4,
    won: 1,
    ate: 8,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    // Hindi / Hinglish
    ek: 1,
    do: 2,
    teen: 3,
    char: 4,
    paanch: 5,
    che: 6,
    saat: 7,
    aath: 8,
    nau: 9,
    dus: 10,
    gyarah: 11,
    baarah: 12,
    terah: 13,
    chaudah: 14,
    pandrah: 15,
    solah: 16,
    satrah: 17,
    atharah: 18,
    unnees: 19,
    bees: 20,
    ikkees: 21,
    baees: 22,
    teis: 23,
    chaubees: 24,
    pachchees: 25,
    chhabees: 26,
    sattaees: 27,
    atthaees: 28,
    untees: 29,
    tees: 30,
    "एक": 1,
    "दो": 2,
    "तीन": 3,
    "चार": 4,
    "पाँच": 5,
    "छह": 6,
    "सात": 7,
    "आठ": 8,
    "नौ": 9,
    "दस": 10,
    "ग्यारह": 11,
    "बारह": 12,
    "तेरह": 13,
    "चौदह": 14,
    "पंद्रह": 15,
    "सोलह": 16,
    "सत्रह": 17,
    "अठारह": 18,
    "उन्नीस": 19,
    "बीस": 20,
  };

  const words = text.split(" ");
  for (const w of words) {
    if (wordToNumber[w] !== undefined) {
      return wordToNumber[w];
    }
  }

  return undefined;
}

/**
 * Default built-in command grammar with English and Hindi / Hinglish aliases.
 */
export const DEFAULT_COMMANDS: CommandDefinition[] = [
  {
    id: "cmd_scroll_down",
    phrase: "scroll down",
    aliases: {
      en: ["scroll down", "go down", "page down", "down", "scroll down please", "scroll bottom"],
      hi: ["नीचे scroll करो", "नीचे जाओ", "neeche jao", "neeche scroll", "neeche", "scroll down"],
    },
    action: { type: "scroll", direction: "down", amount: 400 },
    enabled: true,
  },
  {
    id: "cmd_scroll_up",
    phrase: "scroll up",
    aliases: {
      en: ["scroll up", "go up", "page up", "up", "scroll up please", "scroll top"],
      hi: ["ऊपर scroll करो", "ऊपर जाओ", "upar jao", "upar scroll", "upar", "scroll up"],
    },
    action: { type: "scroll", direction: "up", amount: 400 },
    enabled: true,
  },
  {
    id: "cmd_click",
    phrase: "click",
    aliases: {
      en: ["click", "press", "select", "tap", "hit"],
      hi: ["click", "दबाओ", "chuno", "click karo", "daba do"],
    },
    action: { type: "click" },
    enabled: true,
  },
  {
    id: "cmd_go_back",
    phrase: "go back",
    aliases: {
      en: ["go back", "back"],
      hi: ["पीछे जाओ", "peeche jao", "back jao"],
    },
    action: { type: "go_back" },
    enabled: true,
  },
  {
    id: "cmd_go_forward",
    phrase: "go forward",
    aliases: {
      en: ["go forward", "forward"],
      hi: ["आगे जाओ", "aage jao", "forward jao"],
    },
    action: { type: "go_forward" },
    enabled: true,
  },
  {
    id: "cmd_next_tab",
    phrase: "next tab",
    aliases: {
      en: ["next tab"],
      hi: ["अगला tab", "agla tab"],
    },
    action: { type: "next_tab" },
    enabled: true,
  },
  {
    id: "cmd_prev_tab",
    phrase: "previous tab",
    aliases: {
      en: ["previous tab", "prev tab"],
      hi: ["पिछला tab", "pichhla tab"],
    },
    action: { type: "prev_tab" },
    enabled: true,
  },
  {
    id: "cmd_close_tab",
    phrase: "close tab",
    aliases: {
      en: ["close tab"],
      hi: ["tab बंद करो", "tab band karo"],
    },
    action: { type: "close_tab" },
    enabled: true,
  },
  {
    id: "cmd_new_tab",
    phrase: "new tab",
    aliases: {
      en: ["new tab", "open tab"],
      hi: ["नया tab", "naya tab"],
    },
    action: { type: "new_tab" },
    enabled: true,
  },
  {
    id: "cmd_open_sidepanel",
    phrase: "open side panel",
    aliases: {
      en: ["open side panel", "side panel", "open panel", "panel", "panel open", "open sidebar", "sidebar"],
      hi: [
        "side panel खोलो",
        "panel खोलो",
        "side panel kholo",
        "panel kholo",
        "sidepanel kholo",
        "open panel",
        "panel open karo",
        "sidebar kholo",
        "panel dikhao",
      ],
    },
    action: { type: "open_sidepanel" },
    enabled: true,
  },
  {
    id: "cmd_show_numbers",
    phrase: "show numbers",
    aliases: {
      en: [
        "show numbers",
        "numbers on",
        "show badges",
        "numbers",
        "number labels",
        "number mode",
        "tag elements",
      ],
      hi: [
        "numbers दिखाओ",
        "नंबर दिखाओ",
        "numbers dikhao",
        "numbers dihkao",
        "number dikhao",
        "number dihkao",
        "numbers dikha do",
        "number dikha do",
        "number lagao",
        "numbers chalu karo",
      ],
    },
    action: { type: "show_numbers" },
    enabled: true,
  },
  {
    id: "cmd_hide_numbers",
    phrase: "hide numbers",
    aliases: {
      en: ["hide numbers", "numbers off", "hide badges", "clear numbers"],
      hi: [
        "numbers छुपाओ",
        "नंबर छुपाओ",
        "numbers chhupao",
        "number hatao",
        "numbers hatao",
        "number band karo",
      ],
    },
    action: { type: "hide_numbers" },
    enabled: true,
  },
  {
    id: "cmd_pause",
    phrase: "pause listening",
    aliases: {
      en: ["pause listening", "stop listening", "go to sleep"],
      hi: ["सुनना बंद करो", "sunna band karo", "so jao"],
    },
    action: { type: "pause_listening" },
    enabled: true,
  },
  {
    id: "cmd_resume",
    phrase: "resume listening",
    aliases: {
      en: ["resume listening", "start listening", "wake up"],
      hi: ["सुनना शुरू करो", "sunna shuru karo", "jaag jao"],
    },
    action: { type: "resume_listening" },
    enabled: true,
  },
  {
    id: "cmd_dictate_start",
    phrase: "start dictating",
    aliases: {
      en: ["start dictating", "start typing", "begin dictation"],
      hi: ["dictation शुरू करो", "bol kar likho", "likhna shuru karo"],
    },
    action: { type: "dictate_start" },
    enabled: true,
  },
  {
    id: "cmd_dictate_stop",
    phrase: "stop dictating",
    aliases: {
      en: ["stop dictating", "stop typing", "end dictation"],
      hi: ["dictation बंद करो", "likhna band karo"],
    },
    action: { type: "dictate_stop" },
    enabled: true,
  },
  {
    id: "cmd_new_line",
    phrase: "new line",
    aliases: {
      en: ["new line", "enter", "newline"],
      hi: ["नई लाइन", "nayi line"],
    },
    action: { type: "new_line" },
    enabled: true,
  },
  {
    id: "cmd_delete_last_word",
    phrase: "delete last word",
    aliases: {
      en: ["delete last word", "backspace", "delete word"],
      hi: ["आखिरी शब्द मिटाओ", "aakhri shabd hatao"],
    },
    action: { type: "delete_last_word" },
    enabled: true,
  },
  // -------------------------------------------------------------------------
  // Website navigation commands — "search youtube", "open google", "go to..."
  // -------------------------------------------------------------------------
  {
    id: "cmd_open_youtube",
    phrase: "open youtube",
    aliases: {
      en: ["open youtube", "search youtube", "go to youtube", "youtube", "youtube kholo"],
      hi: ["youtube खोलो", "youtube pe jao", "youtube chalao"],
    },
    action: { type: "open_url", url: "https://www.youtube.com" },
    enabled: true,
  },
  {
    id: "cmd_open_google",
    phrase: "open google",
    aliases: {
      en: ["open google", "search google", "go to google", "google", "google kholo"],
      hi: ["google खोलो", "google pe jao"],
    },
    action: { type: "open_url", url: "https://www.google.com" },
    enabled: true,
  },
  {
    id: "cmd_open_gmail",
    phrase: "open gmail",
    aliases: {
      en: ["open gmail", "go to gmail", "gmail", "check email", "open email"],
      hi: ["gmail खोलो", "email kholo"],
    },
    action: { type: "open_url", url: "https://mail.google.com" },
    enabled: true,
  },
  {
    id: "cmd_open_github",
    phrase: "open github",
    aliases: {
      en: ["open github", "go to github", "github"],
      hi: ["github खोलो"],
    },
    action: { type: "open_url", url: "https://www.github.com" },
    enabled: true,
  },
  {
    id: "cmd_open_maps",
    phrase: "open maps",
    aliases: {
      en: ["open maps", "go to maps", "google maps", "open google maps"],
      hi: ["maps खोलो", "google maps kholo"],
    },
    action: { type: "open_url", url: "https://maps.google.com" },
    enabled: true,
  },
  {
    id: "cmd_open_wikipedia",
    phrase: "open wikipedia",
    aliases: {
      en: ["open wikipedia", "go to wikipedia", "wikipedia"],
      hi: ["wikipedia खोलो"],
    },
    action: { type: "open_url", url: "https://www.wikipedia.org" },
    enabled: true,
  },
  {
    id: "cmd_open_twitter",
    phrase: "open twitter",
    aliases: {
      en: ["open twitter", "go to twitter", "twitter", "open x", "go to x"],
      hi: ["twitter खोलो"],
    },
    action: { type: "open_url", url: "https://www.x.com" },
    enabled: true,
  },
];

/**
 * Matches a transcript string against defined commands with fuzzy similarity.
 */
export function matchCommand(
  transcript: string,
  locale: Locale = "en",
  commands: CommandDefinition[] = DEFAULT_COMMANDS
): CommandMatch | null {
  const normInput = normaliseTranscript(transcript);
  if (!normInput) return null;

  // Check special dynamic pattern: "click <number>", "number <n>", "<n> number", or direct number like "14", "12", "fourteen", "चौदह"
  const extractedNum = extractNumberFromTranscript(normInput);
  if (extractedNum !== undefined && extractedNum > 0) {
    const isExplicitAction =
      /(?:click|press|number|choose|select|dabaao|chuno|daba|karo|target)\b/i.test(normInput) ||
      normInput.trim() === String(extractedNum) ||
      normInput.trim() === `${extractedNum} number` ||
      normInput.trim() === `number ${extractedNum}`;

    // In noisy environments speech might capture "hey click 14 please" or "14 please"
    const isUtteranceWithNumber = normInput.split(/\s+/).length <= 5;

    if (isExplicitAction || isUtteranceWithNumber) {
      return {
        command: {
          id: `cmd_click_number_${extractedNum}`,
          phrase: `click ${extractedNum}`,
          action: { type: "click_number", n: extractedNum },
          enabled: true,
        },
        confidence: 0.95,
        extractedNumber: extractedNum,
      };
    }
  }

  let bestMatch: CommandMatch | null = null;
  let highestScore = 0;

  for (const cmd of commands) {
    if (!cmd.enabled) continue;

    // Build candidate phrases
    const candidates: string[] = [cmd.phrase];
    if (cmd.aliases) {
      if (cmd.aliases[locale]) {
        candidates.push(...(cmd.aliases[locale] ?? []));
      }
      if (locale !== "en" && cmd.aliases.en) {
        candidates.push(...(cmd.aliases.en ?? []));
      }
    }

    for (const rawCandidate of candidates) {
      const normCand = normaliseTranscript(rawCandidate);
      if (!normCand) continue;

      // 1. Exact match
      if (normInput === normCand) {
        return {
          command: cmd,
          confidence: 1.0,
        };
      }

      // 2. Substring match
      if (normInput.includes(normCand) || normCand.includes(normInput)) {
        const score = 0.85;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = { command: cmd, confidence: score };
        }
        continue;
      }

      // 3. Levenshtein fuzzy distance tolerance for short typos
      const maxLen = Math.max(normInput.length, normCand.length);
      const dist = levenshteinDistance(normInput, normCand);
      const similarity = 1.0 - dist / maxLen;

      if (similarity >= 0.72 && similarity > highestScore) {
        highestScore = similarity;
        bestMatch = {
          command: cmd,
          confidence: Math.round(similarity * 100) / 100,
        };
      }
    }
  }

  return bestMatch;
}
