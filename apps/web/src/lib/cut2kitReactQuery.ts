import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

export const cut2kitQueryKeys = {
  all: ["cut2kit"] as const,
  project: (cwd: string | null) => ["cut2kit", "project", cwd] as const,
};

export function cut2kitProjectQueryOptions(input: {
  cwd: string | null;
  enabled?: boolean;
  staleTime?: number;
}) {
  return queryOptions({
    queryKey: cut2kitQueryKeys.project(input.cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Cut2Kit project is unavailable.");
      }
      return api.cut2kit.inspectProject({ cwd: input.cwd });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: input.staleTime ?? 5_000,
  });
}
