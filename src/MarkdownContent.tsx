import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  compact?: boolean;
  className?: string;
};

export default function MarkdownContent({ content, compact = false, className = "" }: Props) {
  const classes = ["markdown-content", compact ? "compact" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content.trim()}
      </ReactMarkdown>
    </div>
  );
}
