# docs/OPEN_QUESTIONS.md — Deferred Decisions

Questions that arose during implementation but did not block progress. Each entry
records the chosen default so the project can move forward.

---

## OQ-001 — `uuid` package vs. `crypto.randomUUID`

**Question:** `shared/storage.ts` uses `uuid` (npm package) to generate the default
profile ID. Chrome extensions have access to `crypto.randomUUID()` natively in
Manifest V3 (Chrome 92+).

**Chosen default:** Replace the `uuid` npm package with `crypto.randomUUID()` before
M1 to avoid an unnecessary dependency. The `uuid` entry in `package.json` should be
removed.

**Action:** Frontend Agent removes the `uuid` import and replaces it in M1.

---

## OQ-002 — Tailwind CSS v3 vs v4

**Question:** Tailwind v4 (beta) was available at scaffold time but has breaking
changes. CONTEXT.md specifies v3.

**Chosen default:** Stick with Tailwind CSS v3 as specified. Revisit after M3 if v4
reaches stable.

---

## OQ-003 — Offscreen document audio permission scope

**Question:** Chrome 116+ allows offscreen documents to call `getUserMedia` for audio
with `purposes: ['USER_MEDIA']`. Does this make the content-script speech recognition
approach in ADR 0001 obsolete?

**Chosen default:** Keep speech recognition in the content script as per ADR 0001.
`webkitSpeechRecognition` still does not work in offscreen documents as of Chrome 124
(only raw `getUserMedia` audio works there). If a future Chrome version enables
`SpeechRecognition` in offscreen documents, migrate in a post-M2 patch.

---

## OQ-005 — pnpm availability in local dev environment

**Question:** `pnpm` is not installed in the development environment. CI workflows use
`pnpm/action-setup@v4` which installs it automatically. Should local development also
use pnpm, or switch to npm?

**Chosen default:** Keep pnpm in CI (it is faster and deterministic with
`--frozen-lockfile`). For local development without pnpm installed, run
`npm install --legacy-peer-deps` as a fallback. The extension scripts still work with
npm. Contributors who prefer pnpm can install it with `npm install -g pnpm`.

**Action:** Add a note to the contributing section of README.md in M1.


**Question:** Should there be a root `pnpm-workspace.yaml` tying `extension/` and
`backend/` together?

**Chosen default:** No pnpm workspace root for now. Python (`backend/`) does not
benefit from pnpm, and the extension is self-contained. Add a workspace root only if a
shared JS utility package is needed across milestones.
