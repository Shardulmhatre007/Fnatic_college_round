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
import { renderCursor, showDwellRing, hideDwellRing } from "@/modules/overlay/index";
import { feedFrame, type SelectionEvent } from "@/modules/selection/index";
import type { LandmarkResult } from "@/shared/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
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
          // Perform synthetic click at selection coordinates
          const target = document.elementFromPoint(selection.position.x, selection.position.y);
          if (target && target instanceof HTMLElement) {
            target.click();
          }
          hideDwellRing();
        } else {
          // Update dwell ring progress
          showDwellRing(pos, 0);
        }

        sendResponse({ ok: true });
        return true;
      }

      sendResponse({ ok: true });
      return true;
    });
  },
});
