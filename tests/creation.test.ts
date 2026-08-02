import assert from "node:assert/strict";
import test from "node:test";
import {
  appendManuscript,
  filterCreationMessages,
  isBookChapterHeading,
  isBookSectionHeading,
  normalizeManuscript,
  prepareGeneratedManuscript,
  replaceManuscriptRange,
  splitManuscriptBlocks,
} from "../src/creation";

test("recognizes real chapter headings without promoting ordinary sentences", () => {
  assert.equal(isBookChapterHeading("第一章 雨夜来信"), true);
  assert.equal(isBookChapterHeading("第12章父与子"), true);
  assert.equal(isBookChapterHeading("Chapter IV: The Visitor"), true);
  assert.equal(isBookChapterHeading("雨从傍晚一直下到深夜。"), false);
  assert.equal(isBookSectionHeading("场景二"), true);
  assert.equal(isBookSectionHeading("2.1 里屋的方向"), true);
  assert.equal(isBookSectionHeading("纸片的背面，是一行打印出来的小字，——"), false);
  assert.equal(isBookSectionHeading("“第十六个。”"), false);
});

test("normalizes common model markdown into book text", () => {
  assert.equal(
    normalizeManuscript("```markdown\n## 第一章 雨夜\n\n**门外有人。**\n```"),
    "第一章 雨夜\n\n门外有人。",
  );
});

test("keeps only the generated title and readable book body", () => {
  const prepared = prepareGeneratedManuscript([
    "书名：《暗河》",
    "",
    "剧情概述：一名画像师在雨夜收到失踪者来信，旧案由此重新启动。",
    "",
    "核心人物：宋瑾，刑侦支队心理画像师。",
    "",
    "【正文】",
    "",
    "第一章 雨夜来信",
    "",
    "尸体是在清晨六点被发现的。",
  ].join("\n"));

  assert.equal(prepared.title, "暗河");
  assert.equal(prepared.summary, "一名画像师在雨夜收到失踪者来信，旧案由此重新启动。");
  assert.equal(prepared.manuscript, "第一章 雨夜来信\n\n尸体是在清晨六点被发现的。");
  assert.equal(prepared.manuscript.includes("核心人物"), false);
});

test("does not discard a prose opening when the model returns no setup block", () => {
  const prepared = prepareGeneratedManuscript("雨下了一整夜。\n\n清晨，门外传来三声敲门。");
  assert.equal(prepared.title, "");
  assert.equal(prepared.summary, "");
  assert.equal(prepared.manuscript, "雨下了一整夜。\n\n清晨，门外传来三声敲门。");
});

test("parses the structured English writing response", () => {
  const prepared = prepareGeneratedManuscript([
    "[Title] The Quiet Signal",
    "[Plot Summary] A radio operator hears a call from a station abandoned twenty years ago.",
    "[Manuscript]",
    "Chapter One: Static",
    "",
    "The signal arrived shortly before midnight.",
  ].join("\n"));
  assert.equal(prepared.title, "The Quiet Signal");
  assert.equal(prepared.summary, "A radio operator hears a call from a station abandoned twenty years ago.");
  assert.equal(prepared.manuscript, "Chapter One: Static\n\nThe signal arrived shortly before midnight.");
});

test("splits manuscript blocks and preserves source offsets", () => {
  const manuscript = "第一章 雨夜\n\n门外有人。\n\n场景二\n\n灯灭了。";
  const blocks = splitManuscriptBlocks(manuscript);
  assert.deepEqual(blocks.map((block) => block.kind), ["chapter", "body", "section", "body"]);
  assert.equal(manuscript.slice(blocks[1].start, blocks[1].end), "门外有人。");
});

test("keeps short prose lines as body text instead of accidental bold sections", () => {
  const manuscript = "宋明哲把证物袋翻过来。\n\n纸片的背面，是一行打印出来的小字，——\n\n“第十六个。”";
  assert.deepEqual(
    splitManuscriptBlocks(manuscript).map((block) => block.kind),
    ["body", "body", "body"],
  );
});

test("appends and replaces generated prose without malformed spacing", () => {
  assert.equal(appendManuscript("第一章\n\n旧句。", "## 第二章\n\n新句。"), "第一章\n\n旧句。\n\n第二章\n\n新句。");
  assert.equal(
    replaceManuscriptRange("第一章\n\n旧句。\n\n下一段。", 5, 8, "改写后的句子。"),
    "第一章\n\n改写后的句子。\n\n下一段。",
  );
});

test("keeps writing, discussion and rewrite conversations independent", () => {
  const messages = [
    { id: "write-user", intent: "write" as const },
    { id: "discuss-user", intent: "discuss" as const },
    { id: "write-ai", intent: "write" as const },
    { id: "rewrite-ai", intent: "rewrite" as const },
  ];

  assert.deepEqual(
    filterCreationMessages(messages, "write").map((message) => message.id),
    ["write-user", "write-ai"],
  );
  assert.deepEqual(
    filterCreationMessages(messages, "discuss").map((message) => message.id),
    ["discuss-user"],
  );
  assert.deepEqual(
    filterCreationMessages(messages, "rewrite").map((message) => message.id),
    ["rewrite-ai"],
  );
});
