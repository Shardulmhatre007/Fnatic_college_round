/**
 * Content script entrypoint.
 *
 * Responsibilities:
 * - Render cursor overlay, dwell ring, and target highlights.
 * - Point-and-Say Fusion Engine integration combining head tracking and voice.
 * - Host Web Speech API (`SpeechRecognition`) for the active tab.
 * - Forward transcript and tracking events to the service worker.
 * - Enforce Intent Filter safety gate and Confirmation Workflow.
 * - Monitor interaction difficulty through Fatigue & Effort Management.
 * - Execute validated browser actions (click, scroll, navigate, numbers, typing).
 */
import { defineContentScript } from "wxt/sandbox";
import { isExtensionMessage } from "@/shared/messaging";
import { updateCursor, type ViewportSize } from "@/modules/cursor/index";
import {
  renderCursor,
  showDwellRing,
  hideDwellRing,
  showNumbers,
  hideNumbers,
  highlightTarget,
  showBanner,
  showConfirmPrompt,
  hideConfirmPrompt,
  showBreakPrompt,
  hideBreakPrompt,
} from "@/modules/overlay/index";
import { feedFrame, type SelectionEvent } from "@/modules/selection/index";
import { getVoiceManager } from "@/modules/voice/index";
import {
  FusionEngine,
  resolveTargetAtPoint,
  type ResolvedTarget,
} from "@/modules/fusion/index";
import type { LandmarkResult, NumberBadge } from "@/shared/types";

let currentNumberBadges: { badge: NumberBadge; element: HTMLElement }[] = [];

function scanClickableElements(): NumberBadge[] {
  currentNumberBadges = [];
  const selector =
    "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1']), [role='button'], [role='link']";
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

function executeAction(
  actionType: string,
  data?: Record<string, unknown>,
  target?: ResolvedTarget | null
): void {
  switch (actionType) {
    case "scroll": {
      const dir = data?.direction === "up" ? -1 : 1;
      const amount = typeof data?.amount === "number" ? data.amount : 400;
      window.scrollBy({ top: dir * amount, behavior: "smooth" });
      break;
    }
    case "click":
    case "click_this": {
      if (target && target.element && target.element.isConnected) {
        target.element.click();
      } else {
        const centerTarget = document.elementFromPoint(
          window.innerWidth / 2,
          window.innerHeight / 2
        );
        if (centerTarget instanceof HTMLElement) {
          centerTarget.click();
        }
      }
      break;
    }
    case "open_this": {
      if (target && target.element) {
        if (target.element instanceof HTMLAnchorElement && target.element.href) {
          window.location.href = target.element.href;
        } else {
          target.element.click();
        }
      }
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
    const fusionEngine = new FusionEngine();

    // 1. Setup Fusion Engine Event Listeners
    fusionEngine.onExecute((action, target) => {
      if (action.type === "dictate_start") {
        voiceManager.setDictating(true);
      } else if (action.type === "dictate_stop") {
        voiceManager.setDictating(false);
      } else if (action.type === "pause_listening") {
        voiceManager.pauseListening();
        fusionEngine.setSystemState({ isPaused: true });
      } else if (action.type === "resume_listening") {
        voiceManager.resumeListening();
        fusionEngine.setSystemState({ isPaused: false });
      } else {
        executeAction(action.type, action as unknown as Record<string, unknown>, target);
      }
    });

    fusionEngine.onFeedback((feedback) => {
      showBanner(feedback.message, feedback.type);
    });

    fusionEngine.onConfirmation((pending) => {
      if (pending) {
        showConfirmPrompt(pending, (confirmed) => {
          fusionEngine.resolveConfirmation(confirmed);
        });
      } else {
        hideConfirmPrompt();
      }
    });

    fusionEngine.onFatigue((state, suggestion) => {
      if (state === "BREAK_SUGGESTED") {
        showBreakPrompt(
          suggestion ?? "Continuous interaction difficulty detected. Consider a short break.",
          () => {
            fusionEngine.cancel("Recalibration chosen");
            showBanner("Recalibration recommended. Use settings to calibrate.", "info");
          },
          () => {
            fusionEngine.getFatigueManager().dismissBreakSuggestion();
          }
        );
      } else {
        hideBreakPrompt();
      }

      // Relay fatigue state to service worker
      try {
        void chrome.runtime.sendMessage({
          type: "FATIGUE_STATE_CHANGED",
          payload: {
            state,
            suggestion,
            metrics: fusionEngine.getFatigueManager().getMetrics(),
          },
        });
      } catch {
        // Safe ignore
      }
    });

    // 2. Keyboard Accessibility for Confirmation & Break dialogs
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && fusionEngine.getPendingConfirmation()) {
        e.preventDefault();
        fusionEngine.resolveConfirmation(true);
      } else if (e.key === "Escape") {
        if (fusionEngine.getPendingConfirmation()) {
          e.preventDefault();
          fusionEngine.resolveConfirmation(false);
        } else {
          hideBreakPrompt();
          fusionEngine.getFatigueManager().dismissBreakSuggestion();
        }
      }
    });

    // 3. Voice Transcript Processing
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

      // Pass final transcripts to Point-and-Say Fusion Engine
      fusionEngine.processTranscript(event, performance.now());
    });

    // 4. Runtime Message Handling
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

        // Resolve actionable DOM target under cursor
        const target = resolveTargetAtPoint(pos);

        // Update target outline highlight
        const isLocked = fusionEngine.getState() === "AWAITING_CONFIRMATION";
        highlightTarget(isLocked ? fusionEngine.getLockedTarget() : target, isLocked);

        // Update fusion engine with pointer state
        fusionEngine.updatePointer(pos, landmarks.timestamp, target);

        // Dwell / Nod Selection fallback from M1
        const selection: SelectionEvent | null = feedFrame(
          pos,
          landmarks.gestures,
          landmarks.timestamp
        );

        if (selection) {
          if (target && target.isActionable) {
            // Check risk before dwell execution
            if (target.risk === "high") {
              showBanner(`⚠️ "${target.text || target.tagName}" requires voice confirmation. Say "Confirm" to click.`, "warning");
            } else {
              target.element.click();
            }
          }
          hideDwellRing();
        } else {
          showDwellRing(pos, 0);
        }

        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "TRACKING_STATE_CHANGED") {
        const active = (message.payload as { active: boolean }).active;
        fusionEngine.setSystemState({ trackingActive: active });
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "COMMAND_EXECUTE") {
        const payload = message.payload as { actionType: string; data?: Record<string, unknown> };
        executeAction(payload.actionType, payload.data, fusionEngine.getLockedTarget());
        sendResponse({ ok: true });
        return true;
      }

      sendResponse({ ok: true });
      return true;
    });
  },
});
