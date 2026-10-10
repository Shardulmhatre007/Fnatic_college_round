# Overlay Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/overlay/`

## Purpose

Renders the in-page visual layer: numbered click badges on interactive elements,
dwell progress ring, state HUD (tracking on/off, mic on/off, listening/paused),
and confirmation dialogs for dangerous actions.

## Public interface

```ts
// overlay/index.ts
export function showNumbers(badges: NumberBadge[]): void;
export function hideNumbers(): void;
export function showDwellRing(pos: CursorPosition, progressFraction: number): void;
export function hideDwellRing(): void;
export function updateHud(status: UiStatusUpdate): void;
export type { UiStatusUpdate };
```

All DOM manipulation uses a shadow root on a custom element to avoid CSS conflicts
with the host page.

## Dependencies

- `shared/types.ts` (NumberBadge, CursorPosition)
- `shared/messaging.ts` (UI_STATUS_UPDATE)
