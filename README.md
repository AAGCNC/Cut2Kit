# Cut2Kit

Cut2Kit is an AI-first CAM foundation for prefab housing, built on the existing Electron + local server + React/Vite shell inherited from T3 Code.

The current wall-layout vertical slice is directory-first:

- open a project directory
- detect `cut2kit.settings.json` and source PDFs
- validate settings against an explicit schema
- inspect project health in the app
- use GPT-5.4 through the existing Codex/T3Code harness to extract wall geometry from a dimensioned elevation PDF
- generate framing layout JSON and framing PDF
- generate sheathing layout JSON and sheathing PDF
- optionally include fastening notes/pages by setting
- persist validation output before packaging final PDFs

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
- sample dimensioned PDFs under `elevations/`, `floor/`, and `roof/`
- deterministic A2MC manifest and NC generation inputs

A canonical reusable settings example lives at `docs/cut2kit.settings.example.json`.
A mirrored copy also lives at `examples/cut2kit.settings.example.json`.
An A2MC manufacturing-plan example also lives at `examples/cut2kit.manufacturing.example.json`.

## Wall workflow

1. Launch the app.
2. Open a project directory that contains `cut2kit.settings.json` and one or more dimensioned elevation PDFs.
3. Review the project workspace for validation, detected elevation PDFs, and planned outputs.
4. Select an elevation PDF and run `Generate Wall Package`.
5. Cut2Kit will write staged artifacts under `output/reports/`:
   - `wall-layouts/*.extracted-elevation.json`
   - `wall-layouts/*.validation-report.json`
   - `framing-layouts/*.framing-layout.json`
   - `framing-layouts/*.framing-layout.pdf`
   - `sheathing-layouts/*.sheathing-layout.json`
   - `sheathing-layouts/*.sheathing-layout.pdf`
6. If the elevation is ambiguous or conflicting, Cut2Kit stops, writes the extracted geometry and
   validation report, and requires user confirmation before continuing.

Prompt content is loaded from `.docs/system-geometry.md`, `.docs/user-geometry.md`,
`.docs/system-framing.md`, `.docs/user-framing.md`, `.docs/system-sheathing.md`,
`.docs/user-sheathing.md`, and `.docs/validation-checklist.md`. Variable framing and sheathing
rules come from `cut2kit.settings.json`.

## Manufacturing workflow

The deterministic manufacturing slice still exists for A2MC manifest and NC generation:

- `output/manifests/panel-manifest.json`
- `output/manifests/nest-manifest.json`
- `output/manifests/queue-manifest.json`
- `output/nc/*.nc`

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
- Wall conversion is AI-first at runtime; deterministic code is used for validation, rendering,
  packaging, and manufacturing post-processing.
- The first real post path is AXYZ A2MC and is driven by explicit manufacturing intent in
  `cut2kit.manufacturing.json`.
- The wall workflow trusts explicit dimensions first and blocks on unresolved ambiguity rather than
  guessing.
