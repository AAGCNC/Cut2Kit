# Cut2Kit Workflows

This document is the canonical developer/operator description of what Cut2Kit implements today.

## Implemented Now

### AI-first wall layout

The current wall workflow is a single-wall, selected-elevation flow:

1. Inspect the project directory and validate `cut2kit.settings.json`.
2. Select one elevation PDF as the wall source.
3. Load the prompt templates from `.docs/`.
4. Extract wall geometry with GPT-5.4 using:
   - PDF text extraction
   - a rendered preview image of the selected elevation
5. Normalize and write:
   - `output/reports/wall-layouts/*.extracted-elevation.json`
   - `output/reports/wall-layouts/*.validation-report.json`
6. If the geometry is ambiguous and settings require confirmation, stop there and require user confirmation.
7. Generate framing JSON with GPT-5.4.
8. Generate sheathing JSON with GPT-5.4.
9. Deterministically validate framing and sheathing.
10. Render PDFs only after validation passes.

The current artifact set is:

- `output/reports/wall-layouts/*.extracted-elevation.json`
- `output/reports/wall-layouts/*.validation-report.json`
- `output/reports/framing-layouts/*.framing-layout.json`
- `output/reports/framing-layouts/*.framing-layout.pdf`
- `output/reports/sheathing-layouts/*.sheathing-layout.json`
- `output/reports/sheathing-layouts/*.sheathing-layout.pdf`

Current implementation constraints:

- The wall flow is Codex-only today.
- The required model is `gpt-5.4`.
- The required reasoning effort is `xhigh`.
- Geometry ambiguity can block the run and require confirmation.
- Framing and sheathing logic are settings-driven, but generation is still AI-first.
- Deterministic code handles validation, rendering, and packaging after model output.

### Prompt and settings sources

The current runtime prompt set is:

- `.docs/system-geometry.md`
- `.docs/user-geometry.md`
- `.docs/system-framing.md`
- `.docs/user-framing.md`
- `.docs/system-sheathing.md`
- `.docs/user-sheathing.md`
- `.docs/validation-checklist.md`

The canonical settings example is [`cut2kit.settings.example.json`](./cut2kit.settings.example.json).

## Deterministic A2MC Output

Cut2Kit also implements a separate deterministic manufacturing path:

1. Validate `cut2kit.manufacturing.json`.
2. Derive manifests under `output/manifests/`.
3. Convert the manufacturing plan into A2MC-safe NC through
   [`apps/server/src/cut2kit/cam/A2mcPost.ts`](../apps/server/src/cut2kit/cam/A2mcPost.ts).
4. Write NC files under `output/nc/`.

The manufacturing plan is intentionally explicit. Supported operation types include:

- `tool_change`
- `spindle_on`
- `spindle_stop`
- `rapid_move`
- `linear_move`
- `arc_move`
- `dwell`
- `label_template`
- `label_image`

Factual A2MC controller behavior is preserved in
[`../.docs/a2mc-nc-processing-spec.md`](../.docs/a2mc-nc-processing-spec.md).

Current A2MC post guardrails include:

- uppercase output
- explicit startup state
- explicit work offset
- `M6 Tn` ordering
- `M3`/`M4` before spindle speed formatting used by the current product
- no `G53`
- no `G92`
- `G4 P<seconds>`
- structured `M272(...)` and `M273(...)` payloads
- standalone `M30`

## Not Implemented

The following are not current wall-workflow features:

- automatic conversion from wall-layout JSON into `cut2kit.manufacturing.json`
- automatic CAM toolpath generation for studs or sheathing from the wall workflow
- automatic nesting or NC generation directly from framing/sheathing outputs
- future CAM/A2MC handoff treated as completed functionality

Those planning notes are preserved separately in
[`cut2kit-future-cam-notes.md`](./cut2kit-future-cam-notes.md).
