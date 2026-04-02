import PDFDocument from "pdfkit";

import type {
  Cut2KitFramingLayout,
  Cut2KitFramingLayoutMember,
  Cut2KitFramingLayoutOpening,
} from "@t3tools/contracts";

const PAGE_WIDTH = 17 * 72;
const PAGE_HEIGHT = 11 * 72;
const MARGIN_LEFT = 84;
const MARGIN_RIGHT = 84;
const MARGIN_TOP = 96;
const MARGIN_BOTTOM = 174;

function formatFeetAndInches(value: number): string {
  const whole = Math.round(value);
  const feet = Math.floor(whole / 12);
  const inches = whole % 12;
  return `${feet}'-${inches}"`;
}

function memberStrokeColor(member: Cut2KitFramingLayoutMember): string {
  switch (member.kind) {
    case "header":
      return "#9f3a25";
    case "sill":
      return "#365c9f";
    case "jamb-stud":
      return "#3d4b63";
    case "end-stud":
      return "#5b4127";
    case "cripple-stud":
      return "#746143";
    case "bottom-plate":
    case "top-plate":
    case "common-stud":
    default:
      return "#2d2419";
  }
}

function memberFillColor(member: Cut2KitFramingLayoutMember): string {
  switch (member.kind) {
    case "header":
      return "#d7b19a";
    case "sill":
      return "#c7d4ef";
    case "jamb-stud":
      return "#d2d7e3";
    case "end-stud":
      return "#d6c0a4";
    case "cripple-stud":
      return "#dfd1bb";
    case "bottom-plate":
    case "top-plate":
    case "common-stud":
    default:
      return "#eadcc8";
  }
}

function openingLabel(opening: Cut2KitFramingLayoutOpening): string {
  return opening.kind === "door" ? "Door head" : `${opening.id.replace(/-/g, " ")} head`;
}

function buildHorizontalBoundaries(
  openings: ReadonlyArray<Cut2KitFramingLayoutOpening>,
  wallWidth: number,
) {
  const boundaries = new Set<number>([0, wallWidth]);
  for (const opening of openings) {
    boundaries.add(opening.left);
    boundaries.add(opening.right);
  }
  return [...boundaries].toSorted((left, right) => left - right);
}

function drawDimensionLine(
  doc: PDFKit.PDFDocument,
  input: {
    x1: number;
    x2: number;
    y: number;
    label: string;
  },
) {
  doc.save();
  doc.lineWidth(0.8);
  doc.strokeColor("#473729");
  doc.moveTo(input.x1, input.y).lineTo(input.x2, input.y).stroke();
  doc
    .moveTo(input.x1, input.y - 6)
    .lineTo(input.x1, input.y + 6)
    .stroke();
  doc
    .moveTo(input.x2, input.y - 6)
    .lineTo(input.x2, input.y + 6)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#24180f")
    .text(input.label, (input.x1 + input.x2) / 2 - 24, input.y - 18, {
      width: 48,
      align: "center",
    });
  doc.restore();
}

function drawVerticalDimensionLine(
  doc: PDFKit.PDFDocument,
  input: {
    x: number;
    y1: number;
    y2: number;
    label: string;
  },
) {
  doc.save();
  doc.lineWidth(0.8);
  doc.strokeColor("#473729");
  doc.moveTo(input.x, input.y1).lineTo(input.x, input.y2).stroke();
  doc
    .moveTo(input.x - 6, input.y1)
    .lineTo(input.x + 6, input.y1)
    .stroke();
  doc
    .moveTo(input.x - 6, input.y2)
    .lineTo(input.x + 6, input.y2)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#24180f")
    .text(input.label, input.x + 10, (input.y1 + input.y2) / 2 - 6, {
      width: 56,
      align: "left",
    });
  doc.restore();
}

