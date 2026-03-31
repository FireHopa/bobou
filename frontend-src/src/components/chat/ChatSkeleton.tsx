export function ChatSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}>
          <div className="glass w-[75%] rounded-2xl border p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/10" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-foreground/10" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
