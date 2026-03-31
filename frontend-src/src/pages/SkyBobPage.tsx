import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  motion, 
  useMotionValue, 
  useTransform, 
  useAnimationFrame, 
  useMotionTemplate,
  animate
} from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Database,
  Layers3,
  Lightbulb,
  Lock,
  RefreshCw,
  Rocket,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSkyBobFeedbackPreferences, buildSkyBobNucleusSignature, createEmptySkyBobWorkspace, parseSkyBobWorkspace, serializeSkyBobWorkspace, withWorkspaceTimestamp, type SkyBobFeedbackItem, type SkyBobWorkspace, type VoteValue } from "@/lib/skybob";
import { toastApiError, toastInfo, toastSuccess } from "@/lib/toast";
import { api } from "@/services/robots";
import type { BusinessCoreOut, SkyBobCard, SkyBobCatalogAnalysis, SkyBobCatalogItem, SkyBobHook, SkyBobRunResponse } from "@/types/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/state/authStore";

const BUSINESS_CORE_PUBLIC_ID = "business-core";

const NUCLEUS_FIELDS = [
  "company_name",
  "owner_name",
  "city_state",
  "service_area",
  "main_audience",
  "services_products",
  "real_differentials",
  "restrictions",
  "reviews",
  "testimonials",
  "usable_links_texts",
  "forbidden_content",
  "site",
  "google_business_profile",
  "instagram",
  "linkedin",
  "youtube",
  "tiktok",
] as const;

