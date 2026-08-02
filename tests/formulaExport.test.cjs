const assert = require("node:assert/strict");
const test = require("node:test");
const { DOMParser } = require("@xmldom/xmldom");
const JSZip = require("jszip");
const { createEquationDocx, latexToMathML, latexToOmml } = require("../electron/formula-export.cjs");

test("converts complex LaTeX into MathML and editable Word OMML", async () => {
  const latex = "Y(i,j)=\\sum_{m=0}^{k-1}\\sum_{n=0}^{k-1}X(i+m,j+n)W(m,n)+b";
  const mathml = latexToMathML(latex);
  assert.match(mathml, /<munderover>/);
  const converted = await latexToOmml(latex);
  assert.match(converted.omml, /<m:nary>/);
  assert.match(converted.omml, /<m:oMath/);

  const document = new DOMParser().parseFromString(converted.omml, "application/xml");
  const naries = Array.from(document.getElementsByTagName("m:nary"));
  assert.equal(naries.length, 2);
  for (const nary of naries) {
    const operand = Array.from(nary.childNodes).find((child) => child.nodeName === "m:e");
    assert.ok(operand, "every n-ary operator must own an operand");
    assert.ok(Array.from(operand.childNodes).some((child) => child.nodeType === 1), "n-ary operands must not be Word placeholder boxes");
  }
  assert.equal(naries[0].getElementsByTagName("m:nary").length, 1, "consecutive sums must be nested");
  assert.match(naries[1].textContent, /X\(i\+m,j\+n\)W\(m,n\)/);
  assert.match(document.documentElement.textContent, /\+b$/);

  const nakedText = [];
  const visit = (node) => {
    for (const child of Array.from(node.childNodes || [])) {
      if (child.nodeType === 3 && child.data.trim() && node.nodeName !== "m:t") nakedText.push(child.data);
      if (child.nodeType === 1) visit(child);
    }
  };
  visit(document.documentElement);
  assert.deepEqual(nakedText, [], "OMML text must be contained in editable math runs");
});

test("keeps integral operands separate from following addition", async () => {
  const converted = await latexToOmml("A=\\int_0^1 x^2\\,dx+c");
  const document = new DOMParser().parseFromString(converted.omml, "application/xml");
  const integral = document.getElementsByTagName("m:nary")[0];
  const operand = Array.from(integral.childNodes).find((child) => child.nodeName === "m:e");
  assert.match(operand.textContent, /x2dx/);
  assert.doesNotMatch(operand.textContent, /\+c/);
  assert.match(document.documentElement.textContent, /\+c$/);
});

test("builds a valid DOCX package with an editable equation and number", async () => {
  const { buffer } = await createEquationDocx({ latex: "\\frac{a}{b}+\\sqrt{x}", equationNumber: "(2-1)" });
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file("[Content_Types].xml"));
  assert.ok(zip.file("word/document.xml"));
  const documentXml = await zip.file("word/document.xml").async("string");
  assert.match(documentXml, /<m:f>/);
  assert.match(documentXml, /<m:rad>/);
  assert.match(documentXml, /\(2-1\)/);
});

test("exports editable matrices and scripted entries", async () => {
  const { buffer } = await createEquationDocx({
    latex: "A_{ij}=\\begin{bmatrix}x_1 & \\frac{a}{b} \\\\ \\sqrt{y} & z^2\\end{bmatrix}",
    equationNumber: "(3-2)",
  });
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");
  assert.match(documentXml, /<m:m>/);
  assert.match(documentXml, /<m:sSub>/);
  assert.match(documentXml, /<m:sSup>/);
  assert.match(documentXml, /<m:f>/);
  assert.match(documentXml, /<m:rad>/);
});
