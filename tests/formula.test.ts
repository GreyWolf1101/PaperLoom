import assert from "node:assert/strict";
import test from "node:test";
import {
  countFormulaPlaceholders,
  DEFAULT_FORMULA,
  FORMULA_SYMBOL_GROUPS,
  formulaLatexForPreview,
  formulaSnippetForVisualEditor,
  insertFormulaSnippet,
  normalizeFormulaLatex,
} from "../src/formula";

test("normalizes common AI formula wrappers", () => {
  assert.equal(normalizeFormulaLatex("```latex\n\\frac{a}{b}\n```"), "\\frac{a}{b}");
  assert.equal(normalizeFormulaLatex("$$x^2+y^2$$"), "x^2+y^2");
  assert.equal(normalizeFormulaLatex("\\[\\sum_{i=1}^{n}x_i\\]"), "\\sum_{i=1}^{n}x_i");
});

test("inserts structure snippets at the caret", () => {
  const result = insertFormulaSnippet("x+", 2, 2, { label: "fraction", snippet: "\\frac{}{}", cursorOffset: 6 });
  assert.equal(result.value, "x+\\frac{}{}");
  assert.equal(result.cursor, 8);
});

test("wraps a selected expression in the first structure slot", () => {
  const result = insertFormulaSnippet("a+b", 0, 3, { label: "root", snippet: "\\sqrt{}", cursorOffset: 6 });
  assert.equal(result.value, "\\sqrt{a+b}");
  assert.equal(result.cursor, 10);
});

test("ships a complex editable starter formula", () => {
  assert.match(DEFAULT_FORMULA, /\\sum_\{m=0\}/);
  assert.match(DEFAULT_FORMULA, /W\(m,n\)/);
});

test("ships advanced keyboard groups for scripts and matrices", () => {
  const main = FORMULA_SYMBOL_GROUPS.find((group) => group.id === "main");
  const matrix = FORMULA_SYMBOL_GROUPS.find((group) => group.id === "matrix");
  assert.ok(main?.symbols.some((symbol) => symbol.snippet === "_{}^{}"));
  assert.ok(matrix?.symbols.some((symbol) => symbol.snippet.includes("bmatrix")));
  assert.ok(matrix?.symbols.some((symbol) => symbol.snippet.includes("cases")));
});

test("turns structural keys into visible editable slots", () => {
  const fraction = formulaSnippetForVisualEditor({ label: "fraction", snippet: "\\frac{}{}" });
  assert.equal(fraction, "\\frac{\\placeholder{}}{\\placeholder{}}");
  assert.equal(countFormulaPlaceholders(fraction), 2);
  assert.doesNotMatch(formulaLatexForPreview(fraction), /\\placeholder/);
  assert.match(formulaLatexForPreview(fraction), /\\boxed/);
});

test("matrix keys expose every cell as a visual slot", () => {
  const matrix = FORMULA_SYMBOL_GROUPS.find((group) => group.id === "matrix")
    ?.symbols.find((symbol) => symbol.label === "3×3 方括号");
  assert.ok(matrix);
  assert.equal(countFormulaPlaceholders(formulaSnippetForVisualEditor(matrix)), 9);
});
