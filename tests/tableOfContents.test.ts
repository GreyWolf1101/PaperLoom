import assert from "node:assert/strict";
import {
  buildEmbeddedTableOfContents,
  countTableOfContentsItems,
  detectTableOfContents,
} from "../src/tableOfContents";
import type { Paragraph } from "../src/models";

async function verifyEmbeddedOutline() {
  const outline = await buildEmbeddedTableOfContents([
    {
      title: "1. Introduction",
      dest: "intro",
      items: [
        {
          title: "1.1 Motivation",
          dest: ["motivation"],
          items: [{ title: "1.1.1 Prior work", dest: "prior", items: [] }],
        },
      ],
    },
    {
      title: "2. Methods",
      dest: null,
      items: [{ title: "2.1 Data", dest: "data", items: [] }],
    },
  ], async (destination) => {
    const key = Array.isArray(destination) ? destination[0] : destination;
    return { intro: 2, motivation: 4, prior: 5, data: 9 }[String(key)] as number | undefined;
  });

  assert.equal(outline[0].page, 2);
  assert.equal(outline[0].children?.[0].page, 4);
  assert.equal(outline[0].children?.[0].children?.[0].page, 5);
  assert.equal(outline[1].page, 9, "a parent without a destination inherits its first child page");
  assert.equal(countTableOfContentsItems(outline), 5);
}

function verifyDetectedOutline() {
  const paragraphs: Paragraph[] = [
    { id: "page-1", text: "第 1 页", kind: "heading", page: 1 },
    { id: "intro", text: "1. Introduction", kind: "heading", page: 2, fontSize: 16 },
    { id: "body-1", text: "A long body paragraph that should never become a heading.", kind: "body", page: 2, fontSize: 10 },
    { id: "motivation", text: "1.1 Motivation", kind: "heading", page: 3, fontSize: 13 },
    { id: "prior", text: "1.1.1 Prior work", kind: "heading", page: 4, fontSize: 11 },
    { id: "methods", text: "2. Methods", kind: "heading", page: 6, fontSize: 16 },
    { id: "results", text: "Results", kind: "heading", page: 10, fontSize: 16 },
  ];
  const outline = detectTableOfContents(paragraphs);

  assert.deepEqual(outline.map((item) => item.title), ["1. Introduction", "2. Methods", "Results"]);
  assert.equal(outline[0].children?.[0].title, "1.1 Motivation");
  assert.equal(outline[0].children?.[0].children?.[0].title, "1.1.1 Prior work");
  assert.equal(outline[0].children?.[0].children?.[0].page, 4);
  assert.equal(countTableOfContentsItems(outline), 5);
}

async function main() {
  await verifyEmbeddedOutline();
  verifyDetectedOutline();
  console.log("table-of-contents tests passed");
}

void main();
