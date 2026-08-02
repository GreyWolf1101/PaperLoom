interface PaperLoomSettings {
  provider: "openai" | "deepseek" | "anthropic" | "gemini" | "kimi" | "qwen" | "minimax" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
  networkMode: "auto" | "system" | "direct" | "manual";
  proxyUrl: string;
  language: "zh-CN" | "en-US";
  readingTheme: "academic" | "books";
  defaultZoom: number;
  pageSpacing: "compact" | "comfortable";
  translationDisplayMode: "side" | "inline";
  translationEngine: "ai" | "dedicated";
  translationProvider: "mymemory" | "baidu" | "youdao" | "deepl" | "microsoft" | "google";
  translationAppId: string;
  translationApiKey: string;
  translationRegion: string;
  translationEmail: string;
  translationTargetLanguage: "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "fr-FR" | "de-DE";
  summaryDisplayMode: "side" | "inline";
  translationFontSize: number;
  allowDuplicateHighlights: boolean;
  insightPanelMode: "hidden" | "standard" | "custom";
  insightPanelWidth: number;
  insightFontSize: number;
  libraryPanelVisible: boolean;
  weeklyReadingGoal: 5 | 10 | 20 | 30 | 60 | 120 | null;
  autoCheckUpdates: boolean;
}

interface UpdateStatusPayload {
  phase: "disabled" | "unconfigured" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";
  supported: boolean;
  configured: boolean;
  portable: boolean;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  checkedAt?: number;
  message: string;
  feedHost?: string;
}

interface OpenDocumentResult {
  path: string;
  name: string;
  type: "pdf" | "docx" | "epub" | "txt" | "md" | "html" | "fb2";
  size: number;
  modifiedAt: number;
}

interface AcademicSearchRequest {
  provider: "openalex" | "crossref" | "semantic-scholar" | "pubmed";
  query: string;
  page?: number;
  sort?: "relevance" | "newest" | "cited";
  yearFrom?: number;
  openAccessOnly?: boolean;
  language?: "zh-CN" | "en-US";
}

interface AcademicSearchResultPayload {
  id: string;
  provider: AcademicSearchRequest["provider"];
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
}

interface AcademicSearchResponsePayload {
  provider: AcademicSearchRequest["provider"];
  query: string;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  results: AcademicSearchResultPayload[];
}

interface BookSearchRequest {
  provider: "open-library" | "google-books" | "internet-archive" | "project-gutenberg";
  query: string;
  page?: number;
  sort?: "relevance" | "newest";
  language?: "zh-CN" | "en-US";
}

interface BookSearchResultPayload {
  id: string;
  provider: BookSearchRequest["provider"];
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
  accessType?: "download" | "borrow" | "preview" | "catalog";
  formats?: string[];
  landingUrl?: string;
  previewUrl?: string;
}

interface BookSearchResponsePayload {
  provider: BookSearchRequest["provider"];
  query: string;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  results: BookSearchResultPayload[];
}

interface GalleryCaptureResult {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

interface ResearchReferencePayload {
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
}

interface ResearchCitationPaperPayload {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citationCount?: number;
  referenceCount?: number;
  doi?: string;
  url?: string;
}

interface ResearchCitationGraphPayload {
  paper: ResearchCitationPaperPayload;
  citations: ResearchCitationPaperPayload[];
  references: ResearchCitationPaperPayload[];
}

interface Window {
  paperLoom?: {
    openDocuments: (readingTheme?: PaperLoomSettings["readingTheme"]) => Promise<OpenDocumentResult[]>;
    readFile: (path: string) => Promise<ArrayBuffer>;
    getSettings: () => Promise<PaperLoomSettings>;
    saveSettings: (settings: PaperLoomSettings) => Promise<PaperLoomSettings>;
    getUpdateStatus: () => Promise<UpdateStatusPayload>;
    checkForUpdates: () => Promise<UpdateStatusPayload>;
    downloadUpdate: () => Promise<UpdateStatusPayload>;
    installUpdate: () => Promise<UpdateStatusPayload>;
    onUpdateStatus: (callback: (status: UpdateStatusPayload) => void) => () => void;
    testAI: (payload: {
      provider: PaperLoomSettings["provider"];
      baseUrl: string;
      model: string;
      apiKey: string;
      networkMode: PaperLoomSettings["networkMode"];
      proxyUrl: string;
    }) => Promise<{
      ok: boolean;
      connected: boolean;
      status?: number;
      message: string;
    }>;
    completeAI: (payload: {
      system: string;
      user: string;
      temperature?: number;
      json?: boolean;
      provider?: PaperLoomSettings["provider"];
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      networkMode?: PaperLoomSettings["networkMode"];
      proxyUrl?: string;
    }) => Promise<string>;
    testTranslation: (payload: {
      translationProvider: PaperLoomSettings["translationProvider"];
      translationAppId: string;
      translationApiKey: string;
      translationRegion: string;
      translationEmail: string;
      translationTargetLanguage: PaperLoomSettings["translationTargetLanguage"];
      networkMode: PaperLoomSettings["networkMode"];
      proxyUrl: string;
    }) => Promise<{
      ok: boolean;
      connected: boolean;
      status?: number;
      message: string;
    }>;
    translateText: (payload: { text: string }) => Promise<string>;
    searchAcademic: (payload: AcademicSearchRequest) => Promise<AcademicSearchResponsePayload>;
    searchBooks: (payload: BookSearchRequest) => Promise<BookSearchResponsePayload>;
    resolveReference: (payload: { doi?: string; query?: string }) => Promise<ResearchReferencePayload>;
    getCitationGraph: (payload: { doi?: string; title?: string }) => Promise<ResearchCitationGraphPayload>;
    saveResearchIndex: (payload: {
      documentId: string;
      modifiedAt: number;
      paragraphs: Array<{
        id: string;
        text: string;
        kind?: "heading" | "body";
        page?: number;
        fontSize?: number;
        links?: Array<{ start: number; end: number; targetParagraphId: string }>;
      }>;
    }) => Promise<{ documentId: string; paragraphs: number }>;
    readResearchIndexes: (payload: {
      documents: Array<{ id: string; modifiedAt: number }>;
    }) => Promise<Record<string, Array<{
      id: string;
      text: string;
      kind?: "heading" | "body";
      page?: number;
      fontSize?: number;
      links?: Array<{ start: number; end: number; targetParagraphId: string }>;
    }>>>;
    deleteResearchIndex: (documentId: string) => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
    openScholarlyResult: (url: string) => Promise<boolean>;
    captureGalleryRegion: (payload: {
      documentId: string;
      rect: { x: number; y: number; width: number; height: number };
    }) => Promise<GalleryCaptureResult>;
    readGalleryCapture: (payload: { documentId: string; captureId: string }) => Promise<string>;
    deleteGalleryCapture: (payload: { documentId: string; captureId: string }) => Promise<boolean>;
    deleteGalleryDocument: (documentId: string) => Promise<boolean>;
    exportMarkdown: (payload: { suggestedName: string; content: string }) => Promise<boolean>;
    onMenuOpenDocuments: (callback: () => void) => () => void;
    onMenuExportNotes: (callback: () => void) => () => void;
    platform: string;
  };
}

declare module "*?url" {
  const src: string;
  export default src;
}
