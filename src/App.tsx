import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bookmark,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  GripVertical,
  Highlighter,
  Images,
  Languages,
  LayoutGrid,
  Library,
  List,
  LoaderCircle,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Network,
  NotebookPen,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  RefreshCw,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import PdfDocumentView from "./PdfDocumentView";
import VirtualParagraphList from "./VirtualParagraphList";
import MarkdownContent from "./MarkdownContent";
import CreationWorkspace from "./CreationWorkspace";
import ResearchWorkspace from "./ResearchWorkspace";
import UtilitiesWorkspace from "./UtilitiesWorkspace";
import { copyTextToClipboard } from "./clipboard";
import { isBookChapterHeading } from "./creation";
import { createParagraphExcerpt } from "./aiContent";
import {
  buildInTextReferenceLinks,
  createEvidenceCard,
  normalizeResearchWorkspace,
  parseDocumentReferences,
  RESEARCH_STORAGE_KEY,
} from "./research";
import { parseBookDocument, type ParsedBookDocument } from "./bookParsers";
import {
  buildEmbeddedTableOfContents,
  countTableOfContentsItems,
  detectTableOfContents,
  isProbableStandaloneHeading,
  type PdfOutlineEntry,
} from "./tableOfContents";
import {
  canonicalAnnotationQuote,
  collapsePdfDuplicateText,
  normalizeRelativeRects,
  relativeRectSetsMatch,
  relativeRectSetsOverlap,
} from "./annotationGeometry";
import { buildSummarySelectionOutline, summaryOutlinePath } from "./summaryOutline";
import type {
  AINetworkMode,
  AIProvider,
  AcademicSearchProviderId,
  AcademicSearchResponse,
  AcademicSearchResult,
  AcademicSearchSort,
  AnnotationBooks,
  AppLanguage,
  AppSettings,
  BookSearchProviderId,
  BookSearchResponse,
  BookSearchResult,
  BookSearchSort,
  DocumentType,
  EvidenceRelation,
  EvidenceType,
  GalleryCapture,
  HighlightItem,
  InlineNote,
  InsightPanelMode,
  LibraryFolder,
  Paragraph,
  ReadingTheme,
  ResearchDocument,
  ResearchWorkspaceState,
  SelectionState,
  TableOfContentsItem,
  TranslationDisplayMode,
  TranslationProvider,
  TranslationTargetLanguage,
  UpdateStatus,
  WeeklyReadingGoal,
} from "./models";

GlobalWorkerOptions.workerSrc = pdfWorker;

const DEMO_DOC: ResearchDocument = {
  id: "demo-rag-paper",
  name: "Rethinking_RAG_for_Literature_Review.pdf",
  title: "Rethinking Retrieval-Augmented Generation for Scientific Literature Review",
  path: "",
  type: "pdf",
  shelf: "academic",
  size: 2_480_000,
  modifiedAt: Date.now(),
  addedAt: Date.now(),
  pageCount: 12,
  authors: "Lin Zhao · Mira Patel · Noah Kim",
  venue: "Computational Research Methods · 2026",
  paragraphs: [
    {
      id: "demo-abstract-title",
      kind: "heading",
      page: 1,
      text: "Abstract",
    },
    {
      id: "demo-abstract",
      page: 1,
      text: "Scientific literature review demands both broad retrieval and careful synthesis. Existing retrieval-augmented generation systems often optimize answer relevance while overlooking evidence coverage, contradiction, and the provenance of claims. We introduce an evidence-first workflow that separates discovery, claim clustering, and synthesis into traceable stages.",
    },
    {
      id: "demo-intro-title",
      kind: "heading",
      page: 2,
      text: "1. Introduction",
    },
    {
      id: "demo-intro-1",
      page: 2,
      text: "Researchers rarely struggle because a single paper is impossible to understand. The harder problem is maintaining a coherent model across dozens of papers that use different terminology, datasets, and evaluation conventions. A useful reading system should therefore preserve the path from source passage to interpretation instead of returning isolated summaries.",
    },
    {
      id: "demo-intro-2",
      page: 3,
      text: "Our central hypothesis is that claim-level organization improves review quality more than simply increasing retrieval depth. The proposed pipeline first identifies research questions, then links supporting and opposing evidence, and finally generates a synthesis whose sentences remain connected to the original passages.",
    },
    {
      id: "demo-method-title",
      kind: "heading",
      page: 4,
      text: "2. Evidence-first pipeline",
    },
    {
      id: "demo-method-1",
      page: 4,
      text: "The system converts each document into semantically coherent passages. A dual encoder retrieves candidate passages, while a cross encoder reranks them using the current research question. Retrieved passages are grouped into claim clusters rather than being merged directly into a prompt.",
    },
    {
      id: "demo-method-2",
      page: 6,
      text: "Each cluster records three relations: support, qualification, and contradiction. This small relation vocabulary creates a practical map of the literature and exposes disagreement that would otherwise be flattened by abstractive summarization.",
    },
    {
      id: "demo-results-title",
      kind: "heading",
      page: 8,
      text: "3. Results",
    },
    {
      id: "demo-results-1",
      page: 8,
      text: "Across four review tasks, evidence-first synthesis improved claim coverage by 18 percent and reduced unsupported statements by 31 percent. Gains were largest when the source collection contained conflicting findings or inconsistent definitions.",
    },
    {
      id: "demo-limit-title",
      kind: "heading",
      page: 11,
      text: "4. Limitations",
    },
    {
      id: "demo-limit",
      page: 11,
      text: "The current evaluation focuses on English-language computer science papers. Citation parsing errors and scanned documents remain important failure modes. Future work should test whether domain-specific relation labels are necessary in medicine and the social sciences.",
    },
  ],
  tableOfContentsSource: "detected",
  tableOfContents: [
    { id: "demo-toc-abstract", title: "Abstract", level: 1, page: 1, paragraphId: "demo-abstract-title" },
    { id: "demo-toc-introduction", title: "1. Introduction", level: 1, page: 2, paragraphId: "demo-intro-title" },
    { id: "demo-toc-method", title: "2. Evidence-first pipeline", level: 1, page: 4, paragraphId: "demo-method-title" },
    { id: "demo-toc-results", title: "3. Results", level: 1, page: 8, paragraphId: "demo-results-title" },
    { id: "demo-toc-limitations", title: "4. Limitations", level: 1, page: 11, paragraphId: "demo-limit-title" },
  ],
};

const DEMO_SUMMARY =
  "论文提出“证据优先”的文献综述流程：先围绕研究问题检索段落，再按主张聚类并标注支持、限定与矛盾关系，最后生成可回溯到原文的综合结论。实验显示，该方法能提高论点覆盖率并减少无依据陈述，尤其适合存在冲突证据的文献集合。局限在于目前主要验证了英文计算机科学论文，扫描件与引文解析仍是薄弱环节。";

const EMPTY_DOCUMENT: ResearchDocument = {
  id: "empty-library",
  name: "",
  title: "",
  path: "",
  type: "docx",
  shelf: "academic",
  size: 0,
  modifiedAt: 0,
  addedAt: 0,
  paragraphs: [],
};

const DEFAULT_WEEKLY_READING_GOAL: WeeklyReadingGoal = 120;
const WEEKLY_READING_GOALS: WeeklyReadingGoal[] = [5, 10, 20, 30, 60, 120, null];

type AIModelPreset = { id: string; zh: string; en: string };
type AIProviderPreset = {
  id: AIProvider;
  name: string;
  badge: string;
  baseUrl: string;
  docsUrl?: string;
  zh: string;
  en: string;
  models: AIModelPreset[];
};

const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    badge: "OA",
    baseUrl: "https://api.openai.com/v1",
    docsUrl: "https://developers.openai.com/api/docs/models",
    zh: "官方 GPT 接口；当前文档推荐 GPT-5.6 系列。",
    en: "Official GPT API with the current GPT-5.6 family.",
    models: [
      { id: "gpt-5.6-sol", zh: "GPT-5.6 Sol · 旗舰", en: "GPT-5.6 Sol · flagship" },
      { id: "gpt-5.6-terra", zh: "GPT-5.6 Terra · 均衡", en: "GPT-5.6 Terra · balanced" },
      { id: "gpt-5.6-luna", zh: "GPT-5.6 Luna · 经济", en: "GPT-5.6 Luna · economical" },
      { id: "gpt-5.6", zh: "GPT-5.6 · Sol 别名", en: "GPT-5.6 · Sol alias" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "DS",
    baseUrl: "https://api.deepseek.com",
    docsUrl: "https://api-docs.deepseek.com/",
    zh: "DeepSeek 官方 OpenAI 兼容接口；已避开即将停用的旧模型名。",
    en: "Official OpenAI-compatible DeepSeek API using current model IDs.",
    models: [
      { id: "deepseek-v4-pro", zh: "DeepSeek V4 Pro", en: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", zh: "DeepSeek V4 Flash", en: "DeepSeek V4 Flash" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    badge: "CL",
    baseUrl: "https://api.anthropic.com/v1",
    docsUrl: "https://platform.claude.com/docs/en/about-claude/models/overview",
    zh: "Claude 原生 Messages API，适合长文总结与结构分析。",
    en: "Native Claude Messages API for long-form synthesis and analysis.",
    models: [
      { id: "claude-fable-5", zh: "Claude Fable 5 · 最高能力", en: "Claude Fable 5 · highest capability" },
      { id: "claude-opus-4-8", zh: "Claude Opus 4.8", en: "Claude Opus 4.8" },
      { id: "claude-sonnet-5", zh: "Claude Sonnet 5 · 均衡", en: "Claude Sonnet 5 · balanced" },
      { id: "claude-haiku-4-5-20251001", zh: "Claude Haiku 4.5 · 快速", en: "Claude Haiku 4.5 · fast" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "GG",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    zh: "Google 官方 OpenAI 兼容层，适合多语言论文处理。",
    en: "Google's official OpenAI compatibility layer for Gemini.",
    models: [
      { id: "gemini-3.5-flash", zh: "Gemini 3.5 Flash · 稳定", en: "Gemini 3.5 Flash · stable" },
      { id: "gemini-3.1-pro-preview", zh: "Gemini 3.1 Pro · 预览", en: "Gemini 3.1 Pro · preview" },
      { id: "gemini-2.5-pro", zh: "Gemini 2.5 Pro", en: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", zh: "Gemini 2.5 Flash", en: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", zh: "Gemini 2.5 Flash-Lite", en: "Gemini 2.5 Flash-Lite" },
    ],
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    badge: "KM",
    baseUrl: "https://api.moonshot.cn/v1",
    docsUrl: "https://platform.kimi.com/docs/overview",
    zh: "Kimi 官方 OpenAI 兼容接口，面向中英文与长上下文任务。",
    en: "Official Kimi OpenAI-compatible API for bilingual long-context work.",
    models: [
      { id: "kimi-k3", zh: "Kimi K3 · 旗舰", en: "Kimi K3 · flagship" },
      { id: "kimi-k2.7-code-highspeed", zh: "Kimi K2.7 Code · 高速", en: "Kimi K2.7 Code · high speed" },
      { id: "kimi-k2.7-code", zh: "Kimi K2.7 Code", en: "Kimi K2.7 Code" },
      { id: "kimi-k2.6", zh: "Kimi K2.6 · 通用", en: "Kimi K2.6 · general" },
    ],
  },
  {
    id: "qwen",
    name: "阿里云千问",
    badge: "QW",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    docsUrl: "https://help.aliyun.com/zh/model-studio/models",
    zh: "阿里云百炼北京地域的 OpenAI 兼容接口。",
    en: "Alibaba Model Studio OpenAI-compatible endpoint for the Beijing region.",
    models: [
      { id: "qwen3.7-plus", zh: "Qwen 3.7 Plus", en: "Qwen 3.7 Plus" },
      { id: "qwen3.7-max", zh: "Qwen 3.7 Max", en: "Qwen 3.7 Max" },
      { id: "qwen3.6-flash", zh: "Qwen 3.6 Flash", en: "Qwen 3.6 Flash" },
      { id: "qwen-plus", zh: "Qwen Plus · 稳定别名", en: "Qwen Plus · stable alias" },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    badge: "MM",
    baseUrl: "https://api.minimaxi.com/v1",
    docsUrl: "https://platform.minimaxi.com/docs/guides/text-generation",
    zh: "MiniMax 官方 OpenAI 兼容接口。",
    en: "Official MiniMax OpenAI-compatible API.",
    models: [
      { id: "MiniMax-M2.7", zh: "MiniMax M2.7", en: "MiniMax M2.7" },
      { id: "M2-her", zh: "M2-her · 对话", en: "M2-her · conversation" },
    ],
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    badge: "···",
    baseUrl: "http://127.0.0.1:11434/v1",
    zh: "用于 Ollama、LM Studio、代理网关或其他 OpenAI 兼容服务。",
    en: "For Ollama, LM Studio, gateways and other OpenAI-compatible services.",
    models: [],
  },
];

type TranslationProviderPreset = {
  id: TranslationProvider;
  name: string;
  badge: string;
  docsUrl: string;
  quotaZh: string;
  quotaEn: string;
  zh: string;
  en: string;
};

const TRANSLATION_PROVIDER_PRESETS: TranslationProviderPreset[] = [
  {
    id: "mymemory",
    name: "MyMemory",
    badge: "免密",
    docsUrl: "https://mymemory.translated.net/doc/usagelimits.php",
    quotaZh: "匿名 5,000 字符/天；填写邮箱 50,000 字符/天",
    quotaEn: "5,000 chars/day anonymously; 50,000 with an email",
    zh: "无需账号和密钥，适合临时翻译；术语质量和稳定性低于商业服务。",
    en: "No account or key. Best for occasional use; terminology and reliability are below commercial services.",
  },
  {
    id: "baidu",
    name: "百度翻译",
    badge: "百",
    docsUrl: "https://fanyi-api.baidu.com/product/11",
    quotaZh: "标准版每月 50,000 字符免费；高级版每月 1,000,000 字符免费",
    quotaEn: "50,000 chars/month on Standard; 1,000,000 on Advanced",
    zh: "需要在百度翻译开放平台开通通用文本翻译，并填写 APP ID 与密钥。",
    en: "Requires General Text Translation on Baidu Translate Open Platform, plus an APP ID and secret key.",
  },
  {
    id: "youdao",
    name: "网易有道翻译",
    badge: "有",
    docsUrl: "https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html",
    quotaZh: "新账户官方赠送 50 元体验资金；用完后按字符计费",
    quotaEn: "New accounts receive CNY 50 trial credit; usage is billed after it is depleted",
    zh: "需要在有道智云创建文本翻译应用，并填写应用 ID 与应用密钥。",
    en: "Requires a text-translation app on Youdao AI Cloud, plus an application ID and secret.",
  },
  {
    id: "deepl",
    name: "DeepL API Free",
    badge: "DL",
    docsUrl: "https://developers.deepl.com/docs/resources/usage-limits",
    quotaZh: "免费层 500,000 字符/月",
    quotaEn: "500,000 chars/month on API Free",
    zh: "需要注册 DeepL API Free 并填写认证密钥，适合重视译文自然度的用户。",
    en: "Requires a DeepL API Free key and is well suited to natural-sounding translations.",
  },
  {
    id: "microsoft",
    name: "Microsoft Translator",
    badge: "MS",
    docsUrl: "https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/quickstart/rest-api",
    quotaZh: "F0 免费层 2,000,000 字符/月",
    quotaEn: "2,000,000 chars/month on F0",
    zh: "需要 Azure Translator 资源密钥；区域资源还需填写 Region。",
    en: "Requires an Azure Translator resource key; regional resources also need a Region value.",
  },
  {
    id: "google",
    name: "Google Cloud Translation",
    badge: "GC",
    docsUrl: "https://cloud.google.com/translate/pricing",
    quotaZh: "每月前 500,000 字符免费",
    quotaEn: "First 500,000 chars each month are free",
    zh: "需要启用 Cloud Translation Basic 并填写 Google Cloud API Key。",
    en: "Requires Cloud Translation Basic and a Google Cloud API key.",
  },
];

const TRANSLATION_TARGET_OPTIONS: Array<{
  id: TranslationTargetLanguage;
  zh: string;
  en: string;
}> = [
  { id: "zh-CN", zh: "简体中文", en: "Simplified Chinese" },
  { id: "en-US", zh: "英语", en: "English" },
  { id: "ja-JP", zh: "日语", en: "Japanese" },
  { id: "ko-KR", zh: "韩语", en: "Korean" },
  { id: "fr-FR", zh: "法语", en: "French" },
  { id: "de-DE", zh: "德语", en: "German" },
];

type ReadingActivity = Record<string, Record<string, number>>;
type ReadingPosition = {
  kind: "pdf" | "text";
  page?: number;
  paragraphId?: string;
  offset?: number;
  ratio?: number;
  updatedAt: number;
};
type ReadingPositions = Record<string, ReadingPosition>;
type LastActiveDocuments = Partial<Record<ReadingTheme, string>>;
type OnboardingStatus = { version: number; completed: boolean };
type DocumentFolderAssignments = Record<string, string | null>;
type SettingsTab = "general" | "reading" | "translation" | "ai" | "privacy" | "updates";
type WorkspaceView = "reader" | "library" | "discovery" | "creation" | "research" | "tools";

const STORAGE_KEYS = {
  documents: "paperloom.documents.v1",
  highlights: "paperloom.highlights.v1",
  notes: "paperloom.inline-notes.v1",
  annotations: "paperloom.annotations.v2",
  summaries: "paperloom.summaries.v1",
  folders: "paperloom.library-folders.v1",
  documentFolders: "paperloom.document-folders.v1",
  readingActivity: "paperloom.reading-activity.v1",
  readingPositions: "paperloom.reading-positions.v1",
  lastActiveDocuments: "paperloom.last-active-documents.v1",
  templateDismissed: "paperloom.template-dismissed.v1",
  onboarding: "paperloom.onboarding.v2",
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function templateIsDismissed() {
  return readStored<boolean>(STORAGE_KEYS.templateDismissed, false);
}

function loadDocumentFolderAssignments(): DocumentFolderAssignments {
  const stored = readStored<Record<string, unknown>>(STORAGE_KEYS.documentFolders, {});
  return Object.fromEntries(Object.entries(stored).filter(([, folderId]) => (
    folderId === null || typeof folderId === "string"
  ))) as DocumentFolderAssignments;
}

function applyStoredFolderAssignment(
  document: ResearchDocument,
  assignments: DocumentFolderAssignments,
): ResearchDocument {
  if (!Object.prototype.hasOwnProperty.call(assignments, document.id)) return document;
  const folderId = assignments[document.id];
  return { ...document, folderId: folderId || undefined };
}

function saveDocumentFolderAssignment(documentId: string, folderId?: string) {
  const assignments = loadDocumentFolderAssignments();
  assignments[documentId] = folderId || null;
  localStorage.setItem(STORAGE_KEYS.documentFolders, JSON.stringify(assignments));
}

function removeDocumentFolderAssignment(documentId: string) {
  const assignments = loadDocumentFolderAssignments();
  delete assignments[documentId];
  localStorage.setItem(STORAGE_KEYS.documentFolders, JSON.stringify(assignments));
}

function loadDocuments() {
  const assignments = loadDocumentFolderAssignments();
  const stored = readStored<ResearchDocument[]>(STORAGE_KEYS.documents, [])
    .filter((doc) => doc.id !== DEMO_DOC.id)
    .map((doc) => applyStoredFolderAssignment({ ...doc, shelf: doc.shelf === "books" ? "books" : "academic" }, assignments));
  return templateIsDismissed()
    ? stored
    : [applyStoredFolderAssignment(DEMO_DOC, assignments), ...stored];
}

function loadLibraryFolders(): LibraryFolder[] {
  return readStored<LibraryFolder[]>(STORAGE_KEYS.folders, [])
    .filter((folder) => folder && typeof folder.id === "string" && typeof folder.name === "string")
    .map((folder) => ({
      id: folder.id,
      name: folder.name.trim().slice(0, 48),
      createdAt: Number.isFinite(folder.createdAt) ? folder.createdAt : Date.now(),
      shelf: (folder.shelf === "books" ? "books" : "academic") as ReadingTheme,
    }))
    .filter((folder) => folder.name.length > 0);
}

function loadSummaries() {
  const stored = { ...readStored<Record<string, string>>(STORAGE_KEYS.summaries, {}) };
  if (templateIsDismissed()) {
    delete stored[DEMO_DOC.id];
    return stored;
  }
  return { [DEMO_DOC.id]: DEMO_SUMMARY, ...stored };
}

function loadReadingActivity(): ReadingActivity {
  const stored = readStored<ReadingActivity>(STORAGE_KEYS.readingActivity, {});
  const result: ReadingActivity = {};
  Object.entries(stored).forEach(([day, documents]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !documents || typeof documents !== "object") return;
    const valid: Record<string, number> = {};
    Object.entries(documents).forEach(([documentId, seconds]) => {
      if (Number.isFinite(seconds) && seconds > 0) valid[documentId] = Math.max(0, Number(seconds));
    });
    if (Object.keys(valid).length) result[day] = valid;
  });
  return result;
}

function loadReadingPositions(): ReadingPositions {
  const stored = readStored<Record<string, unknown>>(STORAGE_KEYS.readingPositions, {});
  const result: ReadingPositions = {};
  Object.entries(stored).forEach(([documentId, value]) => {
    if (!value || typeof value !== "object") return;
    const candidate = value as Partial<ReadingPosition>;
    if (candidate.kind !== "pdf" && candidate.kind !== "text") return;
    const position: ReadingPosition = {
      kind: candidate.kind,
      updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : Date.now(),
    };
    if (Number.isFinite(candidate.page)) position.page = Math.max(1, Math.round(Number(candidate.page)));
    if (typeof candidate.paragraphId === "string" && candidate.paragraphId) {
      position.paragraphId = candidate.paragraphId;
    }
    if (Number.isFinite(candidate.offset)) position.offset = Number(candidate.offset);
    if (Number.isFinite(candidate.ratio)) {
      position.ratio = Math.min(1, Math.max(0, Number(candidate.ratio)));
    }
    result[documentId] = position;
  });
  return result;
}

function writeReadingPositions(positions: ReadingPositions) {
  localStorage.setItem(STORAGE_KEYS.readingPositions, JSON.stringify(positions));
}

function loadLastActiveDocuments(): LastActiveDocuments {
  const stored = readStored<Record<string, unknown>>(STORAGE_KEYS.lastActiveDocuments, {});
  return {
    ...(typeof stored.academic === "string" ? { academic: stored.academic } : {}),
    ...(typeof stored.books === "string" ? { books: stored.books } : {}),
  };
}

type AnnotationTarget = {
  paragraphId: string;
  quote?: string;
  text?: string;
  rects?: HighlightItem["rects"];
};

function isSameAnnotationTarget(left: AnnotationTarget, right: AnnotationTarget) {
  if (left.paragraphId !== right.paragraphId) return false;
  const leftRects = normalizeRelativeRects(left.rects);
  const rightRects = normalizeRelativeRects(right.rects);
  if (leftRects.length && rightRects.length) return relativeRectSetsMatch(leftRects, rightRects);
  return canonicalAnnotationQuote(left.quote || left.text || "")
    === canonicalAnnotationQuote(right.quote || right.text || "");
}

function doHighlightTargetsOverlap(left: AnnotationTarget, right: AnnotationTarget) {
  if (left.paragraphId !== right.paragraphId) return false;
  const leftRects = normalizeRelativeRects(left.rects);
  const rightRects = normalizeRelativeRects(right.rects);
  if (leftRects.length && rightRects.length) return relativeRectSetsOverlap(leftRects, rightRects);
  const leftQuote = canonicalAnnotationQuote(left.quote || left.text || "");
  const rightQuote = canonicalAnnotationQuote(right.quote || right.text || "");
  if (!leftQuote || !rightQuote) return false;
  return leftQuote === rightQuote
    || (Math.min(leftQuote.length, rightQuote.length) >= 2
      && (leftQuote.includes(rightQuote) || rightQuote.includes(leftQuote)));
}

function removeOverlappingHighlights(items: HighlightItem[]) {
  return items.reduce<HighlightItem[]>((result, item) => {
    if (!result.some((candidate) => doHighlightTargetsOverlap(candidate, item))) result.push(item);
    return result;
  }, []);
}

function sanitizeAnnotationBooks(books: AnnotationBooks): AnnotationBooks {
  return Object.fromEntries(
    Object.entries(books).map(([docId, book]) => {
      const highlights = (book.highlights || []).map((item) => ({
        ...item,
        rects: item.rects ? normalizeRelativeRects(item.rects) : undefined,
      }));
      const notes = (book.notes || []).reduce<InlineNote[]>((result, item) => {
        const normalized = {
          ...item,
          rects: item.rects ? normalizeRelativeRects(item.rects) : undefined,
        };
        const duplicateIndex = result.findIndex(
          (candidate) => candidate.kind === normalized.kind && isSameAnnotationTarget(candidate, normalized),
        );
        if (duplicateIndex < 0) result.push(normalized);
        else if (result[duplicateIndex].pending && !normalized.pending) result[duplicateIndex] = normalized;
        return result;
      }, []);
      const captures = (book.captures || []).filter((item) => (
        item
        && typeof item.id === "string"
        && item.docId === docId
        && Number.isFinite(item.createdAt)
        && Number.isFinite(item.width)
        && Number.isFinite(item.height)
      )).map((item) => ({
        ...item,
        rects: item.rects ? normalizeRelativeRects(item.rects) : undefined,
      }));
      return [docId, { highlights, notes, captures }];
    }),
  );
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentWeekKeys() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return localDayKey(date);
  });
}

function getWeeklyReadingStats(
  activity: ReadingActivity,
  goalMinutes: WeeklyReadingGoal,
  allowedDocumentIds?: Set<string>,
) {
  const documentIds = new Set<string>();
  const secondsByDocument = new Map<string, number>();
  let seconds = 0;
  const weekKeys = currentWeekKeys();
  weekKeys.forEach((day) => {
    Object.entries(activity[day] || {}).forEach(([documentId, value]) => {
      if (documentId === DEMO_DOC.id || documentId === EMPTY_DOCUMENT.id) return;
      if (allowedDocumentIds && !allowedDocumentIds.has(documentId)) return;
      seconds += value;
      documentIds.add(documentId);
      secondsByDocument.set(documentId, (secondsByDocument.get(documentId) || 0) + value);
    });
  });
  const minutes = Math.floor(seconds / 60);
  const percent = seconds > 0 && goalMinutes !== null
    ? Math.max(1, Math.min(100, Math.round((seconds / (goalMinutes * 60)) * 100)))
    : 0;
  const entries = [...secondsByDocument.entries()]
    .map(([documentId, documentSeconds]) => ({ documentId, seconds: documentSeconds }))
    .sort((left, right) => right.seconds - left.seconds);
  return {
    papers: documentIds.size,
    minutes,
    seconds,
    percent,
    hasActivity: seconds > 0,
    entries,
    weekStart: weekKeys[0],
    weekEnd: weekKeys[weekKeys.length - 1],
  };
}

function formatReadingDuration(seconds: number, language: AppLanguage) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) {
    return language === "zh-CN" ? `${rounded} 秒` : `${rounded} sec`;
  }
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return language === "zh-CN"
      ? `${hours} 小时 ${minutes} 分钟`
      : `${hours} hr ${minutes} min`;
  }
  return language === "zh-CN"
    ? `${minutes} 分 ${remainingSeconds} 秒`
    : `${minutes} min ${remainingSeconds} sec`;
}

function formatWeekRange(startKey: string, endKey: string, language: AppLanguage) {
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  const locale = language === "zh-CN" ? "zh-CN" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatLastReadAt(timestamp: number | undefined, language: AppLanguage) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return language === "zh-CN" ? "尚未阅读" : "Not read yet";
  }
  return new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function loadAnnotationBooks(): AnnotationBooks {
  const books = { ...readStored<AnnotationBooks>(STORAGE_KEYS.annotations, {}) };
  const oldHighlights = readStored<HighlightItem[]>(STORAGE_KEYS.highlights, []);
  const oldNotes = readStored<InlineNote[]>(STORAGE_KEYS.notes, []);
  const ensureBook = (docId: string) => {
    books[docId] ||= { highlights: [], notes: [], captures: [] };
    return books[docId];
  };
  if (!Object.keys(books).length) {
    oldHighlights.forEach((item) => ensureBook(item.docId).highlights.push(item));
    oldNotes.forEach((item) => ensureBook(item.docId).notes.push(item));
  }
  if (templateIsDismissed()) {
    delete books[DEMO_DOC.id];
    return sanitizeAnnotationBooks(books);
  }
  if (!books[DEMO_DOC.id]?.highlights.length) {
    ensureBook(DEMO_DOC.id).highlights.push({
      id: "demo-highlight",
      docId: DEMO_DOC.id,
      paragraphId: "demo-intro-2",
      quote: "claim-level organization improves review quality more than simply increasing retrieval depth",
      color: "yellow",
      createdAt: Date.now(),
    });
  }
  return sanitizeAnnotationBooks(books);
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cleanTitle(name: string) {
  return name.replace(/\.(pdf|docx|epub|txt|md|markdown|html?|fb2)$/i, "").replace(/[_-]+/g, " ");
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  pdf: "PDF",
  docx: "W",
  epub: "EPUB",
  txt: "TXT",
  md: "MD",
  html: "HTML",
  fb2: "FB2",
};

function fileTypeLabel(type: DocumentType) {
  return DOCUMENT_TYPE_LABELS[type] || type.toUpperCase();
}

function documentTypeFromName(name: string): DocumentType {
  const extension = name.toLocaleLowerCase().split(".").pop() || "";
  if (extension === "markdown") return "md";
  if (extension === "htm") return "html";
  if (["pdf", "docx", "epub", "txt", "md", "html", "fb2"].includes(extension)) return extension as DocumentType;
  return "txt";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitPlainText(text: string): Paragraph[] {
  const blocks = text
    .split(/\n\s*\n|\r?\n/)
    .map(normalizeText)
    .filter((item) => item.length > 1);
  return blocks.map((textValue, index) => {
    const looksLikeHeading =
      textValue.length < 90 &&
      !/[。！？.!?]$/.test(textValue) &&
      (/^\d+(\.\d+)*[\s.]/.test(textValue) || /^[A-Z][A-Za-z\s-]{2,}$/.test(textValue));
    return {
      id: `p-${index}-${Math.abs(hashText(textValue))}`,
      text: textValue,
      kind: looksLikeHeading ? "heading" : "body",
    };
  });
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

async function parsePdf(buffer: ArrayBuffer) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  type PdfLine = { text: string; fontSize: number };

  const parsePage = async (pageNumber: number): Promise<Paragraph[]> => {
    const page = await pdf.getPage(pageNumber);
    try {
      const content = await page.getTextContent();
      const lines: PdfLine[] = [];
      let currentLine = "";
      let currentFontSize = 0;
      let lastY: number | null = null;

      const flushLine = () => {
        const text = normalizeText(currentLine);
        if (text) lines.push({ text, fontSize: Math.round(currentFontSize * 10) / 10 });
        currentLine = "";
        currentFontSize = 0;
      };

      for (const rawItem of content.items as Array<Record<string, unknown>>) {
        if (!("str" in rawItem)) continue;
        const item = rawItem as { str: string; hasEOL?: boolean; height?: number; transform?: number[] };
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5 && currentLine.trim()) {
          flushLine();
        }
        currentLine += `${item.str} `;
        const transformSize = item.transform
          ? Math.hypot(item.transform[0] || 0, item.transform[1] || 0)
          : 0;
        currentFontSize = Math.max(currentFontSize, transformSize || item.height || 0);
        if (item.hasEOL && currentLine.trim()) {
          flushLine();
        }
        lastY = y;
      }
      if (currentLine.trim()) flushLine();

      const merged: PdfLine[] = [];
      for (const line of lines.filter((item) => item.text)) {
        const previous = merged[merged.length - 1];
        if (
          previous &&
          previous.text.length < 500 &&
          !/[。！？.!?:：]$/.test(previous.text) &&
          !isProbableStandaloneHeading(previous.text) &&
          !(previous.fontSize > 0 && line.fontSize > 0 && previous.fontSize > line.fontSize * 1.06) &&
          line.text.length > 18
        ) {
          merged[merged.length - 1] = {
            text: `${previous.text} ${line.text}`,
            fontSize: Math.max(previous.fontSize, line.fontSize),
          };
        } else {
          merged.push(line);
        }
      }

      return [{
        id: `page-${pageNumber}`,
        text: `第 ${pageNumber} 页`,
        kind: "heading",
        page: pageNumber,
      }, ...merged.map((line, index): Paragraph => ({
        id: `page-${pageNumber}-p-${index}-${Math.abs(hashText(line.text))}`,
        text: line.text,
        kind: isProbableStandaloneHeading(line.text) || (line.text.length < 100 && !/[。！？.!?]$/.test(line.text)) ? "heading" : "body",
        page: pageNumber,
        fontSize: line.fontSize || undefined,
      }))];
    } finally {
      page.cleanup();
    }
  };

  const paragraphs: Paragraph[] = [];
  const batchSize = 4;
  for (let pageStart = 1; pageStart <= pdf.numPages; pageStart += batchSize) {
    const pageNumbers = Array.from(
      { length: Math.min(batchSize, pdf.numPages - pageStart + 1) },
      (_, index) => pageStart + index,
    );
    const batch = await Promise.all(pageNumbers.map(parsePage));
    batch.forEach((pageParagraphs) => paragraphs.push(...pageParagraphs));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  let outline: PdfOutlineEntry[] | null = null;
  try {
    outline = await pdf.getOutline() as PdfOutlineEntry[] | null;
  } catch {
    // A malformed bookmark tree must not prevent the PDF itself from opening.
    outline = null;
  }
  const embeddedTableOfContents = await buildEmbeddedTableOfContents(
    outline,
    async (destination) => {
      const resolved = typeof destination === "string"
        ? await pdf.getDestination(destination)
        : destination;
      if (!Array.isArray(resolved) || !resolved.length) return undefined;
      const reference = resolved[0];
      let pageIndex: number;
      if (typeof reference === "number" && Number.isInteger(reference)) {
        pageIndex = reference;
      } else if (reference && typeof reference === "object") {
        pageIndex = await pdf.getPageIndex(reference as Parameters<typeof pdf.getPageIndex>[0]);
      } else {
        return undefined;
      }
      return pageIndex >= 0 && pageIndex < pdf.numPages ? pageIndex + 1 : undefined;
    },
  );
  const tableOfContents = embeddedTableOfContents.length
    ? embeddedTableOfContents
    : detectTableOfContents(paragraphs);
  const pageCount = pdf.numPages;
  await loadingTask.destroy();

  return {
    paragraphs,
    pageCount,
    tableOfContents,
    tableOfContentsSource: embeddedTableOfContents.length ? "embedded" as const : "detected" as const,
  };
}

async function parseDocument(buffer: ArrayBuffer, type: DocumentType): Promise<ParsedBookDocument> {
  if (type === "pdf") return parsePdf(buffer);
  if (type === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const paragraphs = splitPlainText(result.value);
    return {
      paragraphs,
      pageCount: undefined,
      tableOfContents: detectTableOfContents(paragraphs),
      tableOfContentsSource: "detected" as const,
    };
  }
  return parseBookDocument(buffer, type);
}

function buildLocalSummary(text: string) {
  const sentences = text
    .split(/(?<=[。！？.!?])\s+/)
    .map(normalizeText)
    .filter((item) => item.length > 20);
  if (!sentences.length) return text.slice(0, 420);
  const selected = [sentences[0], ...sentences.slice(1).sort((a, b) => b.length - a.length).slice(0, 2)];
  return selected.join(" ").slice(0, 760);
}

function getElement(node: Node | null) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function highlightText(
  text: string,
  highlights: HighlightItem[],
  searchTerm: string,
  links: Paragraph["links"] = [],
  onOpenLink?: (targetParagraphId: string) => void,
): ReactNode[] {
  const ranges: Array<{
    start: number;
    end: number;
    kind: "highlight" | "search" | "link";
    color?: HighlightItem["color"];
    id: string;
    targetParagraphId?: string;
  }> = [];

  highlights.forEach((item) => {
    const start = text.indexOf(item.quote);
    if (start >= 0) {
      ranges.push({
        start,
        end: start + item.quote.length,
        kind: "highlight",
        color: item.color,
        id: item.id,
      });
    }
  });

  const query = searchTerm.trim().toLocaleLowerCase();
  if (query) {
    const lower = text.toLocaleLowerCase();
    let cursor = 0;
    while (cursor < lower.length) {
      const start = lower.indexOf(query, cursor);
      if (start < 0) break;
      const end = start + query.length;
      ranges.push({ start, end, kind: "search", id: `search-${start}` });
      cursor = end;
    }
  }

  links.forEach((link, index) => {
    if (
      !link.targetParagraphId
      || !Number.isFinite(link.start)
      || !Number.isFinite(link.end)
      || link.start < 0
      || link.end <= link.start
      || link.end > text.length
    ) return;
    ranges.push({
      start: link.start,
      end: link.end,
      kind: "link",
      id: `link-${index}-${link.start}-${link.end}`,
      targetParagraphId: link.targetParagraphId,
    });
  });

  if (!ranges.length) return [text];
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap((range) => [range.start, range.end])])]
    .filter((position) => position >= 0 && position <= text.length)
    .sort((left, right) => left - right);
  const result: ReactNode[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;
    const active = ranges.filter((range) => range.start < end && range.end > start);
    const segment = text.slice(start, end);
    const highlight = [...active].reverse().find((range) => range.kind === "highlight");
    const internalLink = active.find((range) => range.kind === "link");
    const classes = [
      highlight ? `paper-highlight ${highlight.color}` : "",
      active.some((range) => range.kind === "search") ? "search-hit" : "",
    ].filter(Boolean).join(" ");
    const key = `${start}-${end}-${active.map((range) => range.id).join("-")}`;
    const content = classes
      ? <mark className={classes}>{segment}</mark>
      : segment;
    result.push(internalLink?.targetParagraphId && onOpenLink
      ? (
          <button
            type="button"
            key={key}
            className="epub-inline-link"
            title="跳转到对应参考文献或书内注释"
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenLink(internalLink.targetParagraphId!);
            }}
          >
            {content}
          </button>
        )
      : <span key={key}>{content}</span>);
  }
  return result;
}

