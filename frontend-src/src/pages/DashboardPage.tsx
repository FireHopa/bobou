import * as React from "react";
import { motion } from "framer-motion";
import { Particles } from "@/components/effects/Particles";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useRobotsList, useDeleteRobot } from "@/hooks/useRobots";
import type { RobotOut } from "@/types/api";
import { DashboardToolbar, type DashboardFilter, type DashboardSort } from "@/components/dashboard/DashboardToolbar";
import { RobotCard } from "@/components/dashboard/RobotCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SuggestionsPanel } from "@/components/dashboard/SuggestionsPanel";
import { transitions } from "@/lib/motion";

function applyFilter(robots: RobotOut[], filter: DashboardFilter) {
  if (filter === "all") return robots;

  const now = Date.now();
  if (filter === "recent7") {
    const week = 7 * 24 * 60 * 60 * 1000;
    return robots.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      return Number.isFinite(ts) && now - ts <= week;
    });
  }

  if (filter === "hasAvatar") return robots.filter((r) => Boolean(r.avatar_data));
  if (filter === "noAvatar") return robots.filter((r) => !r.avatar_data);
  return robots;
}

function applySort(robots: RobotOut[], sort: DashboardSort) {
  const arr = [...robots];
  if (sort === "newest") return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  if (sort === "oldest") return arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  if (sort === "az") return arr.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "za") return arr.sort((a, b) => b.title.localeCompare(a.title));
  return arr;
}

function applyQuery(robots: RobotOut[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return robots;
  return robots.filter((r) => {
    const hay = `${r.title} ${r.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-2xl bg-foreground/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-foreground/10" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-foreground/10" />
          </div>
          <div className="mt-4 h-9 w-40 animate-pulse rounded-xl bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError } = useRobotsList();
  const del = useDeleteRobot();

  const robots = data ?? [];

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<DashboardFilter>("all");
  const [sort, setSort] = React.useState<DashboardSort>("newest");

  const shown = React.useMemo(() => {
    const q = applyQuery(robots, query);
    const f = applyFilter(q, filter);
    return applySort(f, sort);
  }, [robots, query, filter, sort]);

  const hasQueryState = Boolean(query.trim()) || filter !== "all";

  const onClear = () => {
    setQuery("");
    setFilter("all");
    setSort("newest");
  };

  const onDelete = (publicId: string) => {
    del.mutate(publicId);
  };

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
      <Particles />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transitions.base} className="space-y-6">
        <Card variant="glass" className="overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-google-blue/60 via-google-green/40 to-google-yellow/40" />
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Dashboard</Badge>
                  <Badge variant="blue">{robots.length} robôs</Badge>
                </div>
                <CardTitle className="mt-2 text-2xl">Seus robôs de autoridade</CardTitle>
                <CardDescription>Explore, refine e teste. Cada robô é um ativo de autoridade.</CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="accent">
                  <Link to="/journey">Criar novo</Link>
                </Button>
</div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <DashboardToolbar
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={setFilter}
              sort={sort}
              onSortChange={setSort}
              total={robots.length}
              shown={shown.length}
              onClear={onClear}
            />

            {isLoading ? (
              <SkeletonGrid />
            ) : isError ? (
              <Card variant="glass" className="p-6">
                <div className="text-sm font-semibold">Falha ao carregar robôs.</div>
                <div className="mt-1 text-xs text-muted-foreground">Verifique o backend em /api/health.</div>
              </Card>
            ) : shown.length === 0 ? (
              <EmptyState hasQuery={hasQueryState} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {shown.map((r) => (
                  <RobotCard
                    key={r.public_id}
                    robot={r}
                    onDelete={onDelete}
                    deleting={del.isPending && del.variables === r.public_id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <SuggestionsPanel robots={robots} />

          <Card variant="glass">
            <CardHeader>
              <CardTitle>Insights rápidos</CardTitle>
              <CardDescription>Pequenos sinais de progresso para manter o ritmo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                <div className="text-xs text-muted-foreground">Robôs criados</div>
                <div className="mt-1 text-2xl font-semibold">{robots.length}</div>
              </div>
              <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                <div className="text-xs text-muted-foreground">Com avatar</div>
                <div className="mt-1 text-2xl font-semibold">{robots.filter((r) => r.avatar_data).length}</div>
              </div>
              <div className="rounded-2xl border bg-background/40 p-4 shadow-soft">
                <div className="text-xs text-muted-foreground">Próxima ação</div>
                <div className="mt-1 text-sm font-semibold">Teste no chat</div>
                <div className="mt-1 text-xs text-muted-foreground">Pergunte algo difícil e refine o prompt.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

export default DashboardPage;
