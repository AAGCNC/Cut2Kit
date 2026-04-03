Create an OSB sheathing solution from the validated wall geometry and framing solution.

Tasks:

1. Read the extracted elevation geometry and framing-layout JSON.
2. Apply sheathing rules from `cut2kit.settings.json`.
3. Compute:
   - total sheet count
   - full sheets
   - ripped sheets
   - cutouts for openings
   - optional fastening notes/pages if enabled
4. Save the sheathing solution as structured JSON.
5. Include validation results and notes in the JSON.
6. Do not generate the PDF. The runtime renders it after validation.

If geometry is incomplete, conflicting, or ambiguous:

- stop
- write an ambiguity report
- ask for user confirmation before proceeding

Output JSON only, with no markdown fences.
