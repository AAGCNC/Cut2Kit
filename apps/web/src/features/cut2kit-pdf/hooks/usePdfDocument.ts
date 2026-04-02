import { queryOptions, useQuery } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

export const cut2kitPdfQueryKeys = {
  all: ["cut2kit", "pdf-document"] as const,
  document: (cwd: string, relativePath: string | null) =>
    ["cut2kit", "pdf-document", cwd, relativePath] as const,
};

export function usePdfDocument(input: { cwd: string; relativePath: string | null }) {
  return useQuery(
    queryOptions({
      queryKey: cut2kitPdfQueryKeys.document(input.cwd, input.relativePath),
      queryFn: async () => {
        const api = ensureNativeApi();
        if (!input.relativePath) {
          throw new Error("No PDF file is selected.");
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
