import * as React from "react";
import { Timer, Sparkles, ExternalLink, History, Loader2, X, Copy, Linkedin } from "lucide-react";
import { AUTHORITY_AGENTS } from "@/constants/authorityAgents";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Particles } from "@/components/effects/Particles";
import { useQuery } from "@tanstack/react-query";
import { api, getClientId, type AuthorityAgentRunItem } from "@/services/robots";
import { motion, AnimatePresence } from "framer-motion";
import { Markdown } from "@/components/markdown/Markdown";
import { toastSuccess, toastApiError } from "@/lib/toast";

// NOVO: Importações para o LinkedIn
import { PublishModal } from "@/components/linkedin/PublishModal";
import { linkedinService } from "@/services/linkedin";
import { useAuthStore } from "@/state/authStore";

function formatRemaining(sec: number) {
  if (sec <= 0) return "Pronto";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const COOLDOWNS_KEY = "ori_authority_cooldowns_v1";

function loadCooldowns(): Record<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(COOLDOWNS_KEY) || "{}");
    const now = Date.now();
    const active: Record<string, number> = {};
    for (const [key, exp] of Object.entries(stored)) {
      const remaining = Math.floor((Number(exp) - now) / 1000);
      if (remaining > 0) active[key] = remaining;
    }
    return active;
  } catch {
    return {};
  }
}

