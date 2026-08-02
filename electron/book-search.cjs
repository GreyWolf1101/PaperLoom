const BOOK_SEARCH_PROVIDERS = new Set([
  "open-library",
  "google-books",
  "internet-archive",
  "project-gutenberg",
]);
const PAGE_SIZE = 20;
const GUTENBERG_PAGE_SIZE = 25;

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
    const url = new URL(String(value || "").replace(/^http:/i, "https:"));
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function values(value, maxLength = 180) {
  const input = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return input.map((item) => cleanText(item, maxLength)).filter(Boolean);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function xmlText(value, maxLength = 4_000) {
  return cleanText(decodeXml(value), maxLength);
}

function xmlTag(value, name, maxLength = 4_000) {
  const match = String(value || "").match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return xmlText(match?.[1], maxLength);
}

function xmlAttributes(value) {
  const attributes = {};
  for (const match of String(value || "").matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attributes[match[1].toLowerCase()] = decodeXml(match[3]);
  }
  return attributes;
}

function normalizePayload(payload) {
  const provider = BOOK_SEARCH_PROVIDERS.has(payload?.provider) ? payload.provider : "open-library";
  const query = cleanText(payload?.query, 300);
  const page = Math.min(50, Math.max(1, Math.round(Number(payload?.page) || 1)));
  const sort = payload?.sort === "newest" ? "newest" : "relevance";
  return { provider, query, page, sort };
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PaperLoom/0.9.1 (book discovery; local desktop reader)",
    },
  });
  if (!response.ok) {
    const error = new Error(`Book search returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchText(fetcher, url, accept) {
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      Accept: accept,
      "User-Agent": "PaperLoom/0.9.1 (book discovery; local desktop reader)",
    },
  });
  if (!response.ok) {
    const error = new Error(`Book search returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

function normalizeOpenLibraryBook(item) {
  const key = cleanText(item?.key, 240);
  const coverId = Number(item?.cover_i);
  const languages = Array.isArray(item?.language) ? item.language.map((value) => cleanText(value, 20)).filter(Boolean) : [];
  const isbn = Array.isArray(item?.isbn) ? cleanText(item.isbn[0], 32) : undefined;
  const publishers = Array.isArray(item?.publisher) ? item.publisher.map((value) => cleanText(value, 180)).filter(Boolean) : [];
  const subjects = Array.isArray(item?.subject) ? item.subject.map((value) => cleanText(value, 100)).filter(Boolean).slice(0, 6) : [];
  const access = cleanText(item?.ebook_access, 40);
  const accessType = item?.public_scan_b === true || access === "public"
    ? "download"
    : access === "borrowable"
      ? "borrow"
      : "catalog";
  return {
    id: `open-library:${key || cleanText(item?.title, 180)}`,
    provider: "open-library",
    title: cleanText(item?.title, 600) || "Untitled",
    authors: Array.isArray(item?.author_name)
      ? item.author_name.map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 12)
      : [],
    year: Number.isFinite(item?.first_publish_year) ? item.first_publish_year : undefined,
    publisher: publishers[0] || undefined,
    description: subjects.length ? subjects.join(" · ") : undefined,
    coverUrl: Number.isFinite(coverId) ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
    language: languages.slice(0, 4).join(", ") || undefined,
    editionCount: Number.isFinite(item?.edition_count) ? item.edition_count : undefined,
    isbn: isbn || undefined,
    categories: subjects,
    isReadable: item?.public_scan_b === true || ["public", "borrowable"].includes(access),
    accessType,
    formats: item?.public_scan_b === true ? ["PDF", "EPUB", "DAISY"] : undefined,
    landingUrl: key ? `https://openlibrary.org${key}` : undefined,
    previewUrl: key ? `https://openlibrary.org${key}` : undefined,
  };
}

function normalizeGoogleBook(item) {
  const volume = item?.volumeInfo || {};
  const access = item?.accessInfo || {};
  const identifiers = Array.isArray(volume?.industryIdentifiers) ? volume.industryIdentifiers : [];
  const isbn = identifiers.find((entry) => entry?.type === "ISBN_13")?.identifier
    || identifiers.find((entry) => entry?.type === "ISBN_10")?.identifier;
  const yearMatch = cleanText(volume?.publishedDate, 40).match(/\b(?:1[5-9]|20)\d{2}\b/);
  const image = volume?.imageLinks?.thumbnail || volume?.imageLinks?.smallThumbnail;
  const categories = Array.isArray(volume?.categories)
    ? volume.categories.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 6)
    : [];
  const viewability = cleanText(access?.viewability, 40);
  const isReadable = ["ALL_PAGES", "PARTIAL"].includes(viewability)
    || access?.epub?.isAvailable === true
    || access?.pdf?.isAvailable === true;
  return {
    id: `google-books:${cleanText(item?.id, 180) || cleanText(volume?.title, 180)}`,
    provider: "google-books",
    title: cleanText([volume?.title, volume?.subtitle].filter(Boolean).join(": "), 600) || "Untitled",
    authors: Array.isArray(volume?.authors)
      ? volume.authors.map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 12)
      : [],
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    publisher: cleanText(volume?.publisher, 220) || undefined,
    description: cleanText(volume?.description, 3_000) || undefined,
    coverUrl: safeHttpsUrl(image),
    language: cleanText(volume?.language, 20) || undefined,
    pageCount: Number.isFinite(volume?.pageCount) ? volume.pageCount : undefined,
    isbn: cleanText(isbn, 32) || undefined,
    categories,
    isReadable,
    accessType: isReadable ? "preview" : "catalog",
    formats: [access?.epub?.isAvailable ? "EPUB" : "", access?.pdf?.isAvailable ? "PDF" : ""].filter(Boolean),
    landingUrl: safeHttpsUrl(volume?.infoLink || item?.selfLink),
    previewUrl: safeHttpsUrl(access?.webReaderLink || volume?.previewLink),
  };
}

