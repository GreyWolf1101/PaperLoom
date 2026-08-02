const JSZip = require("jszip");
const katex = require("katex");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

const XMLNS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS_M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const XMLNS_MATHML = "http://www.w3.org/1998/Math/MathML";
const NARY_SYMBOLS = new Set(["∑", "∏", "∐", "∫", "∬", "∭", "∮", "∯", "∰", "⋂", "⋃"]);
const OPERAND_BOUNDARIES = new Set([
  "+", "−", "-", "±", "∓", "=", "≠", "≈", "≃", "≅", "<", ">", "≤", "≥",
  "∝", "∈", "∉", "⊂", "⊃", "⊆", "⊇", "⇒", "⇔", ",", ";",
]);

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeLatex(value) {
  const latex = String(value || "").trim();
  if (!latex || latex.length > 20_000) throw new Error("The formula is empty or too long");
  return latex;
}

function latexToMathML(value) {
  const latex = normalizeLatex(value);
  const rendered = katex.renderToString(latex, {
    displayMode: true,
    output: "mathml",
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
  const start = rendered.indexOf("<math");
  const end = rendered.indexOf("</math>");
  if (start < 0 || end < start) throw new Error("The formula could not be converted to MathML");
  return rendered
    .slice(start, end + 7)
    .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, "");
}

function localName(node) {
  return node?.localName || String(node?.nodeName || "").replace(/^.*:/, "");
}

function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1);
}

function isNaryScript(element) {
  if (!element || !["munderover", "munder", "msubsup", "msub"].includes(localName(element))) return false;
  const base = elementChildren(element)[0];
  return Boolean(base && NARY_SYMBOLS.has(String(base.textContent || "").trim()));
}

function isOperandBoundary(element) {
  return localName(element) === "mo" && OPERAND_BOUNDARIES.has(String(element.textContent || "").trim());
}

function delimiterDelta(element) {
  if (localName(element) !== "mo") return 0;
  const token = String(element.textContent || "").trim();
  if (["(", "[", "{", "⌈", "⌊"].includes(token)) return 1;
  if ([")", "]", "}", "⌉", "⌋"].includes(token)) return -1;
  return 0;
}

/**
 * OMML n-ary operators own their operand inside <m:e>. MathML represents the
 * same expression as adjacent siblings, so the converter cannot infer where a
 * sum/product/integral ends. Group the multiplicative operand before conversion.
 * Processing right-to-left correctly nests consecutive operators such as
 * \sum_m \sum_n X_{mn}, while leaving a following top-level "+ b" outside.
 */
function groupNaryOperands(element, document) {
  for (const child of elementChildren(element)) groupNaryOperands(child, document);

  let children = elementChildren(element);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    if (!isNaryScript(children[index]) || index + 1 >= children.length) continue;

    let end = index + 1;
    let hasOperand = false;
    let delimiterDepth = 0;
    while (end < children.length) {
      const candidate = children[end];
      const boundaryAtTopLevel = delimiterDepth === 0 && isOperandBoundary(candidate);
      if (boundaryAtTopLevel && hasOperand) break;
      if (boundaryAtTopLevel && !hasOperand && !["+", "−", "-", "±", "∓"].includes(String(candidate.textContent || "").trim())) break;
      hasOperand = true;
      delimiterDepth = Math.max(0, delimiterDepth + delimiterDelta(candidate));
      end += 1;
    }
    if (!hasOperand) continue;

    const operand = document.createElementNS(XMLNS_MATHML, "mrow");
    const firstOperandNode = children[index + 1];
    element.insertBefore(operand, firstOperandNode);
    for (const child of children.slice(index + 1, end)) operand.appendChild(child);
    children = elementChildren(element);
  }
}

function prepareMathMLForWord(mathml) {
  const errors = [];
  const document = new DOMParser({
    onError: (level, message) => errors.push(`${level}: ${message}`),
  }).parseFromString(mathml, "application/xml");
  const root = document.documentElement;
  if (!root || localName(root) === "parsererror" || errors.some((entry) => entry.startsWith("error") || entry.startsWith("fatalError"))) {
    throw new Error("The formula MathML could not be parsed");
  }
  groupNaryOperands(root, document);
  return new XMLSerializer().serializeToString(root);
}

async function latexToOmml(value) {
  const mathml = latexToMathML(value);
  const wordMathml = prepareMathMLForWord(mathml);
  const { mml2omml } = await import("mathml2omml");
  return { mathml, wordMathml, omml: mml2omml(wordMathml) };
}

function buildDocumentXml(omml, equationNumber = "") {
  const number = String(equationNumber || "").trim().slice(0, 80);
  const numberCell = number
    ? `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(number)}</w:t></w:r>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${XMLNS_W}" xmlns:m="${XMLNS_M}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>
      <w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="6626"/><w:gridCol w:w="1200"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="6626" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${omml}</w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr>${numberCell}</w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:before="160"/></w:pPr></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

async function createEquationDocx({ latex, equationNumber = "" }) {
  const { mathml, omml } = await latexToOmml(latex);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder("word").file("document.xml", buildDocumentXml(omml, equationNumber));
  zip.folder("docProps").file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PaperLoom Formula</dc:title><dc:creator>PaperLoom</dc:creator><cp:lastModifiedBy>PaperLoom</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.folder("docProps").file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PaperLoom</Application><AppVersion>1.0</AppVersion></Properties>`);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, mathml, omml };
}

module.exports = {
  buildDocumentXml,
  createEquationDocx,
  latexToMathML,
  latexToOmml,
  prepareMathMLForWord,
};
