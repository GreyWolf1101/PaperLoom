const path = require("node:path");
const JSZip = require("jszip");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

const XMLNS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XMLNS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XMLNS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_BASE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const MAX_DOCX_BYTES = 200 * 1024 * 1024;
const MAX_FORMAT_CONFIG_BYTES = 2 * 1024 * 1024;
const FORMAT_CONFIG_KIND = "paperloom.paper-format";
const FORMAT_CONFIG_VERSION = 1;
const FONT_SIZE_POINTS = new Map([
  ["小初", 36], ["初号", 42], ["小一", 24], ["一号", 26], ["小二", 18], ["二号", 22],
  ["小三", 15], ["三号", 16], ["小四", 12], ["四号", 14], ["小五", 9], ["五号", 10.5],
  ["小六", 6.5], ["六号", 7.5], ["七号", 5.5], ["八号", 5],
]);
const EAST_ASIA_FONTS = ["方正小标宋简体", "方正小标宋", "微软雅黑", "华文中宋", "华文宋体", "华文楷体", "华文仿宋", "华文细黑", "等线", "宋体", "黑体", "楷体", "仿宋"];
const LATIN_FONTS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia"];
const STYLE_ROLE_KEYS = [
  "body", "title", "heading1", "heading2", "heading3", "chineseAbstractHeading", "chineseAbstractBody",
  "chineseKeywords", "chineseKeywordLabel", "englishAbstractTitle", "englishAbstractMeta",
  "englishAbstractHeading", "englishAbstractBody", "englishKeywords", "englishKeywordLabel",
  "tocTitle", "toc1", "toc2", "toc3", "toc4", "toc5", "endMatterHeading", "referenceEntry", "appendixHeading",
  "appendixEnglish", "appendixTranslation", "appendixCode", "code", "figureCaption", "tableCaption",
];
const ALIGNMENTS = new Set(["left", "center", "right", "both", "distribute"]);
const PAGE_ORIENTATIONS = new Set(["portrait", "landscape"]);
const PAGE_NUMBER_FORMATS = new Set(["preserve", "none", "decimal", "lowerRoman", "upperRoman", "lowerLetter", "upperLetter"]);

function finiteInRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : undefined;
}

function booleanValue(value) {
  return typeof value === "boolean" ? value : undefined;
}

function safeColor(value) {
  const color = String(value || "").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(color) ? color : undefined;
}

function sanitizeStyleRule(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const rule = {};
  if (EAST_ASIA_FONTS.includes(source.eastAsia)) rule.eastAsia = source.eastAsia;
  if (LATIN_FONTS.includes(source.latin)) rule.latin = source.latin;
  const sizePt = finiteInRange(source.sizePt, 5, 72);
  if (sizePt !== undefined) rule.sizePt = sizePt;
  const bold = booleanValue(source.bold);
  if (bold !== undefined) rule.bold = bold;
  const color = safeColor(source.color);
  if (color) rule.color = color;
  if (ALIGNMENTS.has(source.alignment)) rule.alignment = source.alignment;
  if (source.lineSpacing?.mode === "multiple") {
    const value = finiteInRange(source.lineSpacing.value, 0.8, 4);
    if (value !== undefined) rule.lineSpacing = { mode: "multiple", value };
  } else if (source.lineSpacing?.mode === "exact") {
    const value = finiteInRange(source.lineSpacing.value, 8, 72);
    if (value !== undefined) rule.lineSpacing = { mode: "exact", value };
  }
  for (const key of ["firstLineChars", "leftIndentChars", "hangingChars"]) {
    const value = finiteInRange(source[key], 0, 12);
    if (value !== undefined) rule[key] = value;
  }
  for (const key of ["spaceBeforePt", "spaceAfterPt"]) {
    const value = finiteInRange(source[key], 0, 144);
    if (value !== undefined) rule[key] = value;
  }
  for (const key of ["pageBreakBefore", "keepNext", "keepLines", "widowControl"]) {
    const value = booleanValue(source[key]);
    if (value !== undefined) rule[key] = value;
  }
  return rule;
}

function sanitizePageSpecification(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const page = {};
  for (const [key, min, max] of [
    ["widthCm", 10, 60], ["heightCm", 10, 60], ["marginTopCm", 0.5, 10], ["marginBottomCm", 0.5, 10],
    ["marginLeftCm", 0.5, 10], ["marginRightCm", 0.5, 10], ["headerDistanceCm", 0.2, 8], ["footerDistanceCm", 0.2, 8],
  ]) {
    const value = finiteInRange(source[key], min, max);
    if (value !== undefined) page[key] = value;
  }
  if (PAGE_ORIENTATIONS.has(source.orientation)) page.orientation = source.orientation;
  const singleSided = booleanValue(source.singleSided);
  if (singleSided !== undefined) page.singleSided = singleSided;
  return page;
}

function sanitizeHeaderSpecification(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const header = { style: sanitizeStyleRule(source.style) };
  if (["preserve", "text", "remove", "style"].includes(source.mode)) header.mode = source.mode;
  if (typeof source.text === "string") header.text = source.text.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
  const bottomBorder = booleanValue(source.bottomBorder);
  if (bottomBorder !== undefined) header.bottomBorder = bottomBorder;
  if (Array.isArray(source.candidates)) {
    header.candidates = source.candidates.map((value) => String(value).trim().slice(0, 200)).filter(Boolean).slice(0, 10);
  }
  return header;
}

function sanitizePaginationSpecification(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const pagination = {};
  for (const key of ["frontMatterRoman", "bodyArabic", "centered"]) {
    const value = booleanValue(source[key]);
    if (value !== undefined) pagination[key] = value;
  }
  if (PAGE_NUMBER_FORMATS.has(source.frontFormat)) pagination.frontFormat = source.frontFormat;
  if (PAGE_NUMBER_FORMATS.has(source.bodyFormat)) pagination.bodyFormat = source.bodyFormat;
  if (["left", "center", "right"].includes(source.alignment)) pagination.alignment = source.alignment;
  if (EAST_ASIA_FONTS.includes(source.eastAsia)) pagination.eastAsia = source.eastAsia;
  if (LATIN_FONTS.includes(source.latin)) pagination.latin = source.latin;
  for (const [key, min, max] of [["sizePt", 5, 72], ["frontStart", 1, 9999], ["bodyStart", 1, 9999]]) {
    const value = finiteInRange(source[key], min, max);
    if (value !== undefined) pagination[key] = Math.round(value);
  }
  return pagination;
}

function sanitizeStructuredSpecification(input, baseSpecification = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const specification = JSON.parse(JSON.stringify(baseSpecification || {}));
  for (const key of STYLE_ROLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) specification[key] = sanitizeStyleRule(source[key]);
  }
  if (Object.prototype.hasOwnProperty.call(source, "page")) specification.page = sanitizePageSpecification(source.page);
  if (Object.prototype.hasOwnProperty.call(source, "header")) specification.header = sanitizeHeaderSpecification(source.header);
  if (Object.prototype.hasOwnProperty.call(source, "pagination")) specification.pagination = sanitizePaginationSpecification(source.pagination);
  if (Object.prototype.hasOwnProperty.call(source, "figures")) {
    const figures = {};
    const maxWidthCm = finiteInRange(source.figures?.maxWidthCm, 1, 50);
    const maxHeightCm = finiteInRange(source.figures?.maxHeightCm, 1, 50);
    if (maxWidthCm !== undefined) figures.maxWidthCm = maxWidthCm;
    if (maxHeightCm !== undefined) figures.maxHeightCm = maxHeightCm;
    const centered = booleanValue(source.figures?.centered);
    if (centered !== undefined) figures.centered = centered;
    specification.figures = figures;
  }
  if (Object.prototype.hasOwnProperty.call(source, "toc")) {
    const toc = {};
    const levels = finiteInRange(source.toc?.levels, 1, 5);
    if (levels !== undefined) toc.levels = Math.round(levels);
    for (const key of ["excludeFrontMatter", "updateFields"]) {
      const value = booleanValue(source.toc?.[key]);
      if (value !== undefined) toc[key] = value;
    }
    specification.toc = toc;
  }
  return specification;
}

function resolveFormattingSpecification(instructions, structuredSpecification) {
  const detected = parseFormattingInstructions(instructions);
  if (!structuredSpecification || typeof structuredSpecification !== "object") return detected;
  return sanitizeStructuredSpecification(structuredSpecification, detected);
}

function localName(node) {
  return node?.localName || String(node?.nodeName || "").replace(/^.*:/, "");
}

function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1);
}

function directChild(node, name) {
  return elementChildren(node).find((child) => localName(child) === name) || null;
}

function wAttribute(element, name) {
  return element?.getAttributeNS?.(XMLNS_W, name)
    || element?.getAttribute?.(`w:${name}`)
    || element?.getAttribute?.(name)
    || "";
}

function setWAttribute(element, name, value) {
  element.setAttributeNS(XMLNS_W, `w:${name}`, String(value));
}

function setRAttribute(element, name, value) {
  element.setAttributeNS(XMLNS_R, `r:${name}`, String(value));
}

function removeWAttribute(element, name) {
  try { element.removeAttributeNS(XMLNS_W, name); } catch {}
  element.removeAttribute?.(`w:${name}`);
  element.removeAttribute?.(name);
}

function createWordElement(document, name) {
  return document.createElementNS(XMLNS_W, `w:${name}`);
}

function ensureChild(parent, name, first = false) {
  const existing = directChild(parent, name);
  if (existing) return existing;
  const child = createWordElement(parent.ownerDocument || parent, name);
  if (first && parent.firstChild) parent.insertBefore(child, parent.firstChild);
  else parent.appendChild(child);
  return child;
}

function removeDirectChild(parent, name) {
  const child = directChild(parent, name);
  if (child) parent.removeChild(child);
}

function descendants(node, name) {
  const matches = [];
  const visit = (current) => {
    for (const child of elementChildren(current)) {
      if (localName(child) === name) matches.push(child);
      visit(child);
    }
  };
  visit(node);
  return matches;
}

