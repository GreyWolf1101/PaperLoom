const assert = require("node:assert/strict");
const test = require("node:test");
const JSZip = require("jszip");
const { DOMParser } = require("@xmldom/xmldom");
const {
  analyzePaperFormatting,
  createPaperFormatConfiguration,
  formatPaperDocx,
  formattedPaperName,
  inspectPaperDocx,
  parseFormattingInstructions,
  parsePaperFormatConfiguration,
  sanitizeStructuredSpecification,
} = require("../electron/paper-format.cjs");

const INSTRUCTIONS = "A4 纵向；页边距上下 2.54 厘米、左右 3 厘米；正文中文宋体、英文 Times New Roman、小四号，1.5 倍行距，首行缩进 2 字符，两端对齐；论文标题小二号黑体加粗居中；一级标题三号黑体加粗；二级标题四号黑体加粗；三级标题小四号楷体加粗。";
const ADVANCED_INSTRUCTIONS = "中文摘要包括中文摘要字样、摘要正文和关键词。英文摘要使用 Abstract 和 Keywords。目录按三级标题，目录内容五号宋体、1.5倍行距。正文小四宋体、1.5倍行距。章的标题用小二黑体加粗居中，章独立分页；节的标题用小三黑体加粗；小节标题用小四黑体加粗，节和小节不能位于一页的最底部。A4纵向，上边距36mm，左边距30mm，右边距20mm。使用二本页眉，二本为“太原科技大学学士学位论文”，三本为“太原科技大学华科学院学士学位论文”。摘要和目录页码用罗马数字，第一章起用阿拉伯数字，页码位于下端居中。最大图尺寸不超过12×7cm。图号和说明在图的下方居中，表号和说明在表的上方居中。附录Ⅰ英文资料翻译，英文原文五号Times New Roman单倍行距；附录中文翻译小四宋体单倍行距；附录Ⅱ程序代码及注释五号Times New Roman单倍行距。";

