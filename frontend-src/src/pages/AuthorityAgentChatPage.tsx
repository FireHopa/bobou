import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Particles } from "@/components/effects/Particles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BusinessCore3D } from "@/components/authority/BusinessCore3D";
import ResultViewer from "@/components/authority/ResultViewer";
import { api, getClientId } from "@/services/robots";
import { linkedinService, type LinkedInPublishPayload } from "@/services/linkedin";
import { instagramService } from "@/services/instagram";
import { facebookService, type FacebookPage } from "@/services/facebook";
import { youtubeService } from "@/services/youtube";
import { tiktokService, type TikTokPrivacyLevel } from "@/services/tiktok";
import { authorityAgentByKey } from "@/constants/authorityAgents";
import { tasksByAgentKey, type AuthorityTask } from "@/constants/authorityTasks";
import { cn } from "@/lib/utils";
import { toastSuccess, toastApiError } from "@/lib/toast";
import { useAuthStore } from "@/state/authStore";
import { PublishModal } from "@/components/linkedin/PublishModal";
import { InstagramPublishModal, type InstagramPublishValues } from "@/components/instagram/InstagramPublishModal";
import { FacebookPublishModal, type FacebookPublishValues } from "@/components/facebook/FacebookPublishModal";
import { YouTubePublishModal, type YouTubePublishValues } from "@/components/youtube/YouTubePublishModal";
import { TikTokPublishModal, type TikTokPublishValues } from "@/components/tiktok/TikTokPublishModal";
import { exportAuthorityFormat as exportFormat } from "@/lib/authorityExport";
import { bobarService } from "@/services/bobar";
import { buildAuthorityImportPayload } from "@/lib/bobarImported";
import { ArrowLeft, Loader2, Sparkles, RotateCcw, Printer, ChevronDown, FileText, Linkedin, Instagram, Facebook, Youtube, FolderKanban } from "lucide-react";

const ICEBREAKERS_GENERIC = [
  "Gere um plano rápido em tópicos",
  "Crie um checklist de execução",
  "Liste 10 ideias práticas",
  "Monte um roteiro passo a passo",
  "Escreva exemplos prontos para copiar",
  "Aponte melhorias e ajustes finos",
  "Crie variações e alternativas",
  "Identifique riscos e correções",
];

type ViewMode = "mindmap" | "result";

