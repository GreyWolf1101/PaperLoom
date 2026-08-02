import type {
  ComparisonCell,
  ComparisonField,
  ComparisonRow,
  EvidenceCard,
  EvidenceRelation,
  EvidenceType,
  Paragraph,
  ReferenceItem,
  ResearchDocument,
  ResearchProject,
  ResearchWorkspaceState,
  SemanticSearchResult,
} from "./models";

export const RESEARCH_STORAGE_KEY = "paperloom.research-workspace.v1";

export const COMPARISON_FIELDS: ComparisonField[] = [
  "question",
  "method",
  "sample",
  "metrics",
  "findings",
  "limitations",
];

export const EVIDENCE_TYPES: EvidenceType[] = [
  "claim",
  "method",
  "result",
  "data",
  "limitation",
  "quote",
  "question",
  "idea",
];

export const EVIDENCE_RELATIONS: EvidenceRelation[] = [
  "neutral",
  "support",
  "qualify",
  "contradict",
];

const EMPTY_CELL: ComparisonCell = { value: "" };
const FIELD_HINTS: Record<ComparisonField, string[]> = {
  question: [
    "research question", "objective", "aim", "purpose", "hypothesis", "introduction", "abstract",
    "研究问题", "研究目的", "目标", "假设", "引言", "摘要", "本文旨在", "本研究",
  ],
  method: [
    "method", "methodology", "approach", "framework", "model", "algorithm", "procedure",
    "方法", "方法学", "模型", "算法", "框架", "流程", "实验设计",
  ],
  sample: [
    "dataset", "sample", "participant", "patient", "cohort", "corpus", "data source",
    "数据集", "样本", "受试者", "患者", "队列", "语料", "数据来源", "纳入",
  ],
  metrics: [
    "metric", "measure", "accuracy", "precision", "recall", "f1", "auc", "evaluation",
    "指标", "准确率", "精确率", "召回率", "评价", "评估", "显著性", "置信区间",
  ],
  findings: [
    "result", "finding", "conclusion", "outperform", "improve", "significant", "discussion",
    "结果", "发现", "结论", "优于", "提升", "显著", "讨论", "表明",
  ],
  limitations: [
    "limitation", "future work", "threat", "weakness", "however", "restricted",
    "局限", "不足", "未来工作", "限制", "然而", "有待", "缺陷",
  ],
};

const TERM_GROUPS = [
  ["method", "methodology", "approach", "方法", "算法", "模型", "框架"],
  ["result", "finding", "conclusion", "结果", "结论", "发现"],
  ["limitation", "weakness", "constraint", "局限", "不足", "限制"],
  ["dataset", "sample", "cohort", "数据集", "样本", "队列"],
  ["metric", "evaluation", "measure", "指标", "评价", "评估"],
  ["contradiction", "conflict", "inconsistent", "矛盾", "冲突", "不一致"],
  ["improve", "increase", "gain", "提升", "提高", "改进"],
  ["decrease", "reduce", "decline", "降低", "减少", "下降"],
];

function randomId(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string) {
  return normalizeSpace(value).toLocaleLowerCase();
}

