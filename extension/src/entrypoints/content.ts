/**
 * Content script entrypoint.
 *
 * Responsibilities:
 * - Render the cursor overlay and number badges on the page.
 * - Host Web Speech API (`SpeechRecognition`) for the active tab.
 * - Forward transcript events to the service worker.
 * - Execute commands from the service worker (click, scroll, type, etc.).
 * - Detect SPA navigations (History API) and notify the service worker.
 * - Resolve ElementRef targets during ritual step execution.
 */
import { defineContentScript } from "wxt/sandbox";
import { isExtensionMessage } from "@/shared/messaging";
import { loadSettings, onSettingsChanged } from "@/shared/storage";
import { updateCursor, type ViewportSize } from "@/modules/cursor/index";
import { renderCursor, showDwellRing, hideDwellRing, showNumbers, hideNumbers } from "@/modules/overlay/index";
import { feedFrame, setSelectionConfig, type SelectionEvent } from "@/modules/selection/index";
import { getVoiceManager } from "@/modules/voice/index";
import { matchCommand } from "@/modules/commands/index";
import { parseIntentWithGemini } from "@/modules/voice/gemini-intent";
import type { LandmarkResult, NumberBadge } from "@/shared/types";

let currentNumberBadges: { badge: NumberBadge; element: HTMLElement }[] = [];

function scanClickableElements(): NumberBadge[] {
  currentNumberBadges = [];
  const selector =
    "a, button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='option'], [tabindex]:not([tabindex='-1']), [onclick], yt-formatted-string, ytd-thumbnail, ytd-rich-item-renderer #video-title, .yt-spec-button-shape-next";
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

  let index = 1;
  const badges: NumberBadge[] = [];

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    // Must be visible within current viewport
    if (
      rect.width > 8 &&
      rect.height > 8 &&
      rect.top >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left >= 0 &&
      rect.left <= window.innerWidth
    ) {
      // Avoid duplicate overlapping ancestor badges
      const isHidden = window.getComputedStyle(el).visibility === "hidden" || window.getComputedStyle(el).display === "none";
      if (isHidden) continue;
      const badge: NumberBadge = {
        n: index,
        rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        elementRef: {
          text: el.innerText?.slice(0, 50),
          ariaLabel: el.getAttribute("aria-label") ?? undefined,
          role: el.getAttribute("role") ?? undefined,
        },
      };
      badges.push(badge);
      currentNumberBadges.push({ badge, element: el });
      index++;
    }
  }

  return badges;
}

/** Send a tab/navigation command to the background service worker. */
function sendToBackground(type: string, payload?: Record<string, unknown>): void {
  try {
    void chrome.runtime.sendMessage({ type, payload: payload ?? {} });
  } catch {
    // Safe ignore – background may be unavailable briefly on reload.
  }
}

