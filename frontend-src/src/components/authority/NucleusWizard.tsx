import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Nucleus = Record<string, any>;

type FieldType = "text" | "textarea";

type Step = {
  key: string;
  label: string;
  description?: string;
  type?: FieldType;
  placeholder?: string;
};

const STEPS: Step[] = [
  { key: "company_name", label: "Nome da empresa", type: "text" },
  { key: "city_state", label: "Cidade e estado", type: "text", placeholder: "Ex: São Paulo - SP" },
  { key: "service_scope", label: "Tipo de atendimento (local / nacional)", type: "text" },
  { key: "main_audience", label: "Público principal", type: "textarea" },
  { key: "products_services", label: "Lista de serviços ou produtos", type: "textarea" },
  { key: "real_differentials", label: "Diferenciais reais", type: "textarea" },
  { key: "restrictions", label: "Restrições (o que não pode prometer ou dizer)", type: "textarea" },

  { key: "has_reviews_where", label: "Possui avaliações? Onde?", type: "textarea", description: "Prova social" },
  { key: "has_testimonials_where", label: "Possui depoimentos? Onde?", type: "textarea" },
  { key: "usable_links_texts", label: "Links ou textos que podem ser usados", type: "textarea" },
  { key: "cannot_publish", label: "O que não pode ser publicado", type: "textarea" },

  { key: "site", label: "Site", type: "text" },
  { key: "google_business_profile", label: "Perfil de Empresa no Google", type: "text" },
  { key: "instagram", label: "Instagram", type: "text" },
  { key: "linkedin", label: "LinkedIn", type: "text" },
  { key: "youtube", label: "YouTube", type: "text" },
  { key: "tiktok", label: "TikTok", type: "text" },
];

function normalizeValue(v: string) {
  const t = (v ?? "").trim();
  return t ? t : "não informado";
}

export function NucleusWizard({
  value,
  onChange,
  onSubmit,
  busy,
  className,
}: {
  value: Nucleus;
  onChange: (next: Nucleus) => void;
  onSubmit: (finalNucleus: Nucleus) => void;
  busy?: boolean;
  className?: string;
}) {
  const [i, setI] = React.useState(0);
  const step = STEPS[i];
  const raw = String(value?.[step.key] ?? "");

  function setField(v: string) {
    onChange({ ...(value ?? {}), [step.key]: v });
  }

  function setNaoInformado() {
    onChange({ ...(value ?? {}), [step.key]: "não informado" });
    if (i < STEPS.length - 1) setI((x) => x + 1);
  }

  function next() {
    if (i >= STEPS.length - 1) return;
    // normalize current field before going next
    const n = { ...(value ?? {}), [step.key]: normalizeValue(raw) };
    onChange(n);
    setI((x) => x + 1);
  }

  function back() {
    if (i <= 0) return;
    setI((x) => x - 1);
  }

  function finish() {
    const n: Nucleus = { ...(value ?? {}) };
    for (const s of STEPS) n[s.key] = normalizeValue(String(n[s.key] ?? ""));
    onChange(n);
    onSubmit(n);
  }

  const progress = Math.round(((i + 1) / STEPS.length) * 100);

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Núcleo do Negócio</CardTitle>
            <CardDescription className="truncate">
              Responda em progressão. Se faltar dado, marque como “não informado”.
            </CardDescription>
          </div>
          <Badge variant="secondary">{progress}%</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {step.description ? <div className="text-xs text-muted-foreground">{step.description}</div> : null}

        <div className="space-y-2">
          <div className="text-sm font-semibold">{step.label}</div>

          {step.type === "textarea" ? (
            <Textarea
              value={raw}
              onChange={(e) => setField(e.target.value)}
              placeholder={step.placeholder}
              rows={6}
            />
          ) : (
            <Input value={raw} onChange={(e) => setField(e.target.value)} placeholder={step.placeholder} />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={back} disabled={i === 0 || busy}>
              Voltar
            </Button>

            {i < STEPS.length - 1 ? (
              <Button onClick={next} disabled={busy}>
                Próximo
              </Button>
            ) : (
              <Button onClick={finish} disabled={busy}>
                Concluir e executar
              </Button>
            )}
          </div>

          <Button variant="ghost" onClick={setNaoInformado} disabled={busy}>
            Marcar como não informado
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Passo {i + 1} de {STEPS.length}
        </div>
      </CardContent>
    </Card>
  );
}
