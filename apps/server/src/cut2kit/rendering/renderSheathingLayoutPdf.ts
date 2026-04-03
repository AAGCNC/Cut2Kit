import PDFDocument from "pdfkit";

import type { Cut2KitRenderingSettings, Cut2KitSheathingLayout } from "@t3tools/contracts";

import { computeFitScale, formatDistance, resolvePageDimensions } from "./pageGeometry.ts";

function sourceLabel(sourcePdfPath: string): string {
  return sourcePdfPath.split("/").at(-1)?.replace(/\.pdf$/i, "") ?? sourcePdfPath;
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
  const buffers: Buffer[] = [];
  return new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(buffers))));
    doc.on("error", reject);
  });
}

function addPage(doc: PDFKit.PDFDocument, rendering: Cut2KitRenderingSettings) {
  const page = resolvePageDimensions(
    rendering.sheathing.pageSize,
    rendering.sheathing.pageOrientation,
  );
  doc.addPage({
    size: [page.width, page.height],
    margin: 0,
  });
  return page;
}

function drawTitleBlock(
  doc: PDFKit.PDFDocument,
  page: { width: number; height: number },
  input: {
    title: string;
    subtitle: string;
  },
) {
  doc.rect(0, 0, page.width, page.height).fill("#fbf6ed");
  doc
    .fillColor("#1f160d")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(input.title, 42, 28, { width: page.width - 84 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#56483a")
    .text(input.subtitle, 42, 52, { width: page.width - 84 });
  doc
    .moveTo(42, 76)
    .lineTo(page.width - 42, 76)
    .lineWidth(1)
    .strokeColor("#cab79e")
    .stroke();
  doc.fillColor("#1f160d");
}

function openingLabel(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function drawOverallLayoutPage(
  doc: PDFKit.PDFDocument,
  layout: Cut2KitSheathingLayout,
  rendering: Cut2KitRenderingSettings,
) {
  const page = addPage(doc, rendering);
  drawTitleBlock(doc, page, {
    title: rendering.sheathing.titleTemplate.replace("{source}", sourceLabel(layout.sourcePdfPath)),
    subtitle: rendering.sheathing.subtitleTemplate
      .replace("{material}", layout.wall.materialLabel)
      .replace("{sheet}", `${layout.wall.sheetNominalWidth}" x ${layout.wall.sheetNominalHeight}"`),
  });

  const margins = rendering.sheathing.margins;
  const scale = computeFitScale({
    page,
    margins: {
      left: margins.left,
      right: margins.right,
      top: margins.top + 64,
      bottom: margins.bottom + 150,
    },
    contentWidth: layout.wall.width,
    contentHeight: layout.wall.height,
  });
  const wallBottom = page.height - margins.bottom - 150;
  const wallLeft = margins.left;
  const xToPt = (value: number) => wallLeft + value * scale;
  const yToPt = (value: number) => wallBottom - value * scale;

  doc.save();
  doc.lineWidth(1);
  doc.strokeColor("#6a5b49");
  doc.rect(wallLeft, wallBottom - layout.wall.height * scale, layout.wall.width * scale, layout.wall.height * scale).stroke();
  doc.restore();

  for (const sheet of layout.sheets) {
    doc.save();
    doc.fillColor(sheet.isTerminalRip ? "#d9e7f2" : "#e9dfcf");
    doc.strokeColor(sheet.isTerminalRip ? "#58738a" : "#5d4a36");
    doc.lineWidth(1);
    doc
      .rect(
        xToPt(sheet.left),
        yToPt(sheet.top),
        sheet.width * scale,
        sheet.height * scale,
      )
      .fillAndStroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#20160d")
      .text(`Sheet ${sheet.index}`, xToPt(sheet.left) + 6, yToPt(sheet.top) + 6);
    doc.restore();

    for (const cutout of sheet.cutouts) {
      doc.save();
      doc.fillColor("#fbf6ed");
      doc.strokeColor("#7d6755");
      doc.dash(4, { space: 2 });
      doc
        .rect(
          xToPt(cutout.left),
          yToPt(cutout.top),
          cutout.width * scale,
          cutout.height * scale,
        )
        .fillAndStroke();
      doc.undash();
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#49392a")
        .text(openingLabel(cutout.sourceOpeningId), xToPt(cutout.left), yToPt(cutout.top) - 12, {
          width: cutout.width * scale,
          align: "center",
        });
      doc.restore();
    }
  }

  for (const opening of layout.geometry.openings) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#382b1f")
      .text(openingLabel(opening.id), xToPt(opening.left), yToPt(opening.top) - 20, {
        width: opening.width * scale,
        align: "center",
      });
  }

  const notes = [
    `Total sheathing: ${layout.summary.sheetCount} sheets (${layout.summary.fullSheetCount} full + terminal rip ${formatDistance(layout.summary.terminalRipWidth, rendering.dimensionFormat)}).`,
    "Openings remain uncovered. Use the following cutout pages to trim each sheet before installation.",
    ...layout.fastening.noteLines.slice(0, 2),
    ...layout.validation.notes,
  ];

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#1f160d")
    .text("Panel layout notes", 42, page.height - 122);
  doc.font("Helvetica").fontSize(9).fillColor("#46382a");
  notes.forEach((note, index) => {
    doc.text(`- ${note}`, 42, page.height - 104 + index * 14, {
      width: page.width - 84,
    });
  });
}

function drawCutoutPage(
  doc: PDFKit.PDFDocument,
  layout: Cut2KitSheathingLayout,
  rendering: Cut2KitRenderingSettings,
  sheets: ReadonlyArray<Cut2KitSheathingLayout["sheets"][number]>,
  pageIndex: number,
  totalPages: number,
) {
  const page = addPage(doc, rendering);
  drawTitleBlock(doc, page, {
    title: `${sourceLabel(layout.sourcePdfPath)} - OSB Cutout Details (Page ${pageIndex} of ${totalPages})`,
    subtitle: "Each diagram shows one OSB sheet before installation, viewed from the wall exterior side.",
  });

  const columns = 2;
  const rows = Math.max(1, Math.ceil(sheets.length / columns));
  const gutter = 24;
  const contentLeft = 42;
  const contentTop = 96;
  const contentWidth = page.width - contentLeft * 2;
  const contentHeight = page.height - contentTop - 42;
  const cardWidth = (contentWidth - gutter) / columns;
  const cardHeight = (contentHeight - gutter * (rows - 1)) / rows;

  sheets.forEach((sheet, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cardX = contentLeft + column * (cardWidth + gutter);
    const cardY = contentTop + row * (cardHeight + gutter);
    const scale = Math.min((cardWidth - 24) / sheet.width, (cardHeight - 84) / sheet.height);
    const sheetX = cardX + (cardWidth - sheet.width * scale) / 2;
    const sheetTop = cardY + 28;
    const yToPt = (value: number) => sheetTop + (sheet.height - value) * scale;
    const xToPt = (value: number) => sheetX + value * scale;

    doc
      .rect(cardX, cardY, cardWidth, cardHeight)
      .lineWidth(1)
      .strokeColor("#ccb99f")
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#1f160d")
      .text(
        `Sheet ${sheet.index} - ${formatDistance(sheet.width, rendering.dimensionFormat)} x ${formatDistance(sheet.height, rendering.dimensionFormat)}`,
        cardX + 8,
        cardY + 8,
        { width: cardWidth - 16 },
      );

    doc
      .rect(sheetX, sheetTop, sheet.width * scale, sheet.height * scale)
      .lineWidth(1)
      .fillColor("#efe7d7")
      .strokeColor("#5a4633")
      .fillAndStroke();

    for (const cutout of sheet.cutouts) {
      doc
        .rect(
          xToPt(cutout.left - sheet.left),
          yToPt(cutout.top),
          cutout.width * scale,
          cutout.height * scale,
        )
        .lineWidth(1)
        .dash(4, { space: 2 })
        .fillColor("#fbf6ed")
        .strokeColor("#796553")
        .fillAndStroke();
      doc.undash();
    }

    const cutoutLines =
      sheet.cutouts.length > 0
        ? sheet.cutouts.map(
            (cutout) =>
              `${openingLabel(cutout.sourceOpeningId)}: left ${formatDistance(cutout.left - sheet.left, rendering.dimensionFormat)}, bottom ${formatDistance(cutout.bottom, rendering.dimensionFormat)}, cut ${formatDistance(cutout.width, rendering.dimensionFormat)} x ${formatDistance(cutout.height, rendering.dimensionFormat)}`,
          )
        : ["No cutouts on this sheet."];

    doc.font("Helvetica").fontSize(8).fillColor("#433629");
    cutoutLines.forEach((line, lineIndex) => {
      doc.text(line, cardX + 8, cardY + cardHeight - 40 + lineIndex * 10, {
        width: cardWidth - 16,
      });
    });
  });
}

function drawFasteningPage(
  doc: PDFKit.PDFDocument,
  layout: Cut2KitSheathingLayout,
  rendering: Cut2KitRenderingSettings,
) {
  const page = addPage(doc, rendering);
  drawTitleBlock(doc, page, {
    title: rendering.sheathing.fasteningTitleTemplate.replace(
      "{source}",
      sourceLabel(layout.sourcePdfPath),
    ),
    subtitle:
      "Typical reference page. Confirm final fastening schedule and edge support requirements with the governing code, engineering, and manufacturer instructions.",
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#1f160d")
    .text("Panel edge and fastening notes", 42, 108);
  doc.font("Helvetica").fontSize(10).fillColor("#46382a");
  layout.fastening.noteLines.forEach((note, index) => {
    doc.text(`- ${note}`, 42, 132 + index * 18, {
      width: page.width - 84,
    });
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#1f160d")
    .text("Quick schedule", 42, 286);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#46382a")
    .text(
      `Panel: ${layout.wall.materialLabel}, ${formatDistance(layout.wall.sheetNominalWidth, rendering.dimensionFormat)} x ${formatDistance(layout.wall.sheetNominalHeight, rendering.dimensionFormat)} nominal`,
      42,
      308,
      { width: page.width - 84 },
    )
    .text(
      `Count: ${layout.summary.sheetCount} sheets total (${layout.summary.fullSheetCount} full + ${layout.summary.sheetCount - layout.summary.fullSheetCount} special pieces)`,
      42,
      326,
      { width: page.width - 84 },
    )
    .text(layout.fastening.disclaimerText, 42, 356, {
      width: page.width - 84,
    });
}

export async function renderSheathingLayoutPdf(input: {
  layout: Cut2KitSheathingLayout;
  rendering: Cut2KitRenderingSettings;
  output: {
    includeOverallLayoutPage: boolean;
    includePerSheetCutoutPages: boolean;
    includeFasteningPage: boolean;
  };
}): Promise<Uint8Array> {
  const page = resolvePageDimensions(
    input.rendering.sheathing.pageSize,
    input.rendering.sheathing.pageOrientation,
  );
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [page.width, page.height],
    margin: 0,
  });

  const completed = collectPdf(doc);

  if (input.output.includeOverallLayoutPage) {
    drawOverallLayoutPage(doc, input.layout, input.rendering);
  }

  const cutoutDetailsPerPage = input.rendering.sheathing.cutoutDetailsPerPage;
  const cutoutPages = [];
  for (let index = 0; index < input.layout.sheets.length; index += cutoutDetailsPerPage) {
    cutoutPages.push(input.layout.sheets.slice(index, index + cutoutDetailsPerPage));
  }

  if (input.output.includePerSheetCutoutPages) {
    cutoutPages.forEach((sheets, index) => {
      drawCutoutPage(doc, input.layout, input.rendering, sheets, index + 1, cutoutPages.length);
    });
  }

  if (input.output.includeFasteningPage) {
    drawFasteningPage(doc, input.layout, input.rendering);
  }

  doc.end();
  return completed;
}