function normalizeArchiveBook(item) {
  const identifier = cleanText(item?.identifier, 300);
  const formats = values(item?.format, 80);
  const formatText = formats.join(" ").toLowerCase();
  const restricted = String(item?.["access-restricted-item"] || "").toLowerCase() === "true";
  const downloadable = !restricted && /\b(epub|pdf|djvu|text)\b/i.test(formatText);
  const yearMatch = cleanText(item?.date || item?.year, 40).match(/\b(?:1[5-9]|20)\d{2}\b/);
  const subjects = values(item?.subject, 120).slice(0, 6);
  const descriptions = values(item?.description, 3_000);
  return {
    id: `internet-archive:${identifier || cleanText(item?.title, 180)}`,
    provider: "internet-archive",
    title: cleanText(item?.title, 600) || "Untitled",
    authors: values(item?.creator, 180).slice(0, 12),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    publisher: values(item?.publisher, 220)[0] || undefined,
    description: descriptions.join(" ") || undefined,
    coverUrl: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : undefined,
    language: values(item?.language, 40).slice(0, 4).join(", ") || undefined,
    categories: subjects,
    isReadable: Boolean(identifier),
    accessType: restricted ? "borrow" : downloadable ? "download" : "preview",
    formats: formats.filter((format) => /epub|pdf|djvu|text/i.test(format)).slice(0, 5),
    landingUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}` : undefined,
    previewUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}/mode/2up` : undefined,
  };
}

