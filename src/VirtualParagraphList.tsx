import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Paragraph } from "./models";

const PARAGRAPHS_PER_CHUNK = 48;
const VIRTUAL_ROOT_MARGIN = "1800px 0px";

type Props = {
  documentId: string;
  paragraphs: Paragraph[];
  revealParagraphId?: string | null;
  textScale: number;
  renderParagraph: (paragraph: Paragraph) => ReactNode;
};

type ChunkProps = {
  chunk: Paragraph[];
  chunkIndex: number;
  documentId: string;
  forceVisible: boolean;
  textScale: number;
  renderParagraph: (paragraph: Paragraph) => ReactNode;
};

function estimateChunkHeight(chunk: Paragraph[], textScale: number) {
  const scale = Math.max(0.8, Math.min(1.4, textScale));
  const approximateCharactersPerLine = Math.max(30, Math.floor(74 / scale));
  return Math.max(
    96,
    Math.ceil(chunk.reduce((height, paragraph) => {
      if (paragraph.kind === "heading") return height + 57 * scale;
      const lineCount = Math.max(1, Math.ceil(paragraph.text.length / approximateCharactersPerLine));
      return height + 17 * scale + lineCount * 26 * scale;
    }, 0)),
  );
}

const VirtualParagraphChunk = memo(function VirtualParagraphChunk({
  chunk,
  chunkIndex,
  documentId,
  forceVisible,
  textScale,
  renderParagraph,
}: ChunkProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => chunkIndex < 2 || forceVisible);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const estimatedHeight = useMemo(
    () => estimateChunkHeight(chunk, textScale),
    [chunk, textScale],
  );

  useEffect(() => {
    setMeasuredHeight(null);
    setVisible(chunkIndex < 2 || forceVisible);
  }, [documentId, chunkIndex, forceVisible, textScale]);

  useEffect(() => {
    if (forceVisible) setVisible(true);
  }, [forceVisible]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const root = shell.closest(".reader-scroll");
    if (!root) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        } else if (!forceVisible && chunkIndex >= 2) {
          setVisible(false);
        }
      },
      { root, rootMargin: VIRTUAL_ROOT_MARGIN, threshold: 0 },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [chunkIndex, forceVisible]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || !visible) return;
    let frame = window.requestAnimationFrame(() => {
      frame = 0;
      const height = Math.ceil(shell.scrollHeight);
      if (height > 0) setMeasuredHeight(height);
    });
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(shell.scrollHeight);
      if (height > 0) {
        setMeasuredHeight((current) => (
          current !== null && Math.abs(current - height) <= 1 ? current : height
        ));
      }
    });
    observer.observe(shell);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [visible, renderParagraph]);

  return (
    <div
      ref={shellRef}
      className={`paragraph-virtual-chunk ${visible ? "is-rendered" : "is-placeholder"}`}
      data-virtual-paragraph-chunk={chunkIndex}
      style={visible ? undefined : { height: measuredHeight || estimatedHeight }}
    >
      {visible ? chunk.map(renderParagraph) : null}
    </div>
  );
});

export default function VirtualParagraphList({
  documentId,
  paragraphs,
  revealParagraphId,
  textScale,
  renderParagraph,
}: Props) {
  const chunks = useMemo(() => {
    const result: Paragraph[][] = [];
    for (let index = 0; index < paragraphs.length; index += PARAGRAPHS_PER_CHUNK) {
      result.push(paragraphs.slice(index, index + PARAGRAPHS_PER_CHUNK));
    }
    return result;
  }, [paragraphs]);

  const paragraphChunkIndexes = useMemo(() => {
    const indexes = new Map<string, number>();
    paragraphs.forEach((paragraph, index) => {
      indexes.set(paragraph.id, Math.floor(index / PARAGRAPHS_PER_CHUNK));
    });
    return indexes;
  }, [paragraphs]);
  const revealedChunkIndex = revealParagraphId
    ? paragraphChunkIndexes.get(revealParagraphId)
    : undefined;

  return (
    <>
      {chunks.map((chunk, chunkIndex) => (
        <VirtualParagraphChunk
          key={`${documentId}-${chunkIndex}`}
          chunk={chunk}
          chunkIndex={chunkIndex}
          documentId={documentId}
          forceVisible={revealedChunkIndex === chunkIndex}
          textScale={textScale}
          renderParagraph={renderParagraph}
        />
      ))}
    </>
  );
}
