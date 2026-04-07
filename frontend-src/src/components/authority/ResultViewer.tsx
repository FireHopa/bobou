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
  Building2,
  FileText,
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
  youtube_video_type?: string;
  youtube_goal?: string;
};

type HeaderVariant = {
  icon: React.ReactNode;
  iconWrapperClass: string;
  topBarClass: string;
  headerClass: string;
};

type SocialProofInsights = {
  summary: string;
  quoteText: string;
  quoteAuthor: string;
  readyAssetCount: number;
  signalCount: number;
  sectionCount: number;
};

type GoogleBusinessInsights = {
  summary: string;
  primaryAssetTitle: string;
  primaryAssetText: string;
  readyAssetCount: number;
  localSignalCount: number;
  faqCount: number;
  sectionCount: number;
};

type ExternalMentionsInsights = {
  summary: string;
  primaryAssetTitle: string;
  primaryAssetText: string;
  readyAssetCount: number;
  citationSignalCount: number;
  faqCount: number;
  sectionCount: number;
};

type CrossPlatformConsistencyInsights = {
  summary: string;
  primaryAssetTitle: string;
  primaryAssetText: string;
  alignmentRuleCount: number;
  channelCount: number;
  faqCount: number;
  sectionCount: number;
};

type YouTubeInsights = {
  summary: string;
  primaryAssetTitle: string;
  primaryAssetText: string;
  readyAssetCount: number;
  seoSignalCount: number;
  timelineCount: number;
  sectionCount: number;
};

type LinkedInInsights = {
  summary: string;
  primaryAssetTitle: string;
  primaryAssetText: string;
  readyAssetCount: number;
  perspectiveCount: number;
  faqCount: number;
  sectionCount: number;
};

