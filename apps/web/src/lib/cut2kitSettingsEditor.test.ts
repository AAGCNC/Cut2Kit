import { describe, expect, it, vi } from "vitest";

import { createDefaultCut2KitSettings } from "@t3tools/shared/cut2kitSettingsDefaults";

import {
  applyCut2KitSettingsAdvancedJson,
  loadCut2KitSettingsEditorState,
  reloadCut2KitSettingsEditorState,
  replaceCut2KitSettingsEditorDraft,
  revertCut2KitSettingsEditorState,
  saveCut2KitSettingsEditorState,
  serializeCut2KitSettingsDocument,
} from "./cut2kitSettingsEditor";

function encodeBase64(input: string) {
  return Buffer.from(input, "utf8").toString("base64");
}

const project = {
  cwd: "/workspace/demo",
  id: "demo-project",
  name: "Demo Project",
  settingsFilePath: "cut2kit.settings.json",
} as const;

describe("cut2kitSettingsEditor", () => {
  it("loads an existing settings file", async () => {
    const settings = createDefaultCut2KitSettings({
      projectId: "demo-project",
      jobName: "Demo Project",
    });
    const state = await loadCut2KitSettingsEditorState(project, {
      readFile: vi.fn().mockResolvedValue({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(serializeCut2KitSettingsDocument(settings)),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      }),
    });

    expect(state.hasExistingFile).toBe(true);
    expect(state.settingsFilePath).toBe("cut2kit.settings.json");
    expect(state.validation.isValid).toBe(true);
    expect(state.isDirty).toBe(false);
  });

  it("creates a default draft when the settings file is missing", async () => {
    const state = await loadCut2KitSettingsEditorState(
      {
        ...project,
        settingsFilePath: null,
      },
      {
        readFile: vi.fn(),
      },
    );

    expect(state.hasExistingFile).toBe(false);
    expect(state.settingsFilePath).toBe("cut2kit.settings.json");
    expect(state.validation.isValid).toBe(true);
    expect(state.isDirty).toBe(false);
  });

  it("edits and saves the draft, then refreshes the project query", async () => {
    const base = await loadCut2KitSettingsEditorState(
      {
        ...project,
        settingsFilePath: null,
      },
      {
        readFile: vi.fn(),
      },
    );
    const edited = replaceCut2KitSettingsEditorDraft(base, {
      ...(base.draft as Record<string, unknown>),
      project: {
        ...(base.draft as { project: Record<string, unknown> }).project,
        jobName: "Updated Job",
      },
    });
    const writeFile = vi.fn().mockResolvedValue({ relativePath: "cut2kit.settings.json" });
    const refreshProject = vi.fn().mockResolvedValue(undefined);

    const saved = await saveCut2KitSettingsEditorState(edited, {
      writeFile,
      refreshProject,
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(refreshProject).toHaveBeenCalledWith("/workspace/demo");
    expect(saved.validation.isValid).toBe(true);
    expect(saved.isDirty).toBe(false);
    expect((saved.draft as { project: { jobName: string } }).project.jobName).toBe("Updated Job");
  });

  it("reverts the draft to the last loaded state", async () => {
    const base = await loadCut2KitSettingsEditorState(
      {
        ...project,
        settingsFilePath: null,
      },
      {
        readFile: vi.fn(),
      },
    );
    const edited = replaceCut2KitSettingsEditorDraft(base, {
      ...(base.draft as Record<string, unknown>),
      project: {
        ...(base.draft as { project: Record<string, unknown> }).project,
        customer: "Changed Customer",
      },
    });

    const reverted = revertCut2KitSettingsEditorState(edited);

    expect(reverted.isDirty).toBe(false);
    expect((reverted.draft as { project: { customer: string } }).project.customer).toBe("TBD");
  });

  it("reloads the settings file from disk", async () => {
    const first = createDefaultCut2KitSettings({
      projectId: "demo-project",
      jobName: "First",
    });
    const second = createDefaultCut2KitSettings({
      projectId: "demo-project",
      jobName: "Reloaded",
    });
    const readFile = vi
      .fn()
      .mockResolvedValueOnce({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(serializeCut2KitSettingsDocument(first)),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      })
      .mockResolvedValueOnce({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(serializeCut2KitSettingsDocument(second)),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      });

    const loaded = await loadCut2KitSettingsEditorState(project, { readFile });
    const reloaded = await reloadCut2KitSettingsEditorState(loaded, { readFile });

    expect((reloaded.draft as { project: { jobName: string } }).project.jobName).toBe("Reloaded");
  });

  it("surfaces validation failures and blocks save", async () => {
    const state = await loadCut2KitSettingsEditorState(
      {
        ...project,
        settingsFilePath: null,
      },
      {
        readFile: vi.fn(),
      },
    );
    const invalid = replaceCut2KitSettingsEditorDraft(state, {
      ...(state.draft as Record<string, unknown>),
      project: {
        ...(state.draft as { project: Record<string, unknown> }).project,
        jobName: "",
      },
    });

    await expect(
      saveCut2KitSettingsEditorState(invalid, {
        writeFile: vi.fn(),
        refreshProject: vi.fn(),
      }),
    ).rejects.toThrow("Cut2Kit settings validation failed");
  });

  it("applies advanced JSON and reports parse errors", async () => {
    const state = await loadCut2KitSettingsEditorState(
      {
        ...project,
        settingsFilePath: null,
      },
      {
        readFile: vi.fn(),
      },
    );

    const invalid = applyCut2KitSettingsAdvancedJson(state, "{");
    expect(invalid.nextState).toBeNull();
    expect(invalid.errorMessage).toBeTruthy();

    const valid = applyCut2KitSettingsAdvancedJson(
      state,
      JSON.stringify({
        ...createDefaultCut2KitSettings({
          projectId: "demo-project",
          jobName: "Advanced",
        }),
        project: {
          ...createDefaultCut2KitSettings().project,
          projectId: "advanced-project",
          jobName: "Advanced",
          customer: "AXYZ",
          site: "shop-floor",
        },
      }),
    );

    expect(valid.errorMessage).toBeNull();
    expect(valid.nextState?.validation.isValid).toBe(true);
    expect(
      ((valid.nextState?.draft as { project: { jobName: string } }) ?? { project: { jobName: "" } })
        .project.jobName,
    ).toBe("Advanced");
  });
});
