import { describe, expect, it } from "vitest";

import {
  buildOpenCodeModels,
  summarizeOpenCodeAvailability,
  type OpenCodeProviderList,
} from "./OpenCodeProvider";

function makeProviderList(overrides: Partial<OpenCodeProviderList> = {}): OpenCodeProviderList {
  return {
    all: [
      {
        id: "vllm",
        name: "vLLM",
        models: {
          "qwen3-coder-next": {
            id: "qwen3-coder-next",
            name: "Qwen3 Coder Next",
          },
        },
      },
      {
        id: "openai-codex",
        name: "OpenAI",
        models: {
          "gpt-5.4": {
            id: "gpt-5.4",
            name: "GPT-5.4",
          },
        },
      },
    ],
    connected: [],
    default: {
      vllm: "qwen3-coder-next",
      "openai-codex": "gpt-5.4",
    },
    ...overrides,
  };
}

describe("buildOpenCodeModels", () => {
  it("keeps models exposed by OpenCode even when no hosted providers are authenticated", () => {
    const models = buildOpenCodeModels(makeProviderList(), "all");

    expect(models).toHaveLength(2);
    expect(models.map((m) => ({ slug: m.slug, name: m.name }))).toEqual(
      expect.arrayContaining([
        { slug: "vllm/qwen3-coder-next", name: "vLLM · Qwen3 Coder Next" },
        { slug: "openai-codex/gpt-5.4", name: "OpenAI · GPT-5.4" },
      ]),
    );
  });

  it("filters to vllm provider only when providerFilter is 'vllm'", () => {
    const providerList = makeProviderList();
    const models = buildOpenCodeModels(providerList, "vllm");

    expect(models).toHaveLength(1);
    expect(models[0]).toEqual({
      slug: "vllm/qwen3-coder-next",
      name: "vLLM · Qwen3 Coder Next",
      isCustom: false,
      capabilities: {
        contextWindowOptions: [],
        promptInjectedEffortLevels: [],
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
      },
    });
  });

  it("filters to local provider only when providerFilter is 'local'", () => {
    const providerList = makeProviderList();
    const models = buildOpenCodeModels(providerList, "local");

    expect(models).toHaveLength(0);
  });

  it("includes all providers when providerFilter is 'all'", () => {
    const providerList = makeProviderList();
    const models = buildOpenCodeModels(providerList, "all");

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.slug)).toEqual(
      expect.arrayContaining(["vllm/qwen3-coder-next", "openai-codex/gpt-5.4"]),
    );
  });

  it("filters to multiple providers using include array", () => {
    const providerList = {
      all: [
        {
          id: "vllm",
          name: "vLLM",
          models: {
            "qwen3-coder-next": {
              id: "qwen3-coder-next",
              name: "Qwen3 Coder Next",
            },
          },
        },
        {
          id: "openai-codex",
          name: "OpenAI",
          models: {
            "gpt-5.4": {
              id: "gpt-5.4",
              name: "GPT-5.4",
            },
          },
        },
        {
          id: "claude",
          name: "Claude",
          models: {
            "claude-sonnet-4-6": {
              id: "claude-sonnet-4-6",
              name: "Claude Sonnet 4.6",
            },
          },
        },
      ],
      connected: [],
      default: {},
    };
    const models = buildOpenCodeModels(providerList, {
      include: ["vllm", "claude"],
      exclude: [],
    });

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.slug)).toEqual(
      expect.arrayContaining(["vllm/qwen3-coder-next", "claude/claude-sonnet-4-6"]),
    );
  });
});

describe("summarizeOpenCodeAvailability", () => {
  it("treats discovered local models as ready without hosted auth metadata", () => {
    const status = summarizeOpenCodeAvailability({
      mode: "remote",
      baseUrl: "http://127.0.0.1:4096",
      connectedProviders: [],
      discoveredModelCount: 1,
      customModelCount: 0,
    });

    expect(status.status).toBe("ready");
    expect(status.auth).toEqual({ status: "unknown" });
    expect(status.message).toContain("http://127.0.0.1:4096");
    expect(status.message).toContain("local or self-hosted routing");
  });

  it("treats manual provider/model slugs as a usable OpenCode route", () => {
    const status = summarizeOpenCodeAvailability({
      mode: "managed",
      connectedProviders: [],
      discoveredModelCount: 0,
      customModelCount: 2,
    });

    expect(status.status).toBe("ready");
    expect(status.auth).toEqual({ status: "unknown" });
    expect(status.message).toContain("manual provider/model slugs");
  });

  it("returns an error only when OpenCode is reachable but no usable model route exists", () => {
    const status = summarizeOpenCodeAvailability({
      mode: "managed",
      connectedProviders: [],
      discoveredModelCount: 0,
      customModelCount: 0,
    });

    expect(status.status).toBe("error");
    expect(status.auth).toEqual({ status: "unknown" });
    expect(status.message).toContain("no usable models were discovered");
  });
});