export default function ResultViewer({ title = "Resultado", text, agentKey }: Props) {
  const isGoogleBusiness = agentKey === "google_business_profile";
  const isYouTube = agentKey === "youtube";
  const isSiteAgent = agentKey === "site";
  const isSocialProof = agentKey === "social_proof";
  const isLinkedIn = agentKey === "linkedin";
  const isCrossPlatformConsistency = agentKey === "cross_platform_consistency";
  const isExternalMentions = agentKey === "external_mentions";

  const headerVariant: HeaderVariant = isGoogleBusiness
    ? {
        icon: <MapPin className="h-7 w-7" />,
        iconWrapperClass: "bg-google-blue/10 text-google-blue",
        topBarClass: "bg-gradient-to-r from-google-blue/70 via-emerald-400/50 to-amber-300/60",
        headerClass: "relative bg-gradient-to-br from-google-blue/10 via-transparent to-emerald-400/10 border-b border-border/50 p-8 sm:p-12",
      }
    : isYouTube
      ? {
          icon: <Film className="h-7 w-7" />,
          iconWrapperClass: "bg-red-500/10 text-red-700 dark:text-red-300",
          topBarClass: "bg-gradient-to-r from-red-500/80 via-orange-400/50 to-amber-300/60",
          headerClass: "relative bg-gradient-to-br from-red-500/10 via-transparent to-orange-400/10 border-b border-border/50 p-8 sm:p-12",
        }
    : isCrossPlatformConsistency
      ? {
          icon: <Repeat2 className="h-7 w-7" />,
          iconWrapperClass: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
          topBarClass: "bg-gradient-to-r from-violet-500/80 via-fuchsia-400/50 to-sky-300/60",
          headerClass: "relative bg-gradient-to-br from-violet-500/10 via-transparent to-sky-400/10 border-b border-border/50 p-8 sm:p-12",
        }
      : isExternalMentions
        ? {
            icon: <Building2 className="h-7 w-7" />,
            iconWrapperClass: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
            topBarClass: "bg-gradient-to-r from-slate-500/80 via-sky-400/50 to-indigo-300/60",
            headerClass: "relative bg-gradient-to-br from-slate-500/10 via-transparent to-sky-400/10 border-b border-border/50 p-8 sm:p-12",
          }
      : isLinkedIn
        ? {
            icon: <AlignLeft className="h-7 w-7" />,
            iconWrapperClass: "bg-blue-600/10 text-blue-700 dark:text-blue-300",
            topBarClass: "bg-gradient-to-r from-blue-700/80 via-sky-500/50 to-cyan-300/60",
            headerClass: "relative bg-gradient-to-br from-blue-600/10 via-transparent to-cyan-400/10 border-b border-border/50 p-8 sm:p-12",
          }
      : isSiteAgent
        ? {
            icon: <Globe className="h-7 w-7" />,
            iconWrapperClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
            topBarClass: "bg-gradient-to-r from-amber-400/70 via-orange-300/50 to-yellow-200/60",
            headerClass: "relative bg-gradient-to-br from-amber-500/10 via-transparent to-orange-400/10 border-b border-border/50 p-8 sm:p-12",
          }
        : isSocialProof
          ? {
              icon: <Star className="h-7 w-7" />,
              iconWrapperClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              topBarClass: "bg-gradient-to-r from-amber-400/80 via-orange-300/60 to-rose-300/60",
              headerClass: "relative bg-gradient-to-br from-amber-500/10 via-transparent to-rose-400/10 border-b border-border/50 p-8 sm:p-12",
            }
          : {
              icon: <Film className="h-7 w-7" />,
              iconWrapperClass: "bg-google-blue/10 text-google-blue",
              topBarClass: "bg-gradient-to-r from-transparent via-google-blue/40 to-transparent",
              headerClass: "relative bg-gradient-to-b from-muted/50 to-transparent border-b border-border/50 p-8 sm:p-12",
            };

  const scriptHeaderBadge = isGoogleBusiness
    ? "Perfil de Empresa Google"
    : isYouTube
      ? "YouTube estratégico"
      : isExternalMentions
        ? "Menções externas e press kit"
        : isLinkedIn
          ? "LinkedIn e autoridade profissional"
          : isSiteAgent
          ? "Agente Site"
          : isSocialProof
            ? "Prova social estruturada"
            : "Roteiro estruturado";
  const blockHeaderBadge = isGoogleBusiness
    ? "Perfil de Empresa Google"
    : isYouTube
      ? "YouTube e autoridade editorial"
      : isExternalMentions
        ? "Menções externas e reputação editorial"
        : isLinkedIn
          ? "LinkedIn, reputação e leitura executiva"
          : isSiteAgent
          ? "Arquitetura de conteúdo para site"
          : isSocialProof
            ? "Prova social e reputação"
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

  const socialProofInsights = useMemo(
    () => extractSocialProofInsights(parsedBlocks),
    [parsedBlocks],
  );

const googleBusinessInsights = useMemo(
  () => extractGoogleBusinessInsights(parsedBlocks),
  [parsedBlocks],
);

  const youTubeInsights = useMemo(
    () => extractYouTubeInsights(parsedBlocks),
    [parsedBlocks],
  );

  const externalMentionsInsights = useMemo(
    () => extractExternalMentionsInsights(parsedBlocks),
    [parsedBlocks],
  );

  const linkedInInsights = useMemo(
    () => extractLinkedInInsights(parsedBlocks),
    [parsedBlocks],
  );

  const crossPlatformConsistencyInsights = useMemo(
    () => extractCrossPlatformConsistencyInsights(parsedBlocks),
    [parsedBlocks],
  );

  const legacyBlocks = useMemo(() => {
    if (parsedScript || parsedBlocks) return [];
    return parseBlocks(text || "");
  }, [text, parsedScript, parsedBlocks]);

  if (parsedScript) {
    if (isYouTube) {
      return (
        <YouTubeScriptResult
          title={title}
          parsedScript={parsedScript}
          headerVariant={headerVariant}
          badge={scriptHeaderBadge}
        />
      );
    }

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
    if (isYouTube) {
      return (
        <YouTubeResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={youTubeInsights}
        />
      );
    }

    if (isGoogleBusiness) {
      return (
        <GoogleBusinessResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={googleBusinessInsights}
        />
      );
    }

    if (isSocialProof) {
      return (
        <SocialProofResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={socialProofInsights}
        />
      );
    }

    if (isCrossPlatformConsistency) {
      return (
        <CrossPlatformConsistencyResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={crossPlatformConsistencyInsights}
        />
      );
    }

    if (isExternalMentions) {
      return (
        <ExternalMentionsResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={externalMentionsInsights}
        />
      );
    }

    if (isLinkedIn) {
      return (
        <LinkedInResult
          title={title}
          parsedBlocks={parsedBlocks}
          headerVariant={headerVariant}
          badge={blockHeaderBadge}
          insights={linkedInInsights}
        />
      );
    }

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




function YouTubeScriptResult({
  title,
  parsedScript,
  headerVariant,
  badge,
}: {
  title: string;
  parsedScript: ScriptJson;
  headerVariant: HeaderVariant;
  badge: string;
}) {
  const timeline = Array.isArray(parsedScript.roteiro_segundo_a_segundo)
    ? parsedScript.roteiro_segundo_a_segundo
    : [];
  const hooks = Array.isArray(parsedScript.hooks) ? parsedScript.hooks : [];
  const screenItems = Array.isArray(parsedScript.texto_na_tela) ? parsedScript.texto_na_tela : [];
  const variations = Array.isArray(parsedScript.variacoes) ? parsedScript.variacoes : [];

  const primaryHook = hooks[0] || "";
  const youtubeVideoType = parsedScript.youtube_video_type || parsedScript.video_format_selected || "não informado";
  const youtubeGoal = parsedScript.youtube_goal || "não informado";

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-red-700/80 dark:text-red-300/80">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight max-w-4xl">
                    {parsedScript.titulo_da_tela || title}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {parsedScript.analise_do_tema || "Roteiro estruturado para YouTube com foco em retenção, profundidade e continuidade editorial."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <YouTubeMetric label="Tipo de vídeo" value={youtubeVideoType} helper="arquitetura escolhida" />
              <YouTubeMetric label="Objetivo" value={youtubeGoal} helper="intenção principal" />
              <YouTubeMetric label="Segmentos" value={String(timeline.length || 0)} helper="blocos do roteiro" />
            </div>
          </div>

          {primaryHook ? (
            <div className="mt-8 rounded-[2rem] border border-red-300/40 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-red-700 dark:text-red-300">
                <Lightbulb className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Hook principal em destaque</span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                {primaryHook}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
                <Film className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Estratégia editorial</p>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Estrutura do vídeo</h3>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-red-200/60 bg-red-50/70 dark:bg-[#2a1616] dark:border-red-900/50 p-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Tipo escolhido</div>
                <p className="text-base sm:text-lg font-medium leading-relaxed text-red-950/90 dark:text-red-100/90">{youtubeVideoType}</p>
              </div>
              <div className="rounded-[1.5rem] border border-amber-200/60 bg-amber-50/70 dark:bg-[#2a2416] dark:border-amber-900/50 p-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Leitura de construção</div>
                <RichText text={parsedScript.estrategia_do_video || "não informado"} />
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Aberturas</p>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Hooks para segurar a atenção</h3>
              </div>
            </div>

            {hooks.length ? (
              <div className="grid gap-4">
                {hooks.map((hook, idx) => (
                  <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Hook {idx + 1}</div>
                    <p className="text-base sm:text-lg leading-relaxed font-medium text-foreground/90">{hook}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </section>

          <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Roteiro</p>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Arquitetura do vídeo</h3>
              </div>
            </div>

            {timeline.length ? (
              <div className="relative pl-2 sm:pl-4">
                <div className="relative border-l-[3px] border-muted/60 space-y-6 py-2">
                  {timeline.map((item, idx) => (
                    <div key={idx} className="relative pl-8 sm:pl-10">
                      <div className="absolute -left-[11px] top-5 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-red-500 ring-4 ring-background shadow-sm" />
                      <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 sm:p-6 shadow-sm">
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">
                            {item?.tempo || `Trecho ${idx + 1}`}
                          </span>
                        </div>

                        {item?.acao ? (
                          <div className="mb-4">
                            <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Função do trecho</p>
                            <p className="text-base leading-relaxed text-foreground/90">{item.acao}</p>
                          </div>
                        ) : null}

                        {item?.fala ? (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Fala</p>
                            <div className="rounded-xl bg-muted/40 border border-border/60 p-4">
                              <p className="text-base sm:text-lg leading-relaxed text-foreground font-medium">{item.fala}</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
                  <Captions className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Apoio visual</p>
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Texto na tela</h3>
                </div>
              </div>

              {screenItems.length ? (
                <div className="grid gap-3">
                  {screenItems.map((item, idx) => (
                    <div key={idx} className="rounded-[1.25rem] border border-blue-200/70 bg-blue-50/70 dark:bg-[#16202a] dark:border-blue-900/50 p-4">
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Tela {idx + 1}</div>
                      <p className="text-base font-medium leading-relaxed text-blue-950/90 dark:text-blue-100/90">{item}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </section>

            <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <Repeat2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Desdobramentos</p>
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Variações</h3>
                </div>
              </div>

              {variations.length ? (
                <div className="grid gap-4">
                  {variations.map((item, idx) => (
                    <article key={idx} className="rounded-[1.5rem] border border-emerald-200/70 bg-emerald-50/70 dark:bg-[#162a20] dark:border-emerald-900/50 p-5">
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Variação {idx + 1}</div>
                      <p className="text-base leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">{item}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </section>
          </div>

          <section className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
                <AlignLeft className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Empacotamento final</p>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Legenda / descrição curta</h3>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 sm:p-6">
              <RichText text={parsedScript.legenda || "não informado"} />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function YouTubeMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function YouTubeResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: YouTubeInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-red-700/80 dark:text-red-300/80">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material estruturado para fortalecer o canal, o empacotamento do vídeo e a leitura editorial do YouTube."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <YouTubeMetric label="Ativos prontos" value={String(insights.readyAssetCount)} helper="títulos, descrições e blocos" />
              <YouTubeMetric label="Sinais SEO/AEO" value={String(insights.seoSignalCount)} helper="termos e eixos úteis" />
              <YouTubeMetric label="Ritmo / sequência" value={String(insights.timelineCount)} helper="etapas e continuidade" />
            </div>
          </div>

          {insights.primaryAssetText ? (
            <div className="mt-8 rounded-[2rem] border border-red-300/30 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-red-700 dark:text-red-300">
                <Search className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                  {insights.primaryAssetTitle || "Ativo principal em destaque"}
                </span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                {insights.primaryAssetText}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderYouTubeBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function extractYouTubeInsights(parsedBlocks: any): YouTubeInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let primaryAssetTitle = "";
  let primaryAssetText = "";
  let readyAssetCount = 0;
  let seoSignalCount = 0;
  let timelineCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!primaryAssetText && tipo === "highlight" && typeof conteudo.texto === "string") {
      primaryAssetTitle = String(conteudo.titulo || "").trim();
      primaryAssetText = conteudo.texto.trim();
    }

    if (!primaryAssetText && tipo === "response_variations" && Array.isArray(conteudo.items) && conteudo.items[0]) {
      primaryAssetTitle = String(conteudo.titulo || "Primeiro ativo pronto").trim();
      primaryAssetText = String(conteudo.items[0]).trim();
    }

    if (tipo === "response_variations" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      seoSignalCount += conteudo.items.length;
    }

    if (tipo === "timeline" && Array.isArray(conteudo.passos)) {
      timelineCount += conteudo.passos.length;
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      timelineCount += conteudo.perguntas.length;
    }
  }

  return {
    summary,
    primaryAssetTitle,
    primaryAssetText,
    readyAssetCount,
    seoSignalCount,
    timelineCount,
    sectionCount: blocks.length,
  };
}

function renderYouTubeBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura editorial</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Contexto do canal ou do vídeo"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-red-500/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "response_variations": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ativos prontos</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Variações prontas"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item: string, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">
                  {youTubeVariationLabel(conteudo.titulo, idx)}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <ListVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Blocos de canal / vídeo</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Estrutura aplicada"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Bloco ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">
                    Item {idx + 1}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao || "não informado"}</p>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                      <span key={keywordIdx} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/80">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sinais SEO / AEO</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Termos e marcadores"}
              </h3>
              {conteudo.limite_por_item ? <p className="mt-1 text-sm text-muted-foreground">{conteudo.limite_por_item}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {items.map((item: string, idx: number) => (
              <span key={idx} className="rounded-full border border-red-300/30 bg-red-500/5 px-4 py-2 text-sm font-medium text-foreground/90">
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const steps = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!steps.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Progressão</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Ritmo recomendado"}
              </h3>
            </div>
          </div>

          <div className="relative pl-2 sm:pl-4">
            <div className="relative border-l-[3px] border-muted/60 space-y-6 py-2">
              {steps.map((item: any, idx: number) => {
                const text = typeof item === "string" ? item : item?.descricao || item?.texto || item?.titulo || `Passo ${idx + 1}`;
                const title = typeof item === "string" ? `Passo ${idx + 1}` : item?.titulo || `Passo ${idx + 1}`;
                return (
                  <div key={idx} className="relative pl-8 sm:pl-10">
                    <div className="absolute -left-[11px] top-5 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-red-500 ring-4 ring-background shadow-sm" />
                    <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 sm:p-6 shadow-sm">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 dark:text-red-300">{title}</div>
                      <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    case "faq": {
      const questions = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!questions.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Checagens do canal</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Perguntas importantes"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4">
            {questions.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Pergunta {idx + 1}</div>
                <h4 className="text-lg font-bold tracking-tight text-foreground">{item.pergunta || "não informado"}</h4>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">{item.resposta || "não informado"}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "highlight": {
      const tone = socialProofHighlightTone(conteudo.icone);
      const Icon = tone.icon;

      return (
        <section key={key} className={`rounded-[2rem] border p-5 sm:p-7 shadow-sm ${tone.containerClass}`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrapperClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrowClass}`}>Direção final</p>
              {conteudo.titulo ? (
                <h3 className={`mt-1 text-xl sm:text-2xl font-extrabold tracking-tight ${tone.titleClass}`}>
                  {conteudo.titulo}
                </h3>
              ) : null}
              <p className={`mt-3 text-sm sm:text-base leading-relaxed ${tone.textClass}`}>
                {conteudo.texto || "não informado"}
              </p>
            </div>
          </div>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function youTubeVariationLabel(title: string | undefined, index: number) {
  const normalized = String(title || "").toLowerCase();

  if (normalized.includes("título") || normalized.includes("titulo")) {
    return `Título ${index + 1}`;
  }

  if (normalized.includes("descrição") || normalized.includes("descricao")) {
    return `Descrição ${index + 1}`;
  }

  return `Ativo ${index + 1}`;
}

function GoogleBusinessResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: GoogleBusinessInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-google-blue/80">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material estruturado para fortalecer leitura local, cadastro semântico e resposta rápida dentro do Perfil de Empresa."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <GoogleBusinessMetric
                label="Ativos prontos"
                value={String(insights.readyAssetCount)}
                helper="cadastros e textos utilizáveis"
              />
              <GoogleBusinessMetric
                label="Sinais locais"
                value={String(insights.localSignalCount)}
                helper="termos e contextos mapeados"
              />
              <GoogleBusinessMetric
                label="FAQ / respostas"
                value={String(insights.faqCount)}
                helper="dúvidas destravadas"
              />
            </div>
          </div>

          {insights.primaryAssetText ? (
            <div className="mt-8 rounded-[2rem] border border-google-blue/20 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-google-blue">
                <MapPin className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                  {insights.primaryAssetTitle || "Ativo principal em destaque"}
                </span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                {insights.primaryAssetText}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderGoogleBusinessBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function GoogleBusinessMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function extractGoogleBusinessInsights(parsedBlocks: any): GoogleBusinessInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let primaryAssetTitle = "";
  let primaryAssetText = "";
  let readyAssetCount = 0;
  let localSignalCount = 0;
  let faqCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!primaryAssetText && tipo === "highlight" && typeof conteudo.texto === "string") {
      primaryAssetTitle = String(conteudo.titulo || "").trim();
      primaryAssetText = conteudo.texto.trim();
    }

    if (!primaryAssetText && tipo === "response_variations" && Array.isArray(conteudo.items) && conteudo.items[0]) {
      primaryAssetTitle = String(conteudo.titulo || "Primeira versão pronta").trim();
      primaryAssetText = String(conteudo.items[0]).trim();
    }

    if (tipo === "response_variations" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
      faqCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      localSignalCount += conteudo.items.length;
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      faqCount += conteudo.perguntas.length;
    }
  }

  return {
    summary,
    primaryAssetTitle,
    primaryAssetText,
    readyAssetCount,
    localSignalCount,
    faqCount,
    sectionCount: blocks.length,
  };
}

function renderGoogleBusinessBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura local</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Contexto do perfil"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-google-blue/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "response_variations": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Textos prontos</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Variações prontas"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item: string, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  {googleBusinessVariationLabel(conteudo.titulo, idx)}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Mapa semântico</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Sinais locais"}
              </h3>
              {conteudo.limite_por_item ? (
                <p className="mt-1 text-sm text-muted-foreground">{conteudo.limite_por_item}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item: string, idx: number) => (
              <div key={idx} className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">
                  <Tag className="h-3.5 w-3.5" />
                  Sinal local {idx + 1}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <ListVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Estrutura pronta</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Cards do perfil"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Card ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-google-blue/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue">
                    Item {idx + 1}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao || "não informado"}</p>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                      <span key={keywordIdx} className="rounded-full border border-google-blue/20 bg-google-blue/5 px-3 py-1.5 text-xs font-medium text-foreground/85">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "faq": {
      const perguntas = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!perguntas.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Redução de dúvida</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Perguntas e respostas"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4">
            {perguntas.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Pergunta {idx + 1}</div>
                <h4 className="text-lg font-bold tracking-tight text-foreground">{item.pergunta || "não informado"}</h4>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">{item.resposta || "não informado"}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const passos = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!passos.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sequência recomendada</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Como aplicar no perfil"}
              </h3>
            </div>
          </div>

          <div className="relative pl-2 sm:pl-4">
            <div className="relative border-l-[3px] border-google-blue/20 space-y-6 py-2">
              {passos.map((passo: string, idx: number) => (
                <div key={idx} className="relative pl-8 sm:pl-10">
                  <div className="absolute -left-[11px] top-4 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-google-blue ring-4 ring-background shadow-sm" />
                  <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">
                      Passo {idx + 1}
                    </div>
                    <p
                      className="text-sm sm:text-base leading-relaxed text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(passo) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "highlight": {
      const tone = googleBusinessHighlightTone(conteudo.icone);
      const Icon = tone.icon;

      return (
        <section key={key} className={`rounded-[2rem] border p-5 sm:p-7 shadow-sm ${tone.containerClass}`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrapperClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrowClass}`}>Destaque</p>
              {conteudo.titulo ? (
                <h3 className={`mt-1 text-xl sm:text-2xl font-extrabold tracking-tight ${tone.titleClass}`}>
                  {conteudo.titulo}
                </h3>
              ) : null}
              <p className={`mt-3 text-sm sm:text-base leading-relaxed ${tone.textClass}`}>
                {conteudo.texto || "não informado"}
              </p>
            </div>
          </div>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function googleBusinessVariationLabel(title: string | undefined, index: number) {
  const normalized = String(title || "").toLowerCase();

  if (normalized.includes("resposta")) {
    return `Resposta ${index + 1}`;
  }

  if (normalized.includes("post")) {
    return `Postagem ${index + 1}`;
  }

  return `Versão ${index + 1}`;
}

function googleBusinessHighlightTone(iconName: string | undefined) {
  const icon = String(iconName || "").toLowerCase();

  if (icon === "alert") {
    return {
      icon: AlertTriangle,
      containerClass: "border-red-200/70 bg-red-50/80 dark:bg-[#2a1616] dark:border-red-900/50",
      iconWrapperClass: "bg-red-200/50 text-red-700 dark:bg-red-500/20 dark:text-red-300",
      eyebrowClass: "text-red-700 dark:text-red-300",
      titleClass: "text-red-900 dark:text-red-200",
      textClass: "text-red-950/90 dark:text-red-100/90",
    };
  }

  if (icon === "check") {
    return {
      icon: CheckCircle,
      containerClass: "border-emerald-200/70 bg-emerald-50/80 dark:bg-[#162a20] dark:border-emerald-900/50",
      iconWrapperClass: "bg-emerald-200/50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
      eyebrowClass: "text-emerald-700 dark:text-emerald-300",
      titleClass: "text-emerald-900 dark:text-emerald-200",
      textClass: "text-emerald-950/90 dark:text-emerald-100/90",
    };
  }

  return {
    icon: MapPin,
    containerClass: "border-blue-200/70 bg-blue-50/80 dark:bg-[#16202a] dark:border-blue-900/50",
    iconWrapperClass: "bg-blue-200/50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    eyebrowClass: "text-blue-700 dark:text-blue-300",
    titleClass: "text-blue-900 dark:text-blue-200",
    textClass: "text-blue-950/90 dark:text-blue-100/90",
  };
}

function SocialProofResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: SocialProofInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-700/90 dark:text-amber-300/90">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material estruturado para transformar percepção positiva em credibilidade utilizável sem soar genérico."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <SocialProofMetric
                label="Ativos prontos"
                value={String(insights.readyAssetCount)}
                helper="blocos reaproveitáveis"
              />
              <SocialProofMetric
                label="Sinais mapeados"
                value={String(insights.signalCount)}
                helper="provas identificadas"
              />
              <SocialProofMetric
                label="Estrutura"
                value={String(insights.sectionCount)}
                helper="seções organizadas"
              />
            </div>
          </div>

          {insights.quoteText ? (
            <div className="mt-8 rounded-[2rem] border border-amber-200/70 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-amber-700 dark:text-amber-300">
                <Quote className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Trecho de prova em destaque</span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                “{insights.quoteText}”
              </p>
              {insights.quoteAuthor ? (
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {insights.quoteAuthor}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderSocialProofBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProofMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function extractSocialProofInsights(parsedBlocks: any): SocialProofInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let quoteText = "";
  let quoteAuthor = "";
  let readyAssetCount = 0;
  let signalCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!quoteText && tipo === "quote") {
      quoteText = String(conteudo.texto || "").trim();
      quoteAuthor = String(conteudo.autor || "").trim();
    }

    if (tipo === "response_variations" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      signalCount += conteudo.items.length;
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      signalCount += conteudo.perguntas.length;
    }
  }

  return {
    summary,
    quoteText,
    quoteAuthor,
    readyAssetCount,
    signalCount,
    sectionCount: blocks.length,
  };
}

function renderSocialProofBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura estratégica</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Contexto da prova"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-amber-500/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "quote": {
      return (
        <section key={key} className="relative overflow-hidden rounded-[2rem] border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-background to-rose-50/70 p-6 sm:p-8 shadow-sm dark:from-[#2b2419] dark:via-[#171717] dark:to-[#22181a] dark:border-amber-900/50">
          <Quote className="absolute right-6 top-6 h-16 w-16 text-amber-400/25" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-3 text-amber-700 dark:text-amber-300">
              <MessageSquareQuote className="h-5 w-5" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Trecho central</span>
            </div>
            <p className="max-w-4xl text-2xl sm:text-3xl font-semibold leading-relaxed tracking-tight text-foreground/90">
              “{conteudo.texto || "não informado"}”
            </p>
            {conteudo.autor ? (
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {conteudo.autor}
              </p>
            ) : null}
          </div>
        </section>
      );
    }

    case "response_variations": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ativos prontos</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Variações de prova social"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item: string, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  {socialProofVariationLabel(conteudo.titulo, idx)}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Mapa de sinais</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Sinais de prova"}
              </h3>
              {conteudo.limite_por_item ? (
                <p className="mt-1 text-sm text-muted-foreground">{conteudo.limite_por_item}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {items.map((item: string, idx: number) => (
              <span
                key={idx}
                className="rounded-full border border-google-blue/20 bg-google-blue/5 px-4 py-2 text-sm font-medium text-foreground/90"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <ListVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Biblioteca organizada</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Blocos de prova social"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Bloco ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                    Item {idx + 1}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao || "não informado"}</p>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                      <span key={keywordIdx} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/80">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const passos = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!passos.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sequência de uso</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Como aplicar a prova"}
              </h3>
            </div>
          </div>

          <div className="relative pl-2 sm:pl-4">
            <div className="relative border-l-[3px] border-amber-300/40 dark:border-amber-700/40 space-y-6 py-2">
              {passos.map((passo: string, idx: number) => (
                <div key={idx} className="relative pl-8 sm:pl-10">
                  <div className="absolute -left-[11px] top-4 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-amber-500 ring-4 ring-background shadow-sm" />
                  <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                      Passo {idx + 1}
                    </div>
                    <p
                      className="text-sm sm:text-base leading-relaxed text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(passo) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "faq": {
      const perguntas = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!perguntas.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-google-blue/10 text-google-blue">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Redução de dúvida</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Perguntas que essa prova ajuda a responder"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4">
            {perguntas.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-google-blue/80">Pergunta {idx + 1}</div>
                <h4 className="text-lg font-bold tracking-tight text-foreground">{item.pergunta || "não informado"}</h4>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">{item.resposta || "não informado"}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "highlight": {
      const tone = socialProofHighlightTone(conteudo.icone);
      const Icon = tone.icon;

      return (
        <section key={key} className={`rounded-[2rem] border p-5 sm:p-7 shadow-sm ${tone.containerClass}`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrapperClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrowClass}`}>Recomendação</p>
              {conteudo.titulo ? (
                <h3 className={`mt-1 text-xl sm:text-2xl font-extrabold tracking-tight ${tone.titleClass}`}>
                  {conteudo.titulo}
                </h3>
              ) : null}
              <p className={`mt-3 text-sm sm:text-base leading-relaxed ${tone.textClass}`}>
                {conteudo.texto || "não informado"}
              </p>
            </div>
          </div>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function socialProofVariationLabel(title: string | undefined, index: number) {
  const normalized = String(title || "").toLowerCase();

  if (normalized.includes("pull quote")) {
    return `Pull quote ${index + 1}`;
  }

  if (normalized.includes("resposta")) {
    return `Versão pronta ${index + 1}`;
  }

  if (normalized.includes("ângulo")) {
    return `Ângulo ${index + 1}`;
  }

  return `Ativo ${index + 1}`;
}

function socialProofHighlightTone(iconName: string | undefined) {
  const icon = String(iconName || "").toLowerCase();

  if (icon === "alert") {
    return {
      icon: AlertTriangle,
      containerClass: "border-red-200/70 bg-red-50/80 dark:bg-[#2a1616] dark:border-red-900/50",
      iconWrapperClass: "bg-red-200/50 text-red-700 dark:bg-red-500/20 dark:text-red-300",
      eyebrowClass: "text-red-700 dark:text-red-300",
      titleClass: "text-red-900 dark:text-red-200",
      textClass: "text-red-950/90 dark:text-red-100/90",
    };
  }

  if (icon === "check") {
    return {
      icon: CheckCircle,
      containerClass: "border-emerald-200/70 bg-emerald-50/80 dark:bg-[#162a20] dark:border-emerald-900/50",
      iconWrapperClass: "bg-emerald-200/50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
      eyebrowClass: "text-emerald-700 dark:text-emerald-300",
      titleClass: "text-emerald-900 dark:text-emerald-200",
      textClass: "text-emerald-950/90 dark:text-emerald-100/90",
    };
  }

  return {
    icon: Star,
    containerClass: "border-amber-200/70 bg-amber-50/80 dark:bg-[#2a2416] dark:border-amber-900/50",
    iconWrapperClass: "bg-amber-200/50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    eyebrowClass: "text-amber-700 dark:text-amber-300",
    titleClass: "text-amber-900 dark:text-amber-200",
    textClass: "text-amber-950/90 dark:text-amber-100/90",
  };
}


function ExternalMentionsResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: ExternalMentionsInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-600/90 dark:text-slate-300/90">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material estruturado para deixar a empresa mais fácil de citar por imprensa, parceiros, eventos e diretórios sem parecer anúncio."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <ExternalMentionsMetric
                label="Ativos citáveis"
                value={String(insights.readyAssetCount)}
                helper="versões e blocos prontos"
              />
              <ExternalMentionsMetric
                label="Sinais oficiais"
                value={String(insights.citationSignalCount)}
                helper="marcadores de entidade"
              />
              <ExternalMentionsMetric
                label="FAQ / suporte"
                value={String(insights.faqCount)}
                helper="dúvidas resolvidas"
              />
            </div>
          </div>

          {insights.primaryAssetText ? (
            <div className="mt-8 rounded-[2rem] border border-slate-300/50 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-slate-700 dark:text-slate-300">
                <FileText className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                  {insights.primaryAssetTitle || "Trecho institucional em destaque"}
                </span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                {insights.primaryAssetText}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderExternalMentionsBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExternalMentionsMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function extractExternalMentionsInsights(parsedBlocks: any): ExternalMentionsInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let primaryAssetTitle = "";
  let primaryAssetText = "";
  let readyAssetCount = 0;
  let citationSignalCount = 0;
  let faqCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!primaryAssetText && tipo === "highlight" && typeof conteudo.texto === "string") {
      primaryAssetTitle = String(conteudo.titulo || "").trim();
      primaryAssetText = conteudo.texto.trim();
    }

    if (!primaryAssetText && tipo === "response_variations" && Array.isArray(conteudo.items) && conteudo.items[0]) {
      primaryAssetTitle = String(conteudo.titulo || "Versão institucional").trim();
      primaryAssetText = String(conteudo.items[0]).trim();
    }

    if (tipo === "response_variations" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      citationSignalCount += conteudo.items.length;
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      faqCount += conteudo.perguntas.length;
    }
  }

  return {
    summary,
    primaryAssetTitle,
    primaryAssetText,
    readyAssetCount,
    citationSignalCount,
    faqCount,
    sectionCount: blocks.length,
  };
}

function renderExternalMentionsBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura editorial</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Base institucional"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-slate-500/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "response_variations": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ativos reaproveitáveis</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Variações institucionais"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item: string, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                  {externalMentionsVariationLabel(conteudo.titulo, idx)}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sinais institucionais</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Marcadores de entidade"}
              </h3>
              {conteudo.limite_por_item ? (
                <p className="mt-1 text-sm text-muted-foreground">{conteudo.limite_por_item}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {items.map((item: string, idx: number) => (
              <span
                key={idx}
                className="rounded-full border border-slate-400/20 bg-slate-500/5 px-4 py-2 text-sm font-medium text-foreground/90"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Blocos institucionais</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Pontos oficiais"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Bloco ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-slate-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
                    Item {idx + 1}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao || "não informado"}</p>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                      <span key={keywordIdx} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/80">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "faq": {
      const perguntas = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!perguntas.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Esclarecimento institucional</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Perguntas e respostas"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4">
            {perguntas.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Pergunta {idx + 1}</div>
                <h4 className="text-lg font-bold tracking-tight text-foreground">{item.pergunta || "não informado"}</h4>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">{item.resposta || "não informado"}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const passos = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!passos.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Padronização recomendada</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Como aplicar"}
              </h3>
            </div>
          </div>

          <div className="relative pl-2 sm:pl-4">
            <div className="relative border-l-[3px] border-slate-300/40 dark:border-slate-700/40 space-y-6 py-2">
              {passos.map((passo: string, idx: number) => (
                <div key={idx} className="relative pl-8 sm:pl-10">
                  <div className="absolute -left-[11px] top-4 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-slate-500 ring-4 ring-background shadow-sm" />
                  <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
                      Passo {idx + 1}
                    </div>
                    <p
                      className="text-sm sm:text-base leading-relaxed text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(passo) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "highlight": {
      const tone = externalMentionsHighlightTone(conteudo.icone);
      const Icon = tone.icon;

      return (
        <section key={key} className={`rounded-[2rem] border p-5 sm:p-7 shadow-sm ${tone.containerClass}`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrapperClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrowClass}`}>Recomendação editorial</p>
              {conteudo.titulo ? (
                <h3 className={`mt-1 text-xl sm:text-2xl font-extrabold tracking-tight ${tone.titleClass}`}>
                  {conteudo.titulo}
                </h3>
              ) : null}
              <p className={`mt-3 text-sm sm:text-base leading-relaxed ${tone.textClass}`}>
                {conteudo.texto || "não informado"}
              </p>
            </div>
          </div>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function externalMentionsVariationLabel(title: string | undefined, index: number) {
  const normalized = String(title || "").toLowerCase();

  if (normalized.includes("títulos") || normalized.includes("titulos")) {
    return `Título ${index + 1}`;
  }

  if (normalized.includes("mini")) {
    return `Pitch ${index + 1}`;
  }

  if (normalized.includes("textos oficiais")) {
    return `Versão ${index + 1}`;
  }

  return `Ativo ${index + 1}`;
}

function externalMentionsHighlightTone(iconName: string | undefined) {
  const icon = String(iconName || "").toLowerCase();

  if (icon === "alert") {
    return {
      icon: AlertTriangle,
      containerClass: "border-red-200/70 bg-red-50/80 dark:bg-[#2a1616] dark:border-red-900/50",
      iconWrapperClass: "bg-red-200/50 text-red-700 dark:bg-red-500/20 dark:text-red-300",
      eyebrowClass: "text-red-700 dark:text-red-300",
      titleClass: "text-red-900 dark:text-red-200",
      textClass: "text-red-950/90 dark:text-red-100/90",
    };
  }

  if (icon === "check") {
    return {
      icon: CheckCircle,
      containerClass: "border-emerald-200/70 bg-emerald-50/80 dark:bg-[#162a20] dark:border-emerald-900/50",
      iconWrapperClass: "bg-emerald-200/50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
      eyebrowClass: "text-emerald-700 dark:text-emerald-300",
      titleClass: "text-emerald-900 dark:text-emerald-200",
      textClass: "text-emerald-950/90 dark:text-emerald-100/90",
    };
  }

  return {
    icon: Building2,
    containerClass: "border-slate-200/70 bg-slate-50/80 dark:bg-[#1b2128] dark:border-slate-800/60",
    iconWrapperClass: "bg-slate-200/60 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200",
    eyebrowClass: "text-slate-700 dark:text-slate-300",
    titleClass: "text-slate-900 dark:text-slate-100",
    textClass: "text-slate-950/90 dark:text-slate-100/90",
  };
}


function CrossPlatformConsistencyResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: CrossPlatformConsistencyInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-700/90 dark:text-violet-300/90">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material organizado para alinhar entidade, mensagem e padrão editorial entre canais sem apagar o diferencial real da marca."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <CrossPlatformConsistencyMetric
                label="Canais / frentes"
                value={String(insights.channelCount)}
                helper="pontos de alinhamento"
              />
              <CrossPlatformConsistencyMetric
                label="Regras fixas"
                value={String(insights.alignmentRuleCount)}
                helper="elementos estáveis"
              />
              <CrossPlatformConsistencyMetric
                label="FAQ / rotina"
                value={String(insights.faqCount)}
                helper="manutenção guiada"
              />
            </div>
          </div>

          {insights.primaryAssetText ? (
            <div className="mt-8 rounded-[2rem] border border-violet-300/50 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3 text-violet-700 dark:text-violet-300">
                <Repeat2 className="h-5 w-5" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
                  {insights.primaryAssetTitle || "Regra central"}
                </span>
              </div>
              <p className="text-lg sm:text-2xl leading-relaxed font-semibold text-foreground/90">
                {insights.primaryAssetText}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderCrossPlatformConsistencyBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}


function LinkedInMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function extractLinkedInInsights(parsedBlocks: any): LinkedInInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let primaryAssetTitle = "";
  let primaryAssetText = "";
  let readyAssetCount = 0;
  let perspectiveCount = 0;
  let faqCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!primaryAssetText && tipo === "highlight" && typeof conteudo.texto === "string") {
      primaryAssetTitle = String(conteudo.titulo || "").trim();
      primaryAssetText = conteudo.texto.trim();
    }

    if (!primaryAssetText && tipo === "response_variations" && Array.isArray(conteudo.items) && conteudo.items[0]) {
      primaryAssetTitle = String(conteudo.titulo || "Primeira versão pronta").trim();
      primaryAssetText = String(conteudo.items[0]).trim();
    }

    if (tipo === "response_variations" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      readyAssetCount += conteudo.items.length;
      perspectiveCount += conteudo.items.length;
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      perspectiveCount += conteudo.items.length;
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      faqCount += conteudo.perguntas.length;
    }

    if (tipo === "timeline" && Array.isArray(conteudo.passos)) {
      faqCount += conteudo.passos.length;
    }
  }

  return {
    summary,
    primaryAssetTitle,
    primaryAssetText,
    readyAssetCount,
    perspectiveCount,
    faqCount,
    sectionCount: blocks.length,
  };
}

function linkedInVariationLabel(title: any, idx: number) {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("headline")) return `Headline ${idx + 1}`;
  if (normalized.includes("descri")) return `Descrição ${idx + 1}`;
  if (normalized.includes("post")) return `Post ${idx + 1}`;
  if (normalized.includes("case")) return `Bloco ${idx + 1}`;
  return `Versão ${idx + 1}`;
}

function renderLinkedInBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
              <AlignLeft className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura executiva</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Base estratégica"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-blue-500/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "response_variations": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ativos prontos</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Variações prontas"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item: string, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                  {linkedInVariationLabel(conteudo.titulo, idx)}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Blocos de autoridade</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Componentes do posicionamento"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Bloco ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-blue-600/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                    Item {idx + 1}
                  </span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao || "não informado"}</p>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                      <span key={keywordIdx} className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground/80">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sinais de perfil</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Termos e eixos que precisam aparecer"}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {items.map((item: string, idx: number) => (
              <span
                key={idx}
                className="rounded-full border border-blue-400/20 bg-blue-500/5 px-4 py-2 text-sm font-medium text-foreground/90"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const steps = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!steps.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Aplicação</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Ordem recomendada"}
              </h3>
            </div>
          </div>

          <div className="space-y-4">
            {steps.map((step: string, idx: number) => (
              <div key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                  Passo {idx + 1}
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{step}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "faq": {
      const perguntas = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!perguntas.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">FAQ / leitura institucional</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Dúvidas que o posicionamento precisa responder"}
              </h3>
            </div>
          </div>

          <div className="space-y-4">
            {perguntas.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                  Pergunta {idx + 1}
                </div>
                <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.pergunta || `Pergunta ${idx + 1}`}</h4>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-foreground/90">{item.resposta || "não informado"}</p>
              </article>
            ))}
          </div>
        </section>
      );
    }

    case "highlight": {
      const textValue = typeof conteudo.texto === "string" ? conteudo.texto : "";
      if (!textValue) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-blue-300/30 bg-blue-500/5 p-5 sm:p-7 shadow-sm">
          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700/80 dark:text-blue-300/80">Síntese central</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Ponto de vista aprovado"}
              </h3>
            </div>
          </div>
          <p className="text-base sm:text-lg leading-relaxed text-foreground/90">{textValue}</p>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function LinkedInResult({
  title,
  parsedBlocks,
  headerVariant,
  badge,
  insights,
}: {
  title: string;
  parsedBlocks: any;
  headerVariant: HeaderVariant;
  badge: string;
  insights: LinkedInInsights;
}) {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];
  const heroTitle = parsedBlocks?.titulo_da_tela || title;

  return (
    <section className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2.5rem] border border-border bg-card/90 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className={headerVariant.headerClass}>
          <div className={`absolute top-0 left-0 w-full h-1 ${headerVariant.topBarClass}`} />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex items-start gap-4">
                <div className={`hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${headerVariant.iconWrapperClass}`}>
                  {headerVariant.icon}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700/90 dark:text-blue-300/90">
                    {badge}
                  </p>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                    {heroTitle}
                  </h2>
                  <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-foreground/75">
                    {insights.summary || "Material estruturado para fortalecer autoridade profissional, leitura executiva e posicionamento B2B no LinkedIn."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
              <LinkedInMetric label="Ativos prontos" value={String(insights.readyAssetCount)} helper="posts, versões e blocos" />
              <LinkedInMetric label="Sinais / eixos" value={String(insights.perspectiveCount)} helper="pontos de vista e termos" />
              <LinkedInMetric label="FAQ / aplicação" value={String(insights.faqCount)} helper="dúvidas e sequência" />
            </div>
          </div>

          {insights.primaryAssetText ? (
            <div className="mt-8 rounded-[2rem] border border-blue-300/30 bg-background/70 p-5 sm:p-6 shadow-sm">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700/80 dark:text-blue-300/80">
                {insights.primaryAssetTitle || "Ponto de vista central"}
              </div>
              <p className="text-base sm:text-lg leading-relaxed text-foreground/90">{insights.primaryAssetText}</p>
            </div>
          ) : null}
        </div>

        <div className="p-6 sm:p-10 space-y-8">
          {blocks.map((bloco: any, idx: number) => (
            <React.Fragment key={idx}>{renderLinkedInBlock(bloco, idx)}</React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}


function CrossPlatformConsistencyMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

function extractCrossPlatformConsistencyInsights(parsedBlocks: any): CrossPlatformConsistencyInsights {
  const blocks = Array.isArray(parsedBlocks?.blocos) ? parsedBlocks.blocos : [];

  let summary = "";
  let primaryAssetTitle = "";
  let primaryAssetText = "";
  let alignmentRuleCount = 0;
  let channelCount = 0;
  let faqCount = 0;

  for (const block of blocks) {
    const tipo = typeof block?.tipo === "string" ? block.tipo.toLowerCase() : "";
    const conteudo = typeof block?.conteudo === "object" && block?.conteudo ? block.conteudo : {};

    if (!summary && tipo === "markdown" && typeof conteudo.texto === "string") {
      const firstParagraph = parseBlocks(conteudo.texto).find((item) => item.kind === "p");
      if (firstParagraph && "text" in firstParagraph) {
        summary = firstParagraph.text;
      }
    }

    if (!primaryAssetText && tipo === "highlight" && typeof conteudo.texto === "string") {
      primaryAssetTitle = String(conteudo.titulo || "").trim();
      primaryAssetText = conteudo.texto.trim();
    }

    if (tipo === "keyword_list" && Array.isArray(conteudo.items)) {
      alignmentRuleCount += conteudo.items.length;
    }

    if (tipo === "service_cards" && Array.isArray(conteudo.items)) {
      channelCount = Math.max(channelCount, conteudo.items.length);
    }

    if (tipo === "comparison_table" && Array.isArray(conteudo.items)) {
      channelCount = Math.max(channelCount, conteudo.items.length);
    }

    if (tipo === "faq" && Array.isArray(conteudo.perguntas)) {
      faqCount += conteudo.perguntas.length;
    }
  }

  return {
    summary,
    primaryAssetTitle,
    primaryAssetText,
    alignmentRuleCount,
    channelCount,
    faqCount,
    sectionCount: blocks.length,
  };
}

function renderCrossPlatformConsistencyBlock(bloco: any, key: number) {
  const tipo = typeof bloco?.tipo === "string" ? bloco.tipo.toLowerCase() : "";
  const conteudo = typeof bloco?.conteudo === "object" && bloco?.conteudo ? bloco.conteudo : {};

  switch (tipo) {
    case "markdown": {
      const mBlocks = parseBlocks(conteudo.texto || "");
      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Repeat2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura de governança</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Diagnóstico de consistência"}
              </h3>
            </div>
          </div>
          <div className="prose prose-zinc dark:prose-invert prose-lg max-w-none text-foreground/80 leading-relaxed font-normal marker:text-violet-500/70">
            {mBlocks.map((block, idx) => renderLegacyBlock(block, idx))}
          </div>
        </section>
      );
    }

    case "comparison_table": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
              <AlignLeft className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Conflitos e ajustes</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Leitura comparativa"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.criterio || `Critério ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                    Critério {idx + 1}
                  </span>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 dark:bg-[#162a20] dark:border-emerald-900/50 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                      Padrão recomendado
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-emerald-950/90 dark:text-emerald-100/90">
                      {item.nossa_solucao || "não informado"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 dark:bg-[#2a2416] dark:border-amber-900/50 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                      Risco atual
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-amber-950/90 dark:text-amber-100/90">
                      {item.mercado || "não informado"}
                    </p>
                  </div>
                </div>

                {item.recomendacao ? (
                  <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                      Leitura operacional
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

    case "service_cards": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <ListVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Padrão por frente</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Regras por canal"}
              </h3>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item: any, idx: number) => (
              <article key={idx} className="rounded-[1.75rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-lg font-extrabold tracking-tight text-foreground">{item.nome || `Item ${idx + 1}`}</h4>
                  <span className="shrink-0 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                    Frente {idx + 1}
                  </span>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Regra aplicada</p>
                  <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{item.descricao}</p>
                </div>
                {Array.isArray(item.palavras_chave) && item.palavras_chave.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Elementos estáveis</p>
                    <div className="flex flex-wrap gap-2">
                      {item.palavras_chave.map((keyword: string, keywordIdx: number) => (
                        <span key={keywordIdx} className="rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 text-xs font-medium text-foreground/85">
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

    case "keyword_list": {
      const items = Array.isArray(conteudo.items) ? conteudo.items : [];
      if (!items.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Partes imutáveis</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Elementos estáveis"}
              </h3>
              {conteudo.limite_por_item ? (
                <p className="mt-1 text-sm text-muted-foreground">{conteudo.limite_por_item}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {items.map((item: string, idx: number) => (
              <span
                key={idx}
                className="rounded-full border border-sky-400/20 bg-sky-500/5 px-4 py-2 text-sm font-medium text-foreground/90"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "timeline": {
      const passos = Array.isArray(conteudo.passos) ? conteudo.passos : [];
      if (!passos.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Ritmo de aplicação</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "Ordem de correção"}
              </h3>
            </div>
          </div>

          <div className="relative border-l-[3px] border-violet-200/70 dark:border-violet-900/50 space-y-6 py-1 pl-4">
            {passos.map((passo: string, idx: number) => (
              <div key={idx} className="relative pl-8">
                <div className="absolute -left-[11px] top-3 flex h-5 w-5 items-center justify-center rounded-full bg-background border-[4px] border-violet-500 shadow-sm" />
                <div
                  className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm text-sm sm:text-base leading-relaxed text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: inlineFormat(passo) }}
                />
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "faq": {
      const perguntas = Array.isArray(conteudo.perguntas) ? conteudo.perguntas : [];
      if (!perguntas.length) return null;

      return (
        <section key={key} className="rounded-[2rem] border border-border/70 bg-background/70 p-5 sm:p-7 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Captions className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Perguntas de governança</p>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {conteudo.titulo || "FAQ de manutenção"}
              </h3>
            </div>
          </div>

          <div className="space-y-6">
            {perguntas.map((q: any, idx: number) => (
              <div key={idx} className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm">
                <h4 className="mb-3 text-lg font-extrabold tracking-tight text-foreground flex items-start gap-3">
                  <span className="text-violet-600 dark:text-violet-300">Q.</span>
                  {q.pergunta}
                </h4>
                <p
                  className="text-sm sm:text-base leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: inlineFormat(q.resposta || "") }}
                />
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "highlight": {
      const tone = crossPlatformHighlightTone(conteudo.icone);
      const Icon = tone.icon;
      return (
        <section key={key} className={`rounded-[2rem] border p-6 sm:p-7 shadow-sm ${tone.containerClass}`}>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrapperClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrowClass}`}>Regra central</p>
              <h3 className={`mt-2 text-xl sm:text-2xl font-extrabold tracking-tight ${tone.titleClass}`}>
                {conteudo.titulo || "Leitura principal"}
              </h3>
              <p className={`mt-3 text-sm sm:text-base leading-relaxed ${tone.textClass}`}>
                {conteudo.texto || "não informado"}
              </p>
            </div>
          </div>
        </section>
      );
    }

    default:
      return renderJsonBlock(bloco, key);
  }
}

function crossPlatformHighlightTone(iconName: string | undefined) {
  const icon = String(iconName || "").toLowerCase();

  if (icon === "alert") {
    return {
      icon: AlertTriangle,
      containerClass: "border-red-200/70 bg-red-50/80 dark:bg-[#2a1616] dark:border-red-900/50",
      iconWrapperClass: "bg-red-200/50 text-red-700 dark:bg-red-500/20 dark:text-red-300",
      eyebrowClass: "text-red-700 dark:text-red-300",
      titleClass: "text-red-900 dark:text-red-200",
      textClass: "text-red-950/90 dark:text-red-100/90",
    };
  }

  if (icon === "check") {
    return {
      icon: CheckCircle,
      containerClass: "border-emerald-200/70 bg-emerald-50/80 dark:bg-[#162a20] dark:border-emerald-900/50",
      iconWrapperClass: "bg-emerald-200/50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
      eyebrowClass: "text-emerald-700 dark:text-emerald-300",
      titleClass: "text-emerald-900 dark:text-emerald-200",
      textClass: "text-emerald-950/90 dark:text-emerald-100/90",
    };
  }

  if (icon === "star") {
    return {
      icon: Sparkles,
      containerClass: "border-sky-200/70 bg-sky-50/80 dark:bg-[#141f2b] dark:border-sky-900/50",
      iconWrapperClass: "bg-sky-200/50 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
      eyebrowClass: "text-sky-700 dark:text-sky-300",
      titleClass: "text-sky-900 dark:text-sky-200",
      textClass: "text-sky-950/90 dark:text-sky-100/90",
    };
  }

  return {
    icon: Repeat2,
    containerClass: "border-violet-200/70 bg-violet-50/80 dark:bg-[#21162c] dark:border-violet-900/50",
    iconWrapperClass: "bg-violet-200/50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    eyebrowClass: "text-violet-700 dark:text-violet-300",
    titleClass: "text-violet-900 dark:text-violet-200",
    textClass: "text-violet-950/90 dark:text-violet-100/90",
  };
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