const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.resolve(
  process.argv[2] || path.join(".performance-fixture", "PaperLoom-long-120.pdf"),
);
const pageCount = Math.max(1, Number(process.argv[3]) || 120);
const objects = [];
const pageObjectIds = [];
const fontObjectId = 3 + pageCount * 2;

objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
  const pageObjectId = 3 + (pageNumber - 1) * 2;
  const contentObjectId = pageObjectId + 1;
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 720 Td",
    `(PaperLoom long PDF performance test - page ${pageNumber}) Tj`,
    "0 -36 Td",
    "/F1 11 Tf",
    `(Only nearby pages should mount a canvas and text layer.) Tj`,
    "ET",
  ].join("\n");

  pageObjectIds.push(pageObjectId);
  objects[pageObjectId] = [
    "<< /Type /Page",
    "/Parent 2 0 R",
    "/MediaBox [0 0 612 792]",
    `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >>`,
    `/Contents ${contentObjectId} 0 R`,
    ">>",
  ].join(" ");
  objects[contentObjectId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
}

objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

let pdf = "%PDF-1.4\n% PaperLoom performance fixture\n";
const offsets = new Array(objects.length).fill(0);
for (let objectId = 1; objectId < objects.length; objectId += 1) {
  offsets[objectId] = Buffer.byteLength(pdf);
  pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length}\n`;
pdf += "0000000000 65535 f \n";
for (let objectId = 1; objectId < objects.length; objectId += 1) {
  pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, pdf);
console.log(`${outputPath} (${pageCount} pages, ${Buffer.byteLength(pdf)} bytes)`);
