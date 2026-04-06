import { describe, expect, it } from "vitest";

import { buildOpenCodeAuthHeaders, parseOpenCodeServerUrl } from "./opencodeServer";

describe("parseOpenCodeServerUrl", () => {
  it("normalizes valid http and https endpoints", () => {
    expect(parseOpenCodeServerUrl(" http://127.0.0.1:4096/ ")).toEqual({
      baseUrl: "http://127.0.0.1:4096",
    });
    expect(parseOpenCodeServerUrl("https://opencode.example.com/base/")).toEqual({
      baseUrl: "https://opencode.example.com/base",
    });
  });

  it("rejects invalid or unsupported URLs", () => {
    expect(parseOpenCodeServerUrl("")).toBeNull();
    expect(parseOpenCodeServerUrl("ftp://opencode.example.com")).toEqual({
      error: "OpenCode server URL must use http:// or https://.",
    });
    expect(parseOpenCodeServerUrl("not-a-url")).toEqual({
      error: "Invalid OpenCode server URL 'not-a-url'.",
    });
  });
});

describe("buildOpenCodeAuthHeaders", () => {
  it("returns bearer authorization headers when a token is provided", () => {
    expect(buildOpenCodeAuthHeaders("secret-token")).toEqual({
      authorization: "Bearer secret-token",
    });
    expect(buildOpenCodeAuthHeaders("Bearer already-prefixed")).toEqual({
      authorization: "Bearer already-prefixed",
    });
  });

  it("returns undefined for empty values", () => {
    expect(buildOpenCodeAuthHeaders("")).toBeUndefined();
    expect(buildOpenCodeAuthHeaders("   ")).toBeUndefined();
    expect(buildOpenCodeAuthHeaders(undefined)).toBeUndefined();
  });
});
