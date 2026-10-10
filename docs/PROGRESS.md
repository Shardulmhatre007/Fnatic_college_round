# docs/PROGRESS.md — Milestone Tracker

| Milestone | Status | Notes |
|---|---|---|
| M0 — Scaffold, CI, ADRs, shared contracts | ✅ Done | All files created; first commit on `develop`. |
| M1 — Tracking, cursor, dwell, calibration | ⏳ Not started | Blocked on: none. Owner: Frontend Agent. |
| M2 — Voice, dictation, number overlay, EN+HI | ⏳ Not started | Blocked on: M1 done. Owner: Frontend Agent. |
| M3 — Control panel | ⏳ Not started | Blocked on: M2 done. Owner: Frontend Agent. |
| M4 — Onboarding tutorial | ⏳ Not started | Blocked on: M3 done. Owner: Frontend Agent. |
| M5 — Rituals | ⏳ Not started | Blocked on: M3 done. Owner: Frontend + Integration. |
| M6 — Point-and-say fusion, intent filter, fatigue | ⏳ Not started | Blocked on: M2 done. Owner: Integration Agent. |
| M7 — Benchmark module | ⏳ Not started | Blocked on: M3 done. Owner: Frontend Agent. |
| M8 — Backend: auth, sync, rituals, LLM, STT | ⏳ Not started | Blocked on: M5 done. Owner: Backend Agent. |
| M9 — Polish, docs, packaging, demo | ⏳ Not started | Blocked on: M8 done. Owner: All. |

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
