import { describe, expect, it } from "vitest";
import type { ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

import { getAppModelOptions, resolveAppModelSelection } from "./modelSelection";

const OPENCODE_PROVIDER_WITH_DISCOVERED_MODELS: ReadonlyArray<ServerProvider> = [
  {
    provider: "opencode",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: "2026-04-05T00:00:00.000Z",
    message: "Connected to local OpenCode.",
    models: [
      {
        slug: "local/qwen3-32b",
        name: "Local · Qwen3 32B",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "openai/gpt-5-codex",
        name: "OpenAI · GPT-5 Codex",
        isCustom: true,
        capabilities: null,
      },
    ],
  },
];

describe("getAppModelOptions", () => {
  it("filters invalid custom OpenCode slugs from settings and selected model state", () => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providers: {
        ...DEFAULT_UNIFIED_SETTINGS.providers,
        opencode: {
          ...DEFAULT_UNIFIED_SETTINGS.providers.opencode,
          customModels: ["missing-slash", "local/qwen3-32b", "openai/gpt-5-codex"],
        },
      },
    };

    const options = getAppModelOptions(settings, [], "opencode", "still-missing-slash");

    expect(options.map((option) => option.slug)).toEqual(["local/qwen3-32b", "openai/gpt-5-codex"]);
  });
});

describe("resolveAppModelSelection", () => {
  it("prefers a discovered OpenCode model over saved custom fallbacks", () => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providers: {
        ...DEFAULT_UNIFIED_SETTINGS.providers,
        opencode: {
          ...DEFAULT_UNIFIED_SETTINGS.providers.opencode,
          customModels: ["openai/gpt-5-codex"],
        },
      },
    };

    expect(
      resolveAppModelSelection(
        "opencode",
        settings,
        OPENCODE_PROVIDER_WITH_DISCOVERED_MODELS,
        null,
      ),
    ).toBe("local/qwen3-32b");
  });

  it("falls back to a saved valid custom OpenCode slug when discovery is empty", () => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providers: {
        ...DEFAULT_UNIFIED_SETTINGS.providers,
        opencode: {
          ...DEFAULT_UNIFIED_SETTINGS.providers.opencode,
          customModels: ["local/qwen3-32b"],
        },
      },
    };

    expect(resolveAppModelSelection("opencode", settings, [], null)).toBe("local/qwen3-32b");
  });
});
