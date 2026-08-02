import assert from "node:assert/strict";
import { decodeBookText, resolveZipHref, splitBookText } from "../src/bookParsers";

function verifyChineseChapterDetection() {
  const paragraphs = splitBookText([
    "第一章 星河来信",
    "",
    "雨从傍晚一直下到深夜。",
    "",
    "她在旧邮局门口停下脚步。",
    "",
    "第二章 无声站台",
  ].join("\n"), "novel");

  assert.equal(paragraphs.length, 4);
  assert.deepEqual(paragraphs.map((paragraph) => paragraph.kind), ["heading", "body", "body", "heading"]);
  assert.equal(paragraphs[0].text, "第一章 星河来信");
  assert.equal(paragraphs[3].text, "第二章 无声站台");
  assert.ok(paragraphs.every((paragraph) => paragraph.id.startsWith("novel-")));
}

function verifyEnglishAndNumberedHeadings() {
  const paragraphs = splitBookText("CHAPTER ONE\n\n1.2 A Smaller Story\n\nThe story begins here.");
  assert.deepEqual(paragraphs.map((paragraph) => paragraph.kind), ["heading", "heading", "body"]);
}

function verifyUtf16Decoding() {
  const source = "序章\n\n这是 UTF-16 文本。";
  const encoded = new TextEncoder().encode(source);
  const utf16 = new Uint8Array(2 + source.length * 2);
  utf16[0] = 0xff;
  utf16[1] = 0xfe;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    utf16[2 + index * 2] = code & 0xff;
    utf16[3 + index * 2] = code >> 8;
  }
  assert.ok(encoded.length > 0);
  assert.equal(decodeBookText(utf16.buffer), source);
}

function verifyEpubInternalLinkResolution() {
  assert.deepEqual(
    resolveZipHref("OEBPS/chapter-1.xhtml", "#note-1"),
    { path: "OEBPS/chapter-1.xhtml", fragment: "note-1" },
  );
  assert.deepEqual(
    resolveZipHref("OEBPS/text/chapter-1.xhtml", "../notes.xhtml#note-2"),
    { path: "OEBPS/notes.xhtml", fragment: "note-2" },
  );
}

verifyChineseChapterDetection();
verifyEnglishAndNumberedHeadings();
verifyUtf16Decoding();
verifyEpubInternalLinkResolution();
console.log("book-parser tests passed");
