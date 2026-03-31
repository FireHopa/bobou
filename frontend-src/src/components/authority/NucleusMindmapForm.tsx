import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BusinessCore3D } from "@/components/authority/BusinessCore3D";
import { KnowledgeUploader } from "@/components/robot/KnowledgeUploader";

export type Nucleus = Record<string, any>;

type FieldType = "text" | "textarea";

type Field = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
};

const REQUIRED_FIELDS: Field[] = [
  { key: "company_name", label: "Nome da empresa", type: "text", required: true },
  { key: "city_state", label: "Cidade e estado", type: "text", placeholder: "Ex: São Paulo - SP", required: true },
  { key: "service_scope", label: "Tipo de atendimento (local / nacional)", type: "text", required: true },
  { key: "main_audience", label: "Público principal", type: "textarea", required: true },
  { key: "products_services", label: "Serviços / produtos", type: "textarea", required: true },
  { key: "real_differentials", label: "Diferenciais reais", type: "textarea", required: true },
  { key: "restrictions", label: "Restrições (o que não pode prometer/dizer)", type: "textarea", required: true },
];

const OPTIONAL_FIELDS: Field[] = [
  { key: "has_reviews_where", label: "Possui avaliações? Onde?", type: "textarea" },
  { key: "has_testimonials_where", label: "Possui depoimentos? Onde?", type: "textarea" },
  { key: "usable_links_texts", label: "Links/textos que podem ser usados", type: "textarea" },
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

function isFilled(raw: string) {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  return t.toLowerCase() !== "não informado";
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full border",
        ok ? "bg-[#00D278] border-emerald-600" : "bg-muted border-border"
      )}
    />
  );
}

function FieldInput({
  field,
  raw,
  onChange,
}: {
  field: Field;
  raw: string;
  onChange: (next: string) => void;
}) {
  const ok = isFilled(raw);
  return (
    <div className="rounded-2xl border bg-background/50 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusDot ok={ok} />
          <div className="text-sm font-medium leading-tight">
            {field.label}{" "}
            {field.required ? (
              <span className="text-destructive" title="Obrigatório">
                *
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {field.type === "text" ? (
        <Input
          value={raw}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-12"
        />
      ) : (
        <Textarea
          value={raw}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[92px] resize-none"
        />
      )}
    </div>
  );
}

export function NucleusMindmapForm({
  value,
  onChange,
  progress = 0,
  coreState = "idle",
  className,
  style,
  robotPublicId,
  knowledgeFilesJson,
  onUploadSuccess,
}: {
  value: Nucleus;
  onChange: (next: Nucleus) => void;
  progress?: number;
  coreState?: "idle" | "ready" | "running";
  className?: string;
  style?: React.CSSProperties;
  robotPublicId?: string;
  knowledgeFilesJson?: string | null;
  onUploadSuccess?: () => void;
}) {
  const nucleus = value ?? {};

  const requiredFilled = REQUIRED_FIELDS.reduce((acc, f) => acc + (isFilled(String(nucleus[f.key] ?? "")) ? 1 : 0), 0);
  const optionalFilled = OPTIONAL_FIELDS.reduce((acc, f) => acc + (isFilled(String(nucleus[f.key] ?? "")) ? 1 : 0), 0);

  function setField(key: string, nextRaw: string) {
    onChange({ ...(nucleus ?? {}), [key]: nextRaw });
  }

  function normalizeAll() {
    const n: Nucleus = { ...(nucleus ?? {}) };
    for (const f of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      n[f.key] = normalizeValue(String(n[f.key] ?? ""));
    }
    onChange(n);
  }

  return (
    <div
      className={cn("w-full overflow-hidden rounded-3xl border bg-background/30 shadow-card", className)}
      style={{ ...(style ?? {}) }}
    >
      <div className="flex items-center justify-between gap-3 border-b bg-background/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={requiredFilled === REQUIRED_FIELDS.length ? "default" : "secondary"}>
            Obrigatórios: {requiredFilled}/{REQUIRED_FIELDS.length}
          </Badge>
          <Badge variant={optionalFilled ? "secondary" : "outline"}>
            Opcionais: {optionalFilled}/{OPTIONAL_FIELDS.length}
          </Badge>
        </div>

        <button
          onClick={normalizeAll}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          title="Preenche campos vazios com 'não informado'"
        >
          Normalizar vazios
        </button>
      </div>

      <div className="p-4">
        {/* topo: obrigatórios (divididos) + núcleo no centro */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* esquerda: obrigatórios (parte 1) */}
          <section className="space-y-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Campos obrigatórios
            </div>
            <div className="space-y-3">
              {REQUIRED_FIELDS.slice(0, Math.ceil(REQUIRED_FIELDS.length / 2)).map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  raw={String(nucleus[f.key] ?? "")}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>
          </section>

          {/* centro: núcleo */}
          <section className="relative flex min-h-[140px] items-center justify-center overflow-hidden rounded-3xl border bg-background/20">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/30" />
            <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center">
              <BusinessCore3D progress={progress} state={coreState} className="h-[460px] w-[460px]" />
              <div className="text-sm font-medium">Núcleo da empresa</div>
              <div className="max-w-[420px] text-xs text-muted-foreground">
                Preencha os campos ao lado. Cada campo preenchido fica com um indicador verde.
              </div>
            </div>
          </section>

          {/* direita: obrigatórios (parte 2) */}
          <section className="space-y-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground opacity-0 md:opacity-100">
              Campos obrigatórios
            </div>
            <div className="space-y-3">
              {REQUIRED_FIELDS.slice(Math.ceil(REQUIRED_FIELDS.length / 2)).map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  raw={String(nucleus[f.key] ?? "")}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* embaixo: opcionais em grid 2 colunas */}
        <section className="mt-6 space-y-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Campos opcionais
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {OPTIONAL_FIELDS.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                raw={String(nucleus[f.key] ?? "")}
                onChange={(v) => setField(f.key, v)}
              />
            ))}
          </div>
        </section>

        {/* SECÃO NOVA: UPLOADER NO FINAL DO FORMULÁRIO */}
        {robotPublicId && (
          <section className="mt-6 pt-6 border-t border-border/40">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Materiais de Apoio
            </div>
            <div className="mb-4 text-sm text-muted-foreground">
              Você pode adicionar PDFs ou textos com conhecimentos e regras extras da empresa.
            </div>
            <KnowledgeUploader 
              publicId={robotPublicId}
              type="business-core" 
              existingFilesJson={knowledgeFilesJson}
              onUploadSuccess={() => {
                if (onUploadSuccess) onUploadSuccess();
              }}
            />
          </section>
        )}
      </div>
    </div>
  );
}