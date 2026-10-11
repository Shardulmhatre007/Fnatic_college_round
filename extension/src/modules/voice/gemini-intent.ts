import type { CommandAction } from "@/shared/types";

/**
 * Gemini Intent Parser using free Gemini API or on-device window.ai.
 * Fallback parser that understands natural language, Hindi, Hinglish,
 * and conversational requests like:
 * - "numbers dikhao" -> show_numbers
 * - "numbers hatao" -> hide_numbers
 * - "open side panel" / "side panel kholo" -> open_sidepanel
 * - "search cats on youtube" -> open_url
 * - "click the 2nd one" -> click_number
 */

const SYSTEM_PROMPT = `You are the intent parser for Handsfree, a hands-free web browsing accessibility tool.
Map the user's spoken voice command (which can be English, Hindi, or Hinglish) into a structured JSON action.
Allowed action types:
1. {"type": "show_numbers"} - e.g. "numbers dikhao", "show numbers", "number dikhao", "badges", "number labels", "show tags"
2. {"type": "hide_numbers"} - e.g. "hide numbers", "numbers hatao", "badges off", "numbers band karo"
3. {"type": "click_number", "n": <number>} - e.g. "click 2", "number 5", "do number", "teen", "click second one"
4. {"type": "open_sidepanel"} - e.g. "side panel kholo", "open side panel", "panel kholo", "open companion", "menu kholo"
5. {"type": "scroll", "direction": "down"|"up", "amount": 400} - e.g. "scroll down", "neeche jao", "upar karo", "page down"
6. {"type": "open_url", "url": "<url>"} - e.g. "youtube kholo" -> https://www.youtube.com, "search google" -> https://www.google.com
7. {"type": "click"} - e.g. "click this", "press", "dabaao", "select"
8. {"type": "go_back"} - e.g. "go back", "peeche jao"
9. {"type": "new_tab"} - e.g. "new tab", "naya tab"
10. {"type": "close_tab"} - e.g. "close tab", "tab band karo"
11. {"type": "dictate", "text": "<text>"} - if user is dictating content to write or search

RESPOND ONLY WITH A VALID JSON OBJECT, NO CODEBLOCKS, NO EXPLANATION.`;

export async function parseIntentWithGemini(
  transcript: string,
  apiKey?: string
): Promise<CommandAction | { type: "dictate"; text: string } | null> {
  const clean = transcript.trim();
  if (!clean) return null;

  // 1. Try On-device window.ai (Chrome Built-in Gemini Nano - 100% Free & Local)
  if (typeof window !== "undefined" && (window as unknown as { ai?: { languageModel?: { create: () => Promise<{ prompt: (text: string) => Promise<string> }> } } }).ai?.languageModel) {
    try {
      const session = await (window as unknown as { ai: { languageModel: { create: (opts: { systemPrompt: string }) => Promise<{ prompt: (text: string) => Promise<string> }> } } }).ai.languageModel.create({
        systemPrompt: SYSTEM_PROMPT,
      });
      const response = await session.prompt(clean);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as CommandAction;
      }
    } catch (err) {
      // Fallback to API if window.ai fails
      console.debug("[Gemini Nano] Local model not ready or failed, trying API fallback", err);
    }
  }

  // 2. If an API key is provided, use Google Gemini 1.5 Flash Free API
  if (apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Utterance: "${clean}"` }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json() as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return JSON.parse(text) as CommandAction;
        }
      }
    } catch (err) {
      console.warn("[Gemini API] Request failed:", err);
    }
  }

  return null;
}
