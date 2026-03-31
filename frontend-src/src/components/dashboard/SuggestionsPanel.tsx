import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { RobotOut } from "@/types/api";

export function SuggestionsPanel({ robots }: { robots: RobotOut[] }) {
  const count = robots.length;

  const suggestions = [
    {
      tone: "blue" as const,
      title: "Refine instruções",
      desc: "Ajuste o system prompt para ficar mais “citável”.",
      href: count ? `/robots/${robots[0].public_id}` : "/journey",
      cta: "Abrir",
    },
    {
      tone: "green" as const,
      title: "Teste no chat",
      desc: "Faça 3 perguntas e valide consistência.",
      href: count ? `/robots/${robots[0].public_id}/chat` : "/journey",
      cta: "Testar",
    },
    {
      tone: "yellow" as const,
      title: "Crie variações",
      desc: "Um robô por nicho/segmento aumenta precisão.",
      href: "/journey",
      cta: "Criar",
    },
  ];

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>Próximos passos</CardTitle>
        <CardDescription>Pequenas ações que aumentam autoridade.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((s) => (
          <div key={s.title} className="rounded-2xl border bg-background/40 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <Badge variant={s.tone}>{s.title}</Badge>
              <div className="flex-1">
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={s.href}>{s.cta}</Link>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
