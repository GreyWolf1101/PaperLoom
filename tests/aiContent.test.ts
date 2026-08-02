import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentExcerpt, createParagraphExcerpt } from "../src/aiContent";

test("short paragraph collections keep their full text", () => {
  assert.equal(
    createParagraphExcerpt(["第一段", "第二段"], 100),
    "第一段\n\n第二段",
  );
});

test("long paragraph collections are sampled without exceeding the limit", () => {
  const paragraphs = Array.from(
    { length: 3000 },
    (_, index) => `段落 ${index + 1}：${"长文档内容".repeat(24)}`,
  );
  const excerpt = createParagraphExcerpt(paragraphs, 4200);
  assert.ok(excerpt.length <= 4200);
  assert.match(excerpt, /段落 1/);
  assert.match(excerpt, /长文档中间内容已智能抽样/);
  assert.match(excerpt, /段落 3000/);
});

test("existing plain-text excerpt behavior remains available", () => {
  const text = "A".repeat(9000);
  assert.ok(createDocumentExcerpt(text, 1200).length <= 1200);
});
