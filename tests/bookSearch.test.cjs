const assert = require("node:assert/strict");
const { searchBooks } = require("../electron/book-search.cjs");

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function textResponse(payload) {
  return { ok: true, status: 200, text: async () => payload };
}

async function verifyOpenLibrarySearch() {
  let requestedUrl = "";
  const result = await searchBooks({ provider: "open-library", query: "Pride and Prejudice", page: 2 }, async (url) => {
    requestedUrl = url;
    return response({
      numFound: 41,
      docs: [{
        key: "/works/OL66554W",
        title: "Pride and Prejudice",
        author_name: ["Jane Austen"],
        first_publish_year: 1813,
        cover_i: 123,
        edition_count: 928,
        language: ["eng"],
        subject: ["Courtship", "Fiction"],
        public_scan_b: true,
        isbn: ["9780141439518"],
        publisher: ["T. Egerton"],
      }],
    });
  });

  const url = new URL(requestedUrl);
  assert.equal(url.hostname, "openlibrary.org");
  assert.equal(url.searchParams.get("q"), "Pride and Prejudice");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(result.total, 41);
  assert.equal(result.hasNext, true);
  assert.equal(result.results[0].authors[0], "Jane Austen");
  assert.equal(result.results[0].landingUrl, "https://openlibrary.org/works/OL66554W");
  assert.equal(result.results[0].isReadable, true);
}

async function verifyGoogleBooksSearch() {
  let requestedUrl = "";
  const result = await searchBooks({ provider: "google-books", query: "活着", sort: "newest" }, async (url) => {
    requestedUrl = url;
    return response({
      totalItems: 1,
      items: [{
        id: "demo-volume",
        volumeInfo: {
          title: "活着",
          subtitle: "新版",
          authors: ["余华"],
          publishedDate: "2021-01-01",
          publisher: "作家出版社",
          description: "一部长篇小说",
          pageCount: 216,
          language: "zh-CN",
          categories: ["Fiction"],
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9787506365437" }],
          imageLinks: { thumbnail: "http://books.google.com/cover.jpg" },
          infoLink: "https://books.google.com/books?id=demo-volume",
        },
        accessInfo: {
          viewability: "PARTIAL",
          webReaderLink: "https://books.google.com/books/reader?id=demo-volume",
        },
      }],
    });
  });

  const url = new URL(requestedUrl);
  assert.equal(url.hostname, "www.googleapis.com");
  assert.equal(url.searchParams.get("orderBy"), "newest");
  assert.equal(result.results[0].title, "活着: 新版");
  assert.equal(result.results[0].coverUrl, "https://books.google.com/cover.jpg");
  assert.equal(result.results[0].pageCount, 216);
  assert.equal(result.results[0].isReadable, true);
}

async function verifyInternetArchiveEbookSearch() {
  let requestedUrl = "";
  const result = await searchBooks({ provider: "internet-archive", query: "Pride and Prejudice" }, async (url) => {
    requestedUrl = url;
    return response({
      response: {
        numFound: 3,
        docs: [{
          identifier: "prideprejudice-demo",
          title: "Pride and Prejudice",
          creator: "Jane Austen",
          date: "1813-01-01T00:00:00Z",
          publisher: "Demo Library",
          language: "eng",
          subject: ["Courtship", "Fiction"],
          format: ["EPUB", "Text PDF"],
          "access-restricted-item": "true",
        }],
      },
    });
  });

  const url = new URL(requestedUrl);
  assert.equal(url.hostname, "archive.org");
  assert.match(url.searchParams.get("q"), /mediatype:texts/);
  assert.equal(result.results[0].provider, "internet-archive");
  assert.equal(result.results[0].accessType, "borrow");
  assert.match(result.results[0].previewUrl, /mode\/2up$/);
}

async function verifyProjectGutenbergEbookSearch() {
  let requestedUrl = "";
  const result = await searchBooks({ provider: "project-gutenberg", query: "Pride and Prejudice", page: 2 }, async (url) => {
    requestedUrl = url;
    return textResponse(`<?xml version="1.0"?><feed>
      <entry><title>Pride &amp; Prejudice</title><content type="text">Jane Austen</content>
        <link type="application/atom+xml" rel="subsection" href="/ebooks/1342.opds"/>
      </entry>
    </feed>`);
  });

  const url = new URL(requestedUrl);
  assert.equal(url.hostname, "www.gutenberg.org");
  assert.equal(url.searchParams.get("start_index"), "26");
  assert.equal(result.pageSize, 25);
  assert.equal(result.results[0].title, "Pride & Prejudice");
  assert.equal(result.results[0].accessType, "download");
  assert.deepEqual(result.results[0].formats, ["EPUB", "HTML", "TXT", "Kindle"]);
  assert.equal(result.results[0].landingUrl, "https://www.gutenberg.org/ebooks/1342");
}

async function main() {
  await verifyOpenLibrarySearch();
  await verifyGoogleBooksSearch();
  await verifyInternetArchiveEbookSearch();
  await verifyProjectGutenbergEbookSearch();
  console.log("book-search tests passed");
}

void main();
