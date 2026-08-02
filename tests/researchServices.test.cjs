const assert = require("node:assert/strict");
const { getCitationGraph, resolveReference } = require("../electron/research-services.cjs");

async function run() {
  const reference = await resolveReference(
    { doi: "10.1234/example" },
    async () => ({
      ok: true,
      json: async () => ({
        message: {
          DOI: "10.1234/example",
          title: ["Evidence Cards"],
          author: [{ given: "Lin", family: "Zhao" }],
          published: { "date-parts": [[2025]] },
        },
      }),
    }),
  );
  assert.equal(reference.title, "Evidence Cards");
  assert.equal(reference.year, 2025);
  assert.equal(reference.url, "https://doi.org/10.1234/example");

  const graph = await getCitationGraph(
    { doi: "10.1234/example" },
    async (url) => {
      if (url.includes("/citations?")) {
        return { ok: true, json: async () => ({ data: [{ citingPaper: { paperId: "c1", title: "Citing paper", authors: [], year: 2026, url: "https://www.semanticscholar.org/paper/c1" } }] }) };
      }
      if (url.includes("/references?")) {
        return { ok: true, json: async () => ({ data: [{ citedPaper: { paperId: "r1", title: "Referenced paper", authors: [], year: 2020, url: "https://www.semanticscholar.org/paper/r1" } }] }) };
      }
      return { ok: true, json: async () => ({ paperId: "p1", title: "Evidence Cards", authors: [], citationCount: 4, referenceCount: 9, externalIds: { DOI: "10.1234/example" } }) };
    },
  );
  assert.equal(graph.paper.id, "p1");
  assert.equal(graph.citations[0].title, "Citing paper");
  assert.equal(graph.references[0].title, "Referenced paper");
}

run().then(() => process.stdout.write("research-service tests passed\n"));
