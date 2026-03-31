import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, BrainCircuit, Zap, ShieldCheck, Bot, TerminalSquare } from "lucide-react";
import { Particles } from "@/components/effects/Particles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MotionInView } from "@/components/motion/MotionInView";
import { RobotsMockGrid } from "@/components/landing/RobotsMockGrid";
import { ExplainerA3 } from "@/components/landing/ExplainerA3";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col">
      {/* Background dinâmico super expandido para cobrir telas gigantes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div aria-hidden className="pointer-events-none absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full bg-[rgba(0,200,232,0.08)] blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] rounded-full bg-google-green/10 blur-[140px]" />
      
      <Particles className="absolute inset-0 z-0 opacity-60" />

      {/* HERO SECTION - Agora com min-h-[90vh] para ocupar a tela inteira logo de cara */}
      <section className="relative z-10 w-full min-h-[90vh] flex items-center pt-24 pb-16 px-4">
        <div className="w-full max-w-7xl mx-auto grid items-center gap-12 lg:gap-20 lg:grid-cols-2">
          
          <div className="flex flex-col items-start w-full">
            <MotionInView>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,200,232,0.08)] border border-google-blue/20 text-google-blue text-xs font-semibold tracking-wide w-fit mb-8 shadow-soft">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-google-blue opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-google-blue"></span>
                </span>
                Inteligência Artificial Premium
              </div>
              <h1 className="text-balance text-5xl font-extrabold tracking-tight md:text-6xl lg:text-7xl leading-[1.1]">
                O Cérebro Digital da sua <span className="text-transparent bg-clip-text bg-gradient-to-r from-google-blue via-google-green to-google-yellow">Autoridade.</span>
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg md:text-xl text-muted-foreground leading-relaxed">
                Transforme seu conhecimento em um ecossistema de agentes especialistas. Uma jornada guiada para criar instruções de alto impacto, prontas para dominar as buscas e encantar clientes.
              </p>
            </MotionInView>

            <MotionInView delay={0.1} className="mt-10 flex flex-col w-full sm:w-auto sm:flex-row gap-4">
              <Button asChild variant="accent" size="lg" className="rounded-full h-14 px-8 text-base shadow-xl shadow-google-blue/20 group w-full sm:w-auto">
                <Link to="/journey">
                  Iniciar Jornada <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full h-14 px-8 text-base bg-background/50 backdrop-blur-md hover:bg-muted/50 transition-colors w-full sm:w-auto">
                <Link to="/authority-agents">
                  <Bot className="mr-2 h-5 w-5 text-google-blue" /> Ver Agentes
                </Link>
              </Button>
            </MotionInView>

            <MotionInView delay={0.2} className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl">
              {[
                { icon: BrainCircuit, title: "Núcleo Central", desc: "1 cérebro para 10 agentes", color: "text-google-blue", bg: "bg-[rgba(0,200,232,0.08)]" },
                { icon: Zap, title: "Geração Ágil", desc: "Roteiros e posts em 1 clique", color: "text-google-yellow", bg: "bg-google-yellow/10" },
                { icon: ShieldCheck, title: "Blindado", desc: "Respeita suas regras", color: "text-google-green", bg: "bg-google-green/10" },
              ].map((feat, i) => (
                <Card key={i} className="bg-background/40 backdrop-blur-md border-border/50 p-5 rounded-3xl hover:border-border transition-colors shadow-sm flex flex-col justify-center">
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center mb-4", feat.bg)}>
                    <feat.icon className={cn("h-6 w-6", feat.color)} />
                  </div>
                  <h3 className="font-semibold text-base">{feat.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-snug">{feat.desc}</p>
                </Card>
              ))}
            </MotionInView>
          </div>

          {/* Mock visual gigante ocupando a direita */}
          <MotionInView delay={0.15} className="w-full flex justify-center lg:justify-end">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...transitions.slow, delay: 0.2 }}
              className="relative w-full max-w-lg lg:max-w-none xl:ml-10"
            >
              <div className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-tr from-google-blue/20 via-transparent to-google-yellow/20 blur-3xl opacity-60" />
              <div className="rounded-[2.5rem] p-2.5 bg-gradient-to-br from-border/50 to-background/20 backdrop-blur-sm border shadow-2xl">
                <div className="rounded-[2rem] overflow-hidden bg-background w-full">
                  <RobotsMockGrid />
                </div>
              </div>
            </motion.div>
          </MotionInView>
          
        </div>
      </section>

      {/* SEÇÃO EXPLICAÇÃO - Mais alta e imersiva */}
      <section className="relative z-10 py-32 bg-muted/30 border-y border-border/40 w-full flex-1">
        <div className="w-full max-w-7xl mx-auto px-4">
          <MotionInView>
            <div className="mb-16 max-w-3xl text-center mx-auto">
              <Badge variant="outline" className="mb-6 bg-background px-4 py-1.5 text-sm">
                <TerminalSquare className="h-4 w-4 mr-2" /> Engenharia de Prompt Invisível
              </Badge>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Projetado para ser citado por IAs.</h2>
              <p className="mt-6 text-xl text-muted-foreground leading-relaxed">
                Seu robô não gera apenas texto. Ele nasce com a estrutura avançada (AIO, AEO, GEO) que favorece a leitura por mecanismos de busca e sistemas de IA como ChatGPT e Gemini.
              </p>
            </div>
          </MotionInView>
          <ExplainerA3 />
        </div>
      </section>

      {/* SUPER CTA & FOOTER - Enchendo a tela perfeitamente */}
      <section className="relative z-10 w-full flex flex-col justify-end pt-32 pb-12 px-4 flex-1">
        <div className="w-full max-w-6xl mx-auto">
          <MotionInView>
            <Card className="relative w-full overflow-hidden rounded-[3rem] border-0 bg-transparent shadow-2xl group mb-12">
              <div className="absolute inset-0 bg-[rgba(0,200,232,0.08)] backdrop-blur-xl z-0" />
              <div className="absolute inset-0 bg-gradient-to-br from-google-blue/20 via-background to-google-green/20 z-0 opacity-80 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative z-10 py-20 px-6 md:px-16 text-center flex flex-col items-center">
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <Badge className="bg-google-blue text-foreground border-transparent text-sm px-3 py-1">Fase 1</Badge>
                  <Badge variant="secondary" className="bg-background/50 backdrop-blur-md border-border/50 text-sm px-3 py-1">Criação Rápida</Badge>
                  <Badge variant="outline" className="bg-background/50 backdrop-blur-md border-border/50 text-sm px-3 py-1"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> UX Premium</Badge>
                </div>
                
                <h3 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl">
                  Pronto para clonar a sua inteligência?
                </h3>
                
                <p className="mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground">
                  Avance por níveis, desbloqueie conquistas e veja seu ecossistema de agentes ganhar vida em tempo real. A configuração leva menos de 5 minutos.
                </p>
                
                <div className="mt-12">
                  <Button asChild variant="accent" size="lg" className="rounded-full h-16 px-12 text-xl shadow-2xl shadow-google-blue/20 hover:scale-105 transition-transform duration-300">
                    <Link to="/journey">
                      Criar Meu Cérebro Digital
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-google-blue via-google-green to-google-yellow opacity-80" />
            </Card>
          </MotionInView>
          
          {/* Rodapé sutil para ancorar a página */}
          <div className="text-center text-sm text-muted-foreground/60">
            &copy; 2026 Casa do Ads. Desenvolvido para transformar autoridade em escala.
          </div>
        </div>
      </section>

    </div>
  );
}

export default LandingPage;