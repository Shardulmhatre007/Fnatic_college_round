# ADR 0003 — Messaging Protocol: Typed Message Bus Between All Contexts

**Status:** Accepted  
**Date:** 2026-10-10  
**Deciders:** Orchestrator  

---

## Context

A Chrome MV3 extension has at least four isolated JavaScript contexts:
1. Service worker (background)
2. Offscreen document (camera + tracking)
3. Content script (injected into each tab)
4. Extension pages (options, side panel, onboarding)

All contexts must exchange structured data without introducing implicit coupling or
breaking runtime type safety.

## Decision

We use a **discriminated-union message bus** defined in `shared/messaging.ts`.

Every message is an object `{ type: MessageType; payload: ... }` where `type` is a
string literal from the `MessageType` union. TypeScript's exhaustive narrowing enforces
handling at every receiver.

**Transport layer:**
- Offscreen ↔ Service worker: `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- Content script ↔ Service worker: `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
- Options / sidepanel ↔ Service worker: `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- Long-lived connections (e.g. live landmark stream): `chrome.runtime.connect` port

**Message categories:**

| Category prefix | Direction | Example types |
|---|---|---|
| `TRACKING_*` | Offscreen → SW → Content | `TRACKING_LANDMARKS`, `TRACKING_STATE` |
| `VOICE_*` | Content → SW | `VOICE_TRANSCRIPT`, `VOICE_ERROR`, `VOICE_STATE` |
| `COMMAND_*` | SW → Content | `COMMAND_EXECUTE`, `COMMAND_CONFIRM` |
| `RITUAL_*` | SW ↔ Content | `RITUAL_START`, `RITUAL_STEP`, `RITUAL_DONE` |
| `UI_*` | SW ↔ Options/Panel | `UI_SETTINGS_CHANGED`, `UI_STATUS_UPDATE` |
| `CAPTURE_*` | SW → Offscreen | `CAPTURE_START`, `CAPTURE_STOP` |

Responses are returned via the `sendResponse` callback or a reply message on the same
port. Every message handler returns `true` from `onMessage` to keep the response
channel open if it performs async work.

## Consequences

- `shared/messaging.ts` is the single source of truth. Any new message type must be
  added there first (contract-first).
- Adding a message type is a small, reviewable change that agents coordinate through
  the Orchestrator.
- Runtime validation with Zod is applied at every trust boundary (e.g. when a content
  script receives data from the service worker after processing external input).
