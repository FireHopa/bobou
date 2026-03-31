import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DashboardFilter = "all" | "recent7" | "hasAvatar" | "noAvatar";
export type DashboardSort = "newest" | "oldest" | "az" | "za";

export function DashboardToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  total,
  shown,
  onClear,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filter: DashboardFilter;
  onFilterChange: (v: DashboardFilter) => void;
  sort: DashboardSort;
  onSortChange: (v: DashboardSort) => void;
  total: number;
  shown: number;
  onClear: () => void;
}) {
  const filters: Array<{ id: DashboardFilter; label: string; tone: "blue" | "green" | "yellow" | "red" }> = [
    { id: "all", label: "Todos", tone: "blue" },
    { id: "recent7", label: "Últimos 7 dias", tone: "green" },
    { id: "hasAvatar", label: "Com avatar", tone: "yellow" },
    { id: "noAvatar", label: "Sem avatar", tone: "red" },
  ];

  const sortLabel: Record<DashboardSort, string> = {
    newest: "Mais recentes",
    oldest: "Mais antigos",
    az: "A → Z",
    za: "Z → A",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por nome, nicho, descrição…"
            aria-label="Buscar robôs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glass" onClick={onClear} disabled={!query && filter === "all" && sort === "newest"}>
            Limpar
          </Button>

          <Button
            variant="outline"
            onClick={() => onSortChange(sort === "newest" ? "oldest" : "newest")}
            title="Alternar ordenação"
          >
            {sortLabel[sort]}
          </Button>

          <Badge variant="secondary" className="ml-1">
            {shown}/{total}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              "hover:bg-[rgba(0,200,232,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              filter === f.id ? "bg-[rgba(0,200,232,0.08)]" : "bg-background/40"
            )}
            onClick={() => onFilterChange(f.id)}
            aria-pressed={filter === f.id}
          >
            <Badge variant={f.tone} className="mr-2">
              ●
            </Badge>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
