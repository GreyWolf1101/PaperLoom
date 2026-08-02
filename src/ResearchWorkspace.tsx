import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bookmark,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  FileOutput,
  FolderPlus,
  Gauge,
  HelpCircle,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  Network,
  NotebookPen,
  Plus,
  Search,
  Square,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  AppLanguage,
  CitationGraph,
  ComparisonCell,
  ComparisonField,
  ComparisonRow,
  EvidenceCard,
  EvidenceRelation,
  EvidenceType,
  ReferenceItem,
  ResearchDocument,
  ResearchProject,
  ResearchWorkspaceState,
  SemanticSearchResult,
} from "./models";
import {
  buildComparisonRows,
  COMPARISON_FIELDS,
  createResearchProject,
  EVIDENCE_RELATIONS,
  EVIDENCE_TYPES,
  parseDocumentReferences,
  projectEvidenceCounts,
  searchResearchLibrary,
} from "./research";

type ResearchTab = "overview" | "projects" | "evidence" | "comparison" | "citations" | "search" | "synthesis";

type SourceTarget = {
  docId: string;
  paragraphId?: string;
  page?: number;
  quote?: string;
  rects?: EvidenceCard["rects"];
};

type Props = {
  language: AppLanguage;
  documents: ResearchDocument[];
  state: ResearchWorkspaceState;
  onChange: (next: ResearchWorkspaceState) => void;
  onOpenSource: (target: SourceTarget) => void;
  ensureAIReady: () => boolean;
  requestAI: (system: string, user: string, json?: boolean) => Promise<string>;
  notify: (message: string) => void;
  initialTab?: ResearchTab;
  initialCitationDocumentId?: string;
  corpusLoading?: boolean;
  onOpenGuide?: () => void;
};

type ProjectDraft = {
  name: string;
  question: string;
  description: string;
  documentIds: string[];
};

const TYPE_LABELS: Record<EvidenceType, [string, string]> = {
  claim: ["核心观点", "Claim"],
  method: ["研究方法", "Method"],
  result: ["实验结果", "Result"],
  data: ["数据证据", "Data"],
  limitation: ["局限性", "Limitation"],
  quote: ["可引用原句", "Quotation"],
  question: ["我的疑问", "Question"],
  idea: ["研究灵感", "Idea"],
};

const RELATION_LABELS: Record<EvidenceRelation, [string, string]> = {
  neutral: ["未分类关系", "Neutral"],
  support: ["支持", "Supports"],
  qualify: ["补充/限定", "Qualifies"],
  contradict: ["矛盾", "Contradicts"],
};

const FIELD_LABELS: Record<ComparisonField, [string, string]> = {
  question: ["研究问题", "Question"],
  method: ["方法", "Method"],
  sample: ["数据集/样本", "Data / sample"],
  metrics: ["评价指标", "Metrics"],
  findings: ["主要结论", "Findings"],
  limitations: ["局限性", "Limitations"],
};

