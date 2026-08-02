function cleanText(value, maxLength = 2_000) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeDoi(value) {
  return cleanText(value, 300)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;)\]}]+$/, "") || undefined;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = new Error(`Research metadata service returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function crossrefYear(item) {
  const parts = item?.published?.["date-parts"]?.[0]
    || item?.["published-print"]?.["date-parts"]?.[0]
    || item?.["published-online"]?.["date-parts"]?.[0];
  return Array.isArray(parts) && Number.isFinite(Number(parts[0])) ? Number(parts[0]) : undefined;
}

function normalizeCrossrefReference(item) {
  const doi = normalizeDoi(item?.DOI);
  return {
    title: cleanText(item?.title?.[0], 600) || undefined,
    authors: Array.isArray(item?.author)
      ? item.author.map((author) => cleanText([author?.given, author?.family].filter(Boolean).join(" "), 160)).filter(Boolean).slice(0, 24)
      : [],
    year: crossrefYear(item),
    doi,
    url: doi ? `https://doi.org/${encodeURI(doi)}` : safeHttpsUrl(item?.URL),
  };
}

async function resolveReference(payload, fetcher) {
  const doi = normalizeDoi(payload?.doi);
  let data;
  if (doi) {
    data = await fetchJson(fetcher, `https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    return normalizeCrossrefReference(data?.message || {});
  }
  const query = cleanText(payload?.query, 700);
  if (!query) throw new Error("Reference text is required");
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", "1");
  const result = await fetchJson(fetcher, url.href);
  const item = result?.message?.items?.[0];
  if (!item) throw new Error("No matching Crossref record was found");
  return normalizeCrossrefReference(item);
}

function normalizeSemanticPaper(item) {
  const doi = normalizeDoi(item?.externalIds?.DOI);
  const paperId = cleanText(item?.paperId, 220);
  return {
    id: paperId || doi || cleanText(item?.title, 180),
    title: cleanText(item?.title, 600) || "Untitled",
    authors: Array.isArray(item?.authors)
      ? item.authors.map((author) => cleanText(author?.name, 160)).filter(Boolean).slice(0, 20)
      : [],
    year: Number.isFinite(item?.year) ? item.year : undefined,
    venue: cleanText(item?.venue, 260) || undefined,
    citationCount: Number.isFinite(item?.citationCount) ? item.citationCount : undefined,
    referenceCount: Number.isFinite(item?.referenceCount) ? item.referenceCount : undefined,
    doi,
    url: doi ? `https://doi.org/${encodeURI(doi)}` : safeHttpsUrl(item?.url),
  };
}

const PAPER_FIELDS = "title,authors,year,venue,url,citationCount,referenceCount,externalIds";

async function findSemanticPaper(payload, fetcher) {
  const doi = normalizeDoi(payload?.doi);
  if (doi) {
    return fetchJson(fetcher, `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${encodeURIComponent(PAPER_FIELDS)}`);
  }
  const title = cleanText(payload?.title, 500);
  if (!title) throw new Error("A DOI or title is required");
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", title);
  url.searchParams.set("limit", "1");
  url.searchParams.set("fields", PAPER_FIELDS);
  const result = await fetchJson(fetcher, url.href);
  const paper = result?.data?.[0];
  if (!paper) throw new Error("No matching Semantic Scholar paper was found");
  return paper;
}

async function getCitationGraph(payload, fetcher) {
  const paper = await findSemanticPaper(payload, fetcher);
  const paperId = cleanText(paper?.paperId, 220);
  if (!paperId) throw new Error("The paper has no Semantic Scholar identifier");
  const base = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}`;
  const [citationsData, referencesData] = await Promise.all([
    fetchJson(fetcher, `${base}/citations?limit=12&fields=${encodeURIComponent(PAPER_FIELDS)}`),
    fetchJson(fetcher, `${base}/references?limit=12&fields=${encodeURIComponent(PAPER_FIELDS)}`),
  ]);
  return {
    paper: normalizeSemanticPaper(paper),
    citations: Array.isArray(citationsData?.data)
      ? citationsData.data.map((item) => normalizeSemanticPaper(item?.citingPaper)).filter((item) => item.id)
      : [],
    references: Array.isArray(referencesData?.data)
      ? referencesData.data.map((item) => normalizeSemanticPaper(item?.citedPaper)).filter((item) => item.id)
      : [],
  };
}

module.exports = { getCitationGraph, resolveReference };
