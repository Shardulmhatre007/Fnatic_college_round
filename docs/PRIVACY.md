# docs/PRIVACY.md — Privacy Policy for Handsfree

## What data Handsfree accesses

| Data | Where it stays | When it is used |
|---|---|---|
| Camera feed | On your device only | To detect head and hand position |
| Microphone audio | On your device only (standard mode) | To recognise voice commands |
| Microphone audio | On your device only (private mode) | Processed by local Vosk/Whisper WASM |
| Voice transcripts | On your device only | Matched against command grammar |
| Settings and rituals | chrome.storage.sync (Google) | Persist and sync your preferences |
| Benchmark results | On your device (optionally backend) | Compare performance over time |

## What data Handsfree never does

- Raw video frames are never stored, uploaded, or shared with any party.
- Raw audio is never stored or uploaded (neither in standard nor private mode).
- Transcripts are never logged or sent to any server.

## Standard mode (Web Speech API)

The default speech engine is your browser's built-in Web Speech API. Depending on your
browser, this **may send audio to the browser vendor's servers** (e.g. Google for
Chrome) for processing. Handsfree has no control over this. The status indicator shows
"Standard mode" when this is active.

## Private mode (offline recognition)

When private mode is enabled, Handsfree uses Vosk or Whisper running as WebAssembly
inside your browser. No audio ever leaves your device. Recognition quality may differ
from the standard engine.

## Optional backend

The optional FastAPI backend (disabled by default) adds cross-device settings sync,
ritual sharing, benchmark history, and LLM-assisted command interpretation. If you
enable it:
- Settings are sent to your configured backend URL.
- Ritual steps are synced.
- The LLM interpret endpoint **does not receive audio or transcripts** — only the text
  of a command you choose to send.
- You control the backend URL; you can self-host.

## Contact

File a privacy concern via the GitHub issue tracker.
