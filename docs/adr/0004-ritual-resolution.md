# ADR 0004 — Ritual Element Resolution and Page-Change Survival

**Status:** Accepted  
**Date:** 2026-10-10  
**Deciders:** Orchestrator  

---

## Context

Rituals are multi-step macros that target DOM elements. Elements identified during
recording may not be present or may have different attributes at replay time, especially
after page loads, SPA navigations, or site updates.

## Decision

**Resolution order** (defined in `CONTEXT.md` section 8):
1. Visible text content match
2. ARIA label + role match
3. CSS selector (stored as fallback only)
4. Position fallback (x, y as fraction of viewport)

No step in a ritual may rely solely on the CSS selector. The content script tries each
strategy in order and takes the first match. If none match, the step fails with a
`RITUAL_STEP_FAILED` message and the ritual pauses for user confirmation.

**Page-change survival:**
- After `open_url` or `switch_tab` steps the service worker listens for
  `chrome.tabs.onUpdated` with `status === 'complete'` before sending the next step.
- A `wait` step with `for: 'element'` polls the content script (up to 10 s, 500 ms
  interval) until the element is found or the timeout fires.
- Navigation-triggered SPA changes (History API) are detected by the content script via
  a `popstate` / `pushstate` hook; it signals the service worker to re-inject the
  overlay and resume.

**Dangerous step gate:** Any step with `op: 'type'` targeting a payment or credentials
field, or any step that submits a form, is flagged as `dangerous: true` during
recording. A ritual that has any dangerous step sets `requiresConfirmation: true` and
will always pause before executing that step.

## Consequences

- The `ElementRef` shape must always include at least one of `text`, `ariaLabel`, or
  `role` to be valid. Zod schema enforces this.
- Rituals recorded on highly dynamic sites (e.g. SPAs with random class names) will be
  fragile if only CSS selectors are available. The recorder UI warns the user when no
  stable selector is found.
- Position fallback is a last resort; it is unreliable on responsive layouts and must
  show a warning indicator in the overlay during replay.
