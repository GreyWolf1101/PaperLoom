const ACADEMIC_API_PROVIDERS = new Set(["openalex", "crossref", "semantic-scholar", "pubmed"]);
const PAGE_SIZE = 20;

function cleanText(value, maxLength = 4_000) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDoi(value) {
  return cleanText(value, 300)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "") || undefined;
}

function doiUrl(doi) {
  return doi ? `https://doi.org/${encodeURI(doi)}` : undefined;
}

function reconstructOpenAlexAbstract(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) return undefined;
  const words = [];
  Object.entries(index).forEach(([word, positions]) => {
    if (!Array.isArray(positions)) return;
    positions.forEach((position) => {
      if (Number.isInteger(position) && position >= 0 && position < 8_000) words[position] = word;
    });
  });
  return cleanText(words.filter(Boolean).join(" "), 3_000) || undefined;
}

function normalizeOpenAlexWork(work) {
  const doi = normalizeDoi(work?.doi);
  const openLocation = work?.best_oa_location || work?.primary_location;
  const source = work?.primary_location?.source?.display_name;
  const id = cleanText(work?.id, 300).split("/").pop() || doi || cleanText(work?.title, 160);
  return {
    id: `openalex:${id}`,
    provider: "openalex",
    title: cleanText(work?.title, 600) || "Untitled",
    authors: Array.isArray(work?.authorships)
      ? work.authorships.map((item) => cleanText(item?.author?.display_name, 160)).filter(Boolean).slice(0, 16)
      : [],
    year: Number.isFinite(work?.publication_year) ? work.publication_year : undefined,
    publicationDate: cleanText(work?.publication_date, 40) || undefined,
    venue: cleanText(source, 260) || undefined,
    abstract: reconstructOpenAlexAbstract(work?.abstract_inverted_index),
    doi,
    citationCount: Number.isFinite(work?.cited_by_count) ? work.cited_by_count : undefined,
    publicationType: cleanText(work?.type_crossref || work?.type, 120) || undefined,
    isOpenAccess: work?.open_access?.is_oa === true || Boolean(openLocation?.pdf_url),
    landingUrl: doiUrl(doi)
      || safeHttpsUrl(work?.primary_location?.landing_page_url)
      || safeHttpsUrl(work?.id),
    pdfUrl: safeHttpsUrl(openLocation?.pdf_url),
  };
}

function crossrefDate(item) {
  const parts = item?.published?.["date-parts"]?.[0]
    || item?.published_print?.["date-parts"]?.[0]
    || item?.published_online?.["date-parts"]?.[0];
  if (!Array.isArray(parts) || !parts.length) return {};
  const [year, month, day] = parts.map(Number);
  const date = [year, month && String(month).padStart(2, "0"), day && String(day).padStart(2, "0")]
    .filter(Boolean)
    .join("-");
  return { year: Number.isFinite(year) ? year : undefined, publicationDate: date || undefined };
}

function normalizeCrossrefWork(item) {
  const doi = normalizeDoi(item?.DOI);
  const date = crossrefDate(item);
  const pdfLink = Array.isArray(item?.link)
    ? item.link.find((link) => /pdf/i.test(String(link?.["content-type"] || "")) || /\.pdf(?:$|\?)/i.test(String(link?.URL || "")))
    : undefined;
  const isOpenAccess = Boolean(pdfLink || (Array.isArray(item?.license) && item.license.length));
  return {
    id: `crossref:${doi || cleanText(item?.URL, 300) || cleanText(item?.title?.[0], 160)}`,
    provider: "crossref",
    title: cleanText(item?.title?.[0], 600) || "Untitled",
    authors: Array.isArray(item?.author)
      ? item.author.map((author) => cleanText([author?.given, author?.family].filter(Boolean).join(" "), 160)).filter(Boolean).slice(0, 16)
      : [],
    ...date,
    venue: cleanText(item?.["container-title"]?.[0] || item?.publisher, 260) || undefined,
    abstract: cleanText(item?.abstract, 3_000) || undefined,
    doi,
    citationCount: Number.isFinite(item?.["is-referenced-by-count"]) ? item["is-referenced-by-count"] : undefined,
    publicationType: cleanText(item?.type, 120) || undefined,
    isOpenAccess,
    landingUrl: doiUrl(doi) || safeHttpsUrl(item?.URL),
    pdfUrl: safeHttpsUrl(pdfLink?.URL),
  };
}