function hasAncestor(node, name) {
  for (let current = node?.parentNode; current; current = current.parentNode) {
    if (localName(current) === name) return true;
  }
  return false;
}

function parseXml(xml, label) {
  const errors = [];
  const document = new DOMParser({ errorHandler: { warning: () => {}, error: (message) => errors.push(message), fatalError: (message) => errors.push(message) } })
    .parseFromString(xml, "application/xml");
  if (!document?.documentElement || errors.length || localName(document.documentElement) === "parsererror") {
    throw new Error(`${label} 不是有效的 Word XML`);
  }
  return document;
}

function normalizeInstructions(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("请先填写论文格式修改说明");
  if (text.length > 20_000) throw new Error("格式说明不能超过 20000 个字符");
  return text;
}

function parseMeasurement(numberText, unitText = "cm") {
  const value = Number(numberText);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(unitText || "cm").toLowerCase();
  if (unit === "mm" || unit.includes("毫米")) return value / 10;
  if (unit === "in" || unit === "inch" || unit.includes("英寸")) return value * 2.54;
  return value;
}

function parseFontSize(text) {
  for (const [label, points] of FONT_SIZE_POINTS) {
    if (text.includes(`${label}字`) || text.includes(`${label}字体`) || text.includes(label)) return points;
  }
  const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?:磅|pt|points?)/i);
  return explicit ? Math.min(72, Math.max(5, Number(explicit[1]))) : undefined;
}

function parseStyleRule(text) {
  const rule = {};
  const eastAsia = EAST_ASIA_FONTS.find((font) => text.includes(font));
  const latin = LATIN_FONTS.find((font) => text.toLowerCase().includes(font.toLowerCase()));
  const sizePt = parseFontSize(text);
  if (eastAsia) rule.eastAsia = eastAsia;
  if (latin) rule.latin = latin;
  if (sizePt) rule.sizePt = sizePt;
  if (/不加粗|取消加粗/.test(text)) rule.bold = false;
  else if (/加粗|粗体/.test(text)) rule.bold = true;
  if (/居中/.test(text)) rule.alignment = "center";
  else if (/两端对齐/.test(text)) rule.alignment = "both";
  else if (/右对齐/.test(text)) rule.alignment = "right";
  else if (/左对齐/.test(text)) rule.alignment = "left";

  let match = text.match(/(\d+(?:\.\d+)?)\s*倍(?:行距)?/);
  if (match) rule.lineSpacing = { mode: "multiple", value: Math.min(4, Math.max(0.8, Number(match[1]))) };
  else if (/双倍行距/.test(text)) rule.lineSpacing = { mode: "multiple", value: 2 };
  else if (/单倍行距/.test(text)) rule.lineSpacing = { mode: "multiple", value: 1 };
  match = text.match(/固定(?:值|行距)?\s*(\d+(?:\.\d+)?)\s*(?:磅|pt)/i);
  if (match) rule.lineSpacing = { mode: "exact", value: Math.min(72, Math.max(8, Number(match[1]))) };

  match = text.match(/首行(?:缩进)?\s*(\d+(?:\.\d+)?)\s*(?:个?字符|字)/);
  if (match) rule.firstLineChars = Math.min(8, Math.max(0, Number(match[1])));
  else if (/首行不缩进|取消首行缩进/.test(text)) rule.firstLineChars = 0;

  match = text.match(/段前\s*(\d+(?:\.\d+)?)\s*(?:磅|pt)/i);
  if (match) rule.spaceBeforePt = Math.min(144, Number(match[1]));
  match = text.match(/段后\s*(\d+(?:\.\d+)?)\s*(?:磅|pt)/i);
  if (match) rule.spaceAfterPt = Math.min(144, Number(match[1]));
  return rule;
}

function mergeRule(target, next) {
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) target[key] = value;
  }
}

function createEmptySpecification() {
  const specification = {
    profile: "custom",
    page: {},
    header: { style: {}, candidates: [] },
    pagination: {},
    figures: {},
    toc: {},
  };
  for (const key of STYLE_ROLE_KEYS) specification[key] = {};
  return specification;
}

function degreeThesisProfile() {
  const body = { eastAsia: "宋体", latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 }, firstLineChars: 2, alignment: "both" };
  const chapter = { eastAsia: "黑体", sizePt: 18, bold: true, alignment: "center", spaceAfterPt: 12, pageBreakBefore: true, keepNext: true, keepLines: true };
  const section = { eastAsia: "黑体", sizePt: 15, bold: true, alignment: "left", keepNext: true, keepLines: true };
  const subsection = { eastAsia: "黑体", sizePt: 12, bold: true, alignment: "left", keepNext: true, keepLines: true };
  const profile = {
    profile: "degree-thesis",
    page: {
      widthCm: 21,
      heightCm: 29.7,
      orientation: "portrait",
      singleSided: true,
      marginTopCm: 3.6,
      marginLeftCm: 3,
      marginRightCm: 2,
      headerDistanceCm: 2.5,
      footerDistanceCm: 1.8,
    },
    body,
    title: {},
    heading1: chapter,
    heading2: section,
    heading3: subsection,
    chineseAbstractHeading: { eastAsia: "黑体", sizePt: 18, bold: true, alignment: "center", keepNext: true },
    chineseAbstractBody: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 }, alignment: "both" },
    chineseKeywords: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 } },
    chineseKeywordLabel: { eastAsia: "黑体", sizePt: 12, bold: true },
    englishAbstractTitle: { latin: "Times New Roman", sizePt: 18, bold: true, alignment: "center", keepNext: true },
    englishAbstractMeta: { latin: "Times New Roman", sizePt: 12, alignment: "center", keepNext: true },
    englishAbstractHeading: { latin: "Times New Roman", sizePt: 18, bold: true, alignment: "center", keepNext: true },
    englishAbstractBody: { latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 }, alignment: "both" },
    englishKeywords: { latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 } },
    englishKeywordLabel: { latin: "Times New Roman", sizePt: 12, bold: true },
    tocTitle: { eastAsia: "黑体", sizePt: 16, bold: true, alignment: "center", keepNext: true },
    toc1: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1.5 } },
    toc2: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1.5 } },
    toc3: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1.5 } },
    toc4: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1.5 } },
    toc5: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1.5 } },
    endMatterHeading: { ...chapter },
    referenceEntry: { ...body, firstLineChars: 0 },
    appendixHeading: { ...chapter },
    appendixEnglish: { latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "both" },
    appendixTranslation: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1 }, alignment: "both" },
    appendixCode: { latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "left" },
    code: { latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "left" },
    figureCaption: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "center", keepNext: true },
    tableCaption: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "center", keepNext: true },
    header: {
      style: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 10.5, lineSpacing: { mode: "multiple", value: 1 }, alignment: "center" },
      bottomBorder: true,
      candidates: [],
    },
    pagination: { frontMatterRoman: true, bodyArabic: true, centered: true, sizePt: 10.5, eastAsia: "宋体" },
    figures: { maxWidthCm: 12, maxHeightCm: 7, centered: true },
    toc: { levels: 3, excludeFrontMatter: true, updateFields: true },
  };
  for (const key of [
    "body", "heading1", "heading2", "heading3", "chineseAbstractHeading", "chineseAbstractBody",
    "chineseKeywords", "chineseKeywordLabel", "englishAbstractTitle", "englishAbstractMeta",
    "englishAbstractHeading", "englishAbstractBody", "englishKeywords", "englishKeywordLabel",
    "tocTitle", "toc1", "toc2", "toc3", "toc4", "toc5", "endMatterHeading", "referenceEntry", "appendixHeading",
    "appendixEnglish", "appendixTranslation", "appendixCode", "code", "figureCaption", "tableCaption",
  ]) profile[key].color = "000000";
  profile.header.style.color = "000000";
  return profile;
}

function hasDegreeThesisRequirements(text) {
  const signals = [
    /中文摘要/, /英文摘要|Abstract/i, /目录按三级|目录.*三级/, /章的标题.*小\s*2|章的标题.*小二/,
    /页码.*罗马数字/, /图号.*章号|图\s*3[.．]5/, /附录[ⅠI].*英文资料翻译/, /代码及注释.*Times New Roman/i,
  ];
  return signals.filter((pattern) => pattern.test(text)).length >= 4;
}

