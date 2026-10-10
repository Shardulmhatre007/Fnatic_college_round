# ADR 0001 — Capture Context: Camera, Microphone, and Speech Recognition in MV3

**Status:** Accepted  
**Date:** 2026-10-10  
**Deciders:** Orchestrator  

---

## Context

Manifest V3 service workers run in an isolated context with no DOM and cannot call
`getUserMedia` or `webkitSpeechRecognition`. We must decide where camera capture,
microphone capture, and speech recognition actually run.

**Spike conducted:** A minimal WXT extension was scaffolded with an offscreen document
and a content script. `getUserMedia` was called from both contexts to verify browser
behaviour. Results are summarised in the Decision section.

## Decision

| Capability | Host context | Rationale |
|---|---|---|
| Camera (`getUserMedia` + MediaPipe) | Offscreen document (`chrome.offscreen`) | Only context besides a tab that can call `getUserMedia` without being visible. One document per extension lifetime. Runs in a hidden iframe-like renderer. |
| Microphone / Web Speech API | Onboarding/options tab **or** content script | `webkitSpeechRecognition` requires a tab with user gesture history. Offscreen documents gained audio support in Chrome 116 (`purposes: ['USER_MEDIA']`) but `SpeechRecognition` still does not work there as of Chrome 124. We use the content script as the host; it creates `SpeechRecognition`, forwards transcript events to the service worker via `chrome.runtime.sendMessage`. |
| MediaPipe WASM (tracking) | Offscreen document | Runs alongside the camera feed. WASM executes in the offscreen renderer thread. |
| Optional offline STT (Vosk/Whisper WASM) | Offscreen document | Audio data piped from `getUserMedia` stream. Runs fully offline. |

**Permission grant flow:** The onboarding tab calls `getUserMedia` first to trigger the
browser permission prompt. After the user grants permission, the service worker creates
the offscreen document, which inherits the granted camera permission. Microphone
permission for the content script is requested by the content script on first voice
activation if not already granted.

## Consequences

- The service worker never directly handles media; it routes messages between the
  offscreen document, content scripts, and UI pages.
- The offscreen document must be kept alive while tracking is active. The service worker
  recreates it if Chrome garbage-collects it (idle timeout ~30 s when no messages).
- Speech recognition runs in the content script of the active tab. When the user
  switches tabs the service worker stops recognition on the old tab and starts it on
  the new one.
- Hindi locale (`hi-IN`) and English locale (`en-IN`) are set on the
  `SpeechRecognition` object; switching language is a restart of the recogniser.
- All inter-context communication uses the typed message bus in `shared/messaging.ts`.
