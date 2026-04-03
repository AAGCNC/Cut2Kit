Create a stud framing solution from the extracted elevation geometry.

Tasks:

1. Read the extracted geometry artifact.
2. Apply framing rules from `cut2kit.settings.json`.
3. Compute all framing members and derived dimensions.
4. Save the framing solution as structured JSON.
5. Include validation results and notes in the JSON.
6. Do not generate the PDF. The runtime renders it after validation.

If the source dimensions are incomplete, conflicting, or ambiguous:

- stop
- write an ambiguity report
- ask for user confirmation before proceeding

Output JSON only, with no markdown fences.