function ensureString(value: unknown): string {
  return String(value ?? "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeNucleus(coreData?: BusinessCoreOut | null): Record<string, unknown> {
  if (!coreData) return {};
  const entries = Object.entries(coreData).filter(([key, value]) => {
    if (key === "skybob" || key === "knowledge_files_json" || key === "knowledge_text" || key === "updated_at") return false;
    return value !== null && value !== undefined;
  });
  return Object.fromEntries(entries);
}

function createHookFeedbackItem(item: SkyBobHook): SkyBobFeedbackItem<SkyBobHook> {
  return {
    id: item.id,
    item,
    status: null,
    notes: "",
    updated_at: nowIso(),
  };
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function countFilledNucleusFields(nucleus: Record<string, unknown>): number {
  return NUCLEUS_FIELDS.filter((field) => {
    const value = ensureString(nucleus[field]).trim();
    return value && value.toLowerCase() !== "não informado";
  }).length;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
        active
          ? "border-cyan-300/40 bg-cyan-400/12 text-white shadow-soft"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function BulletList({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "success" | "warning";
}) {
  const accent =
    tone === "success"
      ? "text-emerald-200 border-emerald-400/20 bg-emerald-400/[0.06]"
      : tone === "warning"
        ? "text-amber-100 border-amber-400/20 bg-amber-400/[0.06]"
        : "text-slate-100 border-white/10 bg-white/[0.03]";

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item}-${index}`} className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6", accent)}>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <span>{item}</span>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
            Sem itens nesta seção.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({ card }: { card: SkyBobCard }) {
  return (
    <Card className="h-full border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(10,14,23,0.92))]">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{card.section || "insight"}</Badge>
          {card.badges.slice(0, 2).map((badge, index) => (
            <Badge key={`${badge}-${index}`} variant="blue">
              {badge}
            </Badge>
          ))}
        </div>
        <CardTitle className="text-xl leading-tight">{card.title}</CardTitle>
        {card.body ? <CardDescription className="text-sm leading-6 text-slate-300">{card.body}</CardDescription> : null}
      </CardHeader>
      {card.bullets.length ? (
        <CardContent className="space-y-3">
          {card.bullets.map((bullet, index) => (
            <div key={`${bullet}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-200">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <span>{bullet}</span>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function CatalogSignalCard({ item }: { item: SkyBobCatalogItem }) {
  const chips = [...item.messaging_angles, ...item.pains, ...item.desires].filter(Boolean).slice(0, 4);

  return (
    <Card className="h-full border-white/10 bg-white/[0.02]">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="blue">{item.kind || "item"}</Badge>
          <Badge variant="outline">{item.name}</Badge>
        </div>
        <CardTitle className="text-lg">{item.name}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {item.rationale || item.study || "Item detectado no núcleo da empresa."}
        </CardDescription>
      </CardHeader>
      {chips.length ? (
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {chips.map((chip, index) => (
            <Badge key={`${chip}-${index}`} variant="outline" className="max-w-full break-words">
              {chip}
            </Badge>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function HookOptionCard({
  hook,
  vote,
  onVote,
}: {
  hook: SkyBobHook;
  vote: VoteValue;
  onVote: (hook: SkyBobHook, value: VoteValue) => void;
}) {
  return (
    <Card className="h-full border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(10,14,23,0.92))]">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="blue">{hook.format_hint || "Formato livre"}</Badge>
          {vote === "like" ? <Badge variant="green">Gostei</Badge> : null}
          {vote === "dislike" ? <Badge variant="red">Não gostei</Badge> : null}
        </div>
        <CardTitle className="text-[1.15rem] leading-7">{hook.hook}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3 pt-0">
        <Button
          variant={vote === "like" ? "default" : "outline"}
          size="sm"
          onClick={() => onVote(hook, vote === "like" ? null : "like")}
        >
          <ThumbsUp className="h-4 w-4" />
          Gostei
        </Button>
        <Button
          variant={vote === "dislike" ? "destructive" : "outline"}
          size="sm"
          onClick={() => onVote(hook, vote === "dislike" ? null : "dislike")}
        >
          <ThumbsDown className="h-4 w-4" />
          Não gostei
        </Button>
      </CardContent>
    </Card>
  );
}

function RocketMark() {
  return (
    <div className="relative h-24 w-24">
      <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="absolute inset-0 rounded-full border border-cyan-300/20 bg-[radial-gradient(circle_at_30%_30%,rgba(77,232,255,0.25),transparent_55%)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Rocket className="h-12 w-12 text-cyan-200" />
      </div>
    </div>
  );
}

// ============================================================================
// SPACE RUN CARD: Animação Contínua e Suave + Fundo Global Vivo
// ============================================================================
function SpaceRunCard({
  progress,
  label,
  title,
  description,
}: {
  progress: number;
  label: string;
  title: string;
  description: string;
}) {
  const normalizedProgress = Math.min(Math.max(progress, 0), 100);

  // Progresso Suave (TWEEN em vez de SPRING): 
  const smoothProgress = useMotionValue(0);
  
  React.useEffect(() => {
    const controls = animate(smoothProgress, normalizedProgress, {
      type: "tween",
      ease: "easeInOut",
      duration: 3, 
    });
    return controls.stop;
  }, [normalizedProgress, smoothProgress]);

  // Posição Y sobe organicamente com o progresso suave
  const rocketBottom = useTransform(smoothProgress, [0, 100], ["4%", "82%"]);

  // Rota do Foguete mapeada pelo progresso
  const rocketX = useTransform(
    smoothProgress,
    [0, 15, 25, 35, 45, 55, 65, 80, 90, 100],
    [0, -10, -26, -8, 24, 30, 8, -22, 16, 0]
  );
  const rocketLean = useTransform(
    smoothProgress,
    [0, 15, 25, 35, 45, 55, 65, 80, 90, 100],
    [0, -8, -12, -4, 10, 12, 4, -9, 7, 0]
  );

  const floatY = useMotionValue(0);
  const finalX = useMotionValue(0);
  const finalRotate = useMotionValue(0);

  // Fundo Parallax (Scroll Contínuo global)
  const bgTravel = useMotionValue(0);

  // Loop de Animação de Física
  useAnimationFrame((t, delta) => {
    floatY.set(Math.sin(t / 400) * 8);
    const fx = Math.cos(t / 600) * 4;
    const fr = Math.sin(t / 500) * 2;

    finalX.set(rocketX.get() + fx);
    finalRotate.set(rocketLean.get() + fr);

    const p = smoothProgress.get();
    const speedMult = p > 5 && p < 95 ? 2.5 : 0.5; 
    bgTravel.set(bgTravel.get() + delta * 0.05 * speedMult);
  });

  // Mapeamentos infinitos do Parallax Interno (Foguete)
  const bgY1 = useTransform(bgTravel, (v) => `${v % 100}%`);
  const bgY2 = useTransform(bgTravel, (v) => `${(v % 100) - 100}%`);
  const bgYFast1 = useTransform(bgTravel, (v) => `${(v * 2) % 100}%`);
  const bgYFast2 = useTransform(bgTravel, (v) => `${((v * 2) % 100) - 100}%`);

  // Mapeamento do Grid Global (Move o fundo principal)
  const globalGridPos = useTransform(bgTravel, (v) => `0px ${v * 0.6}px`);

  const thrusterScale = useTransform(smoothProgress, [0, 20, 80, 100], [0.8, 1.8, 1.8, 0.6]);
  const thrusterOpacity = useTransform(smoothProgress, [0, 20, 80, 100], [0.3, 0.9, 0.9, 0.2]);

  const deepStars = React.useMemo(() => Array.from({ length: 42 }, (_, index) => ({
    id: `deep-${index}`,
    left: `${(index * 13.7 + (index % 4) * 6.5) % 100}%`,
    top: `${(index * 17.9) % 100}%`,
    size: 1 + (index % 3) * 0.7,
    opacity: 0.35 + (index % 5) * 0.1,
  })), []);

  const nearStars = React.useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    id: `near-${index}`,
    left: `${(index * 19.4 + 8) % 100}%`,
    top: `${(index * 14.2 + 11) % 100}%`,
    width: 12 + (index % 4) * 10,
    opacity: 0.18 + (index % 4) * 0.08,
  })), []);

  const cosmicDust = React.useMemo(() => Array.from({ length: 14 }, (_, index) => ({
    id: `dust-${index}`,
    left: `${(index * 21.5 + 3) % 100}%`,
    top: `${(index * 18.8 + 7) % 100}%`,
    size: 42 + (index % 3) * 22,
    duration: 10 + (index % 4) * 1.4,
    delay: index * 0.38,
  })), []);

  const blackHoles = React.useMemo(() => [
    { id: "hole-1", top: "18%", left: "14%", size: 120, glow: "rgba(56,189,248,0.18)" },
    { id: "hole-2", top: "62%", left: "72%", size: 148, glow: "rgba(168,85,247,0.18)" },
  ], []);

  const shootingStars = React.useMemo(() => [
    { id: "star-1", top: "-10%", left: "10%", size: 80, duration: 4.8, delay: 0.2, driftX: 300, driftY: 900, rotate: 65 },
    { id: "star-2", top: "-20%", left: "80%", size: 120, duration: 5.2, delay: 1.5, driftX: -250, driftY: 850, rotate: -60 },
    { id: "star-3", top: "-15%", left: "40%", size: 60, duration: 3.5, delay: 3.0, driftX: 180, driftY: 950, rotate: 75 },
    { id: "star-4", top: "-5%", left: "90%", size: 90, duration: 4.0, delay: 0.8, driftX: -320, driftY: 880, rotate: -55 },
    { id: "star-5", top: "-30%", left: "30%", size: 100, duration: 6.0, delay: 2.2, driftX: 200, driftY: 800, rotate: 70 },
  ], []);

  // Partículas globais sutis subindo para dar vida ao fundo principal
  const globalAmbientParticles = React.useMemo(() => Array.from({ length: 25 }, (_, i) => ({
    id: `amb-${i}`,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100 + 100}%`, // Começam abaixo da tela
    size: Math.random() * 2 + 1,
    delay: Math.random() * 8,
    duration: Math.random() * 10 + 15, // Bem lentas
  })), []);

  const checkpoints = [
    { id: "queued", label: "Fila" },
    { id: "core", label: "Núcleo" },
    { id: "catalog", label: "Catálogo" },
    { id: "ai", label: "IA" },
    { id: "done", label: "Entrega" },
  ];

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#03060F_0%,#050914_45%,#07101D_100%)]">
      
      {/* 1. NEBULOSAS VIVAS NO FUNDO GLOBAL */}
      <motion.div 
        className="absolute inset-0"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute top-[10%] left-[10%] w-[40vw] h-[40vw] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute top-[50%] right-[5%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[150px]" />
        <div className="absolute bottom-[10%] left-[20%] w-[35vw] h-[35vw] rounded-full bg-purple-600/10 blur-[140px]" />
      </motion.div>

      {/* 2. GRID GLOBAL ANIMADO E SINCRONIZADO */}
      <motion.div 
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:42px_42px] opacity-40" 
        style={{ backgroundPosition: globalGridPos }}
      />

      {/* 3. PARTÍCULAS GLOBAIS (Subindo lentamente) */}
      {globalAmbientParticles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-200/40 shadow-[0_0_8px_rgba(77,232,255,0.4)]"
          style={{ left: p.left, width: p.size, height: p.size }}
          animate={{ y: [0, -1200], opacity: [0, 1, 1, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "linear" }}
        />
      ))}

      {/* CONTEÚDO PRINCIPAL (PAINEL + FOGUETE) */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-5 pb-8 pt-24 sm:px-8 lg:px-12">
        <div className="grid flex-1 gap-10 xl:grid-cols-[0.94fr_1.06fr] xl:items-center">
          
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="blue" className="w-fit px-4 py-1.5 text-[11px] uppercase tracking-[0.28em]">
                SkyBob em execução
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-5xl xl:text-6xl">{title}</h1>
                <p className="max-w-2xl text-base leading-8 text-slate-300 md:text-lg">{description}</p>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                <span>{label}</span>
                <span className="font-semibold text-cyan-100">{Math.round(normalizedProgress)}%</span>
              </div>

              <div className="relative h-4 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#00C8E8,#4DE8FF)] shadow-[0_0_36px_rgba(77,232,255,0.55)]"
                  style={{ width: useMotionTemplate`${smoothProgress}%` }}
                />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-5">
                {checkpoints.map((checkpoint, index) => {
                  const checkpointProgress = (index / (checkpoints.length - 1)) * 100;
                  const active = normalizedProgress >= checkpointProgress - 2;
                  return (
                    <div
                      key={checkpoint.id}
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.22em] transition-all duration-500",
                        active ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-100 shadow-soft" : "border-white/10 bg-white/[0.02] text-slate-500"
                      )}
                    >
                      {checkpoint.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* VIEWPORT DO FOGUETE */}
          <div className="relative flex min-h-[620px] items-end justify-center overflow-hidden rounded-[40px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,8,16,0.98),rgba(5,9,18,1))] shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-md">
            
            {blackHoles.map((hole) => (
              <div key={hole.id} className="absolute" style={{ left: hole.left, top: hole.top, width: hole.size, height: hole.size }}>
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "radial-gradient(circle at 50% 50%, rgba(2,6,23,0.98) 0%, rgba(2,6,23,0.98) 24%, rgba(15,23,42,0.92) 36%, rgba(56,189,248,0.14) 53%, rgba(168,85,247,0.08) 66%, transparent 76%)", boxShadow: `0 0 60px ${hole.glow}` }}
                  animate={{ scale: [0.98, 1.04, 0.98], opacity: [0.8, 1, 0.8] }} transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -inset-5 rounded-full border border-cyan-300/10 blur-[1px]"
                  style={{ background: "conic-gradient(from 0deg, rgba(77,232,255,0.16), rgba(168,85,247,0.08), rgba(77,232,255,0.16), rgba(168,85,247,0.08), rgba(77,232,255,0.16))" }}
                  animate={{ rotate: 360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                />
              </div>
            ))}

            {cosmicDust.map((cloud) => (
              <motion.div
                key={cloud.id} className="absolute rounded-full bg-cyan-300/10 blur-3xl" style={{ left: cloud.left, top: cloud.top, width: cloud.size, height: cloud.size }}
                animate={{ y: [0, 30, 0], x: [0, -18, 0], opacity: [0.18, 0.42, 0.18], scale: [0.92, 1.08, 0.92] }}
                transition={{ duration: cloud.duration, repeat: Infinity, delay: cloud.delay, ease: "easeInOut" }}
              />
            ))}

            <motion.div style={{ y: bgY1 }} className="absolute inset-0 h-full w-full">
              {deepStars.map((star) => <span key={star.id} className="absolute rounded-full bg-white" style={{ left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity }} />)}
            </motion.div>
            <motion.div style={{ y: bgY2 }} className="absolute inset-0 h-full w-full">
              {deepStars.map((star) => <span key={`dup-${star.id}`} className="absolute rounded-full bg-white" style={{ left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity }} />)}
            </motion.div>

            <motion.div style={{ y: bgYFast1 }} className="absolute inset-0 h-full w-full">
              {nearStars.map((streak) => <div key={streak.id} className="absolute h-px rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.92),rgba(77,232,255,0.45),transparent)]" style={{ left: streak.left, top: streak.top, width: streak.width, opacity: streak.opacity }} />)}
            </motion.div>
            <motion.div style={{ y: bgYFast2 }} className="absolute inset-0 h-full w-full">
              {nearStars.map((streak) => <div key={`dup-${streak.id}`} className="absolute h-px rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.92),rgba(77,232,255,0.45),transparent)]" style={{ left: streak.left, top: streak.top, width: streak.width, opacity: streak.opacity }} />)}
            </motion.div>

            {/* Estrelas Cadentes / Meteoros */}
            {shootingStars.map((star) => (
              <motion.div
                key={star.id} 
                className="absolute z-10" 
                style={{ left: star.left, top: star.top }}
                animate={{ x: [0, star.driftX], y: [0, star.driftY], opacity: [0, 1, 1, 0] }}
                transition={{ duration: star.duration, repeat: Infinity, delay: star.delay, ease: "linear", repeatDelay: 1.2 }}
              >
                <div 
                  className="h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-200 to-white"
                  style={{ 
                    width: star.size, 
                    transform: `rotate(${star.rotate}deg)`,
                    boxShadow: "0 0 15px 2px rgba(103, 232, 249, 0.4)",
                    filter: "blur(0.5px)"
                  }} 
                />
              </motion.div>
            ))}

            <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.12),rgba(0,0,0,0.55))] z-10" />

            <motion.div className="absolute left-1/2 z-20" style={{ bottom: rocketBottom }}>
              <div className="-translate-x-1/2">
                <motion.div style={{ x: finalX, rotate: finalRotate }}>
                  <motion.div style={{ y: floatY }} className="relative flex flex-col items-center">
                    
                    <motion.div
                      className="absolute top-[94%] h-44 w-24 rounded-full bg-cyan-300/25 blur-3xl origin-top"
                      style={{ scaleY: thrusterScale, opacity: thrusterOpacity }}
                    />
                    <motion.div
                      className="absolute top-[88%] h-40 w-14 rounded-full bg-orange-300/45 blur-2xl origin-top"
                      style={{ scaleY: thrusterScale, opacity: thrusterOpacity }}
                    />

                    <div className="relative h-[220px] w-[150px]">
                      <div className="absolute left-1/2 top-0 h-[168px] w-[88px] -translate-x-1/2 rounded-t-[46px] rounded-b-[34px] border border-white/15 bg-[linear-gradient(180deg,#E2E8F0_0%,#CBD5E1_22%,#94A3B8_60%,#475569_100%)] shadow-[0_18px_42px_rgba(0,0,0,0.45)]" />
                      <div className="absolute left-1/2 top-[30px] h-11 w-11 -translate-x-1/2 rounded-full border border-cyan-200/60 bg-[radial-gradient(circle_at_50%_45%,#ECFEFF_0%,#67E8F9_62%,rgba(8,145,178,0.72)_100%)] shadow-[0_0_30px_rgba(103,232,249,0.42)]" />
                      <div className="absolute left-[12px] top-[76px] h-[72px] w-[42px] -rotate-[18deg] rounded-l-[28px] rounded-r-[12px] border border-white/10 bg-[linear-gradient(180deg,#94A3B8,#334155)]" />
                      <div className="absolute right-[12px] top-[76px] h-[72px] w-[42px] rotate-[18deg] rounded-r-[28px] rounded-l-[12px] border border-white/10 bg-[linear-gradient(180deg,#94A3B8,#334155)]" />
                      <div className="absolute bottom-[38px] left-[24px] h-[72px] w-[28px] rounded-b-[22px] rounded-t-[10px] border border-white/10 bg-[linear-gradient(180deg,#CBD5E1,#475569)]" />
                      <div className="absolute bottom-[38px] right-[24px] h-[72px] w-[28px] rounded-b-[22px] rounded-t-[10px] border border-white/10 bg-[linear-gradient(180deg,#CBD5E1,#475569)]" />
                      <div className="absolute bottom-[10px] left-1/2 h-12 w-16 -translate-x-1/2 rounded-b-[24px] rounded-t-[10px] border border-white/10 bg-[linear-gradient(180deg,#64748B,#1E293B)]" />
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}

function IntroScreen({
  canStart,
  filledCount,
  onStart,
}: {
  canStart: boolean;
  filledCount: number;
  onStart: () => void;
}) {
  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(0,200,232,0.18),transparent_36%),linear-gradient(180deg,rgba(8,11,20,0.96),rgba(8,11,20,1))] relative z-10 backdrop-blur-sm">
      <CardContent className="flex min-h-[calc(100dvh-13rem)] items-center justify-center p-6 md:p-10">
        <div className="grid w-full max-w-5xl gap-10 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
          <div className="flex justify-center xl:justify-start">
            <div className="relative flex h-[340px] w-[340px] items-center justify-center overflow-hidden rounded-[40px] border border-white/10 bg-[radial-gradient(circle_at_50%_40%,rgba(77,232,255,0.16),transparent_40%),linear-gradient(180deg,rgba(7,12,22,0.92),rgba(6,9,18,1))]">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
              <motion.div
                className="absolute h-56 w-56 rounded-full border border-cyan-300/10"
                animate={{ rotate: 360 }}
                transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute h-72 w-72 rounded-full border border-white/5"
                animate={{ rotate: -360 }}
                transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                animate={{ y: [0, -8, 0], rotate: [-6, 4, -6] }}
                transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <RocketMark />
              </motion.div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <Badge variant="blue" className="w-fit">
                SkyBob
              </Badge>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">Seu estudo fixo do nicho, gerado a partir do núcleo da empresa.</h1>
              <p className="max-w-2xl text-base leading-8 text-slate-300">
                O SkyBob lê o núcleo da empresa, organiza os sinais do nicho e entrega uma leitura estratégica clara para orientar conteúdo, posicionamento e Hook Lab.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center gap-2 text-cyan-200">
                  <Database className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">Fonte</span>
                </div>
                <div className="text-sm leading-6 text-slate-300">Usa os dados do núcleo da empresa. Não é um formulário solto.</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center gap-2 text-cyan-200">
                  <Target className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">Entrega</span>
                </div>
                <div className="text-sm leading-6 text-slate-300">Mostra o estudo do nicho de forma organizada e separa isso do Hook Lab.</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center gap-2 text-cyan-200">
                  <Lock className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.22em]">Persistência</span>
                </div>
                <div className="text-sm leading-6 text-slate-300">Depois de gerado, o estudo fica salvo no núcleo da empresa como referência fixa.</div>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button size="lg" onClick={onStart} disabled={!canStart} className="min-w-[220px]">
                <Rocket className="h-5 w-5" />
                Iniciar SkyBob
              </Button>
              <div className="text-sm text-slate-400">
                {canStart ? (
                  <>Campos úteis preenchidos no núcleo: <span className="font-semibold text-slate-200">{filledCount}</span></>
                ) : (
                  <>Preencha o núcleo da empresa antes de iniciar o SkyBob.</>
                )}
              </div>
            </div>

            {!canStart ? (
              <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
                O SkyBob depende do núcleo da empresa para funcionar. Preencha as informações principais e volte para iniciar.
                <div className="mt-4">
                  <Button asChild variant="outline">
                    <Link to="/authority-agents/nucleus">Abrir Núcleo da Empresa</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudyView({
  study,
  catalogAnalysis,
  likedHooksCount,
}: {
  study: SkyBobRunResponse;
  catalogAnalysis: SkyBobCatalogAnalysis | null;
  likedHooksCount: number;
}) {
  const catalogItems = catalogAnalysis?.detected_items || [];
  const insightCards = study.cards || [];

  return (
    <div className="space-y-6 relative z-10">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-cyan-400/16 bg-[linear-gradient(180deg,rgba(11,18,30,0.94),rgba(8,11,20,0.98))] backdrop-blur-md">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="blue">Leitura do nicho</Badge>
              <Badge variant="outline">{study.model_used}</Badge>
            </div>
            <CardTitle className="text-3xl leading-tight">O que o SkyBob entendeu sobre esse mercado</CardTitle>
            <CardDescription className="text-base leading-8 text-slate-300">{study.overview}</CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-white/10 bg-white/[0.02] backdrop-blur-md">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Direção editorial</Badge>
              <Badge variant="green">{likedHooksCount} hooks aprovados</Badge>
            </div>
            <CardTitle className="text-2xl">Como a IA quer posicionar a comunicação</CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-300">
              {study.hook_strategy.positioning_summary}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Priorizar
              </div>
              <div className="flex flex-wrap gap-2">
                {study.hook_strategy.preferred_angles.length ? study.hook_strategy.preferred_angles.map((item, index) => (
                  <Badge key={`${item}-${index}`} variant="green">
                    {item}
                  </Badge>
                )) : <span className="text-sm text-slate-300">Sem indicação específica.</span>}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                Reduzir
              </div>
              <div className="flex flex-wrap gap-2">
                {study.hook_strategy.angles_to_reduce.length ? study.hook_strategy.angles_to_reduce.map((item, index) => (
                  <Badge key={`${item}-${index}`} variant="yellow">
                    {item}
                  </Badge>
                )) : <span className="text-sm text-slate-300">Nada crítico sinalizado.</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <BulletList title="Padrões que funcionam" items={study.success_patterns} tone="success" />
        <BulletList title="Erros que enfraquecem a comunicação" items={study.mistakes} tone="warning" />
        <BulletList title="Oportunidades para destacar a marca" items={study.opportunities} />
      </div>

      <Card className="border-white/10 bg-white/[0.02] backdrop-blur-md">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Calendário editorial</Badge>
            <Badge variant="blue">{study.calendar_recommendations.length} recomendações</Badge>
          </div>
          <CardTitle className="text-2xl">Próximos movimentos sugeridos</CardTitle>
          <CardDescription className="text-sm leading-7 text-slate-300">
            Sequências e direções para transformar o estudo em conteúdo publicável.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {study.calendar_recommendations.length ? study.calendar_recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-200">
              <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <span>{item}</span>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
              Sem recomendações de calendário nesta execução.
            </div>
          )}
        </CardContent>
      </Card>

      {insightCards.length ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Destaques que a IA fez questão de enfatizar</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">Blocos estratégicos organizados para leitura rápida, sem misturar com o Hook Lab.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {insightCards.map((card) => (
              <InsightCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      ) : null}

      <Card className="border-white/10 bg-white/[0.02] backdrop-blur-md">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Núcleo interpretado</Badge>
            <Badge variant="blue">{catalogItems.length} items detectados</Badge>
          </div>
          <CardTitle className="text-2xl">O que o SkyBob identificou dentro da empresa</CardTitle>
          <CardDescription className="text-sm leading-7 text-slate-300">
            {catalogAnalysis?.summary || "Leitura resumida dos serviços, produtos e sinais do núcleo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalogItems.length ? catalogItems.map((item) => (
            <CatalogSignalCard key={item.id} item={item} />
          )) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
              Nenhum item foi detectado no catálogo desta execução.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HookLabView({
  hooks,
  likes,
  dislikes,
  canGenerate,
  isGenerating,
  onVote,
  onGenerate,
  generationLockedMessage,
}: {
  hooks: Array<SkyBobHook & { feedback: VoteValue }>;
  likes: number;
  dislikes: number;
  canGenerate: boolean;
  isGenerating: boolean;
  onVote: (hook: SkyBobHook, value: VoteValue) => void;
  onGenerate: () => void;
  generationLockedMessage?: string | null;
}) {
  return (
    <div className="space-y-6 relative z-10">
      <Card className="border-cyan-400/16 bg-[linear-gradient(180deg,rgba(11,18,30,0.94),rgba(8,11,20,0.98))] backdrop-blur-md">
        <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="blue">Hook Lab</Badge>
              <Badge variant="outline">somente hook + formato de vídeo</Badge>
              <Badge variant="outline">sem repetição nas novas rodadas</Badge>
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">Avalie os hooks e peça uma nova rodada quando quiser.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                O SkyBob usa seus likes e dislikes para adaptar a próxima geração. Quando você pedir novos hooks, ele mantém o estudo do nicho e troca somente o Hook Lab.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              Gostei: <span className="font-semibold text-slate-100">{likes}</span> · Não gostei: <span className="font-semibold text-slate-100">{dislikes}</span>
            </div>
            <Button size="lg" onClick={onGenerate} isLoading={isGenerating} loadingLabel="Gerando novos hooks" disabled={!canGenerate}>
              <RefreshCw className="h-5 w-5" />
              Gerar novos hooks
            </Button>
          </div>
        </CardContent>
      </Card>

      {generationLockedMessage ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {generationLockedMessage}
        </div>
      ) : null}

      {!generationLockedMessage && !likes && !dislikes ? (
        <div className="rounded-2xl border border-cyan-400/16 bg-cyan-400/[0.06] px-4 py-3 text-sm leading-6 text-cyan-50">
          Marque pelo menos um hook como gostei ou não gostei para a IA entender melhor a próxima geração.
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {hooks.length ? hooks.map((hook, index) => (
          <HookOptionCard key={`${hook.id}-${index}`} hook={hook} vote={hook.feedback} onVote={onVote} />
        )) : (
          <Card className="border-dashed border-white/10 bg-white/[0.02] md:col-span-2 xl:col-span-3 backdrop-blur-md">
            <CardContent className="flex min-h-[180px] items-center justify-center p-6 text-center text-sm text-slate-400">
              Nenhum hook disponível nesta rodada.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function SkyBobPage() {
  const userEmail = useAuthStore((state) => state.user?.email ?? null);
  const authToken = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const { data: coreData } = useQuery({
    queryKey: ["business-core", BUSINESS_CORE_PUBLIC_ID, "skybob", userEmail],
    queryFn: () => api.robots.businessCore.get(BUSINESS_CORE_PUBLIC_ID),
    enabled: Boolean(authToken && userEmail),
  });

  const nucleus = React.useMemo(() => normalizeNucleus(coreData), [coreData]);
  const nucleusSignature = React.useMemo(() => buildSkyBobNucleusSignature(nucleus), [nucleus]);

  const [workspace, setWorkspace] = React.useState<SkyBobWorkspace>(() => createEmptySkyBobWorkspace(""));

  React.useEffect(() => {
    setWorkspace(createEmptySkyBobWorkspace(""));
  }, [userEmail]);
  const workspaceRef = React.useRef(workspace);
  const [activeTab, setActiveTab] = React.useState<"study" | "hooklab">("study");
  const [isRunningStudy, setIsRunningStudy] = React.useState(false);
  const [isGeneratingHooks, setIsGeneratingHooks] = React.useState(false);
  const [executionProgress, setExecutionProgress] = React.useState(0);
  const [executionLabel, setExecutionLabel] = React.useState("Preparando missão");

  const handleBack = React.useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/dashboard");
  }, [navigate]);

  React.useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  React.useEffect(() => {
    const fromServer = parseSkyBobWorkspace(coreData?.skybob);
    if (fromServer) {
      setWorkspace(fromServer);
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      nucleus_signature: prev.nucleus_signature || nucleusSignature,
    }));
  }, [coreData?.skybob, nucleusSignature]);

  React.useEffect(() => {
    if (!isGeneratingHooks) {
      if (!isRunningStudy) {
        setExecutionProgress(0);
        setExecutionLabel("Preparando missão");
      }
      return;
    }

    const labels = [
      "Lendo o que você aprovou e rejeitou",
      "Reposicionando o Hook Lab",
      "Eliminando repetições",
      "Montando nova rodada de hooks",
    ];

    setExecutionLabel(labels[0]);
    setExecutionProgress(8);

    let tick = 0;
    const interval = window.setInterval(() => {
      tick += 1;
      setExecutionProgress((prev) => Math.min(prev + (prev < 55 ? 8 : prev < 82 ? 4 : 1.4), 92));
      setExecutionLabel(labels[Math.min(Math.floor(tick / 3), labels.length - 1)]);
    }, 520);

    return () => window.clearInterval(interval);
  }, [isGeneratingHooks, isRunningStudy]);

  const persistWorkspace = React.useCallback(
    async (nextWorkspace: SkyBobWorkspace, successMessage?: string) => {
      const payload = serializeSkyBobWorkspace(nextWorkspace);
      await api.robots.businessCore.patch(BUSINESS_CORE_PUBLIC_ID, { skybob: payload });
      if (successMessage) toastSuccess(successMessage);
    },
    []
  );

  const setWorkspaceAndPersist = React.useCallback(
    async (
      updater: (current: SkyBobWorkspace) => SkyBobWorkspace,
      options?: { successMessage?: string }
    ) => {
      const nextWorkspace = withWorkspaceTimestamp(updater(workspaceRef.current));
      workspaceRef.current = nextWorkspace;
      setWorkspace(nextWorkspace);
      await persistWorkspace(nextWorkspace, options?.successMessage);
      return nextWorkspace;
    },
    [persistWorkspace]
  );

  const handleHookVote = React.useCallback(
    (hook: SkyBobHook, value: VoteValue) => {
      void setWorkspaceAndPersist((current) => {
        const entry = current.hooks_feedback[hook.id] ?? createHookFeedbackItem(hook);
        return {
          ...current,
          hooks_feedback: {
            ...current.hooks_feedback,
            [hook.id]: {
              ...entry,
              item: hook,
              status: value,
              updated_at: nowIso(),
            },
          },
        };
      }).catch((error) => {
        toastApiError(error, "Não consegui salvar sua avaliação do hook");
      });
    },
    [setWorkspaceAndPersist]
  );

  const startSkyBob = React.useCallback(async () => {
    if (!countFilledNucleusFields(nucleus)) {
      toastInfo("Preencha o núcleo da empresa antes de iniciar o SkyBob.");
      return;
    }

    setActiveTab("study");
    setExecutionLabel("Preparando lançamento");
    setExecutionProgress(4);
    setIsRunningStudy(true);

    try {
      const job = await api.skybob.startJob({
        nucleus,
        mode: "full",
      });

      let latestStatus = job;
      setExecutionLabel(job.stage || "Missão na fila");
      setExecutionProgress(Math.max(4, Math.round((job.progress || 0) * 100)));

      while (latestStatus.status !== "done") {
        if (latestStatus.status === "error") {
          throw new Error(latestStatus.error || "A missão do SkyBob falhou.");
        }

        await sleep(900);

        latestStatus = await api.skybob.getJob(job.job_id);
        setExecutionLabel(latestStatus.stage || "Processando missão");
        setExecutionProgress(Math.max(4, Math.round((latestStatus.progress || 0) * 100)));
      }

      const jobResult = await api.skybob.getJobResult(job.job_id);
      const result = jobResult.result;
      const catalogAnalysis = result.catalog_analysis ?? null;

      setExecutionLabel("Missão concluída");
      setExecutionProgress(100);

      await sleep(650);

      await setWorkspaceAndPersist(
        (current) => ({
          ...current,
          nucleus_signature: nucleusSignature,
          model_used: result.model_used,
          catalog_analysis: catalogAnalysis,
          study: result,
        }),
        { successMessage: "SkyBob executado e salvo no núcleo da empresa." }
      );

      await sleep(300);
    } catch (error) {
      toastApiError(error, "Não consegui executar o SkyBob");
    } finally {
      setIsRunningStudy(false);
    }
  }, [nucleus, nucleusSignature, setWorkspaceAndPersist]);

  const study = workspace.study;
  const hasStudy = Boolean(study);
  const filledCount = React.useMemo(() => countFilledNucleusFields(nucleus), [nucleus]);
  const staleStudy = Boolean(hasStudy && workspace.nucleus_signature && workspace.nucleus_signature !== nucleusSignature);
  const catalogAnalysis = workspace.catalog_analysis ?? study?.catalog_analysis ?? null;

  const hooksWithFeedback = React.useMemo(
    () =>
      (study?.hooks || []).map((hook) => ({
        ...hook,
        feedback: workspace.hooks_feedback[hook.id]?.status ?? null,
      })),
    [study?.hooks, workspace.hooks_feedback]
  );

  const feedbackPreferences = React.useMemo(() => buildSkyBobFeedbackPreferences(workspace), [workspace]);
  const feedbackSummary = (feedbackPreferences.feedback_summary || {}) as Partial<{
    hook_likes: number;
    hook_dislikes: number;
  }>;
  const hookLikes = feedbackSummary.hook_likes ?? 0;
  const hookDislikes = feedbackSummary.hook_dislikes ?? 0;
  const canGenerateHooks = Boolean(study) && !staleStudy && hookLikes + hookDislikes > 0;

  const generateNewHooks = React.useCallback(async () => {
    if (!workspaceRef.current.study) {
      toastInfo("Inicie o SkyBob antes de gerar novos hooks.");
      return;
    }

    if (staleStudy) {
      toastInfo("O núcleo mudou. O Hook Lab fica congelado junto com o estudo salvo.");
      return;
    }

    const feedback = buildSkyBobFeedbackPreferences(workspaceRef.current);
    const feedbackSummary = (feedback.feedback_summary || {}) as Partial<{
      hook_likes: number;
      hook_dislikes: number;
    }>;
    const voteCount = (feedbackSummary.hook_likes ?? 0) + (feedbackSummary.hook_dislikes ?? 0);
    if (!voteCount) {
      toastInfo("Avalie pelo menos um hook antes de pedir uma nova rodada.");
      return;
    }

    setActiveTab("hooklab");
    setIsGeneratingHooks(true);

    try {
      const result = await api.skybob.run({
        nucleus,
        catalog_analysis: workspaceRef.current.catalog_analysis,
        preferences: feedback,
        previous_study: workspaceRef.current.study,
        mode: "refine",
      });

      if (!Array.isArray(result.hooks) || !result.hooks.length) {
        toastInfo("Não consegui montar uma nova rodada de hooks agora. Mantive a rodada anterior salva.");
        return;
      }

      setExecutionProgress(100);

      await setWorkspaceAndPersist(
        (current) => ({
          ...current,
          nucleus_signature: current.nucleus_signature,
          model_used: result.model_used,
          study: result,
        }),
        { successMessage: "Nova rodada de hooks gerada com base no seu feedback." }
      );
    } catch (error) {
      toastApiError(error, "Não consegui gerar novos hooks");
    } finally {
      setIsGeneratingHooks(false);
    }
  }, [nucleus, setWorkspaceAndPersist, staleStudy]);

  const resultHeroBadges = React.useMemo(
    () => [
      { label: "Estudo fixo do núcleo", variant: "green" as const },
      { label: study?.model_used || workspace.model_used || "modelo não informado", variant: "outline" as const },
      { label: `Gerado em ${formatDateTime(study?.generated_at || workspace.updated_at)}`, variant: "outline" as const },
    ],
    [study?.generated_at, study?.model_used, workspace.model_used, workspace.updated_at]
  );

  const generationLockedMessage = staleStudy
    ? "O núcleo da empresa foi alterado depois da geração deste estudo. Como o estudo base é fixo, o Hook Lab também fica congelado até existir um novo estudo salvo no núcleo."
    : null;

  return (
    <div className="relative min-h-dvh bg-[linear-gradient(180deg,#050914_0%,#070C16_100%)] overflow-hidden">
      
      {/* FUNDO GLOBAL ANIMADO PARA A PÁGINA INTEIRA (Resultados/Intro) */}
      {!isRunningStudy && !isGeneratingHooks && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <motion.div 
            className="absolute inset-0"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute top-[15%] left-[10%] w-[50vw] h-[50vw] rounded-full bg-cyan-500/5 blur-[120px]" />
            <div className="absolute bottom-[20%] right-[10%] w-[60vw] h-[60vw] rounded-full bg-purple-500/5 blur-[150px]" />
          </motion.div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:42px_42px] opacity-30" />
        </div>
      )}

      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <Button variant="outline" onClick={handleBack} className="border-white/15 bg-black/20 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      {(isRunningStudy || isGeneratingHooks) ? (
        <SpaceRunCard
          progress={executionProgress}
          label={executionLabel}
          title={isGeneratingHooks ? "Refinando o Hook Lab" : "Montando seu estudo do nicho"}
          description={
            isGeneratingHooks
              ? "O estudo base permanece fixo. Agora o SkyBob está lendo seus likes e dislikes para criar uma nova rodada de hooks sem repetir o que já passou."
              : "O SkyBob está consumindo o núcleo da empresa, interpretando o nicho e preparando uma entrega mais clara para o usuário."
          }
        />
      ) : (
        <div className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 pb-24 pt-24 sm:px-6 lg:px-8">
          {!hasStudy ? (
            <IntroScreen canStart={filledCount > 0} filledCount={filledCount} onStart={() => void startSkyBob()} />
          ) : (
            <>
              <Card className="relative overflow-hidden border-cyan-400/16 bg-[radial-gradient(circle_at_top,rgba(0,200,232,0.14),transparent_32%),linear-gradient(180deg,rgba(10,16,28,0.94),rgba(8,11,20,0.98))] backdrop-blur-md">
                <CardContent className="flex flex-col gap-6 p-6 md:p-8">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {resultHeroBadges.map((badge, index) => (
                          <Badge key={`${badge.label}-${index}`} variant={badge.variant}>
                            {badge.label}
                          </Badge>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <h1 className="text-3xl font-black tracking-tight md:text-4xl">SkyBob salvo e organizado em duas partes: estudo do nicho e Hook Lab.</h1>
                        <p className="max-w-3xl text-sm leading-8 text-slate-300 md:text-base">
                          Aqui o usuário enxerga primeiro o estudo do nicho com clareza. O Hook Lab fica separado e só muda quando você pede uma nova rodada de hooks.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-2 flex items-center gap-2 text-cyan-200">
                          <Layers3 className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Itens detectados</span>
                        </div>
                        <div className="text-2xl font-black">{catalogAnalysis?.detected_items.length ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-2 flex items-center gap-2 text-cyan-200">
                          <Lightbulb className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Hooks curtidos</span>
                        </div>
                        <div className="text-2xl font-black">{hookLikes}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-2 flex items-center gap-2 text-cyan-200">
                          <Target className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Blocos de insight</span>
                        </div>
                        <div className="text-2xl font-black">{study?.cards.length ?? 0}</div>
                      </div>
                    </div>
                  </div>

                  {staleStudy ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                      O núcleo da empresa mudou depois que este estudo foi salvo. Esta tela continua mostrando o último estudo válido salvo no núcleo.
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <TabButton active={activeTab === "study"} onClick={() => setActiveTab("study")} icon={<Sparkles className="h-4 w-4" />} label="Estudo do nicho" />
                    <TabButton active={activeTab === "hooklab"} onClick={() => setActiveTab("hooklab")} icon={<Rocket className="h-4 w-4" />} label="Hook Lab" />
                  </div>
                </CardContent>
              </Card>

              {activeTab === "study" && study ? (
                <StudyView study={study} catalogAnalysis={catalogAnalysis} likedHooksCount={hookLikes} />
              ) : null}

              {activeTab === "hooklab" && study ? (
                <HookLabView
                  hooks={hooksWithFeedback}
                  likes={hookLikes}
                  dislikes={hookDislikes}
                  canGenerate={canGenerateHooks}
                  isGenerating={isGeneratingHooks}
                  onVote={handleHookVote}
                  onGenerate={() => void generateNewHooks()}
                  generationLockedMessage={generationLockedMessage}
                />
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}