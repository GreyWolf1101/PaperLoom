import type { RelativeRect } from "./models";
import { normalizeRelativeRects } from "./annotationGeometry";

export type SummaryOutlinePoint = {
  x: number;
  y: number;
};

export type SummarySelectionOutline = {
  kind: "rectangle" | "polygon";
  points: SummaryOutlinePoint[];
  lineCount: number;
};

export type SummaryOutlineInsertion = {
  noteId: string;
  anchorY: number;
  gap: number;
};

type SelectionLine = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function mergeRectsIntoLines(rects: RelativeRect[]) {
  return normalizeRelativeRects(rects).reduce<SelectionLine[]>((lines, rect) => {
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const center = (top + bottom) / 2;
    const line = lines.find((candidate) => {
      const candidateCenter = (candidate.top + candidate.bottom) / 2;
      const candidateHeight = candidate.bottom - candidate.top;
      const overlap = Math.max(0, Math.min(candidate.bottom, bottom) - Math.max(candidate.top, top));
      const overlapRatio = overlap / Math.max(0.00001, Math.min(candidateHeight, rect.height));
      return overlapRatio >= 0.32
        || Math.abs(candidateCenter - center) <= Math.max(candidateHeight, rect.height) * 0.62;
    });

    if (!line) {
      lines.push({ left: rect.x, top, right: rect.x + rect.width, bottom });
      return lines;
    }

    line.left = Math.min(line.left, rect.x);
    line.top = Math.min(line.top, top);
    line.right = Math.max(line.right, rect.x + rect.width);
    line.bottom = Math.max(line.bottom, bottom);
    return lines;
  }, []).sort((left, right) => left.top - right.top || left.left - right.left);
}

function removeRedundantPoints(points: SummaryOutlinePoint[]) {
  const deduplicated = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    return Math.abs(point.x - previous.x) > 0.00001 || Math.abs(point.y - previous.y) > 0.00001;
  });

  return deduplicated.filter((point, index) => {
    const previous = deduplicated[(index - 1 + deduplicated.length) % deduplicated.length];
    const next = deduplicated[(index + 1) % deduplicated.length];
    const sameVertical = Math.abs(previous.x - point.x) <= 0.00001
      && Math.abs(point.x - next.x) <= 0.00001;
    const sameHorizontal = Math.abs(previous.y - point.y) <= 0.00001
      && Math.abs(point.y - next.y) <= 0.00001;
    return !sameVertical && !sameHorizontal;
  });
}

export function buildSummarySelectionOutline(rects: RelativeRect[] | undefined): SummarySelectionOutline | null {
  const lines = mergeRectsIntoLines(rects || []);
  if (!lines.length) return null;

  const minLeft = Math.min(...lines.map((line) => line.left));
  const maxRight = Math.max(...lines.map((line) => line.right));
  const minTop = Math.min(...lines.map((line) => line.top));
  const maxBottom = Math.max(...lines.map((line) => line.bottom));
  const selectionWidth = Math.max(0.00001, maxRight - minLeft);
  const averageHeight = lines.reduce((total, line) => total + line.bottom - line.top, 0) / lines.length;
  const paddingX = Math.min(0.007, Math.max(0.0025, selectionWidth * 0.004));
  const paddingY = Math.min(0.004, Math.max(0.0012, averageHeight * 0.1));
  const firstLineIndent = Math.max(0, lines[0].left - minLeft);
  const startsAtNaturalLineBeginning = firstLineIndent <= Math.max(0.04, selectionWidth * 0.12);

  if (lines.length === 1 || startsAtNaturalLineBeginning) {
    return {
      kind: "rectangle",
      lineCount: lines.length,
      points: [
        { x: clampUnit(minLeft - paddingX), y: clampUnit(minTop - paddingY) },
        { x: clampUnit(maxRight + paddingX), y: clampUnit(minTop - paddingY) },
        { x: clampUnit(maxRight + paddingX), y: clampUnit(maxBottom + paddingY) },
        { x: clampUnit(minLeft - paddingX), y: clampUnit(maxBottom + paddingY) },
      ],
    };
  }

  const first = lines[0];
  const last = lines[lines.length - 1];
  const firstStepY = lines.length > 1
    ? (first.bottom + lines[1].top) / 2
    : first.bottom + paddingY;
  const lastStepY = lines.length > 1
    ? (lines[lines.length - 2].bottom + last.top) / 2
    : last.top - paddingY;
  const coreLeft = clampUnit(minLeft - paddingX);
  const coreRight = clampUnit(maxRight + paddingX);
  const firstLeft = clampUnit(first.left - paddingX);
  const firstRight = clampUnit(first.right + paddingX);
  const lastLeft = clampUnit(last.left - paddingX);
  const lastRight = clampUnit(last.right + paddingX);

  return {
    kind: "polygon",
    lineCount: lines.length,
    points: removeRedundantPoints([
      { x: firstLeft, y: clampUnit(first.top - paddingY) },
      { x: firstRight, y: clampUnit(first.top - paddingY) },
      { x: firstRight, y: clampUnit(firstStepY) },
      { x: coreRight, y: clampUnit(firstStepY) },
      { x: coreRight, y: clampUnit(lastStepY) },
      { x: lastRight, y: clampUnit(lastStepY) },
      { x: lastRight, y: clampUnit(last.bottom + paddingY) },
      { x: lastLeft, y: clampUnit(last.bottom + paddingY) },
      { x: lastLeft, y: clampUnit(lastStepY) },
      { x: coreLeft, y: clampUnit(lastStepY) },
      { x: coreLeft, y: clampUnit(firstStepY) },
      { x: firstLeft, y: clampUnit(firstStepY) },
    ]),
  };
}

export function summaryOutlinePath(
  outline: SummarySelectionOutline,
  mapX: (value: number) => number = (value) => value,
  mapY: (value: number) => number = (value) => value,
) {
  return `${outline.points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${mapX(point.x).toFixed(3)} ${mapY(point.y).toFixed(3)}`
  )).join(" ")} Z`;
}

export function mapSummaryOutlineY(
  originalY: number,
  insertions: SummaryOutlineInsertion[],
  sourceNoteId: string,
) {
  return originalY + insertions.reduce(
    (shift, insertion) => shift + (
      insertion.noteId !== sourceNoteId && originalY >= insertion.anchorY
        ? insertion.gap
        : 0
    ),
    0,
  );
}
