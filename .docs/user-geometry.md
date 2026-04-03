Extract the wall geometry from the selected elevation PDF.

Tasks:
1. Read the elevation image and supporting OCR/dimension text.
2. Resolve the overall wall bounds from explicit dimensions.
3. Resolve rectangular openings and their explicit widths, heights, and positions.
4. Save the extracted geometry as structured JSON.
5. Flag ambiguity instead of guessing when dimensions are incomplete or conflicting.

Output requirements:
- preserve the full wall width and height
- preserve explicit opening widths and heights
- keep notes and validation fields explainable
- emit JSON only, with no markdown fences
