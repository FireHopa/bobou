import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MotionInView } from "@/components/motion/MotionInView";
import { BrainCircuit, Quote, Globe2 } from "lucide-react";

const items = [
  {
    key: "AIO",
    title: "AIO",
    desc: "Conteúdo claro para modelos de IA consumirem e citarem. Estrutura, precisão e contexto.",
    variant: "blue" as const,
    Icon: BrainCircuit,
    barClass: "bg-google-blue/60",
  },
  {
    key: "AEO",
    title: "AEO",
    desc: "Respostas prontas para aparecer em trechos, FAQs e resultados. Objetivo: ser a melhor resposta.",
    variant: "red" as const,
    Icon: Quote,
    barClass: "bg-google-red/60",
  },
  {
    key: "GEO",
    title: "GEO",
    desc: "Adaptação regional: idioma, exemplos e termos locais. Natural para o Brasil (ou sua região).",
    variant: "green" as const,
    Icon: Globe2,
    barClass: "bg-google-green/60",
  },
];

export function ExplainerA3() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((it, idx) => (
        <MotionInView key={it.key} delay={idx * 0.05}>
          <Card variant="glass" className="h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-background/40 shadow-soft">
                  <it.Icon className="h-5 w-5 text-foreground/80" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={it.variant}>{it.title}</Badge>
                    <CardTitle className="text-base">Base de autoridade</CardTitle>
                  </div>
                  <CardDescription>{it.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,200,232,0.08)]">
                <div className={"h-full w-2/3 rounded-full " + it.barClass} />
              </div>
            </CardContent>
          </Card>
        </MotionInView>
      ))}
    </div>
  );
}
