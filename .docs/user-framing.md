Create a stud framing solution from the extracted elevation geometry.

Tasks:
1. Read the extracted geometry artifact.
2. Apply framing rules from `cut2kit.settings.json`.
3. Compute all framing members and derived dimensions.
4. Save the framing solution as structured JSON.
5. Validate the framing solution.
6. Generate a dimensioned framing PDF only after the framing solution passes validation or has only non-blocking warnings.

If the source dimensions are incomplete, conflicting, or ambiguous:
- stop
- write an ambiguity report
- ask for user confirmation before proceeding