export default function AuthorityAgentsPage() {
  const [cooldowns, setCooldowns] = React.useState<Record<string, number>>(loadCooldowns);
  const [selectedHistory, setSelectedHistory] = React.useState<AuthorityAgentRunItem | null>(null);

  // NOVO: Estados e variáveis do LinkedIn
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const clientId = React.useMemo(() => getClientId(), []);

  // Busca o histórico global de execuções no backend
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["authority-history", clientId],
    queryFn: () => api.authorityAgents.historyGlobal(clientId),
  });

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

  // NOVO: Função para o botão do LinkedIn no Histórico
  async function handleLinkedInClick() {
    if (user?.has_linkedin) {
      setIsModalOpen(true);
    } else {
      try {
        localStorage.setItem("linkedin_redirect", "/authority-agents");
        toastSuccess("Redirecionando para o LinkedIn...");
        const data = await linkedinService.getAuthUrl();
        window.location.href = data.url;
      } catch (err) {
        toastApiError(err, "Erro ao iniciar conexão com LinkedIn");
      }
    }
  }

  // NOVO: Função para publicar de fato
  async function handlePublishPost(finalText: string) {
    setIsPublishing(true);
    try {
      await linkedinService.publish(finalText);
      toastSuccess("Post publicado no seu LinkedIn com sucesso! 🎉");
      setIsModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no LinkedIn");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100dvh-1px)] pb-32">
      <Particles className="pointer-events-none absolute inset-0 opacity-40" />

      {/* NOVO: Renderiza o Modal de Publicação */}
      <PublishModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialText={selectedHistory?.output_text || ""}
        onPublish={handlePublishPost}
        loading={isPublishing}
      />

      <div className="relative max-w-7xl mx-auto px-4 mt-8 space-y-16">
        
        {/* SEÇÃO 1: AGENTES DE AUTORIDADE */}
        <section className="space-y-8">
          <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
            <Badge variant="outline" className="w-fit mb-2 bg-[rgba(0,200,232,0.08)] text-google-blue border-google-blue/20">Centro Operacional</Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-google-blue" /> Agentes de Autoridade
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Estes robôs já nascem prontos e se alimentam do Núcleo da sua Empresa. Escolha um agente para visualizar e executar suas tarefas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {AUTHORITY_AGENTS.map((agent) => {
              const remaining = cooldowns[agent.key] ?? 0;
              const disabled = remaining > 0;

              return (
                <Card key={agent.key} className={cn(
                  "rounded-3xl border transition-all duration-300 relative flex flex-col h-full",
                  disabled ? "bg-muted/20 border-border/40 opacity-90" : "bg-card hover:border-google-blue/40 hover:shadow-md"
                )}>
                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center border shadow-sm", disabled ? "bg-background text-muted-foreground" : "bg-[rgba(0,200,232,0.08)] text-google-blue border-google-blue/20")}>
                      <agent.Icon className="h-7 w-7" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg text-foreground flex items-center justify-between">
                        {agent.name}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{agent.desc}</p>
                    </div>
                  </div>
                  <div className="px-6 pb-6 mt-auto">
                    <Button
                      size="default"
                      className="w-full rounded-xl transition-all shadow-sm"
                      variant={disabled ? "secondary" : "accent"}
                      disabled={disabled}
                      onClick={() => window.open(`/authority-agents/run/${agent.key}`, "_blank")}
                    >
                      {remaining > 0 ? "Em Cooldown" : <><ExternalLink className="h-4 w-4 mr-2" /> Escolher Ação</>}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* SEÇÃO 2: HISTÓRICO DE GERAÇÕES */}
        <section className="space-y-6 pt-8 border-t border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[rgba(0,200,232,0.08)] text-foreground flex items-center justify-center border shadow-sm">
              <History className="h-5 w-5 opacity-80" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Histórico de Resultados</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Acesse rapidamente as estratégias e textos gerados anteriormente.</p>
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-google-blue" />
              <p className="text-sm text-muted-foreground">Carregando histórico...</p>
            </div>
          ) : !historyData?.items || historyData.items.length === 0 ? (
            <div className="text-center py-12 border rounded-3xl bg-muted/10 border-dashed">
              <p className="text-sm text-muted-foreground">Nenhum histórico encontrado. Execute um agente para ver os resultados aqui.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {historyData.items.map((item) => {
                const agent = AUTHORITY_AGENTS.find((a) => a.key === item.agent_key);
                const AgentIcon = agent?.Icon || Sparkles;

                return (
                  <Card
                    key={item.id}
                    className="p-5 flex flex-col gap-3 cursor-pointer hover:border-google-blue/40 hover:shadow-md transition-all bg-card/50 hover:bg-card border-border/60"
                    onClick={() => setSelectedHistory(item)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-[rgba(0,200,232,0.08)] text-google-blue flex items-center justify-center border border-google-blue/20 shrink-0">
                        <AgentIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm text-foreground truncate">{agent?.name || item.agent_key}</h4>
                        <div className="text-[10px] text-muted-foreground truncate">{new Date(item.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mt-1">
                      {item.output_text}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* OVERLAY MODAL - LEITOR DO HISTÓRICO EM TELA CHEIA */}
      <AnimatePresence>
        {selectedHistory && (
          <motion.div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-background/90 backdrop-blur-md" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
          >
             <motion.div 
               initial={{ y: 30, scale: 0.97, opacity: 0 }} 
               animate={{ y: 0, scale: 1, opacity: 1 }} 
               exit={{ y: 20, scale: 0.97, opacity: 0 }} 
               transition={{ duration: 0.3, ease: "easeOut" }} 
               className="w-full max-w-4xl h-[90vh] bg-card border border-border/60 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
             >
                <div className="px-6 py-5 border-b flex flex-wrap items-center justify-between gap-4 bg-background shadow-sm z-10">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[rgba(0,200,232,0.08)] text-google-blue flex items-center justify-center border border-google-blue/20 shrink-0">
                      <History className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                        {AUTHORITY_AGENTS.find(a => a.key === selectedHistory.agent_key)?.name || selectedHistory.agent_key}
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                        Gerado em {new Date(selectedHistory.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* NOVO: Botão do LinkedIn condicional (apenas se for a Mônica/linkedin) */}
                    {selectedHistory.agent_key === "linkedin" && (
                      <Button 
                        className="bg-[#0A66C2] text-white shadow-sm rounded-xl hover:bg-[#004182]" 
                        onClick={handleLinkedInClick}
                      >
                        <Linkedin className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Publicar no LinkedIn</span>
                      </Button>
                    )}

                    <Button 
                      variant="outline" 
                      className="rounded-xl shadow-sm hidden sm:flex" 
                      onClick={async () => { 
                        await navigator.clipboard.writeText(selectedHistory.output_text); 
                        toastSuccess("Texto copiado para a área de transferência!"); 
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copiar Tudo
                    </Button>
                    
                    <Button variant="ghost" size="icon" className="rounded-full bg-muted/50 hover:bg-muted ml-2" onClick={() => setSelectedHistory(null)}>
                      <X className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 bg-background/40 custom-scrollbar">
                  <div className="mb-6 flex justify-end sm:hidden">
                     <Button 
                        variant="outline" 
                        size="sm"
                        className="rounded-xl shadow-sm bg-background" 
                        onClick={async () => { 
                          await navigator.clipboard.writeText(selectedHistory.output_text); 
                          toastSuccess("Copiado!"); 
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" /> Copiar Texto
                      </Button>
                  </div>

                  <div className="max-w-3xl mx-auto bg-background p-6 sm:p-10 rounded-[2rem] border shadow-sm">
                    <Markdown content={selectedHistory.output_text} />
                  </div>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}