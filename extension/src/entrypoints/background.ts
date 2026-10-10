/**
 * Service worker entrypoint (background script).
 *
 * Responsibilities:
 * - Route typed messages between the offscreen document, content scripts, and UI pages.
 * - Manage the offscreen document lifecycle (create, keep alive, recreate on timeout).
 * - Coordinate tab-level voice recognition (stop on old tab, start on new tab).
 * - Handle chrome.runtime.onInstalled to open the onboarding tab on first install.
 * - Relay ritual replay across tab navigations.
 */
import { isExtensionMessage } from "@/shared/messaging";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return;
  // TODO(#1): implement full message routing
  sendResponse({ ok: true });
  // Return true to keep the channel open for async handlers added in M1+.
  return true;
});
