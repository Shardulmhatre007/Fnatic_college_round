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
import { updateCursor, type ViewportSize } from "@/modules/cursor/index";
import { renderCursor, showDwellRing, hideDwellRing, showNumbers, hideNumbers } from "@/modules/overlay/index";
import { feedFrame, type SelectionEvent } from "@/modules/selection/index";
import { getVoiceManager } from "@/modules/voice/index";
import { matchCommand } from "@/modules/commands/index";
import type { LandmarkResult, NumberBadge } from "@/shared/types";

let currentNumberBadges: { badge: NumberBadge; element: HTMLElement }[] = [];

function scanClickableElements(): NumberBadge[] {
  currentNumberBadges = [];
  const selector = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1']), [role='button']";
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

  let index = 1;
  const badges: NumberBadge[] = [];

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight) {
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

function executeAction(actionType: string, data?: Record<string, unknown>): void {
  switch (actionType) {
    case "scroll": {
      const dir = data?.direction === "up" ? -1 : 1;
      const amount = typeof data?.amount === "number" ? data.amount : 400;
      window.scrollBy({ top: dir * amount, behavior: "smooth" });
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
      const match = currentNumberBadges.find((b) => b.badge.n === num);
      if (match) {
        match.element.click();
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
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const voiceManager = getVoiceManager();

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

      // If dictating, append text to focused input
      const state = voiceManager.getState();
      if (state.isDictating && event.isFinal) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          active.value += (active.value.length > 0 ? " " : "") + event.text;
        }
        return;
      }

      // Check command matching
      const match = matchCommand(event.text, event.locale);
      if (match && match.confidence >= 0.75) {
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
            target.click();
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
