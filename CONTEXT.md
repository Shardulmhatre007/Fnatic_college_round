# CONTEXT.md — Handsfree: Voice and Webcam-Based Browsing

> Base reference document. Every agent reads this before touching code. Keep it current: when a module, API, or file changes, update the relevant section in the same pull request.

---

## 1. Project Summary

**Handsfree** is a Chrome browser extension that lets people browse the web with a standard webcam and microphone, with no specialised hardware. It targets users with motor impairments, temporary injuries, or repetitive strain injury (RSI).

Users can:
- Move the cursor with head or hand movement.
- Navigate by voice (click, scroll, open links, switch tabs, go back).
- Dictate text into any input field.
- Select targets safely with dwell, nods, gestures, or voice confirmation.
- Combine pointing and speaking ("point at it, say *click*").
- Record and replay multi-step **Rituals** (macros) triggered by a secret phrase or gesture.
- Complete setup in under 30 seconds and keep control as posture and lighting change.
- Measure their own performance against mouse and keyboard.

The interface and the voice grammar support **English** and **Hindi** (including Hinglish aliases).

## 2. Current Status

| Area | State |
|---|---|
| Problem analysis and feature design | Done |
| Stack decision | Done (confirmed by owner) |
| Documents (CONTEXT, PROMPT, AGENTS, RULES) | Done |
| Repository scaffold | Not started |
| Extension code | Not started |
| Backend code | Not started |
| Tests, docs, CI | Not started |

No application code exists yet. The orchestrator creates the scaffold (see PROMPT.md).

## 3. Confirmed Technology Stack

**Extension (primary product)**
- TypeScript (strict mode), Manifest V3.
- WXT framework (Vite-based) for entrypoints, builds, and hot reload.
- React and Tailwind CSS for the control panel, side panel, and onboarding.
- MediaPipe Tasks Vision (Face Landmarker, Hand Landmarker) running in WebAssembly in the browser.
- Web Speech API as the default speech engine (`en-IN`, `hi-IN`), with an optional offline engine (Vosk or Whisper in WASM) as "private mode".
- `chrome.storage` for settings, profiles, and rituals.
- Vitest for unit tests, Playwright for end-to-end tests.

**Backend (optional layer)**
- Python 3.12, FastAPI, Pydantic v2, SQLAlchemy, SQLite for development and Postgres for production.
- pytest for tests, ruff for linting and formatting.

**Tooling**
- Monorepo, pnpm workspaces, ESLint, Prettier, GitHub Actions CI.

## 4. Architecture

```
┌──────────────────────────── Chrome Extension ─────────────────────────────┐
│                                                                            │
│  Capture context (camera + mic)                                            │
│   ├─ Tracking module  ── face/hand landmarks ──┐                           │
│   └─ Voice module     ── transcripts ──────────┤                           │
│                                                ▼                           │
│  Input fusion & intent filter ──► Selection module (dwell/nod/gesture)     │
│                                                │                           │
│  Cursor module (One Euro filter, snapping) ────┤                           │
│                                                ▼                           │
│  Command engine ──► Action executor (messages to content script)           │
│        ▲                                       │                           │
│        └── Ritual engine (macro replay)        ▼                           │
│                                      Content script + Overlay (page)       │
│                                                                            │
│  Service worker: routing, tab control, storage, ritual replay across tabs  │
│  Options page / Side panel / Onboarding tab: React UI                      │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ HTTPS (optional, degrades gracefully)
                                       ▼
                              FastAPI backend (sync, rituals marketplace,
                              benchmark storage, LLM proxy, server STT)
```

**Key design principles**
1. The extension works fully offline with the backend absent.
2. No video frame ever leaves the device. Only landmarks are processed, locally.
3. Every input channel is optional. If one degrades (dark room, noisy room), the others keep working.
4. Dangerous actions (payment, delete, send, submit) always require confirmation.

**Open technical risk (resolve in the first spike):** MV3 service workers cannot access the camera or microphone. Decide where capture lives (an extension page, an offscreen document, or the content script) and where speech recognition can actually run. Camera and mic permission should be granted once from the onboarding tab. Record the decision in `docs/adr/0001-capture-context.md`.

## 5. Modules (14)

