import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileWarning, Languages, LoaderCircle, Sparkles, X } from "lucide-react";
import {
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  AppLanguage,
  HighlightItem,
  InlineNote,
  PageSpacing,
  ResearchDocument,
  TranslationDisplayMode,
} from "./models";
import MarkdownContent from "./MarkdownContent";
import { areDuplicateRelativeRects, normalizeRelativeRects } from "./annotationGeometry";
import { buildSummarySelectionOutline, mapSummaryOutlineY, summaryOutlinePath } from "./summaryOutline";

type Props = {
  document: ResearchDocument;
  zoom: number;
  pageSpacing: PageSpacing;
  translationDisplayMode: TranslationDisplayMode;
  summaryDisplayMode: TranslationDisplayMode;
  translationFontSize: number;
  language: AppLanguage;
  highlights: HighlightItem[];
  notes: InlineNote[];
  searchTerm: string;
  onMouseUp: () => void;
  onPageChange: (page: number) => void;
  onRemoveNote: (noteId: string) => void;
};

const PDF_CSS_UNITS = 96 / 72;
const PDF_NOTE_GAP = 10;
const PDF_INLINE_CARD_MARGIN = 9;

function noteFontSize(note: InlineNote, cardFontSize: number) {
  return note.kind === "translation" ? cardFontSize : Math.max(13, cardFontSize - 1);
}

function estimateNoteHeight(note: InlineNote, translationFontSize: number) {
  const fontSize = noteFontSize(note, translationFontSize);
  const charsPerLine = Math.max(14, Math.floor(190 / (fontSize * 0.62)));
  const contentLines = Math.max(2, Math.ceil((note.content || "").length / charsPerLine));
  const estimatedHeight = 58 + contentLines * fontSize * 1.55;
  return note.kind === "translation" ? estimatedHeight : Math.min(220, estimatedHeight);
}

function layoutSideNotes(
  notes: InlineNote[],
  pageHeight: number,
  translationFontSize: number,
  resolveTop?: (note: InlineNote) => number,
) {
  let nextTop = 10;
  const items = [...notes]
    .sort((a, b) => (a.rects?.[0]?.y ?? 0.08) - (b.rects?.[0]?.y ?? 0.08))
    .map((note) => {
      const desiredTop = Math.max(
        10,
        resolveTop ? resolveTop(note) : (note.rects?.[0]?.y ?? 0.08) * pageHeight - 8,
      );
      const top = Math.max(desiredTop, nextTop);
      nextTop = top + estimateNoteHeight(note, translationFontSize) + PDF_NOTE_GAP;
      return { note, top };
    });

  return { items, height: Math.max(pageHeight, nextTop) };
}

type PdfInlineInsertion = {
  note: InlineNote;
  anchorY: number;
  cardHeight: number;
  gap: number;
  top: number;
};

type PdfCanvasSlice = {
  startY: number;
  endY: number;
  top: number;
};