function parseJsonResponse(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatDate(timestamp: number, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function documentLabel(document: ResearchDocument | undefined, language: AppLanguage) {
  if (!document) return language === "zh-CN" ? "文献已移除" : "Paper removed";
  return document.title || document.name;
}

function sourceLabel(page: number | undefined, language: AppLanguage) {
  if (!page) return language === "zh-CN" ? "查看原文" : "View source";
  return language === "zh-CN" ? `第 ${page} 页` : `Page ${page}`;
}

function excerptDocument(document: ResearchDocument, maxLength = 3600) {
  const paragraphs = document.paragraphs || [];
  const lines = paragraphs.map((paragraph) => (
    `[sourceId=${paragraph.id};page=${paragraph.page || "?"};kind=${paragraph.kind || "body"}] ${paragraph.text}`
  ));
  const full = lines.join("\n");
  if (full.length <= maxLength) return full;
  const part = Math.floor(maxLength / 3);
  return `${full.slice(0, part)}\n[中间内容已抽样]\n${full.slice(Math.floor(full.length / 2), Math.floor(full.length / 2) + part)}\n${full.slice(-part)}`;
}

function mergeAIComparison(
  documents: ResearchDocument[],
  fallback: ComparisonRow[],
  payload: unknown,
): ComparisonRow[] {
  const root = asObject(payload);
  const rows = Array.isArray(root?.rows) ? root.rows : Array.isArray(payload) ? payload : [];
  const byDoc = new Map(rows.map((row) => {
    const item = asObject(row);
    return [typeof item?.docId === "string" ? item.docId : "", item];
  }));
  return documents.map((document) => {
    const base = fallback.find((row) => row.docId === document.id) || buildComparisonRows([document])[0];
    const aiRow = byDoc.get(document.id);
    if (!aiRow) return base;
    const cells = Object.fromEntries(COMPARISON_FIELDS.map((field) => {
      const candidate = asObject(aiRow[field]);
      const sourceId = typeof candidate?.sourceId === "string" ? candidate.sourceId : undefined;
      const paragraph = sourceId ? document.paragraphs?.find((item) => item.id === sourceId) : undefined;
      const value = typeof candidate?.value === "string" ? candidate.value.trim() : "";
      if (!value || !paragraph) return [field, base.cells[field]];
      const cell: ComparisonCell = {
        value: value.slice(0, 600),
        quote: paragraph.text,
        paragraphId: paragraph.id,
        ...(paragraph.page ? { page: paragraph.page } : {}),
      };
      return [field, cell];
    })) as Record<ComparisonField, ComparisonCell>;
    return { docId: document.id, cells };
  });
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "—";
}

function buildLocalSynthesis(
  project: ResearchProject,
  documents: ResearchDocument[],
  evidence: EvidenceCard[],
  language: AppLanguage,
) {
  const zh = language === "zh-CN";
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const groups = EVIDENCE_RELATIONS.map((relation) => ({
    relation,
    cards: evidence.filter((card) => card.relation === relation),
  })).filter((group) => group.cards.length);
  const relationName: Record<EvidenceRelation, string> = zh
    ? { neutral: "尚未归类", support: "支持性证据", qualify: "补充与限定", contradict: "矛盾与反例" }
    : { neutral: "Unclassified", support: "Supporting evidence", qualify: "Qualifications", contradict: "Contradictions" };
  const evidenceSections = groups.map((group) => (
    `## ${relationName[group.relation]}\n\n${group.cards.map((card) => {
      const index = evidence.indexOf(card) + 1;
      const source = documentById.get(card.docId);
      const sourceName = source?.title || source?.name || (zh ? "已移除文献" : "Removed paper");
      const page = card.page ? `${zh ? "第" : "p."}${card.page}${zh ? "页" : ""}` : (zh ? "原文" : "source");
      return `- [E${index}] ${card.note.trim() || card.quote.trim()}（${sourceName}，${page}）`;
    }).join("\n")}`
  )).join("\n\n");
  const comparison = project.comparisonRows.length
    ? `\n\n## ${zh ? "跨文献比较" : "Cross-paper comparison"}\n\n| ${zh ? "文献" : "Paper"} | ${COMPARISON_FIELDS.map((field) => FIELD_LABELS[field][zh ? 0 : 1]).join(" | ")} |\n| --- | ${COMPARISON_FIELDS.map(() => "---").join(" | ")} |\n${project.comparisonRows.map((row) => {
      const document = documentById.get(row.docId);
      return `| ${markdownCell(document?.title || document?.name || row.docId)} | ${COMPARISON_FIELDS.map((field) => markdownCell(row.cells[field].value)).join(" | ")} |`;
    }).join("\n")}`
    : "";
  return `# ${project.name}\n\n## ${zh ? "核心研究问题" : "Research question"}\n\n${project.question.trim() || (zh ? "尚未填写。" : "Not specified.")}\n\n## ${zh ? "研究范围" : "Scope"}\n\n${project.description.trim() || (zh ? "尚未填写。" : "Not specified.")}\n\n${evidenceSections || `## ${zh ? "证据状态" : "Evidence status"}\n\n${zh ? "尚未收集证据卡片。" : "No evidence cards yet."}`}${comparison}`;
}

function buildProjectExport(
  project: ResearchProject,
  documents: ResearchDocument[],
  evidence: EvidenceCard[],
  language: AppLanguage,
) {
  const zh = language === "zh-CN";
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const papers = project.documentIds.map((id) => documentById.get(id)).filter((item): item is ResearchDocument => Boolean(item));
  const evidenceList = evidence.map((card, index) => {
    const source = documentById.get(card.docId);
    const page = card.page ? `${zh ? "第 " : "Page "}${card.page}${zh ? " 页" : ""}` : (zh ? "原文位置" : "source");
    return `### E${index + 1} · ${TYPE_LABELS[card.type][zh ? 0 : 1]} · ${RELATION_LABELS[card.relation][zh ? 0 : 1]}\n\n> ${card.quote}\n\n${card.note || (zh ? "暂无研究备注" : "No research note")}\n\n${source?.title || source?.name || card.docId} · ${page}${card.tags.length ? ` · ${card.tags.join(", ")}` : ""}`;
  }).join("\n\n");
  const body = project.synthesis.trim() || buildLocalSynthesis(project, documents, evidence, language);
  return `# ${project.name}\n\n${project.question ? `> ${project.question}\n\n` : ""}${project.description || ""}\n\n## ${zh ? "项目文献" : "Project papers"}\n\n${papers.map((paper, index) => `${index + 1}. ${paper.title}${paper.authors ? ` — ${paper.authors}` : ""}`).join("\n") || (zh ? "暂无" : "None")}\n\n## ${zh ? "综合报告" : "Synthesis report"}\n\n${body}\n\n## ${zh ? "证据附录" : "Evidence appendix"}\n\n${evidenceList || (zh ? "暂无证据卡片" : "No evidence cards")}`;
}

export default function ResearchWorkspace({
  language,
  documents,
  state,
  onChange,
  onOpenSource,
  ensureAIReady,
  requestAI,
  notify,
  initialTab = "overview",
  initialCitationDocumentId,
  corpusLoading = false,
  onOpenGuide,
}: Props) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  const [tab, setTab] = useState<ResearchTab>(initialTab);
  const [evidenceScope, setEvidenceScope] = useState<"active" | "inbox" | "all">("active");
  const [evidenceType, setEvidenceType] = useState<EvidenceType | "all">("all");
  const [evidenceDocumentId, setEvidenceDocumentId] = useState("all");
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [evidenceSort, setEvidenceSort] = useState<"newest" | "oldest">("newest");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<Set<string>>(() => new Set());
  const [citationDocumentId, setCitationDocumentId] = useState(initialCitationDocumentId || documents[0]?.id || "");
  const [enrichedReferences, setEnrichedReferences] = useState<Record<string, ReferenceItem>>({});
  const [referenceBusy, setReferenceBusy] = useState("");
  const [citationGraph, setCitationGraph] = useState<CitationGraph | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchProjectOnly, setSearchProjectOnly] = useState(true);
  const [comparisonBusy, setComparisonBusy] = useState<"local" | "ai" | null>(null);
  const [synthesisBusy, setSynthesisBusy] = useState<"local" | "ai" | null>(null);
  const [projectWizardOpen, setProjectWizardOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>({ name: "", question: "", description: "", documentIds: [] });
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
  const evidenceCounts = useMemo(() => projectEvidenceCounts(state), [state]);
  const activeProjectDocuments = useMemo(() => (
    activeProject ? activeProject.documentIds.map((id) => documents.find((doc) => doc.id === id)).filter((doc): doc is ResearchDocument => Boolean(doc)) : []
  ), [activeProject, documents]);
  const activeProjectEvidence = useMemo(() => (
    activeProject ? state.evidenceCards.filter((card) => card.projectId === activeProject.id) : []
  ), [activeProject, state.evidenceCards]);

  useEffect(() => {
    if (documents.some((doc) => doc.id === citationDocumentId)) return;
    setCitationDocumentId(documents[0]?.id || "");
  }, [citationDocumentId, documents]);

  const updateProject = (projectId: string, patch: Partial<ResearchProject>) => {
    onChange({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId ? { ...project, ...patch, updatedAt: Date.now() } : project
      )),
    });
  };

  const openProjectWizard = () => {
    setProjectDraft({
      name: tr("新的研究项目", "New research project"),
      question: "",
      description: "",
      documentIds: documents.slice(0, 3).map((document) => document.id),
    });
    setProjectWizardOpen(true);
  };

  const finishProjectWizard = () => {
    const project = {
      ...createResearchProject(projectDraft.name.trim() || tr("新的研究项目", "New research project")),
      question: projectDraft.question.trim(),
      description: projectDraft.description.trim(),
      documentIds: projectDraft.documentIds,
    };
    onChange({ ...state, projects: [...state.projects, project], activeProjectId: project.id });
    setProjectWizardOpen(false);
    setTab("overview");
    notify(tr("研究项目已创建，工作台已为你安排下一步", "Project created; your next step is ready"));
  };

  const deleteProject = (projectId: string) => {
    const projects = state.projects.filter((project) => project.id !== projectId);
    onChange({
      projects,
      evidenceCards: state.evidenceCards.map((card) => (
        card.projectId === projectId ? { ...card, projectId: undefined } : card
      )),
      activeProjectId: projects[0]?.id,
    });
    setSelectedEvidenceIds(new Set());
    notify(tr("研究项目已删除，原证据卡片已移入未归档", "Project deleted; its evidence cards moved to the inbox"));
  };

  const updateEvidence = (cardId: string, patch: Partial<EvidenceCard>) => {
    onChange({
      ...state,
      evidenceCards: state.evidenceCards.map((card) => card.id === cardId ? { ...card, ...patch } : card),
    });
  };

  const deleteEvidence = (cardId: string) => {
    onChange({ ...state, evidenceCards: state.evidenceCards.filter((card) => card.id !== cardId) });
    setSelectedEvidenceIds((current) => {
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });
  };

  const filteredEvidence = useMemo(() => {
    const query = evidenceQuery.trim().toLocaleLowerCase();
    return state.evidenceCards.filter((card) => (
      (evidenceScope === "all"
        || (evidenceScope === "inbox" && !card.projectId)
        || (evidenceScope === "active" && (!activeProject || card.projectId === activeProject.id)))
      && (evidenceType === "all" || card.type === evidenceType)
      && (evidenceDocumentId === "all" || card.docId === evidenceDocumentId)
      && (!query || `${card.quote} ${card.note} ${card.tags.join(" ")}`.toLocaleLowerCase().includes(query))
    )).sort((left, right) => evidenceSort === "newest" ? right.createdAt - left.createdAt : left.createdAt - right.createdAt);
  }, [activeProject, evidenceDocumentId, evidenceQuery, evidenceScope, evidenceSort, evidenceType, state.evidenceCards]);

  const visibleEvidenceIds = filteredEvidence.map((card) => card.id);
  const allVisibleEvidenceSelected = Boolean(visibleEvidenceIds.length)
    && visibleEvidenceIds.every((id) => selectedEvidenceIds.has(id));

  const toggleEvidenceSelection = (cardId: string) => {
    setSelectedEvidenceIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleVisibleEvidence = () => {
    setSelectedEvidenceIds((current) => {
      const next = new Set(current);
      if (allVisibleEvidenceSelected) visibleEvidenceIds.forEach((id) => next.delete(id));
      else visibleEvidenceIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const assignSelectedEvidence = () => {
    if (!activeProject || !selectedEvidenceIds.size) return;
    onChange({
      ...state,
      evidenceCards: state.evidenceCards.map((card) => selectedEvidenceIds.has(card.id) ? { ...card, projectId: activeProject.id } : card),
    });
    notify(tr(`已将 ${selectedEvidenceIds.size} 张证据归入当前项目`, `${selectedEvidenceIds.size} evidence cards assigned to the project`));
    setSelectedEvidenceIds(new Set());
  };

  const deleteSelectedEvidence = () => {
    if (!selectedEvidenceIds.size) return;
    onChange({ ...state, evidenceCards: state.evidenceCards.filter((card) => !selectedEvidenceIds.has(card.id)) });
    notify(tr(`已删除 ${selectedEvidenceIds.size} 张证据卡片`, `${selectedEvidenceIds.size} evidence cards deleted`));
    setSelectedEvidenceIds(new Set());
  };

  const buildLocalComparison = () => {
    if (!activeProject || !activeProjectDocuments.length) return;
    setComparisonBusy("local");
    const rows = buildComparisonRows(activeProjectDocuments);
    updateProject(activeProject.id, { comparisonRows: rows });
    window.setTimeout(() => setComparisonBusy(null), 180);
    notify(tr("对比矩阵已生成，每个单元格均保留原文位置", "Comparison matrix generated with source links"));
  };

  const buildAIComparison = async () => {
    if (!activeProject || !activeProjectDocuments.length || !ensureAIReady()) return;
    setComparisonBusy("ai");
    try {
      const localRows = buildComparisonRows(activeProjectDocuments);
      const input = activeProjectDocuments.map((document) => (
        `\n=== DOCUMENT ${document.id}: ${document.title} ===\n${excerptDocument(document)}`
      )).join("\n");
      const response = await requestAI(
        "You create evidence-grounded literature comparison matrices. Return JSON only. Never invent a page or sourceId. Every non-empty field must use one sourceId copied exactly from the provided document. Schema: {\"rows\":[{\"docId\":\"...\",\"question\":{\"value\":\"...\",\"sourceId\":\"...\"},\"method\":{...},\"sample\":{...},\"metrics\":{...},\"findings\":{...},\"limitations\":{...}}]}.",
        `Research question: ${activeProject.question || "Not specified"}\nCompare these papers in concise Chinese unless the source collection is primarily English.${input}`,
        true,
      );
      const rows = mergeAIComparison(activeProjectDocuments, localRows, parseJsonResponse(response));
      updateProject(activeProject.id, { comparisonRows: rows });
      notify(tr("AI 对比已完成，无法验证来源的字段已自动回退为本地提取", "AI comparison completed; unverifiable fields used local extraction"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("AI 对比生成失败", "AI comparison failed"));
    } finally {
      setComparisonBusy(null);
    }
  };

  const saveProjectSynthesis = (value: string) => {
    if (!activeProject) return;
    updateProject(activeProject.id, { synthesis: value.slice(0, 60000), synthesisUpdatedAt: Date.now() });
  };

  const buildLocalProjectSynthesis = () => {
    if (!activeProject) return;
    setSynthesisBusy("local");
    saveProjectSynthesis(buildLocalSynthesis(activeProject, documents, activeProjectEvidence, language));
    window.setTimeout(() => setSynthesisBusy(null), 180);
    notify(tr("本地证据提纲已生成，可继续编辑或交给 AI 深化", "Local evidence outline generated; edit it or deepen with AI"));
  };

  const buildAIProjectSynthesis = async () => {
    if (!activeProject || !activeProjectEvidence.length || !ensureAIReady()) return;
    setSynthesisBusy("ai");
    try {
      const evidence = activeProjectEvidence.map((card, index) => {
        const source = documents.find((document) => document.id === card.docId);
        return `[E${index + 1}] type=${card.type}; relation=${card.relation}; paper=${source?.title || card.docId}; page=${card.page || "?"}\nQUOTE: ${card.quote}\nNOTE: ${card.note || "none"}`;
      }).join("\n\n");
      const comparison = activeProject.comparisonRows.map((row) => ({
        paper: documents.find((document) => document.id === row.docId)?.title || row.docId,
        cells: Object.fromEntries(COMPARISON_FIELDS.map((field) => [field, row.cells[field].value])),
      }));
      const response = await requestAI(
        "You write an evidence-grounded literature synthesis in Markdown. Use only the supplied evidence and comparison matrix. Cite claims with the exact evidence markers [E1], [E2], etc. Explicitly separate consensus, contradictions, limitations, and unanswered questions. Never invent a source, page, statistic, or citation marker.",
        `Write in ${zh ? "Simplified Chinese" : "English"}.\nPROJECT: ${activeProject.name}\nRESEARCH QUESTION: ${activeProject.question || "Not specified"}\nSCOPE: ${activeProject.description || "Not specified"}\n\nEVIDENCE:\n${evidence}\n\nCOMPARISON MATRIX:\n${JSON.stringify(comparison)}`,
      );
      saveProjectSynthesis(response.trim());
      notify(tr("可追溯综合报告已生成，所有证据标记均来自当前项目", "Traceable synthesis generated from this project's evidence"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("综合报告生成失败", "Failed to generate synthesis"));
    } finally {
      setSynthesisBusy(null);
    }
  };

  const exportActiveProject = async () => {
    if (!activeProject) return;
    const content = buildProjectExport(activeProject, documents, activeProjectEvidence, language);
    const suggestedName = `${activeProject.name.replace(/[\\/:*?"<>|]/g, "-") || "research-project"}.md`;
    if (window.paperLoom?.exportMarkdown) {
      const saved = await window.paperLoom.exportMarkdown({ suggestedName, content });
      if (saved) notify(tr("研究项目已导出为 Markdown", "Research project exported as Markdown"));
      return;
    }
    await navigator.clipboard.writeText(content);
    notify(tr("研究项目已复制到剪贴板", "Research project copied to clipboard"));
  };

  const citationDocument = documents.find((document) => document.id === citationDocumentId);
  const references = useMemo(() => (
    citationDocument ? parseDocumentReferences(citationDocument).map((item) => enrichedReferences[item.id] || item) : []
  ), [citationDocument, enrichedReferences]);

  const enrichReference = async (reference: ReferenceItem) => {
    if (!window.paperLoom?.resolveReference) {
      notify(tr("当前环境不支持在线元数据补全", "Online metadata enrichment is unavailable"));
      return;
    }
    setReferenceBusy(reference.id);
    try {
      const result = await window.paperLoom.resolveReference({ doi: reference.doi, query: reference.raw });
      setEnrichedReferences((current) => ({ ...current, [reference.id]: { ...reference, ...result, id: reference.id, docId: reference.docId } }));
      notify(tr("参考文献元数据已补全", "Reference metadata enriched"));
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("元数据补全失败", "Metadata enrichment failed"));
    } finally {
      setReferenceBusy("");
    }
  };

  const loadCitationGraph = async (reference: ReferenceItem) => {
    if (!window.paperLoom?.getCitationGraph) {
      notify(tr("当前环境不支持引用关系查询", "Citation graph lookup is unavailable"));
      return;
    }
    setReferenceBusy(reference.id);
    setCitationGraph(null);
    try {
      const graph = await window.paperLoom.getCitationGraph({ doi: reference.doi, title: reference.title || reference.raw });
      setCitationGraph(graph);
    } catch (error) {
      notify(error instanceof Error ? error.message : tr("引用关系加载失败", "Failed to load citation graph"));
    } finally {
      setReferenceBusy("");
    }
  };

  const openExternal = (url: string | undefined) => {
    if (!url) return;
    if (window.paperLoom) void window.paperLoom.openScholarlyResult(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const searchResults = useMemo<SemanticSearchResult[]>(() => {
    const projectIds = searchProjectOnly && activeProject ? activeProject.documentIds : undefined;
    return searchResearchLibrary(documents, searchQuery, { documentIds: projectIds, limit: 80 });
  }, [activeProject, documents, searchProjectOnly, searchQuery]);

  const submitSearch = (value = searchDraft) => {
    const query = value.trim();
    if (!query) return;
    setSearchDraft(query);
    setSearchQuery(query);
    setSearchHistory((current) => [query, ...current.filter((item) => item !== query)].slice(0, 6));
  };

  const workflowSteps: Array<{ id: string; label: string; detail: string; done: boolean; target: ResearchTab }> = [
    { id: "question", label: tr("明确问题", "Define question"), detail: tr("填写研究问题与范围", "Set question and scope"), done: Boolean(activeProject?.question.trim()), target: "projects" },
    { id: "papers", label: tr("组织文献", "Collect papers"), detail: tr("把相关论文加入项目", "Assign relevant papers"), done: Boolean(activeProject?.documentIds.length), target: "projects" },
    { id: "evidence", label: tr("收集证据", "Collect evidence"), detail: tr("保存带页码的原文卡片", "Save source-linked cards"), done: activeProjectEvidence.length > 0, target: "evidence" },
    { id: "comparison", label: tr("交叉比较", "Compare papers"), detail: tr("生成可追溯对比矩阵", "Build a traceable matrix"), done: Boolean(activeProject?.comparisonRows.length), target: "comparison" },
    { id: "synthesis", label: tr("形成结论", "Synthesize"), detail: tr("生成并导出研究报告", "Generate and export a report"), done: Boolean(activeProject?.synthesis.trim()), target: "synthesis" },
  ];
  const completedWorkflowSteps = workflowSteps.filter((step) => step.done).length;
  const workflowPercent = Math.round((completedWorkflowSteps / workflowSteps.length) * 100);
  const nextWorkflowStep = workflowSteps.find((step) => !step.done);

  const tabs: Array<{ id: ResearchTab; icon: typeof NotebookPen; label: string; description: string }> = [
    { id: "overview", icon: Gauge, label: tr("项目总览", "Overview"), description: tr("进度与下一步", "Progress and next step") },
    { id: "projects", icon: LayoutGrid, label: tr("研究项目", "Projects"), description: tr("组织问题与文献", "Questions and papers") },
    { id: "evidence", icon: Bookmark, label: tr("证据卡片", "Evidence"), description: tr("保留原文证据链", "Traceable evidence") },
    { id: "comparison", icon: Brain, label: tr("论文对比", "Comparison"), description: tr("跨文献比较矩阵", "Cross-paper matrix") },
    { id: "citations", icon: Network, label: tr("引用导航", "Citations"), description: tr("参考文献与引用关系", "References and graph") },
    { id: "search", icon: Search, label: tr("全库检索", "Library search"), description: tr("本地智能语义检索", "Local smart search") },
    { id: "synthesis", icon: FileOutput, label: tr("综合报告", "Synthesis"), description: tr("从证据形成结论", "Turn evidence into findings") },
  ];

  return (
    <section className="research-workspace">
      <header className="research-workspace-hero">
        <div>
          <span className="eyebrow">RESEARCH WORKBENCH</span>
          <h1>{tr("研究项目工作台", "Research project workbench")}</h1>
          <p>{tr("把原文证据、论文比较、引用关系和研究问题组织在同一个可追溯空间。", "Organize source evidence, paper comparisons, citation relations and research questions in one traceable space.")}</p>
        </div>
        <div className="research-hero-actions">
          {corpusLoading && <span className="research-index-status"><LoaderCircle size={14} className="spin" />{tr("正在建立本地索引", "Building local index")}</span>}
          {onOpenGuide && <button className="research-secondary-action" onClick={onOpenGuide}><HelpCircle size={15} />{tr("使用指南", "Guide")}</button>}
          <button className="research-secondary-action" onClick={() => void exportActiveProject()} disabled={!activeProject}><Download size={15} />{tr("导出项目", "Export")}</button>
          <button className="research-primary-action" onClick={openProjectWizard}><Plus size={16} />{tr("新建研究项目", "New project")}</button>
        </div>
      </header>

      <div className="research-metrics">
        <div><strong>{state.projects.length}</strong><span>{tr("研究项目", "Projects")}</span></div>
        <div><strong>{state.evidenceCards.length}</strong><span>{tr("证据卡片", "Evidence cards")}</span></div>
        <div><strong>{documents.length}</strong><span>{tr("本地论文", "Local papers")}</span></div>
        <div><strong>{activeProject?.comparisonRows.length || 0}</strong><span>{tr("已比较论文", "Compared papers")}</span></div>
      </div>

      <div className="research-shell">
        <nav className="research-tab-rail" aria-label={tr("研究工具", "Research tools")}>
          <label className="research-project-switcher">
            <span>{tr("当前项目", "Active project")}</span>
            <select
              value={activeProject?.id || ""}
              onChange={(event) => onChange({ ...state, activeProjectId: event.target.value || undefined })}
            >
              {!state.projects.length && <option value="">{tr("尚未创建项目", "No project yet")}</option>}
              {state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
                <Icon size={17} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <ChevronRight size={14} />
              </button>
            );
          })}
        </nav>

        <main className="research-stage">
          {tab === "overview" && (
            !activeProject ? <section className="research-panel"><ResearchEmpty icon={FolderPlus} title={tr("从一个研究问题开始", "Start with a research question")} body={tr("创建项目后，工作台会按照文献、证据、比较和综合报告引导你完成整个流程。", "Create a project and the workbench will guide you through papers, evidence, comparison and synthesis.")} action={tr("创建研究项目", "Create project")} onAction={openProjectWizard} /></section>
              : <section className="research-panel research-overview-panel">
                  <header className="research-overview-head">
                    <div><span className="eyebrow">PROJECT COMMAND CENTER</span><h2>{activeProject.name}</h2><p>{activeProject.question || tr("尚未填写核心研究问题", "Research question not set yet")}</p></div>
                    <div className="research-progress-ring" style={{ "--research-progress": `${workflowPercent * 3.6}deg` } as CSSProperties}><strong>{workflowPercent}%</strong><span>{tr("完成", "complete")}</span></div>
                  </header>
                  <div className="research-next-step">
                    <span><Sparkles size={18} /></span>
                    <div><small>{tr("建议下一步", "RECOMMENDED NEXT STEP")}</small><strong>{nextWorkflowStep?.label || tr("项目流程已完成", "Workflow complete")}</strong><p>{nextWorkflowStep?.detail || tr("可以继续补充证据，或导出当前研究成果。", "Keep refining evidence or export the project.")}</p></div>
                    <button onClick={() => nextWorkflowStep ? setTab(nextWorkflowStep.target) : void exportActiveProject()}>{nextWorkflowStep ? tr("立即继续", "Continue") : tr("导出成果", "Export")}<ArrowRight size={15} /></button>
                  </div>
                  <div className="research-workflow-grid">
                    {workflowSteps.map((step, index) => <button key={step.id} className={step.done ? "done" : nextWorkflowStep?.id === step.id ? "current" : ""} onClick={() => setTab(step.target)}><span>{step.done ? <CheckCircle2 size={18} /> : index + 1}</span><strong>{step.label}</strong><small>{step.detail}</small><ChevronRight size={14} /></button>)}
                  </div>
                  <div className="research-overview-grid">
                    <section className="research-coverage-card"><header><div><span className="eyebrow">EVIDENCE COVERAGE</span><h3>{tr("证据覆盖", "Evidence coverage")}</h3></div><button onClick={() => setTab("evidence")}>{tr("管理证据", "Manage")}<ChevronRight size={13} /></button></header><div className="research-coverage-bars">{EVIDENCE_RELATIONS.map((relation) => { const count = activeProjectEvidence.filter((card) => card.relation === relation).length; const width = activeProjectEvidence.length ? Math.max(8, Math.round((count / activeProjectEvidence.length) * 100)) : 0; return <div key={relation}><span>{RELATION_LABELS[relation][zh ? 0 : 1]}<em>{count}</em></span><i><b style={{ width: `${width}%` }} /></i></div>; })}</div></section>
                    <section className="research-recent-card"><header><div><span className="eyebrow">RECENT EVIDENCE</span><h3>{tr("最近证据", "Recent evidence")}</h3></div><button onClick={() => setTab("evidence")}>{tr("查看全部", "View all")}<ChevronRight size={13} /></button></header>{!activeProjectEvidence.length ? <p>{tr("还没有证据卡片。阅读论文时选中原文并点击“证据”。", "No evidence yet. Select source text in a paper and choose Evidence.")}</p> : activeProjectEvidence.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map((card) => <button className="research-recent-evidence" key={card.id} onClick={() => onOpenSource(card)}><span className={`relation-dot ${card.relation}`} /><span><strong>{TYPE_LABELS[card.type][zh ? 0 : 1]}</strong><small>{card.note || card.quote}</small></span><em>{sourceLabel(card.page, language)}</em></button>)}</section>
                  </div>
                </section>
          )}

          {tab === "projects" && (
            <ProjectPanel
              language={language}
              documents={documents}
              project={activeProject}
              evidenceCount={activeProject ? evidenceCounts.get(activeProject.id) || 0 : 0}
              onCreate={openProjectWizard}
              onUpdate={(patch) => activeProject && updateProject(activeProject.id, patch)}
              onDelete={() => activeProject && deleteProject(activeProject.id)}
            />
          )}

          {tab === "evidence" && (
            <section className="research-panel evidence-panel">
              <header className="research-panel-head">
                <div><span className="eyebrow">EVIDENCE CARDS</span><h2>{tr("可追溯证据卡片", "Traceable evidence cards")}</h2><p>{tr("每张卡片都保留论文、页码和原文位置。", "Every card keeps its paper, page and source location.")}</p></div>
                <div className="research-filter-row">
                  <select value={evidenceScope} onChange={(event) => setEvidenceScope(event.target.value as "active" | "inbox" | "all")}>
                    <option value="active">{tr("当前项目", "Active project")}</option>
                    <option value="inbox">{tr("未归档", "Inbox")}</option>
                    <option value="all">{tr("全部项目", "All projects")}</option>
                  </select>
                  <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType | "all")}>
                    <option value="all">{tr("全部类型", "All types")}</option>
                    {EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type][zh ? 0 : 1]}</option>)}
                  </select>
                  <select value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)}>
                    <option value="all">{tr("全部文献", "All papers")}</option>
                    {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                  </select>
                </div>
              </header>
              <div className="evidence-management-bar">
                <label><Search size={15} /><input value={evidenceQuery} onChange={(event) => setEvidenceQuery(event.target.value)} placeholder={tr("搜索原文、备注或标签", "Search quote, note or tag")} /></label>
                <select value={evidenceSort} onChange={(event) => setEvidenceSort(event.target.value as "newest" | "oldest")}><option value="newest">{tr("最新优先", "Newest first")}</option><option value="oldest">{tr("最早优先", "Oldest first")}</option></select>
                <button onClick={toggleVisibleEvidence} disabled={!filteredEvidence.length}>{allVisibleEvidenceSelected ? <CheckCircle2 size={15} /> : <Square size={15} />}{allVisibleEvidenceSelected ? tr("取消全选", "Clear all") : tr("选择当前结果", "Select results")}</button>
              </div>
              {selectedEvidenceIds.size > 0 && <div className="evidence-batch-bar"><strong>{tr(`已选择 ${selectedEvidenceIds.size} 张`, `${selectedEvidenceIds.size} selected`)}</strong><span>{tr("可以批量归档或删除，不影响原论文。", "Assign or delete in bulk without changing source papers.")}</span><button onClick={assignSelectedEvidence} disabled={!activeProject}><ClipboardList size={14} />{tr("归入当前项目", "Assign to project")}</button><button className="danger" onClick={deleteSelectedEvidence}><Trash2 size={14} />{tr("删除所选", "Delete selected")}</button><button className="icon" onClick={() => setSelectedEvidenceIds(new Set())} title={tr("取消选择", "Clear selection")}><X size={14} /></button></div>}
              {!activeProject ? <ResearchEmpty icon={FolderPlus} title={tr("先创建一个研究项目", "Create a project first")} body={tr("之后在论文中选中文字并保存为证据。", "Then select source text and save it as evidence.")} action={tr("新建项目", "New project")} onAction={openProjectWizard} />
                : !filteredEvidence.length ? <ResearchEmpty icon={Bookmark} title={tr("这个项目还没有证据", "No evidence in this project")} body={tr("回到论文阅读，选中原文后点击“证据”即可保存。", "Return to a paper, select text and choose Evidence.")} />
                : <div className="evidence-card-list">{filteredEvidence.map((card) => {
                    const sourceDocument = documents.find((doc) => doc.id === card.docId);
                    const selected = selectedEvidenceIds.has(card.id);
                    return <article className={`evidence-card relation-${card.relation}${selected ? " selected" : ""}`} key={card.id}>
                      <div className="evidence-card-top">
                        <button className="evidence-select-button" onClick={() => toggleEvidenceSelection(card.id)} title={selected ? tr("取消选择", "Deselect") : tr("选择证据", "Select evidence")}>{selected ? <Check size={14} /> : <Square size={14} />}</button>
                        <select value={card.type} onChange={(event) => updateEvidence(card.id, { type: event.target.value as EvidenceType })}>
                          {EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type][zh ? 0 : 1]}</option>)}
                        </select>
                        <select value={card.relation} onChange={(event) => updateEvidence(card.id, { relation: event.target.value as EvidenceRelation })}>
                          {EVIDENCE_RELATIONS.map((relation) => <option key={relation} value={relation}>{RELATION_LABELS[relation][zh ? 0 : 1]}</option>)}
                        </select>
                        <button className="research-icon-button danger" onClick={() => deleteEvidence(card.id)} title={tr("删除证据", "Delete evidence")}><Trash2 size={14} /></button>
                      </div>
                      <label className="evidence-project-field"><span>{tr("归入项目", "Project")}</span><select value={card.projectId || ""} onChange={(event) => updateEvidence(card.id, { projectId: event.target.value || undefined })}><option value="">{tr("未归档", "Inbox")}</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                      <blockquote>“{card.quote}”</blockquote>
                      <textarea value={card.note} onChange={(event) => updateEvidence(card.id, { note: event.target.value })} placeholder={tr("写下你的解释、疑问或使用方式…", "Add your interpretation, question or intended use…")} />
                      <div className="evidence-card-bottom">
                        <input value={card.tags.join(", ")} onChange={(event) => updateEvidence(card.id, { tags: event.target.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12) })} placeholder={tr("标签，用逗号分隔", "Tags, separated by commas")} />
                        <button onClick={() => onOpenSource(card)}><FileText size={14} /><span>{documentLabel(sourceDocument, language)}</span><em>{sourceLabel(card.page, language)}</em></button>
                      </div>
                    </article>;
                  })}</div>}
            </section>
          )}

          {tab === "comparison" && (
            <section className="research-panel comparison-panel">
              <header className="research-panel-head">
                <div><span className="eyebrow">COMPARISON MATRIX</span><h2>{tr("多论文对比矩阵", "Multi-paper comparison")}</h2><p>{tr("先本地提取，再由 AI 在可验证来源范围内深化。", "Extract locally, then optionally deepen with source-verified AI.")}</p></div>
                <div className="research-head-actions">
                  <button onClick={buildLocalComparison} disabled={!activeProjectDocuments.length || Boolean(comparisonBusy)}>{comparisonBusy === "local" ? <LoaderCircle size={15} className="spin" /> : <List size={15} />}{tr("自动提取", "Extract locally")}</button>
                  <button className="accent" onClick={() => void buildAIComparison()} disabled={!activeProjectDocuments.length || Boolean(comparisonBusy)}>{comparisonBusy === "ai" ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{tr("AI 深化", "AI deepen")}</button>
                </div>
              </header>
              {!activeProject ? <ResearchEmpty icon={LayoutGrid} title={tr("先选择研究项目", "Select a project first")} body={tr("对比矩阵只分析项目内的论文。", "The matrix compares papers assigned to the project.")} />
                : !activeProjectDocuments.length ? <ResearchEmpty icon={FileText} title={tr("项目中还没有论文", "No papers in this project")} body={tr("在“研究项目”中勾选需要比较的论文。", "Assign papers from the Projects tab.")} />
                : !activeProject.comparisonRows.length ? <ResearchEmpty icon={Brain} title={tr("尚未生成对比矩阵", "No comparison matrix yet")} body={tr("点击“自动提取”即可离线生成，并保留每个单元格的来源。", "Choose Extract locally to build an offline source-linked matrix.")} action={tr("自动提取", "Extract locally")} onAction={buildLocalComparison} />
                : <ComparisonTable language={language} documents={documents} rows={activeProject.comparisonRows} onOpenSource={onOpenSource} onChange={(rows) => updateProject(activeProject.id, { comparisonRows: rows })} />}
            </section>
          )}

          {tab === "citations" && (
            <section className="research-panel citation-panel">
              <header className="research-panel-head">
                <div><span className="eyebrow">CITATION NAVIGATOR</span><h2>{tr("参考文献与引用关系", "References and citation graph")}</h2><p>{tr("本地识别参考文献；需要时再从 Crossref 与 Semantic Scholar 补全。", "References are parsed locally and enriched on demand via Crossref and Semantic Scholar.")}</p></div>
                <select value={citationDocumentId} onChange={(event) => { setCitationDocumentId(event.target.value); setCitationGraph(null); }}>
                  {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                </select>
              </header>
              {!citationDocument ? <ResearchEmpty icon={FileText} title={tr("文献库为空", "The library is empty")} body={tr("导入论文后即可识别参考文献。", "Import a paper to parse its references.")} />
                : !references.length ? <ResearchEmpty icon={Network} title={tr("未识别到参考文献章节", "No reference section detected")} body={tr("当前版本会识别 References、Bibliography 或“参考文献”标题，并保留条目页码。", "The parser looks for References, Bibliography or 参考文献 headings and keeps entry pages.")} />
                : <div className="citation-layout">
                    <div className="reference-list">{references.map((reference) => <article className="reference-card" key={reference.id}>
                      <span className="reference-index">[{reference.label}]</span>
                      <div><strong>{reference.title || reference.raw}</strong>{reference.title && <p>{reference.raw}</p>}<small>{[reference.authors?.join(", "), reference.year, reference.doi].filter(Boolean).join(" · ")}</small>
                        <div className="reference-actions"><button onClick={() => onOpenSource(reference)}><FileText size={13} />{sourceLabel(reference.page, language)}</button><button onClick={() => void enrichReference(reference)} disabled={referenceBusy === reference.id}>{referenceBusy === reference.id ? <LoaderCircle size={13} className="spin" /> : <Link2 size={13} />}{tr("补全元数据", "Enrich")}</button><button onClick={() => void loadCitationGraph(reference)} disabled={referenceBusy === reference.id}><Network size={13} />{tr("引用关系", "Citation graph")}</button>{reference.url && <button onClick={() => openExternal(reference.url)}><ExternalLink size={13} />DOI</button>}</div>
                      </div>
                    </article>)}</div>
                    <CitationGraphPanel language={language} graph={citationGraph} onOpen={openExternal} />
                  </div>}
            </section>
          )}

          {tab === "search" && (
            <section className="research-panel semantic-search-panel">
              <header className="research-panel-head"><div><span className="eyebrow">LOCAL RESEARCH SEARCH</span><h2>{tr("全库智能检索", "Smart library search")}</h2><p>{tr("在本机检索论文正文，结果始终附带文献、页码和原文位置。", "Search paper text locally; every result includes its paper, page and exact source.")}</p></div></header>
              <form className="research-search-box" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}><Search size={19} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={tr("例如：哪些论文提到样本量不足？", "For example: which papers mention insufficient sample size?")} /><button type="submit">{tr("检索", "Search")}</button></form>
              <label className="research-search-scope"><input type="checkbox" checked={searchProjectOnly} onChange={(event) => setSearchProjectOnly(event.target.checked)} disabled={!activeProject} /><span>{activeProject ? tr(`仅检索项目“${activeProject.name}”`, `Search only “${activeProject.name}”`) : tr("当前没有研究项目，将检索全部文献", "No active project; searching all papers")}</span></label>
              <div className="research-query-suggestions"><span>{tr("快速问题", "Quick queries")}</span>{[tr("研究方法", "research method"), tr("主要结论", "main findings"), tr("矛盾结果", "conflicting results"), tr("局限性", "limitations"), ...searchHistory].filter((item, index, array) => array.indexOf(item) === index).slice(0, 8).map((query) => <button key={query} onClick={() => submitSearch(query)}>{query}</button>)}</div>
              {!searchQuery ? <ResearchEmpty icon={Search} title={tr("输入研究问题开始检索", "Enter a research question")} body={tr("检索完全在本地完成，不会上传论文正文。", "Search runs entirely on-device without uploading paper text.")} />
                : !searchResults.length ? <ResearchEmpty icon={Search} title={tr("没有找到相关段落", "No relevant passages found")} body={tr("尝试减少限定词，或取消“仅当前项目”。", "Try fewer terms or search outside the current project.")} />
                : <div className="semantic-result-list"><div className="semantic-result-summary"><strong>{searchResults.length}</strong><span>{tr("条带来源的匹配结果", "source-linked matches")}</span></div>{searchResults.map((result, index) => {
                    const sourceDocument = documents.find((doc) => doc.id === result.docId);
                    return <button className="semantic-result" key={result.id} onClick={() => onOpenSource(result)}><span className="semantic-rank">{String(index + 1).padStart(2, "0")}</span><span className="semantic-result-copy"><strong>{documentLabel(sourceDocument, language)}</strong><p>{result.text}</p><small>{sourceLabel(result.page, language)} · {tr("匹配", "Matched")}: {result.matchedTerms.join(" / ")}</small></span><ChevronRight size={16} /></button>;
                  })}</div>}
            </section>
          )}

          {tab === "synthesis" && (
            <section className="research-panel synthesis-panel">
              <header className="research-panel-head">
                <div><span className="eyebrow">EVIDENCE SYNTHESIS</span><h2>{tr("可追溯综合报告", "Traceable synthesis report")}</h2><p>{tr("只使用项目中的证据卡片和对比矩阵，并通过 [E1] 标记保留证据链。", "Uses only project evidence and comparison data, preserving traceability with [E1] markers.")}</p></div>
                <div className="research-head-actions"><button onClick={buildLocalProjectSynthesis} disabled={!activeProject || Boolean(synthesisBusy)}>{synthesisBusy === "local" ? <LoaderCircle size={15} className="spin" /> : <List size={15} />}{tr("生成本地提纲", "Local outline")}</button><button className="accent" onClick={() => void buildAIProjectSynthesis()} disabled={!activeProjectEvidence.length || Boolean(synthesisBusy)}>{synthesisBusy === "ai" ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}{tr("AI 综合", "AI synthesis")}</button><button onClick={() => void exportActiveProject()} disabled={!activeProject}><Download size={15} />{tr("导出", "Export")}</button></div>
              </header>
              {!activeProject ? <ResearchEmpty icon={FolderPlus} title={tr("先创建研究项目", "Create a project first")} body={tr("综合报告需要明确的研究问题和项目证据。", "A synthesis needs a research question and project evidence.")} action={tr("创建项目", "Create project")} onAction={openProjectWizard} />
                : !activeProjectEvidence.length && !activeProject.comparisonRows.length ? <ResearchEmpty icon={FileOutput} title={tr("还没有可综合的材料", "Nothing to synthesize yet")} body={tr("先收集证据卡片，或在论文对比中生成矩阵。", "Collect evidence cards or build a comparison matrix first.")} action={tr("去收集证据", "Collect evidence")} onAction={() => setTab("evidence")} />
                : <div className="synthesis-layout"><div className="synthesis-editor"><div className="synthesis-editor-head"><div><strong>{activeProject.name}</strong><small>{activeProject.synthesisUpdatedAt ? `${tr("更新于", "Updated")} ${formatDate(activeProject.synthesisUpdatedAt, language)}` : tr("尚未生成，建议先生成本地提纲", "Not generated yet; start with a local outline")}</small></div><span>{activeProject.synthesis.length.toLocaleString()} {tr("字", "characters")}</span></div><textarea value={activeProject.synthesis} onChange={(event) => saveProjectSynthesis(event.target.value)} placeholder={tr("综合报告会显示在这里。你可以随时编辑，所有修改都会自动保存。", "Your synthesis appears here. Edits are saved automatically.")} /></div><aside className="synthesis-evidence-rail"><header><span className="eyebrow">SOURCE MAP</span><h3>{tr("证据来源", "Evidence sources")}</h3><p>{tr("点击任意来源返回原文。", "Click a source to return to the paper.")}</p></header>{activeProjectEvidence.map((card, index) => <button key={card.id} onClick={() => onOpenSource(card)}><span>E{index + 1}</span><strong>{TYPE_LABELS[card.type][zh ? 0 : 1]}</strong><small>{card.note || card.quote}</small><em>{sourceLabel(card.page, language)}</em></button>)}</aside></div>}
            </section>
          )}
        </main>
      </div>
      {projectWizardOpen && <ProjectWizard language={language} documents={documents} draft={projectDraft} onChange={setProjectDraft} onClose={() => setProjectWizardOpen(false)} onCreate={finishProjectWizard} />}
    </section>
  );
}