function truncate(value: string, length = 220) {
  const normalized = normalizeSpace(value);
  return normalized.length > length ? `${normalized.slice(0, length).trim()}…` : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createResearchProject(name = "新的研究项目"): ResearchProject {
  const now = Date.now();
  return {
    id: randomId("project"),
    name,
    question: "",
    description: "",
    documentIds: [],
    comparisonRows: [],
    synthesis: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyResearchWorkspace(): ResearchWorkspaceState {
  return { projects: [], evidenceCards: [] };
}

function normalizeCell(value: unknown): ComparisonCell {
  if (!isRecord(value)) return { ...EMPTY_CELL };
  return {
    value: typeof value.value === "string" ? value.value : "",
    ...(typeof value.paragraphId === "string" ? { paragraphId: value.paragraphId } : {}),
    ...(Number.isFinite(value.page) ? { page: Math.max(1, Math.round(Number(value.page))) } : {}),
    ...(typeof value.quote === "string" ? { quote: value.quote } : {}),
  };
}

function normalizeComparisonRow(value: unknown): ComparisonRow | null {
  if (!isRecord(value) || typeof value.docId !== "string" || !isRecord(value.cells)) return null;
  const rawCells = value.cells;
  return {
    docId: value.docId,
    cells: Object.fromEntries(COMPARISON_FIELDS.map((field) => [
      field,
      normalizeCell(rawCells[field]),
    ])) as Record<ComparisonField, ComparisonCell>,
  };
}

function normalizeProject(value: unknown): ResearchProject | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const now = Date.now();
  return {
    id: value.id,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : "未命名研究项目",
    question: typeof value.question === "string" ? value.question.slice(0, 500) : "",
    description: typeof value.description === "string" ? value.description.slice(0, 1600) : "",
    documentIds: Array.isArray(value.documentIds)
      ? [...new Set(value.documentIds.filter((item): item is string => typeof item === "string"))]
      : [],
    comparisonRows: Array.isArray(value.comparisonRows)
      ? value.comparisonRows.map(normalizeComparisonRow).filter((item): item is ComparisonRow => Boolean(item))
      : [],
    synthesis: typeof value.synthesis === "string" ? value.synthesis.slice(0, 60000) : "",
    ...(Number.isFinite(value.synthesisUpdatedAt) ? { synthesisUpdatedAt: Number(value.synthesisUpdatedAt) } : {}),
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : now,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : now,
  };
}

function normalizeEvidence(value: unknown): EvidenceCard | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.docId !== "string") return null;
  const type = EVIDENCE_TYPES.includes(value.type as EvidenceType) ? value.type as EvidenceType : "claim";
  const relation = EVIDENCE_RELATIONS.includes(value.relation as EvidenceRelation)
    ? value.relation as EvidenceRelation
    : "neutral";
  return {
    id: value.id,
    ...(typeof value.projectId === "string" ? { projectId: value.projectId } : {}),
    docId: value.docId,
    paragraphId: typeof value.paragraphId === "string" ? value.paragraphId : "",
    ...(Number.isFinite(value.page) ? { page: Math.max(1, Math.round(Number(value.page))) } : {}),
    quote: typeof value.quote === "string" ? value.quote : "",
    type,
    relation,
    note: typeof value.note === "string" ? value.note : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : [],
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : Date.now(),
    ...(Array.isArray(value.rects) ? { rects: value.rects as EvidenceCard["rects"] } : {}),
  };
}

export function normalizeResearchWorkspace(value: unknown): ResearchWorkspaceState {
  if (!isRecord(value)) return emptyResearchWorkspace();
  const projects = Array.isArray(value.projects)
    ? value.projects.map(normalizeProject).filter((item): item is ResearchProject => Boolean(item))
    : [];
  const evidenceCards = Array.isArray(value.evidenceCards)
    ? value.evidenceCards.map(normalizeEvidence).filter((item): item is EvidenceCard => Boolean(item))
    : [];
  const activeProjectId = typeof value.activeProjectId === "string"
    && projects.some((project) => project.id === value.activeProjectId)
    ? value.activeProjectId
    : projects[0]?.id;
  return { projects, evidenceCards, ...(activeProjectId ? { activeProjectId } : {}) };
}

export function createEvidenceCard(input: Omit<EvidenceCard, "id" | "createdAt">): EvidenceCard {
  return { ...input, id: randomId("evidence"), createdAt: Date.now() };
}

function paragraphContext(paragraphs: Paragraph[], index: number) {
  for (let cursor = index; cursor >= Math.max(0, index - 8); cursor -= 1) {
    if (paragraphs[cursor]?.kind === "heading") return paragraphs[cursor].text;
  }
  return "";
}

