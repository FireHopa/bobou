import * as React from "react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <span className="relative inline-flex h-4 w-4">
        <span className="absolute inset-0 rounded-full border border-foreground/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-foreground/25 border-t-transparent" />
      </span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
