import type { ProjectReadFileResult } from "@t3tools/contracts";

export function decodeProjectFileBytes(
  document: Pick<ProjectReadFileResult, "contents">,
): Uint8Array {
  const binary = atob(document.contents);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function decodeProjectFileText(
  document: Pick<ProjectReadFileResult, "contents">,
  encoding = "utf-8",
): string {
  return new TextDecoder(encoding).decode(decodeProjectFileBytes(document));
}
