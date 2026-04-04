import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const inspectProject = vi.fn();

vi.mock("../nativeApi", () => ({
  ensureNativeApi: vi.fn(() => ({
    cut2kit: {
      inspectProject,
    },
  })),
}));

import {
  cut2kitProjectQueryOptions,
  cut2kitQueryKeys,
  refreshCut2KitProjectQuery,
} from "./cut2kitReactQuery";

describe("cut2kit react query", () => {
  it("uses cwd-scoped project query keys", () => {
    expect(cut2kitQueryKeys.project("/repo/a")).not.toEqual(cut2kitQueryKeys.project("/repo/b"));
  });

  it("refreshes the selected project query immediately", async () => {
    const queryClient = new QueryClient();
    const project = {
      cwd: "/repo/a",
      name: "Demo",
    };

    inspectProject.mockResolvedValueOnce(project);

    const refreshed = await refreshCut2KitProjectQuery(queryClient, "/repo/a");

    expect(inspectProject).toHaveBeenCalledWith({ cwd: "/repo/a" });
    expect(refreshed).toEqual(project);
    expect(
      queryClient.getQueryData(cut2kitProjectQueryOptions({ cwd: "/repo/a" }).queryKey),
    ).toEqual(project);
  });
});
