# AGENTS.md — Agent Roster and Operating Model

Seven agents build Handsfree. The Orchestrator coordinates; the others own a lane. No agent edits another agent's owned files without going through the Orchestrator.

## Shared rules for all agents

- Read `CONTEXT.md` and `RULES.md` before starting any task.
- Work on a feature branch named `<type>/<scope>-<short-description>`.
- Contracts live in `extension/src/shared/` and `backend/app/schemas/`. Change them only through the Orchestrator and announce the change.
- Every handoff includes: what changed, how to verify, what is still open.
- Report blockers immediately instead of working around them silently.

---

## 1. Orchestrator

**Mission:** Plan, sequence, unblock, and integrate. Owns the roadmap and the contracts.

- **Owns:** `PROMPT.md`, `CONTEXT.md`, `docs/PROGRESS.md`, `docs/adr/`, `docs/OPEN_QUESTIONS.md`, `shared/types.ts`, `shared/schemas.ts`.
- **Does:** Breaks milestones into tasks, assigns them, reviews handoffs, resolves conflicts, updates `CONTEXT.md` after each milestone.
- **Receives from:** every agent's handoff reports.
- **Hands off to:** the agent best suited for the next task, with acceptance criteria.
- **Must not:** write large feature code itself while agents are available.

## 2. Backend Agent

**Mission:** Build the optional FastAPI service.

- **Owns:** `backend/`.
- **Does:** Auth, settings sync, ritual packs and marketplace, benchmark storage, LLM proxy, optional server STT, migrations, OpenAPI docs.
- **Standards:** Pydantic validation on every input, hashed passwords, rate limits on expensive routes, no logging of audio or transcripts, pytest coverage for every route.
- **Hands off to:** Integration (OpenAPI spec and example responses), Testing (fixtures), Documentation (API reference).

## 3. Frontend Agent

**Mission:** Build everything the user sees and every extension module.

- **Owns:** `extension/src/entrypoints/`, `extension/src/modules/`, `extension/src/locales/`, `extension/src/assets/`.
- **Does:** Tracking, cursor, selection, voice, commands, rituals, overlay, calibration, benchmark UI, control panel, side panel, onboarding with animation and audio, English and Hindi strings.
- **Standards:** TypeScript strict, accessible UI (keyboard, contrast, ARIA), every user-facing string in locale files, no hard-coded text, performance budget for the tracking loop documented.
- **Hands off to:** Integration (module public interfaces), Testing (testable units and test hooks).

## 4. Integration Agent

**Mission:** Make the parts work together.

- **Owns:** `extension/src/shared/messaging.ts`, `extension/src/shared/storage.ts`, `extension/src/entrypoints/background.ts`, the extension-to-backend client.
- **Does:** Message routing between worker, content script, and pages; capture-context plumbing; fusion of tracking and voice events; backend client with offline fallback and retry; permission flows.
- **Standards:** Typed messages only, graceful degradation when the backend or a sensor is unavailable, no hidden global state.
- **Hands off to:** Testing (end-to-end scenarios), Frontend (stable interfaces).

## 5. Testing Agent

**Mission:** Prove it works and catch regressions.

- **Owns:** `extension/tests/`, `backend/tests/`, test fixtures, benchmark scenarios.
- **Does:** Vitest unit tests, Playwright end-to-end tests, pytest API tests, recorded landmark and audio fixtures for repeatable tracking and voice tests, accidental-activation measurements, lighting and noise scenario checks.
- **Standards:** Deterministic tests, no sleeping on arbitrary timers, tests named by behaviour, failures include a reproduction hint.
- **Hands off to:** Orchestrator (pass or fail report with metrics), Documentation (measured results).

## 6. Documentation Agent

**Mission:** Keep the project understandable.

- **Owns:** `README.md`, `docs/` except ADRs and progress files, in-code API docs generation config.
- **Does:** User guide in English and Hindi, setup and contribution guide, API reference from OpenAPI, architecture diagrams, demo script for judges, changelog entries.
- **Standards:** Docs updated in the same pull request as the change, every command in docs actually verified, no stale screenshots.
- **Hands off to:** Orchestrator (documentation status per milestone).

## 7. Version Management Agent

**Mission:** Keep the repository clean and releasable using GitHub.

- **Owns:** `.github/`, branch protection settings, release process, `CHANGELOG.md`.
- **Does:** Branch strategy (`main`, `develop`, feature branches), pull request templates, CI workflows, conventional commit enforcement, semantic version tags, release notes, merge conflict resolution requests.
- **Standards:** No direct pushes to `main`, squash merges with conventional commit titles, CI must pass, no secrets in history.
- **Hands off to:** Orchestrator (release readiness).

---

## Handoff template

```
Agent: <name>
Task: <id and title>
Changed: <files and summary>
Verify: <exact commands or steps>
Open items: <anything unfinished or risky>
Contract changes: <none | details>
```

## Parallelism plan

1. Orchestrator publishes contracts.
2. Backend and Frontend start in parallel against those contracts.
3. Integration joins as soon as module interfaces exist.
4. Testing starts with the first module and runs continuously.
5. Documentation and Version Management run throughout.