// ============================================================================
// MOTOR DE EXPORTAÇÃO INTELIGENTE (HTML, WhatsApp, TXT, MD)
// ============================================================================
export default function AuthorityAgentChatPage() {
  const nav = useNavigate();
  const { agentKey = "" } = useParams<{ agentKey: string }>();
  const agent = authorityAgentByKey(agentKey);

  const clientId = React.useMemo(() => getClientId(), []);

  const [mode, setMode] = React.useState<ViewMode>("mindmap");
  const [resultMd, setResultMd] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [isLinkedInModalOpen, setIsLinkedInModalOpen] = React.useState(false);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = React.useState(false);
  const [isFacebookModalOpen, setIsFacebookModalOpen] = React.useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = React.useState(false);
  const [isTikTokModalOpen, setIsTikTokModalOpen] = React.useState(false);
  const [facebookPages, setFacebookPages] = React.useState<FacebookPage[]>([]);
  const [facebookSelectedPageId, setFacebookSelectedPageId] = React.useState("");
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [tiktokPrivacyOptions, setTikTokPrivacyOptions] = React.useState<TikTokPrivacyLevel[]>([]);
  const [tiktokPrivacyLabels, setTikTokPrivacyLabels] = React.useState<Record<string, string>>({});
  const [tiktokMaxDurationSeconds, setTikTokMaxDurationSeconds] = React.useState<number | undefined>(undefined);

  const [anim, setAnim] = React.useState<null | { id: string; label: string; fromX: number; fromY: number }>(null);

  const [suggestingFor, setSuggestingFor] = React.useState<AuthorityTask | null>(null);
  const [themes, setThemes] = React.useState<string[]>([]);
  const [loadingThemes, setLoadingThemes] = React.useState(false);
  const [customTheme, setCustomTheme] = React.useState("");
  
  const [showDownloadMenu, setShowDownloadMenu] = React.useState(false);
  const [isSendingToBobar, setIsSendingToBobar] = React.useState(false);
  const { user } = useAuthStore();
  const { data: businessCore } = useQuery({
    queryKey: ["business-core", "authority-agent-chat", user?.email],
    queryFn: () => api.robots.businessCore.get("business-core"),
    enabled: Boolean(user?.email),
  });
  const nucleus = React.useMemo(() => ({ ...(businessCore || {}) }), [businessCore]);

  const filled = React.useMemo(() => {
    const keys = Object.keys(nucleus ?? {});
    if (!keys.length) return 0;
    let good = 0;
    for (const k of keys) {
      const v = String((nucleus as any)[k] ?? "").trim();
      if (v && v !== "não informado") good++;
    }
    return Math.min(1, good / 10);
  }, [nucleus]);

  React.useEffect(() => {
    if (!agent) nav("/authority-agents");
  }, [agent, nav]);

  const coreState = busy || loadingThemes ? "running" : filled > 0.35 ? "ready" : "idle";

  const taskItems = React.useMemo<AuthorityTask[]>(() => {
    const tasks = tasksByAgentKey(agentKey);
    if (tasks.length > 0) return tasks;
    return ICEBREAKERS_GENERIC.map((title) => ({ title, inputMode: title.toUpperCase().includes("FAQ") || title.toUpperCase().includes("BLOG") ? "theme" : "direct", aiSuggestions: title.toUpperCase().includes("FAQ") || title.toUpperCase().includes("BLOG") }));
  }, [agentKey]);

  const half = React.useMemo(() => Math.ceil(taskItems.length / 2), [taskItems.length]);
  const leftLabels = React.useMemo(() => taskItems.slice(0, half), [taskItems, half]);
  const rightLabels = React.useMemo(() => taskItems.slice(half), [taskItems, half]);

  async function handleIcebreakerClick(task: AuthorityTask, fromX: number, fromY: number) {
    const inputMode = task.inputMode || "direct";
    const precisaDeTema = inputMode === "theme";

    if (inputMode === "textarea") {
      const texto = window.prompt(task.inputLabel || "Cole aqui a avaliação que você quer responder:", "");
      if (!texto || !texto.trim()) return;
      runIcebreaker(task, texto.trim(), fromX, fromY);
      return;
    }

    if (precisaDeTema) {
      setSuggestingFor(task);
      setLoadingThemes(true);
      setErr(null);
      setCustomTheme("");
      try {
        const res = await api.authorityAgents.suggestThemes({
          agent_key: agent!.key,
          task: task.prompt || task.title,
          nucleus: nucleus ?? {}
        });
        setThemes(res.themes);
      } catch (e: any) {
        setErr("Falha ao gerar sugestões de temas.");
        setThemes([]);
      } finally {
        setLoadingThemes(false);
      }
    } else {
      runIcebreaker(task, "", fromX, fromY);
    }
  }

  async function runIcebreaker(task: AuthorityTask, themeContext: string, fromX: number, fromY: number) {
    if (!agent) return;
    if (busy) return;

    if (!nucleus || Object.keys(nucleus).length === 0) {
      setErr("Preencha o núcleo da empresa antes de executar um agente.");
      return;
    }

    setSuggestingFor(null);
    setErr(null);
    setBusy(true);

    const id = String(Date.now()) + Math.random().toString(16).slice(2);
    setAnim({ id, label: themeContext || task.title, fromX, fromY });

    try {
      await new Promise((r) => setTimeout(r, 650));

      const payload = {
        client_id: clientId,
        agent_key: agent.key,
        nucleus: { 
          ...(nucleus ?? {}), 
          requested_task: task.prompt || task.title,
          ...(themeContext ? { selected_theme: themeContext } : {}),
          ...(task.inputMode === "textarea" && themeContext ? { review_to_reply: themeContext } : {})
        },
      };

      const out = await api.authorityAgents.runGlobal(payload);

      setResultMd((out as any).output ?? (out as any).output_text ?? "Sem saída.");
      setMode("result");
    } catch (e: any) {
      const msg = e?.detail?.message || e?.message || "Falha ao executar agente.";
      setErr(String(msg));
    } finally {
      setAnim(null);
      setBusy(false);
    }
  }

  function handlePrint() {
    if (!resultMd || !agent) return;
    const htmlContent = exportFormat(resultMd, "html");
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Por favor, permita pop-ups neste site para imprimir/salvar PDF.");
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Resultado - ${agent.name || agent.label}</title>
          <meta charset="utf-8">
      </head>
      <body>
          ${htmlContent}
          <script>
              window.onload = function() {
                  window.print();
                  window.onafterprint = function() { window.close(); }
              }
          </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  async function handleSendToBobar() {
    if (!resultMd || !agent) return;

    setIsSendingToBobar(true);
    try {
      await bobarService.importCard(buildAuthorityImportPayload(resultMd, agent));
      toastSuccess("Roteiro importado para o Bobar.");
    } catch (error) {
      toastApiError(error, "Não foi possível enviar este resultado para o Bobar");
    } finally {
      setIsSendingToBobar(false);
    }
  }


  function downloadFile(format: "md" | "txt" | "doc" | "pdf") {
    if (format === "pdf") {
      handlePrint();
      setShowDownloadMenu(false);
      return;
    }

    const rawText = String(resultMd ?? "");
    if (!rawText) return;
    
    let mimeType = "text/plain;charset=utf-8";
    let fileContent = "";
    
    if (format === "doc") {
      mimeType = "application/msword";
      const htmlContent = exportFormat(rawText, "html");
      fileContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>${htmlContent}</body></html>`;
    } else {
      fileContent = exportFormat(rawText, format as any);
    }

    const blob = new Blob([format === "doc" ? '\ufeff' + fileContent : fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent?.key || 'agente'}-resultado.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  }


  async function handleLinkedInClick() {
    if (!resultMd) return;
    if (user?.has_linkedin) {
      setShowDownloadMenu(false);
      setIsLinkedInModalOpen(true);
      return;
    }
    try {
      toastSuccess("Redirecionando para o LinkedIn...");
      const data = await linkedinService.getAuthUrl();
      window.location.href = data.url;
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com LinkedIn");
    }
  }


  async function handlePublishLinkedIn(payload: LinkedInPublishPayload) {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      await linkedinService.publish(payload);
      toastSuccess(payload.mode === "article" ? "Artigo publicado no LinkedIn com sucesso! 🎉" : "Post publicado no LinkedIn com sucesso! 🎉");
      setIsLinkedInModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no LinkedIn");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleInstagramClick() {
    if (!resultMd || isPublishing) return;
    if (user?.has_instagram) {
      setShowDownloadMenu(false);
      setIsInstagramModalOpen(true);
      return;
    }
    try {
      toastSuccess("Redirecionando para o Instagram...");
      instagramService.startAuth(window.location.pathname);
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com Instagram");
    }
  }

  async function handlePublishInstagram(values: InstagramPublishValues) {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const payload = {
        caption: values.caption,
        image_url: values.imageUrl || undefined,
        carousel_images: values.carouselImages || [],
        collaborators: values.collaborators || [],
        location_id: values.locationId || undefined,
        first_comment: values.firstComment || undefined,
      };
      const res = await instagramService.publish(payload);
      toastSuccess(res?.warning ? "Post publicado, mas houve aviso no comentário." : "Post publicado no seu Instagram com sucesso! 🎉");
      setIsInstagramModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no Instagram");
    } finally {
      setIsPublishing(false);
    }
  }

  async function loadFacebookStatus() {
    const status = await facebookService.status();
    let parsedPages: FacebookPage[] = [];
    try {
      parsedPages = JSON.parse(status.pages || "[]");
    } catch {
      parsedPages = [];
    }
    setFacebookPages(parsedPages);
    setFacebookSelectedPageId((current) => current || status.page_id || parsedPages[0]?.id || "");
    return { status, pages: parsedPages };
  }

  async function handleFacebookClick() {
    if (!resultMd || isPublishing) return;
    if (user?.has_facebook) {
      try {
        await loadFacebookStatus();
        setShowDownloadMenu(false);
        setIsFacebookModalOpen(true);
        return;
      } catch (err) {
        toastApiError(err, "Erro ao carregar páginas do Facebook");
        return;
      }
    }
    try {
      toastSuccess("Redirecionando para o Facebook...");
      facebookService.startAuth(window.location.pathname);
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com Facebook");
    }
  }

  async function handleSelectFacebookPage(pageId: string) {
    setFacebookSelectedPageId(pageId);
    try {
      await facebookService.selectPage(pageId);
    } catch (err) {
      toastApiError(err, "Erro ao trocar a página do Facebook");
    }
  }

  async function handlePublishFacebook(values: FacebookPublishValues) {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      if (values.selectedPageId && values.selectedPageId !== facebookSelectedPageId) {
        await facebookService.selectPage(values.selectedPageId);
        setFacebookSelectedPageId(values.selectedPageId);
      }
      const scheduled_publish_time = values.published || !values.scheduledPublishTime ? undefined : Math.floor(new Date(values.scheduledPublishTime).getTime() / 1000);
      const payload = {
        message: values.message,
        link: values.link || undefined,
        image_url: values.imageUrl || undefined,
        carousel_images: values.carouselImages || [],
        published: values.published,
        scheduled_publish_time,
        backdated_time: values.backdatedTime ? new Date(values.backdatedTime).toISOString() : undefined,
        place: values.place || undefined,
        tags: values.tags || [],
      };
      await facebookService.publish(payload);
      toastSuccess(values.published ? "Post publicado no Facebook com sucesso! 🎉" : "Publicação salva/agendada no Facebook com sucesso!");
      setIsFacebookModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no Facebook");
    } finally {
      setIsPublishing(false);
    }
  }


  async function handleYouTubeClick() {
    if (!resultMd || isPublishing) return;
    if (user?.has_youtube) {
      setShowDownloadMenu(false);
      setIsYouTubeModalOpen(true);
      return;
    }
    try {
      const state = `youtube::${window.location.pathname}::${Date.now()}`;
      localStorage.setItem("youtube_oauth_state", state);
      localStorage.setItem("youtube_redirect", window.location.pathname);
      toastSuccess("Redirecionando para o YouTube...");
      const data = await youtubeService.getAuthUrl(state);
      window.location.href = data.url;
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com YouTube");
    }
  }

  async function handlePublishYouTube(values: YouTubePublishValues) {
    if (isPublishing || !values.videoFile) return;
    setIsPublishing(true);
    try {
      const res = await youtubeService.publish({
        title: values.title,
        description: values.description,
        privacy_status: values.privacyStatus,
        made_for_kids: values.madeForKids,
        tags: values.tags,
        category_id: values.categoryId,
        video_file: values.videoFile,
        thumbnail_file: values.thumbnailFile,
      });
      toastSuccess(res.thumbnail_warning ? "Vídeo enviado ao YouTube. A thumbnail não foi aplicada." : "Vídeo publicado no YouTube com sucesso! 🎉");
      setIsYouTubeModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no YouTube");
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleTikTokClick() {
    if (!resultMd || isPublishing) return;
    if (user?.has_tiktok) {
      try {
        const status = await tiktokService.status();
        setTikTokPrivacyOptions(status.privacy_level_options ?? []);
        setTikTokPrivacyLabels(status.privacy_level_labels ?? {});
        setTikTokMaxDurationSeconds(status.max_video_post_duration_sec);
        setShowDownloadMenu(false);
        setIsTikTokModalOpen(true);
        return;
      } catch (err) {
        toastApiError(err, "Erro ao carregar status do TikTok");
        return;
      }
    }
    try {
      const state = `tiktok::${window.location.pathname}::${Date.now()}`;
      localStorage.setItem("tiktok_oauth_state", state);
      localStorage.setItem("tiktok_redirect", window.location.pathname);
      toastSuccess("Redirecionando para o TikTok...");
      const data = await tiktokService.getAuthUrl(state);
      window.location.href = data.url;
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com TikTok");
    }
  }

  async function handlePublishTikTok(values: TikTokPublishValues) {
    if (isPublishing || !values.videoFile) return;
    setIsPublishing(true);
    try {
      await tiktokService.publish({
        privacy_level: values.privacyLevel,
        disable_duet: values.disableDuet,
        disable_comment: values.disableComment,
        disable_stitch: values.disableStitch,
        brand_content_toggle: values.brandContentToggle,
        brand_organic_toggle: values.brandOrganicToggle,
        is_aigc: values.isAigc,
        caption: values.caption,
        video_cover_timestamp_ms: values.videoCoverTimestampMs,
        video_file: values.videoFile,
      });
      toastSuccess("Vídeo publicado no TikTok com sucesso! 🎉");
      setIsTikTokModalOpen(false);
    } catch (err) {
      toastApiError(err, "Erro ao publicar no TikTok");
    } finally {
      setIsPublishing(false);
    }
  }

  if (!agent) return null;

  return (
    <div className="relative min-h-[calc(100dvh-1px)]">
      <PublishModal
        isOpen={isLinkedInModalOpen}
        onClose={() => setIsLinkedInModalOpen(false)}
        initialText={exportFormat(resultMd || "", "txt")}
        onPublish={handlePublishLinkedIn}
        loading={isPublishing}
      />

      <InstagramPublishModal
        isOpen={isInstagramModalOpen}
        onClose={() => setIsInstagramModalOpen(false)}
        initialCaption={exportFormat(resultMd || "", "txt")}
        onPublish={handlePublishInstagram}
        loading={isPublishing}
      />

      <FacebookPublishModal
        isOpen={isFacebookModalOpen}
        onClose={() => setIsFacebookModalOpen(false)}
        initialText={exportFormat(resultMd || "", "txt")}
        onPublish={handlePublishFacebook}
        onSelectPage={handleSelectFacebookPage}
        loading={isPublishing}
        pages={facebookPages}
        selectedPageId={facebookSelectedPageId}
      />

      <YouTubePublishModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        initialTitle={agent?.name ? `${agent.name} | ${new Date().toLocaleDateString()}` : "Novo vídeo"}
        initialDescription={exportFormat(resultMd || "", "txt")}
        onPublish={handlePublishYouTube}
        loading={isPublishing}
      />

      <TikTokPublishModal
        isOpen={isTikTokModalOpen}
        onClose={() => setIsTikTokModalOpen(false)}
        initialCaption={exportFormat(resultMd || "", "txt")}
        onPublish={handlePublishTikTok}
        loading={isPublishing}
        privacyOptions={tiktokPrivacyOptions}
        privacyLabels={tiktokPrivacyLabels}
        maxDurationSeconds={tiktokMaxDurationSeconds}
      />

      <Particles className="pointer-events-none absolute inset-0 opacity-35" />

      <div className="relative mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" className="h-10" onClick={() => nav(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-background/40 shadow-soft">
            <agent.Icon className="h-5 w-5 text-google-blue" />
          </div>

          <div className="min-w-0">
            <div className="truncate text-xl font-semibold tracking-tight">{agent.name}</div>
            <div className="truncate text-sm text-muted-foreground">{agent.desc}</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {mode === "mindmap" ? (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                execute via mapa mental
              </Badge>
            ) : (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                resultado estruturado
              </Badge>
            )}

            <Link to="/authority-agents">
              <Button variant="outline" className="h-10">
                Editar núcleo
              </Button>
            </Link>

            {mode === "result" ? (
              <Button
                variant="outline"
                className="h-10"
                onClick={() => {
                  setMode("mindmap");
                  setResultMd("");
                  setErr(null);
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Novo quebra-gelo
              </Button>
            ) : null}
          </div>
        </div>

        {err ? <div className="mb-4 text-sm text-destructive">{err}</div> : null}

        <AnimatePresence mode="wait">
          {mode === "mindmap" ? (
            <motion.div
              key="mindmap"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              className="relative overflow-hidden rounded-3xl border bg-background/30 shadow-card"
              style={{ height: "calc(100dvh - 160px)" }}
            >
              
              <div className="h-full w-full">
                <div className="grid h-full w-full grid-cols-[1fr_auto_1fr] gap-6 p-6">
                  {/* coluna esquerda */}
                  <div className="flex min-w-0 flex-col items-end gap-3 overflow-y-auto pr-1">
                    {leftLabels.map((task) => (
                      <button
                        key={`l-${task.title}`}
                        type="button"
                        disabled={busy || loadingThemes}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          handleIcebreakerClick(task, rect.left + rect.width / 2, rect.top + rect.height / 2);
                        }}
                        className={cn(
                          "w-full max-w-[260px] rounded-2xl border bg-background/60 px-3 py-2 text-left text-xs shadow-soft",
                          "backdrop-blur hover:bg-[rgba(0,200,232,0.10)]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          (busy || loadingThemes) ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          <span className="line-clamp-2">{task.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* núcleo central */}
                  <div className="grid place-items-center relative">
                    <div className="relative aspect-square w-[min(72vmin,720px)] max-w-[720px]">
                      <div className="absolute inset-0 rounded-[44px] border bg-background/20 shadow-soft" />
                      <div className="absolute inset-0 p-2">
                        <BusinessCore3D progress={filled} state={coreState as any} className="h-full w-full" />
                      </div>

                      {busy && !suggestingFor ? (
                        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border bg-background/70 p-3 text-xs shadow-soft backdrop-blur">
                          <div className="flex items-center gap-2 font-medium">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            processando…
                          </div>
                          <div className="mt-1 text-muted-foreground">O agente está a arquitetar o ecrã com blocos de layout...</div>
                        </div>
                      ) : null}

                      {/* OVERLAY DE TEMAS */}
                      <AnimatePresence>
                        {suggestingFor && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-background/90 backdrop-blur-md rounded-[44px] border shadow-xl"
                          >
                            {loadingThemes ? (
                              <div className="flex flex-col items-center gap-4 text-center">
                                <Loader2 className="h-10 w-10 animate-spin text-google-blue mx-auto" />
                                <p className="text-sm font-medium text-muted-foreground">A ler o núcleo e a gerar temas...</p>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-4 w-full max-w-sm">
                                <div className="text-center font-semibold text-lg">Qual o foco do {suggestingFor?.title}?</div>
                                <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
                                  {themes.map((t, idx) => (
                                    <Button key={idx} variant="secondary" className="justify-start text-left h-auto py-3 whitespace-normal" onClick={() => suggestingFor && runIcebreaker(suggestingFor, t, window.innerWidth/2, window.innerHeight/2)}>
                                      <Sparkles className="h-4 w-4 mr-2 flex-shrink-0 text-google-blue" />
                                      <span>{t}</span>
                                    </Button>
                                  ))}
                                  <Button variant="secondary" className="justify-start text-left py-3" onClick={() => suggestingFor && runIcebreaker(suggestingFor, "Surpreenda-me", window.innerWidth/2, window.innerHeight/2)}>
                                    <Sparkles className="h-4 w-4 mr-2 flex-shrink-0 text-google-yellow" /> 
                                    <span>Surpreenda-me (Tema Geral)</span>
                                  </Button>
                                </div>
                                <div className="flex gap-2 items-center mt-2 border-t pt-4">
                                  <Input 
                                    placeholder="Ou digite o seu tema..." 
                                    value={customTheme} 
                                    onChange={(e) => setCustomTheme(e.target.value)} 
                                    className="bg-background"
                                  />
                                  <Button size="icon" disabled={!customTheme.trim()} onClick={() => customTheme.trim() && suggestingFor && runIcebreaker(suggestingFor, customTheme, window.innerWidth/2, window.innerHeight/2)}>
                                    <ArrowLeft className="h-4 w-4 rotate-180" />
                                  </Button>
                                </div>
                                <Button variant="ghost" className="mt-2 text-xs text-muted-foreground" onClick={() => setSuggestingFor(null)}>Cancelar e voltar</Button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* coluna direita */}
                  <div className="flex min-w-0 flex-col items-start gap-3 overflow-y-auto pl-1">
                    {rightLabels.map((task) => (
                      <button
                        key={`r-${task.title}`}
                        type="button"
                        disabled={busy || loadingThemes}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          handleIcebreakerClick(task, rect.left + rect.width / 2, rect.top + rect.height / 2);
                        }}
                        className={cn(
                          "w-full max-w-[260px] rounded-2xl border bg-background/60 px-3 py-2 text-left text-xs shadow-soft",
                          "backdrop-blur hover:bg-[rgba(0,200,232,0.10)]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          (busy || loadingThemes) ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          <span className="line-clamp-2">{task.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* animação do chip */}
                <AnimatePresence>
                  {anim ? (
                    <motion.div
                      key={anim.id}
                      initial={{ opacity: 0, scale: 0.9, x: anim.fromX, y: anim.fromY, position: "fixed" as any, zIndex: 60 }}
                      animate={{
                        opacity: 1,
                        scale: [1, 1.08, 0.08],
                        x: [anim.fromX, window.innerWidth / 2, window.innerWidth / 2],
                        y: [anim.fromY, window.innerHeight / 2, window.innerHeight / 2],
                      }}
                      exit={{ opacity: 0, scale: 0.05 }}
                      transition={{ times: [0, 0.6, 1], duration: 0.75, ease: "easeInOut" }}
                      className="pointer-events-none"
                    >
                      <div className="max-w-[280px] rounded-2xl border bg-background/80 px-3 py-2 text-xs shadow-card backdrop-blur">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-google-blue" />
                          <span className="line-clamp-2">{anim.label}</span>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-google-blue" />
                  <div className="text-sm font-semibold text-foreground">Ação concluída com sucesso!</div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="bg-card shadow-sm rounded-xl h-9 px-4" 
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    >
                      <FileText className="h-4 w-4 mr-2" /> 
                      Baixar <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
                    </Button>
                    
                    <AnimatePresence>
                      {showDownloadMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                            className="absolute top-full left-0 mt-2 w-40 bg-popover border border-border rounded-xl shadow-lg z-50 flex flex-col p-1.5 overflow-hidden"
                          >
                            <button onClick={() => downloadFile("pdf")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📄 PDF</button>
                            <button onClick={() => downloadFile("doc")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📝 Word (.doc)</button>
                            <button onClick={() => downloadFile("txt")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📃 Texto (.txt)</button>
                            <button onClick={() => downloadFile("md")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">🛠️ Markdown</button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  
                                    <Button
                    size="sm"
                    variant="outline"
                    className="bg-card shadow-sm rounded-xl h-9 px-4"
                    onClick={handleSendToBobar}
                    disabled={isSendingToBobar}
                  >
                    {isSendingToBobar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderKanban className="h-4 w-4 mr-2" />}
                    Bobar
                  </Button>

<Button 
                    size="sm" 
                    variant="outline"
                    className="bg-card shadow-sm rounded-xl h-9 px-4" 
                    onClick={handlePrint}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir
                  </Button>
                  
                  <Button 
                    size="sm" 
                    className="bg-[#25D366] text-white shadow-sm rounded-xl hover:bg-[#1EBE5D] border-none h-9 px-4" 
                    onClick={() => {
                      const cleanText = exportFormat(resultMd, "whatsapp");
                      const encodedText = encodeURIComponent(cleanText);
                      window.open(`https://wa.me/?text=${encodedText}`, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <svg className="h-4 w-4 mr-2 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                    Encaminhar
                  </Button>


                  <Button size="sm" className="bg-[#0A66C2] text-white shadow-sm rounded-xl hover:bg-[#004182] h-9 px-4" onClick={handleLinkedInClick}>
                    <Linkedin className="h-4 w-4 mr-2" />
                    LinkedIn
                  </Button>

                  <Button size="sm" className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white shadow-sm rounded-xl hover:opacity-95 border-none h-9 px-4" onClick={handleInstagramClick}>
                    <Instagram className="h-4 w-4 mr-2" />
                    Instagram
                  </Button>

                  <Button size="sm" className="bg-[#1877F2] text-white shadow-sm rounded-xl hover:bg-[#1664d9] border-none h-9 px-4" onClick={handleFacebookClick}>
                    <Facebook className="h-4 w-4 mr-2" />
                    Facebook
                  </Button>
                  <Button size="sm" className="bg-[#FF0033] text-white shadow-sm rounded-xl hover:bg-[#e0002d] border-none h-9 px-4" onClick={handleYouTubeClick}>
                    <Youtube className="h-4 w-4 mr-2" />
                    YouTube
                  </Button>

                  <Button size="sm" className="bg-black text-white shadow-sm rounded-xl hover:bg-neutral-800 border-none h-9 px-4" onClick={handleTikTokClick}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    TikTok
                  </Button>
                </div>
              </div>

              {/* RENDERIZADOR NOVO (ARQUITETURA DE BLOCOS) */}
              <ResultViewer title={agent.name} text={resultMd} />
              
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}