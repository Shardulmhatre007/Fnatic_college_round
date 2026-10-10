# Voice Module

**Owner:** Frontend Agent  
**Location:** `extension/src/modules/voice/`

## Purpose

Hosts `SpeechRecognition` in the content script of the active tab. Applies noise gating,
language switching, and wake/pause phrase detection. Emits `TranscriptEvent` messages
to the service worker via the messaging bus. Supports `en-IN` and `hi-IN` (Hinglish).

## Public interface

```ts
// voice/index.ts
export function startListening(locale: Locale): void;
export function stopListening(): void;
export function setLocale(locale: Locale): void;
export type { VoiceState };
```

## Privacy note

Web Speech API sends audio to the browser vendor. Private (offline) mode uses
Vosk/Whisper WASM instead. The UI always shows which mode is active.

## Dependencies

- `shared/types.ts` (TranscriptEvent, Locale)
- `shared/messaging.ts` (VOICE_TRANSCRIPT, VOICE_ERROR, VOICE_STATE_CHANGED)

## See also

ADR 0001 (where speech recognition runs in MV3)