| # | Module | Location | Responsibility |
|---|---|---|---|
| 1 | Tracking | `extension/src/modules/tracking` | MediaPipe face and hand landmarks, head pose, gesture detection, lighting checks |
| 2 | Cursor | `extension/src/modules/cursor` | Map pose to screen coordinates, One Euro smoothing, magnetic snapping to targets |
| 3 | Selection | `extension/src/modules/selection` | Dwell ring, nod-to-select, shake-to-cancel, gesture clicks, accidental-action prevention |
| 4 | Voice | `extension/src/modules/voice` | Speech recognition, noise gating, language switch, dictation, wake and pause phrases |
| 5 | Commands | `extension/src/modules/commands` | Command grammar, fuzzy matching, default commands, custom commands, optional LLM fallback |
| 6 | Rituals | `extension/src/modules/rituals` | Macro recorder, step schema, replay engine, element resolution with fallbacks, confirmation gates |
| 7 | Overlay | `extension/src/modules/overlay` | Number badges ("click 14"), dwell ring, state HUD, listening and paused indicators |
| 8 | Calibration | `extension/src/modules/calibration` | 30-second bubble-pop calibration, silent recalibration, drift and fatigue detection |
| 9 | Benchmark | `extension/src/modules/benchmark` | Task suite, metrics (time, accuracy, errors, accidental activations), comparison charts |
| 10 | Control panel | `extension/src/entrypoints/options` | Commands, rituals, gestures, profiles, privacy, shortcuts management (React) |
| 11 | Side panel | `extension/src/entrypoints/sidepanel` | Quick toggles, live status, mic and camera state |
| 12 | Onboarding | `extension/src/entrypoints/onboarding` | First-install game-style tutorial with animation and audio |
| 13 | Shared | `extension/src/shared` | Types, Zod schemas, storage wrapper, messaging bus, i18n loader |
| 14 | Backend | `backend/app` | Auth, settings sync, ritual packs, benchmark storage, LLM proxy, server STT |

## 6. Directory Structure

```
handsfree/
├── CONTEXT.md  PROMPT.md  AGENTS.md  RULES.md  README.md
├── .github/workflows/        # ci-extension.yml, ci-backend.yml
├── docs/                     # architecture, ADRs, user guide, API reference
│   └── adr/
├── extension/
│   ├── package.json  tsconfig.json  wxt.config.ts
│   └── src/
│       ├── entrypoints/      # background.ts, content.ts, options/, sidepanel/, onboarding/
│       ├── modules/          # tracking, cursor, selection, voice, commands,
│       │                     # rituals, overlay, calibration, benchmark
│       ├── shared/           # types, schemas, storage, messaging, i18n
│       ├── locales/          # en.json, hi.json
│       └── assets/           # sounds, animations, icons
├── extension/tests/          # unit/, e2e/
└── backend/
    ├── pyproject.toml
    ├── app/
    │   ├── main.py
    │   ├── api/              # route modules
    │   ├── core/             # config, security, database
    │   ├── models/           # SQLAlchemy models
    │   ├── schemas/          # Pydantic models
    │   └── services/         # business logic
    └── tests/
```

## 7. What Each Key File Does

| File | Purpose |
|---|---|
| `entrypoints/background.ts` | Service worker: message routing, tab and window control, ritual replay across tabs, install hook that opens onboarding |
| `entrypoints/content.ts` | Injected into pages: renders overlay, resolves elements, performs clicks, scrolls, and typing |
| `entrypoints/options/` | The control panel app |
| `entrypoints/onboarding/` | First-install interactive demo |
| `shared/types.ts` | Single source of truth for TypeScript types shared by every module |
| `shared/schemas.ts` | Zod schemas validating settings, commands, and rituals at runtime |
| `shared/storage.ts` | Typed wrapper over `chrome.storage` with defaults and migrations |
| `shared/messaging.ts` | Typed message bus between worker, content script, and pages |
| `locales/en.json`, `locales/hi.json` | UI strings and voice grammar for each language |
| `backend/app/main.py` | FastAPI app factory, middleware, router registration |

## 8. Core Data Contracts

