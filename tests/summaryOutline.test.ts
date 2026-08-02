import assert from "node:assert/strict";
import {
  buildSummarySelectionOutline,
  mapSummaryOutlineY,
  summaryOutlinePath,
} from "../src/summaryOutline";

function verifyWholeParagraphRectangle() {
  const outline = buildSummarySelectionOutline([
    { x: 0.10, y: 0.10, width: 0.82, height: 0.025 },
    { x: 0.05, y: 0.14, width: 0.45, height: 0.025 },
    { x: 0.505, y: 0.14, width: 0.415, height: 0.025 },
    { x: 0.05, y: 0.18, width: 0.60, height: 0.025 },
  ]);

  assert.ok(outline);
  assert.equal(outline.kind, "rectangle", "a normal paragraph selection uses one large rectangle");
  assert.equal(outline.lineCount, 3, "fragmented PDF spans on one row are merged into one line");
  assert.equal(outline.points.length, 4);
}

function verifyMidLinePolygon() {
  const outline = buildSummarySelectionOutline([
    { x: 0.28, y: 0.10, width: 0.64, height: 0.025 },
    { x: 0.05, y: 0.14, width: 0.87, height: 0.025 },
    { x: 0.05, y: 0.18, width: 0.43, height: 0.025 },
  ]);

  assert.ok(outline);
  assert.equal(outline.kind, "polygon", "a selection beginning in the middle of a line uses a contour");
  assert.ok(outline.points.length > 4);
  const path = summaryOutlinePath(outline);
  assert.equal((path.match(/M /g) || []).length, 1, "the source marker is rendered as one SVG path");
  assert.ok(path.endsWith(" Z"));
}

function verifySingleFragmentedLine() {
  const outline = buildSummarySelectionOutline([
    { x: 0.20, y: 0.30, width: 0.16, height: 0.025 },
    { x: 0.365, y: 0.30, width: 0.24, height: 0.025 },
  ]);

  assert.ok(outline);
  assert.equal(outline.kind, "rectangle");
  assert.equal(outline.lineCount, 1);
}

function verifyOwnInlineCardDoesNotMoveOutline() {
  const insertions = [
    { noteId: "earlier-summary", anchorY: 80, gap: 110 },
    { noteId: "current-summary", anchorY: 210, gap: 96 },
  ];

  assert.equal(
    mapSummaryOutlineY(214, insertions, "current-summary"),
    324,
    "earlier cards still shift the source to its visible page position",
  );
  assert.notEqual(
    mapSummaryOutlineY(214, insertions, "current-summary"),
    420,
    "the summary outline never receives the gap created by its own card",
  );
}

verifyWholeParagraphRectangle();
verifyMidLinePolygon();
verifySingleFragmentedLine();
verifyOwnInlineCardDoesNotMoveOutline();
console.log("summary-outline tests passed");
