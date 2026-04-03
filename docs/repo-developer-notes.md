# Repo Developer Notes

## Repo Shape

- `apps/server`
  Effect-based backend, WebSocket RPC, Codex app-server orchestration, Cut2Kit services.
- `apps/web`
  React/Vite UI, including the project workspace and Cut2Kit PDF tooling.
- `apps/desktop`
  Electron shell for the shared server/web app.
- `packages/contracts`
  Shared schemas and RPC types.
- `packages/shared`
  Shared runtime helpers and Cut2Kit prompt/artifact path helpers.

## Cut2Kit Implementation Locations

- [`apps/server/src/cut2kit/Layers/Cut2KitProjects.ts`](../apps/server/src/cut2kit/Layers/Cut2KitProjects.ts)
  Project scan, validation, wall generation orchestration, and deterministic output generation.
- [`apps/server/src/cut2kit/ai/promptTemplates.ts`](../apps/server/src/cut2kit/ai/promptTemplates.ts)
  Prompt template loading.
- [`apps/server/src/cut2kit/cam/A2mcPost.ts`](../apps/server/src/cut2kit/cam/A2mcPost.ts)
  Deterministic A2MC post processor.
- [`packages/contracts/src/cut2kit.ts`](../packages/contracts/src/cut2kit.ts)
  Settings, geometry, framing, sheathing, and manufacturing schemas.
- [`packages/shared/src/cut2kit.ts`](../packages/shared/src/cut2kit.ts)
  Prompt construction and artifact path helpers.

## Commands

- `bun run dev`
- `bun run dev:desktop`
- `bun fmt`
- `bun lint`
- `bun typecheck`
- `bun run test`

## Runtime Notes

- The current wall workflow is AI-first and Codex-driven.
- The prompt surface lives under `.docs/`.
- The deterministic A2MC output path is separate from the wall-layout flow.
- Release/signing guidance lives in [`release.md`](./release.md).