function parseFormattingInstructions(value) {
  const text = normalizeInstructions(value);
  const specification = hasDegreeThesisRequirements(text) ? degreeThesisProfile() : createEmptySpecification();

  if (/\bA4\b/i.test(text)) {
    specification.page.widthCm = 21;
    specification.page.heightCm = 29.7;
  }
  if (/横向/.test(text)) specification.page.orientation = "landscape";
  else if (/纵向/.test(text)) specification.page.orientation = "portrait";
  if (/单面打印/.test(text)) specification.page.singleSided = true;

  const unitPattern = "(\\d+(?:\\.\\d+)?)\\s*(厘米|cm|毫米|mm|英寸|inch|in)?";
  let match = text.match(new RegExp(`页边距[^。；;\\n]{0,12}(?:均为|统一为|为)\\s*${unitPattern}`, "i"));
  if (match) {
    const margin = parseMeasurement(match[1], match[2]);
    if (margin) Object.assign(specification.page, { marginTopCm: margin, marginBottomCm: margin, marginLeftCm: margin, marginRightCm: margin });
  }
  match = text.match(new RegExp(`上下(?:页边距)?\\s*${unitPattern}[^。；;\\n]{0,12}左右(?:页边距)?\\s*${unitPattern}`, "i"));
  if (match) {
    const vertical = parseMeasurement(match[1], match[2]);
    const horizontal = parseMeasurement(match[3], match[4]);
    if (vertical) Object.assign(specification.page, { marginTopCm: vertical, marginBottomCm: vertical });
    if (horizontal) Object.assign(specification.page, { marginLeftCm: horizontal, marginRightCm: horizontal });
  }
  const sidePatterns = [
    ["marginTopCm", "上"], ["marginBottomCm", "下"], ["marginLeftCm", "左"], ["marginRightCm", "右"],
  ];
  for (const [key, label] of sidePatterns) {
    const sideRegex = new RegExp(`${label}(?:边距|页边距)\\s*[:：]?\\s*(?:为)?\\s*${unitPattern}`, "ig");
    const side = Array.from(text.matchAll(sideRegex)).find((candidate) => {
      if (key !== "marginBottomCm") return true;
      const prefix = text.slice(Math.max(0, candidate.index - 12), candidate.index);
      return !/(?:页码|页脚)/.test(prefix);
    });
    if (side) {
      const amount = parseMeasurement(side[1], side[2]);
      if (amount) specification.page[key] = amount;
    }
  }

  const clauses = text.split(/[；;。\n]+/).map((item) => item.trim()).filter(Boolean);
  for (const clause of clauses) {
    let target = "body";
    const roleSignals = [
      /中文摘要.*字样/, /摘要正文/, /关键词.*字样/, /Abstract.*字样|Abstract.*小二/i,
      /英文摘要.*内容|摘要内容.*Times New Roman/i, /Keywords.*字样|关键词.*Times New Roman/i,
    ].filter((pattern) => pattern.test(clause)).length;
    if (specification.profile === "degree-thesis" && roleSignals > 1) continue;
    if (/中文摘要.*字样|“中文摘要”/.test(clause)) target = "chineseAbstractHeading";
    else if (/中文摘要正文|摘要正文/.test(clause) && !/英文摘要|Times New Roman/i.test(clause)) target = "chineseAbstractBody";
    else if (/关键词.*字样/.test(clause) && !/Keywords|Times New Roman/i.test(clause)) target = "chineseKeywordLabel";
    else if (/英文摘要题目/.test(clause)) target = "englishAbstractTitle";
    else if (/作者.*导师.*汉语拼音|author.*tutor/i.test(clause)) target = "englishAbstractMeta";
    else if (/\bAbstract\b.*(?:字样|小二|加粗)/i.test(clause)) target = "englishAbstractHeading";
    else if (/英文摘要(?:内容|正文)|摘要内容.*Times New Roman/i.test(clause)) target = "englishAbstractBody";
    else if (/\bKeywords\b.*字样|关键词.*Times New Roman/i.test(clause)) target = "englishKeywordLabel";
    else if (/“?目录”?二字|目录(?:的)?标题/.test(clause)) target = "tocTitle";
    else if (/目录内容/.test(clause)) target = "toc1";
    else if (/代码及注释|程序代码/.test(clause)) target = /附录/.test(clause) ? "appendixCode" : "code";
    else if (/附录.*英文原文/.test(clause)) target = "appendixEnglish";
    else if (/附录.*中文翻译/.test(clause)) target = "appendixTranslation";
    else if (/图号和说明|图.*说明.*下方/.test(clause)) target = "figureCaption";
    else if (/表号和说明|表.*说明.*上方/.test(clause)) target = "tableCaption";
    else if (/小节标题|三级标题|三[级阶]标题|Heading\s*3/i.test(clause)) target = "heading3";
    else if (/(?:^|[^小])节的标题|二级标题|二[级阶]标题|Heading\s*2/i.test(clause)) target = "heading2";
    else if (/章的标题|一级标题|一[级阶]标题|Heading\s*1/i.test(clause)) target = "heading1";
    else if (/论文标题|文章标题|主标题|题目/.test(clause)) target = "title";
    else if (!/正文|全[部文]文字|段落|字体|行距|缩进|对齐/.test(clause)) continue;
    mergeRule(specification[target], parseStyleRule(clause));
    if (target === "toc1") {
      mergeRule(specification.toc2, parseStyleRule(clause));
      mergeRule(specification.toc3, parseStyleRule(clause));
      mergeRule(specification.toc4, parseStyleRule(clause));
      mergeRule(specification.toc5, parseStyleRule(clause));
    }
  }

  const globalFontClause = clauses.find((clause) => /中文.+英文|中英文字体|全文字体/.test(clause));
  if (globalFontClause) mergeRule(specification.body, parseStyleRule(globalFontClause));

  const headerCandidates = Array.from(text.matchAll(/(?:二本|三本)\s*为\s*[“"]([^”"]+)[”"]/g), (match) => match[1].trim());
  if (headerCandidates.length) specification.header.candidates = [...new Set(headerCandidates)];
  const headerVariant = text.match(/(?:使用|选择|采用)\s*(二本|三本)/);
  if (headerVariant) {
    const selected = text.match(new RegExp(`${headerVariant[1]}\\s*为\\s*[“\"]([^”\"]+)[”\"]`));
    if (selected) specification.header.text = selected[1].trim();
  }
  const explicitHeader = text.match(/页眉(?:的)?文字\s*(?:为|[:：])\s*[“"]([^”"]+)[”"]/);
  if (explicitHeader && !/^(?:二本|三本)为/.test(explicitHeader[1])) specification.header.text = explicitHeader[1].trim();
  const plainHeader = text.match(/页眉文字\s*[:：]\s*([^。；;\n]{4,80})/);
  if (!specification.header.text && plainHeader && !/(?:二本|三本)为/.test(plainHeader[1])) specification.header.text = plainHeader[1].trim();

  if (/页码.*罗马数字|摘要和目录.*罗马数字/.test(text)) specification.pagination.frontMatterRoman = true;
  if (/第一章.*阿拉伯数字|正文.*阿拉伯数字/.test(text)) specification.pagination.bodyArabic = true;
  if (/页码.*下端居中|页码位于下端居中/.test(text)) specification.pagination.centered = true;
  if (/目录按三级|目录.*三级标题/.test(text)) Object.assign(specification.toc, { levels: 3, excludeFrontMatter: true, updateFields: true });
  if (/章独立分页/.test(text)) specification.heading1.pageBreakBefore = true;
  if (/节和小节不能位于一页的最底部/.test(text)) {
    Object.assign(specification.heading2, { keepNext: true, keepLines: true });
    Object.assign(specification.heading3, { keepNext: true, keepLines: true });
  }
  const maxFigure = text.match(/最大图尺寸[^。；;\n]{0,20}?(?:不超过|为)\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(?:厘米|cm)/i);
  if (maxFigure) Object.assign(specification.figures, { maxWidthCm: Number(maxFigure[1]), maxHeightCm: Number(maxFigure[2]), centered: true });

  const styleKeys = ["body", "title", "heading1", "heading2", "heading3", "chineseAbstractHeading", "englishAbstractHeading", "tocTitle", "appendixEnglish", "code"];
  const allRulesEmpty = !Object.keys(specification.page).length && styleKeys.every((key) => !Object.keys(specification[key]).length);
  if (allRulesEmpty) throw new Error("没有识别到可执行的格式要求，请写明页边距、字体、字号、行距、缩进或标题格式");
  return specification;
}

function paragraphText(paragraph) {
  return descendants(paragraph, "t").map((node) => String(node.textContent || "")).join("").trim();
}

function paragraphStyleId(paragraph) {
  const pPr = directChild(paragraph, "pPr");
  return wAttribute(directChild(pPr, "pStyle"), "val");
}

function inferRole(paragraph, text, firstContentParagraph) {
  const style = paragraphStyleId(paragraph).replace(/[\s_-]+/g, "").toLowerCase();
  if (/^(title|标题|论文标题)$/.test(style)) return "title";
  if (/heading3|标题3|三级/.test(style)) return "heading3";
  if (/heading2|标题2|二级/.test(style)) return "heading2";
  if (/heading1|标题1|一级/.test(style)) return "heading1";
  if (/caption|题注|toc|目录|quote|引用/.test(style)) return "preserve";
  if (/^(?:图|表|Figure|Table)\s*[一二三四五六七八九十0-9]+(?:[.．-]\d+)?/i.test(text)) return "preserve";
  if (/^\d+(?:[.．]\d+){2,}(?:\s|\D)/.test(text)) return "heading3";
  if (/^\d+[.．]\d+(?:\s|\D)/.test(text)) return "heading2";
  if (/^(?:第[一二三四五六七八九十百0-9]+章|摘要|摘\s*要|abstract|关键词|参考文献|致谢|附录|结论)$/i.test(text)) return "heading1";
  if (/^\d+(?:[、.．]\s*|\s+)[^\d]/.test(text) && text.length < 80) return "heading1";
  if (firstContentParagraph && text.length >= 4 && text.length <= 120) return "title";
  return "body";
}

function normalizedParagraphText(text) {
  return String(text || "").replace(/[\s　]+/g, " ").trim();
}

function isChineseAbstractHeading(text) {
  return /^(?:中文)?摘\s*要$/.test(normalizedParagraphText(text));
}

function isEnglishAbstractHeading(text) {
  return /^abstract$/i.test(normalizedParagraphText(text));
}

function isTocHeading(text) {
  return /^目\s*录$/.test(normalizedParagraphText(text));
}

function isChapterHeadingText(text) {
  const value = normalizedParagraphText(text);
  return /^(?:第[一二三四五六七八九十百0-9]+章)(?:\s|$)/.test(value)
    || /^\d+(?:[、.．]\s*|\s+)[^\d]/.test(value);
}

function paragraphHeadingStyleLevel(paragraph) {
  const style = paragraphStyleId(paragraph).replace(/[\s_-]+/g, "").toLowerCase();
  if (/toc5/.test(style)) return "toc5";
  if (/toc4/.test(style)) return "toc4";
  if (/toc3/.test(style)) return "toc3";
  if (/toc2/.test(style)) return "toc2";
  if (/toc1/.test(style)) return "toc1";
  if (/heading3|标题3|三级/.test(style)) return "heading3";
  if (/heading2|标题2|二级/.test(style)) return "heading2";
  if (/heading1|标题1|一级/.test(style)) return "heading1";
  return "";
}

function headingLevelFromParagraph(paragraph, text) {
  const styled = paragraphHeadingStyleLevel(paragraph);
  if (styled) return styled;
  if (/^\d+(?:[.．]\d+){2,}(?:\s|\D)/.test(text)) return "heading3";
  if (/^\d+[.．]\d+(?:\s|\D)/.test(text)) return "heading2";
  if (isChapterHeadingText(text)) return "heading1";
  return "";
}

function paragraphHasPageBreak(paragraph) {
  if (descendants(paragraph, "lastRenderedPageBreak").length) return true;
  return descendants(paragraph, "br").some((element) => wAttribute(element, "type") === "page");
}

function isEndMatterHeading(text) {
  return /^(?:结束语|结\s*论|致\s*谢|参考文献)$/.test(normalizedParagraphText(text));
}

function isAppendixHeading(text) {
  return /^附\s*录(?:\s*[ⅠⅡⅢIVX一二三四五六七八九十0-9]+)?(?:\s|$)/i.test(normalizedParagraphText(text));
}

function tocRole(paragraph, text) {
  const styleRole = headingLevelFromParagraph(paragraph, text);
  if (/^toc[1-5]$/.test(styleRole)) return styleRole;
  if (/^\d+(?:[.．]\d+){2,}/.test(text)) return "toc3";
  if (/^\d+[.．]\d+/.test(text)) return "toc2";
  return "toc1";
}

function classifyPaperParagraphs(document) {
  const items = descendants(document.documentElement, "p")
    .filter((paragraph) => !hasAncestor(paragraph, "tc"))
    .map((paragraph) => ({ paragraph, text: normalizedParagraphText(paragraphText(paragraph)) }))
    .filter((item) => item.text || descendants(item.paragraph, "drawing").length);
  const roles = new Map();
  const textItems = items.filter((item) => item.text);
  const indexOf = (predicate) => textItems.findIndex((item) => predicate(item.text, item.paragraph));
  const chineseAbstractIndex = indexOf((text) => isChineseAbstractHeading(text));
  const chineseKeywordsIndex = indexOf((text) => /^关键词\s*[:：]/.test(text));
  const englishAbstractIndex = indexOf((text) => isEnglishAbstractHeading(text));
  const englishKeywordsIndex = indexOf((text) => /^keywords?\s*[:：]/i.test(text));
  const tocIndex = indexOf((text) => isTocHeading(text));

  const chapterCandidates = textItems
    .map((item, index) => ({ item, index, level: headingLevelFromParagraph(item.paragraph, item.text) }))
    .filter(({ item, index, level }) => index > tocIndex && (level === "heading1" || isChapterHeadingText(item.text)));
  let bodyStartIndex = -1;
  if (chapterCandidates.length) {
    if (tocIndex >= 0) {
      const styled = chapterCandidates.find(({ item }) => paragraphHeadingStyleLevel(item.paragraph) === "heading1");
      const duplicate = chapterCandidates.find(({ item }, candidateIndex) => chapterCandidates.slice(0, candidateIndex).some(({ item: previous }) => previous.text === item.text));
      const pageBroken = chapterCandidates.find(({ item }) => paragraphHasPageBreak(item.paragraph));
      bodyStartIndex = (duplicate || styled || pageBroken || chapterCandidates[0]).index;
    } else {
      bodyStartIndex = chapterCandidates[0].index;
    }
  }

  let appendixMode = "";
  let inReferences = false;
  let firstTitleAssigned = false;
  const betweenAbstracts = [];
  const frontBoundary = [chineseAbstractIndex, englishAbstractIndex, tocIndex, bodyStartIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
  for (let index = 0; index < textItems.length; index += 1) {
    const item = textItems[index];
    const { paragraph, text } = item;
    const style = paragraphStyleId(paragraph).replace(/[\s_-]+/g, "").toLowerCase();
    if (index === chineseAbstractIndex) {
      roles.set(paragraph, "chineseAbstractHeading");
      continue;
    }
    if (index === chineseKeywordsIndex) {
      roles.set(paragraph, "chineseKeywords");
      continue;
    }
    if (chineseAbstractIndex >= 0 && index > chineseAbstractIndex && (chineseKeywordsIndex < 0 || index < chineseKeywordsIndex)) {
      roles.set(paragraph, "chineseAbstractBody");
      continue;
    }
    if (chineseKeywordsIndex >= 0 && index > chineseKeywordsIndex && englishAbstractIndex >= 0 && index < englishAbstractIndex) {
      betweenAbstracts.push(item);
      continue;
    }
    if (index === englishAbstractIndex) {
      if (betweenAbstracts.length) {
        betweenAbstracts.forEach((candidate, candidateIndex) => {
          const meta = /(?:author|tutor|supervisor|导师|指导教师)\s*[:：]/i.test(candidate.text) || candidateIndex > 0;
          roles.set(candidate.paragraph, meta ? "englishAbstractMeta" : "englishAbstractTitle");
        });
      }
      roles.set(paragraph, "englishAbstractHeading");
      continue;
    }
    if (index === englishKeywordsIndex) {
      roles.set(paragraph, "englishKeywords");
      continue;
    }
    if (englishAbstractIndex >= 0 && index > englishAbstractIndex && (englishKeywordsIndex < 0 || index < englishKeywordsIndex)) {
      roles.set(paragraph, "englishAbstractBody");
      continue;
    }
    if (index === tocIndex) {
      roles.set(paragraph, "tocTitle");
      continue;
    }
    if (tocIndex >= 0 && index > tocIndex && (bodyStartIndex < 0 || index < bodyStartIndex)) {
      roles.set(paragraph, tocRole(paragraph, text));
      continue;
    }
    if (frontBoundary > 0 && index < frontBoundary) {
      if (!firstTitleAssigned && text.length <= 120) {
        roles.set(paragraph, "title");
        firstTitleAssigned = true;
      } else {
        roles.set(paragraph, "preserve");
      }
      continue;
    }

    if (/^(?:图|Figure)\s*[一二三四五六七八九十0-9]+(?:[.．-]\d+)?/i.test(text)) {
      roles.set(paragraph, "figureCaption");
      continue;
    }
    if (/^(?:表|Table)\s*[一二三四五六七八九十0-9]+(?:[.．-]\d+)?/i.test(text)) {
      roles.set(paragraph, "tableCaption");
      continue;
    }
    if (isAppendixHeading(text)) {
      appendixMode = /(?:Ⅱ|II|二).*?(?:程序|代码)/i.test(text) ? "appendixCode"
        : /(?:Ⅰ|I|一).*?(?:英文|翻译)/i.test(text) ? "appendixEnglish"
          : /(?:Ⅲ|III|三)/i.test(text) ? "body" : appendixMode || "body";
      inReferences = false;
      roles.set(paragraph, "appendixHeading");
      continue;
    }
    if (appendixMode) {
      if (/^(?:中文翻译|译文)$/.test(text)) {
        appendixMode = "appendixTranslation";
        roles.set(paragraph, "heading2");
      } else if (/^(?:英文原文|原文)$/.test(text)) {
        appendixMode = "appendixEnglish";
        roles.set(paragraph, "heading2");
      } else {
        roles.set(paragraph, appendixMode);
      }
      continue;
    }
    if (isEndMatterHeading(text)) {
      inReferences = /^参考文献$/.test(text);
      roles.set(paragraph, "endMatterHeading");
      continue;
    }
    if (inReferences) {
      roles.set(paragraph, "referenceEntry");
      continue;
    }
    if (/code|sourcecode|代码/.test(style)) {
      roles.set(paragraph, "code");
      continue;
    }
    const level = headingLevelFromParagraph(paragraph, text);
    if (level && !level.startsWith("toc")) {
      roles.set(paragraph, level);
      continue;
    }
    if (!firstTitleAssigned && (bodyStartIndex < 0 || index < bodyStartIndex) && text.length <= 120) {
      roles.set(paragraph, "title");
      firstTitleAssigned = true;
      continue;
    }
    roles.set(paragraph, "body");
  }

  for (const item of items) {
    if (!item.text && descendants(item.paragraph, "drawing").length) roles.set(item.paragraph, "figure");
  }
  const counts = {};
  for (const role of roles.values()) counts[role] = (counts[role] || 0) + 1;
  return {
    roles,
    counts,
    markers: {
      chineseAbstract: chineseAbstractIndex >= 0,
      englishAbstract: englishAbstractIndex >= 0,
      toc: tocIndex >= 0,
      bodyStart: bodyStartIndex >= 0 ? textItems[bodyStartIndex]?.paragraph : null,
      frontStart: chineseAbstractIndex >= 0 ? textItems[chineseAbstractIndex]?.paragraph : (tocIndex >= 0 ? textItems[tocIndex]?.paragraph : null),
    },
    items: textItems,
  };
}

function twipsFromCm(value) {
  return Math.round(Number(value) * 567);
}

function twipsFromPt(value) {
  return Math.round(Number(value) * 20);
}

function setFontProperties(rPr, rule) {
  if (rule.eastAsia || rule.latin) {
    const fonts = ensureChild(rPr, "rFonts", true);
    if (rule.latin) {
      setWAttribute(fonts, "ascii", rule.latin);
      setWAttribute(fonts, "hAnsi", rule.latin);
      setWAttribute(fonts, "cs", rule.latin);
    }
    if (rule.eastAsia) setWAttribute(fonts, "eastAsia", rule.eastAsia);
  }
  if (rule.sizePt) {
    const halfPoints = Math.round(rule.sizePt * 2);
    setWAttribute(ensureChild(rPr, "sz"), "val", halfPoints);
    setWAttribute(ensureChild(rPr, "szCs"), "val", halfPoints);
  }
  if (rule.color) {
    const color = ensureChild(rPr, "color");
    setWAttribute(color, "val", String(rule.color).replace(/^#/, ""));
    removeWAttribute(color, "themeColor");
    removeWAttribute(color, "themeTint");
    removeWAttribute(color, "themeShade");
  }
  if (rule.bold === true) {
    setWAttribute(ensureChild(rPr, "b"), "val", "1");
    setWAttribute(ensureChild(rPr, "bCs"), "val", "1");
  } else if (rule.bold === false) {
    removeDirectChild(rPr, "b");
    removeDirectChild(rPr, "bCs");
  }
}

function setParagraphProperties(pPr, rule, role) {
  if (rule.alignment) setWAttribute(ensureChild(pPr, "jc"), "val", rule.alignment);
  const spacingRequested = rule.lineSpacing || rule.spaceBeforePt !== undefined || rule.spaceAfterPt !== undefined;
  if (spacingRequested) {
    const spacing = ensureChild(pPr, "spacing");
    if (rule.spaceBeforePt !== undefined) setWAttribute(spacing, "before", twipsFromPt(rule.spaceBeforePt));
    if (rule.spaceAfterPt !== undefined) setWAttribute(spacing, "after", twipsFromPt(rule.spaceAfterPt));
    if (rule.lineSpacing?.mode === "multiple") {
      setWAttribute(spacing, "line", Math.round(rule.lineSpacing.value * 240));
      setWAttribute(spacing, "lineRule", "auto");
    } else if (rule.lineSpacing?.mode === "exact") {
      setWAttribute(spacing, "line", twipsFromPt(rule.lineSpacing.value));
      setWAttribute(spacing, "lineRule", "exact");
    }
  }
  if (rule.firstLineChars !== undefined || role !== "body") {
    const indent = ensureChild(pPr, "ind");
    if (role !== "body" && rule.firstLineChars === undefined) {
      removeWAttribute(indent, "firstLine");
      removeWAttribute(indent, "firstLineChars");
    } else {
      const chars = Number(rule.firstLineChars || 0);
      setWAttribute(indent, "firstLineChars", Math.round(chars * 100));
      if (rule.sizePt) setWAttribute(indent, "firstLine", Math.round(chars * rule.sizePt * 20));
      else removeWAttribute(indent, "firstLine");
    }
  }
  if (rule.leftIndentChars !== undefined || rule.hangingChars !== undefined) {
    const indent = ensureChild(pPr, "ind");
    if (rule.leftIndentChars !== undefined) setWAttribute(indent, "leftChars", Math.round(Number(rule.leftIndentChars) * 100));
    if (rule.hangingChars !== undefined) setWAttribute(indent, "hangingChars", Math.round(Number(rule.hangingChars) * 100));
  }
  for (const [key, defaultEnabled] of [["pageBreakBefore", false], ["keepNext", false], ["keepLines", false], ["widowControl", true]]) {
    if (rule[key] === true || (rule[key] === undefined && defaultEnabled)) setWAttribute(ensureChild(pPr, key), "val", "1");
    else if (rule[key] === false) removeDirectChild(pPr, key);
  }
}

function applyRuleToParagraph(paragraph, rule, role) {
  if (!Object.keys(rule).length) return;
  const pPr = ensureChild(paragraph, "pPr", true);
  setParagraphProperties(pPr, rule, role);
  for (const run of descendants(paragraph, "r")) {
    setFontProperties(ensureChild(run, "rPr", true), rule);
  }
}

function runText(run) {
  return descendants(run, "t").map((node) => String(node.textContent || "")).join("");
}

function setTextNodeValue(node, value) {
  node.textContent = value;
  if (/^\s|\s$/.test(value)) node.setAttribute("xml:space", "preserve");
  else node.removeAttribute?.("xml:space");
}

function applyPrefixLabelRule(paragraph, prefixPattern, labelRule) {
  const text = paragraphText(paragraph);
  const match = text.match(prefixPattern);
  if (!match || !match[0]) return false;
  let remaining = match[0].length;
  for (const run of descendants(paragraph, "r")) {
    if (remaining <= 0) break;
    const value = runText(run);
    if (!value) continue;
    if (remaining >= value.length) {
      setFontProperties(ensureChild(run, "rPr", true), labelRule);
      remaining -= value.length;
      continue;
    }
    const textNodes = descendants(run, "t");
    if (textNodes.length !== 1 || !run.parentNode) {
      setFontProperties(ensureChild(run, "rPr", true), labelRule);
      remaining = 0;
      continue;
    }
    const clone = run.cloneNode(true);
    const cloneText = descendants(clone, "t")[0];
    setTextNodeValue(textNodes[0], value.slice(0, remaining));
    setTextNodeValue(cloneText, value.slice(remaining));
    setFontProperties(ensureChild(run, "rPr", true), labelRule);
    run.parentNode.insertBefore(clone, run.nextSibling);
    remaining = 0;
  }
  return true;
}

function clampFigureParagraph(paragraph, figures) {
  if (!figures?.maxWidthCm && !figures?.maxHeightCm) return 0;
  const extents = descendants(paragraph, "extent").concat(descendants(paragraph, "ext"))
    .filter((element) => Number(element.getAttribute?.("cx")) > 0 && Number(element.getAttribute?.("cy")) > 0);
  if (!extents.length) return 0;
  const source = extents[0];
  const width = Number(source.getAttribute("cx"));
  const height = Number(source.getAttribute("cy"));
  const maxWidth = figures.maxWidthCm ? figures.maxWidthCm * 360000 : Number.POSITIVE_INFINITY;
  const maxHeight = figures.maxHeightCm ? figures.maxHeightCm * 360000 : Number.POSITIVE_INFINITY;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale < 1) {
    const nextWidth = Math.round(width * scale);
    const nextHeight = Math.round(height * scale);
    for (const extent of extents) {
      extent.setAttribute("cx", String(nextWidth));
      extent.setAttribute("cy", String(nextHeight));
    }
  }
  if (figures.centered) setWAttribute(ensureChild(ensureChild(paragraph, "pPr", true), "jc"), "val", "center");
  return scale < 1 ? 1 : 0;
}

function findStyle(stylesDocument, aliases) {
  const normalizedAliases = aliases.map((alias) => alias.replace(/[\s_-]+/g, "").toLowerCase());
  for (const style of descendants(stylesDocument.documentElement, "style")) {
    const id = wAttribute(style, "styleId").replace(/[\s_-]+/g, "").toLowerCase();
    const name = wAttribute(directChild(style, "name"), "val").replace(/[\s_-]+/g, "").toLowerCase();
    if (normalizedAliases.includes(id) || normalizedAliases.includes(name)) return style;
  }
  return null;
}

function styleIdOf(style) {
  return wAttribute(style, "styleId");
}

function setParagraphStyle(paragraph, style) {
  if (!style) return;
  setWAttribute(ensureChild(ensureChild(paragraph, "pPr", true), "pStyle", true), "val", styleIdOf(style));
}

function ensureOutlineStyle(stylesDocument, id, name, rule, outlineLevel = 0) {
  let style = findStyle(stylesDocument, [id, name]);
  if (!style) {
    style = createWordElement(stylesDocument, "style");
    setWAttribute(style, "type", "paragraph");
    setWAttribute(style, "styleId", id);
    const styleName = ensureChild(style, "name");
    setWAttribute(styleName, "val", name);
    setWAttribute(ensureChild(style, "basedOn"), "val", "Normal");
    setWAttribute(ensureChild(style, "next"), "val", "Normal");
    setWAttribute(ensureChild(style, "uiPriority"), "val", "9");
    ensureChild(style, "qFormat");
    setWAttribute(ensureChild(ensureChild(style, "pPr"), "outlineLvl"), "val", outlineLevel);
    stylesDocument.documentElement.appendChild(style);
  }
  applyRuleToStyle(style, rule, id);
  return style;
}

function ensureParagraphStyle(stylesDocument, id, name, rule) {
  let style = findStyle(stylesDocument, [id, name]);
  if (!style) {
    style = createWordElement(stylesDocument, "style");
    setWAttribute(style, "type", "paragraph");
    setWAttribute(style, "styleId", id);
    setWAttribute(ensureChild(style, "name"), "val", name);
    setWAttribute(ensureChild(style, "basedOn"), "val", "Normal");
    setWAttribute(ensureChild(style, "next"), "val", "Normal");
    setWAttribute(ensureChild(style, "uiPriority"), "val", "39");
    stylesDocument.documentElement.appendChild(style);
  }
  applyRuleToStyle(style, rule, id);
  return style;
}

function applyRuleToStyle(style, rule, role) {
  if (!style || !Object.keys(rule).length) return;
  setFontProperties(ensureChild(style, "rPr"), rule);
  setParagraphProperties(ensureChild(style, "pPr"), rule, role);
}

function applyPageSpecification(document, page) {
  if (!Object.keys(page).length) return 0;
  const sections = descendants(document.documentElement, "sectPr");
  for (const section of sections) {
    if (page.widthCm || page.heightCm || page.orientation) {
      const size = ensureChild(section, "pgSz");
      let width = page.widthCm ? twipsFromCm(page.widthCm) : Number(wAttribute(size, "w")) || 11906;
      let height = page.heightCm ? twipsFromCm(page.heightCm) : Number(wAttribute(size, "h")) || 16838;
      if (page.orientation === "landscape" && width < height) [width, height] = [height, width];
      if (page.orientation === "portrait" && width > height) [width, height] = [height, width];
      setWAttribute(size, "w", width);
      setWAttribute(size, "h", height);
      if (page.orientation === "landscape") setWAttribute(size, "orient", "landscape");
      else if (page.orientation === "portrait") removeWAttribute(size, "orient");
    }
    if (["marginTopCm", "marginBottomCm", "marginLeftCm", "marginRightCm", "headerDistanceCm", "footerDistanceCm"].some((key) => page[key] !== undefined)) {
      const margins = ensureChild(section, "pgMar");
      if (page.marginTopCm !== undefined) setWAttribute(margins, "top", twipsFromCm(page.marginTopCm));
      if (page.marginBottomCm !== undefined) setWAttribute(margins, "bottom", twipsFromCm(page.marginBottomCm));
      if (page.marginLeftCm !== undefined) setWAttribute(margins, "left", twipsFromCm(page.marginLeftCm));
      if (page.marginRightCm !== undefined) setWAttribute(margins, "right", twipsFromCm(page.marginRightCm));
      if (page.headerDistanceCm !== undefined) setWAttribute(margins, "header", twipsFromCm(page.headerDistanceCm));
      if (page.footerDistanceCm !== undefined) setWAttribute(margins, "footer", twipsFromCm(page.footerDistanceCm));
    }
  }
  return sections.length;
}

function describeRule(label, rule) {
  if (!Object.keys(rule).length) return "";
  const parts = [];
  if (rule.eastAsia) parts.push(`中文 ${rule.eastAsia}`);
  if (rule.latin) parts.push(`西文 ${rule.latin}`);
  if (rule.sizePt) parts.push(`${rule.sizePt} 磅`);
  if (rule.bold === true) parts.push("加粗");
  if (rule.bold === false) parts.push("不加粗");
  if (rule.alignment) parts.push(({ center: "居中", both: "两端对齐", left: "左对齐", right: "右对齐" })[rule.alignment]);
  if (rule.lineSpacing?.mode === "multiple") parts.push(`${rule.lineSpacing.value} 倍行距`);
  if (rule.lineSpacing?.mode === "exact") parts.push(`固定 ${rule.lineSpacing.value} 磅行距`);
  if (rule.firstLineChars !== undefined) parts.push(`首行缩进 ${rule.firstLineChars} 字符`);
  if (rule.spaceBeforePt !== undefined) parts.push(`段前 ${rule.spaceBeforePt} 磅`);
  if (rule.spaceAfterPt !== undefined) parts.push(`段后 ${rule.spaceAfterPt} 磅`);
  if (rule.pageBreakBefore) parts.push("独立分页");
  if (rule.keepNext) parts.push("与下段同页");
  return `${label}：${parts.filter(Boolean).join("、")}`;
}

function describePage(page) {
  const parts = [];
  if (page.widthCm && page.heightCm) parts.push(`${page.widthCm} × ${page.heightCm} cm`);
  if (page.orientation) parts.push(page.orientation === "landscape" ? "横向" : "纵向");
  if (page.singleSided) parts.push("单面打印");
  if (page.marginTopCm) parts.push(`上 ${page.marginTopCm} cm`);
  if (page.marginBottomCm) parts.push(`下 ${page.marginBottomCm} cm`);
  if (page.marginLeftCm) parts.push(`左 ${page.marginLeftCm} cm`);
  if (page.marginRightCm) parts.push(`右 ${page.marginRightCm} cm`);
  if (page.headerDistanceCm) parts.push(`页眉距边界 ${page.headerDistanceCm} cm`);
  if (page.footerDistanceCm) parts.push(`页脚距边界 ${page.footerDistanceCm} cm`);
  return parts.length ? `页面：${parts.join("、")}` : "";
}

function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nextPartName(zip, prefix, extension = "xml") {
  let index = 1;
  while (zip.file(`word/${prefix}${index}.${extension}`)) index += 1;
  return `${prefix}${index}.${extension}`;
}

function nextRelationshipId(relationships) {
  const used = new Set(elementChildren(relationships.documentElement).map((element) => element.getAttribute("Id")));
  let index = 1;
  while (used.has(`rId${index}`)) index += 1;
  return `rId${index}`;
}

function addRelationship(loaded, type, target) {
  const id = nextRelationshipId(loaded.relationships);
  const relationship = loaded.relationships.createElementNS(XMLNS_REL, "Relationship");
  relationship.setAttribute("Id", id);
  relationship.setAttribute("Type", `${REL_BASE}${type}`);
  relationship.setAttribute("Target", target);
  loaded.relationships.documentElement.appendChild(relationship);
  return id;
}

function ensureContentTypeOverride(loaded, partName, contentType) {
  const existing = elementChildren(loaded.contentTypes.documentElement)
    .find((element) => localName(element) === "Override" && element.getAttribute("PartName") === partName);
  if (existing) return;
  const override = loaded.contentTypes.createElementNS(XMLNS_CT, "Override");
  override.setAttribute("PartName", partName);
  override.setAttribute("ContentType", contentType);
  loaded.contentTypes.documentElement.appendChild(override);
}

function headerXml(text, style, bottomBorder) {
  const size = Math.round(Number(style.sizePt || 10.5) * 2);
  const eastAsia = escapeXml(style.eastAsia || "宋体");
  const latin = escapeXml(style.latin || "Times New Roman");
  const border = bottomBorder ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="808080"/></w:pBdr>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${XMLNS_W}" xmlns:r="${XMLNS_R}"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="240" w:lineRule="auto"/>${border}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${latin}" w:hAnsi="${latin}" w:eastAsia="${eastAsia}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:hdr>`;
}

function footerXml(pagination) {
  const size = Math.round(Number(pagination.sizePt || 10.5) * 2);
  const eastAsia = escapeXml(pagination.eastAsia || "宋体");
  const latin = escapeXml(pagination.latin || "Times New Roman");
  const alignment = ["left", "center", "right"].includes(pagination.alignment) ? pagination.alignment : (pagination.centered === false ? "right" : "center");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${XMLNS_W}" xmlns:r="${XMLNS_R}"><w:p><w:pPr><w:jc w:val="${alignment}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${latin}" w:hAnsi="${latin}" w:eastAsia="${eastAsia}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:rFonts w:ascii="${latin}" w:hAnsi="${latin}" w:eastAsia="${eastAsia}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
}

function addHeaderPart(loaded, text, header) {
  const part = nextPartName(loaded.zip, "header");
  loaded.zip.file(`word/${part}`, headerXml(text, header.style || {}, header.bottomBorder));
  ensureContentTypeOverride(loaded, `/word/${part}`, "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml");
  return addRelationship(loaded, "header", part);
}

function addFooterPart(loaded, pagination) {
  const part = nextPartName(loaded.zip, "footer");
  loaded.zip.file(`word/${part}`, footerXml(pagination));
  ensureContentTypeOverride(loaded, `/word/${part}`, "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml");
  return addRelationship(loaded, "footer", part);
}

function removeSectionReference(section, name, type = "default") {
  for (const element of elementChildren(section).filter((child) => localName(child) === name && (!type || wAttribute(child, "type") === type))) {
    section.removeChild(element);
  }
}

function setSectionReference(section, name, relationshipId) {
  removeSectionReference(section, name, "default");
  const reference = createWordElement(section.ownerDocument, name);
  setWAttribute(reference, "type", "default");
  setRAttribute(reference, "id", relationshipId);
  section.insertBefore(reference, section.firstChild);
}

function setPageNumberFormat(section, format, start = 1) {
  const numberType = ensureChild(section, "pgNumType");
  setWAttribute(numberType, "fmt", format);
  setWAttribute(numberType, "start", start);
}

function clearPageNumberFormat(section) {
  removeDirectChild(section, "pgNumType");
}

function bodyElement(document) {
  return directChild(document.documentElement, "body");
}

function finalSection(document) {
  const body = bodyElement(document);
  return directChild(body, "sectPr") || descendants(document.documentElement, "sectPr").slice(-1)[0] || null;
}

function insertSectionBreakBefore(paragraph, templateSection) {
  const parent = paragraph?.parentNode;
  if (!parent || localName(parent) !== "body" || !templateSection) return null;
  let previous = paragraph.previousSibling;
  while (previous && previous.nodeType !== 1) previous = previous.previousSibling;
  if (previous && localName(previous) === "p") {
    const existing = directChild(directChild(previous, "pPr"), "sectPr");
    if (existing) return existing;
  }
  const breakParagraph = createWordElement(paragraph.ownerDocument, "p");
  const properties = createWordElement(paragraph.ownerDocument, "pPr");
  const section = templateSection.cloneNode(true);
  setWAttribute(ensureChild(section, "type"), "val", "nextPage");
  properties.appendChild(section);
  breakParagraph.appendChild(properties);
  parent.insertBefore(breakParagraph, paragraph);
  return section;
}

async function styleExistingHeaders(loaded, header) {
  let count = 0;
  for (const [name, entry] of Object.entries(loaded.zip.files)) {
    if (!/^word\/header\d+\.xml$/i.test(name) || entry.dir) continue;
    const document = parseXml(await entry.async("string"), name);
    for (const paragraph of descendants(document.documentElement, "p")) {
      applyRuleToParagraph(paragraph, header.style || {}, "header");
      if (header.bottomBorder) {
        const border = ensureChild(ensureChild(ensureChild(paragraph, "pPr", true), "pBdr"), "bottom");
        setWAttribute(border, "val", "single");
        setWAttribute(border, "sz", "4");
        setWAttribute(border, "space", "1");
        setWAttribute(border, "color", "808080");
      }
    }
    loaded.zip.file(name, new XMLSerializer().serializeToString(document));
    count += 1;
  }
  return count;
}

async function ensureUpdateFields(loaded, specification) {
  const settingsFile = loaded.zip.file("word/settings.xml");
  let settings;
  if (settingsFile) {
    settings = parseXml(await settingsFile.async("string"), "settings.xml");
  } else {
    settings = parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${XMLNS_W}"/>`, "settings.xml");
    ensureContentTypeOverride(loaded, "/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml");
    const hasRelationship = elementChildren(loaded.relationships.documentElement)
      .some((element) => String(element.getAttribute("Type") || "").endsWith("/settings"));
    if (!hasRelationship) addRelationship(loaded, "settings", "settings.xml");
  }
  if (specification?.page?.singleSided) removeDirectChild(settings.documentElement, "mirrorMargins");
  setWAttribute(ensureChild(settings.documentElement, "updateFields"), "val", "true");
  loaded.zip.file("word/settings.xml", new XMLSerializer().serializeToString(settings));
}

async function applySectionsHeadersAndPagination(loaded, specification, classification) {
  const result = { sectionBreaks: 0, headers: 0, footers: 0, unresolvedHeader: false };
  const frontFormat = specification.pagination.frontFormat || (specification.pagination.frontMatterRoman ? "lowerRoman" : "preserve");
  const bodyFormat = specification.pagination.bodyFormat || (specification.pagination.bodyArabic ? "decimal" : "preserve");
  const paginationRequested = !["preserve", "none"].includes(frontFormat) || !["preserve", "none"].includes(bodyFormat)
    || frontFormat === "none" || bodyFormat === "none";
  const headerMode = specification.header.mode || (specification.header.text ? "text" : "style");
  const headerRequested = headerMode === "remove" || specification.header.text || specification.header.candidates?.length || Object.keys(specification.header.style || {}).length;
  if (!paginationRequested && !headerRequested) return result;
  const baseSection = finalSection(loaded.document);
  if (!baseSection) return result;

  let headerRelationshipId = "";
  if (headerMode === "text" && specification.header.text) {
    headerRelationshipId = addHeaderPart(loaded, specification.header.text, specification.header);
    result.headers += 1;
  } else {
    result.headers += await styleExistingHeaders(loaded, specification.header);
    if (specification.header.candidates?.length && result.headers === 0) result.unresolvedHeader = true;
  }
  const footerRelationshipId = paginationRequested ? addFooterPart(loaded, specification.pagination) : "";
  if (footerRelationshipId) result.footers += 1;

  const frontStart = classification.markers.frontStart;
  const bodyStart = classification.markers.bodyStart;
  const coverSection = frontStart ? insertSectionBreakBefore(frontStart, baseSection) : null;
  const frontSection = bodyStart ? insertSectionBreakBefore(bodyStart, baseSection) : null;
  if (coverSection) {
    removeSectionReference(coverSection, "headerReference", null);
    removeSectionReference(coverSection, "footerReference", null);
    clearPageNumberFormat(coverSection);
    result.sectionBreaks += 1;
  }
  if (frontSection) {
    if (headerMode === "remove") removeSectionReference(frontSection, "headerReference", null);
    else if (headerRelationshipId) setSectionReference(frontSection, "headerReference", headerRelationshipId);
    if (frontFormat === "none") {
      removeSectionReference(frontSection, "footerReference", null);
      clearPageNumberFormat(frontSection);
    } else if (frontFormat !== "preserve") {
      if (footerRelationshipId) setSectionReference(frontSection, "footerReference", footerRelationshipId);
      setPageNumberFormat(frontSection, frontFormat, specification.pagination.frontStart || 1);
    }
    result.sectionBreaks += 1;
  }
  if (headerMode === "remove") removeSectionReference(baseSection, "headerReference", null);
  else if (headerRelationshipId) setSectionReference(baseSection, "headerReference", headerRelationshipId);
  if (bodyFormat === "none") {
    removeSectionReference(baseSection, "footerReference", null);
    clearPageNumberFormat(baseSection);
  } else if (bodyFormat !== "preserve") {
    if (footerRelationshipId) setSectionReference(baseSection, "footerReference", footerRelationshipId);
    setPageNumberFormat(baseSection, bodyFormat, specification.pagination.bodyStart || 1);
  }
  await ensureUpdateFields(loaded, specification);
  return result;
}

function applyTocDepth(document, toc) {
  if (!toc?.levels) return 0;
  let updated = 0;
  for (const instruction of descendants(document.documentElement, "instrText")) {
    const value = String(instruction.textContent || "");
    if (!/\bTOC\b/i.test(value)) continue;
    instruction.textContent = /\\o\s+"\d+-\d+"/i.test(value)
      ? value.replace(/\\o\s+"\d+-\d+"/i, `\\o "1-${toc.levels}"`)
      : `${value.trim()} \\o "1-${toc.levels}" `;
    updated += 1;
  }
  return updated;
}

async function loadPaperPackage(buffer) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!input.length || input.length > MAX_DOCX_BYTES) throw new Error("Word 文件为空或超过 200 MB");
  const zip = await JSZip.loadAsync(input);
  const documentFile = zip.file("word/document.xml");
  const stylesFile = zip.file("word/styles.xml");
  const contentTypesFile = zip.file("[Content_Types].xml");
  const relationshipsFile = zip.file("word/_rels/document.xml.rels");
  if (!documentFile || !stylesFile || !contentTypesFile || !relationshipsFile) throw new Error("文件不是有效的 DOCX 文档");
  const [documentXml, stylesXml, contentTypesXml, relationshipsXml] = await Promise.all([
    documentFile.async("string"), stylesFile.async("string"), contentTypesFile.async("string"), relationshipsFile.async("string"),
  ]);
  return {
    zip,
    document: parseXml(documentXml, "document.xml"),
    styles: parseXml(stylesXml, "styles.xml"),
    contentTypes: parseXml(contentTypesXml, "[Content_Types].xml"),
    relationships: parseXml(relationshipsXml, "document.xml.rels"),
  };
}

function inspectDocuments(document, zip) {
  const paragraphs = descendants(document.documentElement, "p");
  const nonEmpty = paragraphs.filter((paragraph) => paragraphText(paragraph));
  return {
    paragraphs: nonEmpty.length,
    tables: descendants(document.documentElement, "tbl").length,
    images: Object.keys(zip.files).filter((name) => /^word\/media\//.test(name) && !zip.files[name].dir).length,
    formulas: descendants(document.documentElement, "oMath").length,
    sections: descendants(document.documentElement, "sectPr").length,
  };
}

async function inspectPaperDocx(buffer) {
  const loaded = await loadPaperPackage(buffer);
  return inspectDocuments(loaded.document, loaded.zip);
}

function keywordCount(text, prefixPattern) {
  const value = normalizedParagraphText(text).replace(prefixPattern, "").trim();
  if (!value) return 0;
  return value.split(/[;；]/).map((item) => item.trim()).filter(Boolean).length;
}

function elementSibling(node, direction) {
  let sibling = direction === "previous" ? node?.previousSibling : node?.nextSibling;
  while (sibling && sibling.nodeType !== 1) sibling = direction === "previous" ? sibling.previousSibling : sibling.nextSibling;
  return sibling || null;
}

function auditStructuredPaper(classification, specification) {
  const warnings = [];
  const checks = [];
  const roleTexts = (role) => classification.items.filter((item) => classification.roles.get(item.paragraph) === role).map((item) => item.text);
  const recognized = [
    [classification.markers.chineseAbstract, "中文摘要"],
    [classification.markers.englishAbstract, "英文摘要"],
    [classification.markers.toc, "目录"],
    [classification.markers.bodyStart, "正文起始章"],
    [classification.counts.endMatterHeading, "结束语／致谢／参考文献"],
    [classification.counts.appendixHeading, "附录"],
  ].filter(([present]) => Boolean(present)).map(([, label]) => label);
  if (recognized.length) checks.push(`已识别论文结构：${recognized.join("、")}`);
  if (specification.profile === "degree-thesis") {
    if (!classification.markers.chineseAbstract) warnings.push("未识别到“中文摘要”标题，中文摘要专用格式不会生效。");
    if (!classification.markers.englishAbstract) warnings.push("未识别到“Abstract”标题，英文摘要专用格式不会生效。");
    if (!classification.markers.toc) warnings.push("未识别到“目录”标题，目录专用格式不会生效。");
    if (!classification.markers.bodyStart) warnings.push("未识别到第一章正文标题，无法可靠划分罗马页码与阿拉伯页码。");
  }

  const chineseAbstract = roleTexts("chineseAbstractBody").join("").replace(/\s/g, "");
  if (chineseAbstract) {
    checks.push(`中文摘要正文约 ${chineseAbstract.length} 字`);
    if (chineseAbstract.length < 240 || chineseAbstract.length > 450) warnings.push(`中文摘要当前约 ${chineseAbstract.length} 字，与“约 300 字”的要求差距较大，请人工确认内容。`);
  }
  const chineseKeywords = roleTexts("chineseKeywords")[0];
  if (chineseKeywords) {
    const count = keywordCount(chineseKeywords, /^关键词\s*[:：]/);
    checks.push(`中文关键词 ${count} 个`);
    if (count < 3 || count > 5) warnings.push(`中文关键词识别为 ${count} 个，规范要求 3～5 个并使用分号分隔。`);
    if (/关键词\s*[:：][^;；]+[,，、]/.test(chineseKeywords)) warnings.push("中文关键词疑似使用逗号或顿号分隔，请改为分号（;）。");
  }
  const englishKeywords = roleTexts("englishKeywords")[0];
  if (englishKeywords) {
    const count = keywordCount(englishKeywords, /^keywords?\s*[:：]/i);
    checks.push(`英文关键词 ${count} 个`);
    if (count < 3 || count > 5) warnings.push(`英文关键词识别为 ${count} 个，规范要求 3～5 个并使用英文分号（;）分隔。`);
  }

  const references = roleTexts("referenceEntry").filter((text) => /^[［\[]\d+[］\]]/.test(text));
  if (references.length) {
    const journal = /^[［\[]\d+[］\]].+\..+\..+\.?\s*\d{4}\s*[,，].+\(.+\)\s*[:：]\s*\d+/;
    const book = /^[［\[]\d+[］\]].+\..+\..+\s*[:：]\s*.+[,，]\s*\d{4}/;
    const unmatched = references.filter((text) => !journal.test(text) && !book.test(text));
    checks.push(`参考文献条目 ${references.length} 条`);
    if (unmatched.length) warnings.push(`有 ${unmatched.length} 条参考文献未匹配“期刊”或“图书”示例格式，请检查作者、题名、年份、卷期或出版地。`);
  }
  const tocTexts = ["toc1", "toc2", "toc3", "toc4", "toc5"].flatMap((role) => roleTexts(role));
  if (tocTexts.some((text) => /(?:中文摘要|英文摘要|Abstract)/i.test(text))) warnings.push("目录中检测到中英文摘要条目；当前规范要求目录不包含摘要和任务书。");
  if (classification.markers.toc) {
    const requiredEndings = roleTexts("endMatterHeading").filter((text) => /^(?:结束语|结\s*论|致\s*谢|参考文献)$/.test(text));
    const missing = requiredEndings.filter((heading) => !tocTexts.some((entry) => entry.includes(heading.replace(/\s/g, "")) || entry.replace(/\s/g, "").includes(heading.replace(/\s/g, ""))));
    if (missing.length) warnings.push(`目录可能缺少：${missing.join("、")}。请更新目录字段后再次核对。`);
  }
  const misplacedFigures = classification.items.filter((item) => classification.roles.get(item.paragraph) === "figureCaption")
    .filter((item) => !descendants(elementSibling(item.paragraph, "previous"), "drawing").length).length;
  const misplacedTables = classification.items.filter((item) => classification.roles.get(item.paragraph) === "tableCaption")
    .filter((item) => localName(elementSibling(item.paragraph, "next")) !== "tbl").length;
  if (misplacedFigures) warnings.push(`有 ${misplacedFigures} 个图题未紧跟在图片下方，软件保留原位置并仅应用题注格式。`);
  if (misplacedTables) warnings.push(`有 ${misplacedTables} 个表题未紧邻表格上方，软件保留原位置并仅应用题注格式。`);
  if (specification.header.candidates?.length > 1 && !specification.header.text) {
    warnings.push(`页眉要求包含多个备选文字（${specification.header.candidates.join(" / ")}），请在格式说明末尾补充“使用二本”或直接写“页眉文字：……”。`);
  }
  if (classification.markers.englishAbstract && classification.markers.chineseAbstract) {
    warnings.push("中英文摘要内容一致性属于语义检查，本地排版不会自动改写摘要，请在提交前人工核对。");
  }
  if (classification.counts.appendixEnglish) warnings.push("英文原文 5～8 页需要在最终 Word 分页后确认；软件已应用字体与行距，但不会删减原文。");
  return { warnings, checks };
}

function advancedRuleDescriptions(specification) {
  if (specification.profile !== "degree-thesis") return [];
  return [
    describeRule("中文摘要标题", specification.chineseAbstractHeading),
    describeRule("中文摘要正文", specification.chineseAbstractBody),
    `${describeRule("中文关键词", specification.chineseKeywords)}；“关键词”标签单独加粗黑体`,
    describeRule("Abstract 标题", specification.englishAbstractHeading),
    describeRule("英文摘要正文", specification.englishAbstractBody),
    `${describeRule("英文关键词", specification.englishKeywords)}；“Keywords”标签单独加粗`,
    describeRule("目录标题", specification.tocTitle),
    describeRule("目录正文", specification.toc1),
    describeRule("参考文献条目", specification.referenceEntry),
    describeRule("附录英文原文", specification.appendixEnglish),
    describeRule("附录中文翻译", specification.appendixTranslation),
    describeRule("程序代码", specification.appendixCode),
    describeRule("图表题注", specification.figureCaption),
    specification.pagination.frontMatterRoman ? "页码：摘要和目录使用小写罗马数字，正文第一章起使用阿拉伯数字并重新从 1 编排" : "",
    specification.figures.maxWidthCm ? `图片：居中，最大 ${specification.figures.maxWidthCm} × ${specification.figures.maxHeightCm} cm` : "",
    specification.header.text ? `页眉：${specification.header.text}` : (specification.header.candidates?.length ? "页眉：检测到备选文字，等待你指定版本" : ""),
  ].filter(Boolean);
}

async function analyzePaperFormatting(buffer, instructions, structuredSpecification) {
  const loaded = await loadPaperPackage(buffer);
  const specification = resolveFormattingSpecification(instructions, structuredSpecification);
  const structure = inspectDocuments(loaded.document, loaded.zip);
  const classification = classifyPaperParagraphs(loaded.document);
  const audit = auditStructuredPaper(classification, specification);
  const rules = [
    describePage(specification.page),
    describeRule("正文", specification.body),
    describeRule("论文标题", specification.title),
    describeRule("一级标题", specification.heading1),
    describeRule("二级标题", specification.heading2),
    describeRule("三级标题", specification.heading3),
    ...advancedRuleDescriptions(specification),
  ].filter(Boolean);
  return {
    specification,
    structure,
    rules,
    checks: audit.checks,
    semanticSections: classification.counts,
    warnings: [
      "输出会另存为新 DOCX，不覆盖原论文。",
      "图片、表格、公式、批注和引用关系将保留在原 Word 包中。",
      "目录与交叉引用字段可能需要在 Word 中按 Ctrl+A、F9 刷新页码。",
      ...audit.warnings,
    ],
  };
}

async function formatPaperDocx(buffer, instructions, structuredSpecification) {
  const loaded = await loadPaperPackage(buffer);
  const report = await analyzePaperFormatting(buffer, instructions, structuredSpecification);
  const specification = report.specification;
  const classification = classifyPaperParagraphs(loaded.document);

  const sectionResult = await applySectionsHeadersAndPagination(loaded, specification, classification);
  const tocFieldsUpdated = applyTocDepth(loaded.document, specification.toc);

  applyPageSpecification(loaded.document, specification.page);
  const normalStyle = findStyle(loaded.styles, ["Normal", "正文"]);
  const titleStyle = findStyle(loaded.styles, ["Title", "标题", "论文标题"]);
  const heading1Style = findStyle(loaded.styles, ["Heading1", "Heading 1", "标题1", "一级标题"]);
  const heading2Style = findStyle(loaded.styles, ["Heading2", "Heading 2", "标题2", "二级标题"]);
  const heading3Style = findStyle(loaded.styles, ["Heading3", "Heading 3", "标题3", "三级标题"]);
  applyRuleToStyle(normalStyle, specification.body, "body");
  applyRuleToStyle(titleStyle, specification.title, "title");
  applyRuleToStyle(heading1Style, specification.heading1, "heading1");
  applyRuleToStyle(heading2Style, specification.heading2, "heading2");
  applyRuleToStyle(heading3Style, specification.heading3, "heading3");
  const tocStyles = {};
  for (let level = 1; level <= 5; level += 1) {
    const role = `toc${level}`;
    tocStyles[role] = ensureParagraphStyle(loaded.styles, `TOC${level}`, `toc ${level}`, specification[role] || {});
  }
  const endMatterStyle = Object.keys(specification.endMatterHeading || {}).length
    ? ensureOutlineStyle(loaded.styles, "PaperLoomEndMatter", "PaperLoom End Matter", specification.endMatterHeading, 0) : null;
  const appendixStyle = Object.keys(specification.appendixHeading || {}).length
    ? ensureOutlineStyle(loaded.styles, "PaperLoomAppendix", "PaperLoom Appendix", specification.appendixHeading, 0) : null;

  const roleCounts = { title: 0, heading1: 0, heading2: 0, heading3: 0, body: 0 };
  let resizedFigures = 0;
  for (const [paragraph, role] of classification.roles.entries()) {
    if (role === "preserve") continue;
    if (role === "figure") {
      resizedFigures += clampFigureParagraph(paragraph, specification.figures);
      continue;
    }
    const text = paragraphText(paragraph);
    if (!text || descendants(paragraph, "oMath").length) continue;
    const rule = specification[role] || specification.body;
    if (!rule || !Object.keys(rule).length) continue;
    applyRuleToParagraph(paragraph, rule, role);
    if (role === "heading1") setParagraphStyle(paragraph, heading1Style);
    else if (role === "heading2") setParagraphStyle(paragraph, heading2Style);
    else if (role === "heading3") setParagraphStyle(paragraph, heading3Style);
    else if (role === "endMatterHeading") setParagraphStyle(paragraph, endMatterStyle);
    else if (role === "appendixHeading") setParagraphStyle(paragraph, appendixStyle);
    else if (/^toc[1-5]$/.test(role)) setParagraphStyle(paragraph, tocStyles[role]);
    if (role === "chineseKeywords") applyPrefixLabelRule(paragraph, /^\s*关键词\s*[:：]/, specification.chineseKeywordLabel);
    if (role === "englishKeywords") applyPrefixLabelRule(paragraph, /^\s*keywords?\s*[:：]/i, specification.englishKeywordLabel);
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }

  loaded.zip.file("word/document.xml", new XMLSerializer().serializeToString(loaded.document));
  loaded.zip.file("word/styles.xml", new XMLSerializer().serializeToString(loaded.styles));
  loaded.zip.file("word/_rels/document.xml.rels", new XMLSerializer().serializeToString(loaded.relationships));
  loaded.zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(loaded.contentTypes));
  const output = await loaded.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    buffer: output,
    report: {
      ...report,
      applied: { ...roleCounts, resizedFigures, tocFieldsUpdated, ...sectionResult },
    },
  };
}

function formattedPaperName(fileName) {
  const parsed = path.parse(String(fileName || "论文.docx"));
  const base = parsed.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 100) || "论文";
  return `${base}-已排版.docx`;
}

function createPaperFormatConfiguration({ name, instructions, specification }) {
  const normalizedInstructions = normalizeInstructions(instructions);
  const safeSpecification = sanitizeStructuredSpecification(specification, createEmptySpecification());
  const safeName = String(name || "论文格式配置").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) || "论文格式配置";
  return {
    kind: FORMAT_CONFIG_KIND,
    schemaVersion: FORMAT_CONFIG_VERSION,
    name: safeName,
    exportedAt: new Date().toISOString(),
    instructions: normalizedInstructions,
    specification: safeSpecification,
  };
}

