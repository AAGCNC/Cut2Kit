import { describe, expect, it } from "vitest";

import {
  canRenderFramingPdfFromJson,
  didFramingJsonBecomeReady,
  shouldAutoRenderFramingPdf,
} from "./cut2kitFramingLayout.logic";

describe("didFramingJsonBecomeReady", () => {
  it("only returns true when the same selected framing JSON transitions from missing to ready", () => {
    expect(
      didFramingJsonBecomeReady({
        previousJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        previousJsonReady: false,
        nextJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        nextJsonReady: true,
      }),
    ).toBe(true);

    expect(
      didFramingJsonBecomeReady({
        previousJsonPath: null,
        previousJsonReady: false,
        nextJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        nextJsonReady: true,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoRenderFramingPdf", () => {
  it("auto-renders when the selected JSON just appeared", () => {
    expect(
      shouldAutoRenderFramingPdf({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        framingPdfReady: false,
        isRenderingFramingLayout: false,
        hasActiveFramingGeneration: false,
        jsonJustBecameReady: true,
        hasAlreadyAttemptedAutoRender: false,
      }),
    ).toBe(true);
  });

  it("auto-renders when a dedicated framing run is active and JSON is ready", () => {
    expect(
      shouldAutoRenderFramingPdf({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        framingPdfReady: false,
        isRenderingFramingLayout: false,
        hasActiveFramingGeneration: true,
        jsonJustBecameReady: false,
        hasAlreadyAttemptedAutoRender: false,
      }),
    ).toBe(true);
  });

  it("auto-renders recovery cases when framing JSON exists but the PDF is still missing", () => {
    expect(
      shouldAutoRenderFramingPdf({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        framingPdfReady: false,
        isRenderingFramingLayout: false,
        hasActiveFramingGeneration: false,
        jsonJustBecameReady: false,
        hasAlreadyAttemptedAutoRender: false,
      }),
    ).toBe(true);
  });

  it("does not auto-render once the PDF exists or an attempt was already made", () => {
    expect(
      shouldAutoRenderFramingPdf({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        framingPdfReady: true,
        isRenderingFramingLayout: false,
        hasActiveFramingGeneration: true,
        jsonJustBecameReady: true,
        hasAlreadyAttemptedAutoRender: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoRenderFramingPdf({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        framingPdfReady: false,
        isRenderingFramingLayout: false,
        hasActiveFramingGeneration: true,
        jsonJustBecameReady: true,
        hasAlreadyAttemptedAutoRender: true,
      }),
    ).toBe(false);
  });
});

describe("canRenderFramingPdfFromJson", () => {
  it("enables manual PDF generation whenever framing JSON exists and rendering is idle", () => {
    expect(
      canRenderFramingPdfFromJson({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        isRenderingFramingLayout: false,
      }),
    ).toBe(true);

    expect(
      canRenderFramingPdfFromJson({
        framingJsonPath: "output/reports/framing-layouts/elevation2.framing-layout.json",
        framingJsonReady: true,
        isRenderingFramingLayout: true,
      }),
    ).toBe(false);
  });
});
