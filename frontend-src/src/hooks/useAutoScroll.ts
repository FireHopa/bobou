import * as React from "react";

export function useAutoScroll<T extends HTMLElement>() {
  const containerRef = React.useRef<T | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = React.useState(true);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 40;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsPinned(atBottom);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  return { containerRef, endRef, isPinned, scrollToBottom };
}
