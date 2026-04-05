import { describe, expect, it } from "vitest";

import {
  buildOpenCodeModels,
  summarizeOpenCodeAvailability,
  type OpenCodeProviderList,
} from "./OpenCodeProvider";

function makeProviderList(
  overrides: Partial<OpenCodeProviderList> = {},
): OpenCodeProviderList {
  return {
    all: [
      {
        id: "local",
        name: "Local",
        models: {
          "qwen3-32b": {
            id: "qwen3-32b",
            name: "Qwen3 32B",
          },
        },
      },
    ],
    connected: [],
    default: {
      local: "qwen3-32b",
    },
    ...overrides,
  };
}

describe("buildOpenCodeModels", () => {
  it("keeps models exposed by OpenCode even when no hosted providers are authenticated", () => {
    const models = buildOpenCodeModels(makeProviderList());

    expect(models).toEqual([
      expect.objectContaining({
        slug: "local/qwen3-32b",
        name: "Local · Qwen3 32B",
      }),
    ]);
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
