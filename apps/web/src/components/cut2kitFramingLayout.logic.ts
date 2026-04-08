export function didLayoutJsonBecomeReady(input: {
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

export function shouldAutoRenderLayoutPdf(input: {
  layoutJsonPath: string | null;
  layoutJsonReady: boolean;
  layoutPdfReady: boolean;
  isRenderingLayout: boolean;
  hasActiveGeneration: boolean;
  jsonJustBecameReady: boolean;
  hasAlreadyAttemptedAutoRender: boolean;
}): boolean {
  if (
    input.layoutJsonPath === null ||
    !input.layoutJsonReady ||
    input.layoutPdfReady ||
    input.isRenderingLayout ||
    input.hasAlreadyAttemptedAutoRender
  ) {
    return false;
  }

  return (
    input.hasActiveGeneration ||
    input.jsonJustBecameReady ||
    (input.layoutJsonReady && !input.layoutPdfReady)
  );
}

export function canRenderLayoutPdfFromJson(input: {
  layoutJsonPath: string | null;
  layoutJsonReady: boolean;
  isRenderingLayout: boolean;
}): boolean {
  return input.layoutJsonPath !== null && input.layoutJsonReady && !input.isRenderingLayout;
}

export const didFramingJsonBecomeReady = didLayoutJsonBecomeReady;

export function shouldAutoRenderFramingPdf(input: {
  framingJsonPath: string | null;
  framingJsonReady: boolean;
  framingPdfReady: boolean;
  isRenderingFramingLayout: boolean;
  hasActiveFramingGeneration: boolean;
  jsonJustBecameReady: boolean;
  hasAlreadyAttemptedAutoRender: boolean;
}): boolean {
  return shouldAutoRenderLayoutPdf({
    layoutJsonPath: input.framingJsonPath,
    layoutJsonReady: input.framingJsonReady,
    layoutPdfReady: input.framingPdfReady,
    isRenderingLayout: input.isRenderingFramingLayout,
    hasActiveGeneration: input.hasActiveFramingGeneration,
    jsonJustBecameReady: input.jsonJustBecameReady,
    hasAlreadyAttemptedAutoRender: input.hasAlreadyAttemptedAutoRender,
  });
}

export function canRenderFramingPdfFromJson(input: {
  framingJsonPath: string | null;
  framingJsonReady: boolean;
  isRenderingFramingLayout: boolean;
}): boolean {
  return canRenderLayoutPdfFromJson({
    layoutJsonPath: input.framingJsonPath,
    layoutJsonReady: input.framingJsonReady,
    isRenderingLayout: input.isRenderingFramingLayout,
  });
}
