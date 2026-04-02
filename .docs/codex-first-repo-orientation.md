# Codex-First Repo Orientation

## Purpose

This note captures the current repo shape as it actually exists in code, not just in the older docs. It is written for the upcoming transition from a coding-agent product toward an AI-first prefabricated-housing prioritization and nesting/CAM application, while keeping Codex as the primary provider runtime.

## What Is Actually Stable Today

- The repo is a Bun/Turbo monorepo with four app surfaces:
  - `apps/server`: Effect-based backend, HTTP + WebSocket RPC, provider orchestration, persistence, git/workspace/terminal services.
  - `apps/web`: React/Vite client, mostly driven by orchestration snapshots + domain-event streams.
  - `apps/desktop`: Electron shell that spawns the backend and hosts the shared web app.
  - `apps/marketing`: Astro marketing site.
- Shared packages are already split reasonably:
  - `packages/contracts`: schemas, RPC types, orchestration/provider/runtime contracts.
  - `packages/shared`: runtime utilities such as workers, logging, shell, git helpers, schema decoding.
- The backend is the real application core. The web app is mostly a projection/rendering layer over server-owned orchestration state.

## Live Runtime Path

The most important end-to-end flow for Codex is:

1. `apps/server/src/server.ts`
   - Composes the runtime with Effect layers.
   - Wires provider, orchestration, persistence, git, workspace, terminal, settings, telemetry.
2. `apps/server/src/ws.ts`
   - Exposes RPC methods.
   - The browser talks to this layer, not directly to provider internals.
3. `apps/server/src/provider/Layers/ProviderService.ts`
   - Cross-provider facade for session start/send/respond/stop/recovery.
   - Persists provider bindings so sessions can be recovered after restart.
4. `apps/server/src/provider/Layers/CodexAdapter.ts`
   - Translates raw Codex app-server events into canonical `ProviderRuntimeEvent`s.
   - This is the main provider-specific normalization seam.
5. `apps/server/src/codexAppServerManager.ts`
   - Owns the actual Codex child process, JSON-RPC plumbing, thread/session lifecycle, approval/user-input callbacks.
6. `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
   - Consumes canonical runtime events and emits orchestration-side state/activity/message updates.
7. `apps/server/src/orchestration/*`
   - Event store, decider, projector, projections, snapshot query, reactors.
8. `apps/web/src/routes/__root.tsx`
   - Bootstraps from snapshot, subscribes to orchestration events, handles replay/snapshot recovery.
9. `apps/web/src/store.ts`
   - Maps the orchestration read model into UI thread/project state.

The important architectural fact is that the web UI already depends much more on orchestration state than on raw Codex runtime details. That is good for the future pivot.

## Reusable Core For The Future CAM Product

The strongest reusable parts are:

- Server-owned orchestration model and projection pipeline.
- Snapshot + replay recovery logic for reconnects and sequence gaps.
- Provider abstraction boundary:
  - `ProviderService`
  - canonical `ProviderRuntimeEvent`
  - adapter-specific translation layer
- Settings/provider registry patterns.
- Workspace/file write/search RPC surface.
- Deterministic worker pattern built around `DrainableWorker`.

These parts are largely product-agnostic. They can support a non-coding domain if the orchestration model grows beyond "thread/message/turn" into domain entities relevant to housing/CAM workflows.

## Coding-Agent Coupling That Will Eventually Need To Move

The current product surface is still heavily coding-specific, especially in the web app:

- Git/worktree/branch flows are first-class concepts.
- Diff/checkpoint UX assumes git-based output inspection.
- PR/thread resolution flows exist.
- Terminal state is deeply integrated into thread UX.
- "Project" currently mostly means local source repo/workspace.

The biggest UI concentration of those assumptions is `apps/web/src/components/ChatView.tsx`, with supporting pressure in:

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/BranchToolbar.tsx`
- `apps/web/src/components/DiffPanel.tsx`

Server-side coding bias also exists in:

- git-backed checkpointing/diff summary generation
- worktree-aware thread creation
- git helper layers under `apps/server/src/git`

## Hotspots Worth Remembering

Current large files:

- `apps/web/src/components/ChatView.tsx`: 4385 lines
- `apps/server/src/provider/Layers/CodexAdapter.ts`: 1642 lines
- `apps/server/src/codexAppServerManager.ts`: 1592 lines
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`: 1269 lines
- `apps/web/src/store.ts`: 1160 lines
- `apps/server/src/provider/Layers/ProviderService.ts`: 602 lines

Interpretation:

- `ChatView.tsx` is the clearest web refactor candidate.
- `CodexAdapter.ts` and `codexAppServerManager.ts` are the main Codex-specific complexity sink.
- `ProviderRuntimeIngestion.ts` is where generic runtime events become user-facing activity/messages/plans. It is central for future domain redesign.

## Existing Drift / Things To Trust Carefully

- `.docs/architecture.md` and `.docs/provider-architecture.md` are directionally useful but stale in places.
  - They reference files like `wsServer.ts` and `serverLayers.ts` that do not exist in the current tree.
- `.plans/03-split-codex-app-server-manager.md` is still relevant, but it references `apps/desktop/src/codexAppServerManager.ts`; the live file is `apps/server/src/codexAppServerManager.ts`.
- `apps/server/src/codexAppServerManager.ts` still contains direct `console.log(...)` calls around `model/list` and `account/read`, which look like active debugging residue rather than finished runtime logging.

Conclusion: use the live code as source of truth before trusting older docs.

## Existing Architecture Decisions That Help The Pivot

- The backend is already more domain-driven than the UI suggests.
- Contracts are explicit and schema-backed.
- Runtime recovery and sequencing are treated seriously.
- Provider internals are mostly pushed behind canonical events before they reach the rest of the system.

This means the repo does not need to be thrown away for the housing/CAM pivot. The better move is to preserve the runtime/orchestration spine and replace the coding-specific domain model/UI shells around it.

## Likely Refactor Direction Before Or During The Pivot

1. Keep Codex as the primary provider, but reduce Codex-specific sprawl.
   - Split `codexAppServerManager.ts` into process lifecycle, JSON-RPC routing, session state, and parsing modules.
   - Split `CodexAdapter.ts` so canonical event mapping is isolated from adapter service plumbing.

2. Pull coding-only UX behind feature boundaries.
   - Git, worktrees, diffs, PR flows, and terminal workflows should not remain mixed into the default thread UI.

3. Decouple checkpointing from git.
   - For CAM workflows, the equivalent of "diff/checkpoint" may be material plan revisions, nesting revisions, machine-job revisions, or cut package revisions.

4. Expand orchestration beyond chat-thread state.
   - The current thread/message/turn model is good infrastructure, but the future product will likely need first-class entities for projects, materials, panels, nests, machine jobs, and execution status.

5. Fix doc drift as refactors land.
   - The hidden `.docs` directory is useful, but it should be treated as maintainable engineering documentation, not archival notes.

## Practical Starting Point For New Work

If the next scope touches core architecture, start by deciding whether it belongs in one of these layers:

- Provider/runtime layer
  - Codex-specific process and event handling
- Orchestration layer
  - durable commands/events/read models
- Domain projection layer
  - transforming generic runtime into product-specific state
- Product shell/UI layer
  - coding-specific or CAM-specific interaction models

For the long-term product shift, the safest reusable seam is the orchestration layer. The riskiest place to keep accumulating product assumptions is `ChatView.tsx`.