function ProjectWizard({ language, documents, draft, onChange, onClose, onCreate }: {
  language: AppLanguage;
  documents: ResearchDocument[];
  draft: ProjectDraft;
  onChange: (draft: ProjectDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  const toggleDocument = (documentId: string) => onChange({
    ...draft,
    documentIds: draft.documentIds.includes(documentId)
      ? draft.documentIds.filter((id) => id !== documentId)
      : [...draft.documentIds, documentId],
  });
  return <div className="research-dialog-backdrop" role="dialog" aria-modal="true" aria-label={tr("创建研究项目", "Create research project")}>
    <form className="project-wizard" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
      <header><div><span className="eyebrow">NEW RESEARCH PROJECT</span><h2>{tr("创建研究项目", "Create research project")}</h2><p>{tr("一次填写研究问题并选择起始文献，创建后会直接看到下一步。", "Define the question and starting papers now; the workbench will recommend the next step.")}</p></div><button type="button" onClick={onClose} title={tr("关闭", "Close")}><X size={18} /></button></header>
      <div className="project-wizard-fields">
        <label><span>{tr("项目名称", "Project name")}</span><input autoFocus value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value.slice(0, 80) })} placeholder={tr("例如：医学影像分割研究综述", "For example: Medical image segmentation review")} /></label>
        <label><span>{tr("核心研究问题", "Research question")}</span><textarea value={draft.question} onChange={(event) => onChange({ ...draft, question: event.target.value.slice(0, 500) })} placeholder={tr("你希望通过这些论文回答什么问题？", "What question should these papers answer?")} /></label>
        <label><span>{tr("范围与预期产出", "Scope and expected output")}</span><textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value.slice(0, 1600) })} placeholder={tr("记录时间范围、纳入标准，或最终要写综述、开题报告等。", "Record time range, inclusion criteria, and whether you need a review, proposal, etc.")} /></label>
      </div>
      <section className="project-wizard-papers"><header><div><strong>{tr("选择起始文献", "Choose starting papers")}</strong><span>{tr("之后仍可随时添加或移除。", "You can change this later.")}</span></div><em>{draft.documentIds.length} / {documents.length}</em></header>{!documents.length ? <p>{tr("文献库为空。可以先创建项目，再导入论文。", "The library is empty. Create the project now and import papers later.")}</p> : <div>{documents.map((document) => { const selected = draft.documentIds.includes(document.id); return <button type="button" className={selected ? "selected" : ""} key={document.id} onClick={() => toggleDocument(document.id)}><span>{selected ? <Check size={13} /> : null}</span><strong>{document.title}</strong><small>{document.authors || document.name}</small></button>; })}</div>}</section>
      <footer><button type="button" onClick={onClose}>{tr("取消", "Cancel")}</button><button className="primary" type="submit"><Plus size={15} />{tr("创建并进入工作台", "Create and continue")}</button></footer>
    </form>
  </div>;
}