function fieldScore(field: ComparisonField, paragraph: Paragraph, heading: string, index: number, count: number) {
  const text = normalizeLower(`${heading} ${paragraph.text}`);
  let score = FIELD_HINTS[field].reduce((total, hint) => total + (text.includes(hint) ? 5 : 0), 0);
  if (paragraph.kind === "heading") score -= 3;
  if (paragraph.text.length >= 60 && paragraph.text.length <= 1200) score += 2;
  const ratio = count ? index / count : 0;
  if (field === "question" && ratio < 0.28) score += 3;
  if (field === "method" && ratio > 0.15 && ratio < 0.68) score += 2;
  if (field === "findings" && ratio > 0.48) score += 2;
  if (field === "limitations" && ratio > 0.68) score += 4;
  if (field === "metrics" && /\d+(?:\.\d+)?\s*%|\bp\s*[<=>]|\bf1\b|\bauc\b/i.test(paragraph.text)) score += 5;
  if (field === "sample" && /\b[nN]\s*=\s*\d+|\d+\s*(?:patients|participants|samples|例|名|份)/i.test(paragraph.text)) score += 5;
  return score;
}

export function buildComparisonRows(documents: ResearchDocument[]): ComparisonRow[] {
  return documents.map((document) => {
    const paragraphs = document.paragraphs || [];
    const cells = Object.fromEntries(COMPARISON_FIELDS.map((field) => {
      let best: { paragraph: Paragraph; score: number } | null = null;
      paragraphs.forEach((paragraph, index) => {
        if (!paragraph.text.trim() || paragraph.kind === "heading") return;
        const score = fieldScore(field, paragraph, paragraphContext(paragraphs, index), index, paragraphs.length);
        if (!best || score > best.score) best = { paragraph, score };
      });
      const selected = best as { paragraph: Paragraph; score: number } | null;
      const cell: ComparisonCell = selected && selected.score > 1
        ? {
            value: truncate(selected.paragraph.text),
            quote: selected.paragraph.text,
            paragraphId: selected.paragraph.id,
            ...(selected.paragraph.page ? { page: selected.paragraph.page } : {}),
          }
        : { value: "" };
      return [field, cell];
    })) as Record<ComparisonField, ComparisonCell>;
    return { docId: document.id, cells };
  });
}

function extractDoi(value: string) {
  return value.match(/10\.\d{4,9}\/[\w.()/:;+-]+/i)?.[0]?.replace(/[.,;)\]}]+$/, "");
}

function extractYear(value: string) {
  const year = value.match(/(?:19|20)\d{2}/)?.[0];
  return year ? Number(year) : undefined;
}

function referenceLabel(value: string, fallbackIndex: number) {
  return value.match(/^\s*(\[(\d+)\]|(\d+)[.)])/)?.[2]
    || value.match(/^\s*(\[(\d+)\]|(\d+)[.)])/)?.[3]
    || String(fallbackIndex);
}

function cleanReferenceTitle(value: string) {
  const withoutMarker = value.replace(/^\s*(?:\[\d+\]|\d+[.)])\s*/, "");
  const quoted = withoutMarker.match(/[“\"]([^”\"]{8,240})[”\"]/)?.[1];
  if (quoted) return normalizeSpace(quoted);
  const parts = withoutMarker.split(/\.\s+/).map(normalizeSpace).filter(Boolean);
  if (parts.length >= 2) return truncate(parts[1], 240);
  return undefined;
}

export function parseDocumentReferences(document: ResearchDocument): ReferenceItem[] {
  const paragraphs = document.paragraphs || [];
  const headingIndex = paragraphs.findIndex((paragraph) => {
    const text = normalizeSpace(paragraph.text);
    return (paragraph.kind === "heading" || text.length <= 48)
      && /^(references|bibliography|参考文献|参考资料|文献目录)\b/i.test(text);
  });
  if (headingIndex < 0) return [];

  const entries: Array<{ text: string; paragraph: Paragraph }> = [];
  for (let index = headingIndex + 1; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const text = normalizeSpace(paragraph.text);
    if (!text) continue;
    if (paragraph.kind === "heading" && entries.length > 1) break;
    const startsReference = /^\s*(?:\[\d+\]|\d+[.)])\s*/.test(text);
    if (startsReference || !entries.length) entries.push({ text, paragraph });
    else entries[entries.length - 1].text = `${entries[entries.length - 1].text} ${text}`;
  }

  return entries.filter((entry) => entry.text.length >= 8).map((entry, index) => {
    const doi = extractDoi(entry.text);
    return {
      id: `${document.id}-reference-${index + 1}`,
      docId: document.id,
      label: referenceLabel(entry.text, index + 1),
      raw: entry.text,
      ...(cleanReferenceTitle(entry.text) ? { title: cleanReferenceTitle(entry.text) } : {}),
      ...(extractYear(entry.text) ? { year: extractYear(entry.text) } : {}),
      ...(doi ? { doi, url: `https://doi.org/${doi}` } : {}),
      paragraphId: entry.paragraph.id,
      ...(entry.paragraph.page ? { page: entry.paragraph.page } : {}),
    };
  });
}

