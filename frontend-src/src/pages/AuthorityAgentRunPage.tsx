import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Loader2,
  Copy,
  FileText,
  CheckCircle2,
  Coins,
  Linkedin,
  Instagram,
  Facebook,
  Youtube,
  Building2,
  Pencil,
  Save,
  X,
  Sparkles,
  ArrowRight,
  Printer,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Wand2,
  FolderKanban
} from "lucide-react";
import { api, getClientId } from "@/services/robots";
import { linkedinService } from "@/services/linkedin";
import { instagramService } from "@/services/instagram";
import { facebookService, type FacebookPage } from "@/services/facebook";
import { youtubeService } from "@/services/youtube";
import { tiktokService, type TikTokPrivacyLevel } from "@/services/tiktok";
import { googleBusinessProfileService } from "@/services/googleBusinessProfile";
import { AUTHORITY_AGENTS } from "@/constants/authorityAgents";
import { tasksByAgentKey, type AuthorityTask, type AuthorityTaskExtraField } from "@/constants/authorityTasks";
import ResultViewer from "@/components/authority/ResultViewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toastSuccess, toastApiError } from "@/lib/toast";
import { useAuthStore } from "@/state/authStore";
import { CREDIT_ACTION_COSTS, formatCredits } from "@/lib/credits";
import { PublishModal } from "@/components/linkedin/PublishModal";
import { InstagramPublishModal, type InstagramPublishValues } from "@/components/instagram/InstagramPublishModal";
import { FacebookPublishModal, type FacebookPublishValues } from "@/components/facebook/FacebookPublishModal";
import { YouTubePublishModal, type YouTubePublishValues } from "@/components/youtube/YouTubePublishModal";
import { TikTokPublishModal, type TikTokPublishValues } from "@/components/tiktok/TikTokPublishModal";
import { GoogleBusinessApplyModal, parseGoogleBusinessPreview } from "@/components/authority/GoogleBusinessApplyModal";
import { exportAuthorityFormat as exportFormat } from "@/lib/authorityExport";
import { bobarService } from "@/services/bobar";
import { buildAuthorityImportPayload } from "@/lib/bobarImported";

type ExtraFieldValues = Record<string, string>;
type VideoFormatRecommendation = {
  recommended_format_id: string;
  recommended_format_label: string;
  rationale: string;
} | null;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 30 : -30,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 30 : -30,
    opacity: 0,
  }),
};