function ResearchEmpty({ icon: Icon, title, body, action, onAction }: { icon: typeof Search; title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="research-empty"><span><Icon size={28} /></span><strong>{title}</strong><p>{body}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</div>;
}

function ProjectPanel({ language, documents, project, evidenceCount, onCreate, onUpdate, onDelete }: {
  language: AppLanguage;
  documents: ResearchDocument[];
  project?: ResearchProject;
  evidenceCount: number;
  onCreate: () => void;
  onUpdate: (patch: Partial<ResearchProject>) => void;
  onDelete: () => void;
}) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  if (!project) return <section className="research-panel"><ResearchEmpty icon={FolderPlus} title={tr("创建第一个研究项目", "Create your first project")} body={tr("项目会把研究问题、论文、证据和比较结果组织在一起。", "Projects organize research questions, papers, evidence and comparisons.")} action={tr("新建项目", "New project")} onAction={onCreate} /></section>;
  const toggleDocument = (documentId: string) => {
    const next = project.documentIds.includes(documentId)
      ? project.documentIds.filter((id) => id !== documentId)
      : [...project.documentIds, documentId];
    onUpdate({ documentIds: next, comparisonRows: project.comparisonRows.filter((row) => next.includes(row.docId)) });
  };
  return <section className="research-panel project-panel">
    <header className="research-panel-head"><div><span className="eyebrow">PROJECT SPACE</span><h2>{tr("研究项目设置", "Research project")}</h2><p>{tr("先明确问题，再把相关论文加入同一项目。", "Define the question, then collect relevant papers.")}</p></div><button className="research-icon-button danger" onClick={onDelete} title={tr("删除项目", "Delete project")}><Trash2 size={15} /></button></header>
    <div className="project-editor-grid">
      <label><span>{tr("项目名称", "Project name")}</span><input value={project.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 80) })} /></label>
      <label className="project-question"><span>{tr("核心研究问题", "Research question")}</span><textarea value={project.question} onChange={(event) => onUpdate({ question: event.target.value.slice(0, 500) })} placeholder={tr("例如：证据卡片是否能提高系统综述的可靠性？", "For example: do evidence cards improve review reliability?")} /></label>
      <label className="project-description"><span>{tr("项目说明与范围", "Scope and notes")}</span><textarea value={project.description} onChange={(event) => onUpdate({ description: event.target.value.slice(0, 1600) })} placeholder={tr("记录纳入标准、时间范围和预期产出…", "Record inclusion criteria, time range and expected output…")} /></label>
    </div>
    <div className="project-summary-strip"><div><strong>{project.documentIds.length}</strong><span>{tr("篇项目论文", "project papers")}</span></div><div><strong>{evidenceCount}</strong><span>{tr("张证据卡片", "evidence cards")}</span></div><div><strong>{project.comparisonRows.length}</strong><span>{tr("行对比结果", "comparison rows")}</span></div><small>{tr("更新于", "Updated")} {formatDate(project.updatedAt, language)}</small></div>
    <section className="project-document-picker"><header><div><strong>{tr("项目文献", "Project papers")}</strong><span>{tr("勾选后即可用于对比矩阵和项目内检索。", "Selected papers are used for comparisons and project search.")}</span></div><em>{project.documentIds.length} / {documents.length}</em></header>
      {!documents.length ? <ResearchEmpty icon={FileText} title={tr("文献库为空", "The library is empty")} body={tr("先从左侧导入 PDF 或 Word 论文。", "Import PDF or Word papers from the left panel.")} />
        : <div className="project-document-list">{documents.map((document) => {
            const selected = project.documentIds.includes(document.id);
            return <button className={selected ? "selected" : ""} key={document.id} onClick={() => toggleDocument(document.id)}><span className="project-check">{selected && <Check size={13} />}</span><span><strong>{document.title}</strong><small>{document.authors || document.name}{document.pageCount ? ` · ${document.pageCount} ${tr("页", "pages")}` : ""}</small></span></button>;
          })}</div>}
    </section>
  </section>;
}

