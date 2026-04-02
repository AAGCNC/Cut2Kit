# Cut2Kit DXF Rendering Implementation

## Where The Viewer Lives

The first DXF visualization slice lives entirely in the web app under:

- `apps/web/src/features/cut2kit-dxf/`

That feature area owns:

- active-project DXF option derivation
- base DXF selection state
- DXF file loading through the existing WebSocket/native API layer
- viewport state and presentation mapping
- the `dxf-viewer` renderer adapter
- the toolbar, empty/loading/error UI, and main workspace card

The Electron shell remains thin. DXF rendering is a web-layer feature.

## Active-Project DXF Selection

The base DXF selector is driven only by the active Cut2Kit project snapshot returned from
`cut2kit.inspectProject`.

The selector logic lives in:

- `apps/web/src/features/cut2kit-dxf/lib/projectDxfFiles.ts`
- `apps/web/src/features/cut2kit-dxf/hooks/useProjectDxfSelection.ts`

Selection behavior:

- start from `project.sourceDocuments` so configured/recognized DXFs win
- add fallback DXF file entries from `project.files` when a DXF exists in the project but is not
  yet classified
- keep the current explicit selection when it is still present
- otherwise fall back to the highest-priority active-project DXF

This keeps the base DXF list project-scoped and deterministic.

## Layout Change: Viewer Over Chat

The main Cut2Kit project view now gives the center workspace a strict viewer-over-agent split in:

- `apps/web/src/components/Cut2KitProjectView.tsx`

Behavior:

- the DXF viewer occupies the top `2fr` portion of the center column
- the Cut to Kit Agent panel occupies the bottom `1fr`
- project metrics and validation detail moved into the right rail so the viewer remains dominant

This keeps chat visible while making the drawing viewport the primary working surface.

## Rendering Approach

The first-pass renderer uses:

- `dxf-viewer`
- `three`

The adapter lives in:

- `apps/web/src/features/cut2kit-dxf/lib/dxfViewerAdapter.ts`

Why this approach:

- it fits a web-layer integration cleanly
- it already gives us a stable orthographic 2D CAD-style viewport
- it supports pan and wheel zoom out of the box
- it lets us keep future overlay attachment points inside the same scene

The worker bootstrap lives in:

- `apps/web/src/features/cut2kit-dxf/workers/dxfViewer.worker.ts`

The adapter attempts worker-backed loading first, then falls back to main-thread parsing if worker
startup fails.

## Supported In This Milestone

The current viewer supports:

- choosing a base DXF from the active project
- async DXF file loading via `projects.readFile`
- DXF render in a large center-stage viewport
- fit to extents
- zoom in / zoom out
- reset to home view
- drag pan and wheel zoom through the underlying viewer
- empty state
- loading state
- error state
- per-project base DXF selection persistence while the project stays active

## Deferred For Later

This milestone does not implement:

- stud overlays
- joist overlays
- panel overlays
- annotations or selection tools
- editing
- layer management UI
- measurement tools

## Future Overlay Attachment Points

Overlay-ready scene groups are created inside the DXF adapter:

- `cut2kit-overlay-root`
- `cut2kit-overlay-framing`
- `cut2kit-overlay-panels`
- `cut2kit-overlay-annotations`

Those groups are offset to the DXF origin so future overlay systems can draw in stable drawing
coordinates without mutating the base DXF layer.

Future framing, stud, joist, and panel renderers should attach to those overlay groups rather than
mixing geometry directly into the base DXF scene.
