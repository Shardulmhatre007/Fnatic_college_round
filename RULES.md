# RULES.md — Engineering Rules

These rules apply to every agent and every contribution. If a rule gets in the way of a good result, raise it with the Orchestrator; do not quietly break it.

## 1. Principles

1. **Simple over clever.** Choose the most readable solution that meets the requirement.
2. **No unnecessary blocks.** No dead code, commented-out code, unused imports, empty handlers, speculative abstractions, or placeholder functions.
3. **One responsibility per file and function.** If a function needs a long comment to explain what it does, split or rename it.
4. **Accessibility is a feature, not a polish step.**
5. **Privacy by default.** Process locally, send nothing without opt-in.

## 2. Comments

- Comment **why**, not what. The code already shows what.
- Every exported function, class, and type gets a one-to-three-line doc comment (TSDoc or Python docstring) covering purpose, parameters if not obvious, and side effects.
- Use comments for non-obvious decisions, browser quirks, and numeric constants (with units).
- No comment that restates the next line. No banner comments. No author tags or dates.
- `TODO` is allowed only with an issue reference: `// TODO(#42): handle iframe targets`.

## 3. TypeScript (extension)

- `strict: true`. No `any`; use `unknown` and narrow. No non-null assertions without a justifying comment.
- Shared shapes live in `shared/types.ts` and are validated at boundaries with Zod.
- Named exports only. Files under about 250 lines; split when larger.
- Pure logic separated from browser APIs so it can be unit tested.
- No magic numbers: name constants and keep tunables in one config module.
- React: function components and hooks, no inline styles, Tailwind utility classes, components under about 150 lines.
- Naming: `camelCase` variables and functions, `PascalCase` types and components, `UPPER_SNAKE_CASE` constants, `kebab-case` file names.
- Handle every rejected promise. Never swallow errors silently; log with context or surface to the user.

## 4. Python (backend)

- Python 3.12, type hints on every function, ruff for lint and format, line length 100.
- Pydantic models at every API boundary. Business logic in `services/`, not in route handlers.
- Dependency injection through FastAPI `Depends`. No global mutable state.
- Docstrings in Google style. `snake_case` functions, `PascalCase` classes.
- Never log secrets, tokens, audio, or transcripts.
- Configuration through environment variables loaded by a single settings class. Provide `.env.example`.

## 5. Internationalisation

- No user-facing string in code. All text goes in `locales/en.json` and `locales/hi.json` with identical keys.
- Voice grammar per language lives in locale files, including Hinglish aliases.
- Test both languages for every new command or screen.

## 6. Accessibility and UX

- Everything operable by voice, head, or hand must also work by keyboard in the control panel.
- Contrast ratio at least 4.5:1, visible focus states, ARIA labels on custom controls, respect `prefers-reduced-motion`.
- Dangerous actions (pay, delete, send, submit) require confirmation, including inside rituals.
- The camera and microphone state indicator must always be visible when active.

## 7. Performance

- The tracking loop must stay smooth on a mid-range laptop. Set a documented frame budget and measure against it.
- No work on the main thread that can run in a worker or WASM context.
- Clean up streams, listeners, and animation frames on teardown.

## 8. Security and privacy

- No secrets in the repository. Use `.env` locally and GitHub secrets in CI.
- Request the minimum extension permissions; justify each in `docs/PERMISSIONS.md`.
- Validate and sanitise all external input. No `eval`, no remote code, no `innerHTML` with untrusted data.
- Raw video and audio are never stored or uploaded without explicit user opt-in.

## 9. Git workflow

- Branches: `main` (release), `develop` (integration), feature branches `feat/`, `fix/`, `docs/`, `test/`, `chore/` prefixed.
- Commits follow Conventional Commits: `feat(cursor): add one euro filter`.
- Pull requests are small, focused, linked to a task, and include verification steps. Squash merge.
- No direct pushes to `main` or `develop`. CI must be green before merge.
- Releases use semantic versioning tags and an updated `CHANGELOG.md`.

## 10. Testing

- New logic ships with tests in the same pull request.
- Unit tests for pure logic (filters, grammar matching, ritual resolution), integration tests for messaging, end-to-end tests for core flows (calibration, voice click, ritual replay).
- Tracking and voice tests use recorded fixtures, not live devices.
- Track and report: command accuracy, selection error rate, accidental activations per minute, task time.
- A bug fix includes a test that fails without the fix.

## 11. Documentation

- Update `CONTEXT.md`, user docs, and API docs in the same pull request as the change.
- Every command in the docs must have been run successfully.
- Record architectural decisions in `docs/adr/NNNN-title.md` (context, decision, consequences).

## 12. Definition of done for any task

- [ ] Meets the acceptance criteria.
- [ ] Lint, type-check, and tests pass locally and in CI.
- [ ] Comments follow section 2, no dead code.
- [ ] Both languages covered where user-facing.
- [ ] Docs and `CONTEXT.md` updated.
- [ ] Handoff report written (see `AGENTS.md`).
