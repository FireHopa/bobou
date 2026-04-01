import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MotionInView } from "@/components/motion/MotionInView";
import { BrainCircuit, Quote, Globe2, ImagePlus, Briefcase } from "lucide-react";

const primaryItems = [
  {
    key: "AIO",
    title: "AIO",
    headline: "Conteúdo que IA absorve",
    desc: "Sua autoridade vira ativo estruturado para modelos de IA entenderem, reutilizarem e citarem.",
    variant: "blue" as const,
    Icon: BrainCircuit,
    barClass: "bg-google-blue/60",
  },
  {
    key: "AEO",
    title: "AEO",
    headline: "Respostas que ganham atenção",
    desc: "Blocos prontos para snippets, FAQs e respostas objetivas que aumentam visibilidade e confiança.",
    variant: "red" as const,
    Icon: Quote,
    barClass: "bg-google-red/60",
  },
  {
    key: "GEO",
    title: "GEO",
    headline: "Presença local que convence",
    desc: "Adapta contexto, termos e exemplos para sua região e faz a mensagem soar natural no mercado certo.",
    variant: "green" as const,
    Icon: Globe2,
    barClass: "bg-google-green/60",
  },
];

const secondaryItems = [
  {
    key: "IMG",
    title: "IMG",
    headline: "Visual pronto para campanha",
    desc: "Cria e edita imagens com briefing, referência e variações para anúncio, capa, criativo e lançamento.",
    variant: "purple" as const,
    Icon: ImagePlus,
    barClass: "bg-violet-500/70",
  },
  {
    key: "Bobar",
    title: "Bobar",
    headline: "Operação organizada para escalar",
    desc: "Centraliza ideias, roteiros e entregas dos agentes para o time executar com clareza e velocidade.",
    variant: "yellow" as const,
    Icon: Briefcase,
    barClass: "bg-google-yellow/70",
  },
];

type ExplainerItem = (typeof primaryItems)[number] | (typeof secondaryItems)[number];

function ExplainerCard({ item, delay }: { item: ExplainerItem; delay: number }) {
  return (
    <MotionInView delay={delay}>
      <Card variant="glass" className="h-full">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border bg-background/40 shadow-soft">
              <item.Icon className="h-5 w-5 text-foreground/80" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.variant}>{item.title}</Badge>
                <CardTitle className="text-base">{item.headline}</CardTitle>
              </div>
              <CardDescription className="mt-2 leading-relaxed">{item.desc}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,200,232,0.08)]">
            <div className={"h-full w-2/3 rounded-full " + item.barClass} />
          </div>
        </CardContent>
      </Card>
    </MotionInView>
  );
}

export function ExplainerA3Commercial() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {primaryItems.map((item, idx) => (
          <ExplainerCard key={item.key} item={item} delay={idx * 0.05} />
        ))}
      </div>

      <div className="grid gap-4 md:mx-auto md:max-w-5xl md:grid-cols-2">
        {secondaryItems.map((item, idx) => (
          <ExplainerCard key={item.key} item={item} delay={0.15 + idx * 0.05} />
        ))}
      </div>
    </div>
  );
}
