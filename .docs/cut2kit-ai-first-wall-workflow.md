# Cut2Kit AI-First Wall Workflow

This note supersedes any older interpretation that the wall conversion layer should become a fully deterministic geometry engine.

## Product Direction

Cut2Kit must remain an AI-first CAM application for wall-elevation conversion.

For a wall elevation PDF, the runtime flow is:

1. intake and visualize the elevation PDF
2. use GPT-5.4 through the existing Codex/T3Code harness to extract structured wall geometry
3. use GPT-5.4 again to generate the framing layout
4. use GPT-5.4 again to generate the OSB sheathing / cutout / fastening layout
5. deterministically validate the structured outputs
6. deterministically render and package the PDFs and JSON artifacts

The correct relationship is:

- AI-first runtime generation
- typed contracts
- settings-driven reusable rules
- deterministic validation
- deterministic rendering and packaging

The wrong relationship is:

- deterministic geometry conversion engine first
- AI only used as an assistant or code author

## Canonical References

Use these as the workflow references:

- `.docs/reusable_prompt_summary_framing_osb.pdf`
- `examples/elevation3.pdf`
- `examples/elevation3_framing_layout.pdf`
- `examples/elevation3_osb_sheet_layout_with_fastening.pdf`
- `docs/cut2kit.settings.example.json`

## Implementation Rules

- Do not bypass GPT/Codex for framing or sheathing generation.
- Do not hardcode elevation interpretation that should remain model-driven.
- Do not replace prompt/orchestration with a deterministic conversion pipeline.
- Keep validation deterministic and explicit.
- Keep rendering deterministic and testable.
- Keep settings focused on defaults, constraints, reusable rules, rendering preferences, and agent-flow configuration.

## Expected Runtime Outputs

For one elevation PDF, Cut2Kit should write:

- extracted elevation JSON
- validation report JSON
- framing layout JSON
- framing layout PDF
- sheathing layout JSON
- sheathing layout PDF
- optional fastening notes/pages when enabled by settings

The framing and sheathing PDFs should follow the style and structure of the example outputs, including:

- framing page plus member/stud schedule
- overall OSB layout page
- sheet-by-sheet cutout pages
- fastening and panel-edge notes page

The runtime prompt content should be loaded from:

- `.docs/system-geometry.md`
- `.docs/user-geometry.md`
- `.docs/system-framing.md`
- `.docs/user-framing.md`
- `.docs/system-sheathing.md`
- `.docs/user-sheathing.md`
- `.docs/validation-checklist.md`

## Current Harness

The wall workflow should run through the existing Codex/OpenAI runtime already present in the app, using GPT-5.4 as the primary reasoning engine for:

- geometry extraction
- framing generation
- sheathing generation

Deterministic code exists to validate, render, and package those outputs after the model responds.