function ComparisonTable({ language, documents, rows, onOpenSource, onChange }: {
  language: AppLanguage;
  documents: ResearchDocument[];
  rows: ComparisonRow[];
  onOpenSource: (target: SourceTarget) => void;
  onChange: (rows: ComparisonRow[]) => void;
}) {
  const zh = language === "zh-CN";
  const updateCell = (docId: string, field: ComparisonField, value: string) => onChange(rows.map((row) => row.docId === docId ? { ...row, cells: { ...row.cells, [field]: { ...row.cells[field], value } } } : row));
  return <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>{zh ? "文献" : "Paper"}</th>{COMPARISON_FIELDS.map((field) => <th key={field}>{FIELD_LABELS[field][zh ? 0 : 1]}</th>)}</tr></thead><tbody>{rows.map((row) => {
    const document = documents.find((doc) => doc.id === row.docId);
    return <tr key={row.docId}><th><strong>{documentLabel(document, language)}</strong><small>{document?.authors || document?.name}</small></th>{COMPARISON_FIELDS.map((field) => {
      const cell = row.cells[field];
      return <td key={field}><textarea value={cell.value} onChange={(event) => updateCell(row.docId, field, event.target.value)} placeholder={zh ? "暂无提取结果" : "No extracted value"} />{cell.paragraphId && <button onClick={() => onOpenSource({ docId: row.docId, ...cell })}><FileText size={12} />{sourceLabel(cell.page, language)}</button>}</td>;
    })}</tr>;
  })}</tbody></table></div>;
}

