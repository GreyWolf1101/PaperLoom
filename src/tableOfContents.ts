import type { Paragraph, TableOfContentsItem } from "./models";

export type PdfOutlineEntry = {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineEntry[];
};

type FlatHeading = Omit<TableOfContentsItem, "children">;

const COMMON_SECTION_HEADING = /^(?:abstract|keywords?|introduction|background|related\s+work|literature\s+review|materials?\s+and\s+methods?|methodology|methods?|experimental\s+(?:setup|design)|experiments?|results?|discussion|conclusions?|limitations?|future\s+work|acknowledg(?:e)?ments?|references|appendix(?:\s+[a-z0-9]+)?|摘要|关键词|引言|绪论|研究背景|背景|相关工作|文献综述|材料与方法|研究方法|方法|实验(?:设计|结果)?|结果|讨论|结论|局限(?:性)?|未来工作|展望|致谢|参考文献|附录)(?:\s*[:：.．-]?\s*.*)?$/i;
const CAPTION_OR_METADATA = /^(?:fig(?:ure)?\.?|table|图|表)\s*\d|^(?:doi|https?:\/\/|www\.)|@|\.{3,}\s*\d+\s*$/i;
const SYNTHETIC_PAGE_MARKER = /^(?:第\s*)?\d+\s*(?:页|page)$/i;

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanHeading(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isProbableStandaloneHeading(value: string) {
  const text = cleanHeading(value);
  if (!text || text.length > 160 || SYNTHETIC_PAGE_MARKER.test(text) || CAPTION_OR_METADATA.test(text)) return false;
  if (/[。！？!?]$/.test(text)) return false;
  if (/^第\s*[一二三四五六七八九十百千万0-9]+\s*[章节篇部]/.test(text)) return true;
  if (/^\d+(?:\.\d+){0,2}(?:[.)、：:\s]|$)/.test(text)) return true;
  if (/^[IVXLC]+[.)、：:\s]/i.test(text)) return true;
  if (/^[一二三四五六七八九十百]+[、.．]\s*/.test(text)) return true;
  if (/^[（(][一二三四五六七八九十百0-9]+[）)]\s*/.test(text)) return true;
  return COMMON_SECTION_HEADING.test(text);
}

function explicitHeadingLevel(value: string): 1 | 2 | 3 | undefined {
  const text = cleanHeading(value);
  const numbered = text.match(/^(\d+(?:\.\d+){0,2})(?:[.)、：:\s]|$)/);
  if (numbered) return Math.min(3, numbered[1].split(".").length) as 1 | 2 | 3;
  if (/^第\s*[一二三四五六七八九十百千万0-9]+\s*[章篇部]/.test(text)) return 1;
  if (/^第\s*[一二三四五六七八九十百千万0-9]+\s*节/.test(text)) return 2;
  if (/^[IVXLC]+[.)、：:\s]/i.test(text) || /^[一二三四五六七八九十百]+[、.．]\s*/.test(text)) return 1;
  if (/^[（(][一二三四五六七八九十百0-9]+[）)]\s*/.test(text)) return 2;
  if (COMMON_SECTION_HEADING.test(text)) return 1;
  return undefined;
}

function candidateFontLevels(paragraphs: Paragraph[]) {
  const bodySizes = paragraphs
    .filter((paragraph) => !SYNTHETIC_PAGE_MARKER.test(cleanHeading(paragraph.text)))
    .map((paragraph) => paragraph.fontSize)
    .filter((size): size is number => typeof size === "number" && Number.isFinite(size) && size > 0)
    .sort((left, right) => left - right);
  const bodyMedian = bodySizes.length ? bodySizes[Math.floor(bodySizes.length / 2)] : 0;
  const headingSizes = [...new Set(paragraphs
    .filter((paragraph) => paragraph.kind === "heading" && isGenericHeadingCandidate(paragraph.text))
    .map((paragraph) => paragraph.fontSize)
    .filter((size): size is number => typeof size === "number" && size >= bodyMedian * 1.08)
    .map((size) => Math.round(size * 10) / 10))]
    .sort((left, right) => right - left)
    .slice(0, 3);
  return { bodyMedian, headingSizes };
}