function parsePaperFormatConfiguration(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
  if (!text.trim() || Buffer.byteLength(text, "utf8") > MAX_FORMAT_CONFIG_BYTES) throw new Error("格式配置文件为空或超过 2 MB");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("格式配置文件不是有效的 PaperLoom 配置");
  }
  if (parsed?.kind !== FORMAT_CONFIG_KIND || parsed?.schemaVersion !== FORMAT_CONFIG_VERSION) {
    throw new Error("格式配置版本不受支持，请使用 PaperLoom 导出的 .plformat 文件");
  }
  const instructions = normalizeInstructions(parsed.instructions);
  if (!parsed.specification || typeof parsed.specification !== "object" || Array.isArray(parsed.specification)) {
    throw new Error("格式配置中缺少可用的论文格式设置");
  }
  return {
    kind: FORMAT_CONFIG_KIND,
    schemaVersion: FORMAT_CONFIG_VERSION,
    name: String(parsed.name || "论文格式配置").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) || "论文格式配置",
    instructions,
    specification: sanitizeStructuredSpecification(parsed.specification, createEmptySpecification()),
  };
}

module.exports = {
  MAX_DOCX_BYTES,
  MAX_FORMAT_CONFIG_BYTES,
  analyzePaperFormatting,
  createPaperFormatConfiguration,
  formatPaperDocx,
  formattedPaperName,
  inspectPaperDocx,
  parseFormattingInstructions,
  parsePaperFormatConfiguration,
  resolveFormattingSpecification,
  sanitizeStructuredSpecification,
};
