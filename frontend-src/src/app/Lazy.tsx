import * as React from "react";

export function withSuspense<T extends React.ComponentType<any>>(Comp: T) {
  const Wrapped = (props: React.ComponentProps<T>) => (
    <React.Suspense
      fallback={
        <div className="glass rounded-2xl border p-6 shadow-soft">
          <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/10" />
          <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-foreground/10" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
        </div>
      }
    >
      <Comp {...props} />
    </React.Suspense>
  );
  return Wrapped;
}
