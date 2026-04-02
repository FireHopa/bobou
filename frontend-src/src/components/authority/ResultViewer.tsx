import React, { useMemo } from "react";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  Star,
  Quote,
  Film,
  Sparkles,
  Clock3,
  Captions,
  Repeat2,
  AlignLeft,
  ListVideo,
  Search,
  MessageSquareQuote,
  Tag,
  MapPin,
  Globe,
} from "lucide-react";

type Props = {
  title?: string;
  text: string;
  agentKey?: string;
};

type ScriptJson = {
  titulo_da_tela?: string;
  analise_do_tema?: string;
  estrategia_do_video?: string;
  video_format_selected?: string;
  video_format_recommended?: string;
  video_format_rationale?: string;
  hooks?: string[];
  roteiro_segundo_a_segundo?: Array<{
    tempo?: string;
    acao?: string;
    fala?: string;
  }>;
  texto_na_tela?: string[];
  variacoes?: string[];
  legenda?: string;
};

export default function ResultViewer({ title = "Resultado", text, agentKey }: Props) {
  const isGoogleBusiness = agentKey === "google_business_profile";
  const isSiteAgent = agentKey === "site";
  const headerVariant = isGoogleBusiness
    ? {
        icon: <MapPin className="h-7 w-7" />,
        iconWrapperClass: "bg-google-blue/10 text-google-blue",
        topBarClass: "bg-gradient-to-r from-google-blue/70 via-emerald-400/50 to-amber-300/60",
        headerClass: "relative bg-gradient-to-br from-google-blue/10 via-transparent to-emerald-400/10 border-b border-border/50 p-8 sm:p-12",
      }
    : isSiteAgent
      ? {
          icon: <Globe className="h-7 w-7" />,
          iconWrapperClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          topBarClass: "bg-gradient-to-r from-amber-400/70 via-orange-300/50 to-yellow-200/60",
          headerClass: "relative bg-gradient-to-br from-amber-500/10 via-transparent to-orange-400/10 border-b border-border/50 p-8 sm:p-12",
        }
      : {
          icon: <Film className="h-7 w-7" />,
          iconWrapperClass: "bg-google-blue/10 text-google-blue",
          topBarClass: "bg-gradient-to-r from-transparent via-google-blue/40 to-transparent",
          headerClass: "relative bg-gradient-to-b from-muted/50 to-transparent border-b border-border/50 p-8 sm:p-12",
        };

  const scriptHeaderBadge = isGoogleBusiness
    ? "Perfil de Empresa Google"
    : isSiteAgent
      ? "Agente Site"
      : "Roteiro estruturado";
  const blockHeaderBadge = isGoogleBusiness
    ? "Perfil de Empresa Google"
    : isSiteAgent
      ? "Arquitetura de conteúdo para site"
      : "Entrega estruturada";

  const parsed = useMemo(() => {
    try {
      return JSON.parse(text || "{}");
    } catch {
      return null;
    }
  }, [text]);

  const parsedScript = useMemo<ScriptJson | null>(() => {
    if (!parsed || typeof parsed !== "object") return null;

    const hasScriptShape =
      "analise_do_tema" in parsed ||
      "estrategia_do_video" in parsed ||
      "hooks" in parsed ||
      "roteiro_segundo_a_segundo" in parsed ||
      "texto_na_tela" in parsed ||
      "variacoes" in parsed ||
      "legenda" in parsed;

    if (!hasScriptShape) return null;
    return parsed as ScriptJson;
  }, [parsed]);

  const parsedBlocks = useMemo(() => {
    if (!parsed || typeof parsed !== "object") return null;
    if (Array.isArray((parsed as any).blocos)) return parsed as any;
    return null;
  }, [parsed]);

  const legacyBlocks = useMemo(() => {
    if (parsedScript || parsedBlocks) return [];
    return parseBlocks(text || "");
  }, [text, parsedScript, parsedBlocks]);

  if (parsedScript) {
    return (
      <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="rounded-[2.5rem] border border-border bg-card/80 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className={headerVariant.headerClass}>
            <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
            <div className="flex items-start gap-4">
              <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                {headerVariant.icon}
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-google-blue/80">
                  {scriptHeaderBadge}
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight max-w-4xl">
                  {parsedScript.titulo_da_tela || title}
                </h2>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10 space-y-8">
            <ScriptSection
              icon={<Sparkles className="h-5 w-5" />}
              number="1"
              title="Análise do tema"
            >
              <RichText text={parsedScript.analise_do_tema || "não informado"} />
            </ScriptSection>

            <ScriptSection
              icon={<Film className="h-5 w-5" />}
              number="2"
              title="Estratégia do vídeo"
            >
              <RichText text={parsedScript.estrategia_do_video || "não informado"} />
            </ScriptSection>

            <ScriptSection
              icon={<ListVideo className="h-5 w-5" />}
              number="3"
              title="Formato do vídeo"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-200/70 bg-blue-50/70 dark:bg-[#16202a] dark:border-blue-900/50 p-5">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Formato escolhido</div>
                  <p className="text-base font-medium leading-relaxed text-blue-950/90 dark:text-blue-100/90">{parsedScript.video_format_selected || "não informado"}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 dark:bg-[#162a20] dark:border-emerald-900/50 p-5">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Melhor formato indicado</div>
                  <p className="text-base font-medium leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">{parsedScript.video_format_recommended || "não informado"}</p>
                  {parsedScript.video_format_rationale ? <p className="mt-3 text-sm leading-relaxed text-emerald-950/80 dark:text-emerald-100/80">{parsedScript.video_format_rationale}</p> : null}
                </div>
              </div>
            </ScriptSection>

            <ScriptSection
              icon={<Lightbulb className="h-5 w-5" />}
              number="4"
              title="Hooks"
            >
              {Array.isArray(parsedScript.hooks) && parsedScript.hooks.length > 0 ? (
                <div className="grid gap-4">
                  {parsedScript.hooks.map((hook, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-amber-200/70 bg-amber-50/70 dark:bg-[#2a2416] dark:border-amber-900/50 p-5"
                    >
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                        Hook {idx + 1}
                      </div>
                      <p className="text-base sm:text-lg font-medium text-amber-950/90 dark:text-amber-100/90 leading-relaxed">
                        {hook}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </ScriptSection>

            <ScriptSection
              icon={<Clock3 className="h-5 w-5" />}
              number="5"
              title="Roteiro segundo a segundo"
            >
              {Array.isArray(parsedScript.roteiro_segundo_a_segundo) &&
              parsedScript.roteiro_segundo_a_segundo.length > 0 ? (
                <div className="relative pl-2 sm:pl-4">
                  <div className="relative border-l-[3px] border-muted/60 space-y-6 py-2">
                    {parsedScript.roteiro_segundo_a_segundo.map((item, idx) => (
                      <div key={idx} className="relative pl-8 sm:pl-10">
                        <div className="absolute -left-[11px] top-5 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-google-blue ring-4 ring-background shadow-sm" />
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-5 sm:p-6 shadow-sm">
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-google-blue/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-google-blue">
                              {item?.tempo || `Trecho ${idx + 1}`}
                            </span>
                          </div>

                          {item?.acao && (
                            <div className="mb-4">
                              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                Ação
                              </p>
                              <p className="text-base leading-relaxed text-foreground/90">
                                {item.acao}
                              </p>
                            </div>
                          )}

                          {item?.fala && (
                            <div>
                              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                Fala
                              </p>
                              <div className="rounded-xl bg-muted/40 border border-border/60 p-4">
                                <p className="text-base sm:text-lg leading-relaxed text-foreground font-medium">
                                  {item.fala}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState />
              )}
            </ScriptSection>

            <ScriptSection
              icon={<Captions className="h-5 w-5" />}
              number="6"
              title="Texto na tela"
            >
              {Array.isArray(parsedScript.texto_na_tela) && parsedScript.texto_na_tela.length > 0 ? (
                <div className="grid gap-3">
                  {parsedScript.texto_na_tela.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-blue-200/70 bg-blue-50/70 dark:bg-[#16202a] dark:border-blue-900/50 p-4"
                    >
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                        Tela {idx + 1}
                      </div>
                      <p className="text-base font-medium leading-relaxed text-blue-950/90 dark:text-blue-100/90">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </ScriptSection>

            <ScriptSection
              icon={<Repeat2 className="h-5 w-5" />}
              number="7"
              title="Variações"
            >
              {Array.isArray(parsedScript.variacoes) && parsedScript.variacoes.length > 0 ? (
                <div className="grid gap-4">
                  {parsedScript.variacoes.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 dark:bg-[#162a20] dark:border-emerald-900/50 p-5"
                    >
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                        Variação {idx + 1}
                      </div>
                      <p className="text-base leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </ScriptSection>

            <ScriptSection
              icon={<AlignLeft className="h-5 w-5" />}
              number="8"
              title="Legenda"
            >
              <div className="rounded-3xl border border-border/70 bg-background/60 p-5 sm:p-6">
                <RichText text={parsedScript.legenda || "não informado"} />
              </div>
            </ScriptSection>
          </div>
        </div>
      </section>
    );
  }

  if (parsedBlocks) {
    return (
      <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="rounded-[2.5rem] border border-border bg-card/80 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className={headerVariant.headerClass}>
            <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
            <div className="flex items-start gap-4">
              <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                {headerVariant.icon}
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-google-blue/80">
                  {blockHeaderBadge}
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight max-w-4xl">
                  {parsedBlocks.titulo_da_tela || title}
                </h2>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-12 space-y-12">
            {parsedBlocks.blocos.map((bloco: any, idx: number) => (
              <React.Fragment key={idx}>{renderJsonBlock(bloco, idx)}</React.Fragment>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card shadow-sm">
        <div className="p-6 sm:p-8">
          {legacyBlocks.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem conteúdo.</div>
          ) : (
            <div className="prose prose-zinc dark:prose-invert max-w-none text-foreground/80 leading-relaxed">
              {legacyBlocks.map((b, idx) => renderLegacyBlock(b, idx))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ScriptSection({
  number,
  title,
  icon,
  children,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/50 p-5 sm:p-7 shadow-sm">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Etapa {number}
          </p>
          <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            {title}
          </h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text || ""), [text]);

  if (!blocks.length) {
    return <EmptyState />;
  }

  return (
    <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-google-blue/70">
      {blocks.map((b, i) => renderLegacyBlock(b, i))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
      Sem conteúdo.
    </div>
  );
}

// ============================================================================
// FUNÇÕES DE RENDERIZAÇÃO DOS BLOCOS JSON
// ============================================================================

function renderJsonBlock(bloco: any, key: number) {
  const { tipo, conteudo } = bloco;

  switch (tipo) {
    case "highlight": {
      let Icon = Lightbulb;
      let containerClass = "bg-amber-50 border-amber-200 dark:bg-[#2a2416] dark:border-amber-900/60";
      let iconWrapper = "bg-amber-200/50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400";
      let titleClass = "text-amber-900 dark:text-amber-300";
      let textClass = "text-amber-950/90 dark:text-amber-100/90";

      if (conteudo.icone === "alert") {
        Icon = AlertTriangle;
        containerClass = "bg-red-50 border-red-200 dark:bg-[#2a1616] dark:border-red-900/60";
        iconWrapper = "bg-red-200/50 dark:bg-red-500/20 text-red-600 dark:text-red-400";
        titleClass = "text-red-900 dark:text-red-300";
        textClass = "text-red-950/90 dark:text-red-100/90";
      } else if (conteudo.icone === "check") {
        Icon = CheckCircle;
        containerClass = "bg-emerald-50 border-emerald-200 dark:bg-[#162a20] dark:border-emerald-900/60";
        iconWrapper = "bg-emerald-200/50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
        titleClass = "text-emerald-900 dark:text-emerald-300";
        textClass = "text-emerald-950/90 dark:text-emerald-100/90";
      } else if (conteudo.icone === "star") {
        Icon = Star;
        containerClass = "bg-blue-50 border-blue-200 dark:bg-[#16202a] dark:border-blue-900/60";
        iconWrapper = "bg-blue-200/50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400";
        titleClass = "text-blue-900 dark:text-blue-300";
        textClass = "text-blue-950/90 dark:text-blue-100/90";
      }

      return (
        <div
          key={key}
          className={`my-8 rounded-3xl border ${containerClass} p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start gap-5 transition-all`}
        >
          <div className={`shrink-0 p-3.5 rounded-full ${iconWrapper}`}>
            <Icon className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <div className="pt-1">
            {conteudo.titulo && (
              <h4 className={`font-extrabold text-xl mb-2 tracking-tight ${titleClass}`}>
                {conteudo.titulo}
              </h4>
            )}
            <p className={`text-base sm:text-lg leading-relaxed font-medium ${textClass}`}>
              {conteudo.texto}
            </p>
          </div>
        </div>
      );
    }

    case "timeline": {
      if (!conteudo.passos || !Array.isArray(conteudo.passos)) return null;
      return (
        <div key={key} className="my-10 pl-2 sm:pl-4">
          <div className="relative border-l-[3px] border-muted/60 space-y-8 py-2">
            {conteudo.passos.map((passo: string, i: number) => (
              <div key={i} className="relative pl-10 group">
                <div className="absolute -left-[11px] top-4 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-google-blue ring-4 ring-background transition-all group-hover:scale-125 group-hover:border-google-blue shadow-sm" />
                <div
                  className="bg-card hover:bg-muted/30 border border-border/60 hover:border-google-blue/30 rounded-2xl p-6 shadow-sm transition-all text-base leading-relaxed text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: inlineFormat(passo) }}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "quote": {
      return (
        <div
          key={key}
          className="relative my-10 bg-card border border-border/60 rounded-[2rem] p-8 sm:p-12 overflow-hidden shadow-sm group"
        >
          <Quote className="absolute -top-6 -left-6 h-40 w-40 text-muted/30 -rotate-12 transition-transform group-hover:rotate-0 duration-700 ease-out" />

          <div className="relative z-10 pl-4 sm:pl-8">
            <p className="font-serif text-2xl sm:text-3xl italic leading-relaxed text-foreground/90">
              "{conteudo.texto}"
            </p>
            {conteudo.autor && (
              <div className="mt-8 flex items-center gap-4">
                <div className="h-px w-12 bg-google-blue/50" />
                <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
                  {conteudo.autor}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    case "faq": {
      if (!conteudo.perguntas || !Array.isArray(conteudo.perguntas)) return null;
      return (
        <div key={key} className="my-10 space-y-8">
          {conteudo.perguntas.map((q: any, i: number) => (
            <div key={i} className="group relative pl-8">
              <div className="absolute left-0 top-1 bottom-0 w-1 bg-gradient-to-b from-google-blue/40 to-transparent rounded-full opacity-40 group-hover:opacity-100 transition-opacity" />

              <h4 className="font-bold text-xl text-foreground tracking-tight flex items-start gap-3 mb-3">
                <span className="text-google-blue shrink-0 mt-0.5">Q.</span>
                {q.pergunta}
              </h4>
              <p
                className="text-lg text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: inlineFormat(q.resposta) }}
              />
            </div>
          ))}
        </div>
      );
    }

    case "keyword_list": {
      if (!conteudo.items || !Array.isArray(conteudo.items)) return null;
      return (
        <section key={key} className="my-10 rounded-[2rem] border border-border/70 bg-background/50 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Lista técnica</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{conteudo.titulo || "Palavras-chave"}</h3>
              {conteudo.limite_por_item ? (
                <p className="mt-1 text-sm text-muted-foreground">Limite por item: {conteudo.limite_por_item}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {conteudo.items.map((item: string, idx: number) => (
              <div key={idx} className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">
                  <Tag className="h-3.5 w-3.5" />
                  Palavra-chave {idx + 1}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      if (!conteudo.items || !Array.isArray(conteudo.items)) return null;
      return (
        <section key={key} className="my-10 rounded-[2rem] border border-border/70 bg-background/50 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <ListVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Catálogo técnico</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{conteudo.titulo || "Serviços e descrições"}</h3>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {conteudo.items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome}</h4>
                  <span className="shrink-0 rounded-full bg-google-blue/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue">Serviço</span>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Descrição curta</p>
                  <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao}</p>
                </div>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Palavras-chave relacionadas</p>
                    <div className="flex flex-wrap gap-2">
                      {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                        <span key={keywordIdx} className="rounded-full border border-google-blue/20 bg-google-blue/5 px-3 py-1.5 text-xs font-medium text-foreground/85">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "response_variations": {
      if (!conteudo.items || !Array.isArray(conteudo.items)) return null;
      return (
        <section key={key} className="my-10 rounded-[2rem] border border-border/70 bg-background/50 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Respostas prontas</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{conteudo.titulo || "Sugestões de resposta"}</h3>
            </div>
          </div>
          <div className="grid gap-4">
            {conteudo.items.map((item: string, idx: number) => (
              <div key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">Resposta {idx + 1}</div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "comparison_table": {
      if (!conteudo.items || !Array.isArray(conteudo.items)) return null;
      return (
        <section key={key} className="my-10 rounded-[2rem] border border-border/70 bg-background/50 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Comparativo visual</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{conteudo.titulo || "Comparativo"}</h3>
            </div>
          </div>

          <div className="grid gap-4">
            {conteudo.items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.criterio || `Critério ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-google-blue/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue">
                    Critério {idx + 1}
                  </span>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 dark:bg-[#162a20] dark:border-emerald-900/50 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                      Nossa solução
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">
                      {item.nossa_solucao || "não informado"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 dark:bg-[#2a2416] dark:border-amber-900/50 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                      Mercado / alternativa
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-amber-950/90 dark:text-amber-100/90">
                      {item.mercado || "não informado"}
                    </p>
                  </div>
                </div>

                {item.recomendacao ? (
                  <div className="mt-4 rounded-2xl border border-google-blue/20 bg-google-blue/5 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">
                      Leitura de decisão
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.recomendacao}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "markdown":
    default: {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <div
          key={key}
          className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-google-blue/70"
        >
          {mBlocks.map((b, i) => renderLegacyBlock(b, i))}
        </div>
      );
    }
  }
}

// ============================================================================
// CÓDIGO LEGADO DO MARKDOWN
// ============================================================================

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string };

function parseBlocks(input: string): Block[] {
  const s = (input || "").replace(/\r\n/g, "\n").trim();
  if (!s) return [];

  const lines = s.split("\n");
  const out: Block[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    const t = paragraph.join(" ").trim();
    if (t) out.push({ kind: "p", text: t });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length) out.push({ kind: "ul", items: listItems });
    listItems = [];
  };

  const flushCode = () => {
    const t = codeLines.join("\n").replace(/^\n+|\n+$/g, "");
    if (t) out.push({ kind: "code", text: t });
    codeLines = [];
  };

  for (const raw of lines) {
    const line = raw ?? "";

    if (line.trim().startsWith("```")) {
      if (!inCode) {
        flushParagraph();
        flushList();
        inCode = true;
      } else {
        flushCode();
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const h = parseHeading(line);
    if (h) {
      flushParagraph();
      flushList();
      out.push(h);
      continue;
    }

    const li = parseListItem(line);
    if (li) {
      flushParagraph();
      listItems.push(li);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();

  return out;
}

function parseHeading(line: string): Block | null {
  const t = line.trim();
  if (!t) return null;
  if (t.startsWith("### ")) return { kind: "h3", text: t.slice(4).trim() };
  if (t.startsWith("## ")) return { kind: "h2", text: t.slice(3).trim() };
  if (t.startsWith("# ")) return { kind: "h1", text: t.slice(2).trim() };
  return null;
}

function parseListItem(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  const m = t.match(/^[-•]\s+(.*)$/);
  if (!m) return null;
  return m[1].trim();
}

function renderLegacyBlock(block: Block, key: number) {
  switch (block.kind) {
    case "h1":
      return (
        <h1 key={key} className="mb-4 text-3xl font-extrabold tracking-tight text-foreground">
          {block.text}
        </h1>
      );
    case "h2":
      return (
        <h2 key={key} className="mb-3 mt-8 text-2xl font-bold tracking-tight text-foreground">
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 key={key} className="mb-3 mt-6 text-xl font-bold tracking-tight text-foreground">
          {block.text}
        </h3>
      );
    case "ul":
      return (
        <ul key={key} className="my-4 space-y-2 pl-5 list-disc">
          {block.items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          ))}
        </ul>
      );
    case "code":
      return (
        <pre
          key={key}
          className="my-4 overflow-x-auto rounded-2xl border border-border bg-muted/60 p-4 text-sm leading-relaxed text-foreground"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "p":
    default:
      return (
        <p
          key={key}
          className="my-4 text-base sm:text-lg leading-relaxed text-foreground/85"
          dangerouslySetInnerHTML={{ __html: inlineFormat(block.text) }}
        />
      );
  }
}

function inlineFormat(text: string) {
  return escapeHtml(text || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}