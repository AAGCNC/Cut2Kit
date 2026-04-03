Validation checklist for Cut2Kit wall generation:

## Geometry extraction

- Overall wall width is present and explicit
- Overall wall height is present and explicit
- Opening geometry is explicit or fully resolved from explicit dimensions
- Units are consistent
- No unresolved dimension conflicts remain

## Ambiguity gate

- If required dimensions are missing, the run stops after writing geometry JSON and a validation report
- User confirmation is required before continuing when ambiguity handling says so
- Framing and sheathing are not treated as complete when geometry still needs confirmation

## Framing validation

- Framing members stay within wall bounds
- Opening geometry is preserved
- Opening-side framing rules match settings
- Stud spacing rules match settings
- Plate orientation matches settings
- Any configurable jamb offsets are applied correctly
- Cripple logic matches settings
- Dimension annotations correspond to solved geometry

## Sheathing validation

- Sheet count matches solved coverage
- All panel extents stay within wall bounds
- Opening cutouts align with opening geometry
- Ripped pieces are reported correctly
- Optional fastening content only appears if enabled
- PDF page fit is checked
- Output JSON and PDF agree on the solved layout

## Packaging

- Framing and sheathing PDFs are rendered only after validation passes
- The validation report reflects the geometry, framing, and sheathing stages consistently

## Blocking errors

- Missing overall dimensions
- Conflicting explicit dimensions
- Unresolved opening geometry
- Invalid settings required for solving
- Any guessed geometry used without confirmation

## Warning examples

- Minor layout aesthetic issue
- Non-blocking rendering fallback
- Example/reference mismatch that does not affect geometric correctness
