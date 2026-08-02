export type ManuscriptBlock = {
  text: string;
  start: number;
  end: number;
  kind: "chapter" | "section" | "body";
};

export type PreparedManuscript = {
  title: string;
  summary: string;
  manuscript: string;
};

export type CreationMessageIntent = "write" | "discuss" | "rewrite";

export function filterCreationMessages<T extends { intent: CreationMessageIntent }>(
  messages: T[],
  intent: CreationMessageIntent,
) {
  return messages.filter((message) => message.intent === intent);
}

const CHINESE_NUMBER = "[〇零一二三四五六七八九十百千万两0-9０-９]+";
const MANUSCRIPT_METADATA = /^(?:核心人物|主要人物|人物设定|角色设定|故事冲突|核心冲突|背景设定|世界观|故事梗概|内容简介|创作说明|写作说明|题材|类型|主题|视角|时代|风格|大纲)\s*[:：]/i;
const MANUSCRIPT_TITLE = /^(?:【|\[)?\s*(?:书名|作品名|标题|title)\s*(?:】|\])?\s*[:：]?\s*[《〈“"'「『]?(.+?)[》〉”"'」』]?\s*$/i;
const MANUSCRIPT_SUMMARY = /^(?:【|\[)?\s*(?:剧情概述|内容概述|本次剧情|故事概述|梗概|plot summary|content summary)\s*(?:】|\])?\s*[:：]?\s*(.*?)\s*$/i;
const MANUSCRIPT_BODY = /^(?:【|\[)?\s*(?:正文|manuscript|body)\s*(?:】|\])?\s*[:：]?\s*$/i;
const MANUSCRIPT_SEPARATOR = /^(?:-{3,}|—{3,}|\*{3,}|_{3,}|·{3,})$/;

export function isBookChapterHeading(text: string) {
  const value = text.trim();
  if (!value || value.length > 72) return false;
  const chineseChapter = new RegExp(`^第\\s*${CHINESE_NUMBER}\\s*[章节卷部回篇](?:\\s*.*)?$`);
  const namedChapter = /^(?:(?:上|中|下)卷|序章|楔子|引子|序言|前言|尾声|后记|终章|番外(?:篇)?(?:\s*[一二三四五六七八九十0-9]+)?)(?:[\s：:·—-].*)?$/i;
  const englishChapter = /^(?:chapter\s+[\divxlcm]+|prologue|epilogue)(?:[\s：:·—-].*)?$/i;
  return chineseChapter.test(value) || namedChapter.test(value) || englishChapter.test(value);
}

export function isBookSectionHeading(text: string) {
  const value = text.trim();
  if (!value || value.length > 56 || /[。！？.!?][”’"']?$/.test(value)) return false;
  const chineseScene = /^(?:(?:第\s*)?[〇零一二三四五六七八九十百千万两0-9０-９]+\s*[幕场节]|场景\s*[〇零一二三四五六七八九十百千万两0-9０-９]+)(?:[\s：:·—-].{1,30})?$/;
  const numberedSection = /^(?:[〇零一二三四五六七八九十百千万两]+[、.]|\d+(?:\.\d+){1,2})\s*\S.{0,30}$/;
  const englishSection = /^(?:scene|section|part)\s+(?:\d+|[ivxlcm]+)(?:[\s:·—-].{1,30})?$/i;
  return chineseScene.test(value) || numberedSection.test(value) || englishSection.test(value);
}

export function normalizeManuscript(value: string) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```(?:markdown|text|md)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*\*\*(.+)\*\*\s*$/, "$1")
      .replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized;
}

export function prepareGeneratedManuscript(value: string): PreparedManuscript {
  const normalized = normalizeManuscript(value);
  if (!normalized) return { title: "", summary: "", manuscript: "" };

  const lines = normalized.split("\n");
  let title = "";
  let summary = "";
  let bodyStart = -1;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const titleMatch = trimmed.match(MANUSCRIPT_TITLE);
    const summaryMatch = trimmed.match(MANUSCRIPT_SUMMARY);
    if (!title && titleMatch) title = titleMatch[1].trim();
    if (!summary && summaryMatch?.[1]) summary = summaryMatch[1].trim();
    if (bodyStart < 0 && MANUSCRIPT_BODY.test(trimmed)) bodyStart = index + 1;
  });

  if (bodyStart >= 0) {
    const manuscript = normalizeManuscript(lines.slice(bodyStart).join("\n"));
    return { title, summary, manuscript };
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  let hasPrefaceMetadata = false;

  blocks.forEach((block) => {
    const firstLine = block.split("\n")[0].trim();
    const titleMatch = firstLine.match(MANUSCRIPT_TITLE);
    const summaryMatch = firstLine.match(MANUSCRIPT_SUMMARY);
    if (titleMatch) {
      if (!title) title = titleMatch[1].trim();
      hasPrefaceMetadata = true;
    } else if (summaryMatch) {
      if (!summary && summaryMatch[1]) summary = summaryMatch[1].trim();
      hasPrefaceMetadata = true;
    } else if (MANUSCRIPT_METADATA.test(firstLine) || MANUSCRIPT_SEPARATOR.test(firstLine)) {
      hasPrefaceMetadata = true;
    }
  });

  const firstChapterIndex = blocks.findIndex((block) => isBookChapterHeading(block.split("\n")[0]));
  const startIndex = firstChapterIndex > 0 && hasPrefaceMetadata ? firstChapterIndex : 0;
  const manuscript = blocks
    .slice(startIndex)
    .filter((block) => {
      const firstLine = block.split("\n")[0].trim();
      return !MANUSCRIPT_TITLE.test(firstLine)
        && !MANUSCRIPT_SUMMARY.test(firstLine)
        && !MANUSCRIPT_BODY.test(firstLine)
        && !MANUSCRIPT_METADATA.test(firstLine)
        && !MANUSCRIPT_SEPARATOR.test(firstLine);
    })
    .join("\n\n")
    .trim();

  return { title, summary, manuscript };
}

export function appendManuscript(current: string, addition: string) {
  const base = normalizeManuscript(current);
  const next = normalizeManuscript(addition);
  if (!base) return next;
  if (!next) return base;
  return `${base}\n\n${next}`;
}

export function replaceManuscriptRange(
  manuscript: string,
  start: number,
  end: number,
  replacement: string,
) {
  const safeStart = Math.max(0, Math.min(manuscript.length, Math.round(start)));
  const safeEnd = Math.max(safeStart, Math.min(manuscript.length, Math.round(end)));
  const before = manuscript.slice(0, safeStart).replace(/\s+$/g, "");
  const after = manuscript.slice(safeEnd).replace(/^\s+/g, "");
  return [before, normalizeManuscript(replacement), after]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitManuscriptBlocks(manuscript: string): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];
  let cursor = 0;
  manuscript.split(/\n{2,}/).forEach((raw) => {
    const rawStart = manuscript.indexOf(raw, cursor);
    cursor = rawStart + raw.length;
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return;
    const start = rawStart + leading;
    blocks.push({
      text,
      start,
      end: start + text.length,
      kind: isBookChapterHeading(text) ? "chapter" : isBookSectionHeading(text) ? "section" : "body",
    });
  });

  return blocks;
}

export function manuscriptWordCount(manuscript: string) {
  const compact = manuscript.replace(/\s+/g, "");
  const latinWords = manuscript.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  const cjkCharacters = compact.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length || 0;
  return cjkCharacters + latinWords;
}
