# Cut2Kit

Cut2Kit is an AI-first CAM foundation for prefab housing, built on the existing Electron + local server + React/Vite shell inherited from T3 Code.

The current first vertical slice is directory-first:

- open a project directory
- detect `cut2kit.settings.json` and DXFs
- detect `cut2kit.manufacturing.json` manufacturing intent
- validate settings against an explicit schema
- inspect project health in the app
- generate deterministic A2MC manifests and `.nc` outputs
- prepare a supervised Codex-backed Cut to Kit Agent thread from the current project snapshot

## Run

Install dependencies:

```bash
bun install
```

Start the web/server development flow:

```bash
bun run dev
```

Start the desktop app:

```bash
bun run dev:desktop
```

## Sample project

A sample Cut2Kit project lives at `examples/prefab-demo-project`.

It includes:

- `cut2kit.settings.json`
- `cut2kit.manufacturing.json`
- sample DXF placeholders under `elevations/`, `floor/`, and `roof/`
- deterministic A2MC manifest and NC generation inputs

A reusable settings example also lives at `examples/cut2kit.settings.example.json`.
An A2MC manufacturing-plan example also lives at `examples/cut2kit.manufacturing.example.json`.

## Current workflow

1. Launch the app.
2. Open the sample project directory from the left sidebar.
3. Review the project workspace route for validation, DXF detection, manufacturing-plan status,
   and planned outputs.
4. Generate A2MC outputs to write:
   - `output/manifests/panel-manifest.json`
   - `output/manifests/nest-manifest.json`
   - `output/manifests/queue-manifest.json`
   - `output/nc/*.nc`
5. Use `Open Cut to Kit Agent` to prepare a supervised Codex thread with the current project
   snapshot and explicit guidance to edit `cut2kit.manufacturing.json` through the existing
   approval flow.

The deterministic code owns scanning, validation, manufacturing-plan interpretation, A2MC post
generation, queue ordering, and NC file serialization. AI suggestions stay review-first and
approval-gated.

## Health checks

Required repo checks:

```bash
bun fmt
bun lint
bun typecheck
```

Tests use Vitest through:

```bash
bun run test
```

## Notes

- The repo still preserves the original T3-like architecture on purpose.
- Codex integration still flows through the existing local app-server and approval plumbing.
- The first real post path is AXYZ A2MC and is driven by explicit manufacturing intent in
  `cut2kit.manufacturing.json`.
- Geometry extraction from DXF and richer CAM planning still need follow-on work; the current safe
  path is explicit manufacturing intent rather than guessed toolpaths.
