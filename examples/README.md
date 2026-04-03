# Examples

This directory keeps only practical fixtures and reference outputs.

## Root reference fixtures

- `elevation3.pdf`
  Reference elevation input used for the wall-layout prompt/output surface.
- `elevation3_framing_layout.pdf`
  Reference framing output style.
- `elevation3_osb_sheet_layout_with_fastening.pdf`
  Reference sheathing and fastening output style.
- `cut2kit.manufacturing.example.json`
  Standalone A2MC manufacturing-plan example.

## Runnable demo project

- `prefab-demo-project/`
  Minimal project that reflects the current implemented wall workflow and includes:
  - `cut2kit.settings.json`
  - `cut2kit.manufacturing.json`
  - one elevation PDF
  - one retained framing PDF under `output/reports/`

## Notes

- Root reference PDFs are examples and style references, not a complete runnable project.
- The demo project is intentionally smaller and aligned to what is actually present.
- Legacy or duplicate artifacts are removed when a cleaner canonical example already exists.
