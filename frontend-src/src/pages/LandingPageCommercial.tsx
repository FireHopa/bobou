import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, BrainCircuit, Zap, ShieldCheck, Bot, TerminalSquare } from "lucide-react";
import { Particles } from "@/components/effects/Particles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MotionInView } from "@/components/motion/MotionInView";
import { RobotsMockGrid } from "@/components/landing/RobotsMockGrid";
import { ExplainerA3Commercial } from "@/components/landing/ExplainerA3Commercial";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function LandingPageCommercial() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div aria-hidden className="pointer-events-none absolute top-[-20%] left-[-10%] h-[60vw] max-h-[800px] w-[60vw] max-w-[800px] rounded-full bg-[rgba(0,200,232,0.08)] blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[50vw] max-h-[700px] w-[50vw] max-w-[700px] rounded-full bg-google-green/10 blur-[140px]" />

      <Particles className="absolute inset-0 z-0 opacity-60" />

      <section className="relative z-10 flex min-h-[90vh] w-full items-center px-4 pb-16 pt-24">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="flex w-full flex-col items-start">
            <MotionInView>
              <div className="mb-8 flex w-fit items-center gap-2 rounded-full border border-google-blue/20 bg-[rgba(0,200,232,0.08)] px-3 py-1.5 text-xs font-semibold tracking-wide text-google-blue shadow-soft">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-google-blue opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-google-blue"></span>
                </span>
                Inteligência Artificial Premium
              </div>
              <h1 className="text-balance text-5xl font-extrabold tracking-tight md:text-6xl lg:text-7xl leading-[1.1]">
                Sua autoridade deixa de ser conteúdo e vira <span className="bg-gradient-to-r from-google-blue via-google-green to-google-yellow bg-clip-text text-transparent">sistema de crescimento.</span>
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
                Estruture conhecimento para ser citado por IAs, gere criativos no Motor de Imagem e organize a execução no Bobar. Menos improviso, mais presença, clareza e escala.
              </p>
            </MotionInView>

            <MotionInView delay={0.1} className="mt-10 flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <Button asChild variant="accent" size="lg" className="group h-14 w-full rounded-full px-8 text-base shadow-xl shadow-google-blue/20 sm:w-auto">
                <Link to="/journey">
                  Iniciar Jornada <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-14 w-full rounded-full bg-background/50 px-8 text-base backdrop-blur-md transition-colors hover:bg-muted/50 sm:w-auto">
                <Link to="/authority-agents">
                  <Bot className="mr-2 h-5 w-5 text-google-blue" /> Ver Agentes
                </Link>
              </Button>
            </MotionInView>

            <MotionInView delay={0.2} className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-3">
              {[
                { icon: BrainCircuit, title: "Autoridade Estruturada", desc: "Base pronta para IA entender e citar", color: "text-google-blue", bg: "bg-[rgba(0,200,232,0.08)]" },
                { icon: Zap, title: "Criativos Mais Rápidos", desc: "Imagem e conteúdo saindo no mesmo fluxo", color: "text-google-yellow", bg: "bg-google-yellow/10" },
                { icon: ShieldCheck, title: "Operação Mais Clara", desc: "Execução organizada sem perder padrão", color: "text-google-green", bg: "bg-google-green/10" },
              ].map((feat, i) => (
                <Card key={i} className="flex flex-col justify-center rounded-3xl border-border/50 bg-background/40 p-5 shadow-sm backdrop-blur-md transition-colors hover:border-border">
                  <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-2xl", feat.bg)}>
                    <feat.icon className={cn("h-6 w-6", feat.color)} />
                  </div>
                  <h3 className="text-base font-semibold">{feat.title}</h3>
                  <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{feat.desc}</p>
                </Card>
              ))}
            </MotionInView>
          </div>

          <MotionInView delay={0.15} className="flex w-full justify-center lg:justify-end">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...transitions.slow, delay: 0.2 }}
              className="relative w-full max-w-lg xl:ml-10 lg:max-w-none"
            >
              <div className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-tr from-google-blue/20 via-transparent to-google-yellow/20 blur-3xl opacity-60" />
              <div className="rounded-[2.5rem] border bg-gradient-to-br from-border/50 to-background/20 p-2.5 shadow-2xl backdrop-blur-sm">
                <div className="w-full overflow-hidden rounded-[2rem] bg-background">
                  <RobotsMockGrid />
                </div>
              </div>
            </motion.div>
          </MotionInView>
        </div>
      </section>

      <section className="relative z-10 w-full flex-1 border-y border-border/40 bg-muted/30 py-32">
        <div className="mx-auto w-full max-w-7xl px-4">
          <MotionInView>
            <div className="mx-auto mb-16 max-w-3xl text-center">
              <Badge variant="outline" className="mb-6 bg-background px-4 py-1.5 text-sm">
                <TerminalSquare className="mr-2 h-4 w-4" /> Engenharia de Prompt Invisível
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Tudo que sua autoridade precisa para virar resultado.</h2>
              <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
                AIO, AEO e GEO posicionam sua base para ser entendida e escolhida. O Motor de Imagem acelera o visual. O Bobar transforma a estratégia em execução previsível para o time operar com consistência.
              </p>
            </div>
          </MotionInView>
          <ExplainerA3Commercial />
        </div>
      </section>

      <section className="relative z-10 flex w-full flex-1 flex-col justify-end px-4 pb-12 pt-32">
        <div className="mx-auto w-full max-w-6xl">
          <MotionInView>
            <Card className="group relative mb-12 w-full overflow-hidden rounded-[3rem] border-0 bg-transparent shadow-2xl">
              <div className="absolute inset-0 z-0 bg-[rgba(0,200,232,0.08)] backdrop-blur-xl" />
              <div className="absolute inset-0 z-0 bg-gradient-to-br from-google-blue/20 via-background to-google-green/20 opacity-80 transition-opacity duration-700 group-hover:opacity-100" />

              <div className="relative z-10 flex flex-col items-center px-6 py-20 text-center md:px-16">
                <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
                  <Badge className="border-transparent bg-google-blue px-3 py-1 text-sm text-foreground">Fase 1</Badge>
                  <Badge variant="secondary" className="border-border/50 bg-background/50 px-3 py-1 text-sm backdrop-blur-md">Criação Rápida</Badge>
                  <Badge variant="outline" className="border-border/50 bg-background/50 px-3 py-1 text-sm backdrop-blur-md"><Sparkles className="mr-1.5 h-3.5 w-3.5" /> UX Premium</Badge>
                </div>

                <h3 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                  Pronto para transformar conhecimento em autoridade que escala?
                </h3>

                <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
                  Em poucos minutos você estrutura sua base, ativa agentes, acelera criativos e organiza a operação para vender com mais clareza.
                </p>

                <div className="mt-12">
                  <Button asChild variant="accent" size="lg" className="h-16 rounded-full px-12 text-xl shadow-2xl shadow-google-blue/20 transition-transform duration-300 hover:scale-105">
                    <Link to="/journey">
                      Criar Meu Cérebro Digital
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="absolute left-0 right-0 top-0 h-2 bg-gradient-to-r from-google-blue via-google-green to-google-yellow opacity-80" />
            </Card>
          </MotionInView>

          <div className="text-center text-sm text-muted-foreground/60">
            &copy; 2026 Casa do Ads. Desenvolvido para transformar autoridade em escala.
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingPageCommercial;
