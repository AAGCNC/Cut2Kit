Create an A2MC-ready manufacturing plan from the selected sheathing layout.

Tasks:

1. Read the sheathing-layout JSON and machining settings from `cut2kit.settings.json`.
2. Generate toolpath operations in `cut2kit.manufacturing.json` using the supported Cut2Kit manufacturing schema.
3. Use the configured tool diameter to offset outer perimeters and opening contours so the finished cut geometry matches the sheathing dimensions.
4. Use the configured spindle, plunge, cut feed, work offset, safe Z, park position, and pass count.
5. Preserve unrelated manufacturing jobs that already exist in the plan file.
6. Output JSON only, with no markdown fences.

If the machining settings are incomplete or the sheathing geometry is invalid:

- stop
- explain the blocker in JSON-friendly notes if needed
- do not guess unsafe machining values
