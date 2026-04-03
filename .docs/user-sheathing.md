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
5. Validate the sheathing solution.
6. Generate a dimensioned sheathing PDF only after validation passes or has only non-blocking warnings.

If geometry is incomplete, conflicting, or ambiguous:
- stop
- write an ambiguity report
- ask for user confirmation before proceeding