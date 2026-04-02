# Cut2Kit DXF Rendering Rules

## Purpose

This document defines the first DXF visualization slice for Cut2Kit.

The immediate goal is **not** full panelization, framing, or CAM simulation. The immediate goal is to make the application render a selected elevation DXF from the active project **clearly, reliably, and at the correct visual priority in the UI** so later overlays can add studs, joists, and panel boundaries.

This document is intentionally scoped to the **base DXF rendering phase**.

---

## Product outcome

Cut2Kit needs a large, central visualization area that makes the house elevation the dominant visual object in the app.

For the first milestone:

- the user can choose which DXF from the active project is the **base DXF**
- the selected DXF renders in the **top two-thirds of the center workspace**
- the chat area is reduced to the **bottom one-third**
- rendering is viewport-based and interactive
- the DXF renderer is architected so future overlays can add:
  - stud layout
  - joist layout
  - panel boundaries
  - cut annotations
  - kit labels

---

## Recommended technical approach

### Recommendation

Use a **browser-side DXF viewport in the web app layer**, not a native Electron-side renderer.

### Why this fits T3 Code's architecture

T3 Code is currently structured as:

- an Electron desktop shell
- that hosts a web UI
- built with React, Vite, Tailwind, and client-side state libraries

That means Cut2Kit should follow the same design pattern:

- Electron main process stays thin
- rendering lives in the web app
- DXF viewport is a React feature module
- state for selected project / selected DXF / viewport lives in the client app state
- DXF parsing and preparation should be kept off the hot UI path

### Preferred rendering stack

**Primary recommendation:**
- `dxf-viewer` for DXF viewing
- `three.js` under the hood
- orthographic camera for 2D CAD behavior
- worker-backed parsing/preparation if possible

### Why this is the preferred stack

`dxf-viewer` is the best fit for this phase because it is specifically a **2D DXF viewer**, uses **WebGL via three.js**, is designed with **performance in mind for large real-world drawings**, supports **layer-aware rendering**, and separates heavy parsing/preparation so it can be **off-loaded to a web worker**. That makes it a better fit for Cut2Kit than building a renderer from scratch for the first milestone.

### Do not choose for the first milestone

Do **not** start with:
- a custom SVG renderer
- a custom canvas renderer
- a main-process Electron renderer
- a full CAD editing stack
- a premature stud/panel overlay implementation

Those are slower paths to the first usable visualization milestone.

---

## First milestone scope

### In scope

1. Add a large DXF viewport to the app.
2. Let the user choose one DXF from the active project as the base DXF.
3. Render that DXF in the center workspace.
4. Support:
   - fit to view
   - pan
   - zoom
   - reset view
5. Provide loading, empty, and error states.
6. Structure the code so overlays can be added later.

### Out of scope for now

1. Stud generation
2. Joist generation
3. Panel generation
4. Panel nesting display
5. Label placement display
6. Editing DXF geometry
7. CAM simulation
8. NC visualization
9. Full layer management UI
10. Full CAD measurement tools

Those must come later.

---

## UI layout rules

## 1. Overall app layout

The center workspace must be vertically split into:

- **top ~66%**: DXF visualization
- **bottom ~34%**: chat / agent area

The viewer must visually dominate the experience.

The chat remains visible, but it should no longer consume the majority of the center area.

## 2. Viewer placement

The DXF visualization must be a major center-stage pane:
- above chat
- inside the main working area
- not hidden in a tab
- not collapsed behind a side drawer by default

## 3. Project DXF selector

Within the render section, include a selector for the **base DXF** from the active project.

This selector should:
- show only project DXFs
- make the current base DXF obvious
- allow switching base DXFs without changing the active project

Recommended placement:
- top bar of the visualization pane
- left or center aligned
- adjacent to fit/reset controls

## 4. Chat sizing rule

The chat panel should be intentionally smaller than the viewer.

The viewer is the primary surface for understanding the building elevation.
The chat is supporting workflow, not the dominant surface.

## 5. Pane behavior

Use a split-pane or resizable layout only if it preserves the viewer-first experience.

