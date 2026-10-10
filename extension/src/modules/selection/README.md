# Selection Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/selection/`

## Purpose

Converts a stable cursor position plus gesture/voice events into a confirmed selection
action. Strategies: dwell ring, nod-to-select, shake-to-cancel, gesture click, voice
confirmation. Prevents accidental activation through an intent filter.

## Public interface

```ts
// selection/index.ts
export function feedFrame(pos: CursorPosition, gestures: GestureId[], timestamp: number): SelectionEvent | null;
export function reset(): void;
export type { SelectionEvent };
```

A `SelectionEvent` indicates a confirmed selection with the method used and the target.

## Tunables

Dwell time default: 800 ms (from the active `UserProfile.dwellMs`).

## Dependencies

- `shared/types.ts` (CursorPosition, GestureId, SelectionMethod)
