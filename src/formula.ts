export type FormulaSymbol = {
  label: string;
  snippet: string;
  cursorOffset?: number;
  title?: string;
  previewLatex?: string;
  visualSnippet?: string;
  wide?: boolean;
};

export type FormulaSymbolGroup = {
  id: string;
  label: [string, string];
  symbols: FormulaSymbol[];
};

export const DEFAULT_FORMULA = String.raw`Y(i,j)=\sum_{m=0}^{k-1}\sum_{n=0}^{k-1}X(i+m,j+n)W(m,n)+b`;

export const FORMULA_SYMBOL_GROUPS: FormulaSymbolGroup[] = [
  {
    id: "main",
    label: ["主要", "Main"],
    symbols: [
      { label: "平方", previewLatex: "a^2", snippet: "^2", title: "平方 / square" },
      { label: "上标", previewLatex: "a^b", snippet: "^{}", cursorOffset: 2, title: "上标 / superscript" },
      { label: "下标", previewLatex: "a_i", snippet: "_{}", cursorOffset: 2, title: "下标 / subscript" },
      { label: "上下标", previewLatex: "a_i^j", snippet: "_{}^{}", cursorOffset: 2, title: "上下标 / scripts" },
      { label: "分数", previewLatex: "\\frac{a}{b}", snippet: "\\frac{}{}", cursorOffset: 6, title: "分数 / fraction" },
      { label: "绝对值", previewLatex: "\\lvert a\\rvert", snippet: "\\left|\\right|", visualSnippet: "\\left|\\placeholder{}\\right|", cursorOffset: 6, title: "绝对值 / absolute value" },
      { label: "平方根", previewLatex: "\\sqrt{x}", snippet: "\\sqrt{}", cursorOffset: 6, title: "平方根 / square root" },
      { label: "n 次根", previewLatex: "\\sqrt[n]{x}", snippet: "\\sqrt[]{}", cursorOffset: 6, title: "n 次根 / nth root" },
      { label: "圆括号", previewLatex: "\\left(a\\right)", snippet: "\\left(\\right)", visualSnippet: "\\left(\\placeholder{}\\right)", cursorOffset: 6, title: "自适应圆括号" },
      { label: "方括号", previewLatex: "\\left[a\\right]", snippet: "\\left[\\right]", visualSnippet: "\\left[\\placeholder{}\\right]", cursorOffset: 6, title: "自适应方括号" },
      { label: "向量", previewLatex: "\\vec{x}", snippet: "\\vec{}", cursorOffset: 5, title: "向量 / vector" },
      { label: "上划线", previewLatex: "\\overline{x}", snippet: "\\overline{}", cursorOffset: 10, title: "上划线 / overline" },
    ],
  },
  {
    id: "latin",
    label: ["abc", "abc"],
    symbols: "abcdefgijkmnpqrstuvwxyzABCXYZ".split("").map((value) => ({ label: value, snippet: value, previewLatex: value })),
  },
  {
    id: "greek",
    label: ["希腊", "Greek"],
    symbols: [
      ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["δ", "\\delta"],
      ["ε", "\\epsilon"], ["θ", "\\theta"], ["λ", "\\lambda"], ["μ", "\\mu"],
      ["π", "\\pi"], ["ρ", "\\rho"], ["σ", "\\sigma"], ["τ", "\\tau"],
      ["φ", "\\phi"], ["ω", "\\omega"], ["Δ", "\\Delta"], ["Σ", "\\Sigma"],
      ["Ω", "\\Omega"], ["η", "\\eta"], ["ξ", "\\xi"], ["ψ", "\\psi"],
    ].map(([label, snippet]) => ({ label, snippet, previewLatex: snippet })),
  },
  {
    id: "functions",
    label: ["函数", "Functions"],
    symbols: [
      ["sin", "\\sin"], ["cos", "\\cos"], ["tan", "\\tan"], ["cot", "\\cot"],
      ["ln", "\\ln"], ["log", "\\log_{}", "\\log_b", 6], ["exp", "\\exp"], ["max", "\\max"],
      ["min", "\\min"], ["arcsin", "\\arcsin"], ["arg", "\\arg"], ["det", "\\det"],
    ].map(([label, snippet, previewLatex, cursorOffset]) => ({ label: String(label), snippet: String(snippet), previewLatex: String(previewLatex || snippet), cursorOffset: cursorOffset ? Number(cursorOffset) : undefined })),
  },
  {
    id: "calculus",
    label: ["微积分", "Calculus"],
    symbols: [
      { label: "求和", previewLatex: "\\sum_{i=1}^{n}", snippet: "\\sum_{}^{}", cursorOffset: 6, title: "求和 / summation" },
      { label: "连乘", previewLatex: "\\prod_{i=1}^{n}", snippet: "\\prod_{}^{}", cursorOffset: 7, title: "连乘 / product" },
      { label: "积分", previewLatex: "\\int_a^b", snippet: "\\int_{}^{}", cursorOffset: 6, title: "积分 / integral" },
      { label: "环路积分", previewLatex: "\\oint_C", snippet: "\\oint_{}^{}", cursorOffset: 7, title: "环路积分" },
      { label: "极限", previewLatex: "\\lim_{x\\to0}", snippet: "\\lim_{}", cursorOffset: 5, title: "极限 / limit" },
      { label: "偏导", previewLatex: "\\partial", snippet: "\\partial", title: "偏导数" },
      { label: "梯度", previewLatex: "\\nabla", snippet: "\\nabla", title: "梯度 / nabla" },
      { label: "导数", previewLatex: "\\frac{d}{dx}", snippet: "\\frac{d}{dx}", title: "常微分" },
      { label: "偏导分式", previewLatex: "\\frac{\\partial}{\\partial x}", snippet: "\\frac{\\partial}{\\partial x}", title: "偏导分式" },
      { label: "无穷", previewLatex: "\\infty", snippet: "\\infty", title: "无穷" },
      { label: "趋于", previewLatex: "\\to", snippet: "\\to", title: "趋于" },
      { label: "微分", previewLatex: "\\mathrm{d}x", snippet: "\\mathrm{d}x", title: "微分" },
    ],
  },
  {
    id: "matrix",
    label: ["矩阵", "Matrices"],
    symbols: [
      { label: "2×2 方括号", previewLatex: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", snippet: "\\begin{bmatrix} &  \\\\  &  \\end{bmatrix}", visualSnippet: "\\begin{bmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{bmatrix}", cursorOffset: 16, title: "2×2 方括号矩阵", wide: true },
      { label: "2×2 圆括号", previewLatex: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", snippet: "\\begin{pmatrix} &  \\\\  &  \\end{pmatrix}", visualSnippet: "\\begin{pmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{pmatrix}", cursorOffset: 16, title: "2×2 圆括号矩阵", wide: true },
      { label: "3×3 方括号", previewLatex: "\\begin{bmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{bmatrix}", snippet: "\\begin{bmatrix} & & \\\\ & & \\\\ & & \\end{bmatrix}", visualSnippet: "\\begin{bmatrix}\\placeholder{}&\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}&\\placeholder{}\\end{bmatrix}", cursorOffset: 16, title: "3×3 矩阵", wide: true },
      { label: "行列式", previewLatex: "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", snippet: "\\begin{vmatrix} &  \\\\  &  \\end{vmatrix}", visualSnippet: "\\begin{vmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{vmatrix}", cursorOffset: 16, title: "行列式", wide: true },
      { label: "分段函数", previewLatex: "f(x)=\\begin{cases}a&x>0\\\\b&x\\le0\\end{cases}", snippet: "\\begin{cases} & \\\\ & \\end{cases}", visualSnippet: "\\begin{cases}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{cases}", cursorOffset: 14, title: "分段函数", wide: true },
      { label: "列向量", previewLatex: "\\begin{bmatrix}x\\\\y\\\\z\\end{bmatrix}", snippet: "\\begin{bmatrix} \\\\ \\\\ \\end{bmatrix}", visualSnippet: "\\begin{bmatrix}\\placeholder{}\\\\\\placeholder{}\\\\\\placeholder{}\\end{bmatrix}", cursorOffset: 16, title: "列向量", wide: true },
      { label: "转置", previewLatex: "A^{\\mathsf T}", snippet: "^{\\mathsf T}", title: "矩阵转置" },
      { label: "逆矩阵", previewLatex: "A^{-1}", snippet: "^{-1}", title: "逆矩阵" },
      { label: "横省略", previewLatex: "\\cdots", snippet: "\\cdots", title: "横向省略号" },
      { label: "竖省略", previewLatex: "\\vdots", snippet: "\\vdots", title: "纵向省略号" },
      { label: "对角省略", previewLatex: "\\ddots", snippet: "\\ddots", title: "对角省略号" },
      { label: "单位矩阵", previewLatex: "I_n", snippet: "I_{}", cursorOffset: 2, title: "单位矩阵" },
    ],
  },
];

export const FORMULA_NUMBER_KEYS: FormulaSymbol[] = "7894561230.".split("").map((value) => ({
  label: value,
  snippet: value,
  previewLatex: value,
}));

export const FORMULA_OPERATOR_KEYS: FormulaSymbol[] = [
  { label: "÷", previewLatex: "\\div", snippet: "\\div" },
  { label: "×", previewLatex: "\\times", snippet: "\\times" },
  { label: "−", previewLatex: "-", snippet: "-" },
  { label: "+", previewLatex: "+", snippet: "+" },
  { label: "=", previewLatex: "=", snippet: "=" },
];

export function formulaSnippetForVisualEditor(symbol: FormulaSymbol) {
  if (symbol.visualSnippet) return symbol.visualSnippet;
  return symbol.snippet
    .replace(/\{\}/g, "{\\placeholder{}}")
    .replace(/\[\]/g, "[\\placeholder{}]");
}

export function countFormulaPlaceholders(value: string) {
  return (String(value || "").match(/\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}/g) || []).length;
}

export function formulaLatexForPreview(value: string) {
  return String(value || "").replace(/\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}/g, "\\boxed{\\phantom{0}}");
}

export function normalizeFormulaLatex(value: string) {
  let result = String(value || "").trim();
  const fenced = result.match(/^```(?:latex|tex|math)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) result = fenced[1].trim();
  result = result
    .replace(/^\$\$([\s\S]*)\$\$$/, "$1")
    .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
    .replace(/^\\\(([\s\S]*)\\\)$/, "$1")
    .trim();
  return result;
}

export function insertFormulaSnippet(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  symbol: FormulaSymbol,
) {
  const start = Math.max(0, Math.min(source.length, selectionStart));
  const end = Math.max(start, Math.min(source.length, selectionEnd));
  const selected = source.slice(start, end);
  let snippet = symbol.snippet;
  let cursor = symbol.cursorOffset ?? snippet.length;

  if (selected) {
    const emptyGroup = snippet.indexOf("{}");
    if (emptyGroup >= 0) {
      snippet = `${snippet.slice(0, emptyGroup + 1)}${selected}${snippet.slice(emptyGroup + 1)}`;
      cursor = emptyGroup + selected.length + 2;
    }
  }

  return {
    value: `${source.slice(0, start)}${snippet}${source.slice(end)}`,
    cursor: start + cursor,
  };
}
