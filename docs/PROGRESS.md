# docs/PROGRESS.md — Milestone Tracker

| Milestone | Status | Notes |
|---|---|---|
| M0 — Scaffold, CI, ADRs, shared contracts | ✅ Done | All files created; first commit on `develop`. |
| M1 — Tracking, cursor, dwell, calibration | ✅ Done | One Euro filter, cursor manager, dwell click, overlay, calibration tested. |
| M2 — Voice, dictation, number overlay, EN+HI | ✅ Done | Web Speech recognition, English & Hindi grammar, dictation, number overlay tested. |
| M3 — Control panel | ✅ Done | React options control panel, side panel, live settings sync, and profiles tested. |
| M4 — Onboarding tutorial | ✅ Done | 5-step game-style calibration tutorial, Web Audio synthesizers, and setup tested. |
| M5 — Rituals | ⏳ Not started | Blocked on: M3 done. Owner: Frontend + Integration. |
| M6 — Point-and-say fusion, intent filter, fatigue | ⏳ Not started | Blocked on: M2 done. Owner: Integration Agent. |
| M7 — Benchmark module | ⏳ Not started | Blocked on: M3 done. Owner: Frontend Agent. |
| M8 — Backend: auth, sync, rituals, LLM, STT | ⏳ Not started | Blocked on: M5 done. Owner: Backend Agent. |
| M9 — Polish, docs, packaging, demo | ⏳ Not started | Blocked on: M8 done. Owner: All. |

## M4 Details

**Done when:** Fresh install opens onboarding tab; permissions requested; 5-target bubble calibration game completes; Web Audio synthesized sound effects play; dwell, nod, and voice commands verified interactively.

**Verification steps:**
1. `cd extension && npm run type-check` — zero type errors.
2. `cd extension && npm test` — 33 unit tests pass across 7 test suites.
3. `cd extension && npm run build` — bundles `onboarding.html`, `options.html`, `sidepanel.html`, worker, and content scripts into `.output/chrome-mv3/`.

**Handoff:**
- Agent: Frontend Agent
- Changed: `entrypoints/onboarding/` (App.tsx, audio.ts, index.html, main.tsx).
- Open items: Rituals macro recording and replay in M5.
- Contract changes: None.

## M3 Details

**Done when:** React options control panel and side panel open cleanly; commands, gestures, profiles, and language switch apply and persist to storage; dark mode UI with Inter and Outfit typography.

**Verification steps:**
1. `cd extension && npm run type-check` — zero type errors.
2. `cd extension && npm test` — 33 unit tests pass across 7 test suites.
3. `cd extension && npm run build` — bundles `options.html` and `sidepanel.html` alongside background worker and content scripts.

**Handoff:**
- Agent: Frontend Agent
- Changed: `entrypoints/options/` (App.tsx, main.tsx, style.css, index.html), `entrypoints/sidepanel/` (App.tsx, main.tsx, index.html).
- Open items: Onboarding interactive tutorial in M4.
- Contract changes: None.

## M2 Details

**Done when:** Core voice commands ("scroll down", "click", "show numbers", "click 14", "pause listening") work in English and Hindi (Hinglish); dictation types into input fields; numbers highlight clickable elements.

**Verification steps:**
1. `cd extension && npm run type-check` — zero type errors.
2. `cd extension && npm test` — 33 unit tests pass across 7 test suites.
3. `cd extension && npm run build` — extension bundles with content script voice and overlay bindings.

**Handoff:**
- Agent: Frontend Agent
- Changed: `voice/` (VoiceManager, continuous speech recognition, locale restart), `commands/` (fuzzy grammar matching, English/Hindi/Hinglish aliases, number extractor), `entrypoints/content.ts` (scanClickableElements, action executor, dictation buffer).
- Open items: Offline Whisper/Vosk WASM fallback in M8.
- Contract changes: None.

## M1 Details

**Done when:** Head moves the cursor on a test page; One Euro filter eliminates jitter; dwell click activates targets; 5-target calibration and drift detection work under 30 s.

**Verification steps:**
1. `cd extension && npm run type-check` — zero type errors.
2. `cd extension && npm test` — all 26 unit tests pass across 6 test suites.
3. `cd extension && npm run build` — extension bundles with content-scripts and background service worker.

**Handoff:**
- Agent: Frontend Agent
- Changed: `cursor/` (OneEuroFilter, CursorManager, config), `selection/` (SelectionManager, dwell, nod/pinch), `overlay/` (Shadow DOM isolated cursor, dwell ring, number badges, HUD), `calibration/` (CalibrationManager, drift detection), `tracking/` (head pose, gesture detection), `entrypoints/content.ts` (tracking message listener).
- Open items: MediaPipe worker initialization offscreen document connection for live camera feed.
- Contract changes: None.

## M0 Details

**Done when:** Empty extension loads in Chrome; CI workflows are in place; ADRs 0001–0004 recorded; `shared/types.ts` and `shared/schemas.ts` published; backend health test passes.

**Verification steps:**
1. `cd extension && pnpm install && pnpm type-check` — no errors.
2. `cd extension && pnpm test` — schemas.test.ts passes.
3. `cd backend && pip install -e ".[dev]" && pytest` — test_health.py passes.
4. Load `extension/.output/chrome-mv3/` as unpacked extension — no manifest errors.

**Handoff:**
- Agent: Orchestrator
- Changed: Full project scaffold, 4 ADRs, CI workflows, shared contracts, locale files, module READMEs, backend skeleton, root config files.
- Open items: pnpm lock file not committed (generated on first `pnpm install`). Backend `uuid` import in storage.ts needs the `uuid` npm package added.