function ThemeModal({
  open,
  task,
  customTheme,
  setCustomTheme,
  suggestedThemes,
  isFetchingThemes,
  loading,
  onClose,
  onGenerateThemes,
  onExecute,
  extraFieldValues,
  setExtraFieldValue,
  videoFormatRecommendation,
  isAnalyzingVideoFormat,
  onAnalyzeVideoFormat,
}: {
  open: boolean;
  task: AuthorityTask | null;
  customTheme: string;
  setCustomTheme: (value: string) => void;
  suggestedThemes: string[];
  isFetchingThemes: boolean;
  loading: boolean;
  onClose: () => void;
  onGenerateThemes: () => void;
  onExecute: (theme: string) => void;
  extraFieldValues: ExtraFieldValues;
  setExtraFieldValue: (key: string, value: string) => void;
  videoFormatRecommendation: VideoFormatRecommendation;
  isAnalyzingVideoFormat: boolean;
  onAnalyzeVideoFormat: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setDirection(0);
    }
  }, [open, task]);

  if (!open || !task) return null;

  // Calcula o total de passos dinamicamente (1 para o Tema + 1 para cada Extra Field)
  const totalSteps = 1 + (task.extraFields?.length || 0);
  const isTextareaMode = task.inputMode === "textarea";
  
  // Verifica se pode avançar com base no passo atual
  const currentCanGoNext = (() => {
    if (currentStep === 1) return !!customTheme.trim();
    const fieldIndex = currentStep - 2;
    const field = task.extraFields?.[fieldIndex];
    if (field?.required) return !!(extraFieldValues[field.key] || "").trim();
    return true;
  })();

  const canSubmit = currentStep === totalSteps && currentCanGoNext && !loading && !isAnalyzingVideoFormat;

  const handleNext = () => {
    if (currentStep < totalSteps && currentCanGoNext) {
      setDirection(1);
      setCurrentStep((p) => p + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((p) => p - 1);
    }
  };

  function renderStep1() {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-google-blue/10 text-xs font-bold text-google-blue">1</span>
            {task?.inputLabel || (isTextareaMode ? "Cole o conteúdo base" : "Qual é o tema principal?")}
          </label>
          {isTextareaMode ? (
            <Textarea
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder={task?.inputPlaceholder || "Cole aqui o texto..."}
              className="min-h-[160px] rounded-2xl shadow-sm text-base p-4 focus-visible:ring-google-blue border-border/70"
            />
          ) : (
            <Input
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder={task?.inputPlaceholder || "Ex: O segredo para escalar..."}
              className="h-14 rounded-2xl shadow-sm text-base px-4 focus-visible:ring-google-blue border-border/70"
            />
          )}
        </div>

        {task?.aiSuggestions !== false && (
          <div className="pt-4 border-t border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Sem ideias?</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Deixe a IA analisar seu negócio e sugerir temas com alto potencial.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-google-blue/30 text-google-blue hover:bg-google-blue/5 shrink-0"
                onClick={onGenerateThemes}
                disabled={isFetchingThemes}
              >
                {isFetchingThemes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Gerar Ideias com IA
              </Button>
            </div>

            {suggestedThemes.length > 0 && (
              <div className="grid gap-3">
                {suggestedThemes.map((theme, idx) => {
                  const isSelected = customTheme.trim() === theme.trim();
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCustomTheme(theme)}
                      className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? "border-google-blue bg-google-blue/5 shadow-sm ring-1 ring-google-blue/20"
                          : "border-border/50 bg-card hover:border-google-blue/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                          isSelected ? "border-google-blue bg-google-blue text-white" : "border-border bg-background text-transparent"
                        }`}>✓</div>
                        <span className={`text-sm leading-relaxed font-medium ${isSelected ? 'text-google-blue' : 'text-foreground/90'}`}>
                          {theme}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderExtraFieldStep(field: AuthorityTaskExtraField, stepNumber: number) {
    if (!field) return null;
    const currentValue = extraFieldValues[field.key] || "";
    
    let stepDescription = "Selecione a opção ideal para o conteúdo.";
    if (field.key === "content_type") stepDescription = "Escolha o formato em que este conteúdo será publicado.";
    if (field.key === "content_goal") stepDescription = "Qual é o principal resultado esperado dessa publicação?";
    
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-google-blue/10 text-xs font-bold text-google-blue">{stepNumber}</span>
                {field.label}
            </label>
            <p className="text-xs text-muted-foreground ml-8">{stepDescription}</p>
          </div>
          
          {field.aiRecommended && (
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl bg-gradient-to-r from-google-blue/10 to-indigo-500/10 text-google-blue hover:from-google-blue/20 hover:to-indigo-500/20 border border-google-blue/20 shrink-0"
              disabled={isAnalyzingVideoFormat}
              onClick={onAnalyzeVideoFormat}
            >
              {isAnalyzingVideoFormat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              IA: Sugerir Melhor Formato
            </Button>
          )}
        </div>

        {field.aiRecommended && videoFormatRecommendation && (
          <div className="ml-8 mb-4 p-5 rounded-2xl bg-gradient-to-br from-google-blue/10 via-transparent to-transparent border border-google-blue/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-google-blue/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-google-blue font-bold text-xs uppercase tracking-wider mb-1">
                    <Sparkles className="h-3.5 w-3.5" /> Recomendação Especialista
                  </div>
                  <p className="text-base font-semibold text-foreground">{videoFormatRecommendation.recommended_format_label}</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">{videoFormatRecommendation.rationale}</p>
                </div>
                <Button
                  type="button"
                  className="rounded-xl shrink-0 bg-google-blue text-white hover:bg-google-blue/90 shadow-md"
                  onClick={() => setExtraFieldValue(field.key, videoFormatRecommendation.recommended_format_id)}
                >
                  Aplicar Sugestão
                </Button>
            </div>
          </div>
        )}

        <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field.options.map((option) => {
            const isActive = currentValue === option.value;
            const isRecommended = field.aiRecommended && videoFormatRecommendation?.recommended_format_id === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setExtraFieldValue(field.key, option.value)}
                className={`group relative text-left p-4 rounded-2xl border transition-all duration-200 ${
                  isActive
                    ? "border-google-blue bg-google-blue/5 shadow-sm ring-1 ring-google-blue/20"
                    : "border-border/60 bg-card hover:border-google-blue/30 hover:bg-google-blue/5"
                }`}
              >
                {isRecommended && !isActive && (
                  <div className="absolute -top-2 -right-2 bg-google-blue text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                    Recomendado
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${isActive ? 'text-google-blue' : 'text-foreground/90'}`}>
                    {option.label}
                  </span>
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    isActive ? "border-google-blue bg-google-blue text-white" : "border-border bg-background text-transparent group-hover:border-google-blue/30"
                  }`}>✓</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50 bg-background/50">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                 <Wand2 className="h-6 w-6 text-google-blue" />
                 {task.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {task.description || "Configure os detalhes para gerar o conteúdo com a sua identidade."}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full bg-muted/50 hover:bg-muted shrink-0" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Progress Bar Dinâmica */}
          {totalSteps > 1 && (
            <div className="flex items-center gap-2 mt-2">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full overflow-hidden bg-muted">
                  <div className={`h-full bg-google-blue transition-all duration-500 ${currentStep >= i + 1 ? 'w-full' : 'w-0'}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body Wizard Dinâmico */}
        <div className="relative overflow-hidden bg-background/30 min-h-[380px] max-h-[60vh] overflow-y-auto custom-scrollbar">
          <AnimatePresence initial={false} custom={direction} mode="wait">
             <motion.div
                key={`step-${currentStep}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="absolute inset-0 p-6 sm:p-8 overflow-y-auto custom-scrollbar"
              >
                {currentStep === 1 ? renderStep1() : renderExtraFieldStep(task.extraFields![currentStep - 2], currentStep)}
              </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 bg-background/80 p-5 backdrop-blur-md flex items-center justify-between gap-4">
          <Button variant="ghost" className="rounded-xl px-4" onClick={currentStep > 1 ? handleBack : onClose}>
             {currentStep > 1 ? <><ChevronLeft className="mr-2 h-4 w-4" /> Voltar</> : "Cancelar"}
          </Button>
          
          <div className="flex items-center gap-3">
             {currentStep < totalSteps ? (
               <Button variant="accent" className="rounded-xl px-6" disabled={!currentCanGoNext} onClick={handleNext}>
                 Próximo Passo <ChevronRight className="ml-2 h-4 w-4" />
               </Button>
             ) : (
               <Button variant="accent" className="rounded-xl px-8 shadow-md" disabled={!canSubmit} onClick={() => onExecute(customTheme)}>
                 {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}
                 {task.submitLabel || "Gerar Conteúdo"}
               </Button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthorityAgentRunPage() {
  const { agentKey } = useParams<{ agentKey: string }>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [isFacebookModalOpen, setIsFacebookModalOpen] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [isTikTokModalOpen, setIsTikTokModalOpen] = useState(false);
  const [isGoogleBusinessModalOpen, setIsGoogleBusinessModalOpen] = useState(false);
  const [isLinkingGoogleBusiness, setIsLinkingGoogleBusiness] = useState(false);
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([]);
  const [facebookSelectedPageId, setFacebookSelectedPageId] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [tiktokPrivacyOptions, setTikTokPrivacyOptions] = useState<TikTokPrivacyLevel[]>([]);
  const [tiktokPrivacyLabels, setTikTokPrivacyLabels] = useState<Record<string, string>>({});
  const [tiktokMaxDurationSeconds, setTikTokMaxDurationSeconds] = useState<number | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [themeModalTask, setThemeModalTask] = useState<AuthorityTask | null>(null);
  const [suggestedThemes, setSuggestedThemes] = useState<string[]>([]);
  const [isFetchingThemes, setIsFetchingThemes] = useState(false);
  const [customTheme, setCustomTheme] = useState("");
  const [extraFieldValues, setExtraFieldValues] = useState<ExtraFieldValues>({});
  const [videoFormatRecommendation, setVideoFormatRecommendation] = useState<VideoFormatRecommendation>(null);
  const [isAnalyzingVideoFormat, setIsAnalyzingVideoFormat] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isSendingToBobar, setIsSendingToBobar] = useState(false);

  const { user } = useAuthStore();
  const agent = AUTHORITY_AGENTS.find((a) => a.key === agentKey);
  const { data: businessCore } = useQuery({
    queryKey: ["business-core", "authority-agent-run", user?.email],
    queryFn: () => api.robots.businessCore.get("business-core"),
    enabled: Boolean(user?.email),
  });
  const runtimeNucleus = React.useMemo(() => ({ ...(businessCore || {}) }), [businessCore]);
  const tasks = agentKey ? tasksByAgentKey(agentKey) : [];

  useEffect(() => {
    if (!themeModalTask) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeModalTask(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [themeModalTask]);

  useEffect(() => {
    if (!isModalOpen && !isInstagramModalOpen && !isFacebookModalOpen && !isYouTubeModalOpen && !isTikTokModalOpen && !themeModalTask && !showDownloadMenu) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen, isInstagramModalOpen, isFacebookModalOpen, isYouTubeModalOpen, isTikTokModalOpen, themeModalTask, showDownloadMenu]);

  useEffect(() => {
    if (result) {
      setThemeModalTask(null);
      setShowDownloadMenu(false);
    }
  }, [result]);

  async function handleOpenTask(task?: AuthorityTask) {
    if (!agentKey) return;
    if (!user || user.credits < CREDIT_ACTION_COSTS.authority_agent_run) {
      toastApiError(new Error(`Precisas de pelo menos ${formatCredits(CREDIT_ACTION_COSTS.authority_agent_run)} créditos para executar esta ação.`), "Créditos Insuficientes");
      return;
    }

    const resolvedTask: AuthorityTask = task || { title: "Estratégia Completa Padrão", inputMode: "direct", aiSuggestions: false };
    setSuggestedThemes([]);
    setCustomTheme("");
    setExtraFieldValues({});
    setVideoFormatRecommendation(null);

    if (resolvedTask.inputMode === "direct") {
      await executeTask("", resolvedTask);
      return;
    }

    setThemeModalTask(resolvedTask);
  }

  function updateCustomTheme(value: string) {
    const nextTheme = value || "";
    const themeChanged = nextTheme.trim() !== customTheme.trim();

    setCustomTheme(nextTheme);

    if (!themeChanged) return;

    if (
      videoFormatRecommendation &&
      extraFieldValues.video_format === videoFormatRecommendation.recommended_format_id
    ) {
      setExtraFieldValues((prev) => {
        const next = { ...prev };
        delete next.video_format;
        return next;
      });
    }

    setVideoFormatRecommendation(null);
  }

  function setExtraFieldValue(key: string, value: string) {
    setExtraFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function requestVideoFormatRecommendation(theme: string) {
    if (!agentKey || !theme.trim()) return null;
    if (!user || user.credits < CREDIT_ACTION_COSTS.authority_agent_video_format_suggestion) {
      toastApiError(
        new Error(
          `Precisas de pelo menos ${formatCredits(CREDIT_ACTION_COSTS.authority_agent_video_format_suggestion)} créditos para analisar o melhor formato.`
        ),
        "Créditos Insuficientes"
      );
      return null;
    }

    setIsAnalyzingVideoFormat(true);
    try {
      const rawNucleus = runtimeNucleus;
      const res = await api.authorityAgents.suggestVideoFormat({
        agent_key: agentKey,
        theme,
        nucleus: { ...rawNucleus },
      });
      setVideoFormatRecommendation(res);
      return res;
    } catch (e: any) {
      toastApiError(e, "Falha ao analisar o melhor formato");
      return null;
    } finally {
      setIsAnalyzingVideoFormat(false);
    }
  }

  async function handleAnalyzeVideoFormat() {
    if (!themeModalTask || !customTheme.trim()) return;
    const recommendation = await requestVideoFormatRecommendation(customTheme.trim());
    if (!recommendation) return;
    setExtraFieldValue("video_format", recommendation.recommended_format_id);
    toastSuccess("Melhor formato recomendado pela IA!");
  }

  async function handleGenerateThemesWithIA() {
    if (!agentKey || !themeModalTask) return;
    if (!user || user.credits < CREDIT_ACTION_COSTS.authority_agent_theme_suggestion) {
      toastApiError(new Error(`Precisas de pelo menos ${formatCredits(CREDIT_ACTION_COSTS.authority_agent_theme_suggestion)} créditos para gerar sugestões de temas.`), "Créditos Insuficientes");
      return;
    }

    setIsFetchingThemes(true);
    try {
      const rawNucleus = runtimeNucleus;
      const res = await api.authorityAgents.suggestThemes({
        agent_key: agentKey,
        task: themeModalTask?.prompt || themeModalTask?.title || "",
        nucleus: { ...rawNucleus },
      });
      setSuggestedThemes(res.themes || []);
      toastSuccess("Temas gerados com sucesso!");
    } catch (e: any) {
      toastApiError(e, "Falha ao buscar sugestões de temas. Tente escrever o seu próprio.");
    } finally {
      setIsFetchingThemes(false);
    }
  }

  async function executeTask(finalTheme: string, taskOverride?: AuthorityTask) {
    if (!agentKey) return;
    const activeTask = taskOverride || themeModalTask || undefined;
    const requiresVideoFormat = Boolean(
      activeTask?.extraFields?.some((field) => field.key === "video_format" && field.required)
    );
    const trimmedTheme = finalTheme.trim();

    let resolvedExtraFieldValues = { ...extraFieldValues };
    let resolvedRecommendation = videoFormatRecommendation;

    if (
      requiresVideoFormat &&
      trimmedTheme &&
      !resolvedExtraFieldValues.video_format
    ) {
      const recommendation = await requestVideoFormatRecommendation(trimmedTheme);
      if (!recommendation) return;

      resolvedRecommendation = recommendation;
      resolvedExtraFieldValues.video_format = recommendation.recommended_format_id;
      setExtraFieldValues((prev) => ({ ...prev, video_format: recommendation.recommended_format_id }));
      toastSuccess("Formato recomendado definido. Gerando roteiro...");
    }

    setThemeModalTask(null);
    setLoading(true);
    setResult(null);
    setIsEditing(false);

    try {
      const rawNucleus = runtimeNucleus;
      const payload = {
        client_id: getClientId(),
        agent_key: agentKey,
        nucleus: {
          ...rawNucleus,
          ...(activeTask && activeTask.title !== "Estratégia Completa Padrão"
            ? { requested_task: activeTask.prompt || activeTask.title }
            : {}),
          ...(trimmedTheme ? { selected_theme: trimmedTheme } : {}),
          ...(activeTask?.inputMode === "textarea" && trimmedTheme ? { review_to_reply: trimmedTheme } : {}),
          ...(Object.keys(resolvedExtraFieldValues).length ? resolvedExtraFieldValues : {}),
          ...(resolvedRecommendation
            ? {
                recommended_video_format: resolvedRecommendation.recommended_format_label,
                recommended_video_format_id: resolvedRecommendation.recommended_format_id,
                recommended_video_format_reason: resolvedRecommendation.rationale,
              }
            : {}),
        },
      };

      const data = await api.authorityAgents.runGlobal(payload);
      setResult(data);
      toastSuccess("Tarefa concluída com sucesso!");
    } catch (e: any) {
      toastApiError(e, "Falha ao executar agente");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (!result?.output_text || !agent) return;
    const htmlContent = exportFormat(result.output_text, "html");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toastApiError(new Error("Por favor, permita pop-ups neste site para imprimir/salvar PDF."), "Erro");
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Resultado - ${agent.name}</title><meta charset="utf-8"></head><body>${htmlContent}<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script></body></html>`);
    printWindow.document.close();
  }

  function downloadFile(format: "md" | "txt" | "doc" | "pdf") {
    if (format === "pdf") {
      handlePrint();
      setShowDownloadMenu(false);
      return;
    }

    const rawText = String(result?.output_text ?? "");
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

    const blob = new Blob([format === "doc" ? "\ufeff" + fileContent : fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agentKey}-resultado.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  }

  async function handleLinkedInClick() {
    if (user?.has_linkedin) {
      setShowDownloadMenu(false);
      setIsModalOpen(true);
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

  async function handleInstagramClick() {
    if (isPublishing) return;
    if (user?.has_instagram) {
      setShowDownloadMenu(false);
      setThemeModalTask(null);
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
    if (isPublishing) return;
    if (user?.has_facebook) {
      try {
        await loadFacebookStatus();
        setShowDownloadMenu(false);
        setThemeModalTask(null);
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
    if (isPublishing) return;
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
    if (isPublishing) return;
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

  async function handleGoogleBusinessClick() {
    if (isPublishing) return;

    const preview = parseGoogleBusinessPreview(result?.output_text || "");
    if (!preview) {
      toastApiError(new Error("Formato incompatível"), "Gere novamente usando uma ação de serviços compatível do Perfil Google");
      return;
    }

    if (user?.has_google_business_profile) {
      setShowDownloadMenu(false);
      setIsGoogleBusinessModalOpen(true);
      return;
    }

    try {
      setIsLinkingGoogleBusiness(true);
      localStorage.setItem("google_business_redirect", window.location.pathname);
      toastSuccess("Redirecionando para o Perfil de Empresa Google...");
      const data = await googleBusinessProfileService.getAuthUrl();
      localStorage.setItem("google_business_oauth_state", data.state);
      window.location.href = data.url;
    } catch (err) {
      toastApiError(err, "Erro ao iniciar conexão com Perfil de Empresa Google");
      setIsLinkingGoogleBusiness(false);
    }
  }

  function handleEdit() {
    setEditedText(exportFormat(result?.output_text || "", "md"));
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!result?.id) return;
    setIsSaving(true);
    try {
      const updated = await api.authorityAgents.updateRunGlobal(result.id, { output_text: editedText });
      setResult(updated);
      setIsEditing(false);
      toastSuccess("Texto atualizado e salvo com sucesso!");
    } catch (err) {
      toastApiError(err, "Erro ao salvar edição");
    } finally {
      setIsSaving(false);
    }
  }


  async function handleSendToBobar() {
    if (!result?.output_text || !agent) return;

    setIsSendingToBobar(true);
    try {
      await bobarService.importCard(buildAuthorityImportPayload(result.output_text, agent));
      toastSuccess("Roteiro importado para o Bobar.");
    } catch (error) {
      toastApiError(error, "Não foi possível enviar este resultado para o Bobar");
    } finally {
      setIsSendingToBobar(false);
    }
  }

  function handleWhatsAppShare() {
    if (!result?.output_text) return;
    const whatsAppText = exportFormat(result.output_text, "whatsapp");
    const encodedText = encodeURIComponent(whatsAppText);
    window.open(`https://wa.me/?text=${encodedText}`, "_blank", "noopener,noreferrer");
  }

  if (!agent) return <div className="p-8">Agente não encontrado.</div>;
  const hasEnoughCredits = !!user && user.credits >= CREDIT_ACTION_COSTS.authority_agent_run;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 space-y-8 relative">
      <PublishModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialText={exportFormat(result?.output_text || "", "txt")}
        onPublish={handlePublishPost}
        loading={isPublishing}
      />

      <InstagramPublishModal
        isOpen={isInstagramModalOpen}
        onClose={() => setIsInstagramModalOpen(false)}
        initialCaption={exportFormat(result?.output_text || "", "txt")}
        onPublish={handlePublishInstagram}
        loading={isPublishing}
      />

      <FacebookPublishModal
        isOpen={isFacebookModalOpen}
        onClose={() => setIsFacebookModalOpen(false)}
        initialText={exportFormat(result?.output_text || "", "txt")}
        onPublish={handlePublishFacebook}
        onSelectPage={handleSelectFacebookPage}
        loading={isPublishing}
        pages={facebookPages}
        selectedPageId={facebookSelectedPageId}
      />

      <GoogleBusinessApplyModal
        isOpen={isGoogleBusinessModalOpen}
        onClose={() => setIsGoogleBusinessModalOpen(false)}
        rawOutput={result?.output_text || ""}
        loading={isPublishing}
        onApplied={() => toastSuccess("Serviços atualizados no Perfil de Empresa Google com sucesso!")}
      />

      <YouTubePublishModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        initialTitle={agent?.name ? `${agent.name} | ${new Date().toLocaleDateString()}` : "Novo vídeo"}
        initialDescription={exportFormat(result?.output_text || "", "txt")}
        onPublish={handlePublishYouTube}
        loading={isPublishing}
      />

      <TikTokPublishModal
        isOpen={isTikTokModalOpen}
        onClose={() => setIsTikTokModalOpen(false)}
        initialCaption={exportFormat(result?.output_text || "", "txt")}
        onPublish={handlePublishTikTok}
        loading={isPublishing}
        privacyOptions={tiktokPrivacyOptions}
        privacyLabels={tiktokPrivacyLabels}
        maxDurationSeconds={tiktokMaxDurationSeconds}
      />

      <ThemeModal
        open={!!themeModalTask}
        task={themeModalTask}
        customTheme={customTheme}
        setCustomTheme={updateCustomTheme}
        suggestedThemes={suggestedThemes}
        isFetchingThemes={isFetchingThemes}
        loading={loading}
        onClose={() => setThemeModalTask(null)}
        onGenerateThemes={handleGenerateThemesWithIA}
        onExecute={executeTask}
        extraFieldValues={extraFieldValues}
        setExtraFieldValue={setExtraFieldValue}
        videoFormatRecommendation={videoFormatRecommendation}
        isAnalyzingVideoFormat={isAnalyzingVideoFormat}
        onAnalyzeVideoFormat={handleAnalyzeVideoFormat}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-[rgba(0,200,232,0.08)] text-google-blue flex items-center justify-center border border-google-blue/20 shrink-0">
            <agent.Icon className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{agent.name}</h1>
            <p className="text-muted-foreground mt-1">{agent.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-blue-500/10 text-blue-500 font-medium px-4 py-2 rounded-xl shrink-0 border border-blue-500/20">
          <Coins className="h-4 w-4" />
          <span className="text-sm">Custo: 5 Créditos</span>
        </div>
      </div>

      {!result && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold px-1">Escolha uma ação para executar:</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {tasks.length > 0 ? (
              tasks.map((task, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={loading || !hasEnoughCredits}
                  className={`group h-full rounded-[1.75rem] border p-5 text-left shadow-sm transition-all ${
                    !hasEnoughCredits
                      ? "cursor-not-allowed border-border/50 bg-zinc-100/5 opacity-50"
                      : "border-border/70 bg-card hover:-translate-y-0.5 hover:border-google-blue/35 hover:bg-google-blue/5"
                  }`}
                  onClick={() => handleOpenTask(task)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${hasEnoughCredits ? "bg-google-blue/10 text-google-blue" : "bg-muted text-zinc-500"}`}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold leading-snug text-foreground">{task.title}</h3>
                        {task.description ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <ArrowRight className={`mt-1 h-4 w-4 shrink-0 transition-transform ${hasEnoughCredits ? "text-muted-foreground group-hover:translate-x-1 group-hover:text-google-blue" : "text-zinc-500"}`} />
                  </div>
                </button>
              ))
            ) : (
              <div className="sm:col-span-2">
                <Button variant="accent" disabled={loading || !hasEnoughCredits} className="w-full h-auto py-4 rounded-2xl" onClick={() => handleOpenTask()}>
                  {loading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : "Gerar Estratégia Completa Padrão"}
                </Button>
              </div>
            )}
          </div>
          {!hasEnoughCredits && <p className="text-sm text-red-500 text-center mt-4 bg-red-500/10 py-3 rounded-xl">Não tens créditos suficientes para executar os agentes de autoridade hoje.</p>}
        </div>
      )}

      {loading && !themeModalTask && !result && (
        <div className="py-20 flex flex-col items-center justify-center gap-4 animate-pulse">
          <Loader2 className="h-10 w-10 text-google-blue animate-spin" />
          <p className="text-muted-foreground font-medium">A IA está a processar o núcleo e a gerar o resultado final...</p>
        </div>
      )}

      {result && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 bg-[rgba(0,210,120,0.15)] border border-[rgba(0,210,120,0.22)] p-4 rounded-2xl">
            <div className="flex items-center gap-2 text-[#00D278] font-medium">
              <CheckCircle2 className="h-5 w-5" /> Resultado gerado com sucesso
            </div>
            <div className="flex flex-wrap gap-2">
              {!isEditing && (
                <Button size="sm" variant="outline" className="bg-card shadow-sm rounded-xl hover:text-google-blue" onClick={handleEdit}>
                  <Pencil className="h-4 w-4 mr-2" /> Editar
                </Button>
              )}
              <Button size="sm" variant="outline" className="bg-card shadow-sm rounded-xl" onClick={() => { navigator.clipboard.writeText(exportFormat(result.output_text, "txt")); toastSuccess("Copiado!"); }}>
                <Copy className="h-4 w-4 mr-2" /> Copiar
              </Button>

              <div className="relative">
                <Button size="sm" variant="outline" className="bg-card shadow-sm rounded-xl" onClick={() => setShowDownloadMenu((prev) => !prev)}>
                  <FileText className="h-4 w-4 mr-2" /> Baixar <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
                </Button>

                {showDownloadMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                    <div className="absolute top-full left-0 mt-2 w-40 bg-popover border border-border rounded-xl shadow-lg z-50 flex flex-col p-1.5 overflow-hidden">
                      <button onClick={() => downloadFile("pdf")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📄 PDF</button>
                      <button onClick={() => downloadFile("doc")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📝 Word (.doc)</button>
                      <button onClick={() => downloadFile("txt")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">📃 Texto (.txt)</button>
                      <button onClick={() => downloadFile("md")} className="text-left text-sm px-3 py-2 hover:bg-muted rounded-md transition-colors font-medium">🛠️ Markdown</button>
                    </div>
                  </>
                )}
              </div>

                            <Button
                size="sm"
                variant="outline"
                className="bg-card shadow-sm rounded-xl"
                onClick={handleSendToBobar}
                disabled={isSendingToBobar}
              >
                {isSendingToBobar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderKanban className="h-4 w-4 mr-2" />}
                Mandar pro Bobar
              </Button>

              <Button size="sm" variant="outline" className="bg-card shadow-sm rounded-xl" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>

              <Button size="sm" className="bg-[#25D366] text-white shadow-sm rounded-xl hover:bg-[#1EBE5D] border-none" onClick={handleWhatsAppShare}>
                <svg className="h-4 w-4 mr-2 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                WhatsApp
              </Button>

              <Button size="sm" className="bg-[#0A66C2] text-white shadow-sm rounded-xl hover:bg-[#004182]" onClick={handleLinkedInClick}>
                <Linkedin className="h-4 w-4 mr-2" /> Publicar no LinkedIn
              </Button>

              <Button size="sm" className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white shadow-sm rounded-xl hover:opacity-95 border-none" onClick={handleInstagramClick}>
                <Instagram className="h-4 w-4 mr-2" /> Publicar no Instagram
              </Button>

              <Button size="sm" className="bg-[#1877F2] text-white shadow-sm rounded-xl hover:bg-[#1664d9] border-none" onClick={handleFacebookClick}>
                <Facebook className="h-4 w-4 mr-2" /> Publicar no Facebook
              </Button>
              <Button size="sm" className="bg-[#FF0033] text-white shadow-sm rounded-xl hover:bg-[#e0002d] border-none" onClick={handleYouTubeClick}>
                <Youtube className="h-4 w-4 mr-2" /> Publicar no YouTube
              </Button>

              <Button size="sm" className="bg-black text-white shadow-sm rounded-xl hover:bg-neutral-800 border-none" onClick={handleTikTokClick}>
                <Sparkles className="h-4 w-4 mr-2" /> Publicar no TikTok
              </Button>

              {agentKey === "google_business_profile" && parseGoogleBusinessPreview(result.output_text) ? (
                <Button size="sm" className="bg-google-blue text-white shadow-sm rounded-xl hover:opacity-95 border-none" onClick={handleGoogleBusinessClick}>
                  {isLinkingGoogleBusiness ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
                  Aplicar no Perfil Google
                </Button>
              ) : null}
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              <Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} className="min-h-[400px] font-mono text-sm leading-relaxed p-6 rounded-2xl border border-border bg-card shadow-sm focus-visible:ring-google-blue resize-y" />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="rounded-xl" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" /> Cancelar
                </Button>
                <Button variant="accent" className="rounded-xl" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Salvar
                </Button>
              </div>
            </div>
          ) : (
            <ResultViewer title={agent.name} text={result.output_text} />
          )}

          <div className="mt-8 flex justify-center">
            <Button variant="secondary" className="rounded-xl px-8" onClick={() => { setResult(null); setShowDownloadMenu(false); setThemeModalTask(null); }}>
              Fazer Nova Tarefa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}