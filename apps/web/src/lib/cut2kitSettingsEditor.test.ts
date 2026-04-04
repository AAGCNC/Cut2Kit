import { describe, expect, it, vi } from "vitest";

import type { Cut2KitResolvedPromptTemplates } from "@t3tools/contracts";
import { createDefaultCut2KitSettings } from "@t3tools/shared/cut2kitSettingsDefaults";

import {
  applyCut2KitSettingsAdvancedJson,
  loadCut2KitSettingsEditorState,
  replaceCut2KitPromptTemplateDraft,
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
  resolvedPromptTemplates: {
    geometrySystem: {
      configuredPath: ".docs/system-geometry.md",
      resolvedPath: "/repo/system-geometry.md",
      source: "repo_default",
      contents: "# geometrySystem\nDefault geometrySystem\n",
    },
    geometryUser: {
      configuredPath: ".docs/user-geometry.md",
      resolvedPath: "/repo/user-geometry.md",
      source: "repo_default",
      contents: "# geometryUser\nDefault geometryUser\n",
    },
    framingSystem: {
      configuredPath: ".docs/system-framing.md",
      resolvedPath: "/repo/system-framing.md",
      source: "repo_default",
      contents: "# framingSystem\nDefault framingSystem\n",
    },
    framingUser: {
      configuredPath: ".docs/user-framing.md",
      resolvedPath: "/repo/user-framing.md",
      source: "repo_default",
      contents: "# framingUser\nDefault framingUser\n",
    },
    sheathingSystem: {
      configuredPath: ".docs/system-sheathing.md",
      resolvedPath: "/repo/system-sheathing.md",
      source: "repo_default",
      contents: "# sheathingSystem\nDefault sheathingSystem\n",
    },
    sheathingUser: {
      configuredPath: ".docs/user-sheathing.md",
      resolvedPath: "/repo/user-sheathing.md",
      source: "repo_default",
      contents: "# sheathingUser\nDefault sheathingUser\n",
    },
    validationChecklist: {
      configuredPath: ".docs/validation-checklist.md",
      resolvedPath: "/repo/validation-checklist.md",
      source: "repo_default",
      contents: "# validationChecklist\nDefault validationChecklist\n",
    },
  } satisfies Cut2KitResolvedPromptTemplates,
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
    expect(state.promptTemplates.geometrySystem.contents).toContain("Default geometrySystem");
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
    expect(state.promptTemplates.framingSystem.contents).toContain("Default framingSystem");
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

  it("writes a project-local prompt markdown file when prompt contents change", async () => {
    const base = await loadCut2KitSettingsEditorState(project, {
      readFile: vi.fn().mockResolvedValue({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(
          serializeCut2KitSettingsDocument(
            createDefaultCut2KitSettings({
              projectId: "demo-project",
              jobName: "Demo Project",
            }),
          ),
        ),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      }),
    });
    const edited = replaceCut2KitPromptTemplateDraft(
      base,
      "geometrySystem",
      "# geometrySystem\nProject override\n",
    );
    const writeFile = vi.fn().mockResolvedValue({ relativePath: ".docs/system-geometry.md" });

    const saved = await saveCut2KitSettingsEditorState(edited, {
      writeFile,
      refreshProject: vi.fn(),
    });

    expect(writeFile).toHaveBeenNthCalledWith(1, {
      cwd: "/workspace/demo",
      relativePath: ".docs/system-geometry.md",
      contents: "# geometrySystem\nProject override\n",
    });
    expect(writeFile).toHaveBeenNthCalledWith(2, {
      cwd: "/workspace/demo",
      relativePath: "cut2kit.settings.json",
      contents: expect.stringContaining('"schemaVersion": "0.3.0"'),
    });
    expect(saved.promptTemplates.geometrySystem.source).toBe("workspace");
    expect(saved.promptTemplates.geometrySystem.loadedContents).toContain("Project override");
  });

  it("writes a project-local prompt markdown file when the configured prompt path changes", async () => {
    const base = await loadCut2KitSettingsEditorState(project, {
      readFile: vi.fn().mockResolvedValue({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(
          serializeCut2KitSettingsDocument(
            createDefaultCut2KitSettings({
              projectId: "demo-project",
              jobName: "Demo Project",
            }),
          ),
        ),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      }),
    });
    const edited = replaceCut2KitSettingsEditorDraft(base, {
      ...(base.draft as Record<string, unknown>),
      ai: {
        ...(base.draft as { ai: Record<string, unknown> }).ai,
        promptTemplatePaths: {
          ...(
            base.draft as {
              ai: { promptTemplatePaths: Record<string, unknown> };
            }
          ).ai.promptTemplatePaths,
          geometryUser: ".docs/project-geometry-user.md",
        },
      },
    });
    const writeFile = vi.fn().mockResolvedValue({ relativePath: ".docs/project-geometry-user.md" });

    await saveCut2KitSettingsEditorState(edited, {
      writeFile,
      refreshProject: vi.fn(),
    });

    expect(writeFile).toHaveBeenNthCalledWith(1, {
      cwd: "/workspace/demo",
      relativePath: ".docs/project-geometry-user.md",
      contents: expect.stringContaining("Default geometryUser"),
    });
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
    const reloaded = await reloadCut2KitSettingsEditorState(loaded, { readFile, project });

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

  it("blocks saving prompt overrides to absolute paths", async () => {
    const base = await loadCut2KitSettingsEditorState(project, {
      readFile: vi.fn().mockResolvedValue({
        relativePath: project.settingsFilePath,
        contents: encodeBase64(
          serializeCut2KitSettingsDocument(
            createDefaultCut2KitSettings({
              projectId: "demo-project",
              jobName: "Demo Project",
            }),
          ),
        ),
        encoding: "base64",
        sizeBytes: null,
        modifiedAt: null,
      }),
    });
    const pathEdited = replaceCut2KitSettingsEditorDraft(base, {
      ...(base.draft as Record<string, unknown>),
      ai: {
        ...(base.draft as { ai: { promptTemplatePaths: Record<string, unknown> } }).ai,
        promptTemplatePaths: {
          ...(
            base.draft as {
              ai: { promptTemplatePaths: Record<string, unknown> };
            }
          ).ai.promptTemplatePaths,
          framingSystem: "/tmp/framing-system.md",
        },
      },
    });
    const edited = replaceCut2KitPromptTemplateDraft(
      pathEdited,
      "framingSystem",
      "# framingSystem\nAbsolute override\n",
    );

    await expect(
      saveCut2KitSettingsEditorState(edited, {
        writeFile: vi.fn(),
        refreshProject: vi.fn(),
      }),
    ).rejects.toThrow("project-relative path");
  });
});
