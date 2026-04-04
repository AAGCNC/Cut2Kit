import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { Cut2KitSettings } from "@t3tools/contracts";

import {
  CUT2KIT_SETTINGS_FILE_NAME,
  createDefaultCut2KitSettings,
} from "./cut2kitSettingsDefaults";

describe("createDefaultCut2KitSettings", () => {
  it("builds a schema-valid default settings document", () => {
    const settings = createDefaultCut2KitSettings();
    expect(() => Schema.decodeUnknownSync(Cut2KitSettings)(settings)).not.toThrow();
    expect(settings.discovery.knownSettingsFileNames).toEqual([CUT2KIT_SETTINGS_FILE_NAME]);
  });

  it("returns a fresh copy on each call", () => {
    const first = createDefaultCut2KitSettings();
    const second = createDefaultCut2KitSettings();

    expect(first).not.toBe(second);
    expect(first.project).not.toBe(second.project);
    expect(first.discovery).not.toBe(second.discovery);
    expect(first.discovery.knownSettingsFileNames).not.toBe(
      second.discovery.knownSettingsFileNames,
    );
  });

  it("applies project overrides and normalizes project id", () => {
    const settings = createDefaultCut2KitSettings({
      projectId: "Wall Layout Example",
      jobName: "Wall Layout Example",
      customer: "AXYZ",
      site: "toronto-yard",
      description: "Prefab demo",
    });

    expect(settings.project).toMatchObject({
      projectId: "wall-layout-example",
      jobName: "Wall Layout Example",
      customer: "AXYZ",
      site: "toronto-yard",
      description: "Prefab demo",
    });
  });
});