function elements(node, name) {
  const result = [];
  const visit = (current) => {
    for (const child of Array.from(current?.childNodes || [])) {
      if (child.nodeType !== 1) continue;
      if ((child.localName || child.nodeName.replace(/^.*:/, "")) === name) result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

function attr(element, name) {
  return element?.getAttribute(`w:${name}`) || element?.getAttribute(name) || "";
}

async function createFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
    </Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr/><w:rPr/></w:style>
    </w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        <w:p><w:r><w:t>医学图像分析研究</w:t></w:r></w:p>
        <w:p><w:r><w:t>1 引言</w:t></w:r></w:p>
        <w:p><w:r><w:t>1.1 研究背景</w:t></w:r></w:p>
        <w:p><w:r><w:t>这是正文段落，其中包含有意保留的</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>重点文字</w:t></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        <w:p><m:oMath><m:r><m:t>x+y</m:t></m:r></m:oMath></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr>
      </w:body>
    </w:document>`);
  zip.file("word/media/image1.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function createAdvancedFixture() {
  const zip = new JSZip();
  const abstractText = "本研究围绕论文自动排版方法展开，提出结构识别与样式映射方案，并通过实验验证其有效性。".repeat(7);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:pPr/><w:rPr/></w:style>
      <w:style w:type="paragraph" w:styleId="TOC3"><w:name w:val="toc 3"/><w:pPr/><w:rPr/></w:style>
    </w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        <w:p><w:r><w:t>论文自动排版系统研究</w:t></w:r></w:p>
        <w:p><w:r><w:t>学生姓名与指导教师</w:t></w:r></w:p>
        <w:p><w:r><w:t>中文摘要</w:t></w:r></w:p>
        <w:p><w:r><w:t>${abstractText}</w:t></w:r></w:p>
        <w:p><w:r><w:t>关键词：论文排版; 结构识别; Word 自动化</w:t></w:r></w:p>
        <w:p><w:r><w:t>Research on Automatic Paper Formatting</w:t></w:r></w:p>
        <w:p><w:r><w:t>Author: Zhang San  Tutor: Li Si</w:t></w:r></w:p>
        <w:p><w:r><w:t>Abstract</w:t></w:r></w:p>
        <w:p><w:r><w:t>This study proposes a structure-aware paper formatting method.</w:t></w:r></w:p>
        <w:p><w:r><w:t>Keywords: formatting; structure; automation</w:t></w:r></w:p>
        <w:p><w:r><w:t>目录</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>第一章 系统概述 1</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr><w:r><w:t>1.1 研究背景 1</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 系统概述</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>1.1 研究背景</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>1.1.1 研究意义</w:t></w:r></w:p>
        <w:p><w:r><w:t>这是论文正文内容。</w:t></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><wp:extent cx="7200000" cy="3600000"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill><pic:spPr><a:xfrm><a:ext cx="7200000" cy="3600000"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        <w:p><w:r><w:t>图1.1 系统模块层次图</w:t></w:r></w:p>
        <w:p><w:r><w:t>表1-1 系统模块列表</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>模块</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p><w:r><w:t>结束语</w:t></w:r></w:p>
        <w:p><w:r><w:t>本文完成了系统设计。</w:t></w:r></w:p>
        <w:p><w:r><w:t>参考文献</w:t></w:r></w:p>
        <w:p><w:r><w:t>［1］马建刚,黄涛. 面向大规模分布式计算系统核心技术.软件学报. 2006,17(1):134-136</w:t></w:r></w:p>
        <w:p><w:r><w:t>［2］胡道元.计算机局域网.北京:清华大学出版社,2002</w:t></w:r></w:p>
        <w:p><w:r><w:t>附录Ⅰ 英文资料翻译</w:t></w:r></w:p>
        <w:p><w:r><w:t>English source material for the appendix.</w:t></w:r></w:p>
        <w:p><w:r><w:t>中文翻译</w:t></w:r></w:p>
        <w:p><w:r><w:t>这是英文资料的中文翻译。</w:t></w:r></w:p>
        <w:p><w:r><w:t>附录Ⅱ 程序代码</w:t></w:r></w:p>
        <w:p><w:r><w:t>function formatPaper() { return true; }</w:t></w:r></w:p>
        <w:p><m:oMath><m:r><m:t>x+y</m:t></m:r></m:oMath></w:p>
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr>
      </w:body>
    </w:document>`);
  zip.file("word/media/image1.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({ type: "nodebuffer" });
}

test("parses common Chinese paper formatting instructions", () => {
  const parsed = parseFormattingInstructions(INSTRUCTIONS);
  assert.deepEqual(parsed.page, {
    widthCm: 21,
    heightCm: 29.7,
    orientation: "portrait",
    marginTopCm: 2.54,
    marginBottomCm: 2.54,
    marginLeftCm: 3,
    marginRightCm: 3,
  });
  assert.equal(parsed.body.eastAsia, "宋体");
  assert.equal(parsed.body.latin, "Times New Roman");
  assert.equal(parsed.body.sizePt, 12);
  assert.deepEqual(parsed.body.lineSpacing, { mode: "multiple", value: 1.5 });
  assert.equal(parsed.body.firstLineChars, 2);
  assert.equal(parsed.title.sizePt, 18);
  assert.equal(parsed.heading3.eastAsia, "楷体");
});

test("inspects and formats DOCX while preserving non-text package parts", async () => {
  const input = await createFixture();
  const inspection = await inspectPaperDocx(input);
  assert.deepEqual(inspection, { paragraphs: 6, tables: 1, images: 1, formulas: 1, sections: 1 });

  const analysis = await analyzePaperFormatting(input, INSTRUCTIONS);
  assert.equal(analysis.rules.length, 6);
  assert.match(analysis.rules[0], /页面/);

  const formatted = await formatPaperDocx(input, INSTRUCTIONS);
  const outputZip = await JSZip.loadAsync(formatted.buffer);
  assert.deepEqual(await outputZip.file("word/media/image1.png").async("uint8array"), await (await JSZip.loadAsync(input)).file("word/media/image1.png").async("uint8array"));

  const documentXml = await outputZip.file("word/document.xml").async("string");
  assert.match(documentXml, /<w:drawing>/);
  assert.match(documentXml, /<m:oMath>/);
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const pageSize = elements(document.documentElement, "pgSz")[0];
  const margins = elements(document.documentElement, "pgMar")[0];
  assert.equal(attr(pageSize, "w"), "11907");
  assert.equal(attr(pageSize, "h"), "16840");
  assert.equal(attr(margins, "top"), "1440");
  assert.equal(attr(margins, "left"), "1701");

  const paragraphs = elements(document.documentElement, "p");
  const titleRun = elements(paragraphs[0], "rPr")[0];
  assert.equal(attr(elements(titleRun, "sz")[0], "val"), "36");
  assert.equal(attr(elements(titleRun, "rFonts")[0], "eastAsia"), "黑体");
  const bodyParagraph = paragraphs.find((paragraph) => paragraph.textContent.includes("这是正文段落"));
  const bodyProperties = elements(bodyParagraph, "pPr")[0];
  assert.equal(attr(elements(bodyProperties, "jc")[0], "val"), "both");
  assert.equal(attr(elements(bodyProperties, "ind")[0], "firstLineChars"), "200");
  assert.equal(attr(elements(bodyProperties, "spacing")[0], "line"), "360");
  assert.ok(elements(bodyParagraph, "b").length, "intentional bold emphasis should be preserved");
  assert.equal(formatted.report.applied.title, 1);
  assert.equal(formatted.report.applied.heading1, 1);
  assert.equal(formatted.report.applied.heading2, 1);
  assert.equal(formatted.report.applied.body, 1);
});

test("creates a safe formatted output name", () => {
  assert.equal(formattedPaperName("论文:终稿.docx"), "论文-终稿-已排版.docx");
});

test("parses and applies a full degree-thesis specification", async () => {
  const parsed = parseFormattingInstructions(ADVANCED_INSTRUCTIONS);
  assert.equal(parsed.profile, "degree-thesis");
  assert.equal(parsed.page.marginTopCm, 3.6);
  assert.equal(parsed.page.marginLeftCm, 3);
  assert.equal(parsed.page.marginRightCm, 2);
  assert.equal(parsed.header.text, "太原科技大学学士学位论文");
  assert.equal(parsed.heading1.pageBreakBefore, true);
  assert.equal(parsed.chineseAbstractHeading.sizePt, 18);
  assert.equal(parsed.englishAbstractBody.latin, "Times New Roman");
  assert.equal(parsed.toc1.sizePt, 10.5);
  assert.deepEqual(parsed.figures, { maxWidthCm: 12, maxHeightCm: 7, centered: true });

  const input = await createAdvancedFixture();
  const analysis = await analyzePaperFormatting(input, ADVANCED_INSTRUCTIONS);
  assert.match(analysis.checks.join(" "), /中文摘要/);
  assert.match(analysis.rules.join(" "), /罗马数字/);

  const formatted = await formatPaperDocx(input, ADVANCED_INSTRUCTIONS);
  const outputZip = await JSZip.loadAsync(formatted.buffer);
  const documentXml = await outputZip.file("word/document.xml").async("string");
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const paragraphs = elements(document.documentElement, "p");
  const byText = (text) => paragraphs.find((paragraph) => paragraph.textContent.includes(text));
  const byExactText = (text) => paragraphs.find((paragraph) => paragraph.textContent.trim() === text);

  const abstractHeading = byText("中文摘要");
  assert.equal(attr(elements(abstractHeading, "jc")[0], "val"), "center");
  assert.equal(attr(elements(abstractHeading, "rFonts")[0], "eastAsia"), "黑体");
  assert.equal(attr(elements(abstractHeading, "sz")[0], "val"), "36");
  const keywordParagraph = byText("关键词：");
  const keywordRuns = elements(keywordParagraph, "r");
  assert.ok(elements(keywordRuns[0], "b").length, "keyword label should be bold");
  assert.equal(elements(keywordRuns[1], "b").length, 0, "keyword values should not be bold");
  const abstractEnglish = byText("This study proposes");
  assert.equal(attr(elements(abstractEnglish, "rFonts")[0], "ascii"), "Times New Roman");
  const chapter = byExactText("第一章 系统概述");
  assert.equal(attr(elements(chapter, "pageBreakBefore")[0], "val"), "1");
  assert.equal(attr(elements(chapter, "pStyle")[0], "val"), "Heading1");
  const caption = byText("图1.1");
  assert.equal(attr(elements(caption, "jc")[0], "val"), "center");
  assert.equal(attr(elements(caption, "sz")[0], "val"), "21");
  const imageExtent = elements(document.documentElement, "extent")[0];
  assert.ok(Number(imageExtent.getAttribute("cx")) <= 4320000);
  assert.ok(Number(imageExtent.getAttribute("cy")) <= 2520000);
  const numberFormats = elements(document.documentElement, "pgNumType").map((element) => attr(element, "fmt"));
  assert.ok(numberFormats.includes("lowerRoman"));
  assert.ok(numberFormats.includes("decimal"));
  assert.ok(elements(document.documentElement, "sectPr").length >= 3);

  const rels = await outputZip.file("word/_rels/document.xml.rels").async("string");
  assert.match(rels, /relationships\/header/);
  assert.match(rels, /relationships\/footer/);
  assert.match(rels, /relationships\/settings/);
  const headerName = Object.keys(outputZip.files).find((name) => /^word\/header\d+\.xml$/.test(name));
  const footerName = Object.keys(outputZip.files).find((name) => /^word\/footer\d+\.xml$/.test(name));
  assert.match(await outputZip.file(headerName).async("string"), /太原科技大学学士学位论文/);
  assert.match(await outputZip.file(footerName).async("string"), /PAGE/);
  assert.match(await outputZip.file("word/settings.xml").async("string"), /updateFields/);
  assert.equal(formatted.report.applied.resizedFigures, 1);
  assert.equal(formatted.report.applied.chineseAbstractHeading, 1);
  assert.equal(formatted.report.applied.appendixCode, 1);
});

test("structured dropdown settings override detected suggestions safely", async () => {
  const input = await createFixture();
  const specification = {
    body: {
      eastAsia: "仿宋",
      latin: "Arial",
      sizePt: 14,
      bold: false,
      alignment: "both",
      lineSpacing: { mode: "multiple", value: 2 },
      firstLineChars: 0,
      leftIndentChars: 2,
      hangingChars: 2,
    },
    heading1: { eastAsia: "黑体", sizePt: 22, bold: true, alignment: "center", pageBreakBefore: false },
    toc: { levels: 2, updateFields: true },
    pagination: { frontFormat: "preserve", bodyFormat: "upperRoman", alignment: "right", sizePt: 12, bodyStart: 3 },
  };
  const analysis = await analyzePaperFormatting(input, INSTRUCTIONS, specification);
  assert.equal(analysis.specification.body.eastAsia, "仿宋");
  assert.equal(analysis.specification.body.sizePt, 14);
  assert.deepEqual(analysis.specification.body.lineSpacing, { mode: "multiple", value: 2 });
  assert.equal(analysis.specification.toc.levels, 2);

  const formatted = await formatPaperDocx(input, INSTRUCTIONS, specification);
  const outputZip = await JSZip.loadAsync(formatted.buffer);
  const documentXml = await outputZip.file("word/document.xml").async("string");
  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const bodyParagraph = elements(document.documentElement, "p").find((paragraph) => paragraph.textContent.includes("这是正文段落"));
  const bodyProperties = elements(bodyParagraph, "pPr")[0];
  const bodyFonts = elements(bodyParagraph, "rFonts")[0];
  assert.equal(attr(bodyFonts, "eastAsia"), "仿宋");
  assert.equal(attr(bodyFonts, "ascii"), "Arial");
  assert.equal(attr(elements(bodyParagraph, "sz")[0], "val"), "28");
  assert.equal(attr(elements(bodyProperties, "spacing")[0], "line"), "480");
  assert.equal(attr(elements(bodyProperties, "ind")[0], "leftChars"), "200");
  assert.equal(attr(elements(bodyProperties, "ind")[0], "hangingChars"), "200");
  const numberFormats = elements(document.documentElement, "pgNumType");
  assert.ok(numberFormats.some((element) => attr(element, "fmt") === "upperRoman" && attr(element, "start") === "3"));
  const footerName = Object.keys(outputZip.files).find((name) => /^word\/footer\d+\.xml$/.test(name));
  assert.match(await outputZip.file(footerName).async("string"), /w:jc w:val="right"/);
});

test("structured formatting sanitizer drops unknown values and clamps numeric ranges", () => {
  const sanitized = sanitizeStructuredSpecification({
    body: { eastAsia: "不存在字体", latin: "Arial", sizePt: 999, alignment: "diagonal", lineSpacing: { mode: "multiple", value: 9 } },
    page: { marginTopCm: -5, marginLeftCm: 99, orientation: "upside-down" },
    toc: { levels: 12 },
    pagination: { bodyFormat: "invented", alignment: "middle", bodyStart: -3 },
  });
  assert.equal(sanitized.body.eastAsia, undefined);
  assert.equal(sanitized.body.latin, "Arial");
  assert.equal(sanitized.body.sizePt, 72);
  assert.equal(sanitized.body.alignment, undefined);
  assert.deepEqual(sanitized.body.lineSpacing, { mode: "multiple", value: 4 });
  assert.equal(sanitized.page.marginTopCm, 0.5);
  assert.equal(sanitized.page.marginLeftCm, 10);
  assert.equal(sanitized.page.orientation, undefined);
  assert.equal(sanitized.toc.levels, 5);
  assert.equal(sanitized.pagination.bodyFormat, undefined);
  assert.equal(sanitized.pagination.bodyStart, 1);
});

test("exports and imports a versioned shareable paper-format configuration", () => {
  const configuration = createPaperFormatConfiguration({
    name: "研究生学位论文格式",
    instructions: INSTRUCTIONS,
    specification: {
      body: { eastAsia: "宋体", latin: "Times New Roman", sizePt: 12, lineSpacing: { mode: "multiple", value: 1.5 } },
      heading1: { eastAsia: "黑体", sizePt: 18, bold: true, pageBreakBefore: true },
      toc: { levels: 3, updateFields: true },
    },
  });
  assert.equal(configuration.kind, "paperloom.paper-format");
  assert.equal(configuration.schemaVersion, 1);
  assert.equal(configuration.name, "研究生学位论文格式");
  assert.equal(configuration.specification.body.eastAsia, "宋体");
  assert.equal(configuration.specification.heading1.pageBreakBefore, true);
  assert.equal("path" in configuration, false, "shared configuration must not contain a paper path");

  const imported = parsePaperFormatConfiguration(JSON.stringify(configuration));
  assert.equal(imported.instructions, INSTRUCTIONS);
  assert.equal(imported.specification.body.sizePt, 12);
  assert.equal(imported.specification.toc.levels, 3);
});

test("rejects incompatible paper-format configuration files", () => {
  assert.throws(() => parsePaperFormatConfiguration("not json"), /不是有效/);
  assert.throws(() => parsePaperFormatConfiguration(JSON.stringify({
    kind: "paperloom.paper-format",
    schemaVersion: 9,
    instructions: INSTRUCTIONS,
    specification: {},
  })), /版本不受支持/);
});