```ts
// shared/types.ts (abridged)
type Locale = "en" | "hi";

interface Ritual {
  id: string;
  name: string;
  trigger: { type: "phrase" | "gesture" | "combo"; phrase?: string; gesture?: GestureId };
  params?: Record<string, { label: string; default?: string }>; // e.g. {product}
  requiresConfirmation: boolean; // forced true if any step is dangerous
  steps: RitualStep[];
}

type RitualStep =
  | { op: "open_url"; url: string; newTab?: boolean }
  | { op: "type"; target: ElementRef; text: string }       // text may contain {param}
  | { op: "click"; target: ElementRef }
  | { op: "scroll"; direction: "up" | "down"; amount: number }
  | { op: "wait"; for: "load" | "element" | "ms"; value?: string | number }
  | { op: "switch_tab"; index?: number; match?: string }
  | { op: "speak"; text: string };

interface ElementRef {
  text?: string; ariaLabel?: string; role?: string;
  cssFallback?: string; positionFallback?: { x: number; y: number };
}
```

Element resolution order at replay: visible text, ARIA label and role, CSS selector, then position. Never depend on a single brittle selector.

**Example ritual.** Phrase "peek a boo": `open_url flipkart.com` → `type search box "iPhone 17"` → `click search`.

## 9. Backend API (v1)

Base path `/api/v1`. All endpoints except `/health`, `/auth/*` need a bearer token.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/auth/register`, `/auth/login` | Account creation and token issue |
| GET, PUT | `/sync/settings` | Download and upload settings and profiles |
| GET, POST | `/rituals` | List own rituals, create |
| GET, PUT, DELETE | `/rituals/{id}` | Read, update, delete |
| POST | `/rituals/{id}/publish` | Share to the marketplace |
| GET | `/marketplace/rituals` | Browse shared packs |
| POST | `/benchmarks` | Store a benchmark run |
| GET | `/benchmarks/summary` | Aggregate comparison data |
| POST | `/llm/interpret` | Turn a free-form request into a command or ritual draft |
| POST | `/stt/transcribe` | Optional server-side speech-to-text |

Rules: validate all input with Pydantic, rate limit `/llm/*` and `/stt/*`, never log audio or transcripts, store only hashed passwords.

## 10. Feature Set

**Required (from the problem statement):** cursor control, voice navigation, voice typing, intentional activation, combined point-and-say, calibration under 30 seconds, website compatibility, performance evaluation.

**Differentiators:** Rituals (macros), numbered click overlay, adaptive snapping, smart dwell timer, fatigue and posture awareness, environment adaptation, profiles (tremor, one-handed, RSI, injury), Hindi and Hinglish voice commands, built-in benchmark, offline private mode.

**Default commands (English / Hindi examples):** scroll down / "neeche scroll karo", scroll up / "upar scroll karo", click, go back / "peeche jao", next tab, close tab, show numbers, pause listening, new line, delete last word.

## 11. Onboarding Flow

Triggered by `chrome.runtime.onInstalled` (reason `install`), opens a full tab:
1. Permission step with a plain explanation of camera and microphone use.
2. 30-second calibration as a bubble-pop game.
3. "Nod to select" with animated ring and Web Audio cues.
4. "Say *scroll down*" voice practice.
5. Create a first Ritual by voice.
6. Completion screen. The tutorial can be replayed from Settings.

## 12. Evaluation Plan

Benchmark tasks: click 10 targets, fill a form, search and open a result, switch tabs. Metrics: completion time, command recognition accuracy, selection error rate, accidental activations per minute, each compared with mouse and keyboard. Results are shown as charts and exportable as JSON.

## 13. Privacy and Safety

- Video frames never leave the device or get stored.
- Default speech uses the browser's Web Speech API, which may send audio to the browser vendor. Private mode uses offline recognition. The UI must state this plainly.
- Optional server STT and LLM features are off by default and require explicit opt-in.
- Rituals that contain dangerous steps cannot run without confirmation.
- A visible indicator always shows whether camera and mic are active.

## 14. Glossary

- **Dwell**: holding the cursor over a target for a set time to click.
- **Ritual**: a saved multi-step macro triggered by a phrase or gesture.
- **One Euro filter**: adaptive smoothing filter that reduces jitter while staying responsive.
- **Number overlay**: numbered badges on clickable elements for "click N" voice selection.
- **Point and say**: pointing to a target with head or hand, then confirming by voice.

## 15. Related Documents

- `PROMPT.md`: the instruction given to the orchestrator agent.
- `AGENTS.md`: roles, ownership, and handoffs for the sub-agents.
- `RULES.md`: coding standards and workflow rules.
