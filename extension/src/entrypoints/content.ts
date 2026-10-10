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

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtensionMessage(message)) return;
      // TODO(#2): implement command execution and ritual step handling (M1/M2)
      sendResponse({ ok: true });
      return true;
    });
  },
});
