# Cut2Kit A2MC Output Flow

Cut2Kit now has a real deterministic path for AXYZ A2MC output:

1. `cut2kit.settings.json` defines project, queueing, and machine-profile context.
2. `cut2kit.manufacturing.json` defines explicit manufacturing intent for each NC job.
3. `apps/server/src/cut2kit/Layers/Cut2KitProjects.ts` scans and validates both files.
4. `apps/server/src/cut2kit/cam/A2mcPost.ts` converts manufacturing intent into controller-safe A2MC NC text.
5. `cut2kit.generateOutputs` writes manifests to `output/manifests/` and NC files to `output/nc/`.

## Manufacturing Intent Contract

The current first-pass manufacturing plan is intentionally explicit. Jobs are defined as ordered operations such as:

- `tool_change`
- `spindle_on`
- `spindle_stop`
- `rapid_move`
- `linear_move`
- `arc_move`
- `dwell`
- `label_template`
- `label_image`

This keeps the controller-facing output deterministic while leaving room for future CAM tooling to author richer plans upstream.

## A2MC Guardrails

The post layer follows `.docs/a2mc-nc-processing-spec.md` as the controller contract. Current safeguards include:

- uppercase output only
- explicit `G90`
- explicit unit mode
- explicit work offset
- `M6 Tn` ordering only
- `M3 S...` / `M4 S...` spindle ordering
- no `G53`
- no `G92`
- `G4 P<seconds>` dwell formatting
- exact structured `M272(...)` / `M273(...)` payload serialization
- safe shutdown with standalone `M30`
- rejection of arcs over 180 degrees

## Agent Integration

The in-app Cut to Kit Agent is wired to this flow through the existing Codex approval path:

- the workspace prompt tells the agent to propose edits to `cut2kit.manufacturing.json`
- file edits still require approval through the existing review flow
- once approved, `Generate A2MC Outputs` uses the deterministic server path to write NC files