function estimateInlineCardHeight(note: InlineNote, pageWidth: number, translationFontSize: number) {
  const fontSize = noteFontSize(note, translationFontSize);
  if (note.pending) return Math.max(86, fontSize * 4.8);
  const charsPerLine = Math.max(22, Math.floor((pageWidth - 96) / (fontSize * 0.58)));
  const contentLines = (note.content || "")
    .split(/\n+/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return Math.max(88, 52 + Math.max(1, contentLines) * fontSize * 1.65);
}

function buildNoteMarkers(notes: InlineNote[], kind: InlineNote["kind"]) {
  const markers: Array<{ rect: ReturnType<typeof normalizeRelativeRects>[number]; noteIds: string[] }> = [];
  notes.filter((note) => note.kind === kind).forEach((note) => {
    normalizeRelativeRects(note.rects).forEach((rect) => {
      const existing = markers.find((marker) => areDuplicateRelativeRects(marker.rect, rect));
      if (!existing) {
        markers.push({ rect, noteIds: [note.id] });
        return;
      }
      existing.rect = normalizeRelativeRects([existing.rect, rect])[0] || existing.rect;
      if (!existing.noteIds.includes(note.id)) existing.noteIds.push(note.id);
    });
  });
  return markers;
}

function buildInlineLayout(
  notes: InlineNote[],
  pageHeight: number,
  pageWidth: number,
  translationFontSize: number,
  measuredHeights: Record<string, number>,
) {
  let accumulatedGap = 0;
  const insertions = [...notes]
    .map((note) => {
      const rectBottom = Math.max(
        0.08,
        ...(note.rects || []).map((rect) => rect.y + rect.height),
      );
      return {
        note,
        anchorY: Math.min(pageHeight - 24, Math.max(24, rectBottom * pageHeight + 2)),
      };
    })
    .sort((left, right) => left.anchorY - right.anchorY)
    .map(({ note, anchorY }) => {
      const cardHeight = measuredHeights[note.id]
        || estimateInlineCardHeight(note, pageWidth, translationFontSize);
      const gap = cardHeight + PDF_INLINE_CARD_MARGIN * 2;
      const insertion: PdfInlineInsertion = {
        note,
        anchorY,
        cardHeight,
        gap,
        top: anchorY + accumulatedGap + PDF_INLINE_CARD_MARGIN,
      };
      accumulatedGap += gap;
      return insertion;
    });

  return { insertions, height: pageHeight + accumulatedGap };
}

function shiftAfterInsertions(originalY: number, insertions: PdfInlineInsertion[]) {
  return insertions.reduce(
    (total, insertion) => total + (originalY >= insertion.anchorY ? insertion.gap : 0),
    0,
  );
}

function buildCanvasSlices(insertions: PdfInlineInsertion[], pageHeight: number) {
  if (!insertions.length) return [];
  const groups = new Map<number, number>();
  insertions.forEach((insertion) => {
    groups.set(insertion.anchorY, (groups.get(insertion.anchorY) || 0) + insertion.gap);
  });

  const slices: PdfCanvasSlice[] = [];
  let startY = 0;
  let accumulatedGap = 0;
  [...groups.entries()].sort((left, right) => left[0] - right[0]).forEach(([anchorY, gap]) => {
    if (anchorY > startY) slices.push({ startY, endY: anchorY, top: startY + accumulatedGap });
    startY = anchorY;
    accumulatedGap += gap;
  });
  if (startY < pageHeight) slices.push({ startY, endY: pageHeight, top: startY + accumulatedGap });
  return slices;
}

export default function PdfDocumentView({
  document,
  zoom,
  pageSpacing,
  translationDisplayMode,
  summaryDisplayMode,
  translationFontSize,
  language,
  highlights,
  notes,
  searchTerm,
  onMouseUp,
  onPageChange,
  onRemoveNote,
}: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let activePdf: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<typeof getDocument> | null = null;

    const load = async () => {
      setPdf(null);
      setError("");
      try {
        let buffer: ArrayBuffer;
        if (document.binary) {
          buffer = document.binary.slice().buffer as ArrayBuffer;
        } else if (document.path && window.paperLoom) {
          buffer = await window.paperLoom.readFile(document.path);
        } else {
          throw new Error(language === "zh-CN" ? "找不到 PDF 原文件" : "The original PDF file is unavailable");
        }
        loadingTask = getDocument({ data: new Uint8Array(buffer) });
        activePdf = await loadingTask.promise;
        if (!disposed) setPdf(activePdf);
      } catch (reason) {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : language === "zh-CN"
                ? "PDF 页面加载失败"
                : "Failed to load PDF pages",
          );
        }
      }
    };

    load();
    return () => {
      disposed = true;
      loadingTask?.destroy().catch(() => undefined);
    };
  }, [document.id, document.modifiedAt, document.path, document.binary, language]);

  useEffect(() => {
    if (!pdf || !viewerRef.current) return;
    const root = viewerRef.current.closest(".reader-scroll");
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const page = visible[0]?.target.getAttribute("data-pdf-page-number");
        if (page) onPageChange(Number(page));
      },
      { root, threshold: [0.2, 0.45, 0.7] },
    );
    viewerRef.current.querySelectorAll("[data-pdf-page-number]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pdf, onPageChange]);

  const pageNumbers = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : []),
    [pdf],
  );
  const highlightsByPage = useMemo(() => {
    const grouped = new Map<number, HighlightItem[]>();
    highlights.forEach((item) => {
      const page = Number(item.paragraphId.match(/^pdf-page-(\d+)$/)?.[1]);
      if (!Number.isFinite(page)) return;
      const items = grouped.get(page);
      if (items) items.push(item);
      else grouped.set(page, [item]);
    });
    return grouped;
  }, [highlights]);
  const notesByPage = useMemo(() => {
    const grouped = new Map<number, InlineNote[]>();
    notes.forEach((item) => {
      const page = Number(item.paragraphId.match(/^pdf-page-(\d+)$/)?.[1]);
      if (!Number.isFinite(page)) return;
      const items = grouped.get(page);
      if (items) items.push(item);
      else grouped.set(page, [item]);
    });
    return grouped;
  }, [notes]);
  const showNoteRail = useMemo(
    () => notes.some((note) => (
      note.kind === "translation"
        ? translationDisplayMode === "side"
        : summaryDisplayMode === "side"
    )),
    [notes, summaryDisplayMode, translationDisplayMode],
  );

  if (error) {
    return (
      <div className="pdf-viewer-state error">
        <FileWarning size={28} />
        <strong>{language === "zh-CN" ? "无法显示 PDF 原始页面" : "Unable to display the original PDF"}</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="pdf-viewer-state">
        <LoaderCircle size={27} className="spin" />
        <strong>{language === "zh-CN" ? "正在载入原始 PDF" : "Loading the original PDF"}</strong>
        <span>{language === "zh-CN" ? "正在准备页面、图片和可选择文字层…" : "Preparing pages, images and selectable text…"}</span>
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      className={`pdf-original-viewer spacing-${pageSpacing}`}
      onMouseUp={onMouseUp}
    >
      {pageNumbers.map((pageNumber) => (
        <PdfPageSlot
          key={pageNumber}
          pdf={pdf}
          pageNumber={pageNumber}
          zoom={zoom}
          language={language}
          translationDisplayMode={translationDisplayMode}
          summaryDisplayMode={summaryDisplayMode}
          translationFontSize={translationFontSize}
          highlights={highlightsByPage.get(pageNumber) || []}
          notes={notesByPage.get(pageNumber) || []}
          showNoteRail={showNoteRail}
          searchTerm={searchTerm}
          onRemoveNote={onRemoveNote}
        />
      ))}
    </div>
  );
}

