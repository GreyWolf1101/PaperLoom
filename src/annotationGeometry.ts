import type { RelativeRect } from "./models";

const MIN_RECT_SIZE = 0.00001;

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function horizontalOverlap(left: RelativeRect, right: RelativeRect) {
  return Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
}

export function areDuplicateRelativeRects(left: RelativeRect, right: RelativeRect) {
  const leftCenter = left.y + left.height / 2;
  const rightCenter = right.y + right.height / 2;
  const verticalTolerance = Math.max(0.0025, Math.max(left.height, right.height) * 0.65);
  const overlapRatio = horizontalOverlap(left, right) / Math.max(MIN_RECT_SIZE, Math.min(left.width, right.width));
  const widthRatio = Math.min(left.width, right.width) / Math.max(MIN_RECT_SIZE, Math.max(left.width, right.width));
  const heightRatio = Math.min(left.height, right.height) / Math.max(MIN_RECT_SIZE, Math.max(left.height, right.height));
  return Math.abs(leftCenter - rightCenter) <= verticalTolerance
    && overlapRatio >= 0.72
    && widthRatio >= 0.58
    && heightRatio >= 0.5;
}

export function areOverlappingRelativeRects(left: RelativeRect, right: RelativeRect) {
  const leftCenter = left.y + left.height / 2;
  const rightCenter = right.y + right.height / 2;
  const verticalTolerance = Math.max(0.0035, Math.max(left.height, right.height) * 0.85);
  const overlapRatio = horizontalOverlap(left, right) / Math.max(MIN_RECT_SIZE, Math.min(left.width, right.width));
  const heightRatio = Math.min(left.height, right.height) / Math.max(MIN_RECT_SIZE, Math.max(left.height, right.height));
  return Math.abs(leftCenter - rightCenter) <= verticalTolerance
    && overlapRatio >= 0.18
    && heightRatio >= 0.35;
}

function mergeRelativeRects(left: RelativeRect, right: RelativeRect): RelativeRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const farX = Math.max(left.x + left.width, right.x + right.width);
  const farY = Math.max(left.y + left.height, right.y + right.height);
  return {
    x: clampUnit(x),
    y: clampUnit(y),
    width: Math.min(1 - clampUnit(x), Math.max(MIN_RECT_SIZE, farX - x)),
    height: Math.min(1 - clampUnit(y), Math.max(MIN_RECT_SIZE, farY - y)),
  };
}

export function normalizeRelativeRects(rects: RelativeRect[] | undefined) {
  const valid = (rects || [])
    .filter((rect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite))
    .map((rect) => ({
      x: clampUnit(rect.x),
      y: clampUnit(rect.y),
      width: Math.min(1 - clampUnit(rect.x), Math.max(0, rect.width)),
      height: Math.min(1 - clampUnit(rect.y), Math.max(0, rect.height)),
    }))
    .filter((rect) => rect.width > MIN_RECT_SIZE && rect.height > MIN_RECT_SIZE)
    .sort((left, right) => left.y - right.y || left.x - right.x);

  return valid.reduce<RelativeRect[]>((result, rect) => {
    const duplicateIndex = result.findIndex((candidate) => areDuplicateRelativeRects(candidate, rect));
    if (duplicateIndex < 0) result.push(rect);
    else result[duplicateIndex] = mergeRelativeRects(result[duplicateIndex], rect);
    return result;
  }, []);
}

export function relativeRectSetsMatch(
  leftRects: RelativeRect[] | undefined,
  rightRects: RelativeRect[] | undefined,
) {
  const left = normalizeRelativeRects(leftRects);
  const right = normalizeRelativeRects(rightRects);
  if (!left.length || !right.length || left.length !== right.length) return false;
  return left.every((rect) => right.some((candidate) => areDuplicateRelativeRects(rect, candidate)))
    && right.every((rect) => left.some((candidate) => areDuplicateRelativeRects(rect, candidate)));
}

export function relativeRectSetsOverlap(
  leftRects: RelativeRect[] | undefined,
  rightRects: RelativeRect[] | undefined,
) {
  const left = normalizeRelativeRects(leftRects);
  const right = normalizeRelativeRects(rightRects);
  if (!left.length || !right.length) return false;
  return left.some((rect) => right.some((candidate) => areOverlappingRelativeRects(rect, candidate)));
}

export function canonicalAnnotationQuote(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function collapsePdfDuplicateText(value: string, duplicatedGeometry: boolean) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!duplicatedGeometry || normalized.length < 4) return normalized;

  const tokens = normalized.split(" ");
  for (let repeats = Math.min(4, tokens.length); repeats >= 2; repeats -= 1) {
    if (tokens.length % repeats !== 0) continue;
    const unitLength = tokens.length / repeats;
    const unit = tokens.slice(0, unitLength).join(" ");
    const matches = Array.from({ length: repeats }, (_, index) =>
      tokens.slice(index * unitLength, (index + 1) * unitLength).join(" "),
    ).every((part) => canonicalAnnotationQuote(part) === canonicalAnnotationQuote(unit));
    if (matches) return unit;
  }

  for (let repeats = 4; repeats >= 2; repeats -= 1) {
    if (normalized.length % repeats !== 0) continue;
    const unitLength = normalized.length / repeats;
    const unit = normalized.slice(0, unitLength);
    const matches = Array.from({ length: repeats }, (_, index) =>
      normalized.slice(index * unitLength, (index + 1) * unitLength),
    ).every((part) => canonicalAnnotationQuote(part) === canonicalAnnotationQuote(unit));
    if (matches) return unit.trim();
  }

  return normalized;
}
