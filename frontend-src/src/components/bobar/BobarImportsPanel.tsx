
import * as React from "react";
import {
  AlignLeft,
  ArrowDown,
  Captions,
  Clock3,
  Columns3,
  Film,
  Lightbulb,
  Repeat2,
  Sparkles,
} from "lucide-react";

import { AUTHORITY_AGENTS, authorityAgentByKey } from "@/constants/authorityAgents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BobarCard } from "@/services/bobar";
import {
  buildImportedFlowchart,
  extractAuthorityAgentKey,
  parseImportedScriptPayload,
} from "@/lib/bobarImported";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function SectionCard({
  icon,
  title,
  children,
  emptyMessage = "Sem conteúdo nesta seção.",
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  emptyMessage?: string;
}) {
  const hasContent = React.Children.count(children) > 0;

  return (
    <Card variant="glass" className="rounded-[1.8rem] border-white/10 bg-[#06101f]">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
            {icon}
          </div>
          <CardTitle className="text-xl font-bold text-white">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hasContent ? (
          <div className="space-y-3">{children}</div>
        ) : (
          <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-white/45">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TextBlock({ value }: { value?: string }) {
  const text = String(value || "").trim();
  if (!text) return null;

  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-white/75 whitespace-pre-wrap">
      {text}
    </div>
  );
}

function BulletList({
  items,
  itemLabel,
}: {
  items: string[];
  itemLabel: string;
}) {
  if (!items.length) return null;

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${itemLabel}-${index}`}
          className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-4"
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
            {itemLabel} {index + 1}
          </div>
          <div className="text-sm leading-7 text-white/75 whitespace-pre-wrap">{item}</div>
        </div>
      ))}
    </div>
  );
}

function ImportedFlowchart({ card }: { card: BobarCard }) {
  const script = React.useMemo(
    () => parseImportedScriptPayload(card.content_text, card.title),
    [card.content_text, card.title],
  );
  const flow = React.useMemo(() => buildImportedFlowchart(script), [script]);

  if (!flow.nodes.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-white/45">
        Esse roteiro não trouxe etapas suficientes para montar o fluxograma.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {flow.nodes.map((node, index) => (
        <React.Fragment key={node.id}>
          <div className="rounded-[1.5rem] border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                {node.time || `Trecho ${index + 1}`}
              </Badge>
            </div>
            <div className="space-y-3">
              {script.roteiro_segundo_a_segundo[index]?.acao ? (
                <div className="rounded-[1.2rem] border border-white/10 bg-[#091426] px-4 py-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Ação
                  </div>
                  <div className="text-sm leading-7 text-white/75 whitespace-pre-wrap">
                    {script.roteiro_segundo_a_segundo[index]?.acao}
                  </div>
                </div>
              ) : null}
              {script.roteiro_segundo_a_segundo[index]?.fala ? (
                <div className="rounded-[1.2rem] border border-white/10 bg-[#091426] px-4 py-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Fala
                  </div>
                  <div className="text-sm leading-7 text-white/80 whitespace-pre-wrap">
                    {script.roteiro_segundo_a_segundo[index]?.fala}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {index < flow.nodes.length - 1 ? (
            <div className="flex justify-center py-1 text-cyan-200/70">
              <ArrowDown className="h-5 w-5" />
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export function BobarImportsPanel({
  cards,
  selectedCardId,
  onSelectCard,
}: {
  cards: BobarCard[];
  selectedCardId: number | null;
  onSelectCard: (cardId: number) => void;
}) {
  const sortedCards = React.useMemo(
    () =>
      [...cards].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [cards],
  );

  const selectedCard = React.useMemo(
    () => sortedCards.find((card) => card.id === selectedCardId) || sortedCards[0] || null,
    [selectedCardId, sortedCards],
  );

  const selectedScript = React.useMemo(
    () =>
      selectedCard
        ? parseImportedScriptPayload(selectedCard.content_text, selectedCard.title)
        : null,
    [selectedCard],
  );

  const selectedAgent = React.useMemo(() => {
    const key = extractAuthorityAgentKey(selectedCard?.source_kind);
    return authorityAgentByKey(key);
  }, [selectedCard?.source_kind]);

  if (!sortedCards.length) {
    return (
      <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
        <CardContent className="py-14">
          <div className="mx-auto max-w-2xl rounded-[1.8rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="mt-4 text-xl font-bold text-white">Nenhum roteiro importado ainda</div>
            <div className="mt-2 text-sm leading-7 text-white/55">
              Quando alguém clicar em “Mandar pro Bobar”, o roteiro vai aparecer aqui com o agente,
              a capa resumida e a estrutura pronta para produção.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const AgentIcon = selectedAgent?.Icon || AUTHORITY_AGENTS[0]?.Icon;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
            Importados
          </div>
          <CardTitle className="text-3xl font-black text-white">
            Escolha um roteiro importado
          </CardTitle>
          <CardDescription className="text-white/55">
            Aqui ficam o agente de origem, a foto dele e o título de tela para a pessoa entrar e
            produzir o conteúdo sem ficar perdida.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedCards.map((card) => {
            const script = parseImportedScriptPayload(card.content_text, card.title);
            const agent = authorityAgentByKey(extractAuthorityAgentKey(card.source_kind));
            const Icon = agent?.Icon || AUTHORITY_AGENTS[0]?.Icon;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectCard(card.id)}
                className={cn(
                  "w-full rounded-[1.7rem] border p-4 text-left transition",
                  selectedCard?.id === card.id
                    ? "border-cyan-400/40 bg-cyan-400/10 ring-2 ring-cyan-400/20"
                    : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-cyan-400/10 text-cyan-100">
                    {Icon ? <Icon className="h-10 w-10" /> : <Sparkles className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                        Importado
                      </Badge>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                        {formatDate(card.updated_at)}
                      </span>
                    </div>
                    <div className="truncate text-sm font-semibold text-cyan-100">
                      {card.source_label || agent?.name || "Agente"}
                    </div>
                    <div className="mt-1 break-words text-base font-bold leading-6 text-white">
                      {script.titulo_da_tela || card.title}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selectedCard && selectedScript ? (
        <div className="space-y-6">
          <Card variant="glass" className="rounded-[2.2rem] border-cyan-400/10 bg-[#040914]">
            <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] bg-cyan-400/10 text-cyan-100">
                  {AgentIcon ? <AgentIcon className="h-11 w-11" /> : <Sparkles className="h-6 w-6" />}
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Importado do agente
                  </div>
                  <CardTitle className="mt-2 text-3xl font-black text-white">
                    {selectedScript.titulo_da_tela || selectedCard.title}
                  </CardTitle>
                  <CardDescription className="mt-2 text-base leading-7 text-white/60">
                    {selectedCard.source_label || selectedAgent?.name || "Agente"} · atualizado em{" "}
                    {formatDate(selectedCard.updated_at)}
                  </CardDescription>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  3 colunas organizadas
                </Badge>
                <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  {selectedScript.roteiro_segundo_a_segundo.length} etapas
                </Badge>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-3">
            <div className="space-y-6">
              <Card variant="glass" className="rounded-[2rem] border-cyan-400/10 bg-[#040914]">
                <CardHeader>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Coluna 1
                  </div>
                  <CardTitle className="text-2xl font-black text-white">
                    Base estratégica
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    Análise do tema, estratégia do vídeo e formato do vídeo.
                  </CardDescription>
                </CardHeader>
              </Card>

              <SectionCard icon={<Sparkles className="h-5 w-5" />} title="Análise do tema">
                <TextBlock value={selectedScript.analise_do_tema} />
              </SectionCard>

              <SectionCard icon={<Film className="h-5 w-5" />} title="Estratégia do vídeo">
                <TextBlock value={selectedScript.estrategia_do_video} />
              </SectionCard>

              <SectionCard icon={<Columns3 className="h-5 w-5" />} title="Formato do vídeo">
                <TextBlock value={selectedScript.formato_do_video} />
              </SectionCard>
            </div>

            <div className="space-y-6">
              <Card variant="glass" className="rounded-[2rem] border-cyan-400/10 bg-[#040914]">
                <CardHeader>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Coluna 2
                  </div>
                  <CardTitle className="text-2xl font-black text-white">
                    Gancho e execução
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    Hooks, roteiro segundo a segundo e variações.
                  </CardDescription>
                </CardHeader>
              </Card>

              <SectionCard icon={<Lightbulb className="h-5 w-5" />} title="Hooks">
                <BulletList items={selectedScript.hooks} itemLabel="Hook" />
              </SectionCard>

              <SectionCard icon={<Clock3 className="h-5 w-5" />} title="Roteiro segundo a segundo">
                <ImportedFlowchart card={selectedCard} />
              </SectionCard>

              <SectionCard icon={<Repeat2 className="h-5 w-5" />} title="Variações">
                <BulletList items={selectedScript.variacoes} itemLabel="Variação" />
              </SectionCard>
            </div>

            <div className="space-y-6">
              <Card variant="glass" className="rounded-[2rem] border-cyan-400/10 bg-[#040914]">
                <CardHeader>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Coluna 3
                  </div>
                  <CardTitle className="text-2xl font-black text-white">
                    Apoio de publicação
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    Texto na tela e legenda final para produção.
                  </CardDescription>
                </CardHeader>
              </Card>

              <SectionCard icon={<Captions className="h-5 w-5" />} title="Texto na tela">
                <BulletList items={selectedScript.texto_na_tela} itemLabel="Tela" />
              </SectionCard>

              <SectionCard icon={<AlignLeft className="h-5 w-5" />} title="Legenda">
                <TextBlock value={selectedScript.legenda} />
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