type PdfPageLayout = {
  width: number;
  height: number;
};

type PageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  language: AppLanguage;
  translationDisplayMode: TranslationDisplayMode;
  summaryDisplayMode: TranslationDisplayMode;
  translationFontSize: number;
  highlights: HighlightItem[];
  notes: InlineNote[];
  showNoteRail: boolean;
  searchTerm: string;
  onRemoveNote: (noteId: string) => void;
  onLayoutChange?: (layout: PdfPageLayout) => void;
};

function PdfPageSlot(props: Omit<PageProps, "onLayoutChange">) {
  const {
    pageNumber,
    zoom,
    showNoteRail,
    language,
  } = props;
  const slotRef = useRef<HTMLDivElement>(null);
  const previousZoomRef = useRef(zoom);
  const [active, setActive] = useState(pageNumber <= 2);
  const [layout, setLayout] = useState<PdfPageLayout>(() => ({
    width: 595 * PDF_CSS_UNITS * (zoom / 100),
    height: 842 * PDF_CSS_UNITS * (zoom / 100),
  }));

  useEffect(() => {
    const previousZoom = Math.max(1, previousZoomRef.current);
    if (previousZoom === zoom) return;
    const ratio = zoom / previousZoom;
    previousZoomRef.current = zoom;
    setLayout((current) => ({
      width: current.width * ratio,
      height: current.height * ratio,
    }));
  }, [zoom]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const root = slot.closest(".reader-scroll");
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { root, rootMargin: "1500px 0px", threshold: 0 },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const handleLayoutChange = useCallback((next: PdfPageLayout) => {
    setLayout((current) => (
      Math.abs(current.width - next.width) <= 1 && Math.abs(current.height - next.height) <= 1
        ? current
        : next
    ));
  }, []);

  return (
    <div
      ref={slotRef}
      className={`pdf-page-slot ${active ? "is-active" : "is-placeholder"}`}
      data-pdf-page-number={pageNumber}
      style={{
        width: layout.width + (showNoteRail ? 234 : 0),
        minHeight: layout.height,
      }}
    >
      {active ? (
        <PdfPage {...props} onLayoutChange={handleLayoutChange} />
      ) : (
        <div
          className="pdf-page-placeholder"
          style={{ width: layout.width, height: layout.height }}
          aria-label={`${language === "zh-CN" ? "第" : "Page"} ${pageNumber} ${language === "zh-CN" ? "页" : ""}`}
        >
          <span>{language === "zh-CN" ? `第 ${pageNumber} 页` : `Page ${pageNumber}`}</span>
        </div>
      )}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  zoom,
  language,
  translationDisplayMode,
  summaryDisplayMode,
  translationFontSize,
  highlights,
  notes,
  showNoteRail,
  searchTerm,
  onRemoveNote,
  onLayoutChange,
}: PageProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliceCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [inRenderRange, setInRenderRange] = useState(pageNumber <= 2);
  const [dimensions, setDimensions] = useState(() => ({
    width: 595 * PDF_CSS_UNITS * (zoom / 100),
    height: 842 * PDF_CSS_UNITS * (zoom / 100),
  }));
  const [rendering, setRendering] = useState(true);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [measuredInlineHeights, setMeasuredInlineHeights] = useState<Record<string, number>>({});
  const inlineNotes = useMemo(
    () => notes.filter((note) => (
      note.kind === "translation"
        ? translationDisplayMode === "inline"
        : summaryDisplayMode === "inline"
    )),
    [notes, summaryDisplayMode, translationDisplayMode],
  );
  const sideNotes = useMemo(
    () => notes.filter((note) => (
      note.kind === "translation"
        ? translationDisplayMode === "side"
        : summaryDisplayMode === "side"
    )),
    [notes, summaryDisplayMode, translationDisplayMode],
  );
  const translationMarkers = useMemo(() => buildNoteMarkers(notes, "translation"), [notes]);
  const summaryOutlines = useMemo(
    () => notes
      .filter((note) => note.kind === "summary")
      .map((note) => ({ noteId: note.id, outline: buildSummarySelectionOutline(note.rects) }))
      .filter((item): item is { noteId: string; outline: NonNullable<typeof item.outline> } => Boolean(item.outline)),
    [notes],
  );
  const inlineLayout = useMemo(
    () => buildInlineLayout(
      inlineNotes,
      dimensions.height,
      dimensions.width,
      translationFontSize,
      measuredInlineHeights,
    ),
    [inlineNotes, dimensions.height, dimensions.width, translationFontSize, measuredInlineHeights],
  );
  const canvasSlices = useMemo(
    () => buildCanvasSlices(inlineLayout.insertions, dimensions.height),
    [inlineLayout.insertions, dimensions.height],
  );
  const summaryOutlineInsertions = useMemo(
    () => inlineLayout.insertions.map((insertion) => ({
      noteId: insertion.note.id,
      anchorY: insertion.anchorY,
      gap: insertion.gap,
    })),
    [inlineLayout.insertions],
  );
  const adjustedPageY = (originalY: number) => originalY + shiftAfterInsertions(originalY, inlineLayout.insertions);
  const sideNoteLayout = useMemo(
    () => layoutSideNotes(
      sideNotes,
      inlineLayout.height,
      translationFontSize,
      (note) => adjustedPageY((note.rects?.[0]?.y ?? 0.08) * dimensions.height) - 8,
    ),
    [sideNotes, inlineLayout, dimensions.height, translationFontSize],
  );

  useEffect(() => {
    onLayoutChange?.({
      width: dimensions.width,
      height: sideNoteLayout.height,
    });
  }, [dimensions.width, onLayoutChange, sideNoteLayout.height]);

  useEffect(() => {
    setMeasuredInlineHeights({});
  }, [inlineNotes, dimensions.width, translationFontSize]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !inRenderRange || !inlineNotes.length) return;
    const observer = new ResizeObserver((entries) => {
      setMeasuredInlineHeights((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const noteId = (entry.target as HTMLElement).dataset.inlineNoteId;
          if (!noteId) return;
          const height = Math.ceil(entry.target.getBoundingClientRect().height);
          if (height > 0 && Math.abs((current[noteId] || 0) - height) > 1) {
            next[noteId] = height;
            changed = true;
          }
        });
        return changed ? next : current;
      });
    });
    surface.querySelectorAll<HTMLElement>(".pdf-inline-note-card").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [inlineNotes, dimensions.width, translationFontSize, inRenderRange]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const root = shell.closest(".reader-scroll");
    const observer = new IntersectionObserver(
      ([entry]) => setInRenderRange(entry.isIntersecting),
      { root, rootMargin: "1100px 0px", threshold: 0 },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inRenderRange) {
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
      if (textLayerRef.current) textLayerRef.current.replaceChildren();
      setRendering(true);
      return;
    }

    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    const render = async () => {
      setRendering(true);
      page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current || !textLayerRef.current) return;
      const scale = PDF_CSS_UNITS * (zoom / 100);
      const viewport = page.getViewport({ scale });
      setDimensions({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is unavailable");

      const textContainer = textLayerRef.current;
      textContainer.replaceChildren();
      textContainer.style.setProperty("--scale-factor", String(viewport.scale));
      textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));
      const textContent = await page.getTextContent();
      if (cancelled) return;
      textLayer = new TextLayer({ textContentSource: textContent, container: textContainer, viewport });

      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await Promise.all([renderTask.promise, textLayer.render()]);
      if (!cancelled) setRendering(false);
    };

    render().catch((reason) => {
      if (!cancelled && reason?.name !== "RenderingCancelledException") setRendering(false);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [pdf, pageNumber, zoom, inRenderRange]);

  useEffect(() => {
    if (rendering || !inRenderRange || !canvasSlices.length) return;
    const source = canvasRef.current;
    if (!source || source.width <= 1 || source.height <= 1) return;

    const frame = window.requestAnimationFrame(() => {
      const scaleX = source.width / dimensions.width;
      const scaleY = source.height / dimensions.height;
      canvasSlices.forEach((slice, index) => {
        const target = sliceCanvasRefs.current[index];
        if (!target) return;
        const sourceY = Math.max(0, Math.round(slice.startY * scaleY));
        const sourceHeight = Math.max(1, Math.round((slice.endY - slice.startY) * scaleY));
        target.width = source.width;
        target.height = sourceHeight;
        target.style.width = `${dimensions.width}px`;
        target.style.height = `${slice.endY - slice.startY}px`;
        const context = target.getContext("2d", { alpha: false });
        if (!context) return;
        context.drawImage(
          source,
          0,
          sourceY,
          source.width,
          Math.min(sourceHeight, source.height - sourceY),
          0,
          0,
          source.width,
          sourceHeight,
        );
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [rendering, inRenderRange, canvasSlices, dimensions.width, dimensions.height]);

  useEffect(() => {
    if (rendering || !textLayerRef.current || !surfaceRef.current) return;
    const spans = Array.from(textLayerRef.current.querySelectorAll<HTMLElement>("span:not(.markedContent)"));
    spans.forEach((span) => {
      if (span.dataset.translationBaseTransform !== undefined) {
        span.style.transform = span.dataset.translationBaseTransform;
        delete span.dataset.translationBaseTransform;
      }
      if (span.dataset.translationBaseTop === undefined) {
        span.dataset.translationBaseTop = span.style.top || `${span.offsetTop}px`;
      }
      span.style.top = span.dataset.translationBaseTop;
    });

    const surfaceTop = surfaceRef.current.getBoundingClientRect().top;
    spans.forEach((span) => {
      const originalTop = span.getBoundingClientRect().top - surfaceTop;
      const shift = shiftAfterInsertions(originalTop, inlineLayout.insertions);
      const baseTop = span.dataset.translationBaseTop || `${span.offsetTop}px`;
      span.style.top = shift > 0 ? `calc(${baseTop} + ${shift}px)` : baseTop;
    });
  }, [rendering, inlineLayout.insertions]);

  useEffect(() => {
    const container = textLayerRef.current;
    if (!container) return;
    const query = searchTerm.trim().toLocaleLowerCase();
    container.querySelectorAll("span").forEach((span) => {
      span.classList.toggle(
        "pdf-search-hit",
        Boolean(query && span.textContent?.toLocaleLowerCase().includes(query)),
      );
    });
  }, [searchTerm, rendering]);

  return (
    <div
      ref={shellRef}
      className={`pdf-page-shell ${showNoteRail ? "has-side-notes" : ""}`}
      style={{ minHeight: sideNoteLayout.height }}
    >
      <div className="pdf-page-column" style={{ width: dimensions.width, height: inlineLayout.height }}>
        <div
          ref={surfaceRef}
          className="pdf-page-surface"
          data-paragraph-id={`pdf-page-${pageNumber}`}
          data-pdf-original-height={dimensions.height}
          data-inline-insertions={JSON.stringify(
            inlineLayout.insertions.map((insertion) => ({ y: insertion.anchorY, gap: insertion.gap })),
          )}
          style={{ width: dimensions.width, height: inlineLayout.height }}
        >
          <canvas
            ref={canvasRef}
            className={inlineLayout.insertions.length ? "pdf-source-canvas sliced" : "pdf-source-canvas"}
            aria-label={`${language === "zh-CN" ? "第" : "Page"} ${pageNumber} ${language === "zh-CN" ? "页" : ""}`}
          />
          {inlineLayout.insertions.length > 0 && (
            <div className="pdf-canvas-slices" aria-hidden="true">
              {canvasSlices.map((slice, index) => (
                <canvas
                  key={`${slice.startY}-${slice.endY}-${slice.top}`}
                  ref={(node) => { sliceCanvasRefs.current[index] = node; }}
                  className="pdf-canvas-slice"
                  style={{ top: slice.top }}
                />
              ))}
            </div>
          )}
          <div ref={textLayerRef} className="textLayer" style={{ height: dimensions.height }} />
          <div className="pdf-highlight-layer" aria-hidden="true">
            {highlights.flatMap((item) =>
              normalizeRelativeRects(item.rects).map((rect, index) => (
                <span
                  key={`${item.id}-${index}`}
                  className={`pdf-highlight-rect ${item.color}`}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: adjustedPageY(rect.y * dimensions.height),
                    width: `${rect.width * 100}%`,
                    height: rect.height * dimensions.height,
                  }}
                />
              )),
            )}
          </div>
          <div className="pdf-translation-marker-layer" aria-hidden="true">
            {translationMarkers.map(({ rect, noteIds }, index) => (
              <span
                key={`${noteIds.join("-")}-translation-marker-${index}`}
                className={`pdf-translation-marker ${activeNoteId && noteIds.includes(activeNoteId) ? "active" : ""}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: adjustedPageY(Math.min(0.998, rect.y + rect.height) * dimensions.height),
                  width: `${rect.width * 100}%`,
                }}
              />
            ))}
          </div>
          <svg
            className="pdf-summary-marker-layer"
            aria-hidden="true"
            width={dimensions.width}
            height={inlineLayout.height}
            viewBox={`0 0 ${dimensions.width} ${inlineLayout.height}`}
            preserveAspectRatio="none"
          >
            {summaryOutlines.map(({ noteId, outline }) => (
              <path
                key={`${noteId}-summary-outline`}
                className={`pdf-summary-marker ${outline.kind} ${activeNoteId === noteId ? "active" : ""}`}
                d={summaryOutlinePath(
                  outline,
                  (x) => x * dimensions.width,
                  (y) => mapSummaryOutlineY(
                    y * dimensions.height,
                    summaryOutlineInsertions,
                    noteId,
                  ),
                )}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {inlineLayout.insertions.map((insertion) => {
            const inset = Math.max(20, dimensions.width * 0.045);
            const note = insertion.note;
            return (
              <section
                className={`pdf-inline-note-card ${note.kind} ${activeNoteId === note.id ? "active" : ""}`}
                key={note.id}
                data-inline-note-id={note.id}
                style={{
                  top: insertion.top,
                  left: inset,
                  width: dimensions.width - inset * 2,
                  "--translation-font-size": `${translationFontSize}px`,
                } as React.CSSProperties}
                aria-label={note.kind === "translation"
                  ? language === "zh-CN" ? "原文下方翻译" : "Inline translation"
                  : language === "zh-CN" ? "原文下方总结" : "Inline passage summary"}
                onMouseUp={(event) => event.stopPropagation()}
                onMouseEnter={() => setActiveNoteId(note.id)}
                onMouseLeave={() => setActiveNoteId(null)}
                onFocus={() => setActiveNoteId(note.id)}
                onBlur={() => setActiveNoteId(null)}
              >
                <div className="pdf-inline-note-head">
                  <span>
                    {note.kind === "translation" ? <Languages size={13} /> : <Sparkles size={13} />}
                    {note.kind === "translation"
                      ? language === "zh-CN" ? "选段翻译" : "Translation"
                      : language === "zh-CN" ? "选段总结" : "Passage summary"}
                  </span>
                  <button onClick={() => onRemoveNote(note.id)} aria-label={language === "zh-CN" ? "删除卡片" : "Remove card"}>
                    <X size={13} />
                  </button>
                </div>
                <div className={`pdf-inline-note-content ${note.pending ? "note-pending" : ""}`}>
                  {note.pending && <LoaderCircle size={13} className="spin" />}
                  {!note.pending && <MarkdownContent content={note.content} compact />}
                </div>
              </section>
            );
          })}
          {rendering && inRenderRange && (
            <div className="pdf-page-loading"><LoaderCircle size={20} className="spin" /></div>
          )}
        </div>
        <div className="pdf-page-number">
          {language === "zh-CN" ? `第 ${pageNumber} 页` : `Page ${pageNumber}`}
        </div>
      </div>
      {showNoteRail && (
        <aside
          className="pdf-note-rail"
          style={{ minHeight: sideNoteLayout.height }}
          aria-label={language === "zh-CN" ? `第 ${pageNumber} 页批注` : `Annotations for page ${pageNumber}`}
        >
          {sideNoteLayout.items.map(({ note, top }) => (
            <div
              className={`pdf-side-note ${note.kind} ${activeNoteId === note.id ? "active" : ""}`}
              key={note.id}
              style={{
                top,
                "--translation-font-size": `${translationFontSize}px`,
              } as React.CSSProperties}
              onMouseEnter={() => setActiveNoteId(note.id)}
              onMouseLeave={() => setActiveNoteId(null)}
              onFocus={() => setActiveNoteId(note.id)}
              onBlur={() => setActiveNoteId(null)}
            >
              <div className="pdf-inline-note-head">
                <span>
                  {note.kind === "translation" ? <Languages size={13} /> : <Sparkles size={13} />}
                  {note.kind === "translation"
                    ? language === "zh-CN" ? "段落翻译" : "Translation"
                    : language === "zh-CN" ? "段落总结" : "Passage summary"}
                </span>
                <button onClick={() => onRemoveNote(note.id)} aria-label={language === "zh-CN" ? "删除卡片" : "Remove card"}>
                  <X size={13} />
                </button>
              </div>
              <div className={note.pending ? "note-pending" : ""}>
                {note.pending && <LoaderCircle size={13} className="spin" />}
                {!note.pending && <MarkdownContent content={note.content} compact />}
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}
