import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("markdown text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mt-4 text-lg font-semibold" {...p} />,
          h2: (p) => <h2 className="mt-4 text-base font-semibold" {...p} />,
          h3: (p) => <h3 className="mt-3 text-sm font-semibold" {...p} />,
          p: (p) => <p className="mt-2 whitespace-pre-wrap" {...p} />,
          ul: (p) => <ul className="mt-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="mt-2 list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          code: (p: any) => {
            const { inline, className, children, ...props } = p;
            return inline ? (
              <code className="rounded-md border bg-background/40 px-1 py-0.5 font-mono text-[12px]" {...props}>
                {children}
              </code>
            ) : (
              <pre className="mt-3 overflow-x-auto rounded-2xl border bg-background/40 p-3 shadow-soft">
                <code className={cn("font-mono text-[12px]", className)} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
