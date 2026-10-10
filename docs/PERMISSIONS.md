# docs/PERMISSIONS.md — Extension Permission Justifications

Every permission declared in `wxt.config.ts` must have a justification here.
This document supports the Chrome Web Store review process.

| Permission | Justification |
|---|---|
| `storage` | Persist user settings, profiles, commands, and rituals in `chrome.storage.sync`. Required for cross-device settings sync and for storing calibration results. |
| `tabs` | Read the active tab URL and title (for context-aware commands and ritual triggers). Switch tabs in response to voice commands. Listen for tab completion events during ritual replay. |
| `activeTab` | Execute content scripts and read the DOM of the active tab when the user explicitly activates a command. Avoids requiring broad host permissions. |
| `offscreen` | Create the hidden offscreen document that runs `getUserMedia` (camera) and the MediaPipe tracking worker. MV3 service workers cannot access media streams. |
| `sidePanel` | Show the quick-toggle side panel without navigating away from the current page. |
| `scripting` | Dynamically inject the overlay and number badge scripts into pages. Required to render in-page UI without declaring host permissions for every site. |
| `host_permissions: <all_urls>` | Inject the content script (overlay, element resolver, voice host) into any page the user navigates to. Without this the extension would only work on pre-declared domains. Minimal data is read; no data is sent off-device. |