function isGenericHeadingCandidate(value: string) {
  const text = cleanHeading(value);
  if (!text || text.length > 100 || SYNTHETIC_PAGE_MARKER.test(text) || CAPTION_OR_METADATA.test(text)) return false;
  if (/[。！？!?；;]$/.test(text) || /[,，]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 14) return false;
  if (/^[a-z]/.test(text)) return false;
  return true;
}

function inferHeadingLevel(
  paragraph: Paragraph,
  bodyMedian: number,
  headingSizes: number[],
): 1 | 2 | 3 | undefined {
  const explicit = explicitHeadingLevel(paragraph.text);
  if (explicit) return explicit;
  if (paragraph.kind !== "heading" || !isGenericHeadingCandidate(paragraph.text)) return undefined;
  if (paragraph.fontSize && bodyMedian && paragraph.fontSize >= bodyMedian * 1.08) {
    const rounded = Math.round(paragraph.fontSize * 10) / 10;
    const index = headingSizes.findIndex((size) => Math.abs(size - rounded) <= 0.2);
    return Math.min(3, Math.max(1, index + 1)) as 1 | 2 | 3;
  }
  if (paragraph.fontSize) return undefined;
  return 1;
}

function nestHeadings(flat: FlatHeading[]) {
  const roots: TableOfContentsItem[] = [];
  const stack: TableOfContentsItem[] = [];
  flat.forEach((heading) => {
    const item: TableOfContentsItem = { ...heading, children: [] };
    while (stack.length && stack[stack.length - 1].level >= item.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children!.push(item);
    else roots.push(item);
    stack.push(item);
  });
  const removeEmptyChildren = (items: TableOfContentsItem[]): TableOfContentsItem[] => items.map((item) => ({
    ...item,
    children: item.children?.length ? removeEmptyChildren(item.children) : undefined,
  }));
  return removeEmptyChildren(roots);
}

export function detectTableOfContents(paragraphs: Paragraph[]) {
  const { bodyMedian, headingSizes } = candidateFontLevels(paragraphs);
  const seen = new Set<string>();
  const flat: FlatHeading[] = [];
  for (const paragraph of paragraphs) {
    const title = cleanHeading(paragraph.text);
    const level = inferHeadingLevel(paragraph, bodyMedian, headingSizes);
    if (!level || !title || SYNTHETIC_PAGE_MARKER.test(title)) continue;
    const duplicateKey = `${title.toLocaleLowerCase()}|${paragraph.page ?? "doc"}`;
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    flat.push({
      id: `detected-${paragraph.page ?? 0}-${stableHash(`${paragraph.id}|${title}`)}`,
      title,
      level,
      page: paragraph.page,
      paragraphId: paragraph.id,
    });
    if (flat.length >= 180) break;
  }
  return nestHeadings(flat);
}

export async function buildEmbeddedTableOfContents(
  outline: PdfOutlineEntry[] | null | undefined,
  resolvePage: (destination: string | unknown[] | null | undefined) => Promise<number | undefined>,
) {
  if (!outline?.length) return [];

  const visit = async (
    entries: PdfOutlineEntry[],
    level: 1 | 2 | 3,
    path: number[],
  ): Promise<TableOfContentsItem[]> => {
    const result: TableOfContentsItem[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const title = cleanHeading(entry.title || "");
      const childLevel = Math.min(3, level + 1) as 1 | 2 | 3;
      const children = level < 3 && entry.items?.length
        ? await visit(entry.items, childLevel, [...path, index])
        : [];
      let page: number | undefined;
      try {
        page = await resolvePage(entry.dest);
      } catch {
        page = undefined;
      }
      page ||= children.find((child) => child.page)?.page;
      if (!title || (!page && !children.length)) continue;
      result.push({
        id: `embedded-${[...path, index].join("-")}-${stableHash(title)}`,
        title,
        level,
        page,
        children: children.length ? children : undefined,
      });
    }
    return result;
  };

  return visit(outline, 1, []);
}

export function countTableOfContentsItems(items: TableOfContentsItem[]): number {
  return items.reduce((count, item) => count + 1 + countTableOfContentsItems(item.children || []), 0);
}