function normalizeSemanticScholarPaper(item) {
  const doi = normalizeDoi(item?.externalIds?.DOI);
  return {
    id: `semantic-scholar:${cleanText(item?.paperId, 200) || doi || cleanText(item?.title, 160)}`,
    provider: "semantic-scholar",
    title: cleanText(item?.title, 600) || "Untitled",
    authors: Array.isArray(item?.authors)
      ? item.authors.map((author) => cleanText(author?.name, 160)).filter(Boolean).slice(0, 16)
      : [],
    year: Number.isFinite(item?.year) ? item.year : undefined,
    publicationDate: cleanText(item?.publicationDate, 40) || undefined,
    venue: cleanText(item?.venue, 260) || undefined,
    abstract: cleanText(item?.abstract, 3_000) || undefined,
    doi,
    citationCount: Number.isFinite(item?.citationCount) ? item.citationCount : undefined,
    publicationType: cleanText(item?.publicationTypes?.[0], 120) || undefined,
    isOpenAccess: Boolean(item?.openAccessPdf?.url),
    landingUrl: doiUrl(doi) || safeHttpsUrl(item?.url),
    pdfUrl: safeHttpsUrl(item?.openAccessPdf?.url),
  };
}

function normalizePubMedSummary(item, pmid) {
  const articleIds = Array.isArray(item?.articleids) ? item.articleids : [];
  const doi = normalizeDoi(articleIds.find((identifier) => identifier?.idtype === "doi")?.value);
  const yearMatch = cleanText(item?.pubdate, 80).match(/\b(?:19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : undefined;
  return {
    id: `pubmed:${pmid}`,
    provider: "pubmed",
    title: cleanText(item?.title, 600) || "Untitled",
    authors: Array.isArray(item?.authors)
      ? item.authors.map((author) => cleanText(author?.name, 160)).filter(Boolean).slice(0, 16)
      : [],
    year,
    publicationDate: cleanText(item?.pubdate, 80) || undefined,
    venue: cleanText(item?.fulljournalname || item?.source, 260) || undefined,
    abstract: undefined,
    doi,
    citationCount: undefined,
    publicationType: cleanText(item?.pubtype?.[0], 120) || undefined,
    isOpenAccess: false,
    landingUrl: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`,
    pdfUrl: undefined,
  };
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const error = new Error(`Academic search returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function normalizePayload(payload) {
  const provider = ACADEMIC_API_PROVIDERS.has(payload?.provider) ? payload.provider : "openalex";
  const query = cleanText(payload?.query, 300);
  const page = Math.min(50, Math.max(1, Math.round(Number(payload?.page) || 1)));
  const sort = ["relevance", "newest", "cited"].includes(payload?.sort) ? payload.sort : "relevance";
  const yearFrom = Number.isFinite(Number(payload?.yearFrom))
    ? Math.min(new Date().getFullYear(), Math.max(1900, Math.round(Number(payload.yearFrom))))
    : undefined;
  return { provider, query, page, sort, yearFrom, openAccessOnly: payload?.openAccessOnly === true };
}

async function searchOpenAlex(input, fetcher) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", input.query);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("per-page", String(PAGE_SIZE));
  const sort = input.sort === "newest" ? "publication_date:desc" : input.sort === "cited" ? "cited_by_count:desc" : "relevance_score:desc";
  url.searchParams.set("sort", sort);
  const filters = [];
  if (input.yearFrom) filters.push(`from_publication_date:${input.yearFrom}-01-01`);
  if (input.openAccessOnly) filters.push("is_oa:true");
  if (filters.length) url.searchParams.set("filter", filters.join(","));
  const data = await fetchJson(fetcher, url.href);
  const results = Array.isArray(data?.results) ? data.results.map(normalizeOpenAlexWork) : [];
  const total = Number(data?.meta?.count) || results.length;
  return { results, total };
}

async function searchCrossref(input, fetcher) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", input.query);
  url.searchParams.set("rows", String(PAGE_SIZE));
  url.searchParams.set("offset", String((input.page - 1) * PAGE_SIZE));
  url.searchParams.set("sort", input.sort === "newest" ? "published" : input.sort === "cited" ? "is-referenced-by-count" : "relevance");
  url.searchParams.set("order", "desc");
  if (input.yearFrom) url.searchParams.set("filter", `from-pub-date:${input.yearFrom}-01-01`);
  const data = await fetchJson(fetcher, url.href);
  let results = Array.isArray(data?.message?.items) ? data.message.items.map(normalizeCrossrefWork) : [];
  if (input.openAccessOnly) results = results.filter((item) => item.isOpenAccess);
  const total = Number(data?.message?.["total-results"]) || results.length;
  return { results, total };
}

async function searchSemanticScholar(input, fetcher) {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", input.query);
  url.searchParams.set("offset", String((input.page - 1) * PAGE_SIZE));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("fields", "title,authors,year,abstract,url,venue,publicationDate,citationCount,externalIds,openAccessPdf,publicationTypes");
  if (input.yearFrom) url.searchParams.set("year", `${input.yearFrom}-`);
  const data = await fetchJson(fetcher, url.href);
  let results = Array.isArray(data?.data) ? data.data.map(normalizeSemanticScholarPaper) : [];
  if (input.openAccessOnly) results = results.filter((item) => item.isOpenAccess);
  if (input.sort === "newest") results.sort((left, right) => (right.year || 0) - (left.year || 0));
  if (input.sort === "cited") results.sort((left, right) => (right.citationCount || 0) - (left.citationCount || 0));
  return { results, total: Number(data?.total) || results.length };
}

async function searchPubMed(input, fetcher) {
  const queryParts = [input.query];
  if (input.yearFrom) queryParts.push(`${input.yearFrom}:${new Date().getFullYear()}[dp]`);
  if (input.openAccessOnly) queryParts.push("free full text[sb]");
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", queryParts.map((item) => `(${item})`).join(" AND "));
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retstart", String((input.page - 1) * PAGE_SIZE));
  searchUrl.searchParams.set("retmax", String(PAGE_SIZE));
  searchUrl.searchParams.set("sort", input.sort === "newest" ? "pub_date" : "relevance");
  const searchData = await fetchJson(fetcher, searchUrl.href);
  const ids = Array.isArray(searchData?.esearchresult?.idlist) ? searchData.esearchresult.idlist : [];
  if (!ids.length) return { results: [], total: Number(searchData?.esearchresult?.count) || 0 };

  const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("id", ids.join(","));
  summaryUrl.searchParams.set("retmode", "json");
  const summaryData = await fetchJson(fetcher, summaryUrl.href);
  const results = ids
    .map((pmid) => summaryData?.result?.[pmid] ? normalizePubMedSummary(summaryData.result[pmid], pmid) : null)
    .filter(Boolean);
  return { results, total: Number(searchData?.esearchresult?.count) || results.length };
}

async function searchAcademicLiterature(payload, fetcher = globalThis.fetch) {
  const input = normalizePayload(payload);
  if (!input.query) throw new Error("请输入论文名称、DOI 或关键词。");
  let response;
  if (input.provider === "crossref") response = await searchCrossref(input, fetcher);
  else if (input.provider === "semantic-scholar") response = await searchSemanticScholar(input, fetcher);
  else if (input.provider === "pubmed") response = await searchPubMed(input, fetcher);
  else response = await searchOpenAlex(input, fetcher);
  return {
    provider: input.provider,
    query: input.query,
    page: input.page,
    pageSize: PAGE_SIZE,
    total: response.total,
    hasNext: input.page * PAGE_SIZE < response.total && response.results.length > 0,
    results: response.results,
  };
}

module.exports = {
  ACADEMIC_API_PROVIDERS,
  normalizePayload,
  searchAcademicLiterature,
};
