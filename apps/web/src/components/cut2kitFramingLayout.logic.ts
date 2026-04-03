export function didFramingJsonBecomeReady(input: {
  previousJsonPath: string | null;
  previousJsonReady: boolean;
  nextJsonPath: string | null;
  nextJsonReady: boolean;
}): boolean {
  return (
    input.nextJsonPath !== null &&
    input.nextJsonReady &&
    input.previousJsonPath === input.nextJsonPath &&
    !input.previousJsonReady
  );
}

export function shouldAutoRenderFramingPdf(input: {
  framingJsonPath: string | null;
  framingJsonReady: boolean;
  framingPdfReady: boolean;
  isRenderingFramingLayout: boolean;
  hasActiveFramingGeneration: boolean;
  jsonJustBecameReady: boolean;
  hasAlreadyAttemptedAutoRender: boolean;
}): boolean {
  if (
    input.framingJsonPath === null ||
    !input.framingJsonReady ||
    input.framingPdfReady ||
    input.isRenderingFramingLayout ||
    input.hasAlreadyAttemptedAutoRender
  ) {
    return false;
  }

  return input.hasActiveFramingGeneration || input.jsonJustBecameReady;
}

export function canRenderFramingPdfFromJson(input: {
  framingJsonPath: string | null;
  framingJsonReady: boolean;
  isRenderingFramingLayout: boolean;
}): boolean {
  return (
    input.framingJsonPath !== null &&
    input.framingJsonReady &&
    !input.isRenderingFramingLayout
  );
}
