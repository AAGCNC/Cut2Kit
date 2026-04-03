# Runtime Prompt Surface

`.docs/` is reserved for prompt and runtime-support material used by the current Cut2Kit workflows.

## Loaded at runtime

- `system-geometry.md`
- `user-geometry.md`
- `system-framing.md`
- `user-framing.md`
- `system-sheathing.md`
- `user-sheathing.md`
- `validation-checklist.md`

These files are loaded through `cut2kit.settings.json` or the default paths in
[`packages/shared/src/cut2kit.ts`](../packages/shared/src/cut2kit.ts).

## Runtime guidance

- `cut2kit-ai-first-wall-workflow.md`
  Canonical runtime description for the implemented wall-layout flow.
- `a2mc-nc-processing-spec.md`
  Factual A2MC controller behavior reference used by the deterministic manufacturing path.
- `reusable_prompt_summary_framing_osb.pdf`
  Visual reference for framing and sheathing prompt/output style.

## Scope

- Keep this directory focused on prompts, controller facts, and runtime workflow references.
- Developer/operator documentation belongs under `docs/`.
- Practical fixtures and sample outputs belong under `examples/`.
