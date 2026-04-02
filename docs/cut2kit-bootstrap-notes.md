# Cut2Kit Bootstrap Notes

## Repo shape

- The repo is still structurally T3 Code-like.
- Monorepo root uses Bun workspaces plus Turbo.
- `apps/server` is the local Node/Bun server and WebSocket RPC host.
- `apps/web` is the React/Vite client.
- `apps/desktop` is the Electron shell and preload bridge.
- `apps/marketing` is a separate Astro site.
- `packages/contracts` holds shared schemas, RPC contracts, and orchestration types.
- `packages/shared` holds runtime helpers with explicit subpath exports.

## Current command surface

The root repo currently exposes these scripts in `package.json`:

- `bun install`
- `bun run dev`
- `bun run dev:desktop`
- `bun run typecheck`
- `bun run build`
- `bun run build:desktop`

Related package scripts:

- `apps/server`: `dev`, `build`, `typecheck`, `test`
- `apps/web`: `dev`, `build`, `preview`, `typecheck`, `test`
- `apps/desktop`: `dev`, `build`, `start`, `typecheck`, `test`

## Codex integration entrypoints

- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`
- `apps/server/src/provider/Layers/CodexAdapter.ts`
- `apps/server/src/codexAppServerManager.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `apps/web/src/wsRpcClient.ts`
- `apps/web/src/wsNativeApi.ts`

## Existing platform seams worth preserving

- Desktop folder picking already exists through Electron preload IPC.
- Project/workspace roots already exist in the orchestration model.
- WebSocket RPC already exposes project search and workspace file writes.
- The current chat/runtime stack already supports supervised Codex sessions with approval flow.

## Recommended insertion points for Cut2Kit

- Add Cut2Kit schemas and RPC contracts in `packages/contracts`.
- Add deterministic project scan, settings validation, and output generation services under `apps/server/src/cut2kit`.
- Register those services in `apps/server/src/server.ts` and `apps/server/src/ws.ts`.
- Reuse the existing sidebar project model in `apps/web/src/components/Sidebar.tsx` for project explorer affordances.
- Add a project-focused route/view in `apps/web/src/routes` for validation, manifests, and generation status.
- Reuse existing supervised Codex thread plumbing for the Cut to Kit Agent instead of building a parallel agent system.

## Context inputs

- `.docs/IMP-and-SIP-Vertical-Machine.pdf` exists locally.
- `.docs/whiteboard.2026.0401.jpg` was not present at scan time.
