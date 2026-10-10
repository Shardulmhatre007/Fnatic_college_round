# Rituals Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/rituals/`

## Purpose

Records, stores, and replays multi-step macros (Rituals). The recorder captures
user actions and builds `RitualStep[]`. The replay engine executes steps in order
via messages to the content script, handling navigation waits, element resolution
failures, and dangerous-step confirmation gates.

## Public interface

```ts
// rituals/index.ts
export function startRecording(): void;
export function stopRecording(): Ritual;
export function replayRitual(ritual: Ritual, params?: Record<string, string>): void;
export function cancelReplay(): void;
```

## Element resolution

Resolution order: text → ariaLabel+role → cssFallback → positionFallback.
See ADR 0004 for details.

## Dependencies

- `shared/types.ts` (Ritual, RitualStep, ElementRef)
- `shared/messaging.ts` (RITUAL_* messages)
- `shared/schemas.ts` (ritualSchema for validation on load)
