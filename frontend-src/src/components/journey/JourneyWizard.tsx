import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Particles } from "@/components/effects/Particles";
import { useNavigate } from "react-router-dom";
import { JOURNEY_STEPS } from "@/constants/journey";
import type { BriefingIn } from "@/types/api";
import type { JourneyStep, Achievement } from "@/types/journey";
import { journeyReducer, initialJourneyState, validateField } from "@/state/journeyStore";
import { JourneyProgress } from "@/components/journey/JourneyProgress";
import { MônicaPanel } from "@/components/journey/CoachPanel";
import { RobotPreviewPanel } from "@/components/journey/RobotPreviewPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "@/components/journey/Sparkles";
import { ConfettiBurst } from "@/components/effects/ConfettiBurst";
import { transitions, fadeUp } from "@/lib/motion";
import { useCreateRobot } from "@/hooks/useRobots";
import { api } from "@/services/robots";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { CheckCircle2, Trophy, Timer, Star, Eye, EyeOff, Bot, Sparkles as SparkleIcon } from "lucide-react";

const TONE_OPTIONS = [
  { id: "simples", label: "Simples" },
  { id: "direta", label: "Direta" },
  { id: "amigavel", label: "Amigável" },
  { id: "tecnica", label: "Técnica" },
  { id: "didatica", label: "Didática" },
  { id: "acolhedora", label: "Acolhedora" },
  { id: "seria", label: "Séria" },
  { id: "divertida", label: "Divertida" },
  { id: "inspiradora", label: "Inspiradora" },
];

function achievementsFrom(state: ReturnType<typeof initialJourneyState>): Achievement[] {
  const durationMs = Date.now() - state.startedAt;
  const durationMin = durationMs / 60000;

  const allFilled =
    state.values.company_name?.trim() &&
    state.values.niche?.trim() &&
    state.values.audience?.trim() &&
    state.values.offer?.trim();

  const out: Achievement[] = [];
  if (state.backCount === 0) {
    out.push({
      id: "perfect",
      title: "Jornada perfeita",
      description: "Concluiu sem voltar etapas.",
      tone: "blue",
    });
  }
  if (durationMin <= 6) {
    out.push({
      id: "fast",
      title: "Criador ágil",
      description: "Concluiu em tempo recorde.",
      tone: "green",
    });
  }
  if (allFilled) {
    out.push({
      id: "complete",
      title: "Estrategista",
      description: "Base da empresa preenchida.",
      tone: "yellow",
    });
  }
  return out;
}

function coachHint(stepId: string) {
  switch (stepId) {
    case "company_name": return `Nome da empresa. Se já tem marca, use exatamente como nas redes.`;
    case "owner_name": return `O nome de quem está à frente do negócio. A IA usará isso para criar uma conexão mais pessoal nas respostas!`;
    case "niche": return `Defina o recorte: "o quê" + "para quem" + "contexto".`;
    case "audience": return `Descreva pelo contexto e dor. Ex: "mulheres 25-45 buscando estética natural".`;
    case "offer": return `Sua promessa principal. Ex: "clareza em 7 dias" ou "consultoria em tráfego".`;
    case "region": return `Região ajusta vocabulário. Pode ser Brasil, ou a cidade para foco local.`;
    case "tone": return `Escolha como a IA vai soar. Você pode selecionar mais de uma opção para criar um tom único!`;
    case "goals": return `Objetivo mensurável. Ex: mais agendamentos ou leads.`;
    case "real_differentials": return `Fase 2: Esqueça promessas vazias. Fale de método próprio, anos de mercado ou garantias.`;
    case "restrictions": return `Fase 2: Defenda a marca. O que o robô não pode fazer em hipótese alguma?`;
    case "forbidden_content": return `Fase 2: Assuntos polêmicos ou concorrentes que o robô deve ignorar.`;
    case "reviews": return `Fase 2: Onde o público te elogia mais?`;
    case "testimonials": return `Fase 2: A IA adora usar histórias reais para provar seu ponto.`;
    case "usable_links_texts": return `Fase 2: Cole links que você quer que a IA espalhe nos textos.`;
    case "site": return `Fase 3: URL oficial do seu site.`;
    case "instagram": return `Fase 3: O seu @ do Instagram.`;
    case "google_business_profile": return `Fase 3: Fundamental se você atende localmente!`;
    case "linkedin": return `Fase 3: Essencial se o seu foco for B2B.`;
    case "youtube": return `Fase 3: O segundo maior buscador do mundo.`;
    case "tiktok": return `Fase 3: Onde a descoberta rápida acontece.`;
    default: return `Vamos avançar com calma. Você sempre pode ajustar depois no painel.`;
  }
}

