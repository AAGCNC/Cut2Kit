# Cut2Kit AI-First Wall Workflow

This is the canonical runtime note for the implemented wall-layout flow.

## Implemented Flow

For one selected elevation PDF, the runtime does this in order:

1. inspect the project and validate `cut2kit.settings.json`
2. load prompt content from `.docs/`
3. extract geometry with the configured AI runtime from:
   - PDF text extraction
   - a rendered preview image of the selected elevation
4. write:
   - extracted wall geometry JSON
   - validation report JSON
5. stop and require confirmation if ambiguity remains and settings require it
6. generate framing-layout JSON with the configured AI runtime
7. generate sheathing-layout JSON with the configured AI runtime
8. deterministically validate the combined result
9. deterministically render framing and sheathing PDFs

The current workflow is:

- AI-first runtime generation
- settings-driven framing and sheathing logic
- deterministic ambiguity gating
- deterministic validation
- deterministic rendering and packaging

It is not:

- a deterministic geometry-conversion engine that replaced the model
- a direct CAM/toolpath generator for studs or sheathing

## Runtime Inputs

The runtime prompt content is loaded from:

- `.docs/system-geometry.md`
- `.docs/user-geometry.md`
- `.docs/system-framing.md`
- `.docs/user-framing.md`
- `.docs/system-sheathing.md`
- `.docs/user-sheathing.md`
- `.docs/validation-checklist.md`

Canonical style and reference inputs live at:

- `.docs/reusable_prompt_summary_framing_osb.pdf`
- `examples/elevation3.pdf`
- `examples/elevation3_framing_layout.pdf`
- `examples/elevation3_osb_sheet_layout_with_fastening.pdf`
- `docs/cut2kit.settings.example.json`

## Runtime Outputs

For one elevation PDF, the wall workflow writes:

- `output/reports/wall-layouts/*.extracted-elevation.json`
- `output/reports/wall-layouts/*.validation-report.json`
- `output/reports/framing-layouts/*.framing-layout.json`
- `output/reports/framing-layouts/*.framing-layout.pdf`
- `output/reports/sheathing-layouts/*.sheathing-layout.json`
- `output/reports/sheathing-layouts/*.sheathing-layout.pdf`

Optional fastening content appears only when enabled by settings.

## Guardrails

- Do not bypass the configured Codex/OpenCode runtime for geometry, framing, or sheathing generation.
- Do not guess through ambiguity that affects correctness.
- Do not describe future CAM/A2MC handoff as implemented wall behavior.
- Keep settings focused on reusable rules, constraints, rendering preferences, and prompt wiring.
