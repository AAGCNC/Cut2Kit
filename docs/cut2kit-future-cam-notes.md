# Cut2Kit Future CAM Notes

This document preserves useful planning notes without implying that the features already exist.

## Current Baseline

Implemented today:

- AI-first wall geometry extraction from a selected elevation PDF
- AI-first framing-layout JSON generation
- AI-first sheathing-layout JSON generation
- deterministic validation and PDF rendering
- deterministic A2MC output from explicit `cut2kit.manufacturing.json`

Not implemented today:

- direct CAM generation for studs or sheathing from the wall-layout flow
- automatic translation from wall-layout outputs into manufacturing plans

## Preserved Planning Direction

If Cut2Kit later extends wall planning into CAM, the safest path is:

1. Keep the current wall artifacts as the planning surface:
   - extracted geometry
   - validation report
   - framing layout
   - sheathing layout
2. Preserve the ambiguity gate.
   - If wall geometry is unresolved, downstream CAM planning should not continue silently.
3. Convert approved wall-planning artifacts into explicit manufacturing intent.
   - The intermediate output should be `cut2kit.manufacturing.json` or an equivalent structured plan, not handwritten NC.
4. Continue using the deterministic A2MC post as the final controller-facing stage.

## Likely Future Handoff Shape

Useful future CAM work should probably derive from:

- wall geometry for overall bounds and openings
- framing layout for stud locations, member schedule, and support lines
- sheathing layout for sheet extents, cutouts, and installation order
- settings for framing, sheathing, fastening, rendering, and output rules

That future handoff could support:

- stud-wall cutting plans
- OSB/sheathing cut plans
- explicit queue/manufacturing plan generation for A2MC

## Guardrails For Future Work

- Do not bypass the explicit manufacturing-plan layer just because wall artifacts exist.
- Do not describe future stud/sheathing CAM as implemented until it actually writes validated manufacturing plans and NC.
- Preserve the factual A2MC controller contract in
  [`../.docs/a2mc-nc-processing-spec.md`](../.docs/a2mc-nc-processing-spec.md).