export function JourneyWizard() {
  const [state, dispatch] = React.useReducer(journeyReducer, undefined, initialJourneyState);
  const navigate = useNavigate();
  const createRobot = useCreateRobot();

  const step = JOURNEY_STEPS[state.stepIndex];
  const value = state.values[step.id] || "";

  const [showSpark, setShowSpark] = React.useState(false);
  const [coachMessage, setMônicaMessage] = React.useState(() => coachHint(JOURNEY_STEPS[0]?.id ?? "company_name"));
  const coachHistory = React.useRef<string[]>([]);
  const [completed, setCompleted] = React.useState<null | { publicId: string; title: string; achievements: Achievement[] }>(null);
  const [confetti, setConfetti] = React.useState(false);
  const [egg, setEgg] = React.useState(false);

  // Estados locais para múltipla seleção de Tone
  const [selectedTones, setSelectedTones] = React.useState<string[]>([]);
  const [showCustomTone, setShowCustomTone] = React.useState(false);
  const [customTone, setCustomTone] = React.useState("");

  React.useEffect(() => {
    if (step.id !== "tone") return;
    const v = (state.values.tone ?? "").toString();
    if (!v) {
      setSelectedTones([]);
      setCustomTone("");
      setShowCustomTone(false);
      return;
    }
    const parts = v.split(", ").filter(Boolean);
    const knownTones = TONE_OPTIONS.map((o) => o.label);
    const matched = parts.filter((p) => knownTones.includes(p));
    const others = parts.filter((p) => !knownTones.includes(p));

    setSelectedTones(matched);
    if (others.length > 0) {
      setShowCustomTone(true);
      setCustomTone(others.join(", "));
    } else {
      setShowCustomTone(false);
      setCustomTone("");
    }
  }, [state.stepIndex, step.id, state.values.tone]);

  const error = validateField(step.id as any, value);
  const isLast = state.stepIndex === JOURNEY_STEPS.length - 1;
  const canAdvance = !error;

  const setValue = (v: string) => dispatch({ type: "SET_VALUE", field: step.id as any, value: v });

  const updateToneValue = (tones: string[], showC: boolean, cTone: string) => {
    const all = [...tones];
    if (showC && cTone.trim()) all.push(cTone.trim());
    setValue(all.join(", "));
  };

  const handleToneChange = (toneLabel: string) => {
    let newTones = [...selectedTones];
    if (newTones.includes(toneLabel)) {
      newTones = newTones.filter((t) => t !== toneLabel);
    } else {
      newTones.push(toneLabel);
    }
    setSelectedTones(newTones);
    updateToneValue(newTones, showCustomTone, customTone);
  };

  const handleCustomToggle = () => {
    const nextShow = !showCustomTone;
    setShowCustomTone(nextShow);
    if (!nextShow) setCustomTone("");
    updateToneValue(selectedTones, nextShow, nextShow ? customTone : "");
  };

  const handleCustomChange = (v: string) => {
    setCustomTone(v);
    updateToneValue(selectedTones, showCustomTone, v);
  };

  const onNext = async () => {
    dispatch({ type: "TOUCH", field: step.id as any });
    if (!canAdvance) return;
    if (value.trim().length > 0 || step.optional) {
      setShowSpark(true);
      window.setTimeout(() => setShowSpark(false), 700);
    }
    if (!isLast) { dispatch({ type: "NEXT" }); return; }

    // 1. Payload do Briefing com TODAS as informações para criar as system_instructions da IA
    const briefingPayload: BriefingIn = {
      company_name: state.values.company_name?.trim() || "",
      owner_name: state.values.owner_name?.trim() || "",
      niche: state.values.niche?.trim() || "",
      audience: state.values.audience?.trim() || "",
      offer: state.values.offer?.trim() || "",
      region: state.values.region?.trim() || "Brasil",
      tone: state.values.tone?.trim() || "Profissional, direto, claro",
      competitors: state.values.competitors?.trim() || "",
      goals: state.values.goals?.trim() || "Aumentar autoridade e ser citado por IA",
      
      // Enviando fases 2 e 3 para a IA ficar blindada com links e regras:
      real_differentials: state.values.real_differentials?.trim() || "",
      restrictions: state.values.restrictions?.trim() || "",
      forbidden_content: state.values.forbidden_content?.trim() || "",
      reviews: state.values.reviews?.trim() || "",
      testimonials: state.values.testimonials?.trim() || "",
      usable_links_texts: state.values.usable_links_texts?.trim() || "",
      site: state.values.site?.trim() || "",
      google_business_profile: state.values.google_business_profile?.trim() || "",
      instagram: state.values.instagram?.trim() || "",
      linkedin: state.values.linkedin?.trim() || "",
      youtube: state.values.youtube?.trim() || "",
      tiktok: state.values.tiktok?.trim() || "",
    };

    // 2. ALIMENTAÇÃO DO NÚCLEO GLOBAL NO BACKEND
    const corePayload = {
      company_name: state.values.company_name?.trim() || "",
      owner_name: state.values.owner_name?.trim() || "",
      city_state: state.values.region?.trim() || "",
      main_audience: state.values.audience?.trim() || "",
      services_products: state.values.offer?.trim() || "",
      real_differentials: state.values.real_differentials?.trim() || "",
      restrictions: state.values.restrictions?.trim() || "",
      reviews: state.values.reviews?.trim() || "",
      testimonials: state.values.testimonials?.trim() || "",
      usable_links_texts: state.values.usable_links_texts?.trim() || "",
      forbidden_content: state.values.forbidden_content?.trim() || "",
      site: state.values.site?.trim() || "",
      google_business_profile: state.values.google_business_profile?.trim() || "",
      instagram: state.values.instagram?.trim() || "",
      linkedin: state.values.linkedin?.trim() || "",
      youtube: state.values.youtube?.trim() || "",
      tiktok: state.values.tiktok?.trim() || "",
    };
    try {
      const created = await createRobot.mutateAsync(briefingPayload);
      await api.robots.businessCore.patch("business-core", corePayload);
      toastSuccess("Inteligência e Robô criados com sucesso!");
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 950);
      
      const ach = achievementsFrom(state as any);
      setMônicaMessage("Tudo certo! Estrutura montada.");
      setCompleted({ publicId: created.public_id, title: created.title, achievements: ach });
    } catch (e) {
      toastApiError(e, "Falha ao criar configuração");
    }
  };

  const onBack = () => { if (state.stepIndex === 0) return; dispatch({ type: "BACK" }); };
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => { if (e.key === "Enter") { e.preventDefault(); void onNext(); } };

  React.useEffect(() => {
    if (completed) return;
    const base = coachHint(step.id) ?? (step.helper ? step.helper : `Etapa: ${step.label}.`);
    const msg = step.optional ? `${base} (Opcional)` : base;
    const last = coachHistory.current[0];
    if (msg !== last) {
      coachHistory.current = [msg, ...coachHistory.current].slice(0, 6);
      setMônicaMessage(msg);
    }
  }, [step.id, completed, step.optional, step.helper, step.label]);

  const getAchievementIcon = (id: string) => {
    switch (id) {
      case "perfect": return <Trophy className="h-4 w-4 text-google-blue" />;
      case "fast": return <Timer className="h-4 w-4 text-google-green" />;
      case "complete": return <Star className="h-4 w-4 text-google-yellow" />;
      default: return <SparkleIcon className="h-4 w-4" />;
    }
  };

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
      <Particles />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <JourneyProgress stepIndex={state.stepIndex} />

          <Card variant="glass" className="relative overflow-hidden">
            <Sparkles active={showSpark} />
            
            {/* LÓGICA INVERTIDA AQUI: Pergunta em destaque e aviso pequeno */}
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={step.accent as any}>{step.label}</Badge>
                {step.optional ? <Badge variant="outline">opcional</Badge> : null}
              </div>
              <CardTitle className="mt-2 text-xl font-bold text-foreground">
                {step.helper}
              </CardTitle>
              <CardDescription className="text-sm">
                Responda e avance.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <AnimatePresence mode="wait">
                <motion.div key={step.id} initial="hidden" animate="show" exit="hidden" variants={fadeUp} transition={transitions.base} className="space-y-2">
                  
                  {step.id === "tone" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {TONE_OPTIONS.map((opt) => {
                          const isSelected = selectedTones.includes(opt.label);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleToneChange(opt.label)}
                              className={["rounded-xl border px-3 py-2.5 text-center transition text-sm flex items-center justify-center", isSelected ? "border-google-blue bg-[rgba(0,200,232,0.1)] text-google-blue font-semibold shadow-sm" : "border-border/60 hover:bg-background/40 hover:border-border font-medium text-foreground/80"].join(" ")}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={handleCustomToggle}
                          className={["rounded-xl border px-3 py-2.5 text-center transition text-sm flex items-center justify-center", showCustomTone ? "border-google-blue bg-[rgba(0,200,232,0.1)] text-google-blue font-semibold shadow-sm" : "border-border/60 hover:bg-background/40 hover:border-border font-medium text-foreground/80"].join(" ")}
                        >
                          Outra(s)...
                        </button>
                      </div>

                      <AnimatePresence>
                        {showCustomTone && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                            <Input
                              autoFocus
                              className="mt-2"
                              value={customTone}
                              onChange={(e) => handleCustomChange(e.target.value)}
                              onKeyDown={onKeyDown}
                              placeholder="Digite outros tons (separados por vírgula)"
                              aria-invalid={Boolean(error)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} placeholder={step.placeholder} aria-invalid={Boolean(error)} />
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-xs">
                      {error && state.touched[step.id] ? <span className="text-google-red">{error}</span> : <span className="text-muted-foreground">{step.optional ? "Pode deixar em branco e avançar." : "Obrigatório."}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{state.stepIndex + 1}/{JOURNEY_STEPS.length}</div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
                <Button variant="ghost" onClick={onBack} disabled={state.stepIndex === 0}>Voltar</Button>
                <div className="flex gap-2 sm:justify-end">
                  <Button variant="glass" onClick={() => { setValue(""); dispatch({ type: "TOUCH", field: step.id as any }); void onNext(); }}>Pular</Button>
                  <Button variant="accent" onClick={() => void onNext()} isLoading={createRobot.isPending} loadingLabel={isLast ? "Montando…" : "Avançando…"}>{isLast ? "Finalizar" : "Avançar"}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <MônicaPanel step={step as any} message={coachMessage} kind="phase" />
        </div>

        <div className="space-y-6">
          <RobotPreviewPanel values={state.values as Record<string, string>} stepIndex={state.stepIndex} />
          <Card variant="glass">
            <CardContent className="p-5 space-y-3">
              <div className="text-sm font-semibold">Progresso Estratégico</div>
              <div className="text-xs text-muted-foreground">Fase 1: Configuração do Robô <br/>Fase 2: Provas Sociais <br/>Fase 3: Canais Digitais</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {completed ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 p-4 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ConfettiBurst active={confetti} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25, delay: 0.1 }}
              className="w-full max-w-2xl relative"
            >
              <Card className="overflow-hidden rounded-[2.5rem] border-border/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] bg-card/90 backdrop-blur-3xl relative">
                
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-[rgba(0,200,232,0.12)] blur-[60px] pointer-events-none rounded-full" />
                <div className="h-2 w-full bg-gradient-to-r from-google-blue via-google-green to-google-yellow" />

                <CardContent className="p-8 sm:p-12 text-center space-y-8 relative z-10">
                  
                  <motion.div 
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.3 }}
                    className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-google-green/10 border border-google-green/20 text-google-green shadow-[0_0_40px_-10px_rgba(0,210,120,0.40)]"
                  >
                    <CheckCircle2 className="h-12 w-12" />
                  </motion.div>

                  <div className="space-y-3">
                    <motion.h2 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                      className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent"
                    >
                      Cérebro Conectado!
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                      className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto leading-relaxed"
                    >
                      O {completed.title} nasceu. O Núcleo da empresa foi salvo e os 10 Agentes já estão a postos.
                    </motion.p>
                  </div>

                  {completed.achievements.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto pt-2"
                    >
                      {completed.achievements.map((a) => (
                        <div key={a.id} className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl bg-background/50 border border-border/50 shadow-sm transition hover:bg-background/80">
                          {getAchievementIcon(a.id)}
                          <span className="font-semibold text-xs text-foreground uppercase tracking-wider">{a.title}</span>
                          <span className="text-[10px] text-muted-foreground text-center px-2">{a.description}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {completed.achievements.some((a) => a.id === "perfect") && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="max-w-md mx-auto">
                      <button 
                        onClick={() => setEgg(!egg)}
                        className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mx-auto py-2"
                      >
                        {egg ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {egg ? "Ocultar segredo" : "Revelar segredo"}
                      </button>
                      <AnimatePresence>
                        {egg && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 p-4 rounded-2xl bg-google-blue/5 border border-google-blue/20 text-xs text-google-blue font-medium leading-relaxed">
                              ✨ Um criador de verdade não erra o caminho. Você preencheu toda a fundação estratégica sem hesitar e sem voltar atrás nenhuma vez. A IA valoriza líderes decididos.
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                    className="flex flex-col sm:flex-row justify-center gap-4 pt-4 border-t border-border/40"
                  >
                    <Button 
                      variant="outline" 
                      onClick={() => navigate(`/robots/${completed.publicId}`)}
                      className="rounded-2xl h-14 px-6 text-sm sm:w-1/2 font-semibold shadow-sm hover:bg-muted/50"
                    >
                      <Bot className="mr-2.5 h-4 w-4" /> Bater Papo
                    </Button>
                    <Button 
                      variant="accent" 
                      onClick={() => navigate(`/authority-agents`)}
                      className="rounded-2xl h-14 px-6 text-sm sm:w-1/2 font-semibold shadow-xl shadow-google-blue/20 hover:scale-[1.02] transition-transform"
                    >
                      <SparkleIcon className="mr-2.5 h-4 w-4" /> Acionar os 10 Agentes
                    </Button>
                  </motion.div>

                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

}