function escapeArchiveQuery(value) {
  return cleanText(value, 300).replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

function normalizeGutenbergEntry(entry) {
  const links = [...String(entry || "").matchAll(/<link\b([^>]*)\/?\s*>/gi)]
    .map((match) => xmlAttributes(match[1]));
  const subsection = links.find((link) => link.rel === "subsection" && /\/ebooks\/\d+\.opds(?:$|[?#])/i.test(link.href || ""));
  const ebookId = subsection?.href?.match(/\/ebooks\/(\d+)\.opds/i)?.[1];
  if (!ebookId) return undefined;
  const author = xmlTag(entry, "content", 500);
  return {
    id: `project-gutenberg:${ebookId}`,
    provider: "project-gutenberg",
    title: xmlTag(entry, "title", 600) || "Untitled",
    authors: author ? [author] : [],
    publisher: "Project Gutenberg",
    description: undefined,
    categories: ["eBook"],
    isReadable: true,
    accessType: "download",
    formats: ["EPUB", "HTML", "TXT", "Kindle"],
    landingUrl: `https://www.gutenberg.org/ebooks/${ebookId}`,
  };
}

async function searchOpenLibrary(input, fetcher) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", input.query);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,edition_count,language,subject,public_scan_b,ebook_access,isbn,publisher");
  if (input.sort === "newest") url.searchParams.set("sort", "new");
  const data = await fetchJson(fetcher, url.href);
  const results = Array.isArray(data?.docs) ? data.docs.map(normalizeOpenLibraryBook) : [];
  return { results, total: Number(data?.numFound) || results.length };
}

async function searchGoogleBooks(input, fetcher) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", input.query);
  url.searchParams.set("startIndex", String((input.page - 1) * PAGE_SIZE));
  url.searchParams.set("maxResults", String(PAGE_SIZE));
  url.searchParams.set("orderBy", input.sort === "newest" ? "newest" : "relevance");
  url.searchParams.set("printType", "books");
  url.searchParams.set("projection", "full");
  const data = await fetchJson(fetcher, url.href);
  const results = Array.isArray(data?.items) ? data.items.map(normalizeGoogleBook) : [];
  return { results, total: Number(data?.totalItems) || results.length };
}

async function searchInternetArchive(input, fetcher) {
  const url = new URL("https://archive.org/advancedsearch.php");
  const query = escapeArchiveQuery(input.query);
  url.searchParams.set("q", `mediatype:texts AND (title:(${query}) OR creator:(${query}) OR subject:(${query}))`);
  [
    "identifier",
    "title",
    "creator",
    "date",
    "description",
    "language",
    "publisher",
    "subject",
    "format",
    "access-restricted-item",
  ].forEach((field) => url.searchParams.append("fl[]", field));
  url.searchParams.set("rows", String(PAGE_SIZE));
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("output", "json");
  if (input.sort === "newest") url.searchParams.append("sort[]", "date desc");
  const data = await fetchJson(fetcher, url.href);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  return {
    results: docs.map(normalizeArchiveBook),
    total: Number(data?.response?.numFound) || docs.length,
    pageSize: PAGE_SIZE,
  };
}

async function searchProjectGutenberg(input, fetcher) {
  const url = new URL("https://www.gutenberg.org/ebooks/search.opds/");
  url.searchParams.set("query", input.query);
  if (input.page > 1) url.searchParams.set("start_index", String((input.page - 1) * GUTENBERG_PAGE_SIZE + 1));
  if (input.sort === "newest") url.searchParams.set("sort_order", "release_date");
  const xml = await fetchText(fetcher, url.href, "application/atom+xml,application/xml;q=0.9,text/xml;q=0.8");
  const results = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
    .map((match) => normalizeGutenbergEntry(match[1]))
    .filter(Boolean);
  const links = [...xml.matchAll(/<link\b([^>]*)\/?\s*>/gi)].map((match) => xmlAttributes(match[1]));
  const hasNext = links.some((link) => link.rel === "next");
  return {
    results,
    total: (input.page - 1) * GUTENBERG_PAGE_SIZE + results.length + (hasNext ? GUTENBERG_PAGE_SIZE : 0),
    hasNext,
    pageSize: GUTENBERG_PAGE_SIZE,
  };
}

async function searchBooks(payload, fetcher = globalThis.fetch) {
  const input = normalizePayload(payload);
  if (!input.query) throw new Error("请输入书名、作者、ISBN 或关键词。");
  const response = input.provider === "google-books"
    ? await searchGoogleBooks(input, fetcher)
    : input.provider === "internet-archive"
      ? await searchInternetArchive(input, fetcher)
      : input.provider === "project-gutenberg"
        ? await searchProjectGutenberg(input, fetcher)
        : await searchOpenLibrary(input, fetcher);
  const pageSize = response.pageSize || PAGE_SIZE;
  return {
    provider: input.provider,
    query: input.query,
    page: input.page,
    pageSize,
    total: response.total,
    hasNext: response.hasNext ?? (input.page * pageSize < response.total && response.results.length > 0),
    results: response.results,
  };
}

module.exports = {
  BOOK_SEARCH_PROVIDERS,
  normalizePayload,
  searchBooks,
};
