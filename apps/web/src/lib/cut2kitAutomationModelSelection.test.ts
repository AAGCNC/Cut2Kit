import type { Cut2KitProject, ModelSelection, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { resolveCut2KitAutomationModelSelectionForApp } from "./cut2kitAutomationModelSelection";

const OPENCODE_PROJECT = {
  settings: {
    ai: {
      provider: "opencode",
      model: "vllm/qwen3-coder-next",
    },
  },
} as Pick<Cut2KitProject, "settings">;

const READY_CODEX_PROVIDER: ServerProvider = {
  provider: "codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated", type: "chatgpt", label: "ChatGPT connected" },
  checkedAt: "2026-04-09T00:00:00.000Z",
  models: [
    {
      slug: "gpt-5.4",
      name: "GPT-5.4",
      isCustom: false,
      capabilities: null,
    },
  ],
};

describe("resolveCut2KitAutomationModelSelectionForApp", () => {
  it("falls back to Codex when OpenCode is unhealthy on the current machine", () => {
    const providers: ReadonlyArray<ServerProvider> = [
      READY_CODEX_PROVIDER,
      {
        provider: "opencode",
        enabled: true,
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        checkedAt: "2026-04-09T00:00:00.000Z",
        message: "OpenCode CLI (`opencode`) is not installed or not on PATH.",
        models: [],
      },
    ];

    expect(
      resolveCut2KitAutomationModelSelectionForApp(OPENCODE_PROJECT, null, providers),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      options: {
        reasoningEffort: "xhigh",
      },
    } satisfies ModelSelection);
  });

  it("keeps the configured OpenCode selection when OpenCode is healthy", () => {
    const providers: ReadonlyArray<ServerProvider> = [
      READY_CODEX_PROVIDER,
      {
        provider: "opencode",
        enabled: true,
        installed: true,
        version: "1.0.0",
        status: "ready",
        auth: { status: "unknown" },
        checkedAt: "2026-04-09T00:00:00.000Z",
        models: [
          {
            slug: "vllm/qwen3-coder-next",
            name: "vLLM · Qwen3 Coder Next",
            isCustom: false,
            capabilities: null,
          },
        ],
      },
    ];

    expect(
      resolveCut2KitAutomationModelSelectionForApp(OPENCODE_PROJECT, null, providers),
    ).toEqual({
      provider: "opencode",
      model: "vllm/qwen3-coder-next",
    } satisfies ModelSelection);
  });

  it("reuses a Codex fallback reasoning effort when switching away from OpenCode", () => {
    const providers: ReadonlyArray<ServerProvider> = [
      READY_CODEX_PROVIDER,
      {
        provider: "opencode",
        enabled: true,
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        checkedAt: "2026-04-09T00:00:00.000Z",
        models: [],
      },
    ];

    expect(
      resolveCut2KitAutomationModelSelectionForApp(
        OPENCODE_PROJECT,
        {
          provider: "codex",
          model: "gpt-5.4",
          options: {
            reasoningEffort: "high",
          },
        },
        providers,
      ),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      options: {
        reasoningEffort: "high",
      },
    } satisfies ModelSelection);
  });
});