function SummarySourceOutlineLayer({ notes }: { notes: InlineNote[] }) {
  const outlines = notes
    .filter((note) => note.kind === "summary")
    .map((note) => ({ noteId: note.id, outline: buildSummarySelectionOutline(note.rects) }))
    .filter((item) => item.outline !== null);
  if (!outlines.length) return null;

  return (
    <svg
      className="paper-summary-outline-layer"
      aria-hidden="true"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {outlines.map(({ noteId, outline }) => (
        <path
          key={`${noteId}-summary-outline`}
          className={`paper-summary-outline ${outline!.kind}`}
          d={summaryOutlinePath(outline!)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function countMatches(paragraphs: Paragraph[], query: string) {
  if (!query.trim()) return 0;
  const pattern = query.toLocaleLowerCase();
  return paragraphs.reduce((total, paragraph) => {
    let count = 0;
    let cursor = 0;
    const text = paragraph.text.toLocaleLowerCase();
    while ((cursor = text.indexOf(pattern, cursor)) >= 0) {
      count += 1;
      cursor += pattern.length;
    }
    return total + count;
  }, 0);
}

function readableAIError(error: unknown, language: AppLanguage, fallback: string) {
  let message = error instanceof Error ? error.message : String(error || "");
  message = message
    .replace(/^Error invoking remote method ['"]ai:complete['"]:\s*/i, "")
    .replace(/^(?:Error|TypeError):\s*/i, "")
    .trim();

  if (!message || /fetch failed/i.test(message)) {
    return language === "zh-CN"
      ? "无法连接 AI 接口，请检查接口地址、网络和代理设置。"
      : "Cannot connect to the AI endpoint. Check its address, your network and proxy settings.";
  }
  return message || fallback;
}

type PdfInlineInsertionCoordinate = { y: number; gap: number };

function readPdfInlineInsertions(element: HTMLElement): PdfInlineInsertionCoordinate[] {
  try {
    const value = JSON.parse(element.dataset.inlineInsertions || "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is PdfInlineInsertionCoordinate => Boolean(
        item
        && typeof item === "object"
        && Number.isFinite((item as PdfInlineInsertionCoordinate).y)
        && Number.isFinite((item as PdfInlineInsertionCoordinate).gap),
      ))
      .map((item) => ({ y: Math.max(0, item.y), gap: Math.max(0, item.gap) }))
      .sort((left, right) => left.y - right.y);
  } catch {
    return [];
  }
}

function restorePdfOriginalY(visualY: number, insertions: PdfInlineInsertionCoordinate[]) {
  let accumulatedGap = 0;
  for (const insertion of insertions) {
    const visualAnchor = insertion.y + accumulatedGap;
    if (visualY < visualAnchor) break;
    if (visualY < visualAnchor + insertion.gap) return insertion.y;
    accumulatedGap += insertion.gap;
  }
  return visualY - accumulatedGap;
}

function applyPdfInlineInsertions(originalY: number, insertions: PdfInlineInsertionCoordinate[]) {
  return originalY + insertions.reduce(
    (total, insertion) => total + (originalY >= insertion.y ? insertion.gap : 0),
    0,
  );
}

function sourceLookupFragments(value: string) {
  const normalized = normalizeText(value).normalize("NFKC");
  const fragments: string[] = [...(normalized.match(/[A-Za-z0-9][A-Za-z0-9-]{3,}/g) || [])];
  const chineseSegments: string[] = [...(normalized.match(/[\u3400-\u9fff]{4,}/g) || [])];
  chineseSegments.forEach((segment) => {
    for (let index = 0; index <= Math.min(segment.length - 4, 12); index += 2) {
      fragments.push(segment.slice(index, index + 4));
    }
  });
  return [...new Set(fragments)].sort((left, right) => right.length - left.length);
}

function findPdfSourceSpan(container: HTMLElement, quote: string) {
  const spans = Array.from(container.querySelectorAll<HTMLElement>(".textLayer span"))
    .filter((span) => normalizeText(span.textContent || ""));
  if (!spans.length) return undefined;

  const compactQuote = normalizeText(quote)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "");
  if (compactQuote.length >= 6) {
    for (let start = 0; start < spans.length; start += 1) {
      let combined = "";
      for (let end = start; end < Math.min(spans.length, start + 10); end += 1) {
        combined += spans[end].textContent || "";
        const compactCombined = combined
          .normalize("NFKC")
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "");
        if (compactCombined.includes(compactQuote)) return spans[start];
        if (compactCombined.length > compactQuote.length * 2.2) break;
      }
    }
  }

  const fragments = sourceLookupFragments(quote).map((fragment) => fragment.toLocaleLowerCase());
  let best: { span: HTMLElement; score: number } | undefined;
  for (let start = 0; start < spans.length; start += 1) {
    const windowText = spans
      .slice(start, Math.min(spans.length, start + 5))
      .map((span) => span.textContent || "")
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase();
    const score = fragments.reduce(
      (total, fragment) => total + (windowText.includes(fragment) ? fragment.length * fragment.length : 0),
      0,
    );
    if (!best || score > best.score) best = { span: spans[start], score };
  }
  return best && best.score >= 16 ? best.span : undefined;
}

type SourceNavigationTarget = {
  docId?: string;
  paragraphId?: string;
  page?: number;
  quote?: string;
  rects?: HighlightItem["rects"];
};

type EvidenceDraft = {
  projectId?: string;
  docId: string;
  paragraphId: string;
  page?: number;
  quote: string;
  type: EvidenceType;
  relation: EvidenceRelation;
  note: string;
  tags: string;
  rects?: HighlightItem["rects"];
};

type CaptureOverlayBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CaptureDrag = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type ViewportCaptureRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function captureIntersectionArea(left: ViewportCaptureRect | DOMRect, right: ViewportCaptureRect | DOMRect) {
  const overlapWidth = Math.max(0, Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left));
  const overlapHeight = Math.max(0, Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top));
  return overlapWidth * overlapHeight;
}

function captureDragRectangle(bounds: CaptureOverlayBounds, drag: CaptureDrag): ViewportCaptureRect {
  const left = Math.min(drag.startX, drag.currentX);
  const top = Math.min(drag.startY, drag.currentY);
  return {
    left: bounds.left + left,
    top: bounds.top + top,
    width: Math.abs(drag.currentX - drag.startX),
    height: Math.abs(drag.currentY - drag.startY),
  };
}

type AcademicDatabaseId = "cnki" | "wanfang" | "google-scholar" | "semantic-scholar" | "pubmed" | "arxiv" | "ieee" | "sciencedirect" | "springer";

type AcademicDatabase = {
  id: AcademicDatabaseId;
  mark: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  buildSearchUrl: (query: string) => string;
};

type AcademicApiProvider = {
  id: AcademicSearchProviderId;
  name: string;
  description: string;
  descriptionEn: string;
  accent: string;
  officialSearchUrl: (query: string) => string;
};

const ACADEMIC_API_PROVIDERS: AcademicApiProvider[] = [
  {
    id: "openalex",
    name: "OpenAlex",
    description: "跨学科开放学术索引，覆盖期刊、会议、预印本与开放获取版本",
    descriptionEn: "Open scholarly index spanning journals, conferences, preprints and open-access copies",
    accent: "clay",
    officialSearchUrl: (query) => `https://openalex.org/works?page=1&filter=default.search:${encodeURIComponent(query)}`,
  },
  {
    id: "crossref",
    name: "Crossref",
    description: "按题名、作者、DOI 与出版信息检索权威注册元数据",
    descriptionEn: "Authoritative DOI registration metadata searchable by title, author and publication details",
    accent: "sand",
    officialSearchUrl: (query) => `https://search.crossref.org/?q=${encodeURIComponent(query)}`,
  },
  {
    id: "semantic-scholar",
    name: "Semantic Scholar",
    description: "支持摘要、引用量与开放全文链接的智能学术索引",
    descriptionEn: "AI-powered scholarly index with abstracts, citation counts and open full-text links",
    accent: "plum",
    officialSearchUrl: (query) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(query)}&sort=relevance`,
  },
  {
    id: "pubmed",
    name: "PubMed",
    description: "生物医学与生命科学领域的权威文献数据库",
    descriptionEn: "Authoritative biomedical and life-science literature database",
    accent: "mint",
    officialSearchUrl: (query) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
  },
];

const ACADEMIC_DATABASES: AcademicDatabase[] = [
  {
    id: "cnki",
    mark: "CN",
    name: "中国知网",
    nameEn: "CNKI",
    description: "中文期刊、学位论文与会议文献",
    descriptionEn: "Chinese journals, theses and conference papers",
    buildSearchUrl: (query) => `https://kns.cnki.net/kns8s/defaultresult/index?korder=SU&kw=${encodeURIComponent(query)}`,
  },
  {
    id: "wanfang",
    mark: "WF",
    name: "万方数据",
    nameEn: "Wanfang Data",
    description: "中文期刊、学位、会议与科技报告",
    descriptionEn: "Chinese journals, theses, conferences and reports",
    buildSearchUrl: (query) => `https://s.wanfangdata.com.cn/paper?q=${encodeURIComponent(query)}`,
  },
  {
    id: "google-scholar",
    mark: "GS",
    name: "Google Scholar",
    nameEn: "Google Scholar",
    description: "跨学科论文与引用检索",
    descriptionEn: "Cross-disciplinary papers and citations",
    buildSearchUrl: (query) => `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
  },
  {
    id: "semantic-scholar",
    mark: "SS",
    name: "Semantic Scholar",
    nameEn: "Semantic Scholar",
    description: "AI 驱动的跨学科文献检索",
    descriptionEn: "AI-powered cross-disciplinary discovery",
    buildSearchUrl: (query) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(query)}&sort=relevance`,
  },
  {
    id: "pubmed",
    mark: "PM",
    name: "PubMed",
    nameEn: "PubMed",
    description: "生物医学与生命科学文献",
    descriptionEn: "Biomedical and life-science literature",
    buildSearchUrl: (query) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
  },
  {
    id: "arxiv",
    mark: "AX",
    name: "arXiv",
    nameEn: "arXiv",
    description: "理工科预印本，优先匹配题名",
    descriptionEn: "STEM preprints with title-focused search",
    buildSearchUrl: (query) => `https://arxiv.org/search/?query=${encodeURIComponent(query)}&searchtype=title&abstracts=show&order=-announced_date_first&size=50`,
  },
  {
    id: "ieee",
    mark: "IE",
    name: "IEEE Xplore",
    nameEn: "IEEE Xplore",
    description: "电子、计算机与工程技术文献",
    descriptionEn: "Electronics, computing and engineering research",
    buildSearchUrl: (query) => `https://ieeexplore.ieee.org/search/searchresult.jsp?newsearch=true&queryText=${encodeURIComponent(query)}`,
  },
  {
    id: "sciencedirect",
    mark: "SD",
    name: "ScienceDirect",
    nameEn: "ScienceDirect",
    description: "Elsevier 期刊与图书资源",
    descriptionEn: "Elsevier journals and books",
    buildSearchUrl: (query) => `https://www.sciencedirect.com/search?qs=${encodeURIComponent(query)}`,
  },
  {
    id: "springer",
    mark: "SN",
    name: "Springer Nature",
    nameEn: "Springer Nature",
    description: "Springer Nature 期刊、图书与会议文献",
    descriptionEn: "Springer Nature journals, books and proceedings",
    buildSearchUrl: (query) => `https://link.springer.com/search?query=${encodeURIComponent(query)}`,
  },
];

type BookApiProvider = {
  id: BookSearchProviderId;
  mark: string;
  name: string;
  description: string;
  descriptionEn: string;
  accent: string;
  officialSearchUrl: (query: string) => string;
};

const BOOK_API_PROVIDERS: BookApiProvider[] = [
  {
    id: "open-library",
    mark: "OL",
    name: "Open Library",
    description: "开放书目、版本、封面与可借阅信息",
    descriptionEn: "Open bibliographic records, editions, covers and borrowing availability",
    accent: "clay",
    officialSearchUrl: (query) => `https://openlibrary.org/search?q=${encodeURIComponent(query)}`,
  },
  {
    id: "google-books",
    mark: "GB",
    name: "Google Books",
    description: "全球图书元数据、内容简介与官方预览入口",
    descriptionEn: "Global book metadata, descriptions and official preview routes",
    accent: "mint",
    officialSearchUrl: (query) => `https://books.google.com/books?q=${encodeURIComponent(query)}`,
  },
  {
    id: "internet-archive",
    mark: "IA",
    name: "Internet Archive",
    description: "数字化电子书、在线借阅与可下载历史版本",
    descriptionEn: "Digitized ebooks, online borrowing and downloadable historical editions",
    accent: "sand",
    officialSearchUrl: (query) => `https://archive.org/search?query=${encodeURIComponent(query)}&and%5B%5D=mediatype%3A%22texts%22`,
  },
  {
    id: "project-gutenberg",
    mark: "PG",
    name: "Project Gutenberg",
    description: "可在线阅读并获取 EPUB、HTML、TXT 等电子书格式",
    descriptionEn: "Ebooks available in EPUB, HTML, TXT and other reading formats",
    accent: "plum",
    officialSearchUrl: (query) => `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(query)}`,
  },
];

const BOOK_CATALOGS = [
  {
    id: "douban",
    mark: "豆",
    name: "豆瓣读书",
    nameEn: "Douban Books",
    description: "中文书籍信息、版本与读者书评",
    descriptionEn: "Chinese book editions and reader reviews",
    buildSearchUrl: (query: string) => `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(query)}`,
  },
  {
    id: "weread",
    mark: "微",
    name: "微信读书",
    nameEn: "WeRead",
    description: "中文电子书与网络阅读入口",
    descriptionEn: "Chinese ebooks and online reading",
    buildSearchUrl: (query: string) => `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(query)}`,
  },
];

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const readingPositionsRef = useRef<ReadingPositions>(loadReadingPositions());
  const lastActiveDocumentsRef = useRef<LastActiveDocuments>(loadLastActiveDocuments());
  const readingPositionTimerRef = useRef<number | null>(null);
  const restoringPositionRef = useRef(false);
  const hydrationAttemptedRef = useRef<Set<string>>(new Set());
  const startupDocumentRestoredRef = useRef(false);
  const [documents, setDocuments] = useState<ResearchDocument[]>(loadDocuments);
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>(loadLibraryFolders);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("reader");
  const [researchStartTab, setResearchStartTab] = useState<"overview" | "projects" | "evidence" | "comparison" | "citations" | "search" | "synthesis">("overview");
  const [selectedLibraryFolder, setSelectedLibraryFolder] = useState<string>("all");
  const [movingDocumentId, setMovingDocumentId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(() => loadDocuments()[0]?.id || EMPTY_DOCUMENT.id);
  const [annotationBooks, setAnnotationBooks] = useState<AnnotationBooks>(loadAnnotationBooks);
  const [researchState, setResearchState] = useState<ResearchWorkspaceState>(() => (
    normalizeResearchWorkspace(readStored(RESEARCH_STORAGE_KEY, {}))
  ));
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft | null>(null);
  const [pendingResearchSource, setPendingResearchSource] = useState<SourceNavigationTarget | null>(null);
  const [researchCorpusLoading, setResearchCorpusLoading] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, string>>(loadSummaries);
  const [readingActivity, setReadingActivity] = useState<ReadingActivity>(loadReadingActivity);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    const status = readStored<OnboardingStatus>(STORAGE_KEYS.onboarding, { version: 2, completed: false });
    return !templateIsDismissed() && !status.completed;
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [revealedParagraphId, setRevealedParagraphId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [pageZoom, setPageZoom] = useState(100);
  const [textZoom, setTextZoom] = useState(100);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [currentPage, setCurrentPage] = useState(1);
  const [sideTab, setSideTab] = useState<"toc" | "summary" | "notes" | "gallery">("toc");
  const [loadingDocument, setLoadingDocument] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"summary" | "selection" | null>(null);
  const [readingDetailsOpen, setReadingDetailsOpen] = useState(false);
  const [weeklyGoalSaving, setWeeklyGoalSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<AppSettings>({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-terra",
    apiKey: "",
    networkMode: "auto",
    proxyUrl: "",
    language: "zh-CN",
    readingTheme: "academic",
    defaultZoom: 100,
    pageSpacing: "comfortable",
    translationDisplayMode: "inline",
    translationEngine: "ai",
    translationProvider: "mymemory",
    translationAppId: "",
    translationApiKey: "",
    translationRegion: "",
    translationEmail: "",
    translationTargetLanguage: "zh-CN",
    summaryDisplayMode: "inline",
    translationFontSize: 14,
    allowDuplicateHighlights: false,
    insightPanelMode: "standard",
    insightPanelWidth: 500,
    insightFontSize: 12,
    libraryPanelVisible: true,
    weeklyReadingGoal: DEFAULT_WEEKLY_READING_GOAL,
    autoCheckUpdates: true,
  });
  const [settingsReady, setSettingsReady] = useState(() => !window.paperLoom);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(settings);
  const [aiConnectionTest, setAIConnectionTest] = useState<{
    status: "idle" | "testing" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [translationConnectionTest, setTranslationConnectionTest] = useState<{
    status: "idle" | "testing" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    phase: "disabled",
    supported: false,
    configured: false,
    portable: false,
    currentVersion: "0.9.1",
    message: "",
  });
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureBounds, setCaptureBounds] = useState<CaptureOverlayBounds | null>(null);
  const [captureDrag, setCaptureDrag] = useState<CaptureDrag | null>(null);
  const [captureSaving, setCaptureSaving] = useState(false);
  const [galleryImages, setGalleryImages] = useState<Record<string, string>>({});

  const readingTheme = settings.readingTheme;
  const themeDocuments = useMemo(
    () => documents.filter((doc) => (doc.shelf === "books" ? "books" : "academic") === readingTheme),
    [documents, readingTheme],
  );
  const themeFolders = useMemo(
    () => libraryFolders.filter((folder) => (folder.shelf === "books" ? "books" : "academic") === readingTheme),
    [libraryFolders, readingTheme],
  );
  const activeDocument = themeDocuments.find((doc) => doc.id === activeId) || themeDocuments[0] || EMPTY_DOCUMENT;
  const paragraphs = activeDocument.paragraphs || [];
  const activeBook = annotationBooks[activeDocument.id] || { highlights: [], notes: [], captures: [] };
  const activeHighlights = activeBook.highlights;
  const activeNotes = activeBook.notes;
  const activeCaptures = activeBook.captures || [];
  const activeHighlightsByParagraph = useMemo(() => {
    const grouped = new Map<string, HighlightItem[]>();
    activeHighlights.forEach((item) => {
      const items = grouped.get(item.paragraphId);
      if (items) items.push(item);
      else grouped.set(item.paragraphId, [item]);
    });
    return grouped;
  }, [activeHighlights]);
  const activeNotesByParagraph = useMemo(() => {
    const grouped = new Map<string, InlineNote[]>();
    activeNotes.forEach((item) => {
      const items = grouped.get(item.paragraphId);
      if (items) items.push(item);
      else grouped.set(item.paragraphId, [item]);
    });
    return grouped;
  }, [activeNotes]);
  const activeCaptureKey = activeCaptures.map((item) => item.id).join("|");
  const activeTableOfContents = useMemo(
    () => activeDocument.tableOfContents?.length
      ? activeDocument.tableOfContents
      : detectTableOfContents(paragraphs),
    [activeDocument.tableOfContents, paragraphs],
  );
  const activeTableOfContentsCount = useMemo(
    () => countTableOfContentsItems(activeTableOfContents),
    [activeTableOfContents],
  );
  const activeReferences = useMemo(
    () => readingTheme === "books" ? [] : parseDocumentReferences(activeDocument),
    [activeDocument, readingTheme],
  );
  const matchCount = useMemo(
    () => countMatches(paragraphs, deferredSearchTerm),
    [paragraphs, deferredSearchTerm],
  );
  const language = settings.language;
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const isBookMode = readingTheme === "books";
  const weeklyReading = useMemo(
    () => getWeeklyReadingStats(
      readingActivity,
      settings.weeklyReadingGoal,
      new Set(themeDocuments.map((doc) => doc.id)),
    ),
    [readingActivity, settings.weeklyReadingGoal, themeDocuments],
  );
  const expandedLibraryWidth = windowWidth <= 1090 ? 210 : windowWidth <= 1230 ? 226 : 266;
  const standardInsightWidth = windowWidth <= 1090 ? 310 : windowWidth <= 1230 ? 330 : 370;
  const libraryPanelWidth = settings.libraryPanelVisible ? expandedLibraryWidth : 0;
  const maxInsightPanelWidth = Math.floor(Math.max(
    320,
    Math.min(windowWidth / 2, windowWidth - libraryPanelWidth - 500),
  ));
  const requestedInsightWidth = Math.min(
    maxInsightPanelWidth,
    Math.max(320, settings.insightPanelWidth),
  );
  const insightPanelWidth = settings.insightPanelMode === "hidden"
    ? 0
    : settings.insightPanelMode === "custom"
      ? requestedInsightWidth
      : standardInsightWidth;
  const appShellStyle = {
    "--library-panel-width": `${libraryPanelWidth}px`,
    "--insight-panel-width": `${insightPanelWidth}px`,
    "--translation-font-size": `${settings.translationFontSize}px`,
    "--insight-font-size": `${settings.insightFontSize}px`,
  } as React.CSSProperties;
  const captureSelectionRect = captureBounds && captureDrag
    ? captureDragRectangle(captureBounds, captureDrag)
    : null;

  const persistReadingPosition = useCallback((pageOverride?: number) => {
    if (
      restoringPositionRef.current
      || workspaceView !== "reader"
      || activeDocument.id === DEMO_DOC.id
      || activeDocument.id === EMPTY_DOCUMENT.id
    ) return;
    const reader = readerScrollRef.current;
    if (!reader) return;
    const scrollRange = Math.max(0, reader.scrollHeight - reader.clientHeight);
    const ratio = scrollRange > 0 ? Math.min(1, Math.max(0, reader.scrollTop / scrollRange)) : 0;
    let position: ReadingPosition;

    if (activeDocument.type === "pdf") {
      position = {
        kind: "pdf",
        page: Math.max(1, Math.round(pageOverride || currentPage || 1)),
        ratio,
        updatedAt: Date.now(),
      };
    } else {
      const readerRect = reader.getBoundingClientRect();
      const paragraphElements = Array.from(
        reader.querySelectorAll<HTMLElement>(".paper [data-paragraph-id]"),
      );
      const anchor = paragraphElements.find((element) => (
        element.getBoundingClientRect().bottom > readerRect.top + 72
      )) || paragraphElements.at(-1);
      const anchorRect = anchor?.getBoundingClientRect();
      position = {
        kind: "text",
        paragraphId: anchor?.dataset.paragraphId,
        offset: anchorRect ? anchorRect.top - readerRect.top : undefined,
        ratio,
        updatedAt: Date.now(),
      };
    }

    readingPositionsRef.current = {
      ...readingPositionsRef.current,
      [activeDocument.id]: position,
    };
    writeReadingPositions(readingPositionsRef.current);
  }, [activeDocument.id, activeDocument.type, currentPage, workspaceView]);

  const queueReadingPositionSave = useCallback(() => {
    if (restoringPositionRef.current || workspaceView !== "reader") return;
    if (readingPositionTimerRef.current !== null) {
      window.clearTimeout(readingPositionTimerRef.current);
    }
    readingPositionTimerRef.current = window.setTimeout(() => {
      readingPositionTimerRef.current = null;
      persistReadingPosition();
    }, 180);
  }, [persistReadingPosition, workspaceView]);

  const handlePdfPageChange = useCallback((page: number) => {
    setCurrentPage(page);
    if (!restoringPositionRef.current) persistReadingPosition(page);
  }, [persistReadingPosition]);

  useEffect(() => {
    if (!window.paperLoom) {
      setSettingsReady(true);
      return;
    }
    window.paperLoom.getSettings().then((saved) => {
      const next = saved as AppSettings;
      setSettings(next);
      setSettingsDraft(next);
      setPageZoom(next.defaultZoom);
    }).catch(() => undefined).finally(() => setSettingsReady(true));
  }, []);

  useEffect(() => {
    if (!window.paperLoom) return;
    let active = true;
    void window.paperLoom.getUpdateStatus()
      .then((status) => { if (active) setUpdateStatus(status as UpdateStatus); })
      .catch(() => undefined);
    const unsubscribe = window.paperLoom.onUpdateStatus((status) => {
      if (active) setUpdateStatus(status as UpdateStatus);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!settingsReady || startupDocumentRestoredRef.current) return;
    startupDocumentRestoredRef.current = true;
    const rememberedId = lastActiveDocumentsRef.current[readingTheme];
    const targetDocument = themeDocuments.find((doc) => doc.id === rememberedId)
      || themeDocuments.find((doc) => doc.id === activeId)
      || themeDocuments[0];
    if (targetDocument && targetDocument.id !== activeId) {
      setActiveId(targetDocument.id);
      setCurrentPage(readingPositionsRef.current[targetDocument.id]?.page || 1);
      setSelection(null);
    } else if (!targetDocument && workspaceView === "reader") {
      setWorkspaceView("library");
    }
  }, [activeId, readingTheme, settingsReady, themeDocuments, workspaceView]);

  useEffect(() => {
    if (!settingsReady || themeDocuments.some((doc) => doc.id === activeId)) return;
    const rememberedId = lastActiveDocumentsRef.current[readingTheme];
    const targetDocument = themeDocuments.find((doc) => doc.id === rememberedId) || themeDocuments[0];
    setActiveId(targetDocument?.id || EMPTY_DOCUMENT.id);
    setCurrentPage(targetDocument
      ? readingPositionsRef.current[targetDocument.id]?.page || 1
      : 1);
    setSelection(null);
    if (!targetDocument && workspaceView === "reader") setWorkspaceView("library");
  }, [activeId, readingTheme, settingsReady, themeDocuments, workspaceView]);

  useEffect(() => {
    if (
      !settingsReady
      || activeDocument.id === DEMO_DOC.id
      || activeDocument.id === EMPTY_DOCUMENT.id
      || !themeDocuments.some((doc) => doc.id === activeDocument.id)
    ) return;
    lastActiveDocumentsRef.current = {
      ...lastActiveDocumentsRef.current,
      [readingTheme]: activeDocument.id,
    };
    localStorage.setItem(
      STORAGE_KEYS.lastActiveDocuments,
      JSON.stringify(lastActiveDocumentsRef.current),
    );
  }, [activeDocument.id, readingTheme, settingsReady, themeDocuments]);

  useEffect(() => {
    const saved = readingPositionsRef.current[activeDocument.id];
    setRevealedParagraphId(
      saved?.kind === "text" ? saved.paragraphId || null : null,
    );
  }, [activeDocument.id]);

  useEffect(() => {
    if (workspaceView === "reader") return;
    const frame = window.requestAnimationFrame(() => {
      if (readerScrollRef.current) readerScrollRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceView]);

  useEffect(() => {
    if (
      workspaceView !== "reader"
      || activeDocument.id === DEMO_DOC.id
      || activeDocument.id === EMPTY_DOCUMENT.id
      || !readingPositionsRef.current[activeDocument.id]
    ) return;
    const saved = readingPositionsRef.current[activeDocument.id];
    let cancelled = false;
    let retryTimer: number | null = null;
    let releaseTimer: number | null = null;
    restoringPositionRef.current = true;

    const release = () => {
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        if (!cancelled) restoringPositionRef.current = false;
      }, 260);
    };
    const restore = (attempt = 0) => {
      if (cancelled) return;
      const reader = readerScrollRef.current;
      if (!reader) {
        if (attempt < 24) retryTimer = window.setTimeout(() => restore(attempt + 1), 120);
        else restoringPositionRef.current = false;
        return;
      }

      if (activeDocument.type === "pdf" && saved.kind === "pdf") {
        const page = Math.min(
          activeDocument.pageCount || saved.page || 1,
          Math.max(1, saved.page || 1),
        );
        setCurrentPage(page);
        const pageElement = reader.querySelector<HTMLElement>(`[data-pdf-page-number="${page}"]`);
        if (pageElement) {
          reader.scrollTop = Math.max(0, pageElement.offsetTop - 18);
          release();
          return;
        }
      } else if (saved.kind === "text") {
        const target = saved.paragraphId
          ? reader.querySelector<HTMLElement>(
              `[data-paragraph-id="${CSS.escape(saved.paragraphId)}"]`,
            )
          : null;
        if (target) {
          const readerRect = reader.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          reader.scrollTop = Math.max(
            0,
            reader.scrollTop + targetRect.top - readerRect.top - (saved.offset || 0),
          );
          release();
          return;
        }
      }

      if (attempt < 24) {
        retryTimer = window.setTimeout(() => restore(attempt + 1), 120);
        return;
      }
      const scrollRange = Math.max(0, reader.scrollHeight - reader.clientHeight);
      if (saved.ratio !== undefined && scrollRange > 0) {
        reader.scrollTop = Math.round(scrollRange * saved.ratio);
      }
      release();
    };

    window.requestAnimationFrame(() => restore());
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      restoringPositionRef.current = false;
    };
  }, [
    activeDocument.id,
    activeDocument.pageCount,
    activeDocument.type,
    paragraphs.length,
    workspaceView,
  ]);

  useEffect(() => {
    const saveBeforeClose = () => persistReadingPosition();
    window.addEventListener("beforeunload", saveBeforeClose);
    return () => window.removeEventListener("beforeunload", saveBeforeClose);
  }, [persistReadingPosition]);

  useEffect(() => () => {
    if (readingPositionTimerRef.current !== null) {
      window.clearTimeout(readingPositionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!settingsReady || settings.allowDuplicateHighlights) return;
    setAnnotationBooks((current) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(current).map(([docId, book]) => {
        const highlights = removeOverlappingHighlights(book.highlights || []);
        if (highlights.length !== (book.highlights || []).length) changed = true;
        return [docId, changed ? { ...book, highlights } : book];
      }));
      return changed ? next : current;
    });
  }, [settingsReady, settings.allowDuplicateHighlights]);

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (!captureMode) return;
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCaptureMode(false);
      setCaptureBounds(null);
      setCaptureDrag(null);
      setToast(tr("已取消截图", "Screenshot cancelled"));
    };
    window.addEventListener("keydown", cancelWithEscape);
    return () => window.removeEventListener("keydown", cancelWithEscape);
  }, [captureMode, language]);

  useEffect(() => {
    const metadata = documents
      .filter((doc) => doc.id !== DEMO_DOC.id)
      .map(({ paragraphs: _paragraphs, binary: _binary, ...doc }) => doc);
    localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(metadata));
  }, [documents]);

  useEffect(() => {
    if (
      workspaceView !== "reader"
      || activeId === DEMO_DOC.id
      || activeId === EMPTY_DOCUMENT.id
    ) return;
    const readAt = Date.now();
    setDocuments((current) => current.map((doc) => (
      doc.id === activeId && (!doc.lastReadAt || readAt - doc.lastReadAt > 1_000)
        ? { ...doc, lastReadAt: readAt }
        : doc
    )));
  }, [activeId, workspaceView]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.folders, JSON.stringify(libraryFolders)), [libraryFolders]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.annotations, JSON.stringify(annotationBooks)), [annotationBooks]);
  useEffect(() => localStorage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(researchState)), [researchState]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.summaries, JSON.stringify(summaries)), [summaries]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.readingActivity, JSON.stringify(readingActivity)), [readingActivity]);

  useEffect(() => {
    if (!window.paperLoom || !activeCaptures.length) return;
    let disposed = false;
    const missing = activeCaptures.filter((item) => !galleryImages[item.id]);
    if (!missing.length) return;
    void Promise.all(missing.map(async (item) => ({
      id: item.id,
      dataUrl: await window.paperLoom!.readGalleryCapture({
        documentId: activeDocument.id,
        captureId: item.id,
      }),
    }))).then((items) => {
      if (disposed) return;
      setGalleryImages((current) => ({
        ...current,
        ...Object.fromEntries(items.filter((item) => item.dataUrl).map((item) => [item.id, item.dataUrl])),
      }));
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [activeDocument.id, activeCaptureKey]);

  useEffect(() => {
    if (
      workspaceView !== "reader"
      || !themeDocuments.length
      || activeDocument.id === DEMO_DOC.id
      || activeDocument.id === EMPTY_DOCUMENT.id
    ) return;
    let lastTick = Date.now();
    let tracking = document.visibilityState === "visible" && document.hasFocus();

    const flush = () => {
      const now = Date.now();
      const elapsed = tracking ? Math.min(30, Math.max(0, (now - lastTick) / 1000)) : 0;
      lastTick = now;
      if (elapsed < 1) return;
      const day = localDayKey();
      setReadingActivity((current) => ({
        ...current,
        [day]: {
          ...(current[day] || {}),
          [activeDocument.id]: (current[day]?.[activeDocument.id] || 0) + elapsed,
        },
      }));
    };

    const refreshTracking = () => {
      flush();
      tracking = document.visibilityState === "visible" && document.hasFocus();
      lastTick = Date.now();
    };

    const timer = window.setInterval(flush, 15_000);
    window.addEventListener("focus", refreshTracking);
    window.addEventListener("blur", refreshTracking);
    document.addEventListener("visibilitychange", refreshTracking);
    return () => {
      flush();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshTracking);
      window.removeEventListener("blur", refreshTracking);
      document.removeEventListener("visibilitychange", refreshTracking);
    };
  }, [activeDocument.id, themeDocuments.length, workspaceView]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.title = language === "zh-CN"
      ? isBookMode ? "PaperLoom — 文章小说阅读工作台" : "PaperLoom — 论文阅读工作台"
      : isBookMode ? "PaperLoom — Books and fiction workspace" : "PaperLoom — Research reading workspace";
  }, [language, isBookMode]);

  const filteredDocuments = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase();
    if (!query) return themeDocuments;
    return themeDocuments.filter((doc) => `${doc.title} ${doc.name}`.toLocaleLowerCase().includes(query));
  }, [themeDocuments, librarySearch]);

  const createLibraryFolder = (name: string) => {
    const trimmed = normalizeText(name).slice(0, 48);
    if (!trimmed) return false;
    if (themeFolders.some((folder) => folder.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setToast(tr("已经存在同名文件夹", "A folder with this name already exists"));
      return false;
    }
    const folder: LibraryFolder = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now(), shelf: readingTheme };
    setLibraryFolders((current) => [...current, folder]);
    setSelectedLibraryFolder(folder.id);
    setToast(tr(`已创建文件夹“${trimmed}”`, `Created folder “${trimmed}”`));
    return true;
  };

  const renameLibraryFolder = (folderId: string, name: string) => {
    const trimmed = normalizeText(name).slice(0, 48);
    if (!trimmed) return false;
    if (themeFolders.some(
      (folder) => folder.id !== folderId && folder.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    )) {
      setToast(tr("已经存在同名文件夹", "A folder with this name already exists"));
      return false;
    }
    setLibraryFolders((current) => current.map((folder) => (
      folder.id === folderId ? { ...folder, name: trimmed } : folder
    )));
    setToast(tr(`文件夹已重命名为“${trimmed}”`, `Folder renamed to “${trimmed}”`));
    return true;
  };

  const moveDocumentToFolder = (documentId: string, folderId?: string) => {
    const documentToMove = documents.find((item) => item.id === documentId);
    if (!documentToMove || documentToMove.folderId === folderId || movingDocumentId) return;
    if (folderId && !themeFolders.some((folder) => folder.id === folderId)) return;
    // Persist the user's decision immediately so closing during the move animation cannot lose it.
    saveDocumentFolderAssignment(documentId, folderId);
    setMovingDocumentId(documentId);
    window.setTimeout(() => {
      setDocuments((current) => current.map((item) => (
        item.id === documentId ? { ...item, folderId } : item
      )));
      setMovingDocumentId(null);
      const folderName = folderId
        ? themeFolders.find((folder) => folder.id === folderId)?.name
        : tr("未分类", "Unfiled");
      setToast(tr(`已移动到“${folderName}”`, `Moved to “${folderName}”`));
    }, 230);
  };

  const showLibraryOverview = () => {
    setWorkspaceView("library");
    setSelection(null);
  };

  const showAcademicSearch = () => {
    setWorkspaceView("discovery");
    setSelection(null);
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(isBookMode ? "#book-search-query" : "#academic-search-query")?.focus();
    }, 120);
  };

  const showCreationWorkspace = () => {
    persistReadingPosition();
    setWorkspaceView("creation");
    setSelection(null);
    setModeMenuOpen(false);
  };

  const hydrateResearchCorpus = async () => {
    if (researchCorpusLoading || !window.paperLoom?.readResearchIndexes) return;
    const academicDocuments = documents.filter((doc) => (
      (doc.shelf === "books" ? "books" : "academic") === "academic"
      && doc.id !== DEMO_DOC.id
      && !doc.paragraphs
    ));
    if (!academicDocuments.length) return;
    setResearchCorpusLoading(true);
    setToast(tr("正在加载本地研究索引…", "Loading local research indexes…"));
    try {
      const stored = await window.paperLoom.readResearchIndexes({
        documents: academicDocuments.map((doc) => ({ id: doc.id, modifiedAt: doc.modifiedAt })),
      });
      const hydrated = new Map<string, Paragraph[]>();
      Object.entries(stored).forEach(([documentId, indexedParagraphs]) => {
        if (indexedParagraphs.length) hydrated.set(documentId, indexedParagraphs as Paragraph[]);
      });
      const unresolved = academicDocuments.filter((doc) => !hydrated.has(doc.id) && doc.path);
      for (let start = 0; start < unresolved.length; start += 2) {
        const batch = unresolved.slice(start, start + 2);
        const parsedBatch = await Promise.all(batch.map(async (doc) => {
          try {
            const buffer = await window.paperLoom!.readFile(doc.path);
            const parsed = await parseDocument(buffer, doc.type);
            if (parsed.paragraphs.length) {
              hydrated.set(doc.id, parsed.paragraphs);
              void window.paperLoom!.saveResearchIndex({
                documentId: doc.id,
                modifiedAt: doc.modifiedAt,
                paragraphs: parsed.paragraphs,
              }).catch(() => undefined);
            }
          } catch {
            // A missing or moved source file stays visible in the library but cannot be indexed.
          }
        }));
        void parsedBatch;
      }
      if (hydrated.size) {
        setDocuments((current) => current.map((doc) => (
          hydrated.has(doc.id) ? { ...doc, paragraphs: hydrated.get(doc.id) } : doc
        )));
      }
      setToast(tr(`研究索引已就绪：${hydrated.size} 篇论文`, `Research index ready: ${hydrated.size} papers`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("研究索引加载失败", "Failed to load research indexes"));
    } finally {
      setResearchCorpusLoading(false);
    }
  };

  const showToolsWorkspace = () => {
    persistReadingPosition();
    setWorkspaceView("tools");
    setSelection(null);
    setModeMenuOpen(false);
  };

  const showResearchWorkspace = () => {
    persistReadingPosition();
    setResearchStartTab("overview");
    setWorkspaceView("research");
    setSelection(null);
    setModeMenuOpen(false);
    void hydrateResearchCorpus();
  };

  const showReferenceNavigator = () => {
    persistReadingPosition();
    setResearchStartTab("citations");
    setWorkspaceView("research");
    clearNativeSelection();
    setModeMenuOpen(false);
    void hydrateResearchCorpus();
  };

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsDraft(settings);
    setAIConnectionTest({ status: "idle", message: "" });
    setTranslationConnectionTest({ status: "idle", message: "" });
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const updateLayoutSettings = async (patch: Partial<AppSettings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSettingsDraft((current) => ({ ...current, ...patch }));
    try {
      const saved = window.paperLoom
        ? await window.paperLoom.saveSettings(next)
        : next;
      setSettings(saved as AppSettings);
      setSettingsDraft((current) => ({ ...current, ...patch }));
    } catch (error) {
      setSettings(previous);
      setSettingsDraft((current) => ({ ...current, ...previous }));
      setToast(error instanceof Error ? error.message : tr("布局设置保存失败", "Failed to save layout settings"));
    }
  };

  const switchReadingTheme = async (nextTheme: ReadingTheme) => {
    if (nextTheme === readingTheme) {
      setModeMenuOpen(false);
      return;
    }
    persistReadingPosition();
    const targetDocuments = documents.filter((doc) => (
      (doc.shelf === "books" ? "books" : "academic") === nextTheme
    ));
    const rememberedId = lastActiveDocumentsRef.current[nextTheme];
    const targetDocument = targetDocuments.find((doc) => doc.id === rememberedId)
      || targetDocuments[0];
    setActiveId(targetDocument?.id || EMPTY_DOCUMENT.id);
    setSelectedLibraryFolder("all");
    setLibrarySearch("");
    setSearchTerm("");
    setSelection(null);
    setCurrentPage(targetDocument
      ? readingPositionsRef.current[targetDocument.id]?.page || 1
      : 1);
    setSideTab("toc");
    setWorkspaceView(targetDocuments.length ? "reader" : "library");
    setModeMenuOpen(false);
    await updateLayoutSettings({ readingTheme: nextTheme });
  };

  const beginInsightResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (settings.insightPanelMode !== "custom") return;
    event.preventDefault();
    event.stopPropagation();
    let latestWidth = requestedInsightWidth;
    document.body.classList.add("resizing-insight");

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      latestWidth = Math.round(Math.min(
        maxInsightPanelWidth,
        Math.max(320, window.innerWidth - pointerEvent.clientX),
      ));
      setSettings((current) => ({
        ...current,
        insightPanelMode: "custom",
        insightPanelWidth: latestWidth,
      }));
      setSettingsDraft((current) => ({
        ...current,
        insightPanelMode: "custom",
        insightPanelWidth: latestWidth,
      }));
    };

    const finishResize = () => {
      document.body.classList.remove("resizing-insight");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      void updateLayoutSettings({ insightPanelMode: "custom", insightPanelWidth: latestWidth });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
  };

  const updateDocumentNotes = (
    docId: string,
    updater: (notes: InlineNote[]) => InlineNote[],
  ) => {
    setAnnotationBooks((current) => {
      const book = current[docId] || { highlights: [], notes: [], captures: [] };
      return { ...current, [docId]: { ...book, notes: updater(book.notes) } };
    });
  };

  const updateDocumentHighlights = (
    docId: string,
    updater: (items: HighlightItem[]) => HighlightItem[],
  ) => {
    setAnnotationBooks((current) => {
      const book = current[docId] || { highlights: [], notes: [], captures: [] };
      return { ...current, [docId]: { ...book, highlights: updater(book.highlights) } };
    });
  };

  const updateDocumentCaptures = (
    docId: string,
    updater: (items: GalleryCapture[]) => GalleryCapture[],
  ) => {
    setAnnotationBooks((current) => {
      const book = current[docId] || { highlights: [], notes: [], captures: [] };
      return { ...current, [docId]: { ...book, captures: updater(book.captures || []) } };
    });
  };

  const loadDescriptor = useCallback(async (
    descriptor: OpenDocumentResult,
    id?: string,
    options: { silent?: boolean } = {},
  ) => {
    const docId = id || crypto.randomUUID();
    setLoadingDocument(docId);
    try {
      const buffer = await window.paperLoom!.readFile(descriptor.path);
      const parsed = await parseDocument(buffer, descriptor.type);
      if (!parsed.paragraphs.length) {
        throw new Error(descriptor.type === "pdf"
          ? "没有读取到可选择的文本；这可能是一份扫描版 PDF，需要 OCR。"
          : "没有读取到可阅读的正文，请检查文件是否为空、加密或损坏。");
      }
      const nextDoc: ResearchDocument = {
        id: docId,
        name: descriptor.name,
        title: parsed.title || cleanTitle(descriptor.name),
        path: descriptor.path,
        type: descriptor.type,
        shelf: readingTheme,
        size: descriptor.size,
        modifiedAt: descriptor.modifiedAt,
        addedAt: Date.now(),
        lastReadAt: Date.now(),
        pageCount: parsed.pageCount,
        paragraphs: parsed.paragraphs,
        tableOfContents: parsed.tableOfContents,
        tableOfContentsSource: parsed.tableOfContentsSource,
        authors: parsed.authors,
        venue: parsed.venue,
      };
      if (window.paperLoom?.saveResearchIndex) {
        void window.paperLoom.saveResearchIndex({
          documentId: docId,
          modifiedAt: descriptor.modifiedAt,
          paragraphs: parsed.paragraphs,
        }).catch(() => undefined);
      }
      setDocuments((current) => {
        const existing = current.find((doc) => doc.id === docId);
        const hydratedDocument = existing
          ? {
              ...nextDoc,
              // Reloading document contents must never overwrite library organization.
              folderId: existing.folderId,
              shelf: existing.shelf,
              addedAt: existing.addedAt,
              lastReadAt: existing.lastReadAt,
            }
          : nextDoc;
        return [hydratedDocument, ...current.filter((doc) => doc.id !== docId)];
      });
      setActiveId(docId);
      setWorkspaceView("reader");
      setSideTab("toc");
      setSearchTerm("");
      if (!options.silent) setToast(`${tr("已导入", "Imported")} ${descriptor.name}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("文档读取失败", "Failed to read document"));
    } finally {
      setLoadingDocument(null);
    }
  }, [language, readingTheme]);

  useEffect(() => {
    if (
      !settingsReady
      || workspaceView !== "reader"
      || !window.paperLoom
      || activeDocument.id === DEMO_DOC.id
      || activeDocument.id === EMPTY_DOCUMENT.id
      || activeDocument.paragraphs
      || !activeDocument.path
      || loadingDocument === activeDocument.id
      || hydrationAttemptedRef.current.has(activeDocument.id)
    ) return;
    hydrationAttemptedRef.current.add(activeDocument.id);
    void loadDescriptor(
      {
        path: activeDocument.path,
        name: activeDocument.name,
        type: activeDocument.type,
        size: activeDocument.size,
        modifiedAt: activeDocument.modifiedAt,
      },
      activeDocument.id,
      { silent: true },
    );
  }, [
    activeDocument.id,
    activeDocument.modifiedAt,
    activeDocument.name,
    activeDocument.paragraphs,
    activeDocument.path,
    activeDocument.size,
    activeDocument.type,
    loadDescriptor,
    loadingDocument,
    settingsReady,
    workspaceView,
  ]);

  const importDocuments = async () => {
    if (!window.paperLoom) {
      fileInputRef.current?.click();
      return;
    }
    const files = await window.paperLoom.openDocuments(readingTheme);
    for (const file of files) await loadDescriptor(file);
  };

  const importBrowserFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const type = documentTypeFromName(file.name);
      const id = crypto.randomUUID();
      setLoadingDocument(id);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = await parseDocument(buffer.slice(0), type);
        const doc: ResearchDocument = {
          id,
          name: file.name,
          title: parsed.title || cleanTitle(file.name),
          path: "",
          type,
          shelf: readingTheme,
          size: file.size,
          modifiedAt: file.lastModified,
          addedAt: Date.now(),
          lastReadAt: Date.now(),
          pageCount: parsed.pageCount,
          paragraphs: parsed.paragraphs,
          binary: type === "pdf" ? new Uint8Array(buffer) : undefined,
          tableOfContents: parsed.tableOfContents,
          tableOfContentsSource: parsed.tableOfContentsSource,
          authors: parsed.authors,
          venue: parsed.venue,
        };
        setDocuments((current) => [doc, ...current]);
        setActiveId(id);
        setWorkspaceView("reader");
        setSideTab("toc");
      } catch (error) {
        setToast(error instanceof Error ? error.message : tr("文档读取失败", "Failed to read document"));
      } finally {
        setLoadingDocument(null);
      }
    }
  };

  const selectDocument = async (doc: ResearchDocument) => {
    persistReadingPosition();
    const readAt = Date.now();
    setDocuments((current) => current.map((item) => (
      item.id === doc.id ? { ...item, lastReadAt: readAt } : item
    )));
    setWorkspaceView("reader");
    setActiveId(doc.id);
    setSideTab("toc");
    setCurrentPage(readingPositionsRef.current[doc.id]?.page || 1);
    setSearchTerm("");
    setSelection(null);
    if (!doc.paragraphs && doc.path && window.paperLoom) {
      await loadDescriptor(
        {
          path: doc.path,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          modifiedAt: doc.modifiedAt,
        },
        doc.id,
        { silent: true },
      );
    }
  };

  const captureSelection = () => {
    window.setTimeout(() => {
      const selected = window.getSelection();
      const nativeText = normalizeText(selected?.toString() || "");
      if (!selected || selected.rangeCount === 0 || nativeText.length < 2) {
        setSelection(null);
        return;
      }
      const anchorParagraph = getElement(selected.anchorNode)?.closest<HTMLElement>("[data-paragraph-id]");
      const focusParagraph = getElement(selected.focusNode)?.closest<HTMLElement>("[data-paragraph-id]");
      const selectedRange = selected.getRangeAt(0);
      const rect = selectedRange.getBoundingClientRect();
      if (!anchorParagraph || anchorParagraph !== focusParagraph) {
        setSelection({
          text: nativeText,
          paragraphId: "",
          top: Math.max(14, rect.top - 58),
          left: Math.min(window.innerWidth - 180, Math.max(18, rect.left + rect.width / 2 - 65)),
          copyOnly: true,
        });
        return;
      }
      const containerRect = anchorParagraph.getBoundingClientRect();
      const pdfOriginalHeight = Number(anchorParagraph.dataset.pdfOriginalHeight);
      const coordinateHeight = Number.isFinite(pdfOriginalHeight) && pdfOriginalHeight > 0
        ? pdfOriginalHeight
        : containerRect.height;
      const inlineInsertions = readPdfInlineInsertions(anchorParagraph);
      const rawRects = Array.from(selectedRange.getClientRects())
        .filter((item) => item.width > 0 && item.height > 0)
        .map((item) => {
          const visualTop = item.top - containerRect.top;
          const originalTop = inlineInsertions.length
            ? restorePdfOriginalY(visualTop, inlineInsertions)
            : visualTop;
          return {
            x: (item.left - containerRect.left) / containerRect.width,
            y: originalTop / coordinateHeight,
            width: item.width / containerRect.width,
            height: item.height / coordinateHeight,
          };
        })
        .filter((item) => item.x >= -0.01 && item.y >= -0.01 && item.x + item.width <= 1.01 && item.y + item.height <= 1.01);
      const rects = normalizeRelativeRects(rawRects);
      const text = collapsePdfDuplicateText(nativeText, rects.length < rawRects.length);
      setSelection({
        text,
        paragraphId: anchorParagraph.dataset.paragraphId || "",
        top: Math.max(14, rect.top - 58),
        left: Math.min(window.innerWidth - 555, Math.max(280, rect.left + rect.width / 2 - 250)),
        rects,
      });
    }, 0);
  };

  const clearNativeSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const copySelectedText = async () => {
    if (!selection) return;
    try {
      await copyTextToClipboard(selection.text);
      clearNativeSelection();
      setToast(tr("选中文字已复制", "Selected text copied"));
    } catch {
      setToast(tr("复制失败，请重试", "Copy failed. Please try again"));
    }
  };

  const addHighlight = (color: HighlightItem["color"]) => {
    if (!selection || !activeDocument) return;
    if (!settings.allowDuplicateHighlights && activeHighlights.some((item) => doHighlightTargetsOverlap(item, selection))) {
      clearNativeSelection();
      setToast(tr(
        "这段文字已经标记过；可在阅读设置中允许重复标记",
        "This passage is already highlighted. Repeats can be enabled in Reading settings",
      ));
      return;
    }
    updateDocumentHighlights(activeDocument.id, (current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        docId: activeDocument.id,
        paragraphId: selection.paragraphId,
        quote: selection.text,
        color,
        createdAt: Date.now(),
        rects: selection.rects,
      },
    ]);
    clearNativeSelection();
    setToast(isBookMode
      ? tr("已加入当前书籍的重点标记", "Highlight saved to this book")
      : tr("已加入当前文献的重点标记", "Highlight saved to this paper"));
  };

  const openEvidenceCardDraft = () => {
    if (!selection || !activeDocument || isBookMode) return;
    const pageFromId = Number(selection.paragraphId.match(/^(?:pdf-page-|page-)(\d+)/)?.[1]);
    const sourceParagraph = activeDocument.paragraphs?.find((item) => item.id === selection.paragraphId);
    const page = sourceParagraph?.page || (Number.isFinite(pageFromId) ? pageFromId : undefined);
    setEvidenceDraft({
      projectId: researchState.activeProjectId,
      docId: activeDocument.id,
      paragraphId: selection.paragraphId,
      ...(page ? { page } : {}),
      quote: selection.text,
      type: "claim",
      relation: "neutral",
      note: "",
      tags: "",
      rects: selection.rects,
    });
    clearNativeSelection();
  };

  const saveEvidenceCard = () => {
    if (!evidenceDraft) return;
    const duplicate = researchState.evidenceCards.some((card) => (
      card.docId === evidenceDraft.docId
      && card.paragraphId === evidenceDraft.paragraphId
      && canonicalAnnotationQuote(card.quote) === canonicalAnnotationQuote(evidenceDraft.quote)
      && card.projectId === evidenceDraft.projectId
    ));
    if (duplicate) {
      setEvidenceDraft(null);
      setToast(tr("这段原文已经保存到当前项目", "This source is already saved to the current project"));
      return;
    }
    const card = createEvidenceCard({
      ...evidenceDraft,
      tags: evidenceDraft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    });
    setResearchState((current) => ({ ...current, evidenceCards: [card, ...current.evidenceCards] }));
    setEvidenceDraft(null);
    setToast(tr("证据卡片已保存，并保留原文位置", "Evidence card saved with its source location"));
  };

  const ensureAIReady = () => {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(settings.baseUrl);
    if (!settings.apiKey && !local) {
      openSettings("ai");
      setToast(tr("请先配置 AI 接口", "Configure an AI endpoint first"));
      return false;
    }
    return true;
  };

  const ensureTranslationReady = () => {
    if (settings.translationEngine === "ai") return ensureAIReady();
    if (!window.paperLoom) {
      setToast(tr("专用在线翻译仅在桌面版中可用", "Dedicated online translation is available in the desktop app only"));
      return false;
    }
    if (settings.translationProvider !== "mymemory" && !settings.translationApiKey) {
      openSettings("translation");
      setToast(tr("请先填写专用翻译服务的密钥", "Enter the dedicated translation service key first"));
      return false;
    }
    if (["baidu", "youdao"].includes(settings.translationProvider) && !settings.translationAppId) {
      openSettings("translation");
      setToast(tr("请先填写翻译服务的应用 ID", "Enter the translation service application ID first"));
      return false;
    }
    return true;
  };

  const requestAI = async (system: string, user: string, json = false) => {
    if (!window.paperLoom) return buildLocalSummary(user);
    return window.paperLoom.completeAI({ system, user, json });
  };

  const runSelectionAction = async (kind: "translation" | "summary") => {
    if (!selection || !activeDocument) return;
    if (activeNotes.some((note) => note.kind === kind && isSameAnnotationTarget(note, selection))) {
      clearNativeSelection();
      setToast(kind === "translation"
        ? tr("这段文字已经有译文，不会重复翻译", "This passage already has a translation")
        : tr("这段文字已经生成过总结，不会重复添加", "This passage already has a summary"));
      return;
    }
    if (!(kind === "translation" ? ensureTranslationReady() : ensureAIReady())) return;
    const snapshot = selection;
    const noteId = crypto.randomUUID();
    updateDocumentNotes(activeDocument.id, (current) => [
      ...current,
      {
        id: noteId,
        docId: activeDocument.id,
        paragraphId: snapshot.paragraphId,
        quote: snapshot.text,
        kind,
        content: kind === "translation" ? tr("正在翻译…", "Translating…") : tr("正在提炼要点…", "Summarizing…"),
        pending: true,
        rects: snapshot.rects,
      },
    ]);
    clearNativeSelection();
    setAiBusy("selection");
    try {
      const content = kind === "translation" && settings.translationEngine === "dedicated"
        ? await window.paperLoom!.translateText({ text: snapshot.text })
        : await requestAI(
            kind === "translation"
              ? language === "zh-CN"
                ? isBookMode
                  ? "你是严谨的文学与书籍翻译助手。把选中文本翻译成自然、准确的简体中文，保留叙述语气、人物称谓和专有名词；不添加解释，只输出译文。"
                  : "你是严谨的学术翻译助手。把论文内容翻译成自然、准确的简体中文；保留术语含义，不添加解释，只输出译文。"
                : isBookMode
                  ? "You are a careful literary translator. Translate the selected passage into natural English while preserving voice, names and narrative meaning. Output only the translation."
                  : "You are a rigorous academic translator. Translate the selected passage into natural, precise English. Preserve terminology and output only the translation."
              : language === "zh-CN"
                ? isBookMode
                  ? "你是文章与小说阅读助手。用简体中文概括选中文段中的情节、人物行动、观点或关键信息，控制在80字以内。只输出一段纯文本，不使用 Markdown、标题或项目符号，不添加原文没有的信息。"
                  : "你是研究论文阅读助手。用简体中文提炼选中文段的核心论点、方法或结论，控制在80字以内。只输出一段纯文本，不使用 Markdown、星号、标题或项目符号，不重复原文，不添加原文没有的信息。"
                : isBookMode
                  ? "You are a books and fiction reading assistant. Summarize the selected passage's plot movement, character action, argument or key information in under 60 words. Output one plain-text paragraph only and invent nothing."
                  : "You are a research-paper reading assistant. Summarize the selected passage's core claim, method or conclusion in under 60 words. Output one plain-text paragraph only: no Markdown, headings, bullets, repetition or unsupported information.",
            snapshot.text,
          );
      updateDocumentNotes(activeDocument.id, (current) =>
        current.map((note) => (note.id === noteId ? { ...note, content, pending: false } : note)),
      );
      if ((kind === "translation" ? settings.translationDisplayMode : settings.summaryDisplayMode) === "side") {
        setSideTab("notes");
      }
      setToast(kind === "translation"
        ? tr("段落翻译已生成", "Passage translation created")
        : tr("段落总结已生成", "Passage summary created"));
    } catch (error) {
      updateDocumentNotes(activeDocument.id, (current) => current.filter((note) => note.id !== noteId));
      setToast(readableAIError(
        error,
        language,
        kind === "translation" ? tr("翻译失败", "Translation failed") : tr("AI 处理失败", "AI request failed"),
      ));
    } finally {
      setAiBusy(null);
    }
  };

  const summarySource = useMemo(
    () => createParagraphExcerpt(
      paragraphs.filter((paragraph) => paragraph.kind !== "heading").map((paragraph) => paragraph.text),
      42_000,
    ),
    [paragraphs],
  );

  const generateSummary = async () => {
    if (!themeDocuments.length || aiBusy || !ensureAIReady()) return;
    setAiBusy("summary");
    setSideTab("summary");
    try {
      const content = await requestAI(
        language === "zh-CN"
          ? isBookMode
            ? "你是专业的书籍阅读助手。请用简体中文输出全书概览：小说重点概括主题、主要人物、情节推进和叙事特色；非虚构作品重点概括主题、核心观点、结构和关键信息。使用短段落，总计不超过500字，不剧透正文之外的信息，不虚构内容。"
            : "你是研究生的论文阅读助手。请用简体中文输出一份严谨的论文总览，包含：研究问题、核心方法、主要发现、局限与可借鉴点。使用短段落，总计不超过500字，不虚构原文没有的信息。"
          : isBookMode
            ? "You are a professional book-reading assistant. Summarize fiction through themes, major characters, plot progression and narrative style; summarize nonfiction through its topic, core ideas, structure and key information. Use short paragraphs and invent nothing."
            : "You are a graduate research assistant. Produce a rigorous English overview covering the research question, core method, main findings, limitations and transferable ideas. Use short paragraphs and do not invent information.",
        `${isBookMode ? tr("书名", "Book title") : tr("论文标题", "Paper title")}：${activeDocument.title}\n\n${isBookMode ? tr("书籍正文", "Book text") : tr("论文正文", "Paper text")}：\n${summarySource}`,
      );
      setSummaries((current) => ({ ...current, [activeDocument.id]: content }));
    } catch (error) {
      setToast(readableAIError(error, language, tr("全文总结失败", "Full summary failed")));
    } finally {
      setAiBusy(null);
    }
  };

  const testAIConnection = async () => {
    if (!window.paperLoom) {
      setAIConnectionTest({
        status: "error",
        message: tr("仅桌面版支持接口检测。", "Connection testing is available in the desktop app only."),
      });
      return;
    }
    setAIConnectionTest({
      status: "testing",
      message: tr("正在检测 DNS、代理、接口和 API Key…", "Checking DNS, proxy, endpoint and API key…"),
    });
    try {
      const result = await window.paperLoom.testAI(settingsDraft);
      setAIConnectionTest({
        status: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch (error) {
      setAIConnectionTest({
        status: "error",
        message: readableAIError(error, language, tr("连接检测失败", "Connection test failed")),
      });
    }
  };

  const testTranslationConnection = async () => {
    if (!window.paperLoom) {
      setTranslationConnectionTest({
        status: "error",
        message: tr("仅桌面版支持翻译服务检测。", "Translation testing is available in the desktop app only."),
      });
      return;
    }
    setTranslationConnectionTest({
      status: "testing",
      message: tr("正在发送一小段测试文本…", "Sending a short test passage…"),
    });
    try {
      const result = await window.paperLoom.testTranslation(settingsDraft);
      setTranslationConnectionTest({
        status: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch (error) {
      setTranslationConnectionTest({
        status: "error",
        message: readableAIError(error, language, tr("翻译服务检测失败", "Translation service test failed")),
      });
    }
  };

  const updateWeeklyReadingGoal = async (goal: WeeklyReadingGoal) => {
    if (goal === settings.weeklyReadingGoal || weeklyGoalSaving) return;
    const previous = settings;
    const next = { ...settings, weeklyReadingGoal: goal };
    setWeeklyGoalSaving(true);
    setSettings(next);
    setSettingsDraft((current) => ({ ...current, weeklyReadingGoal: goal }));
    try {
      const saved = window.paperLoom
        ? await window.paperLoom.saveSettings(next)
        : next;
      setSettings(saved as AppSettings);
      setSettingsDraft((current) => ({
        ...current,
        weeklyReadingGoal: (saved as AppSettings).weeklyReadingGoal,
      }));
      setToast(goal === null
        ? tr("已改为无目标，仅记录阅读时长", "Goal removed; reading time will still be tracked")
        : tr(`每周阅读目标已改为 ${goal} 分钟`, `Weekly reading goal set to ${goal} minutes`));
    } catch (error) {
      setSettings(previous);
      setSettingsDraft((current) => ({
        ...current,
        weeklyReadingGoal: previous.weeklyReadingGoal,
      }));
      setToast(error instanceof Error ? error.message : tr("阅读目标保存失败", "Failed to save reading goal"));
    } finally {
      setWeeklyGoalSaving(false);
    }
  };

  const saveSettings = async () => {
    try {
      const saved = window.paperLoom
        ? await window.paperLoom.saveSettings(settingsDraft)
        : settingsDraft;
      setSettings(saved as AppSettings);
      setSettingsDraft(saved as AppSettings);
      setPageZoom((saved as AppSettings).defaultZoom);
      setSettingsOpen(false);
      setToast(settingsDraft.language === "zh-CN" ? "设置已保存" : "Settings saved");
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("设置保存失败", "Failed to save settings"));
    }
  };

  const checkApplicationUpdates = async () => {
    if (!window.paperLoom) return;
    try {
      setUpdateStatus(await window.paperLoom.checkForUpdates() as UpdateStatus);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("检查更新失败", "Failed to check for updates"));
    }
  };

  const downloadApplicationUpdate = async () => {
    if (!window.paperLoom) return;
    try {
      setUpdateStatus(await window.paperLoom.downloadUpdate() as UpdateStatus);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("下载更新失败", "Failed to download update"));
    }
  };

  const installApplicationUpdate = async () => {
    if (!window.paperLoom) return;
    try {
      setUpdateStatus(await window.paperLoom.installUpdate() as UpdateStatus);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("安装更新失败", "Failed to install update"));
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify({ version: 2, completed: true }));
    setOnboardingOpen(false);
  };

  const deleteDocument = (doc: ResearchDocument) => {
    const remaining = documents.filter((item) => item.id !== doc.id);
    const remainingOnShelf = remaining.filter((item) => (
      (item.shelf === "books" ? "books" : "academic") === readingTheme
    ));
    removeDocumentFolderAssignment(doc.id);
    if (readingPositionTimerRef.current !== null) {
      window.clearTimeout(readingPositionTimerRef.current);
      readingPositionTimerRef.current = null;
    }
    if (readingPositionsRef.current[doc.id]) {
      const nextPositions = { ...readingPositionsRef.current };
      delete nextPositions[doc.id];
      readingPositionsRef.current = nextPositions;
      writeReadingPositions(nextPositions);
    }
    if (lastActiveDocumentsRef.current[readingTheme] === doc.id) {
      lastActiveDocumentsRef.current = {
        ...lastActiveDocumentsRef.current,
        [readingTheme]: remainingOnShelf[0]?.id,
      };
      localStorage.setItem(
        STORAGE_KEYS.lastActiveDocuments,
        JSON.stringify(lastActiveDocumentsRef.current),
      );
    }
    setDocuments(remaining);
    if (window.paperLoom) void window.paperLoom.deleteGalleryDocument(doc.id).catch(() => undefined);
    if (window.paperLoom?.deleteResearchIndex) void window.paperLoom.deleteResearchIndex(doc.id).catch(() => undefined);
    setAnnotationBooks((current) => {
      const next = { ...current };
      delete next[doc.id];
      return next;
    });
    setSummaries((current) => {
      const next = { ...current };
      delete next[doc.id];
      return next;
    });
    if (activeId === doc.id) setActiveId(remainingOnShelf[0]?.id || EMPTY_DOCUMENT.id);
    if (doc.id === DEMO_DOC.id) {
      localStorage.setItem(STORAGE_KEYS.templateDismissed, JSON.stringify(true));
      completeOnboarding();
      setToast(tr("示例模板已删除，可在设置中重新打开新手引导", "Sample removed; you can reopen the guide from Settings"));
    } else {
      setToast(isBookMode
        ? tr("已从书库移除，本地原文件未删除", "Removed from the bookshelf; the original file was not deleted")
        : tr("已从文献库移除，本地原文件未删除", "Removed from the library; the original file was not deleted"));
    }
  };

  const startOnboarding = () => {
    void updateLayoutSettings({
      readingTheme: "academic",
      libraryPanelVisible: true,
      insightPanelMode: "standard",
    });
    localStorage.setItem(STORAGE_KEYS.templateDismissed, JSON.stringify(false));
    setDocuments((current) => [DEMO_DOC, ...current.filter((doc) => doc.id !== DEMO_DOC.id)]);
    setAnnotationBooks((current) => ({
      ...current,
      [DEMO_DOC.id]: current[DEMO_DOC.id] || {
        highlights: [{
          id: "demo-highlight",
          docId: DEMO_DOC.id,
          paragraphId: "demo-intro-2",
          quote: "claim-level organization improves review quality more than simply increasing retrieval depth",
          color: "yellow",
          createdAt: Date.now(),
        }],
        notes: [],
        captures: [],
      },
    }));
    setSummaries((current) => ({ [DEMO_DOC.id]: current[DEMO_DOC.id] || DEMO_SUMMARY, ...current }));
    setActiveId(DEMO_DOC.id);
    setWorkspaceView("reader");
    setCurrentPage(1);
    setSideTab("toc");
    setModeMenuOpen(false);
    setSettingsOpen(false);
    setOnboardingStep(0);
    setOnboardingOpen(true);
  };

  const keepTemplateAfterOnboarding = () => {
    localStorage.setItem(STORAGE_KEYS.templateDismissed, JSON.stringify(false));
    completeOnboarding();
    setToast(tr("新手引导已完成，示例论文将保留在文献库中", "Guide complete; the sample will remain in your library"));
  };

  const deleteTemplateAfterOnboarding = () => {
    const template = documents.find((doc) => doc.id === DEMO_DOC.id);
    if (template) deleteDocument(template);
    else completeOnboarding();
  };

  const copySummary = async () => {
    if (!themeDocuments.length) return;
    const summary = summaries[activeDocument.id];
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const exportNotes = async () => {
    if (!themeDocuments.length) return;
    const summary = summaries[activeDocument.id] || tr("尚未生成", "Not generated yet");
    const notes = activeHighlights
      .map((item) => `> ${item.quote}`)
      .join("\n\n");
    const inline = activeNotes
      .filter((note) => !note.pending)
      .map((note) => `### ${note.kind === "translation" ? tr("翻译", "Translation") : tr("段落总结", "Passage summary")}\n\n> ${note.quote}\n\n${note.content}`)
      .join("\n\n");
    const content = `# ${activeDocument.title}\n\n## ${tr("全文总结", "Full summary")}\n\n${summary}\n\n## ${tr("重点标记", "Highlights")}\n\n${notes || tr("暂无", "None")}\n\n## ${tr("AI 阅读卡片", "AI reading cards")}\n\n${inline || tr("暂无", "None")}\n`;
    if (window.paperLoom) {
      const saved = await window.paperLoom.exportMarkdown({
        suggestedName: `${cleanTitle(activeDocument.name)}-${tr("研究笔记", "research-notes")}.md`,
        content,
      });
      if (saved) setToast(tr("研究笔记已导出", "Research notes exported"));
    } else {
      await navigator.clipboard.writeText(content);
      setToast(tr("研究笔记已复制", "Research notes copied"));
    }
  };

  const removeHighlight = (id: string) => {
    updateDocumentHighlights(activeDocument.id, (current) => current.filter((item) => item.id !== id));
  };

  const removeInlineNote = (id: string) => {
    updateDocumentNotes(activeDocument.id, (current) => current.filter((item) => item.id !== id));
  };

  const resolveGalleryCaptureAnchor = (captureRect: ViewportCaptureRect) => {
    const isPdf = activeDocument.type === "pdf" && activeDocument.id !== DEMO_DOC.id;
    if (isPdf) {
      const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-page-number]"));
      const pageElement = pages
        .map((element) => ({ element, area: captureIntersectionArea(captureRect, element.getBoundingClientRect()) }))
        .sort((left, right) => right.area - left.area)[0];
      if (!pageElement || pageElement.area <= 0) return null;
      const surface = pageElement.element.querySelector<HTMLElement>(".pdf-page-surface");
      if (!surface) return null;
      const surfaceRect = surface.getBoundingClientRect();
      const originalHeight = Number(surface.dataset.pdfOriginalHeight) || surfaceRect.height;
      const insertions = readPdfInlineInsertions(surface);
      const visualTop = Math.min(surfaceRect.height, Math.max(0, captureRect.top - surfaceRect.top));
      const visualBottom = Math.min(surfaceRect.height, Math.max(visualTop, captureRect.top + captureRect.height - surfaceRect.top));
      const originalTop = restorePdfOriginalY(visualTop, insertions);
      const originalBottom = restorePdfOriginalY(visualBottom, insertions);
      const left = Math.min(1, Math.max(0, (captureRect.left - surfaceRect.left) / surfaceRect.width));
      const right = Math.min(1, Math.max(left, (captureRect.left + captureRect.width - surfaceRect.left) / surfaceRect.width));
      const page = Number(pageElement.element.dataset.pdfPageNumber);
      return {
        page: Number.isFinite(page) ? page : undefined,
        paragraphId: surface.dataset.paragraphId || (Number.isFinite(page) ? `pdf-page-${page}` : undefined),
        rects: [{
          x: left,
          y: Math.min(1, Math.max(0, originalTop / originalHeight)),
          width: Math.max(0.0001, right - left),
          height: Math.max(0.0001, (originalBottom - originalTop) / originalHeight),
        }],
      };
    }

    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>(".paper [data-paragraph-id]"));
    const paragraph = paragraphs
      .map((element) => ({ element, area: captureIntersectionArea(captureRect, element.getBoundingClientRect()) }))
      .sort((left, right) => right.area - left.area)[0];
    if (!paragraph || paragraph.area <= 0) return null;
    const paragraphRect = paragraph.element.getBoundingClientRect();
    const left = Math.min(1, Math.max(0, (captureRect.left - paragraphRect.left) / paragraphRect.width));
    const right = Math.min(1, Math.max(left, (captureRect.left + captureRect.width - paragraphRect.left) / paragraphRect.width));
    const top = Math.min(1, Math.max(0, (captureRect.top - paragraphRect.top) / paragraphRect.height));
    const bottom = Math.min(1, Math.max(top, (captureRect.top + captureRect.height - paragraphRect.top) / paragraphRect.height));
    const paragraphId = paragraph.element.dataset.paragraphId;
    const page = Number(paragraphId?.match(/^(?:pdf-page-|page-)(\d+)/)?.[1]);
    return {
      page: Number.isFinite(page) ? page : undefined,
      paragraphId,
      rects: [{
        x: left,
        y: top,
        width: Math.max(0.0001, right - left),
        height: Math.max(0.0001, bottom - top),
      }],
    };
  };

  const startGalleryCapture = () => {
    if (!themeDocuments.length || captureSaving) return;
    if (!window.paperLoom) {
      setToast(tr("截图功能需要在桌面版中使用", "Screenshots are available in the desktop app"));
      return;
    }
    if (captureMode) {
      setCaptureMode(false);
      setCaptureBounds(null);
      setCaptureDrag(null);
      setToast(tr("已取消截图", "Screenshot cancelled"));
      return;
    }
    const reader = document.querySelector<HTMLElement>(".reader-scroll");
    if (!reader) return;
    const rect = reader.getBoundingClientRect();
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setCaptureBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setCaptureDrag(null);
    setCaptureMode(true);
    setToast(tr("拖动框选需要保存到图库的区域，按 Esc 取消", "Drag over a region to save it; press Esc to cancel"));
  };

  const captureLocalPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!captureBounds) return { x: 0, y: 0 };
    return {
      x: Math.min(captureBounds.width, Math.max(0, event.clientX - captureBounds.left)),
      y: Math.min(captureBounds.height, Math.max(0, event.clientY - captureBounds.top)),
    };
  };

  const beginGalleryCaptureDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!captureBounds || event.button !== 0) return;
    const point = captureLocalPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCaptureDrag({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  };

  const moveGalleryCaptureDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!captureDrag) return;
    const point = captureLocalPoint(event);
    setCaptureDrag((current) => current ? { ...current, currentX: point.x, currentY: point.y } : current);
  };

  const finishGalleryCaptureDrag = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!captureBounds || !captureDrag || !window.paperLoom) return;
    const point = captureLocalPoint(event);
    const completedDrag = { ...captureDrag, currentX: point.x, currentY: point.y };
    const captureRect = captureDragRectangle(captureBounds, completedDrag);
    if (captureRect.width < 24 || captureRect.height < 24) {
      setCaptureDrag(null);
      setToast(tr("截图区域太小，请重新框选", "The screenshot area is too small; draw it again"));
      return;
    }
    const anchor = resolveGalleryCaptureAnchor(captureRect);
    if (!anchor) {
      setCaptureDrag(null);
      setToast(tr("请在文献页面内框选截图区域", "Draw the screenshot inside the paper"));
      return;
    }

    setCaptureMode(false);
    setCaptureBounds(null);
    setCaptureDrag(null);
    setCaptureSaving(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      await new Promise((resolve) => window.setTimeout(resolve, 35));
      const result = await window.paperLoom.captureGalleryRegion({
        documentId: activeDocument.id,
        rect: {
          x: captureRect.left,
          y: captureRect.top,
          width: captureRect.width,
          height: captureRect.height,
        },
      });
      const capture: GalleryCapture = {
        id: result.id,
        docId: activeDocument.id,
        paragraphId: anchor.paragraphId,
        page: anchor.page,
        rects: anchor.rects,
        createdAt: Date.now(),
        width: result.width,
        height: result.height,
      };
      updateDocumentCaptures(activeDocument.id, (current) => [capture, ...current]);
      setGalleryImages((current) => ({ ...current, [capture.id]: result.dataUrl }));
      setSideTab("gallery");
      if (settings.insightPanelMode === "hidden") void updateLayoutSettings({ insightPanelMode: "standard" });
      setToast(isBookMode
        ? tr("截图已保存到当前书籍的图库", "Screenshot saved to this book's gallery")
        : tr("截图已保存到当前文献的图库", "Screenshot saved to this paper's gallery"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("截图保存失败", "Failed to save screenshot"));
    } finally {
      setCaptureSaving(false);
    }
  };

  const removeGalleryCapture = (captureId: string) => {
    updateDocumentCaptures(activeDocument.id, (current) => current.filter((item) => item.id !== captureId));
    setGalleryImages((current) => {
      const next = { ...current };
      delete next[captureId];
      return next;
    });
    if (window.paperLoom) {
      void window.paperLoom.deleteGalleryCapture({
        documentId: activeDocument.id,
        captureId,
      }).catch(() => undefined);
    }
    setToast(tr("截图已从图库删除", "Screenshot removed from gallery"));
  };

  const jumpToSource = (target: SourceNavigationTarget) => {
    const pageFromParagraph = Number(
      target.paragraphId?.match(/^(?:pdf-page-|page-)(\d+)/)?.[1],
    );
    const page = target.page || (Number.isFinite(pageFromParagraph) ? pageFromParagraph : undefined);
    setWorkspaceView("reader");
    setSelection(null);
    if (target.paragraphId && activeDocument.type !== "pdf") {
      setRevealedParagraphId(target.paragraphId);
    }
    if (page) setCurrentPage(page);

    const locate = (attempt = 0) => {
      const reader = document.querySelector<HTMLElement>(".reader-scroll");
      if (!reader) return;
      const isPdf = activeDocument.type === "pdf" && activeDocument.id !== DEMO_DOC.id;
      let targetElement: HTMLElement | null = null;
      if (!isPdf && target.paragraphId) {
        targetElement = document.querySelector<HTMLElement>(
          `[data-paragraph-id="${CSS.escape(target.paragraphId)}"]`,
        );
      }
      if (!targetElement && page) {
        targetElement = document.querySelector<HTMLElement>(
          `[data-pdf-page-number="${page}"] .pdf-page-surface`,
        ) || document.querySelector<HTMLElement>(`[data-pdf-page-number="${page}"]`);
      }
      if (!targetElement && target.paragraphId) {
        targetElement = document.querySelector<HTMLElement>(
          `[data-paragraph-id="${CSS.escape(target.paragraphId)}"]`,
        );
      }
      if (!targetElement) {
        if (attempt < 8) window.setTimeout(() => locate(attempt + 1), 110 + attempt * 70);
        return;
      }

      const readerRect = reader.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      let offsetY = 0;
      if (isPdf) {
        const originalHeight = Number(targetElement.dataset.pdfOriginalHeight) || targetRect.height;
        const insertionCoordinates = readPdfInlineInsertions(targetElement);
        const firstRect = normalizeRelativeRects(target.rects)[0];
        if (firstRect) {
          offsetY = applyPdfInlineInsertions(firstRect.y * originalHeight, insertionCoordinates);
        } else if (target.quote) {
          const span = findPdfSourceSpan(targetElement, target.quote);
          if (span) offsetY = span.getBoundingClientRect().top - targetRect.top;
          else if (attempt < 8) window.setTimeout(() => locate(attempt + 1), 130 + attempt * 70);
        }
      } else if (target.rects?.[0]) {
        offsetY = target.rects[0].y * targetRect.height;
      }

      const alignTarget = (behavior: ScrollBehavior = "auto") => {
        const liveReader = document.querySelector<HTMLElement>(".reader-scroll");
        const liveTarget = targetElement?.isConnected ? targetElement : (
          target.paragraphId
            ? document.querySelector<HTMLElement>(
              `[data-paragraph-id="${CSS.escape(target.paragraphId)}"]`,
            )
            : null
        );
        if (!liveReader || !liveTarget) return;
        const liveReaderRect = liveReader.getBoundingClientRect();
        const liveTargetRect = liveTarget.getBoundingClientRect();
        const desiredTop = Math.max(
          0,
          liveReader.scrollTop + liveTargetRect.top - liveReaderRect.top + offsetY - 130,
        );
        if (Math.abs(liveReader.scrollTop - desiredTop) > 2) {
          liveReader.scrollTo({ top: desiredTop, behavior });
        }
      };

      alignTarget(isPdf ? "smooth" : "auto");
      if (!isPdf) {
        // A distant virtual chunk is first mounted with estimated heights around it.
        // Re-align after nearby chunks have measured themselves so TOC/note jumps stay exact.
        [60, 180, 420, 900].forEach((delay) => {
          window.setTimeout(() => alignTarget("auto"), delay);
        });
      }
      targetElement.classList.remove("source-jump-pulse");
      window.requestAnimationFrame(() => targetElement?.classList.add("source-jump-pulse"));
      window.setTimeout(() => targetElement?.classList.remove("source-jump-pulse"), 1500);
      setToast(tr("已定位到原文", "Jumped to source"));
    };

    window.setTimeout(() => locate(), workspaceView !== "reader" ? 90 : 0);
  };

  const openResearchSource = (target: SourceNavigationTarget) => {
    const documentId = target.docId || activeDocument.id;
    const sourceDocument = documents.find((item) => item.id === documentId);
    if (!sourceDocument) {
      setToast(tr("来源文献已不在文献库中", "The source paper is no longer in the library"));
      return;
    }
    if (sourceDocument.id === activeDocument.id) {
      jumpToSource(target);
      return;
    }
    setPendingResearchSource({ ...target, docId: sourceDocument.id });
    void selectDocument(sourceDocument);
  };

  useEffect(() => {
    if (!pendingResearchSource?.docId || pendingResearchSource.docId !== activeDocument.id || workspaceView !== "reader") return;
    const target = pendingResearchSource;
    const timer = window.setTimeout(() => {
      jumpToSource(target);
      setPendingResearchSource(null);
    }, loadingDocument === activeDocument.id ? 420 : 140);
    return () => window.clearTimeout(timer);
  }, [activeDocument.id, loadingDocument, pendingResearchSource, workspaceView]);

  const goToPdfPage = (page: number) => {
    const total = activeDocument.pageCount || 1;
    const next = Math.min(total, Math.max(1, Math.round(page)));
    const pageElement = document.querySelector<HTMLElement>(`[data-pdf-page-number="${next}"]`);
    const scrollElement = pageElement?.closest<HTMLElement>(".reader-scroll");
    if (pageElement && scrollElement) {
      scrollElement.scrollTop = Math.max(0, pageElement.offsetTop - 18);
    }
    setCurrentPage(next);
    if (!restoringPositionRef.current) persistReadingPosition(next);
  };

  useEffect(() => {
    const disposeOpen = window.paperLoom?.onMenuOpenDocuments(() => importDocuments());
    const disposeExport = window.paperLoom?.onMenuExportNotes(() => exportNotes());
    return () => {
      disposeOpen?.();
      disposeExport?.();
    };
  }, [activeDocument.id, activeHighlights, activeNotes, summaries, language, readingTheme]);

  return (
    <div
      className={`app-shell ${isBookMode ? "book-reading-mode" : "academic-reading-mode"} ${!settings.libraryPanelVisible ? "library-collapsed" : ""} ${settings.insightPanelMode === "hidden" ? "insight-collapsed" : ""} ${workspaceView !== "reader" ? "library-overview-mode" : ""} ${workspaceView === "creation" ? "creation-workspace-mode" : ""}`}
      style={appShellStyle}
      onMouseDown={(event) => {
      if (!(event.target as Element).closest(".selection-tools")) setSelection(null);
      if (!(event.target as Element).closest(".reading-mode-switcher")) setModeMenuOpen(false);
    }}
    >
      {!settings.libraryPanelVisible && (
        <button
          type="button"
          className="panel-restore library-restore"
          onClick={() => void updateLayoutSettings({ libraryPanelVisible: true })}
          aria-label={isBookMode ? tr("展开书库", "Show bookshelf") : tr("展开文献库", "Show library")}
          title={isBookMode ? tr("展开书库", "Show bookshelf") : tr("展开文献库", "Show library")}
        >
          <ChevronRight size={15} /><span>{isBookMode ? tr("书库", "Bookshelf") : tr("文献库", "Library")}</span>
        </button>
      )}
      {workspaceView === "reader" && settings.insightPanelMode === "hidden" && (
        <button
          type="button"
          className="panel-restore insight-restore"
          onClick={() => void updateLayoutSettings({ insightPanelMode: "standard" })}
          aria-label={tr("展开 AI 阅读助手", "Show AI reading assistant")}
          title={tr("展开 AI 阅读助手", "Show AI reading assistant")}
        >
          <ChevronLeft size={15} /><span>{tr("AI 助手", "AI assistant")}</span>
        </button>
      )}

      <aside className="library-panel" aria-hidden={!settings.libraryPanelVisible} data-tour="library-panel">
        <div className="brand-row">
          <div className="brand-mark"><span>PL</span></div>
          <div className="brand-copy">
            <div className="brand-name">PaperLoom</div>
            <div className="brand-subtitle">{isBookMode
              ? tr("文章小说阅读工作台", "Books and fiction workspace")
              : tr("研究阅读工作台", "Research reading workspace")}</div>
          </div>
          <button
            type="button"
            className="panel-collapse"
            onClick={() => void updateLayoutSettings({ libraryPanelVisible: false })}
            aria-label={isBookMode ? tr("收起书库", "Hide bookshelf") : tr("收起文献库", "Hide library")}
            title={isBookMode ? tr("收起书库", "Hide bookshelf") : tr("收起文献库", "Hide library")}
          >
            <ChevronLeft size={15} />
          </button>
        </div>

        <button className="import-button" onClick={importDocuments} data-tour="import-button">
          <FileUp size={17} />
          {isBookMode ? tr("导入书籍 / 文章", "Import books / articles") : tr("导入 PDF / Word", "Import PDF / Word")}
          <span className="shortcut">⌘ O</span>
        </button>
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept={isBookMode ? ".epub,.txt,.md,.markdown,.html,.htm,.fb2,.pdf,.docx" : ".pdf,.docx"}
          multiple
          onChange={(event) => importBrowserFiles(event.target.files)}
        />

        <button
          type="button"
          className={`library-overview-launch ${workspaceView === "library" ? "active" : ""}`}
          onClick={showLibraryOverview}
          data-tour="library-overview"
        >
          <LayoutGrid size={16} />
          <span><strong>{isBookMode ? tr("书库总览", "Bookshelf overview") : tr("文献总览", "Library overview")}</strong><small>{isBookMode ? tr("书架与全部书籍", "Shelves and all books") : tr("文件夹与全部论文", "Folders and all papers")}</small></span>
          <ChevronRight size={14} />
        </button>

        <button
          type="button"
          className={`academic-search-launch ${workspaceView === "discovery" ? "active" : ""}`}
          onClick={showAcademicSearch}
          data-tour="academic-discovery"
        >
          <BookOpen size={16} />
          <span><strong>{isBookMode ? tr("书籍搜索", "Book discovery") : tr("学术发现", "Academic discovery")}</strong><small>{isBookMode ? tr("在软件内检索与筛选书籍", "Search and compare books in the app") : tr("在软件内检索与筛选文献", "Search and filter papers in the app")}</small></span>
          <ChevronRight size={13} />
        </button>

        {!isBookMode && (
          <button
            type="button"
            className={`research-workspace-launch ${workspaceView === "research" ? "active" : ""}`}
            onClick={showResearchWorkspace}
            data-tour="research-workspace"
          >
            <Network size={16} />
            <span>
              <strong>{tr("研究工作台", "Research workbench")}</strong>
              <small>{tr("证据、对比、引用与全库检索", "Evidence, comparison, citations and search")}</small>
            </span>
            <ChevronRight size={13} />
          </button>
        )}

        {isBookMode && (
          <button
            type="button"
            className={`creation-workspace-launch ${workspaceView === "creation" ? "active" : ""}`}
            onClick={showCreationWorkspace}
          >
            <Sparkles size={16} />
            <span>
              <strong>{tr("AI 创作", "AI writing")}</strong>
              <small>{tr("对话创作、选段重写与书稿输出", "Chat, rewrite selections and build a manuscript")}</small>
            </span>
            <ChevronRight size={13} />
          </button>
        )}

        {!isBookMode && (
          <button
            type="button"
            className={`tools-workspace-launch ${workspaceView === "tools" ? "active" : ""}`}
            onClick={showToolsWorkspace}
            data-tour="tools-workspace"
          >
              <Wrench size={16} />
              <span>
                <strong>{tr("实用工具", "Utilities")}</strong>
                <small>{tr("研究辅助工具扩展区", "Research utility extension area")}</small>
              </span>
            <ChevronRight size={13} />
          </button>
        )}

        <div className="library-search" data-tour="library-search">
          <Search size={15} />
          <input
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
            placeholder={isBookMode ? tr("搜索书库", "Search bookshelf") : tr("搜索文献库", "Search library")}
            aria-label={isBookMode ? tr("搜索书库", "Search bookshelf") : tr("搜索文献库", "Search library")}
          />
        </div>

        <div className="section-label">
          <span>{isBookMode ? tr("我的书籍", "My books") : tr("我的文献", "My papers")}</span>
          <span>{themeDocuments.length}</span>
        </div>
        <div className="document-list" data-tour="document-list">
          {filteredDocuments.map((doc) => (
            <button
              key={doc.id}
              className={`document-item ${workspaceView === "reader" && doc.id === activeDocument?.id ? "active" : ""}`}
              onClick={() => selectDocument(doc)}
            >
              <span className={`file-badge ${doc.type}`}>{fileTypeLabel(doc.type)}</span>
              <span className="document-item-copy">
                <strong>{doc.title}</strong>
                <small>
                  {doc.pageCount ? `${doc.pageCount} ${tr("页", "pages")}` : formatBytes(doc.size)}
                  <span>·</span>
                  {doc.id === DEMO_DOC.id
                    ? tr("示例", "Sample")
                    : <time dateTime={doc.lastReadAt ? new Date(doc.lastReadAt).toISOString() : undefined}>{formatLastReadAt(doc.lastReadAt, language)}</time>}
                </small>
              </span>
              <span
                className="remove-doc"
                role="button"
                tabIndex={0}
                title={doc.id === DEMO_DOC.id ? tr("删除示例模板", "Remove sample template") : isBookMode ? tr("从书库移除", "Remove from bookshelf") : tr("从文献库移除", "Remove from library")}
                aria-label={doc.id === DEMO_DOC.id ? tr("删除示例模板", "Remove sample template") : isBookMode ? tr("从书库移除", "Remove from bookshelf") : tr("从文献库移除", "Remove from library")}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteDocument(doc);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  deleteDocument(doc);
                }}
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>

        <div className="library-spacer" />
        <div className={`reading-mode-switcher ${modeMenuOpen ? "open" : ""}`} data-tour="reading-theme">
          {modeMenuOpen && (
            <div className="reading-mode-menu" role="menu" aria-label={tr("选择阅读主题", "Choose reading theme")}>
              <div className="reading-mode-menu-head">
                <span className="eyebrow">READING THEME</span>
                <strong>{tr("切换阅读空间", "Switch reading space")}</strong>
              </div>
              <button className={!isBookMode ? "active" : ""} onClick={() => void switchReadingTheme("academic")} role="menuitem">
                <span className="reading-mode-icon"><Library size={17} /></span>
                <span><strong>{tr("论文阅读", "Research papers")}</strong><small>{tr("文献库、学术发现与论文工具", "Library, discovery and research tools")}</small></span>
                {!isBookMode && <Check size={14} />}
              </button>
              <button className={isBookMode ? "active" : ""} onClick={() => void switchReadingTheme("books")} role="menuitem">
                <span className="reading-mode-icon"><BookOpen size={17} /></span>
                <span><strong>{tr("文章小说阅读", "Books and fiction")}</strong><small>{tr("书库、书籍搜索与沉浸阅读", "Bookshelf, book search and immersive reading")}</small></span>
                {isBookMode && <Check size={14} />}
              </button>
            </div>
          )}
          <button
            type="button"
            className="reading-mode-trigger"
            onClick={() => setModeMenuOpen((current) => !current)}
            aria-expanded={modeMenuOpen}
          >
            {isBookMode ? <BookOpen size={17} /> : <Library size={17} />}
            <span><small>{tr("阅读主题", "Reading theme")}</small><strong>{isBookMode ? tr("文章小说阅读", "Books and fiction") : tr("论文阅读", "Research papers")}</strong></span>
            <ChevronDown size={15} />
          </button>
        </div>
        <button
          type="button"
          className="reading-stat"
          onClick={() => setReadingDetailsOpen(true)}
          data-tour="weekly-reading"
          title={settings.weeklyReadingGoal === null
            ? tr("查看本周阅读详情并调整目标", "View weekly details and adjust the goal")
            : tr(`查看本周详情 · 目标 ${settings.weeklyReadingGoal} 分钟`, `View weekly details · ${settings.weeklyReadingGoal}-minute goal`)}
          aria-label={tr("打开本周阅读详情", "Open weekly reading details")}
        >
          <div
            className={`stat-ring ${settings.weeklyReadingGoal === null ? "no-goal" : ""}`}
            style={{ "--weekly-progress": `${weeklyReading.percent}%` } as React.CSSProperties}
          ><span>{settings.weeklyReadingGoal === null ? "—" : `${weeklyReading.percent}%`}</span></div>
          <div className="reading-stat-copy">
            <strong>{tr("本周阅读", "This week")}</strong>
            <span>{language === "zh-CN"
              ? `${weeklyReading.papers} ${isBookMode ? "本" : "篇"} · ${weeklyReading.minutes > 0 ? `${weeklyReading.minutes} 分钟` : weeklyReading.hasActivity ? "少于 1 分钟" : "0 分钟"}`
              : `${weeklyReading.papers} ${isBookMode ? "books" : "papers"} · ${weeklyReading.minutes > 0 ? `${weeklyReading.minutes} min` : weeklyReading.hasActivity ? "<1 min" : "0 min"}`}</span>
            <small>{settings.weeklyReadingGoal === null
              ? tr("无目标 · 仅记录时长", "No goal · tracking only")
              : tr(`目标 ${settings.weeklyReadingGoal} 分钟`, `${settings.weeklyReadingGoal}-min goal`)}</small>
          </div>
          <ChevronRight className="reading-stat-chevron" size={15} />
        </button>
        <button className="settings-row" onClick={() => openSettings("general")} data-tour="settings">
          <Settings size={17} />
          {tr("应用设置", "Application settings")}
          <ChevronRight size={15} />
        </button>
      </aside>

      <main className="reader-panel">
        <header className="reader-toolbar" data-tour="reader-toolbar">
          {workspaceView !== "reader" ? (
            <div className="document-crumb library-crumb">
              {workspaceView === "research"
                ? <Network size={16} />
                : workspaceView === "tools"
                ? <Wrench size={16} />
                : workspaceView === "creation"
                ? <Sparkles size={16} />
                : workspaceView === "discovery"
                  ? <BookOpen size={16} />
                  : <LayoutGrid size={16} />}
              <span>{workspaceView === "research"
                ? tr("研究工作台", "Research workbench")
                : workspaceView === "tools"
                ? tr("实用工具", "Utilities")
                : workspaceView === "creation"
                ? tr("AI 创作", "AI writing")
                : workspaceView === "discovery"
                ? isBookMode ? tr("书籍搜索", "Book discovery") : tr("学术发现", "Discovery")
                : isBookMode ? tr("书库", "Bookshelf") : tr("文献库", "Library")}</span>
              <ChevronRight size={13} />
              <strong>{workspaceView === "research"
                ? tr("证据与综合", "Evidence and synthesis")
                : workspaceView === "tools"
                ? tr("工具箱", "Toolbox")
                : workspaceView === "creation"
                ? tr("创作工作台", "Writing studio")
                : workspaceView === "discovery"
                ? isBookMode ? tr("外部书籍检索", "External book search") : tr("外部文献检索", "External literature search")
                : tr("总览", "Overview")}</strong>
            </div>
          ) : (
            <>
              <div className="document-crumb">
                <Library size={16} />
                <span>{isBookMode ? tr("书库", "Bookshelf") : tr("文献库", "Library")}</span>
                <ChevronRight size={13} />
                <strong>{themeDocuments.length ? activeDocument.name : isBookMode ? tr("尚未选择书籍", "No book selected") : tr("尚未选择文献", "No paper selected")}</strong>
              </div>
              <div className="toolbar-actions">
            <div className="document-search" data-tour="document-search">
              <Search size={15} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={isBookMode ? tr("在书中查找", "Find in book") : tr("在文中查找", "Find in paper")}
                aria-label={isBookMode ? tr("在书中查找", "Find in book") : tr("在文中查找", "Find in paper")}
              />
              {searchTerm && <span>{matchCount}</span>}
            </div>
            {activeDocument.type !== "pdf" && (
              <div
                className="zoom-control zoom-control-labeled text-zoom-control"
                title={tr("文字缩放：只调整正文和批注字号", "Text zoom: changes body and annotation text size")}
              >
                <span className="zoom-kind">{tr("字", "T")}</span>
                <button
                  onClick={() => setTextZoom((value) => Math.max(80, value - 10))}
                  aria-label={tr("缩小文字", "Decrease text size")}
                  disabled={textZoom <= 80}
                >
                  <ZoomOut size={14} />
                </button>
                <span className="zoom-value">{textZoom}%</span>
                <button
                  onClick={() => setTextZoom((value) => Math.min(140, value + 10))}
                  aria-label={tr("放大文字", "Increase text size")}
                  disabled={textZoom >= 140}
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}
            <div
              className="zoom-control zoom-control-labeled page-zoom-control"
              data-tour="page-zoom"
              title={activeDocument.type === "pdf"
                ? tr("PDF 页面缩放", "PDF page zoom")
                : tr("页面缩放：整体放大或缩小纸张", "Page zoom: scales the whole page")}
            >
              <span className="zoom-kind">{tr("页", "P")}</span>
              <button
                onClick={() => setPageZoom((value) => Math.max(80, value - 10))}
                aria-label={tr("缩小页面", "Zoom page out")}
                disabled={pageZoom <= 80}
              >
                <ZoomOut size={14} />
              </button>
              <span className="zoom-value">{pageZoom}%</span>
              <button
                onClick={() => setPageZoom((value) => Math.min(140, value + 10))}
                aria-label={tr("放大页面", "Zoom page in")}
                disabled={pageZoom >= 140}
              >
                <ZoomIn size={14} />
              </button>
            </div>
            {themeDocuments.length > 0 && activeDocument.type === "pdf" && activeDocument.id !== DEMO_DOC.id && (
              <div className="page-position" title={language === "zh-CN" ? "跳转页码" : "Jump to page"}>
                <button onClick={() => goToPdfPage(currentPage - 1)} disabled={currentPage <= 1} aria-label={tr("上一页", "Previous page")}><ChevronLeft size={13} /></button>
                <input
                  key={currentPage}
                  type="number"
                  min="1"
                  max={activeDocument.pageCount || 1}
                  defaultValue={currentPage}
                  aria-label={tr("页码", "Page number")}
                  onBlur={(event) => goToPdfPage(Number(event.currentTarget.value) || currentPage)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") goToPdfPage(Number(event.currentTarget.value) || currentPage);
                  }}
                />
                <span>/ {activeDocument.pageCount || "—"}</span>
                <button onClick={() => goToPdfPage(currentPage + 1)} disabled={currentPage >= (activeDocument.pageCount || 1)} aria-label={tr("下一页", "Next page")}><ChevronRight size={13} /></button>
              </div>
            )}
                <button
                  className={`icon-button capture-tool-button ${captureMode ? "active" : ""}`}
                  onClick={startGalleryCapture}
                  data-tour="capture-button"
                  disabled={!themeDocuments.length || captureSaving}
                  aria-label={captureMode ? tr("取消截图", "Cancel screenshot") : tr("截图到图库", "Capture to gallery")}
                  title={captureMode
                    ? tr("取消截图（Esc）", "Cancel screenshot (Esc)")
                    : isBookMode ? tr("拖动框选书籍区域并保存到图库", "Draw over a book region and save it to the gallery") : tr("拖动框选文献区域并保存到图库", "Draw over a paper region and save it to the gallery")}
                >
                  {captureSaving ? <LoaderCircle size={17} className="spin" /> : <Camera size={17} />}
                </button>
                <button className="icon-button" aria-label={tr("更多", "More")}><MoreHorizontal size={18} /></button>
              </div>
            </>
          )}
        </header>

        <div
          ref={readerScrollRef}
          className={`reader-scroll ${workspaceView !== "reader" ? "library-overview-scroll" : ""}`}
          onScroll={queueReadingPositionSave}
          data-tour="reader-content"
        >
          {workspaceView === "tools" && !isBookMode ? (
            <UtilitiesWorkspace language={language} />
          ) : workspaceView === "research" ? (
            <ResearchWorkspace
              language={language}
              documents={documents.filter((doc) => (doc.shelf === "books" ? "books" : "academic") === "academic")}
              state={researchState}
              onChange={setResearchState}
              onOpenSource={openResearchSource}
              ensureAIReady={ensureAIReady}
              requestAI={requestAI}
              notify={setToast}
              initialTab={researchStartTab}
              initialCitationDocumentId={activeDocument.id}
              corpusLoading={researchCorpusLoading}
              onOpenGuide={startOnboarding}
            />
          ) : workspaceView === "creation" ? (
            <CreationWorkspace
              language={language}
              ensureAIReady={ensureAIReady}
              requestAI={async (system, user) => {
                try {
                  return await requestAI(system, user);
                } catch (error) {
                  throw new Error(readableAIError(error, language, tr("AI 创作失败", "AI writing failed")));
                }
              }}
              notify={setToast}
            />
          ) : workspaceView === "discovery" ? (
            isBookMode ? <BookDiscovery language={language} /> : <AcademicDiscovery language={language} />
          ) : workspaceView === "library" ? (
            <LibraryOverview
              language={language}
              readingTheme={readingTheme}
              documents={themeDocuments}
              folders={themeFolders}
              selectedFolderId={selectedLibraryFolder}
              movingDocumentId={movingDocumentId}
              searchTerm={librarySearch}
              onSearchChange={setLibrarySearch}
              onSelectFolder={setSelectedLibraryFolder}
              onCreateFolder={createLibraryFolder}
              onRenameFolder={renameLibraryFolder}
              onMoveDocument={moveDocumentToFolder}
              onOpenDocument={(doc) => void selectDocument(doc)}
              onImport={() => void importDocuments()}
            />
          ) : !themeDocuments.length ? (
            <div className="empty-library-state">
              <div className="empty-library-icon">{isBookMode ? <BookOpen size={30} /> : <Library size={30} />}</div>
              <strong>{isBookMode ? tr("书库还是空的", "Your bookshelf is empty") : tr("文献库还是空的", "Your library is empty")}</strong>
              <span>{isBookMode
                ? tr("导入 EPUB、TXT、Markdown、HTML、FB2、PDF 或 Word 书籍，开始阅读、翻译和整理。", "Import an EPUB, TXT, Markdown, HTML, FB2, PDF or Word book to start reading and organizing.")
                : tr("导入第一篇 PDF 或 Word 论文，开始阅读、翻译和整理。", "Import your first PDF or Word paper to start reading, translating and organizing.")}</span>
              <button onClick={importDocuments}><FileUp size={15} />{isBookMode ? tr("导入书籍", "Import a book") : tr("导入论文", "Import a paper")}</button>
              {!isBookMode && <button className="text-action" onClick={startOnboarding}>{tr("重新查看示例与新手引导", "Restore the sample and view the guide")}</button>}
            </div>
          ) : loadingDocument === activeDocument.id ? (
            <div className="document-loading">
              <LoaderCircle size={28} className="spin" />
              <strong>{isBookMode ? tr("正在解析书籍", "Parsing book") : tr("正在解析论文", "Parsing paper")}</strong>
              <span>{isBookMode ? tr("提取章节、目录和可选择文本…", "Extracting chapters, contents and selectable text…") : tr("提取段落、页码和可选择文本…", "Extracting passages, page numbers and selectable text…")}</span>
            </div>
          ) : activeDocument?.type === "pdf" && activeDocument.id !== DEMO_DOC.id ? (
            <PdfDocumentView
              document={activeDocument}
              zoom={pageZoom}
              pageSpacing={settings.pageSpacing}
              translationDisplayMode={settings.translationDisplayMode}
              summaryDisplayMode={settings.summaryDisplayMode}
              translationFontSize={settings.translationFontSize}
              language={language}
              highlights={activeHighlights}
              notes={activeNotes}
              searchTerm={deferredSearchTerm}
              onMouseUp={captureSelection}
              onPageChange={handlePdfPageChange}
              onRemoveNote={removeInlineNote}
            />
          ) : (
            <article
              className="paper"
              style={{
                "--text-scale": activeDocument.type === "pdf" ? 1 : textZoom / 100,
                "--page-scale": pageZoom / 100,
              } as React.CSSProperties}
              onMouseUp={captureSelection}
            >
              <div className="paper-topline">
                <span className={`document-type ${activeDocument?.type}`}>{fileTypeLabel(activeDocument.type)}</span>
                <span>{activeDocument?.pageCount ? `${activeDocument.pageCount} PAGES` : formatBytes(activeDocument?.size || 0)}</span>
                <span>READING MODE</span>
              </div>
              <h1>{activeDocument?.title}</h1>
              <div className="paper-byline">
                <span>{activeDocument?.authors || (isBookMode ? tr("本地书籍", "Local book") : tr("本地文档", "Local document"))}</span>
                <i />
                <span>{activeDocument?.venue || new Date(activeDocument?.modifiedAt || Date.now()).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="paper-divider"><span>◆</span></div>

              <div className="paper-content">
                <VirtualParagraphList
                  documentId={activeDocument.id}
                  paragraphs={paragraphs}
                  revealParagraphId={revealedParagraphId}
                  textScale={textZoom / 100}
                  renderParagraph={(paragraph) => {
                    const paragraphHighlights = activeHighlightsByParagraph.get(paragraph.id) || [];
                    const paragraphNotes = activeNotesByParagraph.get(paragraph.id) || [];
                    if (paragraph.kind === "heading") {
                      return (
                        <h2
                          key={paragraph.id}
                          className={isBookMode && isBookChapterHeading(paragraph.text) ? "book-chapter-heading" : undefined}
                          data-paragraph-id={paragraph.id}
                        >
                          {paragraph.text}
                        </h2>
                      );
                    }
                    return (
                      <div className="paragraph-block" key={paragraph.id}>
                        <p data-paragraph-id={paragraph.id}>
                          {highlightText(
                            paragraph.text,
                            paragraphHighlights,
                            deferredSearchTerm,
                            [
                              ...(paragraph.links || []),
                              ...buildInTextReferenceLinks(paragraph.text, activeReferences),
                            ],
                            (targetParagraphId) => jumpToSource({ paragraphId: targetParagraphId }),
                          )}
                          <SummarySourceOutlineLayer notes={paragraphNotes} />
                        </p>
                        {paragraphNotes.map((note) => (
                          <div className={`inline-note ${note.kind}`} key={note.id}>
                            <div className="inline-note-rail" />
                            <div className="inline-note-body">
                              <div className="inline-note-head">
                                <span>
                                  {note.kind === "translation" ? <Languages size={14} /> : <Sparkles size={14} />}
                                  {note.kind === "translation" ? tr("段落翻译", "Translation") : tr("段落总结", "Passage summary")}
                                </span>
                                <button
                                  aria-label={tr("删除卡片", "Remove card")}
                                  onClick={() => removeInlineNote(note.id)}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className={note.pending ? "note-pending" : ""}>
                                {note.pending && <LoaderCircle size={14} className="spin" />}
                                {!note.pending && <MarkdownContent content={note.content} compact />}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {!paragraphs.length && (
                  <div className="empty-paper">
                    <FileText size={28} />
                    <strong>{tr("文档尚未载入", "Document not loaded")}</strong>
                    <span>{isBookMode ? tr("请从左侧重新打开这本本地书籍。", "Reopen this local book from the bookshelf.") : tr("请从左侧重新打开这篇本地论文。", "Reopen this local paper from the library.")}</span>
                  </div>
                )}
              </div>
            </article>
          )}
          {workspaceView === "reader" && themeDocuments.length > 0 && <div className="page-end">— {isBookMode ? tr("本书末尾", "End of book") : tr("文档末尾", "End of document")} —</div>}
        </div>
      </main>

      <aside
        className={`insight-panel ${insightPanelWidth >= 560 ? "insight-wide" : ""}`}
        aria-hidden={settings.insightPanelMode === "hidden" || workspaceView !== "reader"}
        data-tour="insight-panel"
      >
        {settings.insightPanelMode === "custom" && (
          <button
            type="button"
            className="insight-resize-handle"
            onPointerDown={beginInsightResize}
            aria-label={tr("拖动调整 AI 助手宽度", "Drag to resize AI assistant")}
            title={tr("拖动调整宽度", "Drag to resize")}
          />
        )}
        <div className="insight-header">
          <div>
            <span className="eyebrow">{isBookMode ? "BOOK INTELLIGENCE" : "PAPER INTELLIGENCE"}</span>
            <strong><Sparkles size={17} /> {tr("AI 阅读助手", "AI reading assistant")}</strong>
          </div>
          <div className="insight-header-actions">
            <button
              className="icon-button"
              onClick={() => void updateLayoutSettings({ insightPanelMode: "hidden" })}
              aria-label={tr("收起 AI 阅读助手", "Hide AI reading assistant")}
              title={tr("收起 AI 阅读助手", "Hide AI reading assistant")}
            >
              <ChevronRight size={17} />
            </button>
            <button className="icon-button" onClick={() => openSettings("reading")} aria-label={tr("阅读布局设置", "Reading layout settings")}>
              <Settings size={17} />
            </button>
          </div>
        </div>
        <div className="tab-row" data-tour="insight-tabs">
          <button className={sideTab === "toc" ? "active" : ""} onClick={() => setSideTab("toc")} disabled={!themeDocuments.length}>
            <List size={15} />{tr("目录", "Contents")}
          </button>
          <button className={sideTab === "summary" ? "active" : ""} onClick={() => setSideTab("summary")} disabled={!themeDocuments.length}>
            <Brain size={15} />{tr("总结", "Summary")}
          </button>
          <button className={sideTab === "notes" ? "active" : ""} onClick={() => setSideTab("notes")} disabled={!themeDocuments.length}>
            <NotebookPen size={15} />{tr("笔记", "Notes")}
            {activeHighlights.length > 0 && <em>{activeHighlights.length}</em>}
          </button>
          <button className={sideTab === "gallery" ? "active" : ""} onClick={() => setSideTab("gallery")} disabled={!themeDocuments.length}>
            <Images size={15} />{tr("图库", "Gallery")}
            {activeCaptures.length > 0 && <em>{activeCaptures.length}</em>}
          </button>
        </div>

        <div className="insight-scroll">
          {!themeDocuments.length ? (
            <section className="empty-insight-state">
              <Sparkles size={26} />
              <strong>{isBookMode ? tr("导入书籍后即可使用 AI 阅读助手", "Import a book to use the AI reading assistant") : tr("导入论文后即可使用 AI 阅读助手", "Import a paper to use the AI reading assistant")}</strong>
              <span>{isBookMode ? tr("支持书籍目录、全书概览、选段翻译和阅读笔记。", "Use book contents, full-book overviews, passage translations and reading notes.") : tr("支持论文目录、全文总结、选段翻译和重点笔记。", "Use a clickable table of contents, full summaries, passage translations and highlights.")}</span>
            </section>
          ) : (
            <>
          {sideTab === "toc" && (
            <section className="toc-card">
              <div className="toc-heading">
                <div>
                  <span className="eyebrow">DOCUMENT OUTLINE</span>
                  <strong>{isBookMode ? tr("书籍目录", "Book contents") : tr("论文目录", "Table of contents")}</strong>
                </div>
                <span className={`toc-source-badge ${activeDocument.tableOfContentsSource === "embedded" ? "embedded" : "detected"}`}>
                  {activeDocument.tableOfContentsSource === "embedded"
                    ? activeDocument.type === "epub" ? tr("EPUB 原始目录", "EPUB contents") : tr("PDF 原始目录", "PDF outline")
                    : tr("自动识别标题", "Detected headings")}
                </span>
              </div>
              {activeTableOfContents.length ? (
                <>
                  <div className="toc-meta">
                    <span>{activeTableOfContentsCount} {tr("个目录项", "entries")}</span>
                    <span>{tr("点击标题跳转到原文", "Click a title to jump")}</span>
                  </div>
                  <TableOfContentsTree
                    items={activeTableOfContents}
                    onNavigate={(item) => jumpToSource({
                      paragraphId: item.paragraphId,
                      page: item.page,
                      quote: item.title,
                    })}
                  />
                  <div className="toc-accuracy-note">
                    <Check size={14} />
                    <span>{activeDocument.tableOfContentsSource === "embedded"
                      ? activeDocument.type === "epub"
                        ? tr("目录直接读取自 EPUB 导航文档，并绑定原始章节位置。", "Contents come from the EPUB navigation document and link to the original chapter position.")
                        : tr("页码直接读取自 PDF 书签目标，不经过 AI。", "Pages come directly from PDF bookmark destinations, without AI.")
                      : tr("目录根据文中标题生成，并绑定解析时记录的原始位置。", "The outline is generated from headings and bound to their parsed source positions.")}</span>
                  </div>
                </>
              ) : (
                <div className="empty-map toc-empty">
                  <List size={30} />
                  <strong>{tr("未识别到可用目录", "No usable table of contents found")}</strong>
                  <span>{isBookMode ? tr("这本书没有内置目录，正文中也没有足够明确的章节标题。", "This book has no embedded contents and no sufficiently clear chapter headings.") : tr("这份文献没有 PDF 书签，正文中也没有足够明确的章节标题。", "This file has no PDF bookmarks and no sufficiently clear section headings.")}</span>
                </div>
              )}
            </section>
          )}

          {sideTab === "summary" && (
            <div className="overview-layout">
              <section className="summary-card hero-summary">
                <div className="card-label"><span>{isBookMode ? tr("全书概览", "Book overview") : tr("全文总结", "Full summary")}</span><Sparkles size={15} /></div>
                {summaries[activeDocument.id] ? (
                  <MarkdownContent content={summaries[activeDocument.id]} compact className="summary-markdown" />
                ) : (
                  <div className="empty-card">
                    <Brain size={24} />
                    <span>{isBookMode ? tr("生成全书主题、人物或观点、结构与阅读线索。", "Summarize themes, characters or ideas, structure and reading threads.") : tr("生成论文的研究问题、方法、结论与局限。", "Summarize the research question, method, findings and limitations.")}</span>
                  </div>
                )}
                <div className="card-actions">
                  <button onClick={generateSummary} disabled={aiBusy !== null}>
                    {aiBusy === "summary" ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
                    {summaries[activeDocument.id] ? tr("重新生成", "Regenerate") : tr("生成总结", "Generate summary")}
                  </button>
                  {summaries[activeDocument.id] && (
                    <button className="ghost-small" onClick={copySummary}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </section>

              <section className="quick-actions-card">
                <div className="card-title">{tr("快速梳理", "Quick synthesis")}</div>
                <button onClick={() => setSideTab("toc")}>
                  <span className="action-icon plum"><List size={16} /></span>
                  <span><strong>{isBookMode ? tr("查看书籍目录", "View book contents") : tr("查看论文目录", "View table of contents")}</strong><small>{activeTableOfContentsCount} {tr("个可跳转的章节标题", "clickable section headings")}</small></span>
                  <ChevronRight size={15} />
                </button>
                <button onClick={() => setSideTab("notes")}>
                  <span className="action-icon sand"><Bookmark size={16} /></span>
                  <span><strong>{tr("查看重点标记", "View highlights")}</strong><small>{activeHighlights.length} {tr("条高亮与阅读卡片", "highlights and reading cards")}</small></span>
                  <ChevronRight size={15} />
                </button>
              </section>

              <section className="selection-hint">
                <div className="hint-visual">
                  <span className="fake-line wide" />
                  <span className="fake-line selected" />
                  <span className="fake-line short" />
                </div>
                <div>
                  <strong>{tr("选中任意段落", "Select any passage")}</strong>
                  <span>{tr("即时总结、翻译或加入重点标记；总结和翻译都可显示在侧边或原文下方。", "Summarize, translate or highlight it; summaries and translations can both appear beside or below the source.")}</span>
                </div>
              </section>
            </div>
          )}

          {sideTab === "notes" && (
            <section className="notes-section">
              <div className="notes-heading">
                <div><span className="eyebrow">ANNOTATIONS</span><strong>{isBookMode ? tr("当前书籍的重点与阅读卡片", "Highlights and cards for this book") : tr("当前文献的重点与阅读卡片", "Highlights and cards for this paper")}</strong><small className="notes-document-name">{activeDocument.title}</small></div>
                <button onClick={exportNotes}><Download size={14} />{tr("导出", "Export")}</button>
              </div>
              {!activeHighlights.length && !activeNotes.length ? (
                <div className="empty-map">
                  <Highlighter size={28} />
                  <strong>{isBookMode ? tr("这本书还没有标记", "No annotations for this book") : tr("这篇文献还没有标记", "No annotations for this paper")}</strong>
                  <span>{isBookMode ? tr("在书中选中文字，点击高亮、总结或翻译。", "Select text in the book, then highlight, summarize or translate it.") : tr("在正文中选中文字，点击高亮、总结或翻译。", "Select text in the paper, then highlight, summarize or translate it.")}</span>
                </div>
              ) : (
                <div className="notes-list">
                  {activeHighlights.map((item) => (
                    <article
                      className="note-list-item source-linked"
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => jumpToSource({ paragraphId: item.paragraphId, quote: item.quote, rects: item.rects })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") jumpToSource({ paragraphId: item.paragraphId, quote: item.quote, rects: item.rects });
                      }}
                    >
                      <div className={`note-color ${item.color}`} />
                      <p>“{item.quote}”</p>
                      <div>
                        <span><MapPin size={12} />{tr("点击定位原文", "Jump to source")}</span>
                        <button onClick={(event) => { event.stopPropagation(); removeHighlight(item.id); }} aria-label={tr("删除高亮", "Remove highlight")}><Trash2 size={13} /></button>
                      </div>
                    </article>
                  ))}
                  {activeNotes.filter((note) => !note.pending).map((note) => (
                    <article
                      className={`note-list-item ai-note ${note.kind} source-linked`}
                      key={note.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => jumpToSource({ paragraphId: note.paragraphId, quote: note.quote, rects: note.rects })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") jumpToSource({ paragraphId: note.paragraphId, quote: note.quote, rects: note.rects });
                      }}
                    >
                      <div className="ai-note-head">
                        <div className="ai-note-label">
                          {note.kind === "translation" ? <Languages size={13} /> : <MessageSquare size={13} />}
                          {note.kind === "translation" ? tr("翻译", "Translation") : tr("总结", "Summary")}
                        </div>
                        <button
                          className="ai-note-delete"
                          onClick={(event) => { event.stopPropagation(); removeInlineNote(note.id); }}
                          aria-label={note.kind === "translation" ? tr("删除翻译", "Delete translation") : tr("删除总结", "Delete summary")}
                          title={note.kind === "translation" ? tr("删除翻译", "Delete translation") : tr("删除总结", "Delete summary")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <MarkdownContent content={note.content} compact />
                      <small>{tr("原文：", "Source: ")}{note.quote.slice(0, 90)}{note.quote.length > 90 ? "…" : ""}</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {sideTab === "gallery" && (
            <section className="gallery-section">
              <div className="gallery-heading">
                <div>
                  <span className="eyebrow">VISUAL CLIPPINGS</span>
                  <strong>{isBookMode ? tr("当前书籍图库", "Gallery for this book") : tr("当前文献图库", "Gallery for this paper")}</strong>
                  <small className="notes-document-name">{activeDocument.title}</small>
                </div>
                <button onClick={startGalleryCapture} disabled={captureSaving}>
                  {captureSaving ? <LoaderCircle size={14} className="spin" /> : <Camera size={14} />}
                  {tr("截图", "Capture")}
                </button>
              </div>
              {!activeCaptures.length ? (
                <div className="empty-map gallery-empty">
                  <Images size={30} />
                  <strong>{isBookMode ? tr("这本书还没有截图", "No screenshots for this book") : tr("这篇文献还没有截图", "No screenshots for this paper")}</strong>
                  <span>{isBookMode ? tr("点击截图按钮，在书中拖动框选插图或重要内容。", "Click Capture, then drag over an illustration or important passage.") : tr("点击截图按钮，在文献中拖动框选图表、公式或重要内容。", "Click Capture, then drag over a figure, formula or important passage.")}</span>
                  <button onClick={startGalleryCapture}><Camera size={14} />{tr("开始截图", "Start capture")}</button>
                </div>
              ) : (
                <div className="gallery-grid">
                  {activeCaptures.map((capture, index) => (
                    <article
                      className="gallery-item source-linked"
                      key={capture.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => jumpToSource({
                        page: capture.page,
                        paragraphId: capture.paragraphId,
                        rects: capture.rects,
                      })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") jumpToSource({
                          page: capture.page,
                          paragraphId: capture.paragraphId,
                          rects: capture.rects,
                        });
                      }}
                    >
                      <div className="gallery-thumbnail">
                        {galleryImages[capture.id]
                          ? <img src={galleryImages[capture.id]} alt={tr(`截图 ${index + 1}`, `Screenshot ${index + 1}`)} />
                          : <div className="gallery-image-loading"><LoaderCircle size={20} className="spin" /></div>}
                        <span>{capture.page ? tr(`第 ${capture.page} 页`, `Page ${capture.page}`) : isBookMode ? tr("书籍片段", "Book clipping") : tr("文献片段", "Paper clipping")}</span>
                      </div>
                      <div className="gallery-item-meta">
                        <span><MapPin size={12} />{tr("点击定位截图位置", "Jump to captured region")}</span>
                        <time dateTime={new Date(capture.createdAt).toISOString()}>
                          {new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(new Date(capture.createdAt))}
                        </time>
                        <button
                          onClick={(event) => { event.stopPropagation(); removeGalleryCapture(capture.id); }}
                          aria-label={tr("删除截图", "Delete screenshot")}
                          title={tr("删除截图", "Delete screenshot")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
            </>
          )}
        </div>
        <div className="insight-footer">
          <div className="privacy-dot" />
          {tr("原文件仅在本机读取", "Original files are read locally")}
          <span>·</span>
          {tr("仅发送你主动提交的文本", "Only text you submit is sent")}
        </div>
      </aside>

      {selection && (
        <div
          className="selection-tools"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button onClick={() => void copySelectedText()}>
            <Copy size={15} />{tr("复制", "Copy")}
          </button>
          {!selection.copyOnly && (
            <>
              <button onClick={() => runSelectionAction("summary")} disabled={aiBusy === "selection"}>
                <Sparkles size={15} />{tr("总结", "Summarize")}
              </button>
              <button onClick={() => runSelectionAction("translation")} disabled={aiBusy === "selection"}>
                <Languages size={15} />{tr("翻译", "Translate")}
              </button>
              {!isBookMode && (
                <>
                  <button onClick={openEvidenceCardDraft}>
                    <Bookmark size={15} />{tr("证据", "Evidence")}
                  </button>
                  <button onClick={showReferenceNavigator}>
                    <Network size={15} />{tr("查引用", "References")}
                  </button>
                </>
              )}
              <span className="tool-divider" />
              <div className="highlight-tool">
                <Highlighter size={15} />
                <button className="color-dot yellow" onClick={() => addHighlight("yellow")} aria-label={tr("黄色高亮", "Yellow highlight")} />
                <button className="color-dot mint" onClick={() => addHighlight("mint")} aria-label={tr("绿色高亮", "Green highlight")} />
                <button className="color-dot rose" onClick={() => addHighlight("rose")} aria-label={tr("粉色高亮", "Rose highlight")} />
              </div>
            </>
          )}
        </div>
      )}

      {evidenceDraft && (
        <div className="evidence-dialog-backdrop" role="presentation" onMouseDown={() => setEvidenceDraft(null)}>
          <section className="evidence-dialog" role="dialog" aria-modal="true" aria-label={tr("保存证据卡片", "Save evidence card")} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">EVIDENCE CARD</span><h2>{tr("保存为研究证据", "Save as research evidence")}</h2></div>
              <button className="icon-button" onClick={() => setEvidenceDraft(null)} aria-label={tr("关闭", "Close")}><X size={17} /></button>
            </header>
            <blockquote>“{evidenceDraft.quote}”</blockquote>
            <div className="evidence-dialog-grid">
              <label><span>{tr("归入项目", "Project")}</span><select value={evidenceDraft.projectId || ""} onChange={(event) => setEvidenceDraft((current) => current ? { ...current, projectId: event.target.value || undefined } : current)}><option value="">{tr("未归档", "Inbox")}</option>{researchState.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label><span>{tr("证据类型", "Evidence type")}</span><select value={evidenceDraft.type} onChange={(event) => setEvidenceDraft((current) => current ? { ...current, type: event.target.value as EvidenceType } : current)}><option value="claim">{tr("核心观点", "Claim")}</option><option value="method">{tr("研究方法", "Method")}</option><option value="result">{tr("实验结果", "Result")}</option><option value="data">{tr("数据证据", "Data")}</option><option value="limitation">{tr("局限性", "Limitation")}</option><option value="quote">{tr("可引用原句", "Quotation")}</option><option value="question">{tr("我的疑问", "Question")}</option><option value="idea">{tr("研究灵感", "Idea")}</option></select></label>
              <label><span>{tr("证据关系", "Relation")}</span><select value={evidenceDraft.relation} onChange={(event) => setEvidenceDraft((current) => current ? { ...current, relation: event.target.value as EvidenceRelation } : current)}><option value="neutral">{tr("未分类", "Neutral")}</option><option value="support">{tr("支持", "Supports")}</option><option value="qualify">{tr("补充/限定", "Qualifies")}</option><option value="contradict">{tr("矛盾", "Contradicts")}</option></select></label>
              <label><span>{tr("标签", "Tags")}</span><input value={evidenceDraft.tags} onChange={(event) => setEvidenceDraft((current) => current ? { ...current, tags: event.target.value } : current)} placeholder={tr("方法, 数据集, 核心结论", "method, dataset, key finding")} /></label>
            </div>
            <label className="evidence-note-field"><span>{tr("我的解释或使用方式", "Interpretation or intended use")}</span><textarea value={evidenceDraft.note} onChange={(event) => setEvidenceDraft((current) => current ? { ...current, note: event.target.value } : current)} placeholder={tr("这条证据说明了什么？准备放到综述的哪一部分？", "What does this evidence show, and where will you use it?")} /></label>
            <footer><span><FileText size={14} />{activeDocument.title}{evidenceDraft.page ? ` · ${tr("第", "Page")} ${evidenceDraft.page} ${tr("页", "")}` : ""}</span><div><button onClick={() => setEvidenceDraft(null)}>{tr("取消", "Cancel")}</button><button className="primary" onClick={saveEvidenceCard}><Bookmark size={15} />{tr("保存证据", "Save evidence")}</button></div></footer>
          </section>
        </div>
      )}

      {captureMode && captureBounds && (
        <div
          className={`capture-region-overlay ${captureSelectionRect ? "has-selection" : ""}`}
          style={{
            left: captureBounds.left,
            top: captureBounds.top,
            width: captureBounds.width,
            height: captureBounds.height,
          }}
          onPointerDown={beginGalleryCaptureDrag}
          onPointerMove={moveGalleryCaptureDrag}
          onPointerUp={(event) => void finishGalleryCaptureDrag(event)}
          onPointerCancel={() => setCaptureDrag(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="capture-region-tip"><Camera size={15} />{tr("拖动框选截图区域 · Esc 取消", "Drag to select a region · Esc to cancel")}</div>
          {captureSelectionRect && captureSelectionRect.width > 1 && captureSelectionRect.height > 1 && (
            <div
              className="capture-region-box"
              style={{
                left: captureSelectionRect.left - captureBounds.left,
                top: captureSelectionRect.top - captureBounds.top,
                width: captureSelectionRect.width,
                height: captureSelectionRect.height,
              }}
            >
              <span>{Math.round(captureSelectionRect.width)} × {Math.round(captureSelectionRect.height)}</span>
            </div>
          )}
        </div>
      )}

      {readingDetailsOpen && (
        <ReadingDetailsDialog
          language={language}
          readingTheme={readingTheme}
          stats={weeklyReading}
          documents={themeDocuments}
          goal={settings.weeklyReadingGoal}
          savingGoal={weeklyGoalSaving}
          onGoalChange={updateWeeklyReadingGoal}
          onClose={() => setReadingDetailsOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsCenter
          language={language}
          activeTab={settingsTab}
          draft={settingsDraft}
          connectionTest={aiConnectionTest}
          translationConnectionTest={translationConnectionTest}
          updateStatus={updateStatus}
          documentCount={themeDocuments.length}
          annotationCount={activeHighlights.length + activeNotes.length + activeCaptures.length}
          maxInsightPanelWidth={maxInsightPanelWidth}
          onTabChange={setSettingsTab}
          onChange={(next) => {
            setSettingsDraft(next);
            setAIConnectionTest({ status: "idle", message: "" });
            setTranslationConnectionTest({ status: "idle", message: "" });
          }}
          onTestConnection={testAIConnection}
          onTestTranslation={testTranslationConnection}
          onCheckUpdates={() => void checkApplicationUpdates()}
          onDownloadUpdate={() => void downloadApplicationUpdate()}
          onInstallUpdate={() => void installApplicationUpdate()}
          onStartOnboarding={startOnboarding}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}

      {onboardingOpen && (
        <OnboardingGuide
          language={language}
          step={onboardingStep}
          onStepChange={setOnboardingStep}
          onKeep={keepTemplateAfterOnboarding}
          onDelete={deleteTemplateAfterOnboarding}
          onSkip={keepTemplateAfterOnboarding}
        />
      )}

      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </div>
  );
}

type ReadingDetailsDialogProps = {
  language: AppLanguage;
  readingTheme: ReadingTheme;
  stats: ReturnType<typeof getWeeklyReadingStats>;
  documents: ResearchDocument[];
  goal: WeeklyReadingGoal;
  savingGoal: boolean;
  onGoalChange: (goal: WeeklyReadingGoal) => void;
  onClose: () => void;
};

function ReadingDetailsDialog({
  language,
  readingTheme,
  stats,
  documents,
  goal,
  savingGoal,
  onGoalChange,
  onClose,
}: ReadingDetailsDialogProps) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const isBookMode = readingTheme === "books";
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const longestReading = Math.max(1, stats.entries[0]?.seconds || 1);

  return (
    <div
      className="modal-backdrop reading-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tr("本周阅读详情", "Weekly reading details")}
      onMouseDown={onClose}
    >
      <section className="reading-detail-card" onMouseDown={(event) => event.stopPropagation()}>
        <header className="reading-detail-head">
          <div>
            <span>{tr("READING INSIGHTS", "READING INSIGHTS")}</span>
            <h2>{tr("本周阅读详情", "This week's reading")}</h2>
            <p>{formatWeekRange(stats.weekStart, stats.weekEnd, language)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("关闭", "Close")}><X size={18} /></button>
        </header>

        <div className="reading-summary-grid">
          <article>
            <Clock size={16} />
            <span>{tr("本周总时长", "Total time")}</span>
            <strong>{formatReadingDuration(stats.seconds, language)}</strong>
          </article>
          <article>
            <FileText size={16} />
            <span>{isBookMode ? tr("阅读书籍", "Books read") : tr("阅读论文", "Papers read")}</span>
            <strong>{isBookMode ? tr(`${stats.papers} 本`, `${stats.papers} books`) : tr(`${stats.papers} 篇`, `${stats.papers} papers`)}</strong>
          </article>
          <article>
            <Check size={16} />
            <span>{tr("目标进度", "Goal progress")}</span>
            <strong>{goal === null ? tr("无目标", "No goal") : `${stats.percent}%`}</strong>
          </article>
        </div>

        <section className="reading-goal-panel">
          <div className="reading-section-title">
            <div>
              <strong>{tr("调整每周阅读目标", "Adjust weekly goal")}</strong>
              <span>{tr("选择后立即保存；无目标仍会继续统计阅读时长。", "Changes save immediately. No goal still tracks reading time.")}</span>
            </div>
            {savingGoal && <LoaderCircle size={16} className="spin" />}
          </div>
          <div className="weekly-goal-options reading-detail-goals">
            {WEEKLY_READING_GOALS.map((option) => (
              <button
                type="button"
                key={option === null ? "none" : option}
                className={goal === option ? "active" : ""}
                disabled={savingGoal}
                onClick={() => onGoalChange(option)}
              >
                {option === null ? tr("无目标", "No goal") : tr(`${option} 分钟`, `${option} min`)}
              </button>
            ))}
          </div>
          {goal !== null && (
            <div className="reading-goal-progress" aria-label={`${stats.percent}%`}>
              <span style={{ width: `${stats.percent}%` }} />
            </div>
          )}
        </section>

        <section className="reading-paper-section">
          <div className="reading-section-title">
            <div>
              <strong>{isBookMode ? tr("每本书阅读时长", "Time by book") : tr("每篇论文阅读时长", "Time by paper")}</strong>
              <span>{tr("按本周前台专注阅读时间排序。", "Sorted by focused foreground reading time this week.")}</span>
            </div>
          </div>

          {stats.entries.length ? (
            <div className="reading-paper-list">
              {stats.entries.map((entry) => {
                const document = documentMap.get(entry.documentId);
                const share = stats.seconds > 0 ? Math.round((entry.seconds / stats.seconds) * 100) : 0;
                return (
                  <article className="reading-paper-row" key={entry.documentId}>
                    <span className={`reading-paper-badge ${document?.type || "missing"}`}>
                      {document ? fileTypeLabel(document.type) : "—"}
                    </span>
                    <div className="reading-paper-copy">
                      <div>
                        <strong>{document?.title || (isBookMode ? tr("已从书库移除的书籍", "Book removed from bookshelf") : tr("已从文献库移除的论文", "Paper removed from library"))}</strong>
                        <span>{formatReadingDuration(entry.seconds, language)}</span>
                      </div>
                      <div className="reading-paper-bar">
                        <span style={{ width: `${Math.max(4, (entry.seconds / longestReading) * 100)}%` }} />
                      </div>
                      <small>{tr(`占本周阅读时长 ${share}%`, `${share}% of this week's reading`)}</small>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="reading-empty-state">
              <Clock size={28} />
              <strong>{isBookMode ? tr("本周还没有书籍阅读记录", "No book reading recorded this week") : tr("本周还没有真实论文阅读记录", "No real-paper reading recorded this week")}</strong>
              <span>{isBookMode ? tr("打开导入的书籍并保持应用在前台，时长会自动累计。", "Open an imported book and keep the app in the foreground to track time.") : tr("打开导入的 PDF 或 Word 并保持应用在前台，时长会自动累计。", "Open an imported PDF or Word file and keep the app in the foreground to track time.")}</span>
            </div>
          )}
        </section>

        <footer>{isBookMode ? tr("书籍与论文的阅读记录分别统计", "Book and paper reading are tracked separately") : tr("示例论文不会计入统计", "The sample paper is excluded from statistics")}</footer>
      </section>
    </div>
  );
}

type OnboardingGuideProps = {
  language: AppLanguage;
  step: number;
  onStepChange: (step: number) => void;
  onKeep: () => void;
  onDelete: () => void;
  onSkip: () => void;
};

type OnboardingPlacement = "top" | "right" | "bottom" | "left" | "inside";

type OnboardingTargetRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function OnboardingGuide({
  language,
  step,
  onStepChange,
  onKeep,
  onDelete,
  onSkip,
}: OnboardingGuideProps) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const steps = useMemo(() => [
    {
      icon: Library,
      section: tr("认识界面", "Layout"),
      target: '[data-tour="library-panel"]',
      placement: "right" as OnboardingPlacement,
      location: tr("窗口左侧整列", "The full left column"),
      title: tr("这里是文献库与主导航", "This is your library and main navigation"),
      description: tr("论文、书籍和主要功能入口都从左侧开始。导览中的亮框会始终圈出正在介绍的真实位置。", "Papers, books and primary tools all begin on the left. The spotlight always surrounds the real control being described."),
      points: [tr("上方进入各个工作区", "Open workspaces from the top"), tr("中间选择当前文献", "Choose the active document in the middle"), tr("下方切换主题与设置", "Switch themes and settings at the bottom")],
    },
    {
      icon: FileUp,
      section: tr("导入资料", "Import"),
      target: '[data-tour="import-button"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左上角橙色按钮", "Orange button in the upper left"),
      title: tr("从这里导入论文或书籍", "Import papers or books here"),
      description: tr("论文模式支持 PDF、Word；切换到文章小说模式后，还可以导入 EPUB、TXT、Markdown、HTML 和 FB2。", "Academic mode supports PDF and Word. Book mode also imports EPUB, TXT, Markdown, HTML and FB2."),
      points: [tr("可以一次选择多个文件", "Select multiple files at once"), tr("原文件始终保留在本机", "Source files remain on your computer")],
    },
    {
      icon: LayoutGrid,
      section: tr("整理资料", "Organize"),
      target: '[data-tour="library-overview"]',
      placement: "right" as OnboardingPlacement,
      location: tr("导入按钮下方第一个入口", "First entry below Import"),
      title: tr("文献总览用于分类整理", "Library overview organizes your collection"),
      description: tr("在总览中创建、重命名和删除虚拟文件夹，并把文献移动到不同分类。移动不会改变本地原文件。", "Create, rename and remove virtual folders, then assign papers to them without moving the local source files."),
      points: [tr("文件夹归类会持久保存", "Folder assignments persist"), tr("点击文献卡片即可继续阅读", "Open any card to continue reading")],
    },
    {
      icon: BookOpen,
      section: tr("发现资料", "Discovery"),
      target: '[data-tour="academic-discovery"]',
      placement: "right" as OnboardingPlacement,
      location: tr("文献总览下方", "Below Library overview"),
      title: tr("从这里搜索外部文献库", "Search external literature databases here"),
      description: tr("在软件内统一查看搜索结果；需要下载或阅读全文时，再前往知网、Google Scholar、arXiv 等官方页面。", "Review results in one place, then open official CNKI, Google Scholar, arXiv and other source pages for reading or download."),
      points: [tr("支持多个主流文献平台", "Supports major literature platforms"), tr("结果样式与软件界面保持一致", "Results match the app's visual style")],
    },
    {
      icon: Search,
      section: tr("库内搜索", "Library search"),
      target: '[data-tour="library-search"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左侧功能入口下方的搜索框", "Search box below the workspace entries"),
      title: tr("快速查找已经导入的资料", "Find imported items quickly"),
      description: tr("这里搜索的是你的本地文献库或书库，不会联网，也不会上传文件内容。", "This searches your local library or bookshelf. It does not use the internet or upload file contents."),
      points: [tr("按标题和文件名筛选", "Filter by title and filename"), tr("论文与书籍分别搜索", "Papers and books are searched separately")],
    },
    {
      icon: FileText,
      section: tr("选择资料", "Documents"),
      target: '[data-tour="document-list"]',
      placement: "right" as OnboardingPlacement,
      location: tr("库内搜索框下方", "Below the library search box"),
      title: tr("你的论文和书籍显示在这里", "Your papers and books appear here"),
      description: tr("点击条目打开阅读；软件会分别保存每篇资料的最后阅读时间、阅读位置、笔记、翻译和标注。", "Open an item to read. Last-read time, position, notes, translations and highlights are saved separately for every document."),
      points: [tr("示例论文用于体验全部功能", "The sample paper demonstrates all features"), tr("移除条目不会删除原文件", "Removing an entry does not delete its source file")],
    },
    {
      icon: BookOpen,
      section: tr("阅读控制", "Reader controls"),
      target: '[data-tour="reader-toolbar"]',
      placement: "bottom" as OnboardingPlacement,
      location: tr("正文上方的横向工具栏", "Horizontal bar above the document"),
      title: tr("阅读控制集中在顶部", "Reader controls are grouped at the top"),
      description: tr("当前文件、文内查找、缩放、页码跳转、截图和更多操作都位于这条工具栏。", "The active file, in-document search, zoom, page navigation, capture and more actions all live in this toolbar."),
      points: [tr("PDF 显示页面缩放", "PDFs show page zoom"), tr("Word、EPUB 与 TXT 还会显示文字缩放", "Word, EPUB and TXT also show text zoom")],
    },
    {
      icon: Search,
      section: tr("文内查找", "Find in document"),
      target: '[data-tour="document-search"]',
      placement: "bottom" as OnboardingPlacement,
      location: tr("顶部工具栏中间的搜索框", "Search field in the middle of the toolbar"),
      title: tr("在当前论文或书籍中查找", "Search inside the current paper or book"),
      description: tr("输入关键词后会标出匹配内容，并显示匹配数量。它只搜索当前打开的资料。", "Enter a keyword to highlight matches and show their count. This searches only the open document."),
      points: [tr("适合定位术语、作者和结论", "Useful for terms, authors and findings"), tr("不会改变原文内容", "Never modifies the source document")],
    },
    {
      icon: ZoomIn,
      section: tr("缩放阅读", "Zoom"),
      target: '[data-tour="page-zoom"]',
      placement: "bottom" as OnboardingPlacement,
      location: tr("文内查找右侧的缩放控件", "Zoom control to the right of Find"),
      title: tr("这里控制整张页面大小", "This controls the whole page size"),
      description: tr("PDF 只提供页面缩放；可重排格式会额外出现“字”缩放，用于单独调整正文和批注字体。", "PDFs use page zoom. Reflowable formats also show text zoom for body and annotation font size."),
      points: [tr("缩放范围经过限制，避免页面失控", "Zoom is bounded to keep layouts usable"), tr("AI 创作书稿也支持双重缩放", "AI manuscripts support both zoom types")],
    },
    {
      icon: Highlighter,
      section: tr("精读工具", "Selection tools"),
      target: '[data-tour="reader-content"]',
      placement: "inside" as OnboardingPlacement,
      location: tr("窗口中央的正文阅读区", "The document area in the center"),
      title: tr("在正文中选中文字开始精读", "Select document text to begin close reading"),
      description: tr("用鼠标选中一句或多段文字，会出现复制、重点标记、翻译和选段总结工具栏。结果可显示在原文下方或文献旁边。", "Select one or more passages to open copy, highlight, translate and passage-summary actions. Results can appear below the source or beside the page."),
      points: [tr("翻译使用单条波浪线", "Translations use one wave underline"), tr("总结使用整体虚线轮廓", "Summaries use one dashed contour"), tr("荧光笔保持半透明", "Highlights remain translucent")],
    },
    {
      icon: Camera,
      section: tr("截图图库", "Capture"),
      target: '[data-tour="capture-button"]',
      placement: "bottom" as OnboardingPlacement,
      location: tr("顶部工具栏右侧的相机按钮", "Camera button on the right of the toolbar"),
      title: tr("框选文献任意区域保存到图库", "Capture any document region to the gallery"),
      description: tr("点击后在正文上拖动绘制截图区域。图片会保存在当前文献图库，点击图片可返回原始位置。", "Click, then drag over the document. The image is saved to this document's gallery and links back to its source position."),
      points: [tr("适合保存图表、公式和关键图片", "Ideal for charts, formulas and figures"), tr("截图按文献隔离", "Captures stay isolated per document")],
    },
    {
      icon: Brain,
      section: tr("AI 阅读助手", "AI assistant"),
      target: '[data-tour="insight-panel"]',
      placement: "left" as OnboardingPlacement,
      location: tr("窗口最右侧整列", "The full right column"),
      title: tr("右侧集中阅读结果与导航", "Reading intelligence lives on the right"),
      description: tr("AI 阅读助手可以隐藏、恢复或调整宽度，文字大小也能在阅读设置中修改。", "The AI assistant can be hidden, restored or resized, and its font size is adjustable in Reader settings."),
      points: [tr("内容会自动适应侧栏宽度", "Content adapts to panel width"), tr("点击笔记和图片可以返回原文", "Notes and images jump back to the source")],
    },
    {
      icon: List,
      section: tr("助手标签", "Assistant tabs"),
      target: '[data-tour="insight-tabs"]',
      placement: "left" as OnboardingPlacement,
      location: tr("AI 阅读助手标题下方", "Below the AI assistant title"),
      title: tr("目录、总结、笔记和图库在这里切换", "Switch contents, summary, notes and gallery here"),
      description: tr("目录优先读取 PDF 或 EPUB 原始目录；没有目录时自动识别标题。总结、笔记与图库均属于当前文献。", "Contents use embedded PDF or EPUB outlines first and detect headings when absent. Summary, notes and gallery belong to the active document."),
      points: [tr("目录标题可准确跳转", "Contents entries jump accurately"), tr("笔记与图库支持原文回溯", "Notes and gallery retain source links")],
    },
    {
      icon: Network,
      section: tr("研究工作台", "Research workbench"),
      target: '[data-tour="research-workspace"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左侧导航第三个工作区入口", "Third workspace entry in the left navigation"),
      title: tr("从这里进入研究项目工作台", "Open the research project workbench here"),
      description: tr("围绕研究问题组织论文、证据、对比矩阵、引用关系和综合报告，并让结论保留页码来源。", "Organize papers, evidence, comparisons, citations and synthesis around a research question while preserving page-level provenance."),
      points: [tr("命令中心提示下一步", "The command center recommends the next step"), tr("综合报告使用 [E1] 标记证据", "Synthesis uses [E1] evidence markers"), tr("整个项目可导出为 Markdown", "Export the complete project as Markdown")],
    },
    {
      icon: Wrench,
      section: tr("实用工具", "Utilities"),
      target: '[data-tour="tools-workspace"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左侧工作区入口的“实用工具”", "Utilities entry in the left workspace navigation"),
      title: tr("后续小工具会集中放在这里", "Future utilities will live here"),
      description: tr("实用工具是论文阅读主题下的独立工具箱。目前暂不提供具体工具，后续成熟的小功能会统一从这里进入，不与文献库和研究项目数据混在一起。", "Utilities is a standalone toolbox for the academic reading theme. It is currently empty; future mature tools will appear here without mixing with library or research-project data."),
      points: [tr("当前仅保留清晰的扩展入口", "A clear extension point is retained"), tr("后续工具会按用途独立排列", "Future tools will be organized by purpose"), tr("小说阅读主题不会显示此入口", "This entry stays hidden in the book-reading theme")],
    },
    {
      icon: BookOpen,
      section: tr("小说阅读与创作", "Books and writing"),
      target: '[data-tour="reading-theme"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左下角的阅读主题卡片", "Reading theme card in the lower left"),
      title: tr("在论文阅读与小说阅读间切换", "Switch between research and book reading"),
      description: tr("切换到“文章小说阅读”后，左侧会变为书库与书籍搜索，并出现 AI 创作入口。论文和书籍数据相互隔离。", "Switching to Books and fiction changes the left side to bookshelf and book discovery and reveals AI writing. Paper and book data remain separate."),
      points: [tr("支持 EPUB、TXT、Markdown、HTML 和 FB2", "Supports EPUB, TXT, Markdown, HTML and FB2"), tr("AI 创作会保存每部作品的独立会话", "AI writing keeps a separate session per work")],
    },
    {
      icon: Clock,
      section: tr("阅读统计", "Reading statistics"),
      target: '[data-tour="weekly-reading"]',
      placement: "right" as OnboardingPlacement,
      location: tr("阅读主题下方的本周阅读卡片", "This week card below Reading theme"),
      title: tr("点击查看每篇资料的阅读时长", "Open detailed reading time for every item"),
      description: tr("详情页列出本周每篇文献或书籍的阅读时长，并可设置 5、10、20、30、60、120 分钟或无目标。", "The details page lists this week's time per paper or book and lets you choose 5, 10, 20, 30, 60, 120 minutes or no goal."),
      points: [tr("论文与书籍分别统计", "Papers and books are tracked separately"), tr("无目标时仍记录时长", "Time is still tracked with no goal")],
    },
    {
      icon: Settings,
      section: tr("设置与帮助", "Settings and help"),
      target: '[data-tour="settings"]',
      placement: "right" as OnboardingPlacement,
      location: tr("左下角最底部", "Bottom-left corner"),
      title: tr("所有个性化设置都从这里进入", "All preferences begin here"),
      description: tr("设置语言、阅读布局、翻译显示、AI 模型和专业翻译服务。以后也可以从“通用 → 新手引导与帮助中心”重新打开本导览。", "Configure language, reader layout, translation display, AI models and dedicated translation services. Reopen this tour later from General → Getting started and help."),
      points: [tr("API Key 加密保存在本机", "API keys are encrypted locally"), tr("翻译可使用独立服务而不配置大模型", "Dedicated translation works without an LLM"), tr("随时可以重新查看本导览", "Reopen this tour at any time")],
    },
  ], [language]);

  const currentIndex = Math.min(steps.length - 1, Math.max(0, step));
  const current = steps[currentIndex];
  const Icon = current.icon;
  const isLast = currentIndex === steps.length - 1;
  const [targetRect, setTargetRect] = useState<OnboardingTargetRect | null>(null);

  useEffect(() => {
    let frame = 0;
    let secondFrame = 0;
    const updateTarget = () => {
      const target = document.querySelector<HTMLElement>(current.target);
      if (!target || target.getClientRects().length === 0) {
        setTargetRect(null);
        return;
      }
      const raw = target.getBoundingClientRect();
      const padding = 8;
      const left = Math.max(6, raw.left - padding);
      const top = Math.max(6, raw.top - padding);
      const right = Math.min(window.innerWidth - 6, raw.right + padding);
      const bottom = Math.min(window.innerHeight - 6, raw.bottom + padding);
      if (right - left < 4 || bottom - top < 4) {
        setTargetRect(null);
        return;
      }
      setTargetRect({ left, top, right, bottom, width: right - left, height: bottom - top });
    };
    const target = document.querySelector<HTMLElement>(current.target);
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setTargetRect(null);
    frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(updateTarget);
    });
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [current.target]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSkip]);

  const calloutStyle = useMemo<React.CSSProperties>(() => {
    if (!targetRect) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    const gap = 18;
    const margin = 18;
    const cardWidth = Math.min(430, window.innerWidth - margin * 2);
    const cardHeight = Math.min(470, window.innerHeight - margin * 2);
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    if (current.placement === "inside") {
      return {
        left: clamp(targetRect.left + (targetRect.width - cardWidth) / 2, margin, window.innerWidth - cardWidth - margin),
        top: clamp(targetRect.top + 44, margin, window.innerHeight - cardHeight - margin),
      };
    }
    const spaces = {
      top: targetRect.top,
      right: window.innerWidth - targetRect.right,
      bottom: window.innerHeight - targetRect.bottom,
      left: targetRect.left,
    };
    type OuterPlacement = Exclude<OnboardingPlacement, "inside">;
    const required = (placement: OuterPlacement) => placement === "left" || placement === "right" ? cardWidth + gap : cardHeight + gap;
    const alternatives: OuterPlacement[] = ["right", "left", "bottom", "top"];
    let placement: OuterPlacement = current.placement;
    if (spaces[placement] < required(placement)) {
      placement = alternatives.sort((a, b) => spaces[b] - spaces[a])[0];
    }
    if (placement === "right") {
      return { left: clamp(targetRect.right + gap, margin, window.innerWidth - cardWidth - margin), top: clamp(targetRect.top, margin, window.innerHeight - cardHeight - margin) };
    }
    if (placement === "left") {
      return { left: clamp(targetRect.left - cardWidth - gap, margin, window.innerWidth - cardWidth - margin), top: clamp(targetRect.top, margin, window.innerHeight - cardHeight - margin) };
    }
    if (placement === "top") {
      return { left: clamp(targetRect.left + (targetRect.width - cardWidth) / 2, margin, window.innerWidth - cardWidth - margin), top: clamp(targetRect.top - cardHeight - gap, margin, window.innerHeight - cardHeight - margin) };
    }
    return { left: clamp(targetRect.left + (targetRect.width - cardWidth) / 2, margin, window.innerWidth - cardWidth - margin), top: clamp(targetRect.bottom + gap, margin, window.innerHeight - cardHeight - margin) };
  }, [current.placement, targetRect]);

  return (
    <div className={`onboarding-tour-layer ${targetRect ? "has-target" : "no-target"}`} role="dialog" aria-modal="true" aria-label={tr("PaperLoom 逐步新手引导", "PaperLoom step-by-step guide")}>
      {targetRect && (
        <div
          className="onboarding-spotlight"
          style={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height }}
          aria-hidden="true"
        >
          <span>{tr("这里", "HERE")}</span>
        </div>
      )}
      <section className="onboarding-callout" style={calloutStyle} aria-live="polite">
        <header className="onboarding-callout-head">
          <div>
            <span className="onboarding-step-icon"><Icon size={18} /></span>
            <span><small>PAPERLOOM GUIDE</small><strong>{current.section}</strong></span>
          </div>
          <button onClick={onSkip} title={tr("跳过引导", "Skip guide")}><X size={16} />{tr("跳过引导", "Skip")}</button>
        </header>
        <div className="onboarding-tour-progress" aria-label={`${currentIndex + 1}/${steps.length}`}>
          <span style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="onboarding-location"><MapPin size={15} /><span>{tr("位置", "Location")}</span><strong>{current.location}</strong></div>
        <div className="onboarding-callout-copy">
          <h2>{current.title}</h2>
          <p>{current.description}</p>
          <ul>{current.points.map((point) => <li key={point}><Check size={15} />{point}</li>)}</ul>
        </div>
        <footer className="onboarding-callout-actions">
          <button className="secondary" onClick={() => onStepChange(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
            <ChevronLeft size={16} />{tr("上一步", "Back")}
          </button>
          <span>{tr(`第 ${currentIndex + 1} 步，共 ${steps.length} 步`, `Step ${currentIndex + 1} of ${steps.length}`)}</span>
          {isLast ? (
            <div className="onboarding-finish-actions">
              <button className="delete-sample" onClick={onDelete}><Trash2 size={15} />{tr("删除示例", "Remove sample")}</button>
              <button className="primary" onClick={onKeep}><Check size={16} />{tr("完成引导", "Finish")}</button>
            </div>
          ) : (
            <button className="primary" onClick={() => onStepChange(currentIndex + 1)}>
              {tr("下一步", "Next")}<ChevronRight size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

type SettingsCenterProps = {
  language: AppLanguage;
  activeTab: SettingsTab;
  draft: AppSettings;
  connectionTest: {
    status: "idle" | "testing" | "success" | "error";
    message: string;
  };
  translationConnectionTest: {
    status: "idle" | "testing" | "success" | "error";
    message: string;
  };
  updateStatus: UpdateStatus;
  documentCount: number;
  annotationCount: number;
  maxInsightPanelWidth: number;
  onTabChange: (tab: SettingsTab) => void;
  onChange: (settings: AppSettings) => void;
  onTestConnection: () => void;
  onTestTranslation: () => void;
  onCheckUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onStartOnboarding: () => void;
  onClose: () => void;
  onSave: () => void;
};

function SettingsCenter({
  language,
  activeTab,
  draft,
  connectionTest,
  translationConnectionTest,
  updateStatus,
  documentCount,
  annotationCount,
  maxInsightPanelWidth,
  onTabChange,
  onChange,
  onTestConnection,
  onTestTranslation,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onStartOnboarding,
  onClose,
  onSave,
}: SettingsCenterProps) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const navItems = [
    { id: "general" as const, icon: Settings, zh: "通用", en: "General" },
    { id: "reading" as const, icon: FileText, zh: "阅读", en: "Reading" },
    { id: "translation" as const, icon: Languages, zh: "翻译", en: "Translation" },
    { id: "ai" as const, icon: Sparkles, zh: "AI 模型", en: "AI models" },
    { id: "privacy" as const, icon: Bookmark, zh: "数据与隐私", en: "Data & privacy" },
    { id: "updates" as const, icon: RefreshCw, zh: "版本与更新", en: "Updates" },
  ];
  const selectedProvider = AI_PROVIDER_PRESETS.find((provider) => provider.id === draft.provider)
    || AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1];
  const selectedTranslationProvider = TRANSLATION_PROVIDER_PRESETS.find((provider) => provider.id === draft.translationProvider)
    || TRANSLATION_PROVIDER_PRESETS[0];
  const updatePhaseLabel: Record<UpdateStatus["phase"], string> = {
    disabled: tr("不可用", "Unavailable"),
    unconfigured: tr("待配置", "Setup required"),
    idle: tr("已就绪", "Ready"),
    checking: tr("检查中", "Checking"),
    available: tr("发现更新", "Update available"),
    downloading: tr("下载中", "Downloading"),
    downloaded: tr("等待安装", "Ready to install"),
    "up-to-date": tr("已是最新", "Up to date"),
    error: tr("出现问题", "Needs attention"),
  };
  const updateBusy = updateStatus.phase === "checking" || updateStatus.phase === "downloading";
  const formatUpdateBytes = (value?: number) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  const changeProvider = (providerId: AIProvider) => {
    const provider = AI_PROVIDER_PRESETS.find((item) => item.id === providerId);
    if (!provider) return;
    onChange({
      ...draft,
      provider: provider.id,
      baseUrl: provider.baseUrl,
      model: provider.models[0]?.id || "",
      apiKey: provider.id === draft.provider ? draft.apiKey : "",
    });
  };
  const changeTranslationProvider = (providerId: TranslationProvider) => {
    onChange({
      ...draft,
      translationProvider: providerId,
      translationAppId: providerId === draft.translationProvider ? draft.translationAppId : "",
      translationApiKey: providerId === draft.translationProvider ? draft.translationApiKey : "",
      translationRegion: providerId === "microsoft" ? draft.translationRegion : "",
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="settings-center" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <div className="settings-brand">
            <div className="brand-mark"><span>PL</span></div>
            <div><strong>{tr("设置中心", "Settings")}</strong><span>PaperLoom</span></div>
          </div>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={activeTab === item.id ? "active" : ""}
                  onClick={() => onTabChange(item.id)}
                >
                  <Icon size={16} />
                  {tr(item.zh, item.en)}
                </button>
              );
            })}
          </nav>
          <div className="settings-version">PaperLoom {updateStatus.currentVersion} · Research Workflow</div>
        </aside>

        <div className="settings-content">
          <div className="settings-content-head">
            <div>
              <span className="eyebrow">PREFERENCES</span>
              <h3>{tr(navItems.find((item) => item.id === activeTab)?.zh || "设置", navItems.find((item) => item.id === activeTab)?.en || "Settings")}</h3>
            </div>
            <button className="icon-button" onClick={onClose} aria-label={tr("关闭设置", "Close settings")}><X size={18} /></button>
          </div>

          <div className="settings-pane">
            {activeTab === "general" && (
              <>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("应用语言", "Application language")}</strong>
                    <span>{tr("同时控制应用界面与顶部菜单语言。", "Controls both the interface and the native app menu.")}</span>
                  </div>
                  <div className="language-options">
                    <button
                      className={draft.language === "zh-CN" ? "active" : ""}
                      onClick={() => onChange({ ...draft, language: "zh-CN" })}
                    >
                      <span>简</span><div><strong>简体中文</strong><small>Chinese (Simplified)</small></div>
                      {draft.language === "zh-CN" && <Check size={16} />}
                    </button>
                    <button
                      className={draft.language === "en-US" ? "active" : ""}
                      onClick={() => onChange({ ...draft, language: "en-US" })}
                    >
                      <span>EN</span><div><strong>English</strong><small>English (US)</small></div>
                      {draft.language === "en-US" && <Check size={16} />}
                    </button>
                  </div>
                </section>
                <section className="preference-section future-settings">
                  <div className="preference-title">
                    <strong>{tr("新手引导与帮助中心", "Getting started and help")}</strong>
                    <span>{tr("使用示例论文查看覆盖阅读、翻译、标注、图库、研究工作台、小说阅读和 AI 创作的完整指南。", "Open the complete guide for reading, translation, annotations, gallery, research workbench, books and AI writing.")}</span>
                  </div>
                  <button className="settings-inline-action" onClick={onStartOnboarding}>
                    <Sparkles size={15} />{tr("打开完整功能指南", "Open complete guide")}
                  </button>
                </section>
                <section className="preference-section future-settings">
                  <div className="preference-title">
                    <strong>{tr("可扩展设置结构", "Expandable settings structure")}</strong>
                    <span>{tr("后续可继续加入快捷键、主题、OCR、代理与同步等独立分类。", "New sections such as shortcuts, themes, OCR, proxy and sync can be added here later.")}</span>
                  </div>
                  <div className="future-setting-row"><Plus size={16} />{tr("预留新的设置模块", "Ready for new preference modules")}</div>
                </section>
              </>
            )}

            {activeTab === "reading" && (
              <>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("每周阅读目标", "Weekly reading goal")}</strong>
                    <span>{tr("按前台专注阅读时间累计；选择“无目标”后仍会记录篇数和时长。", "Counts focused foreground reading time. No goal still tracks papers and minutes.")}</span>
                  </div>
                  <div className="weekly-goal-options">
                    {WEEKLY_READING_GOALS.map((goal) => (
                      <button
                        key={goal === null ? "none" : goal}
                        className={draft.weeklyReadingGoal === goal ? "active" : ""}
                        onClick={() => onChange({ ...draft, weeklyReadingGoal: goal })}
                      >
                        {goal === null ? tr("无目标", "No goal") : tr(`${goal} 分钟`, `${goal} min`)}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("默认页面缩放", "Default page zoom")}</strong>
                    <span>{tr("每次启动应用时使用的初始缩放比例。", "Initial zoom used whenever the app starts.")}</span>
                  </div>
                  <div className="range-setting">
                    <input
                      type="range"
                      min="80"
                      max="140"
                      step="10"
                      value={draft.defaultZoom}
                      onChange={(event) => onChange({ ...draft, defaultZoom: Number(event.target.value) })}
                    />
                    <strong>{draft.defaultZoom}%</strong>
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("PDF 翻译显示位置", "PDF translation placement")}</strong>
                    <span>{tr("原文下方会在对应文字后插入翻译卡片并自动撑开页面；侧边批注保留紧凑的原始页面。", "Inline placement inserts a translation card after the matching text and expands the page; side notes keep the original page compact.")}</span>
                  </div>
                  <div className="segmented-setting translation-position-setting">
                    <button
                      className={draft.translationDisplayMode === "inline" ? "active" : ""}
                      onClick={() => onChange({ ...draft, translationDisplayMode: "inline" as TranslationDisplayMode })}
                    >
                      {tr("原文下方（推荐）", "Below source (recommended)")}
                    </button>
                    <button
                      className={draft.translationDisplayMode === "side" ? "active" : ""}
                      onClick={() => onChange({ ...draft, translationDisplayMode: "side" as TranslationDisplayMode })}
                    >
                      {tr("页面侧边", "Beside page")}
                    </button>
                  </div>
                </section>
                <section className="preference-section summary-placement-preference">
                  <div className="preference-title">
                    <strong>{tr("PDF 段落总结显示位置", "PDF passage summary placement")}</strong>
                    <span>{tr("原文下方会插入柔和的总结卡片并撑开页面；页面侧边则作为独立批注排列。", "Below-source placement inserts a calm summary card and expands the page; beside-page placement arranges summaries as separate annotations.")}</span>
                  </div>
                  <div className="segmented-setting summary-position-setting">
                    <button
                      className={draft.summaryDisplayMode === "inline" ? "active" : ""}
                      onClick={() => onChange({ ...draft, summaryDisplayMode: "inline" as TranslationDisplayMode })}
                    >
                      {tr("原文下方（推荐）", "Below source (recommended)")}
                    </button>
                    <button
                      className={draft.summaryDisplayMode === "side" ? "active" : ""}
                      onClick={() => onChange({ ...draft, summaryDisplayMode: "side" as TranslationDisplayMode })}
                    >
                      {tr("页面侧边", "Beside page")}
                    </button>
                  </div>
                  <div className="summary-style-preview">
                    <span>{tr("虚线框：总结原文", "Dashed frame: summarized source")}</span>
                    <small>{tr("蓝灰色卡片用于区分翻译", "Muted blue-gray distinguishes summaries from translations")}</small>
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("段落卡片文字大小", "Passage card text size")}</strong>
                    <span>{tr("同时调整翻译和段落总结卡片；范围经过限制，兼顾辨识度与页面空间。", "Adjusts translation and passage-summary cards within a legible, space-conscious range.")}</span>
                  </div>
                  <div className="range-setting">
                    <input
                      type="range"
                      min="12"
                      max="18"
                      step="1"
                      value={draft.translationFontSize}
                      onChange={(event) => onChange({ ...draft, translationFontSize: Number(event.target.value) })}
                    />
                    <strong>{draft.translationFontSize}px</strong>
                  </div>
                  <div className="font-size-preview translation-preview" style={{ fontSize: draft.translationFontSize }}>
                    {tr("段落卡片预览：清晰阅读，同时不过度挤占正文空间。", "Passage card preview: clear without taking over the page.")}
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("重复重点标记", "Repeated highlights")}</strong>
                    <span>{tr(
                      "默认避免同一句子被多次覆盖；开启后可为同一处添加多种颜色或重复标记。译文始终不会重复。",
                      "By default, the same passage cannot be covered repeatedly. Enable this for multiple colors or repeated highlights. Translations are always unique.",
                    )}</span>
                  </div>
                  <div className="segmented-setting">
                    <button
                      className={!draft.allowDuplicateHighlights ? "active" : ""}
                      onClick={() => onChange({ ...draft, allowDuplicateHighlights: false })}
                    >
                      {tr("避免重复（推荐）", "Prevent repeats (recommended)")}
                    </button>
                    <button
                      className={draft.allowDuplicateHighlights ? "active" : ""}
                      onClick={() => onChange({ ...draft, allowDuplicateHighlights: true })}
                    >
                      {tr("允许重复", "Allow repeats")}
                    </button>
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("左侧文献库", "Library panel")}</strong>
                    <span>{tr("可以收起到窗口左侧；收起后点击边缘标签即可恢复。", "Hide it against the left edge and restore it from the edge tab.")}</span>
                  </div>
                  <div className="segmented-setting">
                    <button className={draft.libraryPanelVisible ? "active" : ""} onClick={() => onChange({ ...draft, libraryPanelVisible: true })}>{tr("展开", "Shown")}</button>
                    <button className={!draft.libraryPanelVisible ? "active" : ""} onClick={() => onChange({ ...draft, libraryPanelVisible: false })}>{tr("收起", "Hidden")}</button>
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("AI 阅读助手宽度", "AI assistant width")}</strong>
                    <span>{tr("标准模式保持当前宽度；自定义模式可拖动右栏左边缘，且不会超过窗口的一半。", "Standard keeps the current width. Custom can be resized from its left edge and never exceeds half the window.")}</span>
                  </div>
                  <div className="segmented-setting three-options">
                    {([
                      ["hidden", tr("隐藏", "Hidden")],
                      ["standard", tr("标准", "Standard")],
                      ["custom", tr("自定义", "Custom")],
                    ] as Array<[InsightPanelMode, string]>).map(([mode, label]) => (
                      <button
                        key={mode}
                        className={draft.insightPanelMode === mode ? "active" : ""}
                        onClick={() => onChange({ ...draft, insightPanelMode: mode })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {draft.insightPanelMode === "custom" && (
                    <div className="range-setting sub-range-setting">
                      <input
                        type="range"
                        min="320"
                        max={Math.max(320, maxInsightPanelWidth)}
                        step="10"
                        value={Math.min(draft.insightPanelWidth, Math.max(320, maxInsightPanelWidth))}
                        onChange={(event) => onChange({ ...draft, insightPanelWidth: Number(event.target.value) })}
                      />
                      <strong>{Math.min(draft.insightPanelWidth, Math.max(320, maxInsightPanelWidth))}px</strong>
                    </div>
                  )}
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("AI 助手文字大小", "AI assistant text size")}</strong>
                    <span>{tr("目录、总结和笔记内容会随栏宽自动换行。", "Contents, summaries and notes reflow automatically with the panel width.")}</span>
                  </div>
                  <div className="range-setting">
                    <input
                      type="range"
                      min="11"
                      max="16"
                      step="1"
                      value={draft.insightFontSize}
                      onChange={(event) => onChange({ ...draft, insightFontSize: Number(event.target.value) })}
                    />
                    <strong>{draft.insightFontSize}px</strong>
                  </div>
                  <div className="font-size-preview" style={{ fontSize: draft.insightFontSize }}>
                    {tr("AI 阅读助手预览：内容会根据展开宽度自动适应。", "AI assistant preview: content adapts to the chosen width.")}
                  </div>
                </section>
                <section className="preference-section">
                  <div className="preference-title">
                    <strong>{tr("PDF 页面间距", "PDF page spacing")}</strong>
                    <span>{tr("选择连续阅读时页面之间的留白。", "Choose the gap between pages in continuous view.")}</span>
                  </div>
                  <div className="segmented-setting">
                    <button className={draft.pageSpacing === "compact" ? "active" : ""} onClick={() => onChange({ ...draft, pageSpacing: "compact" })}>{tr("紧凑", "Compact")}</button>
                    <button className={draft.pageSpacing === "comfortable" ? "active" : ""} onClick={() => onChange({ ...draft, pageSpacing: "comfortable" })}>{tr("舒适", "Comfortable")}</button>
                  </div>
                </section>
              </>
            )}

            {activeTab === "translation" && (
              <>
                <p className="modal-intro">
                  {tr(
                    "翻译可以继续使用 AI 模型，也可以切换到专用翻译服务。专用模式不会消耗大模型额度；每次只发送你主动选中的文字。",
                    "Translation can use your AI model or a dedicated translation service. Dedicated mode does not consume LLM credits and sends only text you explicitly select.",
                  )}
                </p>

                <section className="preference-section translation-engine-preference">
                  <div className="preference-title">
                    <strong>{tr("翻译引擎", "Translation engine")}</strong>
                    <span>{tr("总结仍然使用 AI；这里仅控制“翻译”按钮。", "Summaries still use AI; this setting controls only the Translate action.")}</span>
                  </div>
                  <div className="segmented-setting">
                    <button
                      className={draft.translationEngine === "ai" ? "active" : ""}
                      onClick={() => onChange({ ...draft, translationEngine: "ai" })}
                    >
                      <Sparkles size={14} />{tr("AI 模型翻译", "AI translation")}
                    </button>
                    <button
                      className={draft.translationEngine === "dedicated" ? "active" : ""}
                      onClick={() => onChange({ ...draft, translationEngine: "dedicated" })}
                    >
                      <Languages size={14} />{tr("专用翻译", "Dedicated translation")}
                    </button>
                  </div>
                </section>

                {draft.translationEngine === "ai" ? (
                  <section className="settings-tip large translation-mode-tip">
                    <Sparkles size={17} />
                    <div>
                      <strong>{tr("沿用当前 AI 模型", "Use the current AI model")}</strong>
                      <span>{tr("译文会继续由 AI 设置中的模型生成，需要可用的大模型接口或本地模型。", "Translations are generated by the model in AI settings and require a working API or local model.")}</span>
                    </div>
                    <button className="settings-inline-action" onClick={() => onTabChange("ai")}>{tr("打开 AI 设置", "Open AI settings")}</button>
                  </section>
                ) : (
                  <section className="provider-config translation-provider-config">
                    <label className="settings-field">
                      <span>{tr("翻译服务", "Translation service")}</span>
                      <select
                        value={draft.translationProvider}
                        onChange={(event) => changeTranslationProvider(event.target.value as TranslationProvider)}
                      >
                        {TRANSLATION_PROVIDER_PRESETS.map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.name}</option>
                        ))}
                      </select>
                    </label>

                    <div className="provider-summary translation-provider-summary">
                      <span className="provider-badge">{selectedTranslationProvider.badge}</span>
                      <div>
                        <strong>{selectedTranslationProvider.name}</strong>
                        <span>{tr(selectedTranslationProvider.zh, selectedTranslationProvider.en)}</span>
                        <small>{tr(selectedTranslationProvider.quotaZh, selectedTranslationProvider.quotaEn)}</small>
                      </div>
                      <a href={selectedTranslationProvider.docsUrl} target="_blank" rel="noreferrer">
                        {tr("官方说明", "Official docs")}<ChevronRight size={13} />
                      </a>
                    </div>

                    <label className="settings-field">
                      <span>{tr("目标语言", "Target language")}</span>
                      <select
                        value={draft.translationTargetLanguage}
                        onChange={(event) => onChange({
                          ...draft,
                          translationTargetLanguage: event.target.value as TranslationTargetLanguage,
                        })}
                      >
                        {TRANSLATION_TARGET_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{tr(option.zh, option.en)}</option>
                        ))}
                      </select>
                      <small>{tr("百度、有道、DeepL、Microsoft 和 Google 会自动识别原文语言；免密服务会在本机按文字特征识别常见语言。", "Baidu, Youdao, DeepL, Microsoft and Google detect the source language automatically. The keyless service detects common scripts locally.")}</small>
                    </label>

                    {draft.translationProvider === "mymemory" ? (
                      <label className="settings-field">
                        <span>{tr("联系邮箱（可选）", "Contact email (optional)")}</span>
                        <input
                          type="email"
                          value={draft.translationEmail}
                          onChange={(event) => onChange({ ...draft, translationEmail: event.target.value })}
                          placeholder="name@example.com"
                        />
                        <small>{tr("不填写即可免密使用，每日约 5,000 字符；填写有效邮箱后官方额度约为 50,000 字符/天。邮箱会随翻译请求发送给 MyMemory。", "Leave blank for keyless use at about 5,000 chars/day. A valid email raises the published allowance to about 50,000 chars/day and is sent to MyMemory with requests.")}</small>
                      </label>
                    ) : (
                      <>
                        {["baidu", "youdao"].includes(draft.translationProvider) && (
                          <label className="settings-field">
                            <span>{draft.translationProvider === "baidu"
                              ? tr("APP ID", "APP ID")
                              : tr("应用 ID（App Key）", "Application ID (App Key)")}</span>
                            <input
                              value={draft.translationAppId}
                              onChange={(event) => onChange({ ...draft, translationAppId: event.target.value })}
                              placeholder={draft.translationProvider === "baidu" ? "Baidu APP ID" : "Youdao App Key"}
                            />
                            <small>{tr("可在服务商控制台创建应用后查看。", "Available after creating an application in the provider console.")}</small>
                          </label>
                        )}
                        <label className="settings-field">
                          <span>{draft.translationProvider === "baidu"
                            ? tr("百度翻译密钥", "Baidu secret key")
                            : draft.translationProvider === "youdao"
                              ? tr("应用密钥（App Secret）", "Application secret (App Secret)")
                              : tr("翻译服务密钥", "Translation service key")}</span>
                          <input
                            type="password"
                            value={draft.translationApiKey}
                            onChange={(event) => onChange({ ...draft, translationApiKey: event.target.value })}
                            placeholder="••••••••••••••••"
                          />
                          <small>{tr("密钥与大模型 API Key 分开保存，并使用 Windows 安全存储加密。", "This key is separate from the AI key and encrypted with Windows secure storage.")}</small>
                        </label>
                      </>
                    )}

                    {draft.translationProvider === "microsoft" && (
                      <label className="settings-field">
                        <span>{tr("Azure Region（按需）", "Azure Region (when required)")}</span>
                        <input
                          value={draft.translationRegion}
                          onChange={(event) => onChange({ ...draft, translationRegion: event.target.value })}
                          placeholder="eastasia"
                        />
                        <small>{tr("单服务全局 Translator 可留空；区域或多服务资源需要填写创建资源时的 Region。", "Leave blank for a global single-service Translator resource; regional and multi-service resources require their Region.")}</small>
                      </label>
                    )}

                    <div className={`connection-test ${translationConnectionTest.status}`}>
                      <button type="button" onClick={onTestTranslation} disabled={translationConnectionTest.status === "testing"}>
                        {translationConnectionTest.status === "testing" ? <LoaderCircle size={14} className="spin" /> : <Network size={14} />}
                        {tr("测试翻译", "Test translation")}
                      </button>
                      {translationConnectionTest.message && <span>{translationConnectionTest.message}</span>}
                    </div>

                    <section className="settings-tip large translation-privacy-tip">
                      <Bookmark size={17} />
                      <div>
                        <strong>{tr("在线翻译仍依赖第三方服务", "Online translation still uses a third party")}</strong>
                        <span>{tr("软件不会上传整篇文献，但你点击翻译时，所选文字会发送给当前服务商。免密通道没有可用性保证，达到每日额度后可切换服务或次日再试。", "The full paper is never uploaded, but selected text is sent to the current provider when you translate. The keyless service has no availability guarantee; switch services or retry the next day after its daily allowance is reached.")}</span>
                      </div>
                    </section>
                  </section>
                )}
              </>
            )}

            {activeTab === "ai" && (
              <>
                <p className="modal-intro">
                  {tr("选择服务商后会自动填充官方接口和当前模型列表。API Key 会由操作系统加密后保存在本机；切换服务商时会清空旧 Key，避免误发给其他平台。", "Choosing a provider fills its official endpoint and current model list. The OS encrypts your API key, and switching providers clears the previous key to prevent accidental disclosure.")}
                </p>
                <section className="provider-config">
                  <label className="settings-field">
                    <span>{tr("AI 服务商", "AI provider")}</span>
                    <select value={draft.provider} onChange={(event) => changeProvider(event.target.value as AIProvider)}>
                      {AI_PROVIDER_PRESETS.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="provider-summary">
                    <span className="provider-badge">{selectedProvider.badge}</span>
                    <div>
                      <strong>{selectedProvider.name}</strong>
                      <span>{tr(selectedProvider.zh, selectedProvider.en)}</span>
                    </div>
                    {selectedProvider.docsUrl && (
                      <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">
                        {tr("官方文档", "Official docs")}<ChevronRight size={13} />
                      </a>
                    )}
                  </div>

                  <label className="settings-field">
                    <span>{tr("接口地址", "Endpoint")}</span>
                    <div className="endpoint-setting">
                      <input value={draft.baseUrl} onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
                      {draft.provider !== "custom" && (
                        <button type="button" onClick={() => onChange({ ...draft, baseUrl: selectedProvider.baseUrl })}>
                          {tr("恢复官方", "Reset")}
                        </button>
                      )}
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>{tr("模型", "Model")}</span>
                    {draft.provider === "custom" ? (
                      <input value={draft.model} onChange={(event) => onChange({ ...draft, model: event.target.value })} placeholder={tr("输入模型 ID，例如 qwen3:8b", "Enter a model ID, for example qwen3:8b")} />
                    ) : (
                      <select value={draft.model} onChange={(event) => onChange({ ...draft, model: event.target.value })}>
                        {selectedProvider.models.map((model) => (
                          <option key={model.id} value={model.id}>{tr(model.zh, model.en)} · {model.id}</option>
                        ))}
                      </select>
                    )}
                    <small>{tr("模型可用性取决于你的账号、地区和服务商权限。列表依据 2026-07-18 官方文档整理。", "Model availability depends on your account, region and provider access. List checked against official docs on 2026-07-18.")}</small>
                  </label>

                  <label className="settings-field">
                    <span>API Key</span>
                    <input type="password" value={draft.apiKey} onChange={(event) => onChange({ ...draft, apiKey: event.target.value })} placeholder={draft.provider === "custom" ? tr("本地模型通常可留空", "Usually optional for local models") : "••••••••••••••••"} />
                  </label>

                  <label className="settings-field">
                    <span>{tr("网络连接", "Network connection")}</span>
                    <select
                      value={draft.networkMode}
                      onChange={(event) => onChange({ ...draft, networkMode: event.target.value as AINetworkMode })}
                    >
                      <option value="auto">{tr("自动：系统代理失败后尝试直连（推荐）", "Automatic: system proxy, then direct (recommended)")}</option>
                      <option value="system">{tr("仅使用 Windows 系统代理", "Windows system proxy only")}</option>
                      <option value="direct">{tr("仅直接连接", "Direct connection only")}</option>
                      <option value="manual">{tr("手动设置代理", "Manual proxy")}</option>
                    </select>
                    <small>{tr("自动模式会继承 Windows、校园网或单位网络的代理与证书设置。", "Automatic mode inherits proxy and certificate settings from Windows, campus or organization networks.")}</small>
                  </label>

                  {draft.networkMode === "manual" && (
                    <label className="settings-field">
                      <span>{tr("代理地址", "Proxy address")}</span>
                      <input
                        value={draft.proxyUrl}
                        onChange={(event) => onChange({ ...draft, proxyUrl: event.target.value })}
                        placeholder="http://127.0.0.1:7890"
                      />
                      <small>{tr("支持 host:port、http://host:port 或 socks5://host:port。", "Supports host:port, http://host:port or socks5://host:port.")}</small>
                    </label>
                  )}

                  <div className={`connection-test ${connectionTest.status}`}>
                    <button type="button" onClick={onTestConnection} disabled={connectionTest.status === "testing"}>
                      {connectionTest.status === "testing" ? <LoaderCircle size={14} className="spin" /> : <Network size={14} />}
                      {tr("检测连接", "Test connection")}
                    </button>
                    {connectionTest.message && <span>{connectionTest.message}</span>}
                  </div>
                </section>
              </>
            )}

            {activeTab === "privacy" && (
              <>
                <section className="privacy-overview">
                  <div><strong>{documentCount}</strong><span>{tr("本地文献", "Local papers")}</span></div>
                  <div><strong>{annotationCount}</strong><span>{tr("当前文献标记", "Current-paper annotations")}</span></div>
                </section>
                <section className="settings-tip large">
                  <Bookmark size={17} />
                  <div><strong>{tr("原文件始终保留在本机", "Original files stay on this device")}</strong><span>{tr("目录和页码仅在本地解析；只有你主动执行总结、翻译或 AI 创作时，相应选段或当前书稿上下文才会发送到配置的服务。", "Contents and page numbers are parsed locally; selected text or current manuscript context is sent to your configured service only when you explicitly request a summary, translation or AI writing action.")}</span></div>
                </section>
                <section className="preference-section future-settings">
                  <div className="preference-title"><strong>{tr("数据管理", "Data management")}</strong><span>{tr("后续可在这里加入备份、迁移和清理功能。", "Backup, migration and cleanup controls can be added here.")}</span></div>
                </section>
              </>
            )}

            {activeTab === "updates" && (
              <>
                <section className="update-overview-card">
                  <span className="update-app-mark"><RefreshCw size={24} /></span>
                  <div>
                    <span className="eyebrow">PAPERLOOM UPDATE</span>
                    <h4>{tr("PaperLoom 版本更新", "PaperLoom updates")}</h4>
                    <p>{tr(
                      "自动检查、后台下载，并在你确认后重启安装。阅读数据与设置仍保存在本机用户目录。",
                      "Check automatically, download in the background, and restart to install only after you confirm. Reading data and settings remain in your local user profile.",
                    )}</p>
                  </div>
                  <span className={`update-state-badge ${updateStatus.phase}`}>{updatePhaseLabel[updateStatus.phase]}</span>
                </section>

                <section className="preference-section update-preference-section">
                  <div className="preference-title">
                    <strong>{tr("自动检查更新", "Automatic update checks")}</strong>
                    <span>{tr("应用启动后安静检查一次；不会未经允许自动重启。", "Checks quietly after startup and never restarts without your confirmation.")}</span>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${draft.autoCheckUpdates ? "active" : ""}`}
                    role="switch"
                    aria-checked={draft.autoCheckUpdates}
                    onClick={() => onChange({ ...draft, autoCheckUpdates: !draft.autoCheckUpdates })}
                  >
                    <span />
                    {draft.autoCheckUpdates ? tr("已开启", "On") : tr("已关闭", "Off")}
                  </button>
                </section>

                <section className={`update-status-card ${updateStatus.phase}`}>
                  <header>
                    <div>
                      <span>{tr("当前版本", "Current version")}</span>
                      <strong>v{updateStatus.currentVersion}</strong>
                    </div>
                    <div>
                      <span>{tr("可用版本", "Available version")}</span>
                      <strong>{updateStatus.availableVersion ? `v${updateStatus.availableVersion}` : "—"}</strong>
                    </div>
                    <div>
                      <span>{tr("更新通道", "Update source")}</span>
                      <strong>{updateStatus.feedHost || tr("尚未配置", "Not configured")}</strong>
                    </div>
                  </header>

                  <div className="update-status-message">
                    {updateStatus.phase === "checking" || updateStatus.phase === "downloading"
                      ? <LoaderCircle size={18} className="spin" />
                      : updateStatus.phase === "downloaded" || updateStatus.phase === "up-to-date"
                        ? <Check size={18} />
                        : <RefreshCw size={18} />}
                    <div>
                      <strong>{updatePhaseLabel[updateStatus.phase]}</strong>
                      <span>{updateStatus.message || tr("可以手动检查是否有新版本。", "You can check for a new version manually.")}</span>
                    </div>
                  </div>

                  {updateStatus.phase === "downloading" && (
                    <div className="update-progress">
                      <div><span style={{ width: `${updateStatus.progress || 0}%` }} /></div>
                      <p>
                        <strong>{Math.round(updateStatus.progress || 0)}%</strong>
                        <span>{formatUpdateBytes(updateStatus.transferred)} / {formatUpdateBytes(updateStatus.total)}</span>
                        <span>{formatUpdateBytes(updateStatus.bytesPerSecond)}/s</span>
                      </p>
                    </div>
                  )}

                  {(updateStatus.releaseName || updateStatus.releaseNotes) && (
                    <div className="update-release-notes">
                      <strong>{updateStatus.releaseName || tr("版本更新内容", "Release notes")}</strong>
                      {updateStatus.releaseNotes && <p>{updateStatus.releaseNotes}</p>}
                    </div>
                  )}

                  <div className="update-actions">
                    {updateStatus.phase === "available" ? (
                      <button className="primary" onClick={onDownloadUpdate} disabled={updateBusy}>
                        <Download size={15} />{tr("下载更新", "Download update")}
                      </button>
                    ) : updateStatus.phase === "downloaded" ? (
                      <button className="primary" onClick={onInstallUpdate}>
                        <RefreshCw size={15} />{updateStatus.portable ? tr("退出并安装正式版", "Exit and install") : tr("重启并安装", "Restart and install")}
                      </button>
                    ) : (
                      <button
                        className="primary"
                        onClick={onCheckUpdates}
                        disabled={updateBusy || !updateStatus.supported || !updateStatus.configured}
                      >
                        {updateStatus.phase === "checking" ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
                        {tr("检查更新", "Check for updates")}
                      </button>
                    )}
                    {updateStatus.checkedAt && (
                      <span>{tr("上次检查：", "Last checked: ")}{new Date(updateStatus.checkedAt).toLocaleString(language)}</span>
                    )}
                  </div>
                </section>

                {!updateStatus.configured && (
                  <section className="settings-tip large update-setup-tip">
                    <Settings size={17} />
                    <div>
                      <strong>{tr("还差一个正式下载地址", "A release URL is still required")}</strong>
                      <span>{tr(
                        "开发者在 electron/update-config.json 中填入 HTTPS 更新目录，然后执行 npm run dist:update；普通用户无需填写任何地址。",
                        "Set the HTTPS release directory in electron/update-config.json and run npm run dist:update. End users never need to enter an address.",
                      )}</span>
                    </div>
                  </section>
                )}

                {updateStatus.portable && (
                  <section className="settings-tip large update-portable-tip">
                    <Bookmark size={17} />
                    <div>
                      <strong>{tr("当前运行的是便携版", "You are using the portable edition")}</strong>
                      <span>{tr("下载更新后会启动 NSIS 安装程序并迁移到正式安装版；文献记录、标注、设置和创作会话仍保留在 Windows 用户数据目录。", "After downloading, the NSIS installer migrates this copy to the installed edition. Library records, annotations, settings and writing sessions remain in your Windows user-data directory.")}</span>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <div className="modal-actions settings-actions">
            <button className="secondary" onClick={onClose}>{tr("取消", "Cancel")}</button>
            <button className="primary" onClick={onSave}><Check size={15} />{tr("保存设置", "Save settings")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AcademicDiscovery({ language }: { language: AppLanguage }) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState<AcademicSearchProviderId>("openalex");
  const [sort, setSort] = useState<AcademicSearchSort>("relevance");
  const [yearRange, setYearRange] = useState<"all" | "3" | "5" | "10">("all");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [response, setResponse] = useState<AcademicSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());
  const selectedProvider = ACADEMIC_API_PROVIDERS.find((provider) => provider.id === providerId)
    || ACADEMIC_API_PROVIDERS[0];
  const resultNumber = new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US");

  const openOfficialUrl = (url: string, scholarlyResult = false) => {
    if (scholarlyResult && window.paperLoom?.openScholarlyResult) {
      void window.paperLoom.openScholarlyResult(url);
    } else if (window.paperLoom?.openExternal) {
      void window.paperLoom.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const runSearch = async (page = 1) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery || loading) return;
    setLoading(true);
    setError("");
    if (page === 1) setResponse(null);
    try {
      if (!window.paperLoom?.searchAcademic) {
        throw new Error(tr("请在 PaperLoom 桌面版中使用实时学术检索。", "Live academic search is available in the PaperLoom desktop app."));
      }
      const years = yearRange === "all" ? undefined : Number(yearRange);
      const currentYear = new Date().getFullYear();
      const result = await window.paperLoom.searchAcademic({
        provider: providerId,
        query: normalizedQuery,
        page,
        sort,
        yearFrom: years ? currentYear - years + 1 : undefined,
        openAccessOnly,
        language,
      });
      setResponse(result as AcademicSearchResponse);
      setExpandedAbstracts(new Set());
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".academic-results-head")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("学术检索失败，请稍后重试。", "Academic search failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const changeProvider = (id: AcademicSearchProviderId) => {
    setProviderId(id);
    setResponse(null);
    setError("");
    setExpandedAbstracts(new Set());
  };

  const toggleAbstract = (id: string) => {
    setExpandedAbstracts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const providerName = (id: AcademicSearchProviderId) => (
    ACADEMIC_API_PROVIDERS.find((provider) => provider.id === id)?.name || id
  );

  const authorLine = (result: AcademicSearchResult) => {
    if (!result.authors.length) return tr("作者信息暂无", "Authors unavailable");
    const shown = result.authors.slice(0, 6).join(language === "zh-CN" ? "、" : ", ");
    return result.authors.length > 6 ? `${shown} ${tr("等", "et al.")}` : shown;
  };

  return (
    <section className="academic-discovery-page">
      <header className="academic-discovery-hero">
        <div className="academic-hero-copy">
          <span className="academic-search-icon"><BookOpen size={22} /></span>
          <div>
            <span className="eyebrow">ACADEMIC DISCOVERY</span>
            <h1>{tr("在 PaperLoom 中发现下一篇论文", "Discover your next paper in PaperLoom")}</h1>
            <p>{tr("先在软件内比较题名、作者、摘要、年份与引用信息；需要阅读或下载时，再前往论文官方页面。", "Compare titles, authors, abstracts, dates and citations in the app, then visit the official paper page when you want to read or download.")}</p>
          </div>
        </div>

        <form className="academic-discovery-search" onSubmit={(event) => { event.preventDefault(); void runSearch(1); }}>
          <label className="academic-query-field discovery-query">
            <Search size={19} />
            <input
              id="academic-search-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("输入论文题名、DOI、作者或研究关键词", "Search by title, DOI, author or research keywords")}
              aria-label={tr("学术文献检索词", "Academic literature query")}
              maxLength={300}
            />
          </label>
          <button type="submit" disabled={!query.trim() || loading}>
            {loading ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}
            {loading ? tr("正在检索", "Searching") : tr("检索文献", "Search papers")}
          </button>
        </form>

        <div className="academic-provider-tabs" role="tablist" aria-label={tr("公开检索数据源", "Public academic data sources")}>
          {ACADEMIC_API_PROVIDERS.map((provider) => (
            <button
              type="button"
              role="tab"
              aria-selected={provider.id === providerId}
              className={`${provider.id === providerId ? "active" : ""} ${provider.accent}`}
              onClick={() => changeProvider(provider.id)}
              key={provider.id}
            >
              <span>{provider.name.slice(0, 2).toUpperCase()}</span>
              <div><strong>{provider.name}</strong><small>{language === "zh-CN" ? provider.description : provider.descriptionEn}</small></div>
              {provider.id === providerId && <Check size={14} />}
            </button>
          ))}
        </div>

        <div className="academic-filter-row">
          <div className="academic-source-note">
            <span className={`source-dot ${selectedProvider.accent}`} />
            <span>{tr("当前数据源", "Source")}</span>
            <strong>{selectedProvider.name}</strong>
          </div>
          <label>
            <span>{tr("排序", "Sort")}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as AcademicSearchSort)}>
              <option value="relevance">{tr("相关度", "Relevance")}</option>
              <option value="newest">{tr("最新发表", "Newest")}</option>
              <option value="cited">{tr("引用量", "Most cited")}</option>
            </select>
          </label>
          <label>
            <span>{tr("年份", "Year")}</span>
            <select value={yearRange} onChange={(event) => setYearRange(event.target.value as typeof yearRange)}>
              <option value="all">{tr("全部年份", "All years")}</option>
              <option value="3">{tr("近 3 年", "Past 3 years")}</option>
              <option value="5">{tr("近 5 年", "Past 5 years")}</option>
              <option value="10">{tr("近 10 年", "Past 10 years")}</option>
            </select>
          </label>
          <label className="academic-open-filter">
            <input type="checkbox" checked={openAccessOnly} onChange={(event) => setOpenAccessOnly(event.target.checked)} />
            <span>{tr("仅开放获取", "Open access only")}</span>
          </label>
          {response && (
            <button type="button" className="academic-apply-filter" onClick={() => void runSearch(1)} disabled={loading}>
              {tr("应用筛选", "Apply filters")}
            </button>
          )}
        </div>
      </header>

      {loading && !response && (
        <div className="academic-loading-state">
          <LoaderCircle size={30} className="spin" />
          <strong>{tr("正在查询公开学术索引", "Searching public scholarly indexes")}</strong>
          <span>{tr("正在整理题名、作者、摘要、出版信息与开放获取链接。", "Collecting titles, authors, abstracts, publication metadata and open-access links.")}</span>
        </div>
      )}

      {error && (
        <section className="academic-error-state">
          <FileText size={25} />
          <div><strong>{tr("这次检索没有完成", "This search did not complete")}</strong><span>{error}</span></div>
          <button type="button" onClick={() => void runSearch(response?.page || 1)}>{tr("重试", "Try again")}</button>
          <button type="button" className="secondary" onClick={() => openOfficialUrl(selectedProvider.officialSearchUrl(normalizeText(query)))} disabled={!query.trim()}>
            <ExternalLink size={14} />{tr("打开官网检索", "Open official search")}
          </button>
        </section>
      )}

      {response && !error && (
        <section className="academic-results-section">
          <header className="academic-results-head">
            <div>
              <span className="eyebrow">SEARCH RESULTS</span>
              <h2>{tr(`“${response.query}”的检索结果`, `Results for “${response.query}”`)}</h2>
              <p>{tr(
                `${providerName(response.provider)} 共匹配约 ${resultNumber.format(response.total)} 条记录，当前显示第 ${response.page} 页。`,
                `${providerName(response.provider)} matched about ${resultNumber.format(response.total)} records; showing page ${response.page}.`,
              )}</p>
            </div>
            <button type="button" className="secondary" onClick={() => openOfficialUrl(selectedProvider.officialSearchUrl(response.query))}>
              <ExternalLink size={14} />{tr("在官网查看", "View on official site")}
            </button>
          </header>

          {response.results.length ? (
            <div className="academic-result-list">
              {response.results.map((result, index) => {
                const expanded = expandedAbstracts.has(result.id);
                return (
                  <article className="academic-result-card" key={`${result.id}-${index}`}>
                    <div className="academic-result-index">{String((response.page - 1) * response.pageSize + index + 1).padStart(2, "0")}</div>
                    <div className="academic-result-content">
                      <div className="academic-result-badges">
                        <span className={`provider-badge ${result.provider}`}>{providerName(result.provider)}</span>
                        {result.isOpenAccess && <span className="open-access-badge"><Check size={11} />{tr("开放获取", "Open access")}</span>}
                        {result.publicationType && <span>{result.publicationType.replace(/-/g, " ")}</span>}
                      </div>
                      <h3>{result.title}</h3>
                      <p className="academic-result-authors">{authorLine(result)}</p>
                      <div className="academic-result-meta">
                        {result.year && <span><Clock size={13} />{result.year}</span>}
                        {result.venue && <span><BookOpen size={13} />{result.venue}</span>}
                        {result.citationCount !== undefined && <span><Bookmark size={13} />{tr(`被引 ${resultNumber.format(result.citationCount)} 次`, `${resultNumber.format(result.citationCount)} citations`)}</span>}
                        {result.doi && <span className="result-doi">DOI {result.doi}</span>}
                      </div>
                      {result.abstract ? (
                        <div className={`academic-result-abstract ${expanded ? "expanded" : ""}`}>
                          <p>{result.abstract}</p>
                          {result.abstract.length > 260 && (
                            <button type="button" onClick={() => toggleAbstract(result.id)}>
                              {expanded ? tr("收起摘要", "Collapse abstract") : tr("展开摘要", "Expand abstract")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="academic-no-abstract">{tr("该数据源暂未提供摘要。", "No abstract was provided by this data source.")}</p>
                      )}
                    </div>
                    <div className="academic-result-actions">
                      {result.pdfUrl && (
                        <button type="button" className="oa-action" onClick={() => openOfficialUrl(result.pdfUrl!, true)}>
                          <Download size={14} />{tr("开放全文", "Open full text")}
                        </button>
                      )}
                      {result.landingUrl && (
                        <button type="button" onClick={() => openOfficialUrl(result.landingUrl!, true)}>
                          <ExternalLink size={14} />{tr("阅读 / 获取", "Read / Get")}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="academic-empty-results">
              <Search size={28} />
              <strong>{tr("没有找到符合筛选条件的文献", "No papers matched these filters")}</strong>
              <span>{tr("可以缩短检索词、切换数据源或取消“仅开放获取”。", "Try a shorter query, another source, or disable the open-access filter.")}</span>
            </div>
          )}

          <div className="academic-pagination">
            <button type="button" onClick={() => void runSearch(response.page - 1)} disabled={response.page <= 1 || loading}><ChevronLeft size={14} />{tr("上一页", "Previous")}</button>
            <span>{tr(`第 ${response.page} 页`, `Page ${response.page}`)}</span>
            <button type="button" onClick={() => void runSearch(response.page + 1)} disabled={!response.hasNext || loading}>{tr("下一页", "Next")}<ChevronRight size={14} /></button>
          </div>
        </section>
      )}

      {!response && !loading && !error && (
        <section className="academic-discovery-welcome">
          <div className="academic-welcome-main">
            <span className="academic-welcome-mark"><Search size={25} /></span>
            <div>
              <strong>{tr("从一个研究问题开始", "Start with a research question")}</strong>
              <p>{tr("搜索结果只展示公开元数据，不会绕过付费墙或机构权限。点击原文后由出版社、仓储平台或数据库官网决定阅读与下载权限。", "Search results show public metadata only and never bypass paywalls or institutional access. The publisher, repository or database decides reading and download access after you open the source.")}</p>
            </div>
          </div>
          <div className="academic-example-queries">
            <span>{tr("可以试试", "Try")}</span>
            {[tr("医学影像分割", "medical image segmentation"), tr("检索增强生成 文献综述", "retrieval augmented generation survey"), tr("大语言模型教育应用", "large language models in education")].map((example) => (
              <button type="button" onClick={() => setQuery(example)} key={example}>{example}</button>
            ))}
          </div>
        </section>
      )}

      <section className="official-database-section">
        <div className="official-database-shell">
          <header className="official-database-header">
            <div className="official-database-heading">
              <span className="official-database-emblem"><Library size={22} /></span>
              <div>
                <span className="eyebrow">MORE RESEARCH SOURCES</span>
                <h2>{tr("继续探索更多专业文献库", "Continue with more specialized databases")}</h2>
              </div>
            </div>
            <div className="official-database-intro">
              <span><ExternalLink size={13} />{tr("官方资源通道", "Official source routes")}</span>
              <p>{tr("中文资源、工程数据库与出版社平台都可以从这里继续检索。输入上方关键词后，PaperLoom 会带着检索词前往对应官网。", "Continue searching Chinese resources, engineering indexes and publisher platforms. PaperLoom carries your query to the selected official site.")}</p>
            </div>
          </header>

          <div className="official-database-grid">
            {ACADEMIC_DATABASES.filter((database) => !["semantic-scholar", "pubmed"].includes(database.id)).map((database) => (
              <article className={`official-database-card ${database.id}`} key={database.id}>
                <span className="official-database-mark">{database.mark}</span>
                <div className="official-database-copy">
                  <strong>{language === "zh-CN" ? database.name : database.nameEn}</strong>
                  <span>{language === "zh-CN" ? database.description : database.descriptionEn}</span>
                  <small>{query.trim()
                    ? tr("已准备使用当前关键词检索", "Ready to search with the current query")
                    : tr("输入上方关键词后即可使用", "Enter a query above to use this source")}</small>
                </div>
                <button
                  type="button"
                  onClick={() => openOfficialUrl(database.buildSearchUrl(normalizeText(query)))}
                  disabled={!query.trim()}
                  title={!query.trim() ? tr("请先输入检索词", "Enter a query first") : undefined}
                >
                  {tr("前往检索", "Search there")}<ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>

          <footer className="official-database-footer">
            <span><ExternalLink size={13} />{tr("阅读与下载权限仍由各文献库官网决定", "Reading and download access remains controlled by each official database")}</span>
            <small className="academic-attribution">{tr("数据来源：OpenAlex、Crossref、Semantic Scholar、NCBI PubMed。感谢 arXiv 提供开放互操作服务。", "Data sources: OpenAlex, Crossref, Semantic Scholar and NCBI PubMed. Thank you to arXiv for use of its open access interoperability.")}</small>
          </footer>
        </div>
      </section>
    </section>
  );
}

function BookDiscovery({ language }: { language: AppLanguage }) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState<BookSearchProviderId>("open-library");
  const [sort, setSort] = useState<BookSearchSort>("relevance");
  const [response, setResponse] = useState<BookSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const selectedProvider = BOOK_API_PROVIDERS.find((provider) => provider.id === providerId)
    || BOOK_API_PROVIDERS[0];
  const resultNumber = new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US");

  const openOfficialUrl = (url: string) => {
    if (window.paperLoom?.openScholarlyResult) void window.paperLoom.openScholarlyResult(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const runSearch = async (page = 1) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery || loading) return;
    setLoading(true);
    setError("");
    if (page === 1) setResponse(null);
    try {
      if (!window.paperLoom?.searchBooks) {
        throw new Error(tr("请在 PaperLoom 桌面版中使用实时书籍检索。", "Live book search is available in the PaperLoom desktop app."));
      }
      const result = await window.paperLoom.searchBooks({
        provider: providerId,
        query: normalizedQuery,
        page,
        sort,
        language,
      });
      setResponse(result as BookSearchResponse);
      setExpandedDescriptions(new Set());
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".book-results-head")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("书籍检索失败，请稍后重试。", "Book search failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const changeProvider = (id: BookSearchProviderId) => {
    setProviderId(id);
    setResponse(null);
    setError("");
    setExpandedDescriptions(new Set());
  };

  const toggleDescription = (id: string) => {
    setExpandedDescriptions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const providerName = (id: BookSearchProviderId) => (
    BOOK_API_PROVIDERS.find((provider) => provider.id === id)?.name || id
  );

  const authorLine = (result: BookSearchResult) => {
    if (!result.authors.length) return tr("作者信息暂无", "Authors unavailable");
    const shown = result.authors.slice(0, 6).join(language === "zh-CN" ? "、" : ", ");
    return result.authors.length > 6 ? `${shown} ${tr("等", "et al.")}` : shown;
  };

  const accessLabel = (result: BookSearchResult) => {
    if (result.accessType === "download") return tr("可获取电子书", "Ebook available");
    if (result.accessType === "borrow") return tr("可在线借阅", "Online borrowing");
    if (result.accessType === "preview") return tr("可在线阅读 / 预览", "Online reading / preview");
    return tr("书目信息", "Catalogue record");
  };

  return (
    <section className="academic-discovery-page book-discovery-page">
      <header className="academic-discovery-hero book-discovery-hero">
        <div className="academic-hero-copy">
          <span className="academic-search-icon book-search-icon"><BookOpen size={22} /></span>
          <div>
            <span className="eyebrow">BOOK DISCOVERY</span>
            <h1>{tr("在 PaperLoom 中发现下一本书", "Discover your next book in PaperLoom")}</h1>
            <p>{tr("在软件内直接搜索纸质书目和电子书资源；可查看在线阅读、借阅及下载状态，再前往来源官网获取内容。", "Search both bibliographic records and ebooks in the app, compare reading, borrowing and download availability, then continue on the source site.")}</p>
          </div>
        </div>

        <form className="academic-discovery-search" onSubmit={(event) => { event.preventDefault(); void runSearch(1); }}>
          <label className="academic-query-field discovery-query">
            <Search size={19} />
            <input
              id="book-search-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("输入书名、作者、ISBN、人物或主题关键词", "Search by title, author, ISBN, character or topic")}
              aria-label={tr("书籍检索词", "Book search query")}
              maxLength={300}
            />
          </label>
          <button type="submit" disabled={!query.trim() || loading}>
            {loading ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}
            {loading ? tr("正在检索", "Searching") : tr("检索书籍", "Search books")}
          </button>
        </form>

        <div className="academic-provider-tabs book-provider-tabs" role="tablist" aria-label={tr("公开书籍数据源", "Public book sources")}>
          {BOOK_API_PROVIDERS.map((provider) => (
            <button
              type="button"
              role="tab"
              aria-selected={provider.id === providerId}
              className={`${provider.id === providerId ? "active" : ""} ${provider.accent}`}
              onClick={() => changeProvider(provider.id)}
              key={provider.id}
            >
              <span>{provider.mark}</span>
              <div><strong>{provider.name}</strong><small>{language === "zh-CN" ? provider.description : provider.descriptionEn}</small></div>
              {provider.id === providerId && <Check size={14} />}
            </button>
          ))}
        </div>

        <div className="academic-filter-row book-filter-row">
          <div className="academic-source-note">
            <span className={`source-dot ${selectedProvider.accent}`} />
            <span>{tr("当前数据源", "Source")}</span>
            <strong>{selectedProvider.name}</strong>
          </div>
          <label>
            <span>{tr("排序", "Sort")}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as BookSearchSort)}>
              <option value="relevance">{tr("相关度", "Relevance")}</option>
              <option value="newest">{tr("最新出版", "Newest")}</option>
            </select>
          </label>
          {response && (
            <button type="button" className="academic-apply-filter" onClick={() => void runSearch(1)} disabled={loading}>
              {tr("应用排序", "Apply sort")}
            </button>
          )}
        </div>
      </header>

      {loading && !response && (
        <div className="academic-loading-state">
          <LoaderCircle size={30} className="spin" />
          <strong>{tr("正在查询公开书籍目录", "Searching public book catalogs")}</strong>
          <span>{tr("正在整理作者、版本、封面、内容简介与官方阅读入口。", "Collecting authors, editions, covers, descriptions and official reading routes.")}</span>
        </div>
      )}

      {error && (
        <section className="academic-error-state">
          <BookOpen size={25} />
          <div><strong>{tr("这次检索没有完成", "This search did not complete")}</strong><span>{error}</span></div>
          <button type="button" onClick={() => void runSearch(response?.page || 1)}>{tr("重试", "Try again")}</button>
          <button type="button" className="secondary" onClick={() => openOfficialUrl(selectedProvider.officialSearchUrl(normalizeText(query)))} disabled={!query.trim()}>
            <ExternalLink size={14} />{tr("打开官网检索", "Open official search")}
          </button>
        </section>
      )}

      {response && !error && (
        <section className="academic-results-section">
          <header className="academic-results-head book-results-head">
            <div>
              <span className="eyebrow">BOOK RESULTS</span>
              <h2>{tr(`“${response.query}”的书籍结果`, `Books matching “${response.query}”`)}</h2>
              <p>{tr(
                `${providerName(response.provider)} 共匹配约 ${resultNumber.format(response.total)} 条记录，当前显示第 ${response.page} 页。`,
                `${providerName(response.provider)} matched about ${resultNumber.format(response.total)} records; showing page ${response.page}.`,
              )}</p>
            </div>
            <button type="button" className="secondary" onClick={() => openOfficialUrl(selectedProvider.officialSearchUrl(response.query))}>
              <ExternalLink size={14} />{tr("在官网查看", "View on official site")}
            </button>
          </header>

          {response.results.length ? (
            <div className="academic-result-list book-result-list">
              {response.results.map((result, index) => {
                const expanded = expandedDescriptions.has(result.id);
                return (
                  <article className="academic-result-card book-result-card" key={`${result.id}-${index}`}>
                    <div className="book-result-cover">
                      {result.coverUrl
                        ? <img src={result.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        : <span><BookOpen size={25} /></span>}
                    </div>
                    <div className="academic-result-content">
                      <div className="academic-result-badges">
                        <span className={`provider-badge ${result.provider}`}>{providerName(result.provider)}</span>
                        {result.isReadable && <span className={`open-access-badge access-${result.accessType || "preview"}`}><Check size={11} />{accessLabel(result)}</span>}
                        {result.categories?.slice(0, 2).map((category) => <span key={category}>{category}</span>)}
                      </div>
                      <h3>{result.title}</h3>
                      <p className="academic-result-authors">{authorLine(result)}</p>
                      <div className="academic-result-meta">
                        {result.year && <span><Clock size={13} />{result.year}</span>}
                        {result.publisher && <span><BookOpen size={13} />{result.publisher}</span>}
                        {result.editionCount !== undefined && <span><Bookmark size={13} />{tr(`${result.editionCount} 个版本`, `${result.editionCount} editions`)}</span>}
                        {result.pageCount !== undefined && <span><FileText size={13} />{tr(`${result.pageCount} 页`, `${result.pageCount} pages`)}</span>}
                        {result.formats?.length ? <span><FileText size={13} />{result.formats.slice(0, 4).join(" · ")}</span> : null}
                        {result.isbn && <span className="result-doi">ISBN {result.isbn}</span>}
                      </div>
                      {result.description ? (
                        <div className={`academic-result-abstract ${expanded ? "expanded" : ""}`}>
                          <p>{result.description}</p>
                          {result.description.length > 260 && (
                            <button type="button" onClick={() => toggleDescription(result.id)}>
                              {expanded ? tr("收起简介", "Collapse description") : tr("展开简介", "Expand description")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="academic-no-abstract">{tr("该数据源暂未提供内容简介。", "No description was provided by this source.")}</p>
                      )}
                    </div>
                    <div className="academic-result-actions">
                      {result.previewUrl && (
                        <button type="button" className="oa-action" onClick={() => openOfficialUrl(result.previewUrl!)}>
                          <BookOpen size={14} />{result.accessType === "borrow" ? tr("在线借阅", "Borrow online") : tr("在线阅读", "Read online")}
                        </button>
                      )}
                      {result.landingUrl && (
                        <button type="button" onClick={() => openOfficialUrl(result.landingUrl!)}>
                          <ExternalLink size={14} />{result.accessType === "download" ? tr("格式与下载", "Formats & download") : tr("详情 / 获取", "Details / access")}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="academic-empty-results">
              <Search size={28} />
              <strong>{tr("没有找到匹配的书籍", "No books matched this search")}</strong>
              <span>{tr("可以缩短书名、改用作者或 ISBN，或切换另一个数据源。", "Try a shorter title, an author or ISBN, or switch sources.")}</span>
            </div>
          )}

          <div className="academic-pagination">
            <button type="button" onClick={() => void runSearch(response.page - 1)} disabled={response.page <= 1 || loading}><ChevronLeft size={14} />{tr("上一页", "Previous")}</button>
            <span>{tr(`第 ${response.page} 页`, `Page ${response.page}`)}</span>
            <button type="button" onClick={() => void runSearch(response.page + 1)} disabled={!response.hasNext || loading}>{tr("下一页", "Next")}<ChevronRight size={14} /></button>
          </div>
        </section>
      )}

      {!response && !loading && !error && (
        <section className="academic-discovery-welcome book-discovery-welcome">
          <div className="academic-welcome-main">
            <span className="academic-welcome-mark"><BookOpen size={25} /></span>
            <div>
              <strong>{tr("从一本想读的书开始", "Start with a book you want to read")}</strong>
              <p>{tr("Open Library 与 Google Books 用于广泛书目检索；Internet Archive 与 Project Gutenberg 专门补充可在线阅读、借阅或下载的电子书。最终权限由来源官网决定。", "Open Library and Google Books provide broad catalogues; Internet Archive and Project Gutenberg add ebooks for online reading, borrowing or download. Final access is controlled by the source site.")}</p>
            </div>
          </div>
          <div className="academic-example-queries">
            <span>{tr("可以试试", "Try")}</span>
            {[tr("百年孤独", "One Hundred Years of Solitude"), tr("三体 刘慈欣", "The Three-Body Problem"), tr("Pride and Prejudice", "Pride and Prejudice")].map((example) => (
              <button type="button" onClick={() => setQuery(example)} key={example}>{example}</button>
            ))}
          </div>
        </section>
      )}

      <section className="official-database-section book-catalog-section">
        <div className="official-database-shell">
          <header className="official-database-header">
            <div className="official-database-heading">
              <span className="official-database-emblem"><BookOpen size={22} /></span>
              <div><span className="eyebrow">MORE BOOK SOURCES</span><h2>{tr("继续探索更多书籍平台", "Continue with more book platforms")}</h2></div>
            </div>
            <div className="official-database-intro">
              <span><ExternalLink size={13} />{tr("官方资源通道", "Official source routes")}</span>
              <p>{tr("这里保留中文书评与中文电子书平台入口。上方 Internet Archive、Project Gutenberg 已支持在软件内直接显示电子书结果。", "These links cover Chinese reviews and Chinese reading platforms. Internet Archive and Project Gutenberg now show ebook results directly above.")}</p>
            </div>
          </header>
          <div className="official-database-grid">
            {BOOK_CATALOGS.map((catalog) => (
              <article className={`official-database-card ${catalog.id}`} key={catalog.id}>
                <span className="official-database-mark">{catalog.mark}</span>
                <div className="official-database-copy">
                  <strong>{language === "zh-CN" ? catalog.name : catalog.nameEn}</strong>
                  <span>{language === "zh-CN" ? catalog.description : catalog.descriptionEn}</span>
                  <small>{query.trim() ? tr("已准备使用当前关键词检索", "Ready to search with the current query") : tr("输入上方关键词后即可使用", "Enter a query above to use this source")}</small>
                </div>
                <button type="button" onClick={() => openOfficialUrl(catalog.buildSearchUrl(normalizeText(query)))} disabled={!query.trim()}>
                  {tr("前往检索", "Search there")}<ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
          <footer className="official-database-footer">
            <span><ExternalLink size={13} />{tr("阅读与获取权限仍由各平台官网决定", "Reading and access remain controlled by each official platform")}</span>
            <small className="academic-attribution">{tr("软件内数据来源：Open Library、Google Books、Internet Archive、Project Gutenberg。", "In-app data sources: Open Library, Google Books, Internet Archive and Project Gutenberg.")}</small>
          </footer>
        </div>
      </section>
    </section>
  );
}

type LibraryOverviewProps = {
  language: AppLanguage;
  readingTheme: ReadingTheme;
  documents: ResearchDocument[];
  folders: LibraryFolder[];
  selectedFolderId: string;
  movingDocumentId: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: (name: string) => boolean;
  onRenameFolder: (folderId: string, name: string) => boolean;
  onMoveDocument: (documentId: string, folderId?: string) => void;
  onOpenDocument: (document: ResearchDocument) => void;
  onImport: () => void;
};

function LibraryOverview({
  language,
  readingTheme,
  documents,
  folders,
  selectedFolderId,
  movingDocumentId,
  searchTerm,
  onSearchChange,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onMoveDocument,
  onOpenDocument,
  onImport,
}: LibraryOverviewProps) {
  const tr = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const isBookMode = readingTheme === "books";
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const query = searchTerm.trim().toLocaleLowerCase();
  const visibleDocuments = documents.filter((document) => {
    const inFolder = selectedFolderId === "all"
      || (selectedFolderId === "unfiled" ? !document.folderId : document.folderId === selectedFolderId);
    const matches = !query || `${document.title} ${document.name}`.toLocaleLowerCase().includes(query);
    return inFolder && matches;
  });
  const selectedName = selectedFolderId === "all"
    ? isBookMode ? tr("全部书籍", "All books") : tr("全部文献", "All papers")
    : selectedFolderId === "unfiled"
      ? tr("未分类", "Unfiled")
      : folders.find((folder) => folder.id === selectedFolderId)?.name || tr("文件夹", "Folder");

  const submitFolder = () => {
    if (onCreateFolder(folderDraft)) {
      setFolderDraft("");
      setCreatingFolder(false);
    }
  };

  const submitRename = (folderId: string) => {
    if (onRenameFolder(folderId, renameDraft)) {
      setEditingFolderId(null);
      setRenameDraft("");
    }
  };

  const dropDocument = (event: ReactDragEvent, folderId?: string) => {
    event.preventDefault();
    const documentId = event.dataTransfer.getData("application/x-paperloom-document") || draggingDocumentId;
    setDragOverFolderId(null);
    setDraggingDocumentId(null);
    if (documentId) onMoveDocument(documentId, folderId);
  };

  const folderDropProps = (folderId: string, targetFolderId?: string) => ({
    onDragOver: (event: ReactDragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverFolderId(folderId);
    },
    onDragLeave: () => setDragOverFolderId((current) => current === folderId ? null : current),
    onDrop: (event: ReactDragEvent) => dropDocument(event, targetFolderId),
  });

  return (
    <section className="library-overview-page">
      <header className="library-overview-head">
        <div>
          <span className="eyebrow">{isBookMode ? "PERSONAL BOOKSHELF" : "RESEARCH LIBRARY"}</span>
          <h1>{isBookMode ? tr("书库总览", "Bookshelf overview") : tr("文献总览", "Library overview")}</h1>
          <p>{isBookMode ? tr("用虚拟书架整理本地书籍与文章；移动只改变书库分类，不会移动原文件。", "Organize local books and articles with virtual shelves without moving the original files.") : tr("用虚拟文件夹整理本地论文；移动只改变库内分类，不会移动原文件。", "Organize local papers with virtual folders without moving the original files.")}</p>
        </div>
        <div className="library-overview-actions">
          <button className="secondary" onClick={() => setCreatingFolder(true)}><FolderPlus size={15} />{tr("新建文件夹", "New folder")}</button>
          <button className="primary" onClick={onImport}><FileUp size={15} />{isBookMode ? tr("导入书籍", "Import books") : tr("导入论文", "Import papers")}</button>
        </div>
      </header>

      <div className="library-overview-stats">
        <article><Library size={17} /><span>{isBookMode ? tr("全部书籍", "All books") : tr("全部文献", "All papers")}</span><strong>{documents.length}</strong></article>
        <article><Folder size={17} /><span>{isBookMode ? tr("书架", "Shelves") : tr("文件夹", "Folders")}</span><strong>{folders.length}</strong></article>
        <article><Folder size={17} /><span>{tr("未分类", "Unfiled")}</span><strong>{documents.filter((document) => !document.folderId).length}</strong></article>
      </div>

      <div className="library-overview-body">
        <aside className="folder-browser">
          <div className="folder-browser-title"><span>{isBookMode ? tr("书架", "Shelves") : tr("文件夹", "Folders")}</span><small>{folders.length}</small></div>
          <button className={selectedFolderId === "all" ? "active" : ""} onClick={() => onSelectFolder("all")}>
            <LayoutGrid size={15} /><span>{isBookMode ? tr("全部书籍", "All books") : tr("全部文献", "All papers")}</span><small>{documents.length}</small>
          </button>
          <button
            className={`${selectedFolderId === "unfiled" ? "active" : ""} ${dragOverFolderId === "unfiled" ? "drag-over" : ""}`}
            onClick={() => onSelectFolder("unfiled")}
            {...folderDropProps("unfiled")}
          >
            <Folder size={15} /><span>{tr("未分类", "Unfiled")}</span><small>{documents.filter((document) => !document.folderId).length}</small>
          </button>
          <div className="folder-browser-list">
            {folders.map((folder) => (
              <div
                className={`folder-browser-row ${selectedFolderId === folder.id ? "active" : ""} ${dragOverFolderId === folder.id ? "drag-over" : ""}`}
                key={folder.id}
                {...folderDropProps(folder.id, folder.id)}
              >
                {editingFolderId === folder.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); submitRename(folder.id); }}>
                    <input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} autoFocus maxLength={48} />
                    <button type="submit" aria-label={tr("保存名称", "Save name")}><Check size={13} /></button>
                    <button type="button" onClick={() => setEditingFolderId(null)} aria-label={tr("取消重命名", "Cancel rename")}><X size={13} /></button>
                  </form>
                ) : (
                  <>
                    <button className="folder-select" onClick={() => onSelectFolder(folder.id)}>
                      <Folder size={15} /><span>{folder.name}</span><small>{documents.filter((document) => document.folderId === folder.id).length}</small>
                    </button>
                    <button
                      className="folder-rename"
                      onClick={() => { setEditingFolderId(folder.id); setRenameDraft(folder.name); }}
                      aria-label={tr(`重命名 ${folder.name}`, `Rename ${folder.name}`)}
                    ><Pencil size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          {creatingFolder ? (
            <form className="folder-create-form" onSubmit={(event) => { event.preventDefault(); submitFolder(); }}>
              <input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} autoFocus maxLength={48} placeholder={tr("文件夹名称", "Folder name")} />
              <button type="submit" aria-label={tr("创建", "Create")}><Check size={13} /></button>
              <button type="button" onClick={() => { setCreatingFolder(false); setFolderDraft(""); }} aria-label={tr("取消", "Cancel")}><X size={13} /></button>
            </form>
          ) : (
            <button className="folder-create-button" onClick={() => setCreatingFolder(true)}><Plus size={14} />{isBookMode ? tr("添加书架", "Add shelf") : tr("添加文件夹", "Add folder")}</button>
          )}
          {draggingDocumentId && <div className="folder-drop-hint"><MoveRight size={13} />{tr("拖到文件夹即可移动", "Drop on a folder to move")}</div>}
        </aside>

        <div className="library-document-browser">
          <div className="library-document-toolbar">
            <div><h2>{selectedName}</h2><span>{visibleDocuments.length} {isBookMode ? tr("本书籍", "books") : tr("篇文献", "papers")}</span></div>
            <label className="library-overview-search"><Search size={15} /><input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder={tr("搜索标题或文件名", "Search titles or filenames")} /></label>
          </div>
          {visibleDocuments.length ? (
            <div className="library-document-grid">
              {visibleDocuments.map((document) => {
                const folderName = folders.find((folder) => folder.id === document.folderId)?.name || tr("未分类", "Unfiled");
                return (
                  <article
                    className={`library-document-card ${movingDocumentId === document.id ? "moving" : ""} ${draggingDocumentId === document.id ? "dragging" : ""}`}
                    key={document.id}
                    draggable={!movingDocumentId}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-paperloom-document", document.id);
                      setDraggingDocumentId(document.id);
                    }}
                    onDragEnd={() => { setDraggingDocumentId(null); setDragOverFolderId(null); }}
                    onDoubleClick={() => onOpenDocument(document)}
                  >
                    <div className="library-card-top">
                      <span className={`file-badge ${document.type}`}>{fileTypeLabel(document.type)}</span>
                      <GripVertical size={15} />
                    </div>
                    <h3>{document.title}</h3>
                    <p>{document.name}</p>
                    <div className="library-card-meta">
                      <span>{document.pageCount ? `${document.pageCount} ${tr("页", "pages")}` : formatBytes(document.size)}</span>
                      <time dateTime={document.lastReadAt ? new Date(document.lastReadAt).toISOString() : undefined}>{formatLastReadAt(document.lastReadAt, language)}</time>
                    </div>
                    <div className="library-card-folder"><Folder size={13} /><span>{folderName}</span></div>
                    <div className="library-card-actions">
                      <label>
                        <MoveRight size={13} />
                        <select
                          value={document.folderId || ""}
                          onChange={(event) => onMoveDocument(document.id, event.target.value || undefined)}
                          aria-label={tr("移动到文件夹", "Move to folder")}
                        >
                          <option value="">{tr("移动到：未分类", "Move to: Unfiled")}</option>
                          {folders.map((folder) => <option value={folder.id} key={folder.id}>{tr("移动到：", "Move to: ")}{folder.name}</option>)}
                        </select>
                      </label>
                      <button onClick={() => onOpenDocument(document)}>{tr("打开阅读", "Open") }<ChevronRight size={13} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="library-folder-empty">
              <Folder size={28} />
              <strong>{query
                ? isBookMode ? tr("没有匹配的书籍", "No matching books") : tr("没有匹配的文献", "No matching papers")
                : isBookMode ? tr("这个书架还是空的", "This shelf is empty") : tr("这个文件夹还是空的", "This folder is empty")}</strong>
              <span>{isBookMode ? tr("可以从其他卡片的“移动到”菜单选择这里，或直接把书籍卡片拖到左侧书架。", "Use a card’s Move menu or drag a book card onto a shelf on the left.") : tr("可以从其他卡片的“移动到”菜单选择这里，或直接把卡片拖到左侧文件夹。", "Use a card’s Move menu or drag a card onto a folder on the left.")}</span>
              {!documents.length && <button onClick={onImport}><FileUp size={14} />{isBookMode ? tr("导入第一本书", "Import your first book") : tr("导入第一篇论文", "Import your first paper")}</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TableOfContentsTree({
  items,
  onNavigate,
}: {
  items: TableOfContentsItem[];
  onNavigate: (item: TableOfContentsItem) => void;
}) {
  return (
    <nav className="toc-tree" aria-label="Table of contents">
      {items.map((item) => (
        <TableOfContentsEntry item={item} onNavigate={onNavigate} key={item.id} />
      ))}
    </nav>
  );
}

function TableOfContentsEntry({
  item,
  onNavigate,
}: {
  item: TableOfContentsItem;
  onNavigate: (item: TableOfContentsItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = item.children || [];
  const navigable = Boolean(item.page || item.paragraphId);
  return (
    <div className={`toc-entry level-${item.level}`}>
      <div className="toc-entry-row">
        {children.length > 0 ? (
          <button
            type="button"
            className="toc-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Collapse section" : "Expand section"}
          >
            <ChevronDown size={13} className={expanded ? "" : "collapsed"} />
          </button>
        ) : (
          <span className="toc-leaf-dot" />
        )}
        <button
          type="button"
          className="toc-link"
          onClick={() => navigable && onNavigate(item)}
          disabled={!navigable}
          title={navigable ? item.title : undefined}
        >
          <span>{item.title}</span>
          {item.page && <small>P.{item.page}</small>}
        </button>
      </div>
      {expanded && children.length > 0 && (
        <div className="toc-children">
          {children.map((child) => (
            <TableOfContentsEntry item={child} onNavigate={onNavigate} key={child.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
