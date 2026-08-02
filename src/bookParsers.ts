import JSZip from "jszip";
import type { DocumentType, Paragraph, TableOfContentsItem, TableOfContentsSource } from "./models";
import { detectTableOfContents } from "./tableOfContents";

export type ParsedBookDocument = {
  paragraphs: Paragraph[];
  pageCount?: number;
  tableOfContents: TableOfContentsItem[];
  tableOfContentsSource: TableOfContentsSource;
  title?: string;
  authors?: string;
  venue?: string;
};

const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,blockquote,pre,li";

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function looksLikeBookHeading(value: string) {
  const text = normalizeText(value);
  if (!text || text.length > 100 || /[。！？.!?]$/.test(text)) return false;
  return /^(?:第[零〇一二三四五六七八九十百千万两\d]{1,12}[章节回部卷集篇幕]|序(?:章|言)?|楔子|引子|前言|后记|尾声|终章|番外|附录)/u.test(text)
    || /^\d+(?:\.\d+){0,2}[、.\s]+\S+/.test(text)
    || /^[IVXLCDM]+[.\s]+\S+/i.test(text)
    || (/^[A-Z][A-Z\s'’-]{2,}$/.test(text) && text.length < 70);
}

export function decodeBookText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = bytes.slice(2);
    for (let index = 0; index + 1 < swapped.length; index += 2) {
      [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacementRatio = (utf8.match(/\uFFFD/g)?.length || 0) / Math.max(1, utf8.length);
  if (replacementRatio < 0.004) return utf8.replace(/^\uFEFF/, "");
  try {
    return new TextDecoder("gb18030").decode(bytes);
  } catch {
    return utf8;
  }
}

export function splitBookText(text: string, prefix = "book"): Paragraph[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: Paragraph[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const value = normalizeText(buffer.join(" "));
    buffer = [];
    if (!value) return;
    paragraphs.push({
      id: `${prefix}-p-${paragraphs.length}-${hashText(value)}`,
      text: value,
      kind: looksLikeBookHeading(value) ? "heading" : "body",
    });
  };

  for (const rawLine of lines) {
    const line = normalizeText(rawLine);
    if (!line) {
      flush();
      continue;
    }
    if (looksLikeBookHeading(line)) {
      flush();
      paragraphs.push({
        id: `${prefix}-h-${paragraphs.length}-${hashText(line)}`,
        text: line,
        kind: "heading",
      });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

function parseHtmlBlocks(document: Document, prefix: string) {
  const paragraphs: Paragraph[] = [];
  const anchorMap = new Map<string, string>();
  const unresolvedLinks: Array<{
    paragraphId: string;
    start: number;
    end: number;
    href: string;
  }> = [];
  const elements = Array.from(document.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  for (const element of elements) {
    if (element.parentElement?.closest(BLOCK_SELECTOR)) continue;
    const text = normalizeText(element.textContent || "");
    if (!text) continue;
    const isHeading = /^H[1-6]$/.test(element.tagName) || looksLikeBookHeading(text);
    const id = `${prefix}-${isHeading ? "h" : "p"}-${paragraphs.length}-${hashText(text)}`;
    paragraphs.push({ id, text, kind: isHeading ? "heading" : "body" });
    if (!anchorMap.has("")) anchorMap.set("", id);
    if (element.id) anchorMap.set(element.id, id);
    if (element.getAttribute("name")) anchorMap.set(element.getAttribute("name")!, id);
    element.querySelectorAll<HTMLElement>("[id],[name]").forEach((child) => {
      const anchor = child.id || child.getAttribute("name");
      if (anchor) anchorMap.set(anchor, id);
    });
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const anchor = ancestor.id || ancestor.getAttribute("name");
      if (anchor && !anchorMap.has(anchor)) anchorMap.set(anchor, id);
      ancestor = ancestor.parentElement;
    }

    let searchFrom = 0;
    element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
      const label = normalizeText(link.textContent || "");
      const href = link.getAttribute("href") || "";
      if (!label || !href) return;
      let start = text.indexOf(label, searchFrom);
      if (start < 0) start = text.indexOf(label);
      if (start < 0) return;
      unresolvedLinks.push({
        paragraphId: id,
        start,
        end: start + label.length,
        href,
      });
      searchFrom = start + label.length;
    });
  }
  return { paragraphs, anchorMap, unresolvedLinks };
}

function parseHtmlDocument(text: string, prefix: string) {
  const document = new DOMParser().parseFromString(text, "text/html");
  const { paragraphs } = parseHtmlBlocks(document, prefix);
  return {
    paragraphs,
    title: normalizeText(document.querySelector("title")?.textContent || "") || undefined,
    authors: normalizeText(document.querySelector('meta[name="author"]')?.getAttribute("content") || "") || undefined,
  };
}

function parseMarkdown(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs: Paragraph[] = [];
  let body: string[] = [];
  let inFence = false;
  const cleanMarkdown = (value: string) => normalizeText(value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)[*_~`]{1,3}|[*_~`]{1,3}(?=\s|$)/g, "$1")
    .replace(/^>\s?/, ""));
  const flush = () => {
    const value = cleanMarkdown(body.join(" "));
    body = [];
    if (!value) return;
    paragraphs.push({ id: `md-p-${paragraphs.length}-${hashText(value)}`, text: value, kind: "body" });
  };
  normalized.split("\n").forEach((rawLine) => {
    if (/^\s*```/.test(rawLine)) { inFence = !inFence; return; }
    if (inFence) return;
    const heading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      flush();
      const value = cleanMarkdown(heading[1]);
      if (value) paragraphs.push({ id: `md-h-${paragraphs.length}-${hashText(value)}`, text: value, kind: "heading" });
      return;
    }
    const line = cleanMarkdown(rawLine);
    if (!line) flush();
    else body.push(line);
  });
  flush();
  return paragraphs;
}

function xmlLocalText(document: XMLDocument, localName: string) {
  return normalizeText(document.getElementsByTagNameNS("*", localName)[0]?.textContent || "") || undefined;
}

function parseFb2(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("FB2 文件结构无效，无法解析。");
  const paragraphs: Paragraph[] = [];
  const body = Array.from(document.getElementsByTagNameNS("*", "body"))[0] || document.documentElement;
  const blocks = Array.from(body.querySelectorAll("title,p,subtitle,epigraph,text-author"));
  for (const block of blocks) {
    if (block.parentElement?.closest("title,p,subtitle,epigraph,text-author")) continue;
    const value = normalizeText(block.textContent || "");
    if (!value) continue;
    const isHeading = ["title", "subtitle"].includes(block.localName) || looksLikeBookHeading(value);
    paragraphs.push({
      id: `fb2-${isHeading ? "h" : "p"}-${paragraphs.length}-${hashText(value)}`,
      text: value,
      kind: isHeading ? "heading" : "body",
    });
  }
  const firstName = xmlLocalText(document, "first-name") || "";
  const middleName = xmlLocalText(document, "middle-name") || "";
  const lastName = xmlLocalText(document, "last-name") || "";
  return {
    paragraphs,
    title: xmlLocalText(document, "book-title"),
    authors: normalizeText([firstName, middleName, lastName].filter(Boolean).join(" ")) || undefined,
    venue: xmlLocalText(document, "publisher"),
  };
}

function normalizeZipPath(value: string) {
  const parts: string[] = [];
  value.replace(/\\/g, "/").split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

function splitHref(value: string) {
  const [pathPart, fragment = ""] = value.split("#", 2);
  const decode = (part: string) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  return { path: decode(pathPart.split("?", 1)[0]), fragment: decode(fragment || "") };
}

export function resolveZipHref(baseFile: string, href: string) {
  const { path, fragment } = splitHref(href);
  const baseDirectory = baseFile.includes("/") ? baseFile.slice(0, baseFile.lastIndexOf("/") + 1) : "";
  return {
    path: path ? normalizeZipPath(`${baseDirectory}${path}`) : normalizeZipPath(baseFile),
    fragment,
  };
}

async function readZipText(zip: JSZip, filePath: string) {
  const entry = zip.file(filePath) || zip.file(filePath.replace(/\//g, "\\"));
  if (!entry) throw new Error(`EPUB 缺少资源：${filePath}`);
  return entry.async("string");
}

function epubType(element: Element) {
  return element.getAttribute("epub:type")
    || element.getAttributeNS("http://www.idpf.org/2007/ops", "type")
    || "";
}

async function parseEpub(buffer: ArrayBuffer): Promise<ParsedBookDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const containerText = await readZipText(zip, "META-INF/container.xml");
  const container = new DOMParser().parseFromString(containerText, "application/xml");
  const rootfile = Array.from(container.getElementsByTagNameNS("*", "rootfile"))[0];
  const packagePath = normalizeZipPath(rootfile?.getAttribute("full-path") || "");
  if (!packagePath) throw new Error("EPUB 缺少 META-INF/container.xml 中的书籍入口。");

  const packageText = await readZipText(zip, packagePath);
  const packageDocument = new DOMParser().parseFromString(packageText, "application/xml");
  if (packageDocument.querySelector("parsererror")) throw new Error("EPUB 的 OPF 书籍信息无法解析。");
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  Array.from(packageDocument.getElementsByTagNameNS("*", "item")).forEach((item) => {
    const id = item.getAttribute("id") || "";
    const href = item.getAttribute("href") || "";
    if (id && href) manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || "",
    });
  });

  const spineIds = Array.from(packageDocument.getElementsByTagNameNS("*", "itemref"))
    .map((item) => item.getAttribute("idref") || "")
    .filter(Boolean);
  const paragraphs: Paragraph[] = [];
  const anchorLookup = new Map<string, string>();
  const firstParagraphByPath = new Map<string, string>();
  const unresolvedLinks: Array<{
    paragraphId: string;
    sourcePath: string;
    start: number;
    end: number;
    href: string;
  }> = [];

  for (let spineIndex = 0; spineIndex < spineIds.length; spineIndex += 1) {
    const item = manifest.get(spineIds[spineIndex]);
    if (!item || !/(?:xhtml|html|xml)/i.test(item.mediaType)) continue;
    const resolved = resolveZipHref(packagePath, item.href);
    const htmlText = await readZipText(zip, resolved.path);
    const document = new DOMParser().parseFromString(htmlText, "text/html");
    const parsed = parseHtmlBlocks(document, `epub-${spineIndex + 1}`);
    if (!parsed.paragraphs.length) continue;
    paragraphs.push(...parsed.paragraphs);
    firstParagraphByPath.set(resolved.path, parsed.paragraphs[0].id);
    parsed.anchorMap.forEach((paragraphId, anchor) => {
      anchorLookup.set(`${resolved.path}#${anchor}`, paragraphId);
    });
    parsed.unresolvedLinks.forEach((link) => unresolvedLinks.push({
      ...link,
      sourcePath: resolved.path,
    }));
  }

  const paragraphsById = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  unresolvedLinks.forEach((link) => {
    if (/^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(link.href)) return;
    const target = resolveZipHref(link.sourcePath, link.href);
    const targetParagraphId = anchorLookup.get(`${target.path}#${target.fragment}`)
      || firstParagraphByPath.get(target.path);
    const paragraph = paragraphsById.get(link.paragraphId);
    if (!paragraph || !targetParagraphId || link.end <= link.start) return;
    const duplicate = paragraph.links?.some((item) => (
      item.start === link.start
      && item.end === link.end
      && item.targetParagraphId === targetParagraphId
    ));
    if (duplicate) return;
    paragraph.links = [
      ...(paragraph.links || []),
      {
        start: link.start,
        end: link.end,
        targetParagraphId,
      },
    ];
  });

  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes("nav"));
  let tableOfContents: TableOfContentsItem[] = [];
  if (navItem) {
    const navPath = resolveZipHref(packagePath, navItem.href).path;
    const navText = await readZipText(zip, navPath);
    const navDocument = new DOMParser().parseFromString(navText, "text/html");
    const tocNav = Array.from(navDocument.querySelectorAll("nav"))
      .find((element) => epubType(element).split(/\s+/).includes("toc"))
      || navDocument.querySelector("nav");
    const walkList = (list: Element, level: 1 | 2 | 3): TableOfContentsItem[] => (
      Array.from(list.children).filter((child) => child.localName === "li").map((li, index) => {
        const link = li.querySelector(":scope > a[href]") || li.querySelector("a[href]");
        const title = normalizeText(link?.textContent || "") || `Chapter ${index + 1}`;
        const target = resolveZipHref(navPath, link?.getAttribute("href") || "");
        const paragraphId = anchorLookup.get(`${target.path}#${target.fragment}`)
          || firstParagraphByPath.get(target.path);
        const nested = Array.from(li.children).find((child) => ["ol", "ul"].includes(child.localName));
        const children = nested && level < 3 ? walkList(nested, (level + 1) as 2 | 3) : [];
        return {
          id: `epub-toc-${level}-${index}-${hashText(`${target.path}#${target.fragment}`)}`,
          title,
          level,
          paragraphId,
          ...(children.length ? { children } : {}),
        };
      })
    );
    const rootList = tocNav && Array.from(tocNav.children).find((child) => ["ol", "ul"].includes(child.localName));
    if (rootList) tableOfContents = walkList(rootList, 1);
  }

  if (!paragraphs.length) throw new Error("EPUB 中没有可读取的正文，文件可能受 DRM 保护或结构不受支持。");
  const hasEmbeddedTableOfContents = tableOfContents.length > 0;
  if (!tableOfContents.length) tableOfContents = detectTableOfContents(paragraphs);
  const creators = Array.from(packageDocument.getElementsByTagNameNS("*", "creator"))
    .map((item) => normalizeText(item.textContent || ""))
    .filter(Boolean);
  return {
    paragraphs,
    tableOfContents,
    tableOfContentsSource: hasEmbeddedTableOfContents ? "embedded" : "detected",
    title: xmlLocalText(packageDocument, "title"),
    authors: creators.join(" · ") || undefined,
    venue: xmlLocalText(packageDocument, "publisher"),
  };
}

export async function parseBookDocument(buffer: ArrayBuffer, type: Exclude<DocumentType, "pdf" | "docx">): Promise<ParsedBookDocument> {
  if (type === "epub") return parseEpub(buffer);
  const text = decodeBookText(buffer);
  if (type === "html") {
    const parsed = parseHtmlDocument(text, "html");
    return {
      ...parsed,
      tableOfContents: detectTableOfContents(parsed.paragraphs),
      tableOfContentsSource: "detected",
    };
  }
  if (type === "fb2") {
    const parsed = parseFb2(text);
    return {
      ...parsed,
      tableOfContents: detectTableOfContents(parsed.paragraphs),
      tableOfContentsSource: "detected",
    };
  }
  const paragraphs = type === "md" ? parseMarkdown(text) : splitBookText(text, type);
  return {
    paragraphs,
    tableOfContents: detectTableOfContents(paragraphs),
    tableOfContentsSource: "detected",
  };
}