function executeAction(actionType: string, data?: Record<string, unknown>): void {
  switch (actionType) {
    case "scroll": {
      const dir = data?.direction === "up" ? -1 : 1;
      const amount = typeof data?.amount === "number" ? data.amount : 400;
      const delta = dir * amount;

      // 1. Try window scrolling
      window.scrollBy({ top: delta, behavior: "smooth" });

      // 2. Also try scrolling documentElement and body for fixed / strict layouts
      if (document.documentElement) {
        document.documentElement.scrollBy({ top: delta, behavior: "smooth" });
      }
      if (document.body) {
        document.body.scrollBy({ top: delta, behavior: "smooth" });
      }

      // 3. If an inner container is active or hovered, scroll it too
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== document.body && typeof activeEl.scrollBy === "function") {
        activeEl.scrollBy({ top: delta, behavior: "smooth" });
      }
      break;
    }
    case "click": {
      const centerTarget = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (centerTarget instanceof HTMLElement) centerTarget.click();
      break;
    }
    case "go_back":
      window.history.back();
      break;
    case "go_forward":
      window.history.forward();
      break;
    case "show_numbers": {
      const badges = scanClickableElements();
      showNumbers(badges);
      break;
    }
    case "hide_numbers":
      hideNumbers();
      currentNumberBadges = [];
      break;
    case "click_number": {
      const num = Number(data?.n);
      if (currentNumberBadges.length === 0) {
        // Auto-scan clickable elements on page if badges weren't open yet
        scanClickableElements();
      }
      const match = currentNumberBadges.find((b) => b.badge.n === num);
      if (match) {
        const el = match.element;
        try {
          el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          el.focus({ preventScroll: true });
        } catch {
          // Safe ignore
        }

        // Fire comprehensive mouse events for YouTube and modern SPAs
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const eventInit: MouseEventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY,
        };

        el.dispatchEvent(new MouseEvent("pointerdown", eventInit));
        el.dispatchEvent(new MouseEvent("mousedown", eventInit));
        el.dispatchEvent(new MouseEvent("pointerup", eventInit));
        el.dispatchEvent(new MouseEvent("mouseup", eventInit));
        el.click();

        // Also if element has an anchor or button parent/child, trigger click on it too
        const clickableAncestor = el.closest("a, button, [role='button'], ytd-thumbnail, ytd-compact-video-renderer") as HTMLElement | null;
        if (clickableAncestor && clickableAncestor !== el) {
          clickableAncestor.click();
        }

        hideNumbers();
        currentNumberBadges = [];
      }
      break;
    }
    case "new_line": {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.value += "\n";
      }
      break;
    }
    case "delete_last_word": {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const words = active.value.trimEnd().split(" ");
        words.pop();
        active.value = words.join(" ");
      }
      break;
    }
    // Tab and navigation actions are handled by the background service worker.
    case "next_tab":
      sendToBackground("CMD_NEXT_TAB");
      break;
    case "prev_tab":
      sendToBackground("CMD_PREV_TAB");
      break;
    case "close_tab":
      sendToBackground("CMD_CLOSE_TAB");
      break;
    case "new_tab":
      sendToBackground("CMD_NEW_TAB");
      break;
    case "open_sidepanel":
      sendToBackground("CMD_OPEN_SIDEPANEL");
      break;
    case "open_url": {
      const url = typeof data?.url === "string" ? data.url : "";
      if (url) {
        // Navigate the current tab to the URL.
        window.location.href = url;
      }
      break;
    }
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const voiceManager = getVoiceManager();

    // Auto-sync voice recognition state and language with persisted settings
    void loadSettings().then((settings) => {
      if (settings.locale) {
        voiceManager.setLocale(settings.locale);
      }
      if (settings.voiceEnabled) {
        voiceManager.startListening(settings.locale);
      }
      setSelectionConfig({
        dwellEnabled: settings.dwellEnabled ?? false,
        dwellMs: settings.dwellMs ?? 1200,
      });
    });

    onSettingsChanged((changes) => {
      if (changes.locale !== undefined) {
        voiceManager.setLocale(changes.locale);
      }
      if (changes.voiceEnabled !== undefined) {
        if (changes.voiceEnabled) {
          voiceManager.startListening();
        } else {
          voiceManager.stopListening();
        }
      }
      if (changes.dwellEnabled !== undefined || changes.dwellMs !== undefined) {
        setSelectionConfig({
          ...(changes.dwellEnabled !== undefined ? { dwellEnabled: changes.dwellEnabled } : {}),
          ...(changes.dwellMs !== undefined ? { dwellMs: changes.dwellMs } : {}),
        });
      }
    });

    voiceManager.onTranscript((event) => {
      // Send transcript event to runtime
      try {
        void chrome.runtime.sendMessage({
          type: "VOICE_TRANSCRIPT",
          payload: event,
        });
      } catch {
        // Safe ignore
      }

      const state = voiceManager.getState();
      // Check if an input, textarea, or contenteditable (e.g. YouTube search box or docs) is focused
      const active = document.activeElement;
      const isInputActive =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && (active.isContentEditable || active.getAttribute("contenteditable") === "true"));

      const insertText = (textToType: string) => {
        if (!active || !(active instanceof HTMLElement)) return;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          active.value += (active.value.length > 0 ? " " : "") + textToType;
          active.dispatchEvent(new Event("input", { bubbles: true }));
          active.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (active.isContentEditable || active.getAttribute("contenteditable") === "true") {
          active.textContent = (active.textContent ? `${active.textContent} ` : "") + textToType;
          active.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };

      // 1. If user is explicitly dictating or text input is focused:
      if (state.isDictating && event.isFinal) {
        if (isInputActive) {
          insertText(event.text);
        }
        return;
      }

      // 2. Check local fuzzy command grammar matching
      const match = matchCommand(event.text, event.locale);

      if (match && match.confidence >= 0.70) {
        const action = match.command.action;
        if (action.type === "dictate_start") {
          voiceManager.setDictating(true);
        } else if (action.type === "dictate_stop") {
          voiceManager.setDictating(false);
        } else if (action.type === "pause_listening") {
          voiceManager.pauseListening();
        } else if (action.type === "resume_listening") {
          voiceManager.resumeListening();
        } else {
          executeAction(action.type, action as unknown as Record<string, unknown>);
        }
        return;
      }

      // 3. If an input/search box is focused and user spoke final words, type them in!
      if (isInputActive && event.isFinal) {
        insertText(event.text);
        return;
      }

      // 4. Gemini Free Intent Model Fallback
      if (event.isFinal) {
        void parseIntentWithGemini(event.text).then((aiAction) => {
          if (!aiAction) return;
          if (aiAction.type === "dictate") {
            if (isInputActive) insertText(aiAction.text);
          } else {
            executeAction(aiAction.type, aiAction as unknown as Record<string, unknown>);
          }
        });
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtensionMessage(message)) return;

      if (message.type === "TRACKING_LANDMARKS") {
        const landmarks = message.payload as LandmarkResult;
        const viewport: ViewportSize = {
          width: window.innerWidth,
          height: window.innerHeight,
        };

        const pos = updateCursor(landmarks, viewport);
        renderCursor(pos);

        const selection: SelectionEvent | null = feedFrame(
          pos,
          landmarks.gestures,
          landmarks.timestamp
        );

        if (selection) {
          const target = document.elementFromPoint(selection.position.x, selection.position.y);
          if (target && target instanceof HTMLElement) {
            // If target is inside an input/search box container, find the actual input
            const inputEl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
              ? target
              : (target.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null) ||
                (target.closest("form, ytd-searchbox")?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null);

            const clickTarget = inputEl || target;
            try {
              clickTarget.focus({ preventScroll: true });
            } catch {
              // Safe ignore
            }

            const rect = clickTarget.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;
            const eventInit: MouseEventInit = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
            };

            clickTarget.dispatchEvent(new MouseEvent("pointerdown", eventInit));
            clickTarget.dispatchEvent(new MouseEvent("mousedown", eventInit));
            clickTarget.dispatchEvent(new MouseEvent("pointerup", eventInit));
            clickTarget.dispatchEvent(new MouseEvent("mouseup", eventInit));
            clickTarget.click();

            // Also check for clickable ancestor (e.g. YouTube card or button)
            const parentButton = clickTarget.closest("button, a, [role='button']") as HTMLElement | null;
            if (parentButton && parentButton !== clickTarget) {
              parentButton.click();
            }
          }
          hideDwellRing();
        } else {
          showDwellRing(pos, 0);
        }

        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "COMMAND_EXECUTE") {
        const payload = message.payload as { actionType: string; data?: Record<string, unknown> };
        executeAction(payload.actionType, payload.data);
        sendResponse({ ok: true });
        return true;
      }

      sendResponse({ ok: true });
      return true;
    });
  },
});