Default state should still be approximately:
- viewer: 2/3
- chat: 1/3

---

## Rendering rules

## 6. Render in the web layer

Implement the DXF renderer in the **web app** portion of Cut2Kit.

Do not render DXF in the Electron main process.

## 7. Use a dedicated viewport component

Create a dedicated component/module such as:

- `DxfViewport`
- `ProjectDxfViewport`
- `ElevationViewport`

Do not scatter DXF rendering across chat components or general layout files.

## 8. Separate rendering from file discovery

These responsibilities should be separate:

- project file discovery
- selection of active/base DXF
- loading/parsing the DXF
- rendering the viewport
- viewport interaction state

## 9. Orthographic camera only

Use an **orthographic camera**, not a perspective camera.

This is essential for architectural/elevation visualization because:
- it preserves scale visually
- it behaves like a 2D CAD viewport
- it avoids perspective distortion
- it makes overlays easier later

## 10. Fit-to-view behavior

When a DXF is first loaded:
- compute extents / bounds
- center the geometry
- fit it into the viewport with padding
- preserve aspect ratio

Never crop by default.

## 11. Stable world coordinates

The renderer must keep stable drawing-space coordinates.

Do not mutate the underlying geometry just to fit the viewport.
Use camera transforms / scene transforms for view fitting.

This matters for future overlays of:
- studs
- panels
- dimensions
- labels

## 12. Preserve 2D orientation consistently

Choose one orientation and keep it consistent.

Recommended rule for the first milestone:
- preserve DXF logical 2D orientation
- do not arbitrarily flip vertically after load unless the chosen DXF library requires normalization
- if a flip is required, centralize it in one transform layer and document it

Future overlays must use the same coordinate basis.

## 13. Base DXF is read-only

The initial DXF viewport is for visualization only.

Do not allow:
- direct shape editing
- dragging entities
- moving lines
- snapping tools
- geometry authoring

## 14. Visual clarity first

The DXF should render with a clear, low-noise style.

Recommended initial style:
- dark neutral background
- high-contrast linework
- no heavy grid by default
- optional subtle bounds or origin helpers
- avoid excessive CAD chrome until needed

The purpose is to let the user clearly read the building elevation.

## 15. Layer visibility handling

For the first milestone:
- render all supported visible entities
- preserve layer organization internally
- layer toggles are optional
- do not block the milestone on full layer UI

But the renderer must keep enough metadata that layer toggles can be added later.

## 16. Text and unsupported entities

If the DXF contains unsupported entities:
- do not crash
- render what is supported
- surface a non-blocking warning if useful
- log unsupported entity types for debugging

Graceful degradation is required.

## 17. Loading rules

DXF loading should be asynchronous.

The UI must show:
- loading state
- success state
- empty state
- failure state

Do not freeze the interface while parsing large DXFs.

## 18. Worker rule

If the chosen DXF library supports worker/off-main-thread preprocessing, use it.

If full worker wiring is too large for the first pass, at minimum structure the loader so worker offloading can be added cleanly in the next pass.

## 19. Interaction rules

For first milestone support:
- mouse wheel zoom
- click-drag pan
- fit-to-view
- reset view

Optional:
- double-click fit
- keyboard shortcuts

Not required yet:
- measurement tools
- selection
- snapping
- annotation

## 20. Resize rules

The viewport must respond correctly when:
- the window resizes
- panes resize
- chat height changes
- sidebars collapse/expand

No stretched geometry.
No stale camera dimensions.
No clipped canvas after layout changes.

---

## Recommended architecture

## 21. Suggested module split

Recommended shape:

- `features/project-viewer/`
  - `components/DxfViewport.tsx`
  - `components/DxfViewportToolbar.tsx`
  - `components/BaseDxfSelector.tsx`
  - `hooks/useDxfDocument.ts`
  - `hooks/useDxfViewport.ts`
  - `lib/dxfLoader.ts`
  - `lib/dxfSceneAdapter.ts`
  - `state/dxfViewportStore.ts`
  - `types/dxf.ts`

Exact names can vary, but the responsibilities should remain separated.

