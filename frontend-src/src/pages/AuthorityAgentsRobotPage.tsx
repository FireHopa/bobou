import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Timer, CheckCircle2, Play, Edit2, Copy, X, BrainCircuit, ShieldCheck, Link2, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/services/robots";
import type { BusinessCoreIn } from "@/types/api";
import { AUTHORITY_AGENTS } from "@/constants/authorityAgents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { transitions, fadeUp } from "@/lib/motion";
import { KnowledgeUploader } from "@/components/robot/KnowledgeUploader";
import ResultViewer from "@/components/authority/ResultViewer";
import { exportAuthorityFormat as exportFormat } from "@/lib/authorityExport";
import { useAuthStore } from "@/state/authStore";

function formatRemaining(sec: number) {
  if (sec <= 0) return "Pronto";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const CORE_GROUPS = [
  { title: "Fundação", icon: BrainCircuit, fields: [
      { key: "company_name", label: "Empresa", kind: "input" },
      { key: "city_state", label: "Local", kind: "input" },
      { key: "main_audience", label: "Público", kind: "textarea" },
      { key: "services_products", label: "Oferta", kind: "textarea" },
  ]},
  { title: "Regras e Provas", icon: ShieldCheck, fields: [
      { key: "real_differentials", label: "Diferenciais", kind: "textarea" },
      { key: "restrictions", label: "Restrições", kind: "textarea" },
      { key: "forbidden_content", label: "Proibido", kind: "textarea" },
      { key: "reviews", label: "Avaliações", kind: "textarea" },
  ]},
  { title: "Ecossistema Digital", icon: Link2, fields: [
      { key: "site", label: "Site", kind: "input" },
      { key: "instagram", label: "Instagram", kind: "input" },
      { key: "linkedin", label: "LinkedIn", kind: "input" },
      { key: "youtube", label: "YouTube", kind: "input" },
  ]},
];

export default function AuthorityAgentsRobotPage() {
  const { publicId = "" } = useParams();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((state) => state.token);

  const [isEditingCore, setIsEditingCore] = React.useState(false);
  const [resultModal, setResultModal] = React.useState<{ title: string; output: string; agentKey: string } | null>(null);
  const [draft, setDraft] = React.useState<BusinessCoreIn>({});
  const [cooldowns, setCooldowns] = React.useState<Record<string, number>>({});
  const [runningKey, setRunningKey] = React.useState<string | null>(null);

  const coreQ = useQuery({
    queryKey: ["business-core", publicId],
    queryFn: () => api.robots.businessCore.get(publicId),
    enabled: Boolean(authToken && publicId),
  });

  const patchCore = useMutation({
    mutationFn: (patch: BusinessCoreIn) => api.robots.businessCore.patch(publicId, patch),
    onSuccess: () => {
      toastSuccess("Inteligência do núcleo atualizada!");
      queryClient.invalidateQueries({ queryKey: ["business-core", publicId] });
      setIsEditingCore(false);
    },
    onError: (e) => toastApiError(e, "Falha ao salvar núcleo"),
  });

  const runAgent = useMutation({
    mutationFn: async (agentKey: string) => {
      await patchCore.mutateAsync(draft);
      return api.robots.authorityAgents.run(publicId, {
        client_id: publicId,
        agent_key: agentKey,
        nucleus: draft
      });
    },
    onSuccess: (res) => {
      const agentName = AUTHORITY_AGENTS.find(a => a.key === res.agent_key)?.name || "Agente";
      setCooldowns((m) => ({ ...m, [res.agent_key]: 3600 }));
      setResultModal({ title: agentName, output: res.output_text, agentKey: res.agent_key });
      toastSuccess(`O agente ${agentName} terminou a tarefa.`);
    },
    onError: (e) => toastApiError(e, "Falha ao executar agente"),
    onSettled: () => setRunningKey(null),
  });

  React.useEffect(() => {
    if (coreQ.data) setDraft(coreQ.data as BusinessCoreIn);
  }, [coreQ.data, isEditingCore]);

  React.useEffect(() => {
    if (!publicId) return;
    AUTHORITY_AGENTS.forEach(async (a) => {
      try {
        const r = await api.robots.authorityAgents.cooldown(publicId, a.key);
        setCooldowns((prev) => ({ ...prev, [a.key]: r.cooldown_seconds }));
      } catch (e) { /* silent */ }
    });
  }, [publicId]);

  React.useEffect(() => {
    const t = setInterval(() => {
      setCooldowns((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[k] > 0) { next[k] -= 1; changed = true; }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (coreQ.isLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">Iniciando Centro de Comando...</div>;

  const coreData = coreQ.data as any;
  const isCoreFilled = coreData ? Object.values(coreData).some(v => v && v !== "não informado" && String(v).trim() !== "") : false;

  return (
    <div className="space-y-6 pb-20 relative max-w-7xl mx-auto px-4 mt-6">
      
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-2 bg-[rgba(0,200,232,0.08)] text-google-blue border-google-blue/20">Centro de Comando</Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Agentes Especialistas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            O Cérebro do robô já está conectado. Clique em qualquer agente abaixo para gerar conteúdos e scripts com 1 clique.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ESQUERDA: CÉREBRO (NÚCLEO RESUMIDO) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="rounded-3xl border-border/50 bg-background/40 shadow-soft overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-google-blue/5 to-transparent pointer-events-none" />
            <CardHeader className="pb-3 border-b border-border/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-google-blue" /> Cérebro Conectado
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingCore(true)} className="h-8 rounded-full bg-background/50 hover:bg-background border">
                  <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              </div>
              <CardDescription className="text-xs">Contexto central usado por todos os agentes.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {!isCoreFilled ? (
                 <div className="text-center py-6 text-muted-foreground text-sm">O núcleo está vazio. Clique em Editar para preenchê-lo.</div>
              ) : (
                CORE_GROUPS.map((g) => (
                  <div key={g.title} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                      <g.icon className="h-3.5 w-3.5" /> {g.title}
                    </div>
                    <div className="grid gap-2 text-sm pl-1">
                      {g.fields.map(f => {
                        const val = coreData[f.key];
                        if(!val || val === "não informado") return null;
                        return (
                          <div key={f.key} className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">{f.label}</span>
                            <span className="font-medium text-foreground truncate">{val}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* DIREITA: GRID DE AGENTES (Sem formulários, direto ao ponto) */}
        <div className="lg:col-span-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AUTHORITY_AGENTS.map((agent) => {
              const remaining = cooldowns[agent.key] ?? 0;
              const isRunning = runningKey === agent.key;
              const disabled = remaining > 0 || runningKey !== null;

              return (
                <Card key={agent.key} className={cn(
                  "rounded-3xl border transition-all duration-300 relative overflow-hidden flex flex-col",
                  disabled ? "bg-muted/20 border-border/40 opacity-90" : "bg-card hover:border-google-blue/40 hover:shadow-md"
                )}>
                  {isRunning && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-google-blue via-google-green to-google-yellow animate-pulse" />}
                  
                  <div className="p-5 flex-1 flex gap-4">
                    <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border", disabled ? "bg-background text-muted-foreground" : "bg-[rgba(0,200,232,0.08)] text-google-blue border-google-blue/20")}>
                      <agent.Icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-sm text-foreground flex items-center justify-between">
                        {agent.label}
                        {remaining > 0 && <span className="text-[10px] font-medium text-google-yellow bg-google-yellow/10 px-2 py-0.5 rounded-full flex items-center gap-1"><Timer className="h-3 w-3" /> {formatRemaining(remaining)}</span>}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{agent.desc}</p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 mt-auto">
                    <Button
                      size="sm"
                      className="w-full rounded-xl transition-all shadow-sm"
                      variant={disabled ? "secondary" : "accent"}
                      disabled={disabled}
                      onClick={() => {
                        setRunningKey(agent.key);
                        runAgent.mutate(agent.key);
                      }}
                    >
                      {isRunning ? "A IA está pensando..." : remaining > 0 ? "Em Cooldown" : <><Play className="h-3.5 w-3.5 mr-1.5 fill-current" /> Acionar {agent.name}</>}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* OVERLAY MODAL - EDIÇÃO DO NÚCLEO */}
      <AnimatePresence>
        {isEditingCore && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div variants={fadeUp} initial="hidden" animate="show" exit="hidden" className="w-full max-w-3xl max-h-[85vh] bg-card border rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between bg-background/50">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><Edit2 className="h-5 w-5 text-google-blue" /> Editar Cérebro do Robô</h2>
                  <p className="text-xs text-muted-foreground">Atualize a base de conhecimento. Use "não informado" para campos irrelevantes.</p>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full bg-background/50 hover:bg-background" onClick={() => setIsEditingCore(false)}><X className="h-5 w-5" /></Button>
              </div>
              <div className="overflow-y-auto p-6 space-y-8 bg-background/30 custom-scrollbar">
                
                {/* CAMPOS DE TEXTO ORIGINAIS */}
                {CORE_GROUPS.map(g => (
                  <div key={g.title} className="space-y-4">
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground flex items-center gap-2"><g.icon className="h-4 w-4" /> {g.title}</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {g.fields.map(f => (
                        <div key={f.key} className={cn("space-y-1.5", f.kind === 'textarea' ? "sm:col-span-2" : "")}>
                          <label className="text-sm font-medium pl-1">{f.label}</label>
                          {f.kind === 'input' ? (
                            <Input value={((draft as any)[f.key] ?? "")} onChange={e => setDraft(d => ({...d, [f.key]: e.target.value}))} className="rounded-xl shadow-sm bg-background/50" />
                          ) : (
                            <Textarea value={((draft as any)[f.key] ?? "")} onChange={e => setDraft(d => ({...d, [f.key]: e.target.value}))} className="rounded-xl min-h-[90px] shadow-sm bg-background/50" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* NOVO CAMPO: UPLOADER DENTRO DO MODAL DE EDIÇÃO */}
                <div className="space-y-4 pt-4 border-t border-border/40">
                  <h3 className="font-semibold text-sm uppercase text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Materiais de Apoio
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-sm font-medium pl-1">Anexar Documentos (PDF, DOCX, TXT)</label>
                      <KnowledgeUploader 
                        publicId={publicId}
                        type="business-core" 
                        existingFilesJson={coreData?.knowledge_files_json}
                        onUploadSuccess={() => {
                          // Recarrega os dados do cérebro na mesma hora após o upload
                          queryClient.invalidateQueries({ queryKey: ["business-core", publicId] });
                        }}
                      />
                    </div>
                  </div>
                </div>

              </div>
              <div className="p-4 border-t bg-background/50 flex justify-end gap-3">
                <Button variant="ghost" className="rounded-xl" onClick={() => setIsEditingCore(false)}>Cancelar</Button>
                <Button variant="accent" className="rounded-xl" isLoading={patchCore.isPending} onClick={() => patchCore.mutate(draft)}>Salvar Modificações</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVERLAY MODAL - RESULTADO IMERSIVO (Tela Cheia) */}
      <AnimatePresence>
        {resultModal && (
          <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <motion.div initial={{ y: 50, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, scale: 0.95, opacity: 0 }} transition={transitions.slow} className="w-full max-w-4xl h-[85vh] bg-card border border-border/50 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-background">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-google-green/10 text-google-green flex items-center justify-center border border-google-green/20">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">Entrega: {resultModal.title}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Conteúdo gerado e pronto para uso.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-xl shadow-sm" onClick={async () => { await navigator.clipboard.writeText(exportFormat(resultModal.output, "txt")); toastSuccess("Texto copiado!"); }}>
                      <Copy className="h-4 w-4 mr-2" /> Copiar Tudo
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-full bg-muted/50 hover:bg-muted" onClick={() => setResultModal(null)}>
                      <X className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 lg:p-12 bg-background/40">
                  <div className="max-w-4xl mx-auto">
                    <ResultViewer title={resultModal.title} text={resultModal.output} agentKey={resultModal.agentKey} />
                  </div>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}