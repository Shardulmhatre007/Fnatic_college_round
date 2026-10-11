/**
 * Service worker entrypoint (background script).
 *
 * Responsibilities:
 * - Route typed messages between the offscreen document, content scripts, and UI pages.
 * - Forward TRACKING_LANDMARKS from the sidepanel to the active tab's content script
 *   so head tracking and blink-click work on every website.
 * - Coordinate tab-level voice recognition (stop on old tab, start on new tab).
 * - Handle chrome.runtime.onInstalled to open the onboarding tab on first install.
 * - Relay ritual replay across tab navigations.
 * - Execute tab-management commands (new tab, next/prev tab, close tab, open sidepanel)
 *   from content scripts.
 */
import { defineBackground } from "wxt/sandbox";
import { isExtensionMessage } from "@/shared/messaging";

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    }
  });

  // When the toolbar icon is clicked, open the side panel on the active tab.
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) {
      void chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) return;

    switch (message.type) {
      // ------------------------------------------------------------------
      // Landmarks from the sidepanel → forward to the currently active tab
      // so the head cursor and blink-click work on every website.
      // ------------------------------------------------------------------
      case "TRACKING_LANDMARKS": {
        void (async () => {
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            // Don't forward to extension pages (sidepanel, options, onboarding)
            if (
              activeTab?.id !== undefined &&
              activeTab.url &&
              !activeTab.url.startsWith("chrome") &&
              !activeTab.url.startsWith("chrome-extension")
            ) {
              await chrome.tabs.sendMessage(activeTab.id, message).catch(() => {
                // Content script may not be ready yet; safe to ignore.
              });
            }
          } catch {
            // Ignore – no active tab or permission issue
          }
          sendResponse({ ok: true });
        })();
        return true;
      }

      // ------------------------------------------------------------------
      // Tab management commands sent from content scripts
      // ------------------------------------------------------------------
      case "CMD_NEXT_TAB": {
        void (async () => {
          const tabs = await chrome.tabs.query({ currentWindow: true });
          const current = tabs.findIndex((t) => t.active);
          const next = tabs[(current + 1) % tabs.length];
          if (next?.id !== undefined) await chrome.tabs.update(next.id, { active: true });
          sendResponse({ ok: true });
        })();
        return true;
      }
      case "CMD_PREV_TAB": {
        void (async () => {
          const tabs = await chrome.tabs.query({ currentWindow: true });
          const current = tabs.findIndex((t) => t.active);
          const prev = tabs[(current - 1 + tabs.length) % tabs.length];
          if (prev?.id !== undefined) await chrome.tabs.update(prev.id, { active: true });
          sendResponse({ ok: true });
        })();
        return true;
      }
      case "CMD_CLOSE_TAB": {
        void (async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
          sendResponse({ ok: true });
        })();
        return true;
      }
      case "CMD_NEW_TAB": {
        void chrome.tabs.create({});
        sendResponse({ ok: true });
        return true;
      }
      case "CMD_OPEN_SIDEPANEL": {
        void (async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id !== undefined) {
            await chrome.sidePanel.open({ tabId: tab.id });
          }
          sendResponse({ ok: true });
        })();
        return true;
      }

      default:
        sendResponse({ ok: true });
        return true;
    }
  });
});
