import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchDocument } from "../src/models";
import {
  buildComparisonRows,
  buildInTextReferenceLinks,
  createEvidenceCard,
  createResearchProject,
  normalizeResearchWorkspace,
  parseDocumentReferences,
  searchResearchLibrary,
} from "../src/research";

const paper: ResearchDocument = {
  id: "paper-a",
  name: "paper-a.pdf",
  title: "Evidence-first Review",
  path: "",
  type: "pdf",
  shelf: "academic",
  size: 100,
  modifiedAt: 1,
  addedAt: 1,
  paragraphs: [
    { id: "intro", kind: "heading", page: 1, text: "1. Introduction" },
    { id: "question", page: 1, text: "This study aims to test whether evidence cards improve literature review quality." },
    { id: "method-title", kind: "heading", page: 2, text: "2. Method" },
    { id: "method", page: 2, text: "We use a transformer model and a dataset of 240 papers." },
    { id: "result-title", kind: "heading", page: 5, text: "3. Results" },
    { id: "result", page: 5, text: "The method improved recall by 18% and achieved an F1 score of 0.89." },
    { id: "limit-title", kind: "heading", page: 7, text: "4. Limitations" },
    { id: "limit", page: 7, text: "A limitation is that only English computer-science papers were included." },
    { id: "refs", kind: "heading", page: 8, text: "References" },
    { id: "ref-1", page: 8, text: "[1] Smith J. Evidence synthesis systems. Journal of Review. 2024. doi:10.1234/example.1" },
    { id: "ref-2", page: 8, text: "[2] Chen L. Reliable citation navigation. 2023." },
  ],
};

test("research workspace data is sanitized and preserves valid projects", () => {
  const project = createResearchProject("毕业论文");
  assert.equal(project.synthesis, "");
  const card = createEvidenceCard({
    projectId: project.id,
    docId: paper.id,
    paragraphId: "result",
    page: 5,
    quote: "improved recall by 18%",
    type: "result",
    relation: "support",
    note: "核心结果",
    tags: ["recall"],
  });
  const state = normalizeResearchWorkspace({ projects: [project], evidenceCards: [card], activeProjectId: project.id });
  assert.equal(state.projects[0].name, "毕业论文");
  assert.equal(state.evidenceCards[0].page, 5);
  assert.equal(state.activeProjectId, project.id);
  assert.equal(state.projects[0].synthesis, "");
});

test("comparison extraction keeps source coordinates", () => {
  const rows = buildComparisonRows([paper]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cells.method.paragraphId, "method");
  assert.equal(rows[0].cells.findings.page, 5);
  assert.match(rows[0].cells.limitations.value, /English/);
});

test("reference parsing finds labels, DOI and source page", () => {
  const references = parseDocumentReferences(paper);
  assert.equal(references.length, 2);
  assert.equal(references[0].label, "1");
  assert.equal(references[0].doi, "10.1234/example.1");
  assert.equal(references[1].paragraphId, "ref-2");
  const links = buildInTextReferenceLinks("Prior systems [2] disagree with the new result.", references);
  assert.deepEqual(links, [{ start: 14, end: 17, targetParagraphId: "ref-2" }]);
});

test("local research search expands bilingual research concepts", () => {
  const results = searchResearchLibrary([paper], "研究局限");
  assert.equal(results[0].paragraphId, "limit");
  assert.ok(results[0].matchedTerms.includes("limitation") || results[0].matchedTerms.includes("局限"));
});
