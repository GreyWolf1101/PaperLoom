export type AppLanguage = "zh-CN" | "en-US";
export type ReadingTheme = "academic" | "books";
export type DocumentType = "pdf" | "docx" | "epub" | "txt" | "md" | "html" | "fb2";
export type PageSpacing = "compact" | "comfortable";
export type TranslationDisplayMode = "side" | "inline";
export type TranslationEngine = "ai" | "dedicated";
export type TranslationProvider = "mymemory" | "baidu" | "youdao" | "deepl" | "microsoft" | "google";
export type TranslationTargetLanguage = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE";
export type InsightPanelMode = "hidden" | "standard" | "custom";
export type AIProvider = "openai" | "deepseek" | "anthropic" | "gemini" | "kimi" | "qwen" | "minimax" | "custom";
export type AINetworkMode = "auto" | "system" | "direct" | "manual";
export type WeeklyReadingGoal = 5 | 10 | 20 | 30 | 60 | 120 | null;
export type AcademicSearchProviderId = "openalex" | "crossref" | "semantic-scholar" | "pubmed";
export type AcademicSearchSort = "relevance" | "newest" | "cited";
export type BookSearchProviderId = "open-library" | "google-books" | "internet-archive" | "project-gutenberg";
export type BookSearchSort = "relevance" | "newest";
export type BookAccessType = "download" | "borrow" | "preview" | "catalog";

export type BookSearchResult = {
  id: string;
  provider: BookSearchProviderId;
  title: string;
  authors: string[];
  year?: number;
  publisher?: string;
  description?: string;
  coverUrl?: string;
  language?: string;
  editionCount?: number;
  pageCount?: number;
  isbn?: string;
  categories?: string[];
  isReadable: boolean;
  accessType?: BookAccessType;
  formats?: string[];
  landingUrl?: string;
  previewUrl?: string;
};

export type BookSearchResponse = {
  provider: BookSearchProviderId;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  results: BookSearchResult[];
};

export type AcademicSearchResult = {
  id: string;
  provider: AcademicSearchProviderId;
  title: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  abstract?: string;
  doi?: string;
  citationCount?: number;
  publicationType?: string;
  isOpenAccess: boolean;
  landingUrl?: string;
  pdfUrl?: string;
};

export type AcademicSearchResponse = {
  provider: AcademicSearchProviderId;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  results: AcademicSearchResult[];
};

export type AppSettings = {
  provider: AIProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  networkMode: AINetworkMode;
  proxyUrl: string;
  language: AppLanguage;
  readingTheme: ReadingTheme;
  defaultZoom: number;
  pageSpacing: PageSpacing;
  translationDisplayMode: TranslationDisplayMode;
  translationEngine: TranslationEngine;
  translationProvider: TranslationProvider;
  translationAppId: string;
  translationApiKey: string;
  translationRegion: string;
  translationEmail: string;
  translationTargetLanguage: TranslationTargetLanguage;
  summaryDisplayMode: TranslationDisplayMode;
  translationFontSize: number;
  allowDuplicateHighlights: boolean;
  insightPanelMode: InsightPanelMode;
  insightPanelWidth: number;
  insightFontSize: number;
  libraryPanelVisible: boolean;
  weeklyReadingGoal: WeeklyReadingGoal;
  autoCheckUpdates: boolean;
};

export type UpdatePhase = "disabled" | "unconfigured" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";

export type UpdateStatus = {
  phase: UpdatePhase;
  supported: boolean;
  configured: boolean;
  portable: boolean;
  currentVersion: string;
  availableVersion?: string;
  downloadMode?: "differential" | "full";
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  checkedAt?: number;
  message: string;
  feedHost?: string;
};

export type Paragraph = {
  id: string;
  text: string;
  kind?: "heading" | "body";
  page?: number;
  fontSize?: number;
  links?: ParagraphLink[];
};

export type ParagraphLink = {
  start: number;
  end: number;
  targetParagraphId: string;
};

export type TableOfContentsItem = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  page?: number;
  paragraphId?: string;
  children?: TableOfContentsItem[];
};

export type TableOfContentsSource = "embedded" | "detected";

export type ResearchDocument = {
  id: string;
  name: string;
  title: string;
  path: string;
  type: DocumentType;
  shelf?: ReadingTheme;
  size: number;
  modifiedAt: number;
  addedAt: number;
  lastReadAt?: number;
  pageCount?: number;
  paragraphs?: Paragraph[];
  binary?: Uint8Array;
  authors?: string;
  venue?: string;
  folderId?: string;
  tableOfContents?: TableOfContentsItem[];
  tableOfContentsSource?: TableOfContentsSource;
};

export type LibraryFolder = {
  id: string;
  name: string;
  createdAt: number;
  shelf?: ReadingTheme;
};

export type RelativeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HighlightItem = {
  id: string;
  docId: string;
  paragraphId: string;
  quote: string;
  color: "yellow" | "mint" | "rose";
  createdAt: number;
  rects?: RelativeRect[];
};

export type InlineNote = {
  id: string;
  docId: string;
  paragraphId: string;
  quote: string;
  kind: "translation" | "summary";
  content: string;
  pending?: boolean;
  rects?: RelativeRect[];
};

export type GalleryCapture = {
  id: string;
  docId: string;
  paragraphId?: string;
  page?: number;
  createdAt: number;
  width: number;
  height: number;
  rects?: RelativeRect[];
};

export type SelectionState = {
  text: string;
  paragraphId: string;
  top: number;
  left: number;
  rects?: RelativeRect[];
  copyOnly?: boolean;
};

export type AnnotationBook = {
  highlights: HighlightItem[];
  notes: InlineNote[];
  captures?: GalleryCapture[];
};

export type AnnotationBooks = Record<string, AnnotationBook>;

export type EvidenceType =
  | "claim"
  | "method"
  | "result"
  | "data"
  | "limitation"
  | "quote"
  | "question"
  | "idea";

export type EvidenceRelation = "neutral" | "support" | "qualify" | "contradict";

export type EvidenceCard = {
  id: string;
  projectId?: string;
  docId: string;
  paragraphId: string;
  page?: number;
  quote: string;
  type: EvidenceType;
  relation: EvidenceRelation;
  note: string;
  tags: string[];
  createdAt: number;
  rects?: RelativeRect[];
};

export type ComparisonField =
  | "question"
  | "method"
  | "sample"
  | "metrics"
  | "findings"
  | "limitations";

export type ComparisonCell = {
  value: string;
  paragraphId?: string;
  page?: number;
  quote?: string;
};

export type ComparisonRow = {
  docId: string;
  cells: Record<ComparisonField, ComparisonCell>;
};

export type ResearchProject = {
  id: string;
  name: string;
  question: string;
  description: string;
  documentIds: string[];
  comparisonRows: ComparisonRow[];
  synthesis: string;
  synthesisUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ResearchWorkspaceState = {
  projects: ResearchProject[];
  evidenceCards: EvidenceCard[];
  activeProjectId?: string;
};

export type ReferenceItem = {
  id: string;
  docId: string;
  label: string;
  raw: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  paragraphId?: string;
  page?: number;
};

export type CitationPaper = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citationCount?: number;
  referenceCount?: number;
  doi?: string;
  url?: string;
};

export type CitationGraph = {
  paper: CitationPaper;
  citations: CitationPaper[];
  references: CitationPaper[];
};

export type SemanticSearchResult = {
  id: string;
  docId: string;
  paragraphId: string;
  page?: number;
  text: string;
  score: number;
  matchedTerms: string[];
};