export async function renderFramingLayoutPdf(layout: Cut2KitFramingLayout): Promise<Uint8Array> {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: 0,
  });
  doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });

  const buffers: Buffer[] = [];
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(buffers))));
    doc.on("error", reject);
  });

  const usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const usableHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const scale = Math.min(usableWidth / layout.wall.width, usableHeight / layout.wall.height);
  const wallBottomY = PAGE_HEIGHT - MARGIN_BOTTOM;
  const wallTopY = wallBottomY - layout.wall.height * scale;

  const xToPt = (value: number) => MARGIN_LEFT + value * scale;
  const yToPt = (value: number) => wallBottomY - value * scale;
  const widthToPt = (value: number) => value * scale;
  const heightToPt = (value: number) => value * scale;

  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#f7f1e6");

  doc
    .fillColor("#1f140d")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(
      `Framing Layout · ${layout.sourcePdfPath.split("/").at(-1) ?? layout.sourcePdfPath}`,
      48,
      32,
    );
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#4f4338")
    .text(
      `${layout.wall.studNominalSize} ${layout.wall.material} framing · members shown in front elevation · JSON-driven Cut2Kit render`,
      48,
      56,
    );
  doc.text(
    `Overall wall ${formatFeetAndInches(layout.wall.width)} wide × ${formatFeetAndInches(layout.wall.height)} high`,
    48,
    70,
  );

  doc.save();
  doc.lineWidth(1);
  doc.strokeColor("#61513f");
  doc
    .rect(
      MARGIN_LEFT - 12,
      wallTopY - 12,
      layout.wall.width * scale + 24,
      layout.wall.height * scale + 24,
    )
    .stroke();
  doc.restore();

  for (const member of layout.members) {
    const x = xToPt(member.x);
    const y = yToPt(member.y + member.height);
    const width = widthToPt(member.width);
    const height = heightToPt(member.height);
    doc.save();
    doc.fillColor(memberFillColor(member));
    doc.strokeColor(memberStrokeColor(member));
    doc.lineWidth(member.kind === "jamb-stud" || member.kind === "end-stud" ? 1.3 : 1);
    doc.rect(x, y, width, height).fillAndStroke();
    doc.restore();
  }

  for (const opening of layout.openings) {
    const x = xToPt(opening.left);
    const y = yToPt(opening.top);
    const width = widthToPt(opening.width);
    const height = heightToPt(opening.height);

    doc.save();
    doc.dash(5, { space: 3 });
    doc.lineWidth(1);
    doc.strokeColor("#6d6255");
    doc.rect(x, y, width, height).stroke();
    doc.undash();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#45372b")
      .text(openingLabel(opening), x, y - 18, {
        width,
        align: "center",
      })
      .text(formatFeetAndInches(opening.width), x, y - 6, {
        width,
        align: "center",
      });
    if (opening.kind === "window") {
      doc.text("sill", x, yToPt(opening.bottom) + 6, { width, align: "center" });
    }
    doc.restore();
  }

  const horizontalBoundaries = buildHorizontalBoundaries(layout.openings, layout.wall.width);
  const chainDimensionY = wallTopY - 28;
  const overallDimensionY = wallTopY - 56;

  drawDimensionLine(doc, {
    x1: xToPt(0),
    x2: xToPt(layout.wall.width),
    y: overallDimensionY,
    label: formatFeetAndInches(layout.wall.width),
  });

  for (let index = 0; index < horizontalBoundaries.length - 1; index += 1) {
    const start = horizontalBoundaries[index]!;
    const end = horizontalBoundaries[index + 1]!;
    drawDimensionLine(doc, {
      x1: xToPt(start),
      x2: xToPt(end),
      y: chainDimensionY,
      label: formatFeetAndInches(end - start),
    });
  }

  const verticalDimensionX = xToPt(layout.wall.width) + 28;
  drawVerticalDimensionLine(doc, {
    x: verticalDimensionX,
    y1: yToPt(0),
    y2: yToPt(layout.wall.height),
    label: formatFeetAndInches(layout.wall.height),
  });

  const openingHead = Math.max(...layout.openings.map((opening) => opening.top), 0);
  if (openingHead > 0) {
    drawVerticalDimensionLine(doc, {
      x: verticalDimensionX + 42,
      y1: yToPt(0),
      y2: yToPt(openingHead),
      label: formatFeetAndInches(openingHead),
    });
  }

  const sillHeights = layout.openings
    .filter((opening) => opening.kind === "window")
    .map((opening) => opening.bottom);
  if (sillHeights.length > 0) {
    const sillHeight = Math.max(...sillHeights);
    drawVerticalDimensionLine(doc, {
      x: verticalDimensionX + 84,
      y1: yToPt(0),
      y2: yToPt(sillHeight),
      label: formatFeetAndInches(sillHeight),
    });
  }

  const notes = [
    ...layout.notes,
    ...layout.validation.notes,
    `Stud spacing: ${layout.studLayout.spacing} in on center from the ${layout.studLayout.originEdge} wall edge.`,
    `Plate orientation: top ${layout.wall.topMemberOrientation}, bottom ${layout.wall.bottomMemberOrientation}.`,
  ];

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#22160f")
    .text("Framing notes", 48, PAGE_HEIGHT - 138);
  doc.font("Helvetica").fontSize(9).fillColor("#392c21");
  notes.forEach((note, index) => {
    doc.text(`${index + 1}. ${note}`, 48, PAGE_HEIGHT - 120 + index * 14, {
      width: PAGE_WIDTH - 96,
    });
  });

  doc.end();
  return await completed;
}