function CitationGraphPanel({ language, graph, onOpen }: { language: AppLanguage; graph: CitationGraph | null; onOpen: (url?: string) => void }) {
  const zh = language === "zh-CN";
  const tr = (cn: string, en: string) => zh ? cn : en;
  if (!graph) return <aside className="citation-graph-panel"><span className="citation-graph-placeholder"><Network size={27} /><strong>{tr("选择“引用关系”查看图谱", "Choose Citation graph")}</strong><small>{tr("将显示代表性引用文献和被引文献。", "Representative references and citing papers appear here.")}</small></span></aside>;
  const list = (title: string, items: CitationGraph["citations"]) => <section><h3>{title}<span>{items.length}</span></h3>{!items.length ? <p>{tr("暂无公开记录", "No public records")}</p> : items.map((paper) => <button key={paper.id} onClick={() => onOpen(paper.url)}><strong>{paper.title}</strong><small>{[paper.authors.slice(0, 3).join(", "), paper.year, paper.venue].filter(Boolean).join(" · ")}</small></button>)}</section>;
  return <aside className="citation-graph-panel loaded"><header><span className="eyebrow">CITATION GRAPH</span><h3>{graph.paper.title}</h3><p>{tr("被引", "Cited by")} {graph.paper.citationCount || 0} · {tr("参考文献", "References")} {graph.paper.referenceCount || 0}</p></header>{list(tr("后来引用它的论文", "Papers citing it"), graph.citations)}{list(tr("它引用的论文", "Its references"), graph.references)}</aside>;
}