export function buildInTextReferenceLinks(text: string, references: ReferenceItem[]) {
  const byLabel = new Map(references.map((reference) => [reference.label, reference]));
  const links: Array<{ start: number; end: number; targetParagraphId: string }> = [];
  const markerPattern = /\[(\d{1,4})\]/g;
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(text)) !== null) {
    const reference = byLabel.get(match[1]);
    if (!reference?.paragraphId) continue;
    links.push({ start: match.index, end: match.index + match[0].length, targetParagraphId: reference.paragraphId });
  }
  return links;
}

function baseTokens(value: string) {
  const normalized = normalizeLower(value);
  const latin = normalized.match(/[a-z][a-z0-9-]{1,}/g) || [];
  const cjkRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  const cjk = cjkRuns.flatMap((run) => (
    run.length <= 4 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2))
  ));
  return [...new Set([...latin, ...cjk].filter((token) => token.length > 1))];
}

function expandedTerms(query: string) {
  const direct = baseTokens(query);
  const expanded = new Set(direct);
  TERM_GROUPS.forEach((group) => {
    if (group.some((term) => normalizeLower(query).includes(term) || direct.includes(term))) {
      group.forEach((term) => expanded.add(term));
    }
  });
  return [...expanded];
}

export function searchResearchLibrary(
  documents: ResearchDocument[],
  query: string,
  options: { documentIds?: string[]; limit?: number } = {},
): SemanticSearchResult[] {
  const normalizedQuery = normalizeLower(query);
  if (normalizedQuery.length < 2) return [];
  const directTerms = baseTokens(query);
  const terms = expandedTerms(query);
  const allowed = options.documentIds?.length ? new Set(options.documentIds) : null;
  const results: SemanticSearchResult[] = [];

  documents.forEach((document) => {
    if (allowed && !allowed.has(document.id)) return;
    (document.paragraphs || []).forEach((paragraph, index) => {
      if (paragraph.kind === "heading" || paragraph.text.trim().length < 12) return;
      const text = normalizeLower(paragraph.text);
      const title = normalizeLower(document.title);
      const matchedTerms = terms.filter((term) => text.includes(term));
      let score = matchedTerms.reduce((total, term) => total + (directTerms.includes(term) ? 6 : 2), 0);
      if (text.includes(normalizedQuery)) score += 24;
      if (title.includes(normalizedQuery)) score += 12;
      directTerms.forEach((term) => {
        if (title.includes(term)) score += 4;
      });
      const heading = paragraphContext(document.paragraphs || [], index);
      if (normalizeLower(heading).includes(normalizedQuery)) score += 7;
      if (!score) return;
      results.push({
        id: `${document.id}:${paragraph.id}`,
        docId: document.id,
        paragraphId: paragraph.id,
        ...(paragraph.page ? { page: paragraph.page } : {}),
        text: truncate(paragraph.text, 520),
        score,
        matchedTerms: [...new Set(matchedTerms)].slice(0, 8),
      });
    });
  });

  return results
    .sort((left, right) => right.score - left.score || left.docId.localeCompare(right.docId))
    .slice(0, options.limit || 60);
}

export function projectEvidenceCounts(state: ResearchWorkspaceState) {
  const counts = new Map<string, number>();
  state.evidenceCards.forEach((card) => {
    if (card.projectId) counts.set(card.projectId, (counts.get(card.projectId) || 0) + 1);
  });
  return counts;
}