## 22. Data model rules

Track at least:

- active project id
- selected base DXF file path
- DXF load status
- DXF bounds/extents
- viewport transform or camera state
- supported/unsupported entity summary

Future overlays should be additive on top of this model, not tangled into it.

## 23. Overlay-ready scene model

Even though only the base DXF is rendered now, structure the scene like this:

- base DXF layer
- future framing overlay layer
- future panel overlay layer
- future annotation/selection layer

This is critical.
Do not bake everything into one flat drawing pass.

## 24. Rendering engine boundary

Create a single adapter boundary between Cut2Kit data and the DXF viewer implementation.

Example responsibility:
- Cut2Kit app knows about project files and selected DXF
- viewport adapter knows how to load and display a DXF document
- future overlay adapters know how to draw studs/panels on top

This avoids coupling the whole app to one DXF library API.

---

## File selection rules

## 25. Active project only

The base DXF selector should source files from the **active project** only.

Do not mix:
- global file library
- recent files
- arbitrary filesystem browse

That can come later.

## 26. DXF-first filter

Show only `.dxf` files in the selector for the first milestone.

## 27. Explicit base DXF state

The chosen DXF must be represented as an explicit state value, not just a transient local component choice.

This matters because later:
- studs will use it
- panels will use it
- the agent may reference it
- exports may reference it

---

## Performance rules

## 28. Large-file behavior

The app must prefer responsiveness over feature richness.

That means:
- async load
- no blocking parse on every render
- cache parsed/render-prepared result by file path + modified time if practical
- avoid unnecessary React re-renders of the viewer surface

## 29. Minimize React churn

The 3D/WebGL/canvas surface should not be recreated on every state change.

The viewport should:
- initialize once per file/session boundary
- update camera/scene incrementally
- keep expensive viewer instances stable where possible

## 30. Do not over-render overlays yet

Do not simulate studs/panels now.
Keep the viewport fast and clean so the base DXF rendering becomes trustworthy first.

---

## Error handling rules

## 31. Empty state

If no DXF is selected:
- show a clear placeholder
- explain that the user should choose a base DXF from the active project

## 32. Invalid DXF state

If parsing/rendering fails:
- show a clear error panel in the viewer area
- keep the rest of the app alive
- include filename and a concise reason if available

## 33. Unsupported content

If the file partially renders:
- show the rendered content
- optionally show a small non-blocking warning
- do not fail hard unless the document is unusable

---

## Styling rules

## 34. Follow T3-like design principles

The implementation should feel native to the existing T3-style app architecture:
- React feature component
- minimal desktop shell changes
- clear pane hierarchy
- restrained visual design
- practical developer ergonomics
- predictable state boundaries

## 35. Viewer toolbar

The viewer toolbar should be minimal and functional.

Recommended controls:
- base DXF selector
- fit
- reset
- zoom in
- zoom out

Not required yet:
- extensive CAD menus
- layer manager drawer
- measurement toolbar
- print/export controls

---

## Deferred overlay plan

Once base DXF rendering is correct, the next phase can add:

1. stud layout overlay
2. joist layout overlay
3. panel segmentation overlay
4. panel labels
5. cut order / operation overlays

That future work should reuse:
- the same world coordinate system
- the same viewport
- separate overlay layers
- the same project/base DXF selection state

---

## Recommendation summary

### Do this now
- add a large top-of-center DXF viewport
- let the user choose the base DXF from the active project
- render the selected DXF using a web-layer viewer
- use an orthographic 2D viewport
- keep chat below in a smaller pane
- make the rendering code overlay-ready

### Do not do yet
- stud generation
- panel generation
- advanced CAD tooling
- manual editing
- CAM simulation

---

## Sources consulted

- T3 Code README
- T3 Code `apps/web/package.json`
- T3 Code `apps/desktop/package.json`
- T3 Code `apps/desktop/src/main.ts`
- `dxf-viewer` README
- Three.js OrthographicCamera docs
- Three.js camera manual
- `@dxfjs/parser` README
- React Konva docs (considered as an alternative, not the primary recommendation)
