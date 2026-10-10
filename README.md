# Handsfree

> Browse the web with a standard webcam and microphone. Built for users with motor impairments, temporary injuries, or RSI.

## Features

- **Head and hand cursor** — move the cursor with your face or hand using MediaPipe.
- **Voice commands** — click, scroll, navigate tabs, and type by speaking in English or Hindi.
- **Rituals** — record and replay multi-step macros triggered by a phrase or gesture.
- **Number overlay** — say "click 7" to interact with any element on the page.
- **30-second calibration** — quick bubble-pop game that adapts to your posture and lighting.
- **Point and say** — point to a target and confirm by voice.
- **Accessibility profiles** — tuned for tremor, RSI, one-handed, and injury recovery.
- **Private mode** — optional offline speech recognition (Vosk/Whisper WASM).

## Quick start (development)

### Extension

```bash
cd extension
pnpm install
pnpm dev
```

Load the `extension/.output/chrome-mv3/` directory as an unpacked extension in Chrome.

### Backend (optional)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

## Architecture

See [`CONTEXT.md`](CONTEXT.md) for the full architecture, module map, and data contracts.

Key decisions are recorded in [`docs/adr/`](docs/adr/).

## Contributing

1. Read `CONTEXT.md`, `RULES.md`, and `AGENTS.md` before starting.
2. Branch from `develop` using a `feat/`, `fix/`, or `docs/` prefix.
3. Follow [Conventional Commits](https://www.conventionalcommits.org/).
4. CI must be green before merge. No direct pushes to `main`.

## Privacy

Video frames never leave your device. The default speech engine uses the browser's
built-in Web Speech API. Enable **Private mode** for fully offline recognition.
See [`docs/PRIVACY.md`](docs/PRIVACY.md) for details.

## License

MIT — see [`LICENSE`](LICENSE).
