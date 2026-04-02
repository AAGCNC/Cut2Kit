# Cut2Kit

Cut2Kit is an AI-first CAM foundation for prefab housing, built on the existing Electron + local server + React/Vite shell inherited from T3 Code.

The current first vertical slice is directory-first:

- open a project directory
- detect `cut2kit.settings.json` and DXFs
- validate settings against an explicit schema
- inspect project health in the app
- generate deterministic placeholder manifests and `.nc` outputs
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
- sample DXF placeholders under `elevations/`, `floor/`, and `roof/`
- deterministic manifest and NC generation inputs

A reusable settings example also lives at `examples/cut2kit.settings.example.json`.

## Current workflow

1. Launch the app.
2. Open the sample project directory from the left sidebar.
3. Review the project workspace route for validation, DXF detection, and planned outputs.
4. Generate placeholder outputs to write:
   - `output/manifests/panel-manifest.json`
   - `output/manifests/nest-manifest.json`
   - `output/manifests/queue-manifest.json`
   - `output/nc/*.nc`
5. Use `Open Cut to Kit Agent` to prepare a supervised Codex thread with the current project snapshot.

The deterministic code owns scanning, validation, manifest derivation, queue ordering, and placeholder NC generation. AI suggestions stay review-first and approval-gated.

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
- Geometry, real nesting, and machine-specific post-processors are intentionally not implemented yet in this first slice.
