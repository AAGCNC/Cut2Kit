import { queryOptions, useQuery } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

export const cut2kitDxfQueryKeys = {
  all: ["cut2kit", "dxf-document"] as const,
  document: (cwd: string, relativePath: string | null) =>
    ["cut2kit", "dxf-document", cwd, relativePath] as const,
};

export function useDxfDocument(input: { cwd: string; relativePath: string | null }) {
  return useQuery(
    queryOptions({
      queryKey: cut2kitDxfQueryKeys.document(input.cwd, input.relativePath),
      queryFn: async () => {
        const api = ensureNativeApi();
        if (!input.relativePath) {
          throw new Error("No DXF file is selected.");
        }
        return api.projects.readFile({
          cwd: input.cwd,
          relativePath: input.relativePath,
        });
      },
      enabled: input.relativePath !== null,
      staleTime: 30_000,
    }),
  );
}